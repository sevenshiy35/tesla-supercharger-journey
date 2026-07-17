import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260716220000_trip_check_in_progress.sql");
const visitActions = source("src/app/admin/visit-actions.ts");
const checkInForm = source("src/components/admin/CheckInForm.tsx");
const repository = source("src/lib/trips/repository.ts");
const tripTypes = source("src/lib/trips/types.ts");
const routeMap = source("src/components/admin/TripRouteMap.tsx");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const stopCards = source("src/components/admin/TripSuggestionsPanel.tsx");
const generatedTypes = source("src/types/database.generated.ts");

function body(name: string) {
  const start = migration.indexOf(`create function public.${name}`);
  assert.notEqual(start, -1, `${name} is missing`);
  const end = migration.indexOf("\n$$;", start);
  assert.notEqual(end, -1, `${name} is incomplete`);
  return migration.slice(start, end);
}

const checkInRpc = body("admin_check_in_station");
const resetTrigger = body("reset_trip_stop_on_visit_delete");

test("Check-in wrapper preserves the exact server-timed Visit workflow", () => {
  assert.match(checkInRpc, /public\.admin_create_station_visit\(/);
  assert.match(checkInRpc, /p_visit_id[\s\S]+p_station_id[\s\S]+p_checked_in_timezone/);
  assert.match(checkInRpc, /auth\.uid\(\)/);
  assert.match(checkInRpc, /public\.app_admins/);
});

test("Check-in matches one owned active or confirmed Trip Stop", () => {
  assert.match(checkInRpc, /tp\.user_id = v_user_id/);
  assert.match(checkInRpc, /tp\.status in \('active', 'confirmed'\)/);
  assert.match(checkInRpc, /tps\.station_id = p_station_id/);
  assert.match(checkInRpc, /tps\.status = 'planned'/);
  assert.match(checkInRpc, /case when tp\.status = 'active' then 0 else 1 end/);
  assert.match(checkInRpc, /limit 1[\s\S]+for update of tp, tps/);
});

test("Check-in links the Visit, marks the Stop visited, and activates a confirmed Trip", () => {
  assert.match(checkInRpc, /set status = 'visited',[\s\S]+visit_id = v_visit\.visit_id/);
  assert.match(checkInRpc, /if v_trip_status = 'confirmed'/);
  assert.match(checkInRpc, /set status = 'active',[\s\S]+activated_at = coalesce\(tp\.activated_at, now\(\)\)/);
});

test("Idempotent retry returns an existing Trip link before matching another Trip", () => {
  const existingLink = checkInRpc.indexOf("where tps.visit_id = v_visit.visit_id");
  const candidate = checkInRpc.indexOf("tp.status in ('active', 'confirmed')");
  assert.ok(existingLink >= 0 && candidate > existingLink);
});

test("Deleting a Visit restores its linked Stop", () => {
  assert.match(migration, /before delete on public\.station_visits/);
  assert.match(resetTrigger, /set status = 'planned',[\s\S]+visit_id = null/);
  assert.match(resetTrigger, /where tps\.visit_id = old\.id/);
});

test("Trip repository keeps visited Stops and exposes their lifecycle status", () => {
  assert.match(repository, /\.neq\("status", "skipped"\)/);
  assert.match(repository, /row\.status === "visited" \|\| visited\.has/);
  assert.match(repository, /row\.status === "visited" \? "visited" : "planned"/);
  assert.match(tripTypes, /status: TripPlanStopStatus/);
});

test("Current Trip map and Stop cards use the site's soft green checked-in treatment", () => {
  assert.match(routeMap, /stop\.status === "visited"/);
  assert.match(routeMap, /bg-\[#2f8f78\][\s\S]+ring-\[#b9ded1\]/);
  assert.match(planner, /border-\[#b9ded1\] bg-\[#e7f5ef\]/);
  assert.match(planner, /Checked in/);
  assert.match(stopCards, /checkedIn \? "border-\[#b9ded1\] bg-\[#e7f5ef\]/);
});

test("Check-in success reports and links the updated Trip", () => {
  assert.match(visitActions, /admin_check_in_station/);
  assert.match(visitActions, /linkedTripPlanId: visit\.trip_plan_id/);
  assert.match(visitActions, /revalidatePath\(`\/admin\/trips\/\$\{tripPlanId\}`\)/);
  assert.match(checkInForm, /This Stop is now checked in on your current Trip/);
  assert.match(checkInForm, /View Updated Trip/);
});

test("Generated types include the atomic Check-in RPC result", () => {
  assert.match(generatedTypes, /admin_check_in_station:[\s\S]+trip_activated: boolean[\s\S]+trip_plan_id: string[\s\S]+trip_plan_stop_id: string/);
});
