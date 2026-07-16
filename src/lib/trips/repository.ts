import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { loadAdminPayToParkStationIds } from "@/lib/stations/admin-preferences";
import {
  mapTripPlan,
  mapTripPlanSegment,
  mapTripPlanStop,
  mapTripPlanSummary,
  type TripPlanSummaryRow,
} from "./mappers";
import type {
  TripPlan,
  TripPlanSegment,
  TripPlanStatus,
  TripPlanStop,
  TripPlanSummary,
  SuggestedTripStop,
  TripRouteKind,
  TripStopSearchResult,
} from "./types";

const TRIP_PLAN_LIST_COLUMNS = `
  id,
  name,
  trip_type,
  status,
  origin_label,
  destination_label,
  planned_distance_meters,
  updated_at,
  trip_plan_stops(count)
`;

export class TripRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TripRepositoryError";
  }
}

export async function listAdminTripPlans(
  status?: TripPlanStatus,
): Promise<TripPlanSummary[]> {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase
    .from("trip_plans")
    .select(TRIP_PLAN_LIST_COLUMNS)
    .order("updated_at", { ascending: false })
    .limit(100);

  if (status) query = query.eq("status", status);

  const { data, error } = await query;
  if (error) throw new TripRepositoryError("Trip Plans are temporarily unavailable.");

  return ((data ?? []) as unknown as TripPlanSummaryRow[]).map(mapTripPlanSummary);
}

export async function getAdminTripPlan(id: string): Promise<TripPlan | null> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.from("trip_plans").select("*").eq("id", id).maybeSingle();

  if (error) throw new TripRepositoryError("The Trip Plan could not be loaded.");
  return data ? mapTripPlan(data) : null;
}

export async function getAdminTripPlanStops(id: string): Promise<TripPlanStop[]> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_plan_stops")
    .select("*")
    .eq("trip_plan_id", id)
    .order("sequence", { ascending: true });

  if (error) throw new TripRepositoryError("Trip Plan stops could not be loaded.");
  return (data ?? []).map(mapTripPlanStop);
}

export async function getAdminTripPlanSegments(id: string, routeKind?: TripRouteKind): Promise<TripPlanSegment[]> {
  await requireAdmin();
  const supabase = await createClient();
  let query = supabase
    .from("trip_plan_segments")
    .select("*")
    .eq("trip_plan_id", id)
    .order("segment_index", { ascending: true });

  if (routeKind) query = query.eq("route_kind", routeKind);
  const { data, error } = await query;

  if (error) throw new TripRepositoryError("Trip Plan route data could not be loaded.");
  return (data ?? []).map(mapTripPlanSegment);
}

interface SuggestedStopRow {
  id: string;
  sequence: number;
  leg: string;
  station_id: string;
  corridor_distance_meters: number | null;
  estimated_detour_seconds: number | null;
  estimated_detour_meters: number | null;
  route_progress: number | null;
  selection_rank: number | null;
  source: string;
  is_locked: boolean;
  status: string;
  stations: {
    name: string;
    address: string;
    city: string;
    state: string;
    latitude: number;
    longitude: number;
  } | null;
}

export async function getAdminSuggestedTripStops(id: string): Promise<SuggestedTripStop[]> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("trip_plan_stops")
    .select(`
      id, sequence, leg, station_id, corridor_distance_meters,
      estimated_detour_seconds, estimated_detour_meters, route_progress,
      selection_rank, source, is_locked, status,
      stations!inner(name, address, city, state, latitude, longitude)
    `)
    .eq("trip_plan_id", id)
    .eq("status", "planned")
    .order("sequence", { ascending: true });
  if (error) throw new TripRepositoryError("Planned Stops could not be loaded.");
  const rows = (data ?? []) as unknown as SuggestedStopRow[];
  const stationIds = rows.map((row) => row.station_id);
  const [visits, payToParkStationIds] = await Promise.all([
    stationIds.length === 0 ? Promise.resolve({ data: [], error: null }) : supabase
      .from("station_visits")
      .select("station_id")
      .eq("user_id", admin.id)
      .in("station_id", stationIds),
    loadAdminPayToParkStationIds(supabase, admin.id),
  ]);
  if (visits.error) throw new TripRepositoryError("Current Visit status could not be loaded.");
  const visited = new Set((visits.data ?? []).map((visit) => visit.station_id));
  return rows.flatMap((row) => row.stations ? [{
    id: row.id,
    sequence: row.sequence,
    leg: row.leg === "return" ? "return" as const : "outbound" as const,
    stationId: row.station_id,
    stationName: row.stations.name,
    address: row.stations.address,
    city: row.stations.city,
    state: row.stations.state,
    latitude: row.stations.latitude,
    longitude: row.stations.longitude,
    corridorDistanceMeters: row.corridor_distance_meters,
    estimatedDetourSeconds: row.estimated_detour_seconds,
    estimatedDetourMeters: row.estimated_detour_meters,
    routeProgress: row.route_progress,
    selectionRank: row.selection_rank,
    source: row.source === "manual" ? "manual" as const : "algorithm" as const,
    isLocked: row.source === "manual" || row.is_locked,
    isVisited: visited.has(row.station_id),
    payToPark: payToParkStationIds.has(row.station_id),
    status: "planned" as const,
  }] : []);
}

interface TripStopSearchRow {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  operational_status: string;
}

function searchRank(row: TripStopSearchRow, query: string) {
  const name = row.name.toLocaleLowerCase();
  const city = row.city.toLocaleLowerCase();
  if (city === query || row.state.toLocaleLowerCase() === query || row.postal_code?.toLocaleLowerCase() === query) return 0;
  if (name === query) return 1;
  if (name.startsWith(query)) return 2;
  if (name.includes(query)) return 3;
  if (city.startsWith(query)) return 4;
  return 5;
}

/** Server-only, bounded search. It never returns another user's Visit rows. */
export async function searchAdminTripStopStations(tripPlanId: string, query: string): Promise<TripStopSearchResult[]> {
  const admin = await requireAdmin();
  const normalized = query.trim().slice(0, 100);
  if (normalized.length < 2) return [];
  const supabase = await createClient();
  const plan = await getAdminTripPlan(tripPlanId);
  if (!plan || plan.userId !== admin.id || plan.status !== "draft") throw new TripRepositoryError("Trip Plan Draft not found.");
  const pattern = `%${normalized}%`;
  const fields = ["name", "address", "city", "state", "postal_code"] as const;
  const matches = await Promise.all(fields.map((field) => supabase.from("stations")
    .select("id,name,address,city,state,postal_code,latitude,longitude,operational_status")
    .ilike(field, pattern).limit(25)));
  if (matches.some((result) => result.error)) throw new TripRepositoryError("Station search is temporarily unavailable.");
  const unique = new Map<string, TripStopSearchRow>();
  for (const result of matches) for (const row of result.data ?? []) unique.set(row.id, row as TripStopSearchRow);
  const rows = [...unique.values()].sort((a, b) => searchRank(a, normalized.toLocaleLowerCase()) - searchRank(b, normalized.toLocaleLowerCase()) || a.name.localeCompare(b.name)).slice(0, 25);
  const ids = rows.map((row) => row.id);
  const [stopRows, visitRows, payToParkStationIds] = await Promise.all([
    ids.length ? supabase.from("trip_plan_stops").select("station_id").eq("trip_plan_id", tripPlanId).in("station_id", ids) : Promise.resolve({ data: [], error: null }),
    ids.length ? supabase.from("station_visits").select("station_id").eq("user_id", admin.id).in("station_id", ids) : Promise.resolve({ data: [], error: null }),
    loadAdminPayToParkStationIds(supabase, admin.id),
  ]);
  if (stopRows.error || visitRows.error) throw new TripRepositoryError("Station availability could not be loaded.");
  const existing = new Set((stopRows.data ?? []).map((row) => row.station_id));
  const visited = new Set((visitRows.data ?? []).map((row) => row.station_id));
  const endpointIds = new Set([plan.originStationId, plan.destinationStationId].filter(Boolean));
  const closed = new Set(["closed", "permanently closed", "removed", "inactive"]);
  return rows.map((row) => {
    const endpoint = endpointIds.has(row.id);
    const already = existing.has(row.id);
    const invalidCoordinates = !Number.isFinite(row.latitude) || !Number.isFinite(row.longitude) || Math.abs(row.latitude) > 90 || Math.abs(row.longitude) > 180;
    const status = row.operational_status.trim().toLocaleLowerCase();
    const isClosed = closed.has(status);
    const unknown = !["available", "open"].includes(status) && !isClosed;
    return {
      id: row.id, name: row.name, address: row.address, city: row.city, state: row.state,
      postalCode: row.postal_code, latitude: row.latitude, longitude: row.longitude,
      operationalStatus: row.operational_status, isVisited: visited.has(row.id), isExistingStop: already,
      payToPark: payToParkStationIds.has(row.id),
      isEndpoint: endpoint,
      canAdd: !endpoint && !already && !invalidCoordinates && !isClosed,
      warning: isClosed ? "This station is closed." : invalidCoordinates ? "This station has invalid coordinates." : unknown ? "Operational status is unknown; verify before traveling." : null,
    };
  });
}
