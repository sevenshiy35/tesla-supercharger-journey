import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { validateTripPlanName } from "../src/lib/trips/validation";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const component = source("src/components/admin/TripNameEditor.tsx");
const detailPage = source("src/app/admin/(protected)/trips/[id]/page.tsx");
const actions = source("src/app/admin/trip-actions.ts");
const migration = source("supabase/migrations/20260716010000_trip_plan_rename.sql");
const generatedTypes = source("src/types/database.generated.ts");

test("Trip name editor is placed beside the detail-page title", () => {
  assert.match(detailPage, /<TripNameEditor tripPlanId=\{plan\.id\} initialName=\{plan\.name\}/);
  assert.match(component, /aria-label="Edit Trip name"/);
  assert.match(component, /<Pencil/);
});

test("Trip name editor supports inline save, cancel, loading, and errors", () => {
  assert.match(component, /autoFocus/);
  assert.match(component, /aria-label="Save Trip name"/);
  assert.match(component, /aria-label="Cancel editing Trip name"/);
  assert.match(component, /LoaderCircle/);
  assert.match(component, /role="alert"/);
  assert.match(component, /event\.key === "Escape"/);
});

test("Trip name validation trims input and matches the database length constraint", () => {
  assert.equal(validateTripPlanName("  Summer road trip  ").data, "Summer road trip");
  assert.equal(validateTripPlanName("   ").success, false);
  assert.equal(validateTripPlanName("x".repeat(120)).success, true);
  assert.equal(validateTripPlanName("x".repeat(121)).success, false);
  assert.match(component, /maxLength=\{120\}/);
});

test("Rename action validates both the Trip ID and name on the server", () => {
  const renameAction = actions.slice(
    actions.indexOf("export async function renameTripPlanAction"),
    actions.indexOf("export async function createTripPlanDraftAction"),
  );
  assert.match(renameAction, /await requireAdmin\(\)/);
  assert.match(renameAction, /tripPlanIdSchema\.safeParse/);
  assert.match(renameAction, /validateTripPlanName/);
  assert.match(renameAction, /admin_rename_trip_plan/);
  assert.doesNotMatch(renameAction, /route_input_revision|trip_plan_stops|trip_plan_segments|status/);
});

test("Rename RPC is admin-only and scoped to the signed-in owner", () => {
  assert.match(migration, /auth\.uid\(\)/);
  assert.match(migration, /public\.app_admins/);
  assert.match(migration, /tp\.user_id = v_user_id/);
  assert.match(migration, /security definer[\s\S]+set search_path = public/);
  assert.match(migration, /revoke all on function public\.admin_rename_trip_plan\(uuid, text\) from public, anon/);
  assert.match(migration, /grant execute on function public\.admin_rename_trip_plan\(uuid, text\) to authenticated/);
});

test("Rename RPC only changes name metadata", () => {
  assert.match(migration, /update public\.trip_plans tp[\s\S]+set name = v_name/);
  assert.doesNotMatch(migration, /(?:update|delete from|insert into) public\.(?:trip_plan_stops|trip_plan_segments|stations|station_visits)/i);
  assert.doesNotMatch(migration, /set[\s\S]{0,160}(?:status|route_input_revision|route_calculated_at)\s*=/i);
});

test("Generated Supabase types include the rename RPC", () => {
  assert.match(generatedTypes, /admin_rename_trip_plan:[\s\S]+p_name: string[\s\S]+p_trip_plan_id: string/);
});
