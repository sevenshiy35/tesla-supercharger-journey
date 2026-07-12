import { z } from "zod";
import type { ManualStationDefinition, ManualStationSource } from "../data/manual-stations";
import type { StationUpsertRow } from "./station-sync";

export interface ManualStationUpsertRow {
  external_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string;
  country: "US";
  latitude: number;
  longitude: number;
  stall_count: number | null;
  max_power_kw: number | null;
  operational_status: "open";
  source: ManualStationSource;
  source_updated_at: string | null;
}

const manualStationRowSchema = z.object({
  external_id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().regex(/^[A-Z]{2}$/),
  postal_code: z.string().regex(/^\d{5}$/),
  country: z.literal("US"),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  stall_count: z.number().int().positive().nullable(),
  max_power_kw: z.number().int().positive().nullable(),
  operational_status: z.literal("open"),
  source: z.enum(["tesla_official", "tesla_receipt_verified"]),
  source_updated_at: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), "must be a valid date")
    .nullable(),
});

export function mapManualStationToUpsertRow(
  station: ManualStationDefinition,
): ManualStationUpsertRow {
  return manualStationRowSchema.parse({
    external_id: station.externalId.trim(),
    name: station.name.trim(),
    address: station.address.trim(),
    city: station.city.trim(),
    state: station.state.trim().toUpperCase(),
    postal_code: station.postalCode.trim(),
    country: station.country,
    latitude: station.latitude,
    longitude: station.longitude,
    stall_count: station.stallCount,
    max_power_kw: station.maxPowerKw,
    operational_status: station.operationalStatus,
    source: station.source,
    source_updated_at: station.sourceUpdatedAt,
  });
}

export interface ManualStationSyncPlan {
  rows: ManualStationUpsertRow[];
  newCount: number;
  updatedCount: number;
}

export function buildManualStationSyncPlan(
  stations: readonly ManualStationDefinition[],
  existingExternalIds: ReadonlySet<string>,
): ManualStationSyncPlan {
  const rows = stations.map(mapManualStationToUpsertRow);
  const externalIds = new Set(rows.map((row) => row.external_id));

  if (externalIds.size !== rows.length) {
    throw new Error("Manual station definitions contain a duplicate external_id.");
  }

  const newCount = rows.filter((row) => !existingExternalIds.has(row.external_id)).length;
  return { rows, newCount, updatedCount: rows.length - newCount };
}

export async function executeManualStationWrites({
  rows,
  apply,
  writeRows,
}: {
  rows: ManualStationUpsertRow[];
  apply: boolean;
  writeRows: (rows: ManualStationUpsertRow[]) => Promise<void>;
}) {
  if (!apply) {
    return { succeeded: 0, failed: 0 };
  }

  await writeRows(rows);
  return { succeeded: rows.length, failed: 0 };
}

/**
 * Review-only helper for a future confirmed NLR adoption. The caller updates by
 * station UUID and must never replace that UUID, preserving visits and photos.
 */
export function buildConfirmedNlrAdoptionPlan(
  stationId: string,
  confirmedNlrRow: StationUpsertRow,
) {
  return {
    stationId,
    changes: {
      external_id: confirmedNlrRow.external_id,
      name: confirmedNlrRow.name,
      address: confirmedNlrRow.address,
      city: confirmedNlrRow.city,
      state: confirmedNlrRow.state,
      postal_code: confirmedNlrRow.postal_code,
      latitude: confirmedNlrRow.latitude,
      longitude: confirmedNlrRow.longitude,
      stall_count: confirmedNlrRow.stall_count,
      max_power_kw: confirmedNlrRow.max_power_kw,
      operational_status: confirmedNlrRow.operational_status,
      source: confirmedNlrRow.source,
      source_updated_at: confirmedNlrRow.source_updated_at,
    },
  };
}
