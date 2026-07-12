import { mkdir, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import {
  haveSameHouseAndStreet,
  normalizeAddress,
} from "../../src/lib/stations/address-normalization";
import type { ManualStationSource } from "../data/manual-stations";
import type { StationUpsertRow } from "./station-sync";

export const MANUAL_STATION_SOURCES: readonly (ManualStationSource | "manual")[] = [
  "tesla_official",
  "tesla_receipt_verified",
  "manual",
];

export interface ManualStationRecord {
  id: string;
  external_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
  source: string;
}

export type ReconciliationReason =
  | "same_address_within_250m"
  | "same_house_street_city_within_500m"
  | "same_address_within_1600m"
  | "nearby_different_address";

export interface ReconciliationCandidate {
  nlrExternalId: string;
  nlrName: string;
  nlrAddress: string;
  manualStationId: string;
  manualExternalId: string;
  manualName: string;
  manualAddress: string;
  distanceMeters: number;
  normalizedAddressMatch: boolean;
  confidence: "high" | "low";
  reason: ReconciliationReason;
  blocksNlrInsert: boolean;
  recommendedAction: "review-and-adopt-existing-uuid" | "review-nearby-stations";
}

export interface StationReconciliationResult {
  rowsToSync: StationUpsertRow[];
  highConfidenceCandidates: ReconciliationCandidate[];
  lowConfidenceCandidates: ReconciliationCandidate[];
  skippedNlrExternalIds: string[];
}

function toRadians(value: number) {
  return value * Math.PI / 180;
}

export function distanceInMeters(
  left: Pick<StationUpsertRow, "latitude" | "longitude">,
  right: Pick<ManualStationRecord, "latitude" | "longitude">,
) {
  const earthRadiusMeters = 6_371_000;
  const latitudeDelta = toRadians(right.latitude - left.latitude);
  const longitudeDelta = toRadians(right.longitude - left.longitude);
  const leftLatitude = toRadians(left.latitude);
  const rightLatitude = toRadians(right.latitude);
  const haversine = Math.sin(latitudeDelta / 2) ** 2
    + Math.cos(leftLatitude)
      * Math.cos(rightLatitude)
      * Math.sin(longitudeDelta / 2) ** 2;

  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(haversine));
}

function classifyCandidate(
  nlrRow: StationUpsertRow,
  manualRow: ManualStationRecord,
): ReconciliationCandidate | null {
  const sameState = nlrRow.state.trim().toUpperCase() === manualRow.state.trim().toUpperCase();
  if (!sameState) {
    return null;
  }

  const distanceMeters = distanceInMeters(nlrRow, manualRow);
  if (distanceMeters > 1_600) {
    return null;
  }

  const sameAddress = normalizeAddress(nlrRow.address) === normalizeAddress(manualRow.address);
  const sameCity = normalizeAddress(nlrRow.city) === normalizeAddress(manualRow.city);
  const sameHouseAndStreet = haveSameHouseAndStreet(nlrRow.address, manualRow.address);
  let confidence: ReconciliationCandidate["confidence"] = "low";
  let reason: ReconciliationReason = "nearby_different_address";
  let blocksNlrInsert = false;

  if (sameAddress && distanceMeters <= 250) {
    confidence = "high";
    reason = "same_address_within_250m";
    blocksNlrInsert = true;
  } else if (sameCity && sameHouseAndStreet && distanceMeters <= 500) {
    confidence = "high";
    reason = "same_house_street_city_within_500m";
    blocksNlrInsert = true;
  } else if (sameAddress) {
    reason = "same_address_within_1600m";
    blocksNlrInsert = true;
  }

  return {
    nlrExternalId: nlrRow.external_id,
    nlrName: nlrRow.name,
    nlrAddress: nlrRow.address,
    manualStationId: manualRow.id,
    manualExternalId: manualRow.external_id,
    manualName: manualRow.name,
    manualAddress: manualRow.address,
    distanceMeters: Math.round(distanceMeters),
    normalizedAddressMatch: sameAddress,
    confidence,
    reason,
    blocksNlrInsert,
    recommendedAction: blocksNlrInsert
      ? "review-and-adopt-existing-uuid"
      : "review-nearby-stations",
  };
}

function candidatePriority(candidate: ReconciliationCandidate) {
  if (candidate.confidence === "high") {
    return 0;
  }
  return candidate.blocksNlrInsert ? 1 : 2;
}

export function reconcileNewNlrStations({
  selectedRows,
  existingExternalIds,
  manualStations,
}: {
  selectedRows: StationUpsertRow[];
  existingExternalIds: ReadonlySet<string>;
  manualStations: ManualStationRecord[];
}): StationReconciliationResult {
  const rowsToSync: StationUpsertRow[] = [];
  const highConfidenceCandidates: ReconciliationCandidate[] = [];
  const lowConfidenceCandidates: ReconciliationCandidate[] = [];
  const skippedNlrExternalIds: string[] = [];

  for (const nlrRow of selectedRows) {
    if (existingExternalIds.has(nlrRow.external_id)) {
      rowsToSync.push(nlrRow);
      continue;
    }

    const candidates = manualStations
      .map((manualRow) => classifyCandidate(nlrRow, manualRow))
      .filter((candidate): candidate is ReconciliationCandidate => candidate !== null)
      .sort((left, right) =>
        candidatePriority(left) - candidatePriority(right)
        || left.distanceMeters - right.distanceMeters,
      );
    const candidate = candidates[0];

    if (!candidate) {
      rowsToSync.push(nlrRow);
      continue;
    }

    if (candidate.confidence === "high") {
      highConfidenceCandidates.push(candidate);
    } else {
      lowConfidenceCandidates.push(candidate);
    }

    if (candidate.blocksNlrInsert) {
      skippedNlrExternalIds.push(nlrRow.external_id);
    } else {
      rowsToSync.push(nlrRow);
    }
  }

  return {
    rowsToSync,
    highConfidenceCandidates,
    lowConfidenceCandidates,
    skippedNlrExternalIds,
  };
}

export interface StationReconciliationReport {
  generatedAt: string;
  mode: "dry-run" | "apply";
  counts: {
    highConfidenceCandidates: number;
    lowConfidenceCandidates: number;
    skippedPossibleDuplicates: number;
  };
  highConfidenceCandidates: ReconciliationCandidate[];
  lowConfidenceCandidates: ReconciliationCandidate[];
}

export function buildStationReconciliationReport(
  result: StationReconciliationResult,
  mode: StationReconciliationReport["mode"],
  generatedAt = new Date().toISOString(),
): StationReconciliationReport {
  return {
    generatedAt,
    mode,
    counts: {
      highConfidenceCandidates: result.highConfidenceCandidates.length,
      lowConfidenceCandidates: result.lowConfidenceCandidates.length,
      skippedPossibleDuplicates: result.skippedNlrExternalIds.length,
    },
    highConfidenceCandidates: result.highConfidenceCandidates,
    lowConfidenceCandidates: result.lowConfidenceCandidates,
  };
}

export async function writeStationReconciliationReport(
  path: string,
  report: StationReconciliationReport,
) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}
