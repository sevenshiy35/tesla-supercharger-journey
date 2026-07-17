import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { loadAdminPayToParkStationIds } from "@/lib/stations/admin-preferences";
import { createClient } from "@/lib/supabase/server";
import type {
  AdminStationResult,
  AdminVisitDetail,
  AdminVisitSummary,
  SelectedAdminStation,
  VisitTimePrecision,
} from "@/types/admin";
import { haversineMiles } from "./distance";

const STATION_COLUMNS =
  "id,name,address,city,state,postal_code,latitude,longitude,visited,latest_visit_at";

interface StationRow {
  id: string | null;
  name: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  latitude: number | null;
  longitude: number | null;
  visited: boolean | null;
  latest_visit_at: string | null;
}

interface VisitQueryRow {
  id: string;
  station_id: string;
  checked_in_at: string;
  checked_in_timezone: string;
  checked_in_time_precision: string;
  is_public: boolean;
  recorded_latitude: number | null;
  recorded_longitude: number | null;
  notes?: string | null;
  station:
    | {
        name: string;
        address: string;
        city: string;
        state: string;
        postal_code: string | null;
      }
    | Array<{
        name: string;
        address: string;
        city: string;
        state: string;
        postal_code: string | null;
      }>;
  charging_session:
    | {
        started_at: string | null;
        energy_kwh: number | null;
        cost_usd: number | null;
        charging_minutes: number | null;
        price_per_kwh: number | null;
      }
    | Array<{
        started_at: string | null;
        energy_kwh: number | null;
        cost_usd: number | null;
        charging_minutes: number | null;
        price_per_kwh: number | null;
      }>
    | null;
  visit_photos?: Array<{ id: string }>;
}

export interface DashboardData {
  visitedStations: number;
  totalStations: number;
  totalVisits: number;
  visitedStates: number;
  totalTrips: number;
  activeTrips: number;
  stationPhotos: number;
  tripPhotos: number;
  latestTrip: {
    id: string;
    name: string | null;
    status: string;
    originLabel: string | null;
    destinationLabel: string | null;
    updatedAt: string;
  } | null;
}

export interface VisitFilters {
  query: string;
  visibility: "all" | "public" | "private";
  precision: "all" | VisitTimePrecision;
  state: string;
  page: number;
}

export interface VisitPage {
  visits: AdminVisitSummary[];
  total: number;
  page: number;
  pageCount: number;
}

function firstRelation<T>(value: T | T[]): T {
  return Array.isArray(value) ? value[0] : value;
}

function nullableFirstRelation<T>(value: T | T[] | null): T | null {
  if (!value) return null;
  return Array.isArray(value) ? value[0] ?? null : value;
}

function mapStation(row: StationRow): AdminStationResult | null {
  if (
    !row.id ||
    !row.name ||
    !row.address ||
    !row.city ||
    !row.state ||
    row.latitude === null ||
    row.longitude === null
  ) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    latitude: row.latitude,
    longitude: row.longitude,
    visited: row.visited === true,
    latestVisitAt: row.latest_visit_at,
    payToPark: false,
  };
}

function attachPayToPark<T extends AdminStationResult>(stations: T[], stationIds: ReadonlySet<string>): T[] {
  return stations.map((station) => ({ ...station, payToPark: stationIds.has(station.id) }));
}

function mapVisit(row: VisitQueryRow): AdminVisitSummary {
  const station = firstRelation(row.station);
  const session = nullableFirstRelation(row.charging_session);

  return {
    id: row.id,
    stationId: row.station_id,
    stationName: station.name,
    city: station.city,
    state: station.state,
    checkedInAt: row.checked_in_at,
    checkedInTimezone: row.checked_in_timezone,
    checkedInTimePrecision:
      row.checked_in_time_precision === "date_only" ? "date_only" : "exact",
    isPublic: row.is_public,
    hasGps: row.recorded_latitude !== null && row.recorded_longitude !== null,
    energyKwh: session?.energy_kwh ?? null,
    costUsd: session?.cost_usd ?? null,
  };
}

function stationRelevance(station: AdminStationResult, normalizedQuery: string) {
  const name = station.name.toLocaleLowerCase();
  const city = station.city.toLocaleLowerCase();
  const state = station.state.toLocaleLowerCase();
  const postalCode = station.postalCode?.toLocaleLowerCase() ?? "";
  const address = station.address.toLocaleLowerCase();

  if (city === normalizedQuery || state === normalizedQuery || postalCode === normalizedQuery) return 0;
  if (name === normalizedQuery) return 1;
  if (name.startsWith(normalizedQuery)) return 2;
  if (name.includes(normalizedQuery)) return 3;
  if (city.startsWith(normalizedQuery)) return 4;
  if (address.includes(normalizedQuery)) return 5;
  return 6;
}

export async function searchAdminStations(query: string): Promise<AdminStationResult[]> {
  const normalizedQuery = query.trim().slice(0, 100);
  if (normalizedQuery.length < 2) return [];

  const admin = await requireAdmin();
  const supabase = await createClient();
  const pattern = `%${normalizedQuery}%`;
  const fields = ["name", "address", "city", "state", "postal_code"] as const;
  const results = await Promise.all(
    fields.map((field) =>
      supabase.from("public_station_status").select(STATION_COLUMNS).ilike(field, pattern).limit(25),
    ),
  );

  if (results.some((result) => result.error)) {
    throw new Error("Station search is temporarily unavailable.");
  }

  const unique = new Map<string, AdminStationResult>();
  for (const result of results) {
    for (const rawRow of result.data ?? []) {
      const station = mapStation(rawRow as StationRow);
      if (station) unique.set(station.id, station);
    }
  }

  const lowerQuery = normalizedQuery.toLocaleLowerCase();
  const payToParkStationIds = await loadAdminPayToParkStationIds(supabase, admin.id);
  return attachPayToPark([...unique.values()]
    .sort(
      (a, b) =>
        stationRelevance(a, lowerQuery) - stationRelevance(b, lowerQuery) ||
        a.name.localeCompare(b.name),
    )
    .slice(0, 25), payToParkStationIds);
}

async function getCandidatesWithinRadius(latitude: number, longitude: number, radiusMiles: number) {
  const supabase = await createClient();
  const latitudeDelta = radiusMiles / 69;
  const longitudeDelta = radiusMiles / Math.max(10, 69 * Math.cos((latitude * Math.PI) / 180));
  const { data, error } = await supabase
    .from("public_station_status")
    .select(STATION_COLUMNS)
    .gte("latitude", latitude - latitudeDelta)
    .lte("latitude", latitude + latitudeDelta)
    .gte("longitude", longitude - longitudeDelta)
    .lte("longitude", longitude + longitudeDelta)
    .order("external_id", { ascending: true })
    .limit(1_000);

  if (error) throw new Error("Nearby stations are temporarily unavailable.");

  return (data ?? [])
    .map((row) => mapStation(row as StationRow))
    .filter((station): station is AdminStationResult => station !== null)
    .map((station) => ({
      ...station,
      distanceMiles: haversineMiles(
        latitude,
        longitude,
        station.latitude,
        station.longitude,
      ),
    }))
    .filter((station) => station.distanceMiles <= radiusMiles);
}

export async function getNearbyAdminStations(latitude: number, longitude: number) {
  const admin = await requireAdmin();
  let candidates: AdminStationResult[] = [];

  for (const radius of [35, 100, 250]) {
    candidates = await getCandidatesWithinRadius(latitude, longitude, radius);
    if (candidates.length >= 15) break;
  }

  const supabase = await createClient();
  const payToParkStationIds = await loadAdminPayToParkStationIds(supabase, admin.id);
  return attachPayToPark(candidates
    .sort((a, b) => (a.distanceMiles ?? Infinity) - (b.distanceMiles ?? Infinity))
    .slice(0, 15), payToParkStationIds);
}

export async function getSelectedAdminStation(
  stationId: string,
  coordinates?: { latitude: number; longitude: number },
): Promise<SelectedAdminStation | null> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const [stationResult, countResult, latestResult] = await Promise.all([
    supabase.from("public_station_status").select(STATION_COLUMNS).eq("id", stationId).maybeSingle(),
    supabase
      .from("station_visits")
      .select("id", { count: "exact", head: true })
      .eq("station_id", stationId),
    supabase
      .from("station_visits")
      .select("checked_in_at,checked_in_timezone,checked_in_time_precision")
      .eq("station_id", stationId)
      .order("checked_in_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (stationResult.error || countResult.error || latestResult.error) {
    throw new Error("The selected station could not be loaded.");
  }

  const station = stationResult.data ? mapStation(stationResult.data as StationRow) : null;
  if (!station) return null;
  const payToParkStationIds = await loadAdminPayToParkStationIds(supabase, admin.id);

  return {
    ...station,
    payToPark: payToParkStationIds.has(station.id),
    previousVisitCount: countResult.count ?? 0,
    latestVisitAt: latestResult.data?.checked_in_at ?? null,
    latestVisitTimezone: latestResult.data?.checked_in_timezone,
    latestVisitTimePrecision:
      latestResult.data?.checked_in_time_precision === "date_only" ? "date_only" : "exact",
    ...(coordinates
      ? {
          distanceMiles: haversineMiles(
            coordinates.latitude,
            coordinates.longitude,
            station.latitude,
            station.longitude,
          ),
        }
      : {}),
  };
}

const VISIT_SUMMARY_COLUMNS = `
  id,
  station_id,
  checked_in_at,
  checked_in_timezone,
  checked_in_time_precision,
  is_public,
  recorded_latitude,
  recorded_longitude,
  station:stations!station_visits_station_id_fkey(name,address,city,state,postal_code),
  charging_session:charging_sessions(started_at,energy_kwh,cost_usd,charging_minutes,price_per_kwh)
`;

export async function getAdminDashboardData(): Promise<DashboardData> {
  const supabase = await createClient();
  const [
    visited,
    allStations,
    total,
    visitedStateRows,
    trips,
    activeTrips,
    stationPhotos,
    tripPhotos,
    latestTrip,
  ] = await Promise.all([
    supabase
      .from("public_station_status")
      .select("id", { count: "exact", head: true })
      .eq("visited", true),
    supabase.from("public_station_status").select("id", { count: "exact", head: true }),
    supabase.from("station_visits").select("id", { count: "exact", head: true }),
    supabase
      .from("public_station_status")
      .select("state")
      .eq("visited", true)
      .limit(5_000),
    supabase.from("trip_plans").select("id", { count: "exact", head: true }),
    supabase
      .from("trip_plans")
      .select("id", { count: "exact", head: true })
      .in("status", ["confirmed", "active"]),
    supabase.from("visit_photos").select("id", { count: "exact", head: true }),
    supabase.from("trip_photos").select("id", { count: "exact", head: true }),
    supabase
      .from("trip_plans")
      .select("id,name,status,origin_label,destination_label,updated_at")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  if (
    visited.error ||
    allStations.error ||
    total.error ||
    visitedStateRows.error ||
    trips.error ||
    activeTrips.error ||
    stationPhotos.error ||
    latestTrip.error
  ) {
    throw new Error("Dashboard data is temporarily unavailable.");
  }

  return {
    visitedStations: visited.count ?? 0,
    totalStations: allStations.count ?? 0,
    totalVisits: total.count ?? 0,
    visitedStates: new Set((visitedStateRows.data ?? []).map((row) => row.state).filter(Boolean)).size,
    totalTrips: trips.count ?? 0,
    activeTrips: activeTrips.count ?? 0,
    stationPhotos: stationPhotos.count ?? 0,
    tripPhotos: tripPhotos.count ?? 0,
    latestTrip: latestTrip.data
      ? {
          id: latestTrip.data.id,
          name: latestTrip.data.name,
          status: latestTrip.data.status,
          originLabel: latestTrip.data.origin_label,
          destinationLabel: latestTrip.data.destination_label,
          updatedAt: latestTrip.data.updated_at,
        }
      : null,
  };
}

async function findFilteredStationIds(query: string, state: string) {
  const supabase = await createClient();
  const normalizedQuery = query.trim().slice(0, 100);
  const normalizedState = /^[A-Z]{2}$/.test(state) ? state : "";

  if (!normalizedQuery) {
    if (!normalizedState) return null;
    const { data, error } = await supabase
      .from("stations")
      .select("id")
      .eq("state", normalizedState)
      .limit(5_000);
    if (error) throw new Error("Visit filters could not be loaded.");
    return (data ?? []).map((row) => row.id);
  }

  const pattern = `%${normalizedQuery}%`;
  const results = await Promise.all(
    (["name", "city"] as const).map((field) => {
      let builder = supabase.from("stations").select("id").ilike(field, pattern);
      if (normalizedState) builder = builder.eq("state", normalizedState);
      return builder.limit(5_000);
    }),
  );

  if (results.some((result) => result.error)) {
    throw new Error("Visit filters could not be loaded.");
  }

  return [...new Set(results.flatMap((result) => (result.data ?? []).map((row) => row.id)))];
}

export async function getAdminVisits(filters: VisitFilters): Promise<VisitPage> {
  const perPage = 24;
  const page = Math.max(1, Math.trunc(filters.page) || 1);
  const stationIds = await findFilteredStationIds(filters.query, filters.state);

  if (stationIds?.length === 0) {
    return { visits: [], total: 0, page, pageCount: 1 };
  }

  const supabase = await createClient();
  let builder = supabase
    .from("station_visits")
    .select(VISIT_SUMMARY_COLUMNS, { count: "exact" })
    .order("checked_in_at", { ascending: false });

  if (stationIds) builder = builder.in("station_id", stationIds);
  if (filters.visibility !== "all") {
    builder = builder.eq("is_public", filters.visibility === "public");
  }
  if (filters.precision !== "all") {
    builder = builder.eq("checked_in_time_precision", filters.precision);
  }

  const from = (page - 1) * perPage;
  const { data, error, count } = await builder.range(from, from + perPage - 1);

  if (error) throw new Error("Visits are temporarily unavailable.");

  const total = count ?? 0;
  return {
    visits: ((data ?? []) as unknown as VisitQueryRow[]).map(mapVisit),
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / perPage)),
  };
}

export async function getAdminVisitDetail(visitId: string): Promise<AdminVisitDetail | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("station_visits")
    .select(`
      ${VISIT_SUMMARY_COLUMNS},
      notes,
      visit_photos(id)
    `)
    .eq("id", visitId)
    .maybeSingle();

  if (error) throw new Error("The visit could not be loaded.");
  if (!data) return null;

  const row = data as unknown as VisitQueryRow;
  const summary = mapVisit(row);
  const station = firstRelation(row.station);
  const session = nullableFirstRelation(row.charging_session);

  return {
    ...summary,
    address: station.address,
    postalCode: station.postal_code,
    notes: row.notes ?? null,
    recordedLatitude: row.recorded_latitude,
    recordedLongitude: row.recorded_longitude,
    chargingMinutes: session?.charging_minutes ?? null,
    pricePerKwh: session?.price_per_kwh ?? null,
    startedAt: session?.started_at ?? null,
    hasPhotos: (row.visit_photos?.length ?? 0) > 0,
  };
}
