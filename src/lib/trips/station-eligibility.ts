export interface TripPlanningStation {
  id: string;
  externalId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  country: string;
  latitude: number;
  longitude: number;
  operationalStatus: string;
  stallCount: number | null;
  maxPowerKw: number | null;
}

export interface TripStationEligibilityContext {
  visitedStationIds: ReadonlySet<string>;
  endpointStationIds: ReadonlySet<string>;
  existingStopStationIds: ReadonlySet<string>;
}

export type TripStationExclusionReason =
  | "visited"
  | "invalid"
  | "operational"
  | "endpoint"
  | "duplicate";

const OPERATIONAL_STATUSES = new Set(["available", "open"]);
const US_COUNTRIES = new Set(["US", "USA", "UNITED STATES", "UNITED STATES OF AMERICA"]);

export function isStationEligibleForTripPlanning(
  station: TripPlanningStation,
  context: TripStationEligibilityContext,
): { eligible: true } | { eligible: false; reason: TripStationExclusionReason } {
  if (context.visitedStationIds.has(station.id)) return { eligible: false, reason: "visited" };
  if (
    !station.id || !station.name.trim() || !station.address.trim() || !station.city.trim() ||
    !station.state.trim() || !Number.isFinite(station.latitude) || !Number.isFinite(station.longitude) ||
    station.latitude < -90 || station.latitude > 90 ||
    station.longitude < -180 || station.longitude > 180 ||
    !US_COUNTRIES.has(station.country.trim().toUpperCase())
  ) return { eligible: false, reason: "invalid" };
  if (!OPERATIONAL_STATUSES.has(station.operationalStatus.trim().toLowerCase())) {
    return { eligible: false, reason: "operational" };
  }
  if (context.endpointStationIds.has(station.id)) return { eligible: false, reason: "endpoint" };
  if (context.existingStopStationIds.has(station.id)) return { eligible: false, reason: "duplicate" };
  return { eligible: true };
}
