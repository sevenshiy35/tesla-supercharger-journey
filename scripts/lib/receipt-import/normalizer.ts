import { normalizeAddress } from "../../../src/lib/stations/address-normalization";
import {
  createReceiptFingerprint,
  createReceiptVisitId,
} from "./fingerprint";
import { canonicalizeReceiptStreetAddress, matchReceiptToStation } from "./matcher";
import { localDateNoonToUtc, localDateTimeToUtc, lookupTimezone } from "./timezone";
import type {
  NormalizedReceiptRecord,
  ParsedReceiptRecord,
  ReceiptStationRow,
  ReceiptTimeOverride,
} from "./types";

export function normalizeReceiptRecord(
  receipt: ParsedReceiptRecord,
  stations: ReceiptStationRow[],
  timeOverrides: ReadonlyMap<string, ReceiptTimeOverride>,
): NormalizedReceiptRecord {
  const match = matchReceiptToStation(receipt, stations);
  const station = match.status === "matched" ? match.candidates[0] : undefined;
  const stationExternalId = station?.external_id ?? match.expectedExternalId;
  const timeOverride = receipt.sourceReceiptId
    ? timeOverrides.get(receipt.sourceReceiptId)
    : undefined;
  const localStartedAt = timeOverride?.localStartedAt.trim() || null;
  const eventDate = receipt.eventDate?.trim() ?? "";
  const errors: string[] = [];
  let timezone: string | null = null;
  let startedAtUtc: string | null = null;
  let visitAnchorAtUtc = "";
  const checkedInTimePrecision = localStartedAt ? "exact" : "date_only";
  let status: NormalizedReceiptRecord["status"] = "valid";

  if (station) {
    try {
      timezone = timeOverride?.timezone?.trim()
        || lookupTimezone(station.latitude, station.longitude);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Timezone lookup failed.");
    }
  }

  if (!eventDate) {
    errors.push("Receipt event date is required.");
  } else if (localStartedAt) {
    if (!localStartedAt.startsWith(`${eventDate}T`)) {
      errors.push("Reviewed start time date conflicts with the Receipt event date.");
      status = "conflict";
    }
    if (timezone) {
      try {
        startedAtUtc = localDateTimeToUtc(localStartedAt, timezone);
        visitAnchorAtUtc = startedAtUtc;
      } catch (error) {
        errors.push(error instanceof Error ? error.message : "UTC conversion failed.");
      }
    }
  } else if (timezone) {
    try {
      visitAnchorAtUtc = localDateNoonToUtc(eventDate, timezone);
    } catch (error) {
      errors.push(error instanceof Error ? error.message : "Date-only anchor conversion failed.");
    }
  }

  if (match.status === "unmatched") {
    status = "unmatched";
    errors.unshift(match.error ?? "Receipt station is unmatched.");
  } else if (match.status === "ambiguous") {
    status = "ambiguous";
    errors.unshift(match.error ?? "Receipt station match is ambiguous.");
  } else if (status !== "conflict" && errors.length > 0) {
    status = "invalid";
  }

  const fingerprint = createReceiptFingerprint({
    sourceReceiptId: receipt.sourceReceiptId,
    stationExternalId: stationExternalId ?? "unmatched",
    startedAtUtc: (startedAtUtc ?? visitAnchorAtUtc) || "missing",
    energyKwh: receipt.energyKwh,
    costUsd: receipt.costUsd,
    chargingMinutes: receipt.chargingMinutes,
    sourceFile: receipt.sourceFile,
    sourcePage: receipt.sourcePage,
  });

  return {
    sourceFile: receipt.sourceFile,
    sourcePage: receipt.sourcePage,
    sourceReceiptId: receipt.sourceReceiptId,
    referenceId: receipt.referenceId,
    rawLocation: receipt.rawLocation,
    eventDate,
    normalizedAddress: normalizeAddress(
      `${canonicalizeReceiptStreetAddress(receipt.streetAddress)} ${receipt.city} ${receipt.state} ${receipt.postalCode}`,
    ),
    stationExternalId,
    stationId: station?.id ?? null,
    localStartedAt,
    timezone,
    startedAtUtc,
    visitAnchorAtUtc,
    checkedInTimePrecision,
    energyKwh: receipt.energyKwh,
    costUsd: receipt.costUsd,
    chargingMinutes: receipt.chargingMinutes,
    pricePerKwh: receipt.pricePerKwh,
    receiptFingerprint: fingerprint,
    visitId: createReceiptVisitId(fingerprint),
    status,
    matchMethod: match.method,
    error: errors.length > 0 ? errors.join(" ") : null,
  };
}

export function normalizeReceiptRecords(
  receipts: ParsedReceiptRecord[],
  stations: ReceiptStationRow[],
  timeOverrides: ReadonlyMap<string, ReceiptTimeOverride>,
) {
  return receipts.map((receipt) => normalizeReceiptRecord(receipt, stations, timeOverrides));
}
