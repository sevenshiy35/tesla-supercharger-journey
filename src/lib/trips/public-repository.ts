import "server-only";

import { unstable_cache } from "next/cache";
import { z } from "zod";
import { getDrivingDirectionsForWaypoints } from "@/lib/mapbox/directions";
import { calculateSegmentedPlannedRoute, type PlannedRouteLeg } from "@/lib/mapbox/planned-route";
import { createPublicClient } from "@/lib/supabase/public";
import type { PublicHomepageTrip, PublicTripSegment, PublicTripStop } from "@/types/public-trip";

const coordinateSchema = z.tuple([z.number().min(-180).max(180), z.number().min(-90).max(90)]);

const publicTripSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
  status: z.enum(["confirmed", "active", "completed"]),
  confirmedAt: z.string().nullable(),
  activatedAt: z.string().nullable(),
  completedAt: z.string().nullable(),
  updatedAt: z.string(),
  stops: z.array(z.object({
    id: z.string().uuid(),
    sequence: z.number().int().nonnegative(),
    leg: z.enum(["outbound", "return"]),
    stationId: z.string().uuid(),
    stationName: z.string().min(1),
    city: z.string().min(1),
    state: z.string().regex(/^[A-Z]{2}$/),
    latitude: z.number().min(-90).max(90),
    longitude: z.number().min(-180).max(180),
    status: z.enum(["planned", "visited"]),
    estimatedArrivalAt: z.string().nullable(),
    checkedInAt: z.string().nullable(),
  })),
  segments: z.array(z.object({
    segmentIndex: z.number().int().nonnegative(),
    leg: z.enum(["outbound", "return"]),
    startSequence: z.number().int().nonnegative().nullable(),
    endSequence: z.number().int().nonnegative().nullable(),
    geometry: z.object({
      type: z.literal("LineString"),
      coordinates: z.array(coordinateSchema).min(2),
    }),
  })),
});

const editorialRoadbookPreview: PublicHomepageTrip = {
  id: "11111111-1111-4111-8111-111111111111",
  name: "Northeast Coast Run",
  status: "active",
  confirmedAt: "2026-07-14T14:00:00.000Z",
  activatedAt: "2026-07-15T13:12:00.000Z",
  completedAt: null,
  updatedAt: "2026-07-16T15:30:00.000Z",
  stops: [
    { id: "21111111-1111-4111-8111-111111111111", sequence: 0, leg: "outbound", stationId: "31111111-1111-4111-8111-111111111111", stationName: "Jersey City, NJ - Garfield Avenue", city: "Jersey City", state: "NJ", latitude: 40.7178, longitude: -74.0431, status: "visited", estimatedArrivalAt: "2026-07-15T13:00:00.000Z", checkedInAt: "2026-07-15T13:12:00.000Z" },
    { id: "21111111-1111-4111-8111-111111111112", sequence: 1, leg: "outbound", stationId: "31111111-1111-4111-8111-111111111112", stationName: "New Haven, CT", city: "New Haven", state: "CT", latitude: 41.3083, longitude: -72.9279, status: "visited", estimatedArrivalAt: "2026-07-15T19:30:00.000Z", checkedInAt: "2026-07-15T19:47:00.000Z" },
    { id: "21111111-1111-4111-8111-111111111113", sequence: 2, leg: "outbound", stationId: "31111111-1111-4111-8111-111111111113", stationName: "Providence, RI", city: "Providence", state: "RI", latitude: 41.824, longitude: -71.4128, status: "planned", estimatedArrivalAt: "2026-07-16T15:30:00.000Z", checkedInAt: null },
    { id: "21111111-1111-4111-8111-111111111114", sequence: 3, leg: "outbound", stationId: "31111111-1111-4111-8111-111111111114", stationName: "Boston, MA", city: "Boston", state: "MA", latitude: 42.3601, longitude: -71.0589, status: "planned", estimatedArrivalAt: "2026-07-18T19:30:00.000Z", checkedInAt: null },
  ],
  segments: [{
    segmentIndex: 0,
    leg: "outbound",
    startSequence: null,
    endSequence: null,
    geometry: {
      type: "LineString",
      coordinates: [
        [-74.0431, 40.7178], [-73.7781, 40.884], [-73.412, 41.02], [-73.0804, 41.18],
        [-72.9279, 41.3083], [-72.42, 41.36], [-71.92, 41.53], [-71.4128, 41.824],
        [-71.25, 42.03], [-71.0589, 42.3601],
      ],
    },
  }],
};

type PublicRouteWaypoint = Pick<PublicTripStop, "sequence" | "leg" | "latitude" | "longitude">;

async function buildPublicRoadSegments(waypoints: PublicRouteWaypoint[]): Promise<PublicTripSegment[]> {
  if (waypoints.length < 2) return [];
  const nodes = waypoints
    .slice()
    .sort((a, b) => a.sequence - b.sequence)
    .map((stop) => ({
      kind: "station" as const,
      sequence: stop.sequence,
      longitude: stop.longitude,
      latitude: stop.latitude,
    }));
  const legs: PlannedRouteLeg[] = [{ leg: "outbound", nodes }];
  const result = await calculateSegmentedPlannedRoute(legs, getDrivingDirectionsForWaypoints);
  if (result.technicalLimitReached) return [];
  return result.segments.map((segment) => ({
    segmentIndex: segment.segmentIndex,
    leg: segment.leg,
    startSequence: segment.startSequence,
    endSequence: segment.endSequence,
    geometry: segment.geometry,
  }));
}

const getCachedPublicRoadSegments = unstable_cache(
  async (_tripId: string, waypoints: PublicRouteWaypoint[]) => buildPublicRoadSegments(waypoints),
  ["public-trip-road-geometry-v1"],
  { revalidate: 60 * 60 * 12 },
);

async function withRoadGeometry(trip: PublicHomepageTrip): Promise<PublicHomepageTrip> {
  if (trip.segments.length > 0 || trip.stops.length < 2) return trip;
  const waypoints = trip.stops.map(({ sequence, leg, latitude, longitude }) => ({ sequence, leg, latitude, longitude }));
  try {
    const segments = await getCachedPublicRoadSegments(trip.id, waypoints);
    return segments.length > 0 ? { ...trip, segments } : trip;
  } catch {
    // The public Trip remains available with its station fallback if Mapbox is temporarily unavailable.
    return trip;
  }
}

export async function getPublicHomepageTrip(): Promise<PublicHomepageTrip | null> {
  if (process.env.PUBLIC_TRIP_PREVIEW === "editorial-roadbook") return withRoadGeometry(editorialRoadbookPreview);

  const client = await createPublicClient();
  const { data, error } = await client.rpc("get_public_homepage_trip");
  const migrationPending = error?.code === "PGRST202" || error?.code === "42883";
  if (migrationPending) return null;
  if (error) throw new Error("The public Trip could not be loaded.");
  if (data === null) return null;

  const parsed = publicTripSchema.safeParse(data);
  if (!parsed.success) throw new Error("The public Trip response was invalid.");
  return withRoadGeometry(parsed.data);
}
