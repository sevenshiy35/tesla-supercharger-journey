import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { loadAdminPayToParkStationIds } from "@/lib/stations/admin-preferences";
import type { Tables } from "@/types/database";
import { expandedRouteBoundingBoxes, measurePointAlongRoute, METERS_PER_MILE } from "./corridor";
import { getAdminTripPlan, getAdminTripPlanStops } from "./repository";
import { MAX_SELECTED_STATIONS_PER_OPTIMIZATION } from "./planning-config";
import { calculateSavedTripRoutePreview } from "./suggestion-service";
import type { TripRouteGeometry, TripStationCandidate } from "./types";

const CANDIDATE_PAGE_SIZE = 500;
const MAX_CANDIDATE_PAGES = 12;
const MAX_CANDIDATE_RESPONSE = 2_000;

type StationRow = Tables<"stations">;

export class TripStationCandidateError extends Error {
  constructor(readonly safeMessage: string, readonly status = 422) {
    super(safeMessage);
    this.name = "TripStationCandidateError";
  }
}

export interface StationCandidateBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

function combinedGeometry(geometries: TripRouteGeometry[]): TripRouteGeometry | null {
  const coordinates = geometries.flatMap((geometry, geometryIndex) =>
    geometryIndex === 0 ? geometry.coordinates : geometry.coordinates.slice(1));
  return coordinates.length >= 2 ? { type: "LineString", coordinates } : null;
}

function insideBounds(row: StationRow, bounds?: StationCandidateBounds) {
  if (!bounds) return true;
  const latitudeMatch = row.latitude >= bounds.south && row.latitude <= bounds.north;
  const longitudeMatch = bounds.west <= bounds.east
    ? row.longitude >= bounds.west && row.longitude <= bounds.east
    : row.longitude >= bounds.west || row.longitude <= bounds.east;
  return latitudeMatch && longitudeMatch;
}

function normalizedStatus(value: string) {
  return value.trim().toLocaleLowerCase();
}

function validCoordinate(row: StationRow) {
  return Number.isFinite(row.latitude) && Number.isFinite(row.longitude) &&
    Math.abs(row.latitude) <= 90 && Math.abs(row.longitude) <= 180;
}

export async function listAdminTripStationCandidates(input: {
  tripPlanId: string;
  corridorMiles: number;
  bounds?: StationCandidateBounds;
  visited?: "all" | "visited" | "unvisited";
  search?: string;
}) {
  const admin = await requireAdmin();
  const [plan, currentStops] = await Promise.all([
    getAdminTripPlan(input.tripPlanId),
    getAdminTripPlanStops(input.tripPlanId),
  ]);
  if (!plan || plan.userId !== admin.id) throw new TripStationCandidateError("Trip Plan not found.", 404);
  if (plan.status !== "draft") throw new TripStationCandidateError("Only Draft Trip Plans can select Stations.");
  if (plan.tripType !== "round_trip") throw new TripStationCandidateError("Map Station selection is available for round trips.");
  if (plan.baseDistanceMeters === null || plan.baseDurationSeconds === null) {
    throw new TripStationCandidateError("Calculate the Base Route before selecting Stations.");
  }

  const preview = await calculateSavedTripRoutePreview(plan.id, "base");
  const outboundGeometry = combinedGeometry(preview.segments
    .filter((segment) => segment.leg === "outbound")
    .map((segment) => segment.geometry));
  const returnGeometry = combinedGeometry(preview.segments
    .filter((segment) => segment.leg === "return")
    .map((segment) => segment.geometry));
  if (!outboundGeometry || !returnGeometry) {
    throw new TripStationCandidateError("The round-trip Base Route Geometry is unavailable.");
  }

  const supabase = await createClient();
  const boxes = expandedRouteBoundingBoxes([
    { leg: "outbound", geometry: outboundGeometry },
    { leg: "return", geometry: returnGeometry },
  ], input.corridorMiles);
  const rows = new Map<string, StationRow>();
  let queryLimitReached = false;
  for (const box of boxes) {
    for (let page = 0; page < MAX_CANDIDATE_PAGES; page += 1) {
      const from = page * CANDIDATE_PAGE_SIZE;
      const { data, error } = await supabase.from("stations").select("*")
        .gte("latitude", box.minLatitude).lte("latitude", box.maxLatitude)
        .gte("longitude", box.minLongitude).lte("longitude", box.maxLongitude)
        .order("id", { ascending: true }).range(from, from + CANDIDATE_PAGE_SIZE - 1);
      if (error) throw new TripStationCandidateError("Station candidates are temporarily unavailable.", 503);
      for (const row of data ?? []) rows.set(row.id, row);
      if ((data?.length ?? 0) < CANDIDATE_PAGE_SIZE) break;
      if (page === MAX_CANDIDATE_PAGES - 1) queryLimitReached = true;
    }
  }

  const currentStopIds = new Set(currentStops.map((stop) => stop.stationId));
  const endpointIds = new Set([plan.originStationId, plan.destinationStationId].filter((id): id is string => Boolean(id)));
  const requiredIds = [...new Set([...currentStopIds, ...endpointIds])];
  if (requiredIds.length > 0) {
    const { data, error } = await supabase.from("stations").select("*").in("id", requiredIds);
    if (error) throw new TripStationCandidateError("Current Trip Stations could not be loaded.", 503);
    for (const row of data ?? []) rows.set(row.id, row);
  }

  const search = input.search?.trim().slice(0, 100) ?? "";
  const searchIds = new Set<string>();
  if (search.length >= 2) {
    const pattern = `%${search}%`;
    const fields = ["name", "address", "city", "state", "postal_code"] as const;
    const results = await Promise.all(fields.map((field) =>
      supabase.from("stations").select("*").ilike(field, pattern).order("name").limit(25)));
    if (results.some((result) => result.error)) {
      throw new TripStationCandidateError("Station search is temporarily unavailable.", 503);
    }
    for (const result of results) for (const row of result.data ?? []) {
      rows.set(row.id, row);
      searchIds.add(row.id);
    }
  }

  const visitedIds = new Set<string>();
  for (let page = 0; page < MAX_CANDIDATE_PAGES; page += 1) {
    const from = page * CANDIDATE_PAGE_SIZE;
    const { data, error } = await supabase.from("station_visits").select("station_id")
      .eq("user_id", admin.id).order("id", { ascending: true })
      .range(from, from + CANDIDATE_PAGE_SIZE - 1);
    if (error) throw new TripStationCandidateError("Visit status could not be loaded safely.", 503);
    for (const visit of data ?? []) visitedIds.add(visit.station_id);
    if ((data?.length ?? 0) < CANDIDATE_PAGE_SIZE) break;
    if (page === MAX_CANDIDATE_PAGES - 1) {
      throw new TripStationCandidateError(
        "Visit history exceeds the current safe candidate-analysis guard. Narrowing the map cannot safely infer the remaining Visit states.",
        422,
      );
    }
  }
  const closedStatuses = new Set(["closed", "permanently closed", "removed", "inactive"]);
  const allowedStatuses = new Set(["available", "open"]);
  const corridorMeters = input.corridorMiles * METERS_PER_MILE;
  const payToParkStationIds = await loadAdminPayToParkStationIds(supabase, admin.id);

  const allCandidates = [...rows.values()].flatMap((row): TripStationCandidate[] => {
    if (!validCoordinate(row)) return [];
    const outbound = measurePointAlongRoute([row.longitude, row.latitude], outboundGeometry);
    const returning = measurePointAlongRoute([row.longitude, row.latitude], returnGeometry);
    const already = currentStopIds.has(row.id);
    const endpoint = endpointIds.has(row.id);
    const searchMatch = searchIds.has(row.id);
    const withinCorridor = Math.min(outbound.corridorDistanceMeters, returning.corridorDistanceMeters) <= corridorMeters + 1e-6;
    if (!withinCorridor && !already && !endpoint && !searchMatch) return [];
    if (!insideBounds(row, input.bounds) && !already && !searchMatch) return [];
    const visited = visitedIds.has(row.id);
    if (input.visited === "visited" && !visited && !already) return [];
    if (input.visited === "unvisited" && visited && !already) return [];
    const status = normalizedStatus(row.operational_status);
    const closed = closedStatuses.has(status);
    const selectable = !endpoint && !closed && allowedStatuses.has(status);
    const nearestLeg = outbound.corridorDistanceMeters <= returning.corridorDistanceMeters
      ? "outbound" as const : "return" as const;
    return [{
      stationId: row.id,
      name: row.name,
      address: row.address,
      city: row.city,
      state: row.state,
      postalCode: row.postal_code,
      latitude: row.latitude,
      longitude: row.longitude,
      operationalStatus: row.operational_status,
      stallCount: row.stall_count,
      maxPowerKw: row.max_power_kw,
      isVisited: visited,
      payToPark: payToParkStationIds.has(row.id),
      isEndpoint: endpoint,
      isAlreadyInTrip: already,
      isSelectable: selectable,
      warning: endpoint
        ? "Trip endpoints cannot also be Stops."
        : closed ? "This Station is closed."
        : !allowedStatuses.has(status) ? "Operational status must be verified before selection."
        : null,
      distanceToOutboundMeters: Math.round(outbound.corridorDistanceMeters),
      distanceToReturnMeters: Math.round(returning.corridorDistanceMeters),
      nearestLeg,
      routeProgress: nearestLeg === "outbound" ? outbound.routeProgress : returning.routeProgress,
    }];
  }).sort((left, right) =>
    Number(right.isAlreadyInTrip) - Number(left.isAlreadyInTrip) ||
    Number(left.isVisited) - Number(right.isVisited) ||
    Math.min(left.distanceToOutboundMeters, left.distanceToReturnMeters) -
      Math.min(right.distanceToOutboundMeters, right.distanceToReturnMeters) ||
    left.name.localeCompare(right.name) || left.stationId.localeCompare(right.stationId));
  if (allCandidates.length > MAX_CANDIDATE_RESPONSE) queryLimitReached = true;
  const candidates = allCandidates.slice(0, MAX_CANDIDATE_RESPONSE);

  return {
    candidates,
    queryLimitReached,
    corridorMiles: input.corridorMiles,
    maximumSelectableStations: MAX_SELECTED_STATIONS_PER_OPTIMIZATION,
  };
}
