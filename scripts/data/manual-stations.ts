import {
  JERSEY_CITY_MANUAL_EXTERNAL_ID,
  JERSEY_CITY_RECEIPT_ALIASES,
  PISCATAWAY_MANUAL_EXTERNAL_ID,
  PISCATAWAY_RECEIPT_ALIASES,
} from "../../src/lib/stations/station-aliases";

export type ManualStationSource =
  | "tesla_official"
  | "tesla_receipt_verified";

export interface ManualStationDefinition {
  externalId: string;
  name: string;
  address: string;
  city: string;
  state: string;
  postalCode: string;
  country: "US";
  latitude: number;
  longitude: number;
  stallCount: number | null;
  maxPowerKw: number | null;
  operationalStatus: "open";
  source: ManualStationSource;
  sourceUpdatedAt: string | null;
  receiptAliases: readonly string[];
  evidenceNotes: string;
}

export const MANUAL_STATIONS = [
  {
    externalId: PISCATAWAY_MANUAL_EXTERNAL_ID,
    name: "Piscataway, NJ - Centennial Avenue",
    address: "88 Centennial Avenue",
    city: "Piscataway",
    state: "NJ",
    postalCode: "08854",
    country: "US",
    latitude: 40.539647,
    longitude: -74.501189,
    stallCount: 12,
    maxPowerKw: 325,
    operationalStatus: "open",
    source: "tesla_official",
    sourceUpdatedAt: null,
    receiptAliases: PISCATAWAY_RECEIPT_ALIASES,
    evidenceNotes:
      "Tesla's official location page confirms the address, 12 Supercharger stalls, 325 kW maximum, and 24/7 availability. Coordinates are the reviewed rooftop geocode used by the unmatched-station audit.",
  },
  {
    externalId: JERSEY_CITY_MANUAL_EXTERNAL_ID,
    name: "Jersey City, NJ - Garfield Avenue",
    address: "2-36 Garfield Avenue",
    city: "Jersey City",
    state: "NJ",
    postalCode: "07305",
    country: "US",
    latitude: 40.685172,
    longitude: -74.099118,
    stallCount: null,
    maxPowerKw: null,
    operationalStatus: "open",
    source: "tesla_receipt_verified",
    sourceUpdatedAt: null,
    receiptAliases: JERSEY_CITY_RECEIPT_ALIASES,
    evidenceNotes:
      "Tesla receipt address and reviewed exact geocode confirm this physical location. Stall count and power remain null because no authoritative Tesla location record was confirmed.",
  },
] as const satisfies readonly ManualStationDefinition[];
