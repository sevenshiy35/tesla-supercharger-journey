import { normalizeAddress } from "./address-normalization";

export const PISCATAWAY_MANUAL_EXTERNAL_ID = "manual:tesla:piscataway-centennial-ave";
export const JERSEY_CITY_MANUAL_EXTERNAL_ID = "manual:tesla:jersey-city-garfield-ave";

export const PISCATAWAY_RECEIPT_ALIASES = [
  "Piscataway, NJ - Centennial Avenue",
  "Piscataway, NJ – Centennial Avenue",
  "88 Centennial Avenue",
  "88 Centennial Ave",
  "88 Centennial Avenue, Piscataway, NJ",
  "88 Centennial Ave, Piscataway, NJ",
  "88 Centennial Avenue, Piscataway, NJ 08854",
  "88 Centennial Ave, Piscataway, New Jersey 08854 US",
  "Centennial Avenue 88",
  "Centennial Ave 88",
  "Wawa Piscataway",
  "Wawa - Piscataway",
] as const;

export const JERSEY_CITY_RECEIPT_ALIASES = [
  "Jersey City, NJ - Garfield Avenue",
  "Jersey City, NJ – Garfield Avenue",
  "2-36 Garfield Avenue",
  "2 - 36 Garfield Avenue",
  "2-36 Garfield Avenue, Jersey City, NJ",
  "2-36 Garfield Ave, Jersey City, NJ",
  "2–36 Garfield Avenue, Jersey City, NJ",
  "2–36 Garfield Ave, Jersey City, NJ",
  "2-36 Garfield Ave, Jersey City, NJ 07305",
  "2-36 Garfield Avenue, Jersey City, New Jersey 07305 US",
  "Garfield Avenue 2-36",
  "Garfield Ave 2-36",
  "Twin City Shopping Center",
  "Twin City Shopping Center - Jersey City",
] as const;

export const MANUAL_STATION_ALIASES = {
  [PISCATAWAY_MANUAL_EXTERNAL_ID]: PISCATAWAY_RECEIPT_ALIASES,
  [JERSEY_CITY_MANUAL_EXTERNAL_ID]: JERSEY_CITY_RECEIPT_ALIASES,
} as const;

const normalizedAliasIndex = new Map<string, string>();

for (const [externalId, aliases] of Object.entries(MANUAL_STATION_ALIASES)) {
  for (const alias of aliases) {
    normalizedAliasIndex.set(normalizeAddress(alias), externalId);
  }
}

export function matchManualStationAlias(value: string): string | undefined {
  return normalizedAliasIndex.get(normalizeAddress(value));
}
