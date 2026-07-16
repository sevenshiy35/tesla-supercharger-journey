import "server-only";

import { MapboxServerError } from "./errors";
import { sanitizeLineString } from "./geometry";
import { mapboxJsonRequest } from "./server-client";
import type { MapboxCoordinate, SafeDirectionsRoute } from "./types";
import { DIRECTIONS_MAX_COORDINATES } from "@/lib/trips/planning-config";

function validCoordinate(coordinate: MapboxCoordinate) {
  return Number.isFinite(coordinate.longitude) && Number.isFinite(coordinate.latitude) &&
    coordinate.longitude >= -180 && coordinate.longitude <= 180 &&
    coordinate.latitude >= -90 && coordinate.latitude <= 90;
}

export async function getDrivingDirectionsForWaypoints(
  waypoints: MapboxCoordinate[],
): Promise<SafeDirectionsRoute> {
  if (waypoints.length < 2 || waypoints.length > DIRECTIONS_MAX_COORDINATES) {
    throw new MapboxServerError(
      "invalid_request",
      `Driving Directions requires between 2 and ${DIRECTIONS_MAX_COORDINATES} coordinates.`,
    );
  }
  if (!waypoints.every(validCoordinate)) {
    throw new MapboxServerError("invalid_request", "A Directions coordinate is invalid.");
  }
  const coordinates = waypoints.map(({ longitude, latitude }) => `${longitude},${latitude}`).join(";");
  const payload = await mapboxJsonRequest(
    `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}`,
    {
      geometries: "geojson",
      overview: "full",
      steps: "false",
      alternatives: "false",
      language: "en",
      continue_straight: "true",
    },
    15_000,
  );
  if (!payload || typeof payload !== "object") throw new MapboxServerError("invalid_response", "Invalid route response.");
  const record = payload as Record<string, unknown>;
  if (typeof record.code === "string" && record.code !== "Ok") {
    throw new MapboxServerError("no_route", "Mapbox returned no usable route.");
  }
  const routes = record.routes;
  if (!Array.isArray(routes) || !routes[0] || typeof routes[0] !== "object") {
    throw new MapboxServerError("no_route", "Mapbox returned no route.");
  }
  const route = routes[0] as Record<string, unknown>;
  if (
    typeof route.distance !== "number" || !Number.isFinite(route.distance) || route.distance < 0 ||
    typeof route.duration !== "number" || !Number.isFinite(route.duration) || route.duration < 0
  ) throw new MapboxServerError("invalid_response", "Invalid route metrics.");
  try {
    return {
      distanceMeters: Math.round(route.distance),
      durationSeconds: Math.round(route.duration),
      geometry: sanitizeLineString(route.geometry),
    };
  } catch {
    throw new MapboxServerError("invalid_response", "Invalid route geometry.");
  }
}

export async function getDrivingDirections(
  from: MapboxCoordinate,
  to: MapboxCoordinate,
): Promise<SafeDirectionsRoute> {
  return getDrivingDirectionsForWaypoints([from, to]);
}
