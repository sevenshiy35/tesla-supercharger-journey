import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { safeMapboxErrorMessage } from "@/lib/mapbox/errors";
import { calculateSavedTripRoutePreview, TripSuggestionError } from "@/lib/trips/suggestion-service";
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

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  await requireAdmin();
  const { id } = await context.params;
  const parsed = tripPlanIdSchema.safeParse(id);
  if (!parsed.success) return privateResponse({ error: "Invalid Trip Plan ID." }, 400);
  const kind = new URL(request.url).searchParams.get("kind");
  if (kind !== "base" && kind !== "planned") return privateResponse({ error: "Choose a valid route preview kind." }, 400);
  try {
    const preview = await calculateSavedTripRoutePreview(parsed.data, kind);
    return privateResponse({ kind, ...preview });
  } catch (error) {
    if (error instanceof TripSuggestionError) return privateResponse({ error: error.safeMessage }, 422);
    return privateResponse({ error: safeMapboxErrorMessage(error) }, 502);
  }
}
