import type { Tables } from "@/types/database";
import type {
  TripEndpointSource,
  TripPlan,
  TripPlanSegment,
  TripPlanStatus,
  TripPlanStop,
  TripPlanSummary,
  TripType,
} from "./types";
import { sanitizeLineString } from "@/lib/mapbox/geometry";

type TripPlanRow = Tables<"trip_plans">;
type TripPlanStopRow = Tables<"trip_plan_stops">;
type TripPlanSegmentRow = Tables<"trip_plan_segments">;

export interface TripPlanSummaryRow {
  id: string;
  name: string | null;
  trip_type: string;
  status: string;
  origin_label: string | null;
  destination_label: string | null;
  planned_distance_meters: number | null;
  updated_at: string;
  trip_plan_stops: Array<{ count: number }>;
}

function asTripType(value: string): TripType {
  return value === "round_trip" ? "round_trip" : "one_way";
}

function asTripStatus(value: string): TripPlanStatus {
  return value === "confirmed" ||
    value === "active" ||
    value === "completed" ||
    value === "archived"
    ? value
    : "draft";
}

function asEndpointSource(value: string | null): TripEndpointSource | null {
  return value === "mapbox" || value === "current_location" || value === "station" ? value : null;
}

export function mapTripPlan(row: TripPlanRow): TripPlan {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    tripType: asTripType(row.trip_type),
    status: asTripStatus(row.status),
    originSource: asEndpointSource(row.origin_source),
    originLabel: row.origin_label,
    originFullAddress: row.origin_full_address,
    originLatitude: row.origin_latitude,
    originLongitude: row.origin_longitude,
    originStationId: row.origin_station_id,
    originProviderId: row.origin_provider_id,
    destinationSource: asEndpointSource(row.destination_source),
    destinationLabel: row.destination_label,
    destinationFullAddress: row.destination_full_address,
    destinationLatitude: row.destination_latitude,
    destinationLongitude: row.destination_longitude,
    destinationStationId: row.destination_station_id,
    destinationProviderId: row.destination_provider_id,
    routeInputRevision: Number(row.route_input_revision),
    corridorMiles: row.corridor_miles,
    maxExtraMinutes: row.max_extra_minutes,
    maxExtraMiles: row.max_extra_miles,
    maxStops: row.max_stops,
    stopDurationMinutes: row.stop_duration_minutes,
    routeProvider: row.route_provider,
    algorithmVersion: row.algorithm_version,
    baseDistanceMeters: row.base_distance_meters,
    baseDurationSeconds: row.base_duration_seconds,
    plannedDistanceMeters: row.planned_distance_meters,
    plannedDriveSeconds: row.planned_drive_seconds,
    plannedStopSeconds: row.planned_stop_seconds,
    extraDistanceMeters: row.extra_distance_meters,
    extraDurationSeconds: row.extra_duration_seconds,
    corridorCandidateCount: row.corridor_candidate_count ?? null,
    evaluatedCandidateCount: row.evaluated_candidate_count ?? null,
    unreachableCandidateCount: row.unreachable_candidate_count ?? null,
    technicalLimitReached: row.technical_limit_reached ?? false,
    technicalLimitReason: row.technical_limit_reason ?? null,
    plannedRouteStale: row.planned_route_stale ?? false,
    routeCalculatedAt: row.route_calculated_at,
    isPublic: row.is_public,
    showOnHomepage: row.show_on_homepage,
    confirmedAt: row.confirmed_at,
    activatedAt: row.activated_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTripPlanSummary(row: TripPlanSummaryRow): TripPlanSummary {
  return {
    id: row.id,
    name: row.name,
    tripType: asTripType(row.trip_type),
    status: asTripStatus(row.status),
    originLabel: row.origin_label,
    destinationLabel: row.destination_label,
    stopCount: row.trip_plan_stops[0]?.count ?? 0,
    plannedDistanceMeters: row.planned_distance_meters,
    updatedAt: row.updated_at,
  };
}

export function mapTripPlanStop(row: TripPlanStopRow): TripPlanStop {
  return {
    id: row.id,
    tripPlanId: row.trip_plan_id,
    stationId: row.station_id,
    sequence: row.sequence,
    leg: row.leg === "return" ? "return" : "outbound",
    source: row.source === "manual" ? "manual" : "algorithm",
    isLocked: row.is_locked,
    status: row.status === "visited" || row.status === "skipped" ? row.status : "planned",
    estimatedArrivalAt: row.estimated_arrival_at,
    estimatedDetourSeconds: row.estimated_detour_seconds,
    estimatedDetourMeters: row.estimated_detour_meters,
    corridorDistanceMeters: row.corridor_distance_meters ?? null,
    routeProgress: row.route_progress ?? null,
    selectionRank: row.selection_rank ?? null,
    visitId: row.visit_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function mapTripPlanSegment(row: TripPlanSegmentRow): TripPlanSegment {
  const geometry = sanitizeLineString(row.geometry);

  return {
    id: row.id,
    tripPlanId: row.trip_plan_id,
    segmentIndex: row.segment_index,
    leg: row.leg === "return" ? "return" : "outbound",
    startSequence: row.start_sequence,
    endSequence: row.end_sequence,
    provider: row.provider,
    distanceMeters: row.distance_meters,
    durationSeconds: row.duration_seconds,
    geometry,
    routeKind: row.route_kind === "planned" ? "planned" : "base",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
