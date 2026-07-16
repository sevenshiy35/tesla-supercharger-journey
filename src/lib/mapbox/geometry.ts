import type { LineStringGeometry } from "./types";

export const MAX_ROUTE_COORDINATES = 100_000;
export const MAX_ROUTE_GEOMETRY_BYTES = 8 * 1024 * 1024;

export class RouteGeometryError extends Error {
  constructor() {
    super("Route geometry is invalid or exceeds the safe technical limit.");
    this.name = "RouteGeometryError";
  }
}
export function sanitizeLineString(value: unknown): LineStringGeometry {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new RouteGeometryError();
  const candidate = value as Record<string, unknown>;
  if (candidate.type !== "LineString" || !Array.isArray(candidate.coordinates)) {
    throw new RouteGeometryError();
  }
  if (candidate.coordinates.length < 2 || candidate.coordinates.length > MAX_ROUTE_COORDINATES) {
    throw new RouteGeometryError();
  }

  const coordinates: [number, number][] = candidate.coordinates.map((coordinate) => {
    if (!Array.isArray(coordinate) || coordinate.length < 2) throw new RouteGeometryError();
    const longitude = coordinate[0];
    const latitude = coordinate[1];
    if (
      typeof longitude !== "number" ||
      typeof latitude !== "number" ||
      !Number.isFinite(longitude) ||
      !Number.isFinite(latitude) ||
      longitude < -180 ||
      longitude > 180 ||
      latitude < -90 ||
      latitude > 90
    ) throw new RouteGeometryError();
    return [longitude, latitude];
  });

  const sanitized: LineStringGeometry = { type: "LineString", coordinates };
  if (new TextEncoder().encode(JSON.stringify(sanitized)).byteLength > MAX_ROUTE_GEOMETRY_BYTES) {
    throw new RouteGeometryError();
  }
  return sanitized;
}
