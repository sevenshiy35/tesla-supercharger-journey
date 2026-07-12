export interface ParsedReceiptRecord {
  sourceFile: string;
  sourcePage: number;
  sourceReceiptId: string | null;
  referenceId: string | null;
  rawLocation: string;
  locationName: string;
  streetAddress: string;
  city: string;
  state: string;
  postalCode: string;
  country: "US";
  eventDate: string | null;
  energyKwh: number | null;
  costUsd: number | null;
  chargingMinutes: number | null;
  pricePerKwh: number | null;
}

export interface ReceiptTimeOverride {
  sourceReceiptId: string;
  localStartedAt: string;
  timezone?: string;
}

export interface ReceiptStationRow {
  id: string;
  external_id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postal_code: string | null;
  latitude: number;
  longitude: number;
}

export type ReceiptMatchMethod =
  | "confirmed_external_id"
  | "receipt_alias"
  | "normalized_full_address"
  | "unique_address_city_state";

export interface ReceiptStationMatch {
  status: "matched" | "unmatched" | "ambiguous";
  method: ReceiptMatchMethod | null;
  expectedExternalId: string | null;
  candidates: ReceiptStationRow[];
  error: string | null;
}

export type ReceiptImportStatus =
  | "valid"
  | "invalid"
  | "unmatched"
  | "ambiguous"
  | "conflict";

export type CheckedInTimePrecision = "exact" | "date_only";

export interface NormalizedReceiptRecord {
  sourceFile: string;
  sourcePage: number;
  sourceReceiptId: string | null;
  referenceId: string | null;
  rawLocation: string;
  eventDate: string;
  normalizedAddress: string;
  stationExternalId: string | null;
  stationId: string | null;
  localStartedAt: string | null;
  timezone: string | null;
  startedAtUtc: string | null;
  visitAnchorAtUtc: string;
  checkedInTimePrecision: CheckedInTimePrecision;
  energyKwh: number | null;
  costUsd: number | null;
  chargingMinutes: number | null;
  pricePerKwh: number | null;
  receiptFingerprint: string;
  visitId: string;
  status: ReceiptImportStatus;
  matchMethod: ReceiptMatchMethod | null;
  error: string | null;
}

export interface ExistingVisitRow {
  id: string;
  station_id: string;
  user_id: string;
  checked_in_at: string;
  checked_in_time_precision: string;
}

export interface ReceiptImportPlanRecord extends NormalizedReceiptRecord {
  visitExists: boolean;
  chargingSessionExists: boolean;
}
