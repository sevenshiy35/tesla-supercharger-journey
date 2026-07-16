import type { TripPlanStopLeg, TripRouteGeometry } from "./types";
import type { TripPlanningStation } from "./station-eligibility";

const EARTH_RADIUS_METERS = 6_371_000;
export const METERS_PER_MILE = 1609.344;

interface Vector3 { x: number; y: number; z: number }
export interface RouteBoundingBox { minLatitude: number; maxLatitude: number; minLongitude: number; maxLongitude: number }
export interface RouteCorridorLeg { leg: TripPlanStopLeg; geometry: TripRouteGeometry }
export interface CorridorCandidate extends TripPlanningStation {
  corridorDistanceMeters: number;
  routeProgress: number;
  nearestSegmentIndex: number;
  nearestLeg: TripPlanStopLeg;
}

const toRadians = (degrees: number) => degrees * Math.PI / 180;
const toDegrees = (radians: number) => radians * 180 / Math.PI;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

function vector(longitude: number, latitude: number): Vector3 {
  const lon = toRadians(longitude);
  const lat = toRadians(latitude);
  const cosLat = Math.cos(lat);
  return { x: cosLat * Math.cos(lon), y: cosLat * Math.sin(lon), z: Math.sin(lat) };
}

const dot = (a: Vector3, b: Vector3) => a.x * b.x + a.y * b.y + a.z * b.z;
const cross = (a: Vector3, b: Vector3): Vector3 => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x });
const scale = (a: Vector3, value: number): Vector3 => ({ x: a.x * value, y: a.y * value, z: a.z * value });
const subtract = (a: Vector3, b: Vector3): Vector3 => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const magnitude = (a: Vector3) => Math.sqrt(dot(a, a));
const normalize = (a: Vector3) => { const length = magnitude(a); return length === 0 ? null : scale(a, 1 / length); };
const angle = (a: Vector3, b: Vector3) => Math.acos(clamp(dot(a, b), -1, 1));

export function greatCircleDistanceMeters(a: [number, number], b: [number, number]) {
  return angle(vector(a[0], a[1]), vector(b[0], b[1])) * EARTH_RADIUS_METERS;
}

function pointToSphericalSegment(point: [number, number], start: [number, number], end: [number, number]) {
  const p = vector(point[0], point[1]);
  const a = vector(start[0], start[1]);
  const b = vector(end[0], end[1]);
  const arc = angle(a, b);
  if (arc < 1e-12) return { distanceMeters: angle(p, a) * EARTH_RADIUS_METERS, fraction: 0 };
  const normal = cross(a, b);
  const normalLengthSquared = dot(normal, normal);
  if (normalLengthSquared < 1e-18) {
    const distanceA = angle(p, a);
    const distanceB = angle(p, b);
    return distanceA <= distanceB
      ? { distanceMeters: distanceA * EARTH_RADIUS_METERS, fraction: 0 }
      : { distanceMeters: distanceB * EARTH_RADIUS_METERS, fraction: 1 };
  }
  const projected = normalize(subtract(p, scale(normal, dot(p, normal) / normalLengthSquared)));
  if (projected) {
    const options = [projected, scale(projected, -1)];
    for (const candidate of options.sort((left, right) => angle(p, left) - angle(p, right))) {
      const fromStart = angle(a, candidate);
      const toEnd = angle(candidate, b);
      if (Math.abs(fromStart + toEnd - arc) <= 1e-7) {
        return {
          distanceMeters: angle(p, candidate) * EARTH_RADIUS_METERS,
          fraction: clamp(fromStart / arc, 0, 1),
        };
      }
    }
  }
  const distanceA = angle(p, a);
  const distanceB = angle(p, b);
  return distanceA <= distanceB
    ? { distanceMeters: distanceA * EARTH_RADIUS_METERS, fraction: 0 }
    : { distanceMeters: distanceB * EARTH_RADIUS_METERS, fraction: 1 };
}

export function measurePointAlongRoute(point: [number, number], geometry: TripRouteGeometry) {
  const coordinates = geometry.coordinates;
  const segmentLengths = coordinates.slice(0, -1).map((coordinate, index) => greatCircleDistanceMeters(coordinate, coordinates[index + 1]));
  const totalLength = segmentLengths.reduce((sum, length) => sum + length, 0);
  let traversed = 0;
  let best = { corridorDistanceMeters: Number.POSITIVE_INFINITY, routeProgress: 0, nearestSegmentIndex: 0 };
  for (let index = 0; index < coordinates.length - 1; index += 1) {
    const measurement = pointToSphericalSegment(point, coordinates[index], coordinates[index + 1]);
    const progress = totalLength > 0 ? (traversed + segmentLengths[index] * measurement.fraction) / totalLength : 0;
    if (
      measurement.distanceMeters < best.corridorDistanceMeters - 1e-6 ||
      (Math.abs(measurement.distanceMeters - best.corridorDistanceMeters) <= 1e-6 && index < best.nearestSegmentIndex)
    ) best = { corridorDistanceMeters: measurement.distanceMeters, routeProgress: clamp(progress, 0, 1), nearestSegmentIndex: index };
    traversed += segmentLengths[index];
  }
  return best;
}

function normalizeLongitude(value: number) {
  let normalized = value;
  while (normalized < -180) normalized += 360;
  while (normalized > 180) normalized -= 360;
  return normalized;
}

export function expandedRouteBoundingBoxes(legs: RouteCorridorLeg[], corridorMiles: number): RouteBoundingBox[] {
  const coordinates = legs.flatMap((leg) => leg.geometry.coordinates);
  if (coordinates.length === 0) return [];
  const latitudes = coordinates.map((coordinate) => coordinate[1]);
  const normalizedLongitudes = coordinates.map((coordinate) => normalizeLongitude(coordinate[0]));
  const directSpan = Math.max(...normalizedLongitudes) - Math.min(...normalizedLongitudes);
  const longitudes = directSpan > 180
    ? normalizedLongitudes.map((longitude) => longitude < 0 ? longitude + 360 : longitude)
    : normalizedLongitudes;
  const corridorMeters = corridorMiles * METERS_PER_MILE;
  const latitudePadding = toDegrees(corridorMeters / EARTH_RADIUS_METERS);
  const middleLatitude = (Math.min(...latitudes) + Math.max(...latitudes)) / 2;
  const longitudePadding = Math.min(180, toDegrees(corridorMeters / (EARTH_RADIUS_METERS * Math.max(0.01, Math.cos(toRadians(middleLatitude))))));
  const minLatitude = clamp(Math.min(...latitudes) - latitudePadding, -90, 90);
  const maxLatitude = clamp(Math.max(...latitudes) + latitudePadding, -90, 90);
  const minLongitude = Math.min(...longitudes) - longitudePadding;
  const maxLongitude = Math.max(...longitudes) + longitudePadding;
  if (minLongitude >= -180 && maxLongitude <= 180) return [{ minLatitude, maxLatitude, minLongitude, maxLongitude }];
  if (minLongitude >= 0 && maxLongitude > 180) return [
    { minLatitude, maxLatitude, minLongitude: clamp(minLongitude, -180, 180), maxLongitude: 180 },
    { minLatitude, maxLatitude, minLongitude: -180, maxLongitude: normalizeLongitude(maxLongitude) },
  ];
  if (minLongitude < -180) return [
    { minLatitude, maxLatitude, minLongitude: -180, maxLongitude: clamp(maxLongitude, -180, 180) },
    { minLatitude, maxLatitude, minLongitude: normalizeLongitude(minLongitude), maxLongitude: 180 },
  ];
  return [{ minLatitude, maxLatitude, minLongitude: normalizeLongitude(minLongitude), maxLongitude: normalizeLongitude(maxLongitude) }];
}

export function stationInBoundingBoxes(station: Pick<TripPlanningStation, "latitude" | "longitude">, boxes: RouteBoundingBox[]) {
  return boxes.some((box) => station.latitude >= box.minLatitude && station.latitude <= box.maxLatitude && station.longitude >= box.minLongitude && station.longitude <= box.maxLongitude);
}

export function stationCorridorCandidate(station: TripPlanningStation, legs: RouteCorridorLeg[], corridorMiles: number): CorridorCandidate | null {
  const point: [number, number] = [station.longitude, station.latitude];
  const measurements = legs.map((leg) => ({ leg: leg.leg, ...measurePointAlongRoute(point, leg.geometry) }));
  measurements.sort((left, right) => left.corridorDistanceMeters - right.corridorDistanceMeters || (left.leg === "outbound" ? -1 : 1));
  const nearest = measurements[0];
  if (!nearest || nearest.corridorDistanceMeters > corridorMiles * METERS_PER_MILE + 1e-6) return null;
  return { ...station, ...nearest, nearestLeg: nearest.leg };
}

export function sortCorridorCandidates(candidates: CorridorCandidate[]) {
  return [...candidates].sort((left, right) =>
    (left.nearestLeg === right.nearestLeg ? 0 : left.nearestLeg === "outbound" ? -1 : 1) ||
    left.routeProgress - right.routeProgress ||
    left.corridorDistanceMeters - right.corridorDistanceMeters ||
    left.state.localeCompare(right.state) ||
    left.city.localeCompare(right.city) ||
    left.id.localeCompare(right.id));
}
