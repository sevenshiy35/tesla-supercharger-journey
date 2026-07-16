import "server-only";

import { getDrivingDirectionsForWaypoints } from "@/lib/mapbox/directions";
import { getDrivingMatrix } from "@/lib/mapbox/matrix";
import { getMatrixDistance, getMatrixDuration } from "@/lib/mapbox/matrix-result";
import {
  buildPlannedRouteLegs,
  calculateSegmentedPlannedRoute,
  splitDirectionWaypoints,
} from "@/lib/mapbox/planned-route";
import { buildTripBaseRoute } from "@/lib/mapbox/route-builder";
import { isRouteGeometryPersistenceEnabled } from "@/lib/mapbox/server-client";
import type { MapboxCoordinate } from "@/lib/mapbox/types";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { discoverTripCorridorCandidates } from "./candidate-repository";
import { calculateExtraRouteMetrics, chooseBudgetCorrectionStopIndex, isWithinDetourBudget } from "./budget-correction";
import type { RouteCorridorLeg } from "./corridor";
import { optimizeAdjacentSuggestionStops, type PairCostGetter } from "./local-optimization";
import {
  MATRIX_MAX_COORDINATES,
  MAX_BUDGET_CORRECTION_ITERATIONS,
  MAX_DIRECTIONS_REQUESTS_PER_GENERATION,
  MAX_LOCAL_OPTIMIZATION_ITERATIONS,
  MAX_MATRIX_REQUESTS_PER_GENERATION,
  TRIP_SUGGESTION_ALGORITHM_VERSION,
  type TripTechnicalLimitReason,
} from "./planning-config";
import {
  getAdminSuggestedTripStops,
  getAdminTripPlan,
  getAdminTripPlanSegments,
  getAdminTripPlanStops,
} from "./repository";
import {
  maximizeSuggestedStops,
  type PairCost,
  type SelectedSuggestionStop,
  type SuggestionRouteNode,
} from "./suggestion-algorithm";
import type {
  SuggestedTripStop,
  TripPlan,
  TripPlanSegment,
  TripRouteSegment,
  TripSuggestionSummary,
} from "./types";

export class TripSuggestionError extends Error {
  constructor(readonly safeMessage: string) {
    super(safeMessage);
    this.name = "TripSuggestionError";
  }
}

export interface TripSuggestionGenerationResult {
  stops: SuggestedTripStop[];
  summary: TripSuggestionSummary;
  segments: TripRouteSegment[];
  geometryPersisted: boolean;
  routeInputRevision: number;
}

function previewMetrics(plan: TripPlan, kind: "base" | "planned") {
  return kind === "base" ? {
    distanceMeters: plan.baseDistanceMeters,
    driveSeconds: plan.baseDurationSeconds,
    stopSeconds: 0,
    extraDistanceMeters: 0,
    extraDurationSeconds: 0,
  } : {
    distanceMeters: plan.plannedDistanceMeters,
    driveSeconds: plan.plannedDriveSeconds,
    stopSeconds: plan.plannedStopSeconds,
    extraDistanceMeters: plan.extraDistanceMeters,
    extraDurationSeconds: plan.extraDurationSeconds,
  };
}

function endpoint(plan: TripPlan, kind: "origin" | "destination"): MapboxCoordinate | null {
  const longitude = kind === "origin" ? plan.originLongitude : plan.destinationLongitude;
  const latitude = kind === "origin" ? plan.originLatitude : plan.destinationLatitude;
  return longitude === null || latitude === null ? null : { longitude, latitude };
}

function routeSegment(segment: TripPlanSegment): TripRouteSegment | null {
  return segment.provider === "mapbox" ? {
    segmentIndex: segment.segmentIndex,
    leg: segment.leg,
    startSequence: segment.startSequence,
    endSequence: segment.endSequence,
    provider: "mapbox",
    distanceMeters: segment.distanceMeters,
    durationSeconds: segment.durationSeconds,
    geometry: segment.geometry,
  } : null;
}

async function loadBaseRouteGeometry(plan: TripPlan, persistedSegments: TripPlanSegment[]) {
  const origin = endpoint(plan, "origin");
  const destination = endpoint(plan, "destination");
  if (!origin || !destination) throw new TripSuggestionError("Choose and save both endpoints before generating Suggested Stops.");
  const expectedLegCount = plan.tripType === "round_trip" ? 2 : 1;
  const baseSegments = persistedSegments
    .filter((segment) => segment.routeKind === "base")
    .map(routeSegment)
    .filter((segment): segment is TripRouteSegment => Boolean(segment));
  if (baseSegments.length === expectedLegCount &&
    baseSegments[0]?.leg === "outbound" &&
    (expectedLegCount === 1 || baseSegments[1]?.leg === "return")) {
    return { origin, destination, segments: baseSegments };
  }
  const temporary = await buildTripBaseRoute(plan.tripType, origin, destination, async (from, to) =>
    getDrivingDirectionsForWaypoints([from, to]));
  return { origin, destination, segments: temporary.segments };
}

function corridorLegs(segments: TripRouteSegment[]): RouteCorridorLeg[] {
  return segments.map((segment) => ({ leg: segment.leg, geometry: segment.geometry }));
}

function optimizationChunks(nodes: SuggestionRouteNode[]) {
  if (nodes.length <= MATRIX_MAX_COORDINATES) return [nodes];
  const chunks: SuggestionRouteNode[][] = [];
  let start = 0;
  while (start < nodes.length - 1) {
    const end = Math.min(nodes.length, start + MATRIX_MAX_COORDINATES);
    chunks.push(nodes.slice(start, end));
    if (end === nodes.length) break;
    start = Math.max(start + 1, end - 3);
  }
  return chunks;
}

async function loadOptimizationPairCosts(nodes: SuggestionRouteNode[], requestCapacity: number) {
  const costs = new Map<string, PairCost>();
  let requests = 0;
  let complete = true;
  for (const chunk of optimizationChunks(nodes)) {
    if (requests >= requestCapacity) { complete = false; break; }
    const matrix = await getDrivingMatrix(chunk);
    requests += 1;
    for (let from = 0; from < chunk.length; from += 1) {
      for (let to = 0; to < chunk.length; to += 1) {
        const durationSeconds = getMatrixDuration(matrix, from, to);
        const distanceMeters = getMatrixDistance(matrix, from, to);
        if (durationSeconds === null || distanceMeters === null) continue;
        costs.set(`${chunk[from].key}\u0000${chunk[to].key}`, { durationSeconds, distanceMeters });
      }
    }
  }
  const getCost: PairCostGetter = (from, to) => costs.get(`${from.key}\u0000${to.key}`) ?? null;
  return { getCost, requests, complete };
}

function orderedSelectedStops(routeNodes: SuggestionRouteNode[], selected: SelectedSuggestionStop[]) {
  const selectedById = new Map(selected.map((stop) => [stop.id, stop]));
  const destinationIndex = routeNodes.findIndex((node) => node.kind === "destination");
  return routeNodes.flatMap((node, nodeIndex) => {
    if (!node.stationId) return [];
    const stop = selectedById.get(node.stationId);
    if (!stop) return [];
    return [{ ...stop, leg: nodeIndex < destinationIndex ? "outbound" as const : "return" as const }];
  });
}

function plannedLegs(
  plan: TripPlan,
  origin: MapboxCoordinate,
  destination: MapboxCoordinate,
  stops: SelectedSuggestionStop[],
) {
  return buildPlannedRouteLegs(
    origin,
    destination,
    stops.map((stop, sequence) => ({
      longitude: stop.longitude,
      latitude: stop.latitude,
      sequence,
      leg: stop.leg,
    })),
    plan.tripType === "round_trip",
  );
}

function directionRequestCount(legs: ReturnType<typeof plannedLegs>) {
  return legs.reduce((sum, leg) => sum + splitDirectionWaypoints(leg.nodes).length, 0);
}

async function authoritativePlannedRoute(input: {
  plan: TripPlan;
  origin: MapboxCoordinate;
  destination: MapboxCoordinate;
  baseSegments: TripRouteSegment[];
  stops: SelectedSuggestionStop[];
}) {
  const stops = [...input.stops];
  let corrections = 0;
  let directionsRequests = 0;
  while (true) {
    let segments: TripRouteSegment[];
    let distanceMeters: number;
    let durationSeconds: number;
    if (stops.length === 0) {
      segments = input.baseSegments.map((segment, segmentIndex) => ({ ...segment, segmentIndex }));
      distanceMeters = input.plan.baseDistanceMeters as number;
      durationSeconds = input.plan.baseDurationSeconds as number;
    } else {
      const legs = plannedLegs(input.plan, input.origin, input.destination, stops);
      const requestCount = directionRequestCount(legs);
      if (directionsRequests + requestCount > MAX_DIRECTIONS_REQUESTS_PER_GENERATION) {
        throw new TripSuggestionError("The planned route exceeds the current safe Directions analysis limit. Reduce the corridor or detour budget and try again.");
      }
      directionsRequests += requestCount;
      const result = await calculateSegmentedPlannedRoute(legs, getDrivingDirectionsForWaypoints);
      if (result.technicalLimitReached) {
        throw new TripSuggestionError("The planned route exceeds the current safe Directions analysis limit.");
      }
      segments = result.segments;
      distanceMeters = result.distanceMeters;
      durationSeconds = result.durationSeconds;
    }
    const { extraDistanceMeters, extraDurationSeconds } = calculateExtraRouteMetrics(distanceMeters, durationSeconds, {
      baseDistanceMeters: input.plan.baseDistanceMeters as number,
      baseDurationSeconds: input.plan.baseDurationSeconds as number,
    });
    if (isWithinDetourBudget({ extraDistanceMeters, extraDurationSeconds }, input.plan)) {
      return { stops, segments, distanceMeters, durationSeconds, extraDistanceMeters, extraDurationSeconds, corrections, directionsRequests };
    }
    if (stops.length === 0 || corrections >= MAX_BUDGET_CORRECTION_ITERATIONS) {
      throw new TripSuggestionError("Mapbox's final planned route still exceeds the detour budget after safe correction. No Suggestions were changed.");
    }
    stops.splice(chooseBudgetCorrectionStopIndex(stops), 1);
    corrections += 1;
  }
}

function stopPayload(stops: SelectedSuggestionStop[]) {
  const finalSelectionRanks = new Map(
    [...stops]
      .sort((left, right) => left.selectionRank - right.selectionRank || left.id.localeCompare(right.id))
      .map((stop, index) => [stop.id, index + 1]),
  );
  return stops.map((stop, sequence) => ({
    stationId: stop.id,
    sequence,
    leg: stop.leg,
    source: "algorithm",
    isLocked: false,
    status: "planned",
    estimatedDetourSeconds: Math.max(0, Math.round(stop.estimatedDetourSeconds)),
    estimatedDetourMeters: Math.max(0, Math.round(stop.estimatedDetourMeters)),
    corridorDistanceMeters: Math.max(0, stop.corridorDistanceMeters),
    routeProgress: Math.min(1, Math.max(0, stop.routeProgress)),
    selectionRank: finalSelectionRanks.get(stop.id) as number,
  }));
}

export async function generateTripSuggestions(tripPlanId: string, options: { replaceAllStops?: boolean } = {}): Promise<TripSuggestionGenerationResult> {
  const [plan, existingStops] = await Promise.all([
    getAdminTripPlan(tripPlanId),
    getAdminTripPlanStops(tripPlanId),
  ]);
  if (!plan) throw new TripSuggestionError("This Trip Plan Draft no longer exists.");
  if (plan.status !== "draft") throw new TripSuggestionError("Only Draft Trip Plans can generate Suggested Stops.");
  if ((plan.originSource === "station" && !plan.originStationId) ||
    (plan.destinationSource === "station" && !plan.destinationStationId)) {
    throw new TripSuggestionError("A Supercharger endpoint is no longer available. Choose and save that endpoint again.");
  }
  if (plan.baseDistanceMeters === null || plan.baseDurationSeconds === null) {
    throw new TripSuggestionError("Calculate the Base Route before generating Suggested Stops.");
  }
  let persistedSegments: TripPlanSegment[] = [];
  try {
    persistedSegments = await getAdminTripPlanSegments(tripPlanId);
  } catch {
    // Missing or invalid saved Geometry is safely replaced by temporary Directions Geometry below.
  }
  const base = await loadBaseRouteGeometry(plan, persistedSegments);
  const endpointStationIds = new Set([plan.originStationId, plan.destinationStationId].filter((id): id is string => Boolean(id)));
  const existingNonAlgorithmStopStationIds = options.replaceAllStops
    ? new Set<string>()
    : new Set(existingStops
      .filter((stop) => stop.source !== "algorithm" || stop.isLocked)
      .map((stop) => stop.stationId));
  const discovery = await discoverTripCorridorCandidates({
    legs: corridorLegs(base.segments),
    corridorMiles: plan.corridorMiles,
    endpointStationIds,
    existingNonAlgorithmStopStationIds,
  });
  const greedy = await maximizeSuggestedStops({
    tripType: plan.tripType,
    origin: base.origin,
    destination: base.destination,
    candidates: discovery.candidates,
    maxExtraMinutes: plan.maxExtraMinutes,
    maxExtraMiles: plan.maxExtraMiles,
    legacyMaxStops: plan.maxStops,
  }, getDrivingMatrix);

  let technicalLimitReason: TripTechnicalLimitReason | null = discovery.audit.candidateQueryLimitReached
    ? "candidate_query_budget"
    : greedy.technicalLimitReason;
  let optimizedNodes = greedy.routeNodes;
  let preOptimizationDriveSeconds = plan.baseDurationSeconds + greedy.extraDriveSeconds;
  let postOptimizationDriveSeconds = preOptimizationDriveSeconds;
  let optimizationImprovementSeconds = 0;
  const remainingMatrixRequests = Math.max(0, MAX_MATRIX_REQUESTS_PER_GENERATION - greedy.matrixRequestCount);
  if (greedy.selectedStops.length > 1 && remainingMatrixRequests > 0) {
    const pairCosts = await loadOptimizationPairCosts(greedy.routeNodes, remainingMatrixRequests);
    if (!pairCosts.complete && !technicalLimitReason) technicalLimitReason = "matrix_request_budget";
    const optimized = optimizeAdjacentSuggestionStops(
      greedy.routeNodes,
      pairCosts.getCost,
      MAX_LOCAL_OPTIMIZATION_ITERATIONS,
    );
    optimizedNodes = optimized.routeNodes;
    if (optimized.preOptimizationDriveSeconds > 0) {
      preOptimizationDriveSeconds = optimized.preOptimizationDriveSeconds;
      postOptimizationDriveSeconds = optimized.postOptimizationDriveSeconds;
      optimizationImprovementSeconds = optimized.optimizationImprovementSeconds;
    }
  }

  const ordered = orderedSelectedStops(optimizedNodes, greedy.selectedStops);
  const authoritative = await authoritativePlannedRoute({
    plan,
    origin: base.origin,
    destination: base.destination,
    baseSegments: base.segments,
    stops: ordered,
  });
  const finalStops = authoritative.stops;
  const plannedStopSeconds = finalStops.length * plan.stopDurationMinutes * 60;
  const persistGeometry = isRouteGeometryPersistenceEnabled();
  const supabase = await createClient();
  const saveArguments = {
    p_trip_plan_id: plan.id,
    p_expected_revision: plan.routeInputRevision,
    p_stops: stopPayload(finalStops) as unknown as Json,
    p_planned_distance_meters: authoritative.distanceMeters,
    p_planned_drive_seconds: authoritative.durationSeconds,
    p_planned_stop_seconds: plannedStopSeconds,
    p_extra_distance_meters: authoritative.extraDistanceMeters,
    p_extra_duration_seconds: authoritative.extraDurationSeconds,
    p_segments: authoritative.segments as unknown as Json,
    p_persist_geometry: persistGeometry,
    p_corridor_candidate_count: discovery.audit.corridorCandidateCount,
    p_evaluated_candidate_count: greedy.evaluatedCandidateCount,
    p_unreachable_candidate_count: greedy.unreachableCandidateCount,
    p_technical_limit_reached: technicalLimitReason !== null,
    p_technical_limit_reason: technicalLimitReason,
  };
  const { data, error } = options.replaceAllStops
    ? await supabase.rpc("admin_save_regenerated_trip_plan", saveArguments)
    : await supabase.rpc("admin_save_trip_plan_suggestions", {
      ...saveArguments,
      p_algorithm_version: TRIP_SUGGESTION_ALGORITHM_VERSION,
    });
  if (error || !data?.[0]) {
    const message = error?.message ?? "";
    if (/stale route result/i.test(message)) throw new TripSuggestionError("The Trip inputs changed during planning. Review the latest Draft and generate again.");
    if (/already been visited/i.test(message)) throw new TripSuggestionError("A candidate was checked in while planning. Generate again to use the latest Visit history.");
    if (/not found|does not exist/i.test(message)) throw new TripSuggestionError("A Trip or Supercharger changed during planning. Generate again.");
    throw new TripSuggestionError("Suggestions were calculated but could not be saved. The previous valid Suggestions were kept.");
  }
  const savedStops = await getAdminSuggestedTripStops(plan.id);
  const outboundStopCount = finalStops.filter((stop) => stop.leg === "outbound").length;
  const returnStopCount = finalStops.length - outboundStopCount;
  const maximumTimeSeconds = plan.maxExtraMinutes * 60;
  const maximumDistanceMeters = plan.maxExtraMiles === null ? null : plan.maxExtraMiles * 1609.344;
  const summary: TripSuggestionSummary = {
    corridorCandidateCount: discovery.audit.corridorCandidateCount,
    evaluatedCandidateCount: greedy.evaluatedCandidateCount,
    selectedStopCount: finalStops.length,
    unreachableCandidateCount: greedy.unreachableCandidateCount,
    baseDistanceMeters: plan.baseDistanceMeters,
    baseDurationSeconds: plan.baseDurationSeconds,
    plannedDistanceMeters: authoritative.distanceMeters,
    plannedDriveSeconds: authoritative.durationSeconds,
    plannedStopSeconds,
    extraDistanceMeters: authoritative.extraDistanceMeters,
    extraDriveSeconds: authoritative.extraDurationSeconds,
    remainingExtraDriveSeconds: Math.max(0, maximumTimeSeconds - authoritative.extraDurationSeconds),
    remainingExtraDistanceMeters: maximumDistanceMeters === null ? null : Math.max(0, maximumDistanceMeters - authoritative.extraDistanceMeters),
    outboundStopCount,
    returnStopCount,
    algorithmVersion: TRIP_SUGGESTION_ALGORITHM_VERSION,
    technicalLimitReached: technicalLimitReason !== null,
    technicalLimitReason,
    preOptimizationDriveSeconds,
    postOptimizationDriveSeconds,
    optimizationImprovementSeconds,
    expectedNewStopCount: savedStops.filter((stop) => !stop.isVisited).length,
    alreadyVisitedStopCount: savedStops.filter((stop) => stop.isVisited).length,
    manualStopCount: savedStops.filter((stop) => stop.source === "manual").length,
    lockedStopCount: savedStops.filter((stop) => stop.isLocked).length,
    overTimeSeconds: 0,
    overDistanceMeters: 0,
    budgetStatus: "within",
    plannedRouteStale: false,
  };
  return { stops: savedStops, summary, segments: authoritative.segments, geometryPersisted: persistGeometry, routeInputRevision: data[0].route_input_revision };
}

export async function calculateSavedTripRoutePreview(tripPlanId: string, kind: "base" | "planned") {
  const [plan, stops] = await Promise.all([
    getAdminTripPlan(tripPlanId),
    getAdminSuggestedTripStops(tripPlanId),
  ]);
  if (!plan) throw new TripSuggestionError("Trip Plan not found.");
  if ((plan.originSource === "station" && !plan.originStationId) ||
    (plan.destinationSource === "station" && !plan.destinationStationId)) {
    throw new TripSuggestionError("A Supercharger endpoint is no longer available.");
  }
  let persistedSegments: TripPlanSegment[] = [];
  try {
    persistedSegments = await getAdminTripPlanSegments(tripPlanId, kind);
  } catch {
    // Preview uses temporary Directions when stored Geometry is absent or invalid.
  }
  if (persistedSegments.length > 0) {
    return {
      segments: persistedSegments.map(routeSegment).filter((segment): segment is TripRouteSegment => Boolean(segment)),
      metrics: previewMetrics(plan, kind),
    };
  }
  let allSegments = persistedSegments;
  if (kind === "planned") {
    try { allSegments = await getAdminTripPlanSegments(tripPlanId); } catch { allSegments = []; }
  }
  const base = await loadBaseRouteGeometry(plan, allSegments);
  if (kind === "base" || stops.length === 0) return { segments: base.segments, metrics: previewMetrics(plan, kind) };
  const legs = buildPlannedRouteLegs(
    base.origin,
    base.destination,
    stops.map((stop) => ({ longitude: stop.longitude, latitude: stop.latitude, sequence: stop.sequence, leg: stop.leg })),
    plan.tripType === "round_trip",
  );
  const preview = await calculateSegmentedPlannedRoute(legs, getDrivingDirectionsForWaypoints);
  if (preview.technicalLimitReached) throw new TripSuggestionError("The saved route exceeds the current preview limit.");
  return { segments: preview.segments, metrics: previewMetrics(plan, kind) };
}
