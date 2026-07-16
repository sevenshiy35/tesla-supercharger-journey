import "server-only";

import { parseGeocodingResults } from "./geocoding-parser";
import { mapboxJsonRequest } from "./server-client";
import type { GeocodingResult } from "./types";

export async function geocodePermanentUs(query: string): Promise<GeocodingResult[]> {
  const payload = await mapboxJsonRequest(
    `https://api.mapbox.com/search/geocode/v6/forward`,
    {
      q: query,
      country: "US",
      language: "en",
      permanent: "true",
      autocomplete: "true",
      types: "address,street,place,locality,neighborhood,postcode",
      limit: "6",
    },
    10_000,
  );
  return parseGeocodingResults(payload);
}
