import { z } from "zod";
import type { SuperchargerStation } from "../../src/types/station";
import { readAllPages } from "../../src/lib/stations/pagination";

export interface SyncArguments {
  apply: boolean;
  batchSize: number;
  limit?: number;
}

function parsePositiveInteger(name: string, value: string, maximum?: number) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0 || (maximum !== undefined && parsed > maximum)) {
    throw new Error(`${name} must be a positive integer${maximum ? ` no greater than ${maximum}` : ""}.`);
  }
  return parsed;
}

export function parseSyncArguments(args: string[]): SyncArguments {
  let apply = false;
  let explicitlyDry = false;
  let batchSize = 300;
  let limit: number | undefined;

  for (const argument of args) {
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--dry-run") {
      explicitlyDry = true;
    } else if (argument.startsWith("--batch-size=")) {
      batchSize = parsePositiveInteger("--batch-size", argument.slice("--batch-size=".length), 500);
    } else if (argument.startsWith("--limit=")) {
      limit = parsePositiveInteger("--limit", argument.slice("--limit=".length));
    } else {
      throw new Error(`Unknown station sync argument: ${argument}`);
    }
  }

  if (apply && explicitlyDry) {
    throw new Error("Choose either --apply or --dry-run, not both.");
  }

  return { apply, batchSize, limit };
}

export interface StationUpsertRow {
  external_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string | null;
  country: "US";
  latitude: number;
  longitude: number;
  stall_count: number | null;
  max_power_kw: number | null;
  operational_status: string;
  source: "nlr";
  source_updated_at: string | null;
}

const stationUpsertRowSchema = z.object({
  external_id: z.string().trim().min(1),
  name: z.string().trim().min(1),
  address: z.string().trim().min(1),
  city: z.string().trim().min(1),
  state: z.string().regex(/^[A-Z]{2}$/),
  postal_code: z.string().trim().min(1).nullable(),
  country: z.literal("US"),
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
  stall_count: z.number().int().nonnegative().nullable(),
  max_power_kw: z.number().int().nonnegative().nullable(),
  operational_status: z.string().trim().min(1),
  source: z.literal("nlr"),
  source_updated_at: z
    .string()
    .refine((value) => Number.isFinite(Date.parse(value)), "must be a valid date")
    .nullable(),
});

export interface PreparedStationRows {
  rows: StationUpsertRow[];
  rejected: number;
  duplicatesRemoved: number;
  rejectionExamples: string[];
}

export function mapNlrStationToUpsertRow(station: SuperchargerStation): StationUpsertRow {
  return {
    external_id: station.externalId.trim(),
    name: station.name.trim(),
    address: station.address.trim(),
    city: station.city.trim(),
    state: station.state.trim().toUpperCase(),
    postal_code: station.postalCode?.trim() || null,
    country: "US",
    latitude: station.latitude,
    longitude: station.longitude,
    stall_count: station.stallCount ?? null,
    max_power_kw:
      station.maxPowerKw === undefined ? null : Math.round(station.maxPowerKw),
    operational_status: station.operationalStatus ?? "unknown",
    source: "nlr",
    source_updated_at: station.lastUpdated.trim() || null,
  };
}

export function prepareStationUpsertRows(
  stations: SuperchargerStation[],
): PreparedStationRows {
  const rows: StationUpsertRow[] = [];
  const externalIds = new Set<string>();
  const rejectionExamples: string[] = [];
  let rejected = 0;
  let duplicatesRemoved = 0;

  for (const station of stations) {
    const candidate = mapNlrStationToUpsertRow(station);
    const parsed = stationUpsertRowSchema.safeParse(candidate);

    if (!parsed.success) {
      rejected += 1;
      if (rejectionExamples.length < 10) {
        const issue = parsed.error.issues[0];
        rejectionExamples.push(
          `Station ${candidate.external_id || "(missing external_id)"}: ${issue?.path.join(".") || "row"} ${issue?.message || "is invalid"}`,
        );
      }
      continue;
    }

    if (externalIds.has(parsed.data.external_id)) {
      duplicatesRemoved += 1;
      continue;
    }

    externalIds.add(parsed.data.external_id);
    rows.push(parsed.data);
  }

  return { rows, rejected, duplicatesRemoved, rejectionExamples };
}

export async function readExistingExternalIds(
  fetchPage: (from: number, to: number) => Promise<string[]>,
) {
  const values = await readAllPages(fetchPage, { pageSize: 1_000, maxPages: 20 });
  return new Set(values);
}

export interface ExistingStationReference {
  externalId: string;
  source: string;
}

export async function readExistingStationReferences(
  fetchPage: (from: number, to: number) => Promise<ExistingStationReference[]>,
) {
  return readAllPages(fetchPage, { pageSize: 1_000, maxPages: 20 });
}

export interface StationSyncPlan {
  rows: StationUpsertRow[];
  newCount: number;
  updatedCount: number;
  missingFromSourceCount: number;
}

export function buildStationSyncPlan(
  selectedRows: StationUpsertRow[],
  allSourceRows: StationUpsertRow[],
  existingExternalIds: ReadonlySet<string>,
  existingSourceExternalIds: ReadonlySet<string> = existingExternalIds,
): StationSyncPlan {
  const sourceExternalIds = new Set(allSourceRows.map((row) => row.external_id));
  const newCount = selectedRows.filter((row) => !existingExternalIds.has(row.external_id)).length;

  return {
    rows: selectedRows,
    newCount,
    updatedCount: selectedRows.length - newCount,
    missingFromSourceCount: [...existingSourceExternalIds].filter((id) => !sourceExternalIds.has(id)).length,
  };
}

export interface BatchWriteError extends Error {
  status?: number;
}

export type StationBatchWriter = (
  rows: StationUpsertRow[],
  batchStart: number,
  batchEnd: number,
) => Promise<void>;

const wait = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function isTransientError(error: unknown) {
  const status = typeof error === "object" && error !== null && "status" in error
    ? Number((error as { status?: unknown }).status)
    : undefined;
  return status === undefined || status === 429 || [502, 503, 504].includes(status);
}

export async function executeStationWrites({
  rows,
  apply,
  batchSize,
  writeBatch,
  maxAttempts = 3,
  baseDelayMs = 500,
  onRetry,
}: {
  rows: StationUpsertRow[];
  apply: boolean;
  batchSize: number;
  writeBatch: StationBatchWriter;
  maxAttempts?: number;
  baseDelayMs?: number;
  onRetry?: (message: string) => void;
}) {
  if (!apply) {
    return { succeeded: 0, failed: 0 };
  }

  let succeeded = 0;

  for (let start = 0; start < rows.length; start += batchSize) {
    const batch = rows.slice(start, start + batchSize);
    const end = start + batch.length - 1;
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await writeBatch(batch, start, end);
        succeeded += batch.length;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        if (attempt === maxAttempts || !isTransientError(error)) {
          break;
        }
        const delay = baseDelayMs * 2 ** (attempt - 1);
        onRetry?.(`Retrying batch ${start + 1}-${end + 1} in ${delay}ms (attempt ${attempt + 1}/${maxAttempts}).`);
        await wait(delay);
      }
    }

    if (lastError) {
      const message = lastError instanceof Error ? lastError.message : "Unknown batch error";
      throw new Error(`Batch ${start + 1}-${end + 1} failed: ${message.slice(0, 500)}`);
    }
  }

  return { succeeded, failed: 0 };
}
