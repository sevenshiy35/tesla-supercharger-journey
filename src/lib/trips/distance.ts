import type { TripEndpoint } from "./types";

export function endpointDistanceMeters(a: TripEndpoint, b: TripEndpoint) {
  const earthRadiusMeters = 6_371_000;
  const toRadians = (degrees: number) => degrees * Math.PI / 180;
  const deltaLatitude = toRadians(b.latitude - a.latitude);
  const deltaLongitude = toRadians(b.longitude - a.longitude);
  const latitudeA = toRadians(a.latitude);
  const latitudeB = toRadians(b.latitude);
  const h = Math.sin(deltaLatitude / 2) ** 2 +
    Math.cos(latitudeA) * Math.cos(latitudeB) * Math.sin(deltaLongitude / 2) ** 2;
  return 2 * earthRadiusMeters * Math.asin(Math.sqrt(h));
}
export function endpointsAreUseful(a: TripEndpoint, b: TripEndpoint) {
  return endpointDistanceMeters(a, b) >= 100;
}
