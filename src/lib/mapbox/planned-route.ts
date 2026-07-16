import type { TripPlanStopLeg, TripRouteSegment } from "@/lib/trips/types";
import { DIRECTIONS_MAX_COORDINATES, MAX_DIRECTIONS_REQUESTS_PER_GENERATION } from "@/lib/trips/planning-config";
import type { MapboxCoordinate, SafeDirectionsRoute } from "./types";

export interface PlannedRouteNode extends MapboxCoordinate {
  kind: "origin" | "destination" | "station";
  sequence: number | null;
}

export interface PlannedRouteLeg {
  leg: TripPlanStopLeg;
  nodes: PlannedRouteNode[];
}

export type WaypointDirectionGetter = (waypoints: MapboxCoordinate[]) => Promise<SafeDirectionsRoute>;

export function splitDirectionWaypoints<T>(nodes: T[], maximumCoordinates = DIRECTIONS_MAX_COORDINATES): T[][] {
  if (!Number.isInteger(maximumCoordinates) || maximumCoordinates < 2) {
    throw new RangeError("Directions coordinate limit must be an integer of at least 2.");
  }
  if (nodes.length < 2) throw new RangeError("A planned route leg needs at least two nodes.");
  const chunks: T[][] = [];
  let start = 0;
  while (start < nodes.length - 1) {
    const end = Math.min(nodes.length, start + maximumCoordinates);
    chunks.push(nodes.slice(start, end));
    start = end - 1;
  }
  return chunks;
}

export function buildPlannedRouteLegs(
  origin: MapboxCoordinate,
  destination: MapboxCoordinate,
  stops: Array<MapboxCoordinate & { sequence: number; leg: TripPlanStopLeg }>,
  roundTrip: boolean,
): PlannedRouteLeg[] {
  const outbound = stops.filter((stop) => stop.leg === "outbound").sort((a, b) => a.sequence - b.sequence);
  const returning = stops.filter((stop) => stop.leg === "return").sort((a, b) => a.sequence - b.sequence);
  const originNode: PlannedRouteNode = { ...origin, kind: "origin", sequence: null };
  const destinationNode: PlannedRouteNode = { ...destination, kind: "destination", sequence: null };
  const stationNode = (stop: typeof stops[number]): PlannedRouteNode => ({ ...stop, kind: "station", sequence: stop.sequence });
  const legs: PlannedRouteLeg[] = [{
    leg: "outbound",
    nodes: [originNode, ...outbound.map(stationNode), destinationNode],
  }];
  if (roundTrip) {
    legs.push({
      leg: "return",
      nodes: [destinationNode, ...returning.map(stationNode), originNode],
    });
  }
  return legs;
}

export async function calculateSegmentedPlannedRoute(
  legs: PlannedRouteLeg[],
  getDirections: WaypointDirectionGetter,
  maximumCoordinates = DIRECTIONS_MAX_COORDINATES,
) {
  const requests = legs.flatMap((leg) => splitDirectionWaypoints(leg.nodes, maximumCoordinates).map((nodes) => ({ leg: leg.leg, nodes })));
  if (requests.length > MAX_DIRECTIONS_REQUESTS_PER_GENERATION) {
    return { technicalLimitReached: true as const, segments: [] as TripRouteSegment[], distanceMeters: 0, durationSeconds: 0 };
  }
  // Promise.all is intentional: if one leg or segment fails, no partial route is returned or saved.
  const routes = await Promise.all(requests.map((request) => getDirections(request.nodes)));
  const segments: TripRouteSegment[] = routes.map((route, index) => {
    const request = requests[index];
    const first = request.nodes[0];
    const last = request.nodes[request.nodes.length - 1];
    return {
      segmentIndex: index,
      leg: request.leg,
      startSequence: first.kind === "station" ? first.sequence : null,
      endSequence: last.kind === "station" ? last.sequence : null,
      provider: "mapbox",
      distanceMeters: route.distanceMeters,
      durationSeconds: route.durationSeconds,
      geometry: route.geometry,
    };
  });
  return {
    technicalLimitReached: false as const,
    segments,
    distanceMeters: segments.reduce((sum, segment) => sum + segment.distanceMeters, 0),
    durationSeconds: segments.reduce((sum, segment) => sum + segment.durationSeconds, 0),
  };
}
