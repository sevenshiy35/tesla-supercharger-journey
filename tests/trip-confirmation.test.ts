import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260716210000_trip_confirmation.sql");
const actions = source("src/app/admin/trip-actions.ts");
const manager = source("src/components/admin/TripDraftManager.tsx");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const detail = source("src/app/admin/(protected)/trips/[id]/page.tsx");
const generatedTypes = source("src/types/database.generated.ts");

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`create function public.${name}`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = sql.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} body is incomplete`);
  return sql.slice(start, end);
}

const confirmRpc = functionBody(migration, "admin_confirm_trip_plan");
const confirmAction = actions.slice(
  actions.indexOf("export async function confirmTripPlanAction"),
  actions.indexOf("export async function deleteTripPlanDraftAction"),
);

test("Trip confirmation RPC is authenticated, administrator-only, owner-scoped, and protected", () => {
  assert.match(confirmRpc, /auth\.uid\(\)/);
  assert.match(confirmRpc, /public\.app_admins/);
  assert.match(confirmRpc, /tp\.user_id = v_user_id/);
  assert.match(confirmRpc, /for update/);
  assert.match(migration, /security definer[\s\S]+set search_path = public/);
  assert.match(migration, /revoke all on function public\.admin_confirm_trip_plan\(uuid, bigint\) from public, anon/);
  assert.match(migration, /grant execute on function public\.admin_confirm_trip_plan\(uuid, bigint\) to authenticated/);
});

test("Trip confirmation accepts only the current Draft revision", () => {
  assert.match(confirmRpc, /v_plan\.status <> 'draft'/);
  assert.match(confirmRpc, /v_plan\.route_input_revision <> p_expected_revision/);
  assert.match(confirmRpc, /trip changed while this operation was running/i);
});

test("Trip confirmation requires a named, calculated, current planned route with a Stop", () => {
  assert.match(confirmRpc, /v_plan\.name is null/);
  assert.match(confirmRpc, /v_plan\.route_calculated_at is null/);
  assert.match(confirmRpc, /v_plan\.planned_route_stale/);
  assert.match(confirmRpc, /v_plan\.planned_distance_meters is null/);
  assert.match(confirmRpc, /v_plan\.planned_drive_seconds is null/);
  assert.match(confirmRpc, /v_plan\.planned_stop_seconds is null/);
  assert.match(confirmRpc, /from public\.trip_plan_stops[\s\S]+tps\.status = 'planned'/);
});

test("Trip confirmation changes only lifecycle fields", () => {
  assert.match(confirmRpc, /update public\.trip_plans tp[\s\S]+set status = 'confirmed',[\s\S]+confirmed_at = now\(\)/);
  assert.doesNotMatch(confirmRpc, /(?:insert into|update|delete from) public\.(?:trip_plan_stops|trip_plan_segments|stations|station_visits)/);
});

test("Server action validates ID and revision before calling the confirmation RPC", () => {
  assert.match(confirmAction, /tripPlanIdSchema\.safeParse/);
  assert.match(confirmAction, /Number\.isSafeInteger\(expectedRevision\)/);
  assert.match(confirmAction, /admin_confirm_trip_plan/);
  assert.match(confirmAction, /p_expected_revision: expectedRevision/);
  assert.match(confirmAction, /status: "confirmed"/);
  assert.match(confirmAction, /refreshTripPaths\(tripPlanId\)/);
});

test("Review UI exposes a guarded confirmation dialog", () => {
  assert.match(manager, /Confirm Trip/);
  assert.match(manager, /disabled=\{Boolean\(confirmationBlocker\)\}/);
  assert.match(manager, /confirmTripPlanAction\(tripPlanId, routeInputRevision\)/);
  assert.match(manager, /Confirm this Trip\?/);
  assert.match(manager, /locks the route basics, selected Stations, and Stop order/);
});

test("Detail page derives confirmation readiness and passes the route revision", () => {
  assert.match(detail, /const plannedRouteCurrent = routeCalculated/);
  assert.match(detail, /plan\.plannedRouteStale/);
  assert.match(detail, /plan\.plannedDistanceMeters !== null/);
  assert.match(detail, /confirmationBlocker/);
  assert.match(detail, /routeInputRevision=\{plan\.routeInputRevision\}/);
});

test("Confirmed Trips render a read-only route instead of editing controls", () => {
  assert.match(planner, /if \(plan\.status !== "draft"\)/);
  assert.match(planner, /Route locked/);
  assert.match(planner, /Trip Stops/);
  const lockedBranch = planner.slice(planner.indexOf('if (plan.status !== "draft")'), planner.indexOf("\n  return (", planner.indexOf('if (plan.status !== "draft")') + 10));
  assert.doesNotMatch(lockedBranch, /TripRouteBasicsFields|TripStationSelectionPanel|TripStopsPanel/);
});

test("Generated database types include the confirmation RPC", () => {
  assert.match(generatedTypes, /admin_confirm_trip_plan:[\s\S]+p_expected_revision: number; p_trip_plan_id: string[\s\S]+confirmed_at: string/);
});
