import "server-only";

import { getDrivingDirectionsForWaypoints } from "@/lib/mapbox/directions";
import { buildPlannedRouteLegs, calculateSegmentedPlannedRoute } from "@/lib/mapbox/planned-route";
import { isRouteGeometryPersistenceEnabled } from "@/lib/mapbox/server-client";
import type { MapboxCoordinate } from "@/lib/mapbox/types";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/types/database";
import { calculateExtraRouteMetrics } from "./budget-correction";
import { buildChunkedDrivingMatrix } from "./chunked-matrix";
import { measurePointAlongRoute } from "./corridor";
import {
  MAX_OPTIMIZATION_ITERATIONS,
  MAX_OPTIMIZATION_RUNTIME_MS,
  MAX_SELECTED_STATIONS_PER_OPTIMIZATION,
  SELECTED_OUT_AND_BACK_ALGORITHM_VERSION,
} from "./planning-config";
import { getAdminSuggestedTripStops, getAdminTripPlan } from "./repository";
import {
  optimizeSelectedOutAndBack,
  type SelectedOptimizationStation,
} from "./selected-out-and-back-optimizer";
import { calculateSavedTripRoutePreview } from "./suggestion-service";
import type {
  SelectedOutAndBackGenerationResult,
  SelectedTripBudgetStatus,
  TripPlan,
  TripRouteGeometry,
  TripRouteSegment,
} from "./types";

type StationRow = Tables<"stations">;

export type SelectedRouteOptimizationErrorCode =
  | "invalid_selection"
  | "stale_revision"
  | "unreachable_stations"
  | "technical_limit"
  | "save_failed";

export class SelectedRouteOptimizationError extends Error {
  constructor(
    readonly code: SelectedRouteOptimizationErrorCode,
    readonly safeMessage: string,
    readonly stationIds: string[] = [],
  ) {
    super(safeMessage);
    this.name = "SelectedRouteOptimizationError";
  }
}

function endpoint(plan: TripPlan, kind: "origin" | "destination"): MapboxCoordinate | null {
  const latitude = kind === "origin" ? plan.originLatitude : plan.destinationLatitude;
  const longitude = kind === "origin" ? plan.originLongitude : plan.destinationLongitude;
  return latitude === null || longitude === null ? null : { latitude, longitude };
}

function combinedGeometry(segments: TripRouteSegment[], leg: "outbound" | "return"): TripRouteGeometry | null {
  const geometries = segments.filter((segment) => segment.leg === leg).map((segment) => segment.geometry);
  const coordinates = geometries.flatMap((geometry, index) =>
    index === 0 ? geometry.coordinates : geometry.coordinates.slice(1));
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

function optimizationHints(
  stations: StationRow[],
  outboundGeometry: TripRouteGeometry,
  returnGeometry: TripRouteGeometry,
): Array<Omit<SelectedOptimizationStation, "nodeIndex"> & { stationId: string }> {
  return stations.map((station) => {
    const point: [number, number] = [station.longitude, station.latitude];
    const outbound = measurePointAlongRoute(point, outboundGeometry);
    const returning = measurePointAlongRoute(point, returnGeometry);
    const nearestLeg = outbound.corridorDistanceMeters <= returning.corridorDistanceMeters
      ? "outbound" as const : "return" as const;
    return {
      stationId: station.id,
      nearestLeg,
      routeProgress: nearestLeg === "outbound" ? outbound.routeProgress : returning.routeProgress,
    };
  });
}

function selectedBudgetStatus(
  extraDurationSeconds: number,
  extraDistanceMeters: number,
  plan: TripPlan,
): { status: SelectedTripBudgetStatus; overTimeSeconds: number; overDistanceMeters: number } {
  const overTimeSeconds = Math.max(0, extraDurationSeconds - plan.maxExtraMinutes * 60);
  const distanceBudget = plan.maxExtraMiles === null ? null : plan.maxExtraMiles * 1609.344;
  const overDistanceMeters = distanceBudget === null ? 0 : Math.max(0, extraDistanceMeters - distanceBudget);
  const status = overTimeSeconds > 0 && overDistanceMeters > 0 ? "over_both"
    : overTimeSeconds > 0 ? "over_time"
    : overDistanceMeters > 0 ? "over_distance"
    : "within_budget";
  return { status, overTimeSeconds, overDistanceMeters };
}

function ensureStationRows(selectedIds: string[], rows: StationRow[], endpointIds: Set<string>) {
  const rowById = new Map(rows.map((row) => [row.id, row]));
  const missing = selectedIds.filter((id) => !rowById.has(id));
  if (missing.length > 0) {
    throw new SelectedRouteOptimizationError(
      "invalid_selection",
      "One or more selected Stations no longer exist. Refresh the map and try again.",
      missing,
    );
  }
  const invalid = rows.filter((row) => {
    const status = row.operational_status.trim().toLocaleLowerCase();
    return endpointIds.has(row.id) || !["available", "open"].includes(status) ||
      !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) ||
      Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180;
  }).map((row) => row.id);
  if (invalid.length > 0) {
    throw new SelectedRouteOptimizationError(
      "invalid_selection",
      "A selected Station is closed, is an endpoint, or has invalid route data. Nothing was changed.",
      invalid,
    );
  }
}

export async function optimizeAndSaveSelectedOutAndBackStations(input: {
  tripPlanId: string;
  expectedRevision: number;
  selectedStationIds: string[];
}): Promise<SelectedOutAndBackGenerationResult> {
  const selectedIds = [...new Set(input.selectedStationIds)].sort((left, right) => left.localeCompare(right));
  if (selectedIds.length > MAX_SELECTED_STATIONS_PER_OPTIMIZATION) {
    throw new SelectedRouteOptimizationError(
      "technical_limit",
      `Select no more than ${MAX_SELECTED_STATIONS_PER_OPTIMIZATION} Stations in one optimization. This is an internal provider safety guard, not a Trip Stop budget.`,
    );
  }
  const plan = await getAdminTripPlan(input.tripPlanId);
  if (!plan || plan.status !== "draft") {
    throw new SelectedRouteOptimizationError("invalid_selection", "Trip Plan Draft not found.");
  }
  if (plan.tripType !== "round_trip") {
    throw new SelectedRouteOptimizationError("invalid_selection", "Selected Station optimization requires a round trip.");
  }
  if (plan.routeInputRevision !== input.expectedRevision) {
    throw new SelectedRouteOptimizationError(
      "stale_revision",
      "The Trip changed while you were selecting Stations. Refresh the latest route and try again.",
    );
  }
  if (plan.baseDistanceMeters === null || plan.baseDurationSeconds === null) {
    throw new SelectedRouteOptimizationError("invalid_selection", "Calculate the Base Route before optimizing Stations.");
  }
  const origin = endpoint(plan, "origin");
  const destination = endpoint(plan, "destination");
  if (!origin || !destination) {
    throw new SelectedRouteOptimizationError("invalid_selection", "Choose and save both endpoints first.");
  }

  const basePreview = await calculateSavedTripRoutePreview(plan.id, "base");
  const outboundGeometry = combinedGeometry(basePreview.segments, "outbound");
  const returnGeometry = combinedGeometry(basePreview.segments, "return");
  if (!outboundGeometry || !returnGeometry) {
    throw new SelectedRouteOptimizationError("invalid_selection", "The round-trip Base Route Geometry is unavailable.");
  }

  const supabase = await createClient();
  const stationResult = selectedIds.length === 0
    ? { data: [] as StationRow[], error: null }
    : await supabase.from("stations").select("*").in("id", selectedIds);
  if (stationResult.error) {
    throw new SelectedRouteOptimizationError("invalid_selection", "Selected Stations could not be verified.");
  }
  const stationRows = [...(stationResult.data ?? [])].sort((left, right) => left.id.localeCompare(right.id));
  ensureStationRows(
    selectedIds,
    stationRows,
    new Set([plan.originStationId, plan.destinationStationId].filter((id): id is string => Boolean(id))),
  );

  const coordinates: MapboxCoordinate[] = [origin, destination, ...stationRows.map((station) => ({
    latitude: station.latitude,
    longitude: station.longitude,
  }))];
  let matrixRequestCount = 0;
  let outboundNodeIndices: number[] = [];
  let returnNodeIndices: number[] = [];
  let optimizationIterations = 0;
  let optimizationRuntimeMs = 0;
  let technicalLimitReached = false;
  let technicalLimitReason: string | null = null;

  if (stationRows.length > 0) {
    const matrix = await buildChunkedDrivingMatrix(coordinates);
    matrixRequestCount = matrix.requestCount;
    const hints = optimizationHints(stationRows, outboundGeometry, returnGeometry);
    const optimization = optimizeSelectedOutAndBack(
      matrix,
      hints.map((hint, index) => ({ ...hint, nodeIndex: index + 2 })),
      { maxIterations: MAX_OPTIMIZATION_ITERATIONS, maxRuntimeMs: MAX_OPTIMIZATION_RUNTIME_MS },
    );
    optimizationIterations = optimization.iterations;
    optimizationRuntimeMs = optimization.runtimeMs;
    technicalLimitReached = optimization.technicalLimitReached;
    technicalLimitReason = optimization.technicalLimitReason;
    if (!optimization.route) {
      const unreachableIds = optimization.unreachableNodeIndices.length > 0
        ? optimization.unreachableNodeIndices.map((index) => stationRows[index - 2]?.id).filter((id): id is string => Boolean(id))
        : selectedIds;
      throw new SelectedRouteOptimizationError(
        "unreachable_stations",
        "Mapbox could not construct one continuous round trip containing every selected Station. Nothing was changed.",
        unreachableIds,
      );
    }
    outboundNodeIndices = optimization.route.outboundNodeIndices;
    returnNodeIndices = optimization.route.returnNodeIndices;
  }

  const orderedNodes = [...outboundNodeIndices, ...returnNodeIndices];
  const stationByNode = new Map(stationRows.map((station, index) => [index + 2, station]));
  const outboundSet = new Set(outboundNodeIndices);
  const orderedStations = orderedNodes.map((nodeIndex, sequence) => {
    const station = stationByNode.get(nodeIndex)!;
    return {
      station,
      sequence,
      leg: outboundSet.has(nodeIndex) ? "outbound" as const : "return" as const,
    };
  });

  let segments: TripRouteSegment[];
  let plannedDistanceMeters: number;
  let plannedDriveSeconds: number;
  if (orderedStations.length === 0) {
    segments = basePreview.segments.map((segment, segmentIndex) => ({ ...segment, segmentIndex }));
    plannedDistanceMeters = plan.baseDistanceMeters;
    plannedDriveSeconds = plan.baseDurationSeconds;
  } else {
    const legs = buildPlannedRouteLegs(
      origin,
      destination,
      orderedStations.map(({ station, sequence, leg }) => ({
        longitude: station.longitude,
        latitude: station.latitude,
        sequence,
        leg,
      })),
      true,
    );
    const finalRoute = await calculateSegmentedPlannedRoute(legs, getDrivingDirectionsForWaypoints);
    if (finalRoute.technicalLimitReached) {
      throw new SelectedRouteOptimizationError(
        "technical_limit",
        "The selected route exceeds the internal Directions request guard. Nothing was changed.",
      );
    }
    segments = finalRoute.segments;
    plannedDistanceMeters = Math.round(finalRoute.distanceMeters);
    plannedDriveSeconds = Math.round(finalRoute.durationSeconds);
  }
  const { extraDistanceMeters, extraDurationSeconds } = calculateExtraRouteMetrics(
    plannedDistanceMeters,
    plannedDriveSeconds,
    { baseDistanceMeters: plan.baseDistanceMeters, baseDurationSeconds: plan.baseDurationSeconds },
  );
  const plannedStopSeconds = orderedStations.length * plan.stopDurationMinutes * 60;
  const persistGeometry = isRouteGeometryPersistenceEnabled();
  const stopPayload = orderedStations.map(({ station, sequence, leg }) => ({
    stationId: station.id,
    sequence,
    leg,
    source: "manual",
    isLocked: true,
    status: "planned",
  }));

  const { data, error } = await supabase.rpc("admin_save_selected_out_and_back_route", {
    p_trip_plan_id: plan.id,
    p_expected_revision: input.expectedRevision,
    p_selected_station_ids: selectedIds,
    p_stops: stopPayload as unknown as Json,
    p_planned_distance_meters: plannedDistanceMeters,
    p_planned_drive_seconds: plannedDriveSeconds,
    p_planned_stop_seconds: plannedStopSeconds,
    p_extra_distance_meters: extraDistanceMeters,
    p_extra_duration_seconds: extraDurationSeconds,
    p_segments: segments as unknown as Json,
    p_persist_geometry: persistGeometry,
    p_algorithm_version: SELECTED_OUT_AND_BACK_ALGORITHM_VERSION,
  });
  if (error || !data?.[0]) {
    const message = error?.message ?? "";
    if (/stale route result/i.test(message)) {
      throw new SelectedRouteOptimizationError(
        "stale_revision",
        "The Trip changed during optimization. The previous route was kept.",
      );
    }
    throw new SelectedRouteOptimizationError(
      "save_failed",
      "The selected route was calculated but could not be saved. The previous valid route was kept.",
    );
  }

  const [savedStops, visitsResult] = await Promise.all([
    getAdminSuggestedTripStops(plan.id),
    selectedIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabase.from("station_visits").select("station_id").eq("user_id", plan.userId).in("station_id", selectedIds),
  ]);
  if (visitsResult.error) {
    throw new SelectedRouteOptimizationError("save_failed", "The route was saved, but its Visit summary could not be loaded.");
  }
  const visitedIds = new Set((visitsResult.data ?? []).map((visit) => visit.station_id));
  const budget = selectedBudgetStatus(extraDurationSeconds, extraDistanceMeters, plan);
  return {
    stops: savedStops,
    segments,
    geometryPersisted: persistGeometry,
    routeInputRevision: data[0].route_input_revision,
    summary: {
      selectedStopCount: selectedIds.length,
      expectedNewStopCount: selectedIds.filter((id) => !visitedIds.has(id)).length,
      alreadyVisitedStopCount: selectedIds.filter((id) => visitedIds.has(id)).length,
      outboundStopCount: outboundNodeIndices.length,
      returnStopCount: returnNodeIndices.length,
      baseDistanceMeters: plan.baseDistanceMeters,
      baseDurationSeconds: plan.baseDurationSeconds,
      plannedDistanceMeters,
      plannedDriveSeconds,
      plannedStopSeconds,
      extraDistanceMeters,
      extraDriveSeconds: extraDurationSeconds,
      overTimeSeconds: budget.overTimeSeconds,
      overDistanceMeters: budget.overDistanceMeters,
      budgetStatus: budget.status,
      algorithmVersion: SELECTED_OUT_AND_BACK_ALGORITHM_VERSION,
      matrixRequestCount,
      optimizationIterations,
      optimizationRuntimeMs,
      technicalLimitReached,
      technicalLimitReason,
    },
  };
}
