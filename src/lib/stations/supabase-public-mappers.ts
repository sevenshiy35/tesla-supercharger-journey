import { z } from "zod";
import { operationalStatusSchema, type SuperchargerStation } from "@/types/station";
import type { Tables } from "@/types/database";
import { StationDataEmptyError, StationDataValidationError } from "./errors";

export type PublicStationStatusRow = Tables<"public_station_status">;

const publicStationStatusRowSchema = z.object({
  id: z.string().min(1),
  external_id: z.string().min(1),
  name: z.string().min(1),
  address: z.string().min(1),
  city: z.string().min(1),
  state: z.string().regex(/^[A-Z]{2}$/),
  postal_code: z.string().nullable(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  stall_count: z.number().int().nonnegative().nullable(),
  max_power_kw: z.number().nonnegative().nullable(),
  operational_status: z.string().min(1),
  source_updated_at: z.string().nullable(),
  visited: z.boolean(),
  latest_visit_at: z.string().nullable(),
});

export function mapPublicStationStatusRowToStation(
  row: PublicStationStatusRow,
): SuperchargerStation {
  const parsed = publicStationStatusRowSchema.safeParse(row);

  if (!parsed.success) {
    throw new StationDataValidationError("A public station row did not match the expected structure.");
  }

  const value = parsed.data;
  const operationalStatus = operationalStatusSchema.safeParse(value.operational_status);

  return {
    id: value.id,
    externalId: value.external_id,
    name: value.name,
    address: value.address,
    city: value.city,
    state: value.state,
    postalCode: value.postal_code ?? undefined,
    latitude: value.latitude,
    longitude: value.longitude,
    status: value.visited ? "visited" : "unvisited",
    operationalStatus: operationalStatus.success ? operationalStatus.data : "unknown",
    stallCount: value.stall_count ?? undefined,
    maxPowerKw: value.max_power_kw ?? undefined,
    visitDate: value.latest_visit_at ?? undefined,
    lastUpdated: value.source_updated_at ?? value.latest_visit_at ?? "",
  };
}

export function mapPublicStationStatusRows(rows: PublicStationStatusRow[]) {
  if (rows.length === 0) {
    throw new StationDataEmptyError(
      "No station data has been imported yet. Run the station synchronization command.",
    );
  }

  const stations = rows.map(mapPublicStationStatusRowToStation);
  const externalIds = new Set<string>();

  for (const station of stations) {
    if (externalIds.has(station.externalId)) {
      throw new StationDataValidationError("The public station view returned a duplicate external_id.");
    }
    externalIds.add(station.externalId);
  }

  return stations;
}
