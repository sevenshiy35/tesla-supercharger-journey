import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import {
  listAdminTripStationCandidates,
  TripStationCandidateError,
  type StationCandidateBounds,
} from "@/lib/trips/station-selection-repository";
import { tripPlanIdSchema } from "@/lib/trips/validation";

export const dynamic = "force-dynamic";

function privateResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "private, no-store, max-age=0",
      Pragma: "no-cache",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function parseBounds(value: string | null): StationCandidateBounds | undefined {
  if (!value) return undefined;
  const values = value.split(",").map(Number);
  if (values.length !== 4 || values.some((item) => !Number.isFinite(item))) return undefined;
  const [west, south, east, north] = values;
  if (west < -180 || west > 180 || east < -180 || east > 180 ||
    south < -90 || south > 90 || north < -90 || north > 90 || south > north) return undefined;
  return { west, south, east, north };
}

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  const parsedId = tripPlanIdSchema.safeParse(id);
  if (!parsedId.success) return privateResponse({ error: "Invalid Trip Plan ID." }, 400);
  const params = new URL(request.url).searchParams;
  const corridorMiles = Number(params.get("corridorMiles") ?? "10");
  if (![10, 20, 30, 50].includes(corridorMiles)) {
    return privateResponse({ error: "Choose a supported display corridor." }, 400);
  }
  const visitedValue = params.get("visited");
  const visited = visitedValue === "visited" || visitedValue === "unvisited" ? visitedValue : "all";
  try {
    const result = await listAdminTripStationCandidates({
      tripPlanId: parsedId.data,
      corridorMiles,
      bounds: parseBounds(params.get("bounds")),
      visited,
      search: params.get("search") ?? undefined,
    });
    return privateResponse(result);
  } catch (error) {
    if (error instanceof TripStationCandidateError) {
      return privateResponse({ error: error.safeMessage }, error.status);
    }
    return privateResponse({ error: "Station candidates are temporarily unavailable." }, 503);
  }
}
