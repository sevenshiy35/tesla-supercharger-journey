export type VisitTimePrecision = "exact" | "date_only";

export interface AdminStationResult {
  id: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string | null;
  latitude: number;
  longitude: number;
  visited: boolean;
  latestVisitAt: string | null;
  payToPark: boolean;
  distanceMiles?: number;
}

export interface SelectedAdminStation extends AdminStationResult {
  previousVisitCount: number;
  latestVisitTimezone?: string;
  latestVisitTimePrecision?: VisitTimePrecision;
}

export interface AdminVisitSummary {
  id: string;
  stationId: string;
  stationName: string;
  city: string;
  state: string;
  checkedInAt: string;
  checkedInTimezone: string;
  checkedInTimePrecision: VisitTimePrecision;
  isPublic: boolean;
  hasGps: boolean;
  energyKwh: number | null;
  costUsd: number | null;
}

export interface AdminVisitDetail extends AdminVisitSummary {
  address: string;
  postalCode: string | null;
  notes: string | null;
  recordedLatitude: number | null;
  recordedLongitude: number | null;
  chargingMinutes: number | null;
  pricePerKwh: number | null;
  startedAt: string | null;
  hasPhotos: boolean;
}
