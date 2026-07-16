import "server-only";

import { requireAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import type { Tables } from "@/types/database";
import {
  expandedRouteBoundingBoxes,
  sortCorridorCandidates,
  stationCorridorCandidate,
  type CorridorCandidate,
  type RouteCorridorLeg,
} from "./corridor";
import {
  isStationEligibleForTripPlanning,
  type TripPlanningStation,
  type TripStationExclusionReason,
} from "./station-eligibility";

const QUERY_PAGE_SIZE = 500;
const MAX_QUERY_PAGES = 20;

type StationRow = Tables<"stations">;

export interface CandidateDiscoveryAudit {
  totalStationRowsConsidered: number;
  excludedVisitedCount: number;
  excludedInvalidCount: number;
  excludedOperationalCount: number;
  excludedEndpointCount: number;
  excludedDuplicateCount: number;
  excludedOutsideBoundingBoxCount: number;
  excludedOutOfCorridorCount: number;
  corridorCandidateCount: number;
  candidateQueryLimitReached: boolean;
}

export interface CandidateDiscoveryResult {
  candidates: CorridorCandidate[];
  audit: CandidateDiscoveryAudit;
}

function mapStation(row: StationRow): TripPlanningStation {
  return {
    id: row.id,
    externalId: row.external_id,
    name: row.name,
    address: row.address,
    city: row.city,
    state: row.state,
    postalCode: row.postal_code,
    country: row.country,
    latitude: row.latitude,
    longitude: row.longitude,
    operationalStatus: row.operational_status,
    stallCount: row.stall_count,
    maxPowerKw: row.max_power_kw,
  };
}

function exclusionCounter(audit: CandidateDiscoveryAudit, reason: TripStationExclusionReason) {
  if (reason === "visited") audit.excludedVisitedCount += 1;
  else if (reason === "invalid") audit.excludedInvalidCount += 1;
  else if (reason === "operational") audit.excludedOperationalCount += 1;
  else if (reason === "endpoint") audit.excludedEndpointCount += 1;
  else audit.excludedDuplicateCount += 1;
}

export async function discoverTripCorridorCandidates(input: {
  legs: RouteCorridorLeg[];
  corridorMiles: number;
  endpointStationIds: ReadonlySet<string>;
  existingNonAlgorithmStopStationIds: ReadonlySet<string>;
}): Promise<CandidateDiscoveryResult> {
  const admin = await requireAdmin();
  const supabase = await createClient();
  const audit: CandidateDiscoveryAudit = {
    totalStationRowsConsidered: 0,
    excludedVisitedCount: 0,
    excludedInvalidCount: 0,
    excludedOperationalCount: 0,
    excludedEndpointCount: 0,
    excludedDuplicateCount: 0,
    excludedOutsideBoundingBoxCount: 0,
    excludedOutOfCorridorCount: 0,
    corridorCandidateCount: 0,
    candidateQueryLimitReached: false,
  };

  const { count: totalCount, error: totalError } = await supabase
    .from("stations")
    .select("id", { count: "exact", head: true });
  if (totalError) throw new Error("Station inventory could not be counted.");
  audit.totalStationRowsConsidered = totalCount ?? 0;

  const visitedStationIds = new Set<string>();
  for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
    const from = page * QUERY_PAGE_SIZE;
    const { data, error } = await supabase
      .from("station_visits")
      .select("station_id")
      .eq("user_id", admin.id)
      .order("id", { ascending: true })
      .range(from, from + QUERY_PAGE_SIZE - 1);
    if (error) throw new Error("Visit history could not be checked safely.");
    for (const row of data ?? []) visitedStationIds.add(row.station_id);
    if ((data?.length ?? 0) < QUERY_PAGE_SIZE) break;
    if (page === MAX_QUERY_PAGES - 1) audit.candidateQueryLimitReached = true;
  }

  const boxes = expandedRouteBoundingBoxes(input.legs, input.corridorMiles);
  const stationRows = new Map<string, StationRow>();
  for (const box of boxes) {
    for (let page = 0; page < MAX_QUERY_PAGES; page += 1) {
      const from = page * QUERY_PAGE_SIZE;
      const { data, error } = await supabase
        .from("stations")
        .select("*")
        .gte("latitude", box.minLatitude)
        .lte("latitude", box.maxLatitude)
        .gte("longitude", box.minLongitude)
        .lte("longitude", box.maxLongitude)
        .order("id", { ascending: true })
        .range(from, from + QUERY_PAGE_SIZE - 1);
      if (error) throw new Error("Supercharger candidates could not be loaded.");
      for (const row of data ?? []) stationRows.set(row.id, row);
      if ((data?.length ?? 0) < QUERY_PAGE_SIZE) break;
      if (page === MAX_QUERY_PAGES - 1) audit.candidateQueryLimitReached = true;
    }
  }
  audit.excludedOutsideBoundingBoxCount = Math.max(0, audit.totalStationRowsConsidered - stationRows.size);

  const candidates: CorridorCandidate[] = [];
  const context = {
    visitedStationIds,
    endpointStationIds: input.endpointStationIds,
    existingStopStationIds: input.existingNonAlgorithmStopStationIds,
  };
  for (const row of [...stationRows.values()].sort((left, right) => left.id.localeCompare(right.id))) {
    const station = mapStation(row);
    const eligibility = isStationEligibleForTripPlanning(station, context);
    if (!eligibility.eligible) {
      exclusionCounter(audit, eligibility.reason);
      continue;
    }
    const candidate = stationCorridorCandidate(station, input.legs, input.corridorMiles);
    if (!candidate) {
      audit.excludedOutOfCorridorCount += 1;
      continue;
    }
    candidates.push(candidate);
  }
  const sorted = sortCorridorCandidates(candidates);
  audit.corridorCandidateCount = sorted.length;
  return { candidates: sorted, audit };
}
