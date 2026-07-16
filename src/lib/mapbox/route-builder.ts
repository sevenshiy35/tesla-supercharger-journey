import type { TripRouteSegment, TripType } from "../trips/types";
import type { MapboxCoordinate, SafeDirectionsRoute } from "./types";

type DirectionGetter = (from: MapboxCoordinate, to: MapboxCoordinate) => Promise<SafeDirectionsRoute>;

export async function buildTripBaseRoute(
  tripType: TripType,
  origin: MapboxCoordinate,
  destination: MapboxCoordinate,
  getDirections: DirectionGetter,
) {
  const requests: Promise<SafeDirectionsRoute>[] = [getDirections(origin, destination)];
  if (tripType === "round_trip") requests.push(getDirections(destination, origin));
  const routes = await Promise.all(requests);
  const segments: TripRouteSegment[] = routes.map((route, segmentIndex) => ({
    segmentIndex,
    leg: segmentIndex === 0 ? "outbound" : "return",
    startSequence: null,
    endSequence: null,
    provider: "mapbox",
    distanceMeters: route.distanceMeters,
    durationSeconds: route.durationSeconds,
    geometry: route.geometry,
  }));
  return {
    provider: "mapbox" as const,
    algorithmVersion: "base-route-v1" as const,
    distanceMeters: segments.reduce((total, segment) => total + segment.distanceMeters, 0),
    durationSeconds: segments.reduce((total, segment) => total + segment.durationSeconds, 0),
    segments,
  };
}
