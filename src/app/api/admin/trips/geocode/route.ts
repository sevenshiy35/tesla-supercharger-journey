import { NextResponse } from "next/server";
import { requireAdmin } from "@/lib/auth/admin";
import { safeMapboxErrorMessage } from "@/lib/mapbox/errors";
import { geocodePermanentUs } from "@/lib/mapbox/geocoding";

export const dynamic = "force-dynamic";

function privateResponse(body: unknown, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "private, no-store" },
  });
}
export async function GET(request: Request) {
  await requireAdmin();
  const query = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (query.length < 3) return privateResponse({ error: "Type at least 3 characters." }, 400);
  if (query.length > 256) return privateResponse({ error: "Search is limited to 256 characters." }, 400);
  if (query.includes(";")) return privateResponse({ error: "Semicolons are not allowed in address search." }, 400);

  try {
    return privateResponse({ results: await geocodePermanentUs(query) });
  } catch (error) {
    return privateResponse({ error: safeMapboxErrorMessage(error) }, 502);
  }
}
