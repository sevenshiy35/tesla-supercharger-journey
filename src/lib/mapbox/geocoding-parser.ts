import type { GeocodingResult } from "./types";

function stringValue(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}
export function parseGeocodingResults(payload: unknown): GeocodingResult[] {
  if (!payload || typeof payload !== "object") return [];
  const features = (payload as { features?: unknown }).features;
  if (!Array.isArray(features)) return [];

  return features.flatMap((feature): GeocodingResult[] => {
    if (!feature || typeof feature !== "object") return [];
    const record = feature as Record<string, unknown>;
    const properties = record.properties && typeof record.properties === "object"
      ? record.properties as Record<string, unknown>
      : {};
    const geometry = record.geometry && typeof record.geometry === "object"
      ? record.geometry as Record<string, unknown>
      : {};
    const coordinates = geometry.coordinates;
    if (!Array.isArray(coordinates) || coordinates.length < 2) return [];
    const [longitude, latitude] = coordinates;
    if (
      typeof longitude !== "number" || !Number.isFinite(longitude) || longitude < -180 || longitude > 180 ||
      typeof latitude !== "number" || !Number.isFinite(latitude) || latitude < -90 || latitude > 90
    ) return [];

    const providerId = stringValue(properties.mapbox_id) || stringValue(record.id);
    const label = stringValue(properties.name_preferred) || stringValue(properties.name) || stringValue(record.text);
    const fullAddress = stringValue(properties.full_address) || stringValue(record.place_name) || label;
    const featureType = stringValue(properties.feature_type) || stringValue(record.type) || "place";
    if (!providerId || !label || !fullAddress) return [];
    return [{ providerId, label, fullAddress, longitude, latitude, featureType, attribution: "Mapbox" }];
  }).slice(0, 6);
}
