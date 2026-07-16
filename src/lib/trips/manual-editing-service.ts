import "server-only";

import { getDrivingDirectionsForWaypoints } from "@/lib/mapbox/directions";
import { calculateSegmentedPlannedRoute, buildPlannedRouteLegs } from "@/lib/mapbox/planned-route";
import { buildTripBaseRoute } from "@/lib/mapbox/route-builder";
import { isRouteGeometryPersistenceEnabled } from "@/lib/mapbox/server-client";
import type { MapboxCoordinate } from "@/lib/mapbox/types";
import { getDrivingMatrix } from "@/lib/mapbox/matrix";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/types/database";
import { calculateExtraRouteMetrics, isWithinDetourBudget } from "./budget-correction";
import { discoverTripCorridorCandidates } from "./candidate-repository";
import type { RouteCorridorLeg } from "./corridor";
import { edgeLeg, maximizeSuggestedStops, type SuggestionRouteNode } from "./suggestion-algorithm";
import { getAdminSuggestedTripStops, getAdminTripPlan, getAdminTripPlanSegments } from "./repository";
import { TripSuggestionError, type TripSuggestionGenerationResult } from "./suggestion-service";
import type { SuggestedTripStop, TripPlan, TripPlanSegment, TripPlanStopLeg, TripRouteSegment, TripSuggestionSummary } from "./types";

interface EditableRouteStop {
  stopId: string | null;
  stationId: string;
  longitude: number;
  latitude: number;
  leg: TripPlanStopLeg;
  source: "algorithm" | "manual";
  isLocked: boolean;
  estimatedDetourSeconds: number | null;
  estimatedDetourMeters: number | null;
  corridorDistanceMeters: number | null;
  routeProgress: number | null;
  selectionRank: number | null;
}

function coordinate(plan: TripPlan, endpoint: "origin" | "destination"): MapboxCoordinate {
  const longitude = endpoint === "origin" ? plan.originLongitude : plan.destinationLongitude;
  const latitude = endpoint === "origin" ? plan.originLatitude : plan.destinationLatitude;
  if (longitude === null || latitude === null) throw new TripSuggestionError("Choose and save both endpoints first.");
  return { longitude, latitude };
}

function routeSegment(segment: TripPlanSegment): TripRouteSegment | null {
  return segment.provider === "mapbox" ? {
    segmentIndex: segment.segmentIndex, leg: segment.leg, startSequence: segment.startSequence,
    endSequence: segment.endSequence, provider: "mapbox", distanceMeters: segment.distanceMeters,
    durationSeconds: segment.durationSeconds, geometry: segment.geometry,
  } : null;
}

async function baseContext(plan: TripPlan) {
  const origin = coordinate(plan, "origin");
  const destination = coordinate(plan, "destination");
  if (plan.baseDistanceMeters === null || plan.baseDurationSeconds === null) throw new TripSuggestionError("Calculate the Base Route first.");
  let segments = (await getAdminTripPlanSegments(plan.id, "base")).map(routeSegment).filter((value): value is TripRouteSegment => Boolean(value));
  if (segments.length !== (plan.tripType === "round_trip" ? 2 : 1)) {
    const base = await buildTripBaseRoute(plan.tripType, origin, destination, async (from, to) => getDrivingDirectionsForWaypoints([from, to]));
    segments = base.segments;
  }
  return { origin, destination, segments };
}

function editable(stops: SuggestedTripStop[]): EditableRouteStop[] {
  return stops.map((stop) => ({
    stopId: stop.id, stationId: stop.stationId, longitude: stop.longitude, latitude: stop.latitude,
    leg: stop.leg, source: stop.source, isLocked: stop.isLocked,
    estimatedDetourSeconds: stop.estimatedDetourSeconds, estimatedDetourMeters: stop.estimatedDetourMeters,
    corridorDistanceMeters: stop.corridorDistanceMeters, routeProgress: stop.routeProgress,
    selectionRank: stop.selectionRank,
  }));
}

async function exactRoute(plan: TripPlan, base: Awaited<ReturnType<typeof baseContext>>, stops: EditableRouteStop[]) {
  if (stops.length === 0) return {
    segments: base.segments.map((segment, segmentIndex) => ({ ...segment, segmentIndex })),
    distanceMeters: plan.baseDistanceMeters as number,
    durationSeconds: plan.baseDurationSeconds as number,
  };
  const legs = buildPlannedRouteLegs(base.origin, base.destination, stops.map((stop, sequence) => ({
    longitude: stop.longitude, latitude: stop.latitude, sequence, leg: stop.leg,
  })), plan.tripType === "round_trip");
  const route = await calculateSegmentedPlannedRoute(legs, getDrivingDirectionsForWaypoints);
  if (route.technicalLimitReached) throw new TripSuggestionError("This route exceeds the current safe Directions request limit.");
  return route;
}

function budgetDetails(plan: TripPlan, extraTime: number, extraDistance: number) {
  const overTimeSeconds = Math.max(0, extraTime - plan.maxExtraMinutes * 60);
  const maximumMeters = plan.maxExtraMiles === null ? null : plan.maxExtraMiles * 1609.344;
  const overDistanceMeters = maximumMeters === null ? 0 : Math.max(0, extraDistance - maximumMeters);
  return {
    overTimeSeconds, overDistanceMeters,
    budgetStatus: (overTimeSeconds > 0 && overDistanceMeters > 0 ? "over_both" : overTimeSeconds > 0 ? "over_time" : overDistanceMeters > 0 ? "over_distance" : "within") as TripSuggestionSummary["budgetStatus"],
  };
}

export function summarizeEditableTrip(plan: TripPlan, stops: SuggestedTripStop[]): TripSuggestionSummary | null {
  if (plan.baseDistanceMeters === null || plan.baseDurationSeconds === null || plan.plannedDistanceMeters === null ||
    plan.plannedDriveSeconds === null || plan.plannedStopSeconds === null || plan.extraDistanceMeters === null || plan.extraDurationSeconds === null) return null;
  const budget = budgetDetails(plan, plan.extraDurationSeconds, plan.extraDistanceMeters);
  const maximumDistanceMeters = plan.maxExtraMiles === null ? null : plan.maxExtraMiles * 1609.344;
  return {
    corridorCandidateCount: plan.corridorCandidateCount ?? 0, evaluatedCandidateCount: plan.evaluatedCandidateCount ?? 0,
    selectedStopCount: stops.length, unreachableCandidateCount: plan.unreachableCandidateCount ?? 0,
    baseDistanceMeters: plan.baseDistanceMeters, baseDurationSeconds: plan.baseDurationSeconds,
    plannedDistanceMeters: plan.plannedDistanceMeters, plannedDriveSeconds: plan.plannedDriveSeconds,
    plannedStopSeconds: plan.plannedStopSeconds, extraDistanceMeters: plan.extraDistanceMeters,
    extraDriveSeconds: plan.extraDurationSeconds, remainingExtraDriveSeconds: Math.max(0, plan.maxExtraMinutes * 60 - plan.extraDurationSeconds),
    remainingExtraDistanceMeters: maximumDistanceMeters === null ? null : Math.max(0, maximumDistanceMeters - plan.extraDistanceMeters),
    outboundStopCount: stops.filter((stop) => stop.leg === "outbound").length,
    returnStopCount: stops.filter((stop) => stop.leg === "return").length,
    algorithmVersion: plan.algorithmVersion ?? "manual-route-v1", technicalLimitReached: plan.technicalLimitReached,
    technicalLimitReason: plan.technicalLimitReason, preOptimizationDriveSeconds: plan.plannedDriveSeconds,
    postOptimizationDriveSeconds: plan.plannedDriveSeconds, optimizationImprovementSeconds: 0,
    expectedNewStopCount: stops.filter((stop) => !stop.isVisited).length,
    alreadyVisitedStopCount: stops.filter((stop) => stop.isVisited).length,
    manualStopCount: stops.filter((stop) => stop.source === "manual").length,
    lockedStopCount: stops.filter((stop) => stop.isLocked).length,
    ...budget, plannedRouteStale: plan.plannedRouteStale,
  };
}

function routePayload(stops: EditableRouteStop[]) {
  return stops.map((stop, sequence) => ({
    stopId: stop.stopId ?? "", stationId: stop.stationId, sequence, leg: stop.leg,
    source: stop.source, isLocked: stop.source === "manual" || stop.isLocked, status: "planned",
    estimatedDetourSeconds: stop.estimatedDetourSeconds, estimatedDetourMeters: stop.estimatedDetourMeters,
    corridorDistanceMeters: stop.corridorDistanceMeters, routeProgress: stop.routeProgress,
    selectionRank: stop.selectionRank,
  }));
}

async function resultAfterSave(planId: string, metrics: ReturnType<typeof calculateExtraRouteMetrics> & { distanceMeters: number; durationSeconds: number }, segments: TripRouteSegment[]): Promise<TripSuggestionGenerationResult> {
  const [freshPlan, freshStops] = await Promise.all([getAdminTripPlan(planId), getAdminSuggestedTripStops(planId)]);
  if (!freshPlan) throw new TripSuggestionError("Trip Plan not found after saving.");
  const summary = summarizeEditableTrip({ ...freshPlan, plannedDistanceMeters: metrics.distanceMeters, plannedDriveSeconds: metrics.durationSeconds, extraDistanceMeters: metrics.extraDistanceMeters, extraDurationSeconds: metrics.extraDurationSeconds, plannedRouteStale: false }, freshStops);
  if (!summary) throw new TripSuggestionError("Saved route metrics could not be loaded.");
  return { stops: freshStops, summary, segments, geometryPersisted: isRouteGeometryPersistenceEnabled(), routeInputRevision: freshPlan.routeInputRevision };
}

export async function recalculateTripRoute(tripPlanId: string): Promise<TripSuggestionGenerationResult> {
  const [plan, loadedStops] = await Promise.all([getAdminTripPlan(tripPlanId), getAdminSuggestedTripStops(tripPlanId)]);
  if (!plan) throw new TripSuggestionError("Trip Plan not found.");
  if (plan.status !== "draft") throw new TripSuggestionError("Only Draft Trip Plans can be recalculated.");
  const base = await baseContext(plan);
  const stops = editable(loadedStops);
  const exact = await exactRoute(plan, base, stops);
  const extra = calculateExtraRouteMetrics(exact.distanceMeters, exact.durationSeconds, { baseDistanceMeters: plan.baseDistanceMeters as number, baseDurationSeconds: plan.baseDurationSeconds as number });
  const persist = isRouteGeometryPersistenceEnabled();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_recalculated_trip_route", {
    p_trip_plan_id: plan.id, p_expected_revision: plan.routeInputRevision,
    p_planned_distance_meters: exact.distanceMeters, p_planned_drive_seconds: exact.durationSeconds,
    p_planned_stop_seconds: stops.length * plan.stopDurationMinutes * 60,
    p_extra_distance_meters: extra.extraDistanceMeters, p_extra_duration_seconds: extra.extraDurationSeconds,
    p_segments: exact.segments as unknown as Json, p_persist_geometry: persist,
  });
  if (error || !data?.[0]) {
    if (/trip changed|stale/i.test(error?.message ?? "")) throw new TripSuggestionError("The trip changed while this operation was running. Refresh and try again.");
    throw new TripSuggestionError("The route was calculated but could not be saved. The previous valid route was kept.");
  }
  return resultAfterSave(plan.id, { ...extra, distanceMeters: exact.distanceMeters, durationSeconds: exact.durationSeconds }, exact.segments);
}

function fixedRouteNodes(plan: TripPlan, base: Awaited<ReturnType<typeof baseContext>>, anchors: EditableRouteStop[]): SuggestionRouteNode[] {
  const node = (stop: EditableRouteStop): SuggestionRouteNode => ({ longitude: stop.longitude, latitude: stop.latitude, key: `station:${stop.stationId}`, kind: "station", stationId: stop.stationId, initialLeg: stop.leg });
  const outbound = anchors.filter((stop) => stop.leg === "outbound");
  const returning = anchors.filter((stop) => stop.leg === "return");
  const result: SuggestionRouteNode[] = [
    { ...base.origin, key: "origin:start", kind: "origin", stationId: null, initialLeg: null },
    ...outbound.map(node),
    { ...base.destination, key: "destination", kind: "destination", stationId: null, initialLeg: null },
  ];
  if (plan.tripType === "round_trip") result.push(...returning.map(node), { ...base.origin, key: "origin:end", kind: "origin", stationId: null, initialLeg: null });
  return result;
}

interface AnchorInterval { leg: TripPlanStopLeg; before: string; after: string }

function existingIntervals(stops: EditableRouteStop[]) {
  const intervals = new Map<string, AnchorInterval>();
  for (const leg of ["outbound", "return"] as const) {
    const legStops = stops.filter((stop) => stop.leg === leg);
    const start = leg === "outbound" ? "origin:start" : "destination";
    const end = leg === "outbound" ? "destination" : "origin:end";
    for (let index = 0; index < legStops.length; index += 1) {
      const stop = legStops[index];
      if (stop.source !== "algorithm" || stop.isLocked) continue;
      const before = [...legStops.slice(0, index)].reverse().find((item) => item.source === "manual" || item.isLocked);
      const after = legStops.slice(index + 1).find((item) => item.source === "manual" || item.isLocked);
      intervals.set(stop.stationId, { leg, before: before ? `station:${before.stationId}` : start, after: after ? `station:${after.stationId}` : end });
    }
  }
  return intervals;
}

function edgeInterval(nodes: SuggestionRouteNode[], edgeIndex: number): AnchorInterval {
  const leg = edgeLeg(nodes, edgeIndex);
  const fixedKey = (node: SuggestionRouteNode) => node.kind !== "station" || node.key.startsWith("anchor:") || node.initialLeg === "outbound" || node.initialLeg === "return";
  let before = leg === "outbound" ? "origin:start" : "destination";
  let after = leg === "outbound" ? "destination" : "origin:end";
  for (let index = edgeIndex; index >= 0; index -= 1) if (fixedKey(nodes[index]) && (nodes[index].kind !== "station" || nodes[index].key.startsWith("anchor:"))) { before = nodes[index].key.replace("anchor:", "station:"); break; }
  for (let index = edgeIndex + 1; index < nodes.length; index += 1) if (fixedKey(nodes[index]) && (nodes[index].kind !== "station" || nodes[index].key.startsWith("anchor:"))) { after = nodes[index].key.replace("anchor:", "station:"); break; }
  return { leg, before, after };
}

function markAnchorNodes(nodes: SuggestionRouteNode[], anchorIds: Set<string>) {
  return nodes.map((node) => node.stationId && anchorIds.has(node.stationId) ? { ...node, key: `anchor:${node.stationId}` } : node);
}

export async function reoptimizeTripRoute(tripPlanId: string): Promise<TripSuggestionGenerationResult> {
  const [plan, loadedStops] = await Promise.all([getAdminTripPlan(tripPlanId), getAdminSuggestedTripStops(tripPlanId)]);
  if (!plan) throw new TripSuggestionError("Trip Plan not found.");
  if (plan.status !== "draft") throw new TripSuggestionError("Only Draft Trip Plans can be re-optimized.");
  const base = await baseContext(plan);
  const current = editable(loadedStops);
  const anchors = current.filter((stop) =>
    stop.source === "manual" || stop.isLocked);
  const anchorIds = new Set(anchors.map((stop) => stop.stationId));
  const anchorExact = await exactRoute(plan, base, anchors);
  const anchorExtra = calculateExtraRouteMetrics(anchorExact.distanceMeters, anchorExact.durationSeconds, { baseDistanceMeters: plan.baseDistanceMeters as number, baseDurationSeconds: plan.baseDurationSeconds as number });
  const discovery = await discoverTripCorridorCandidates({
    legs: base.segments.map((segment): RouteCorridorLeg => ({ leg: segment.leg, geometry: segment.geometry })), corridorMiles: plan.corridorMiles,
    endpointStationIds: new Set([plan.originStationId, plan.destinationStationId].filter((id): id is string => Boolean(id))),
    existingNonAlgorithmStopStationIds: anchorIds,
  });
  const intervals = existingIntervals(current);
  let finalStops = [...anchors];
  let evaluated = 0;
  let unreachable = 0;
  let technicalLimitReached = discovery.audit.candidateQueryLimitReached;
  let technicalLimitReason: string | null = technicalLimitReached ? "candidate_query_budget" : null;
  if (isWithinDetourBudget(anchorExtra, plan)) {
    const initialNodes = markAnchorNodes(fixedRouteNodes(plan, base, anchors), anchorIds);
    const greedy = await maximizeSuggestedStops({
      tripType: plan.tripType, origin: base.origin, destination: base.destination, candidates: discovery.candidates,
      maxExtraMinutes: plan.maxExtraMinutes, maxExtraMiles: plan.maxExtraMiles,
      legacyMaxStops: plan.maxStops === null ? null : Math.max(0, plan.maxStops - anchors.length),
      initialRouteNodes: initialNodes, initialExtraDriveSeconds: anchorExtra.extraDurationSeconds,
      initialExtraDistanceMeters: anchorExtra.extraDistanceMeters,
      canInsertCandidate: (candidate, nodes, edgeIndex) => {
        const edge = edgeInterval(nodes, edgeIndex);
        const existing = intervals.get(candidate.id);
        return existing ? edge.leg === existing.leg && edge.before === existing.before && edge.after === existing.after : edge.leg === candidate.nearestLeg;
      },
    }, getDrivingMatrix);
    evaluated = greedy.evaluatedCandidateCount; unreachable = greedy.unreachableCandidateCount;
    technicalLimitReached ||= greedy.technicalLimitReached; technicalLimitReason ||= greedy.technicalLimitReason;
    const anchorById = new Map(anchors.map((stop) => [stop.stationId, stop]));
    const selectedById = new Map(greedy.selectedStops.map((stop) => [stop.id, stop]));
    const destinationIndex = greedy.routeNodes.findIndex((node) => node.kind === "destination");
    finalStops = greedy.routeNodes.flatMap((node, index) => {
      if (!node.stationId) return [];
      const fixed = anchorById.get(node.stationId);
      if (fixed) return [{ ...fixed, leg: index < destinationIndex ? "outbound" as const : "return" as const }];
      const selected = selectedById.get(node.stationId);
      return selected ? [{ stopId: null, stationId: selected.id, longitude: selected.longitude, latitude: selected.latitude,
        leg: index < destinationIndex ? "outbound" as const : "return" as const, source: "algorithm" as const, isLocked: false,
        estimatedDetourSeconds: selected.estimatedDetourSeconds, estimatedDetourMeters: selected.estimatedDetourMeters,
        corridorDistanceMeters: selected.corridorDistanceMeters, routeProgress: selected.routeProgress, selectionRank: selected.selectionRank }] : [];
    });
  }
  let exact = await exactRoute(plan, base, finalStops);
  let extra = calculateExtraRouteMetrics(exact.distanceMeters, exact.durationSeconds, { baseDistanceMeters: plan.baseDistanceMeters as number, baseDurationSeconds: plan.baseDurationSeconds as number });
  while (!isWithinDetourBudget(extra, plan) && finalStops.some((stop) =>
    stop.source === "algorithm" && !stop.isLocked)) {
    const removable = finalStops.map((stop, index) => ({ stop, index })).filter(({ stop }) =>
      stop.source === "algorithm" && !stop.isLocked)
      .sort((a, b) => (b.stop.estimatedDetourSeconds ?? 0) - (a.stop.estimatedDetourSeconds ?? 0) || b.index - a.index)[0];
    finalStops.splice(removable.index, 1);
    exact = await exactRoute(plan, base, finalStops);
    extra = calculateExtraRouteMetrics(exact.distanceMeters, exact.durationSeconds, { baseDistanceMeters: plan.baseDistanceMeters as number, baseDurationSeconds: plan.baseDurationSeconds as number });
  }
  const persist = isRouteGeometryPersistenceEnabled();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_save_reoptimized_trip_plan", {
    p_trip_plan_id: plan.id, p_expected_revision: plan.routeInputRevision, p_stops: routePayload(finalStops) as unknown as Json,
    p_planned_distance_meters: exact.distanceMeters, p_planned_drive_seconds: exact.durationSeconds,
    p_planned_stop_seconds: finalStops.length * plan.stopDurationMinutes * 60,
    p_extra_distance_meters: extra.extraDistanceMeters, p_extra_duration_seconds: extra.extraDurationSeconds,
    p_segments: exact.segments as unknown as Json, p_persist_geometry: persist,
    p_corridor_candidate_count: discovery.audit.corridorCandidateCount, p_evaluated_candidate_count: evaluated,
    p_unreachable_candidate_count: unreachable, p_technical_limit_reached: technicalLimitReached,
    p_technical_limit_reason: technicalLimitReason,
  });
  if (error || !data?.[0]) {
    if (/trip changed|fixed manual|stale/i.test(error?.message ?? "")) throw new TripSuggestionError("The trip changed while this operation was running. Refresh and try again.");
    throw new TripSuggestionError("Re-optimization could not be saved. The previous valid plan was kept.");
  }
  return resultAfterSave(plan.id, { ...extra, distanceMeters: exact.distanceMeters, durationSeconds: exact.durationSeconds }, exact.segments);
}
