import "server-only";

import { MapboxServerError } from "./errors";
import { parseGeocodingResults } from "./geocoding-parser";
import { mapboxJsonRequest } from "./server-client";
import type { GeocodingResult } from "./types";

export function isMapboxPermanentGeocodingEnabled() {
  return process.env.MAPBOX_PERMANENT_GEOCODING_ENABLED?.trim().toLowerCase() === "true";
}

function requireMapboxPermanentGeocoding() {
  if (!isMapboxPermanentGeocodingEnabled()) {
    throw new MapboxServerError("disabled", "Mapbox Permanent Geocoding is paused by configuration.");
  }
}

export async function geocodePermanentUs(query: string): Promise<GeocodingResult[]> {
  requireMapboxPermanentGeocoding();
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
