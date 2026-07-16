import { z } from "zod";
import type { OperationalStatus, SuperchargerStation } from "@/types/station";

const nullableString = z.string().nullable().optional();
const nullableNumber = z.number().nullable().optional();

const nlrConnectorSchema = z.object({
  power_kw: nullableNumber,
  port_count: nullableNumber,
});

const nlrChargingUnitSchema = z.object({
  network: nullableString,
  connectors: z.record(z.string(), nlrConnectorSchema).nullable().optional(),
});

export const nlrStationSchema = z.object({
  id: z.number().int().positive(),
  station_name: nullableString,
  street_address: nullableString,
  city: nullableString,
  state: nullableString,
  zip: nullableString,
  latitude: nullableNumber,
  longitude: nullableNumber,
  status_code: nullableString,
  ev_dc_fast_num: z.number().int().nonnegative().nullable().optional(),
  open_date: nullableString,
  updated_at: nullableString,
  ev_charging_units: z.array(nlrChargingUnitSchema).nullable().optional(),
});

export const nlrStationsResponseSchema = z.object({
  total_results: z.number().int().nonnegative().optional(),
  fuel_stations: z.array(nlrStationSchema),
});

export type NlrStation = z.infer<typeof nlrStationSchema>;

function cleanText(value: string | null | undefined, fallback: string) {
  const cleaned = value?.trim();
  return cleaned || fallback;
}

function toOperationalStatus(statusCode: string | null | undefined): OperationalStatus {
  switch (statusCode) {
    case "E":
      return "available";
    case "P":
      return "planned";
    case "T":
      return "temporarily-unavailable";
    default:
      return "unknown";
  }
}

function getTeslaMaxPowerKw(units: NlrStation["ev_charging_units"]) {
  const powerValues = (units ?? [])
    .filter((unit) => unit.network?.trim().toLowerCase() === "tesla")
    .flatMap((unit) => Object.values(unit.connectors ?? {}))
    .map((connector) => connector.power_kw)
    .filter((power): power is number => typeof power === "number" && Number.isFinite(power) && power > 0);

  return powerValues.length > 0 ? Math.max(...powerValues) : undefined;
}

export function mapNlrStation(
  station: NlrStation,
  visitedExternalIds: ReadonlySet<string>,
): SuperchargerStation | null {
  const { latitude, longitude } = station;

  if (
    typeof latitude !== "number" ||
    !Number.isFinite(latitude) ||
    latitude < -90 ||
    latitude > 90 ||
    typeof longitude !== "number" ||
    !Number.isFinite(longitude) ||
    longitude < -180 ||
    longitude > 180
  ) {
    return null;
  }

  const externalId = String(station.id);
  return {
    id: `nlr-${externalId}`,
    externalId,
    name: cleanText(station.station_name, "Tesla Supercharger"),
    address: cleanText(station.street_address, "Address unavailable"),
    city: cleanText(station.city, "Unknown city"),
    state: cleanText(station.state, "US").toUpperCase(),
    postalCode: station.zip?.trim() || undefined,
    latitude,
    longitude,
    status: visitedExternalIds.has(externalId) ? "visited" : "unvisited",
    operationalStatus: toOperationalStatus(station.status_code),
    stallCount: station.ev_dc_fast_num ?? undefined,
    maxPowerKw: getTeslaMaxPowerKw(station.ev_charging_units),
    openDate: station.open_date?.trim() || undefined,
    lastUpdated: station.updated_at?.trim() || "",
  };
}

function stationFingerprint(station: SuperchargerStation) {
  const normalize = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ");

  return [
    normalize(station.name),
    normalize(station.address),
    normalize(station.city),
    station.state,
    station.latitude.toFixed(5),
    station.longitude.toFixed(5),
  ].join("|");
}

export interface NormalizedNlrStationsResult {
  stations: SuperchargerStation[];
  rejected: number;
  duplicatesRemoved: number;
  rejectionExamples: string[];
}

export function normalizeNlrStationsDetailed(
  stations: NlrStation[],
  visitedExternalIds: readonly string[],
): NormalizedNlrStationsResult {
  const visitedIds = new Set(visitedExternalIds);
  const seenExternalIds = new Set<string>();
  const seenFingerprints = new Set<string>();
  const normalized: SuperchargerStation[] = [];
  const rejectionExamples: string[] = [];
  let rejected = 0;
  let duplicatesRemoved = 0;

  for (const rawStation of stations) {
    const station = mapNlrStation(rawStation, visitedIds);

    if (!station) {
      rejected += 1;
      if (rejectionExamples.length < 10) {
        rejectionExamples.push(`NLR station ${rawStation.id} has invalid coordinates.`);
      }
      continue;
    }

    if (seenExternalIds.has(station.externalId)) {
      duplicatesRemoved += 1;
      continue;
    }

    const fingerprint = stationFingerprint(station);

    if (seenFingerprints.has(fingerprint)) {
      duplicatesRemoved += 1;
      continue;
    }

    seenExternalIds.add(station.externalId);
    seenFingerprints.add(fingerprint);
    normalized.push(station);
  }

  return {
    stations: normalized,
    rejected,
    duplicatesRemoved,
    rejectionExamples,
  };
}

export function normalizeNlrStations(
  stations: NlrStation[],
  visitedExternalIds: readonly string[],
) {
  return normalizeNlrStationsDetailed(stations, visitedExternalIds).stations;
}

export function applyVisitedStationIds(
  stations: SuperchargerStation[],
  visitedExternalIds: readonly string[],
) {
  const visitedIds = new Set(visitedExternalIds);

  return stations.map((station) => ({
    ...station,
    status: visitedIds.has(station.externalId) ? "visited" as const : "unvisited" as const,
  }));
}
