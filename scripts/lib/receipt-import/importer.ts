import type {
  ExistingVisitRow,
  NormalizedReceiptRecord,
  ReceiptImportPlanRecord,
} from "./types";

export interface ReceiptImportPlan {
  records: ReceiptImportPlanRecord[];
  duplicateReceiptsDetected: number;
  duplicateConflicts: number;
  newVisits: number;
  existingVisits: number;
  newChargingSessions: number;
  existingChargingSessions: number;
}

function sameInstant(left: string, right: string) {
  return Date.parse(left) === Date.parse(right);
}

export function buildReceiptImportPlan({
  records,
  existingVisits,
  existingChargingSessionVisitIds,
  importUserId,
}: {
  records: NormalizedReceiptRecord[];
  existingVisits: ExistingVisitRow[];
  existingChargingSessionVisitIds: ReadonlySet<string>;
  importUserId: string | null;
}): ReceiptImportPlan {
  const existingVisitIndex = new Map(existingVisits.map((visit) => [visit.id, visit]));
  const fingerprintCounts = new Map<string, number>();
  const eventSignatureVisitIds = new Map<string, Set<string>>();

  for (const record of records) {
    fingerprintCounts.set(
      record.receiptFingerprint,
      (fingerprintCounts.get(record.receiptFingerprint) ?? 0) + 1,
    );
    if (record.stationId && record.startedAtUtc) {
      const signature = [
        record.stationId,
        record.startedAtUtc,
        record.costUsd ?? "null",
      ].join("|");
      const visitIds = eventSignatureVisitIds.get(signature) ?? new Set<string>();
      visitIds.add(record.visitId);
      eventSignatureVisitIds.set(signature, visitIds);
    }
  }

  const duplicateFingerprints = new Set(
    [...fingerprintCounts].filter(([, count]) => count > 1).map(([fingerprint]) => fingerprint),
  );
  const conflictingEventVisitIds = new Set(
    [...eventSignatureVisitIds.values()]
      .filter((visitIds) => visitIds.size > 1)
      .flatMap((visitIds) => [...visitIds]),
  );
  let duplicateConflicts = 0;

  const planned = records.map((record): ReceiptImportPlanRecord => {
    const existingVisit = existingVisitIndex.get(record.visitId);
    const errors = record.error ? [record.error] : [];
    let status = record.status;

    if (duplicateFingerprints.has(record.receiptFingerprint)) {
      errors.push("Duplicate Receipt fingerprint detected in the same input.");
      status = "conflict";
      duplicateConflicts += 1;
    }
    if (conflictingEventVisitIds.has(record.visitId)) {
      errors.push("Different Receipts share station, start time, and amount; manual review is required.");
      status = "conflict";
      duplicateConflicts += 1;
    }
    if (existingVisit && record.stationId && existingVisit.station_id !== record.stationId) {
      errors.push("Existing visitId belongs to a different station_id.");
      status = "conflict";
      duplicateConflicts += 1;
    }
    if (existingVisit && importUserId && existingVisit.user_id !== importUserId) {
      errors.push("Existing visitId belongs to a different user_id.");
      status = "conflict";
      duplicateConflicts += 1;
    }
    if (
      existingVisit
      && record.visitAnchorAtUtc
      && !sameInstant(existingVisit.checked_in_at, record.visitAnchorAtUtc)
    ) {
      errors.push("Existing visitId has a different checked_in_at timestamp.");
      status = "conflict";
      duplicateConflicts += 1;
    }
    if (
      existingVisit
      && existingVisit.checked_in_time_precision !== record.checkedInTimePrecision
    ) {
      errors.push("Existing visitId has a different checked_in_time_precision.");
      status = "conflict";
      duplicateConflicts += 1;
    }

    return {
      ...record,
      status,
      error: errors.length > 0 ? errors.join(" ") : null,
      visitExists: Boolean(existingVisit),
      chargingSessionExists: existingChargingSessionVisitIds.has(record.visitId),
    };
  });

  return {
    records: planned,
    duplicateReceiptsDetected: duplicateFingerprints.size,
    duplicateConflicts,
    newVisits: planned.filter((record) => record.status === "valid" && !record.visitExists).length,
    existingVisits: planned.filter((record) => record.status === "valid" && record.visitExists).length,
    newChargingSessions: planned.filter(
      (record) => record.status === "valid" && !record.chargingSessionExists,
    ).length,
    existingChargingSessions: planned.filter(
      (record) => record.status === "valid" && record.chargingSessionExists,
    ).length,
  };
}

export interface ReceiptRpcArguments {
  p_visit_id: string;
  p_station_id: string;
  p_user_id: string;
  p_checked_in_at: string;
  p_checked_in_timezone: string;
  p_checked_in_time_precision: "exact" | "date_only";
  p_session_started_at: string | null;
  p_is_public: boolean;
  p_energy_kwh: number | null;
  p_cost_usd: number | null;
  p_charging_minutes: number | null;
  p_price_per_kwh: number | null;
}

export function mapReceiptToRpcArguments(
  record: ReceiptImportPlanRecord,
  importUserId: string,
): ReceiptRpcArguments {
  if (
    record.status !== "valid"
    || !record.stationId
    || !record.visitAnchorAtUtc
    || !record.timezone
  ) {
    throw new Error(`Receipt ${record.sourceFile} is not valid for Apply.`);
  }

  return {
    p_visit_id: record.visitId,
    p_station_id: record.stationId,
    p_user_id: importUserId,
    p_checked_in_at: record.visitAnchorAtUtc,
    p_checked_in_timezone: record.timezone,
    p_checked_in_time_precision: record.checkedInTimePrecision,
    p_session_started_at: record.startedAtUtc,
    p_is_public: true,
    p_energy_kwh: record.energyKwh,
    p_cost_usd: record.costUsd,
    p_charging_minutes: record.chargingMinutes,
    p_price_per_kwh: record.pricePerKwh,
  };
}

export async function executeReceiptImport({
  records,
  importUserId,
  apply,
  callRpc,
  maxAttempts = 3,
}: {
  records: ReceiptImportPlanRecord[];
  importUserId: string;
  apply: boolean;
  callRpc: (args: ReceiptRpcArguments, record: ReceiptImportPlanRecord) => Promise<void>;
  maxAttempts?: number;
}) {
  if (!apply) {
    return { succeeded: 0, failed: 0 };
  }

  let succeeded = 0;
  for (const record of records) {
    const args = mapReceiptToRpcArguments(record, importUserId);
    let lastError: unknown;

    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
      try {
        await callRpc(args, record);
        succeeded += 1;
        lastError = undefined;
        break;
      } catch (error) {
        lastError = error;
        const transient = typeof error === "object"
          && error !== null
          && "transient" in error
          && (error as { transient?: unknown }).transient === true;
        if (!transient || attempt === maxAttempts) {
          break;
        }
      }
    }

    if (lastError) {
      const message = lastError instanceof Error ? lastError.message : "Unknown RPC error";
      throw new Error(
        `${record.sourceFile} page ${record.sourcePage}: import failed: ${message.slice(0, 400)}`,
      );
    }
  }

  return { succeeded, failed: 0 };
}
