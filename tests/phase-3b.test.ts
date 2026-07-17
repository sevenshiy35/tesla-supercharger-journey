import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { DEFAULT_TRIP_PLAN_SETTINGS } from "../src/lib/trips/types";
import { validateTripPlanSettings } from "../src/lib/trips/validation";
import {
  isLegacyStopLimitReached,
  TRIP_STOP_SELECTION_OBJECTIVE,
} from "../src/lib/trips/stop-selection-policy";

const migrationPromise = readFile(
  "supabase/migrations/20260715120000_trip_planner_foundation.sql",
  "utf8",
);
const nullableStopLimitMigrationPromise = readFile(
  "supabase/migrations/20260715190000_nullable_trip_stop_limit.sql",
  "utf8",
);
const threeMinuteStopMigrationPromise = readFile(
  "supabase/migrations/20260716140000_three_minute_trip_stop_duration.sql",
  "utf8",
);
const actionsPromise = readFile("src/app/admin/trip-actions.ts", "utf8");
const repositoryPromise = readFile("src/lib/trips/repository.ts", "utf8");
const typesPromise = readFile("src/lib/trips/types.ts", "utf8");
const navigationPromise = readFile("src/components/admin/AdminNav.tsx", "utf8");
const listPagePromise = readFile("src/app/admin/(protected)/trips/page.tsx", "utf8");
const newFormPromise = readFile("src/components/admin/NewTripForm.tsx", "utf8");
const routeBasicsFieldsPromise = readFile("src/components/admin/TripRouteBasicsFields.tsx", "utf8");
const detailPagePromise = readFile("src/app/admin/(protected)/trips/[id]/page.tsx", "utf8");
const managerPromise = readFile("src/components/admin/TripDraftManager.tsx", "utf8");
const homePagePromise = readFile("src/app/page.tsx", "utf8");
const publicMapPromise = readFile("src/components/map/SuperchargerMap.tsx", "utf8");
const databaseTypesPromise = Promise.all([
  readFile("src/types/database.generated.ts", "utf8"),
  readFile("src/types/database.ts", "utf8"),
]).then((sources) => sources.join("\n"));
const phaseDocPromise = readFile("PHASE-3B.md", "utf8");

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`create function public.${name}`);
  const next = sql.indexOf("create function public.", start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

function tableSection(sql: string, name: string, nextMarker: string) {
  const start = sql.indexOf(`create table public.${name}`);
  const end = sql.indexOf(nextMarker, start + 1);
  return sql.slice(start, end === -1 ? sql.length : end);
}

async function readClientSources(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (
    await Promise.all(
      entries.map(async (entry) => {
        const target = path.join(directory, entry.name);
        if (entry.isDirectory()) return readClientSources(target);
        if (!/\.(ts|tsx)$/.test(entry.name)) return "";
        const source = await readFile(target, "utf8");
        return /^"use client";/.test(source) ? source : "";
      }),
    )
  ).join("\n");
}

test("1 trip_plans table is defined", async () => {
  assert.match(await migrationPromise, /create table public\.trip_plans/i);
});

test("2 trip_plan_stops table is defined", async () => {
  assert.match(await migrationPromise, /create table public\.trip_plan_stops/i);
});

test("3 trip_plan_segments table is defined", async () => {
  assert.match(await migrationPromise, /create table public\.trip_plan_segments/i);
});

test("4 Trip Type allows only one_way and round_trip", async () => {
  assert.match(await migrationPromise, /trip_type in \('one_way', 'round_trip'\)/i);
});

test("5 Plan status allows the five specified values", async () => {
  assert.match(
    await migrationPromise,
    /status in \('draft', 'confirmed', 'active', 'completed', 'archived'\)/i,
  );
});

test("6 non-Draft Plans require a name", async () => {
  assert.match(await migrationPromise, /status = 'draft' or name is not null/i);
});

test("7 a Draft can have a null name", async () => {
  const plans = tableSection(await migrationPromise, "trip_plans", "create table public.trip_plan_stops");
  assert.match(plans, /name text,/i);
  assert.doesNotMatch(plans, /name text not null/i);
});

test("8 origin and destination coordinates are range constrained", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /origin_latitude is null or origin_latitude between -90 and 90/i);
  assert.match(sql, /origin_longitude is null or origin_longitude between -180 and 180/i);
  assert.match(sql, /destination_latitude is null or destination_latitude between -90 and 90/i);
  assert.match(sql, /destination_longitude is null or destination_longitude between -180 and 180/i);
});

test("9 route distances and durations cannot be negative", async () => {
  const sql = await migrationPromise;
  for (const field of [
    "base_distance_meters",
    "base_duration_seconds",
    "planned_distance_meters",
    "planned_drive_seconds",
    "planned_stop_seconds",
    "extra_distance_meters",
    "extra_duration_seconds",
  ]) {
    assert.match(sql, new RegExp(`${field} is null or ${field} >= 0`, "i"));
  }
});

test("10 one user can have at most one homepage Plan", async () => {
  assert.match(
    await migrationPromise,
    /create unique index trip_plans_one_homepage_per_user_idx[\s\S]+where show_on_homepage = true/i,
  );
});

test("11 sequence is unique inside one Trip", async () => {
  assert.match(await migrationPromise, /unique \(trip_plan_id, sequence\)/i);
});

test("12 a station is unique inside one Trip", async () => {
  assert.match(await migrationPromise, /unique \(trip_plan_id, station_id\)/i);
});

test("13 Station FK uses stations.id rather than external_id", async () => {
  const stops = tableSection(await migrationPromise, "trip_plan_stops", "create table public.trip_plan_segments");
  assert.match(stops, /station_id uuid not null references public\.stations\(id\)/i);
  assert.doesNotMatch(stops, /external_id/i);
});

test("14 deleting a Trip cascades Stops and Segments", async () => {
  const sql = await migrationPromise;
  assert.equal((sql.match(/trip_plan_id uuid not null references public\.trip_plans\(id\) on delete cascade/gi) ?? []).length, 2);
});

test("15 deleting a Trip does not delete its Station", async () => {
  assert.match(await migrationPromise, /references public\.stations\(id\) on delete restrict/i);
});

test("16 deleting a Visit clears stop.visit_id", async () => {
  assert.match(await migrationPromise, /references public\.station_visits\(id\) on delete set null/i);
});

test("17 all three Trip tables enable RLS", async () => {
  const sql = await migrationPromise;
  for (const table of ["trip_plans", "trip_plan_stops", "trip_plan_segments"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} enable row level security`, "i"));
  }
});

test("18 anon receives no Trip table grant or Policy", async () => {
  const sql = await migrationPromise;
  assert.equal((sql.match(/revoke all on table public\.trip_plan(?:s|_stops|_segments) from public, anon, authenticated/gi) ?? []).length, 3);
  assert.doesNotMatch(sql, /create policy[\s\S]{0,180}to anon/i);
});

test("19 authenticated non-admin access is blocked by app_admins", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /trip_plans_select_admin_own[\s\S]+is_app_admin\(\)/i);
  assert.doesNotMatch(sql, /using \(true\)[\s\S]{0,80}trip_plan/i);
});

test("20 administrators can select only their own Plans", async () => {
  assert.match(await migrationPromise, /trip_plans_select_admin_own[\s\S]+user_id = \(select auth\.uid\(\)\)/i);
});

test("21 Stop RLS verifies the parent Plan owner", async () => {
  assert.match(await migrationPromise, /trip_plan_stops_select_admin_own[\s\S]+tp\.id = trip_plan_stops\.trip_plan_id[\s\S]+tp\.user_id = \(select auth\.uid\(\)\)/i);
});

test("22 Segment RLS verifies the parent Plan owner", async () => {
  assert.match(await migrationPromise, /trip_plan_segments_select_admin_own[\s\S]+tp\.id = trip_plan_segments\.trip_plan_id[\s\S]+tp\.user_id = \(select auth\.uid\(\)\)/i);
});

test("23 every Trip RPC is security definer with fixed search_path", async () => {
  const sql = await migrationPromise;
  for (const name of [
    "admin_create_trip_plan_draft",
    "admin_update_trip_plan_settings",
    "admin_delete_trip_plan_draft",
  ]) {
    const body = functionBody(sql, name);
    assert.match(body, /security definer/i);
    assert.match(body, /set search_path = public/i);
  }
});

test("24 every Trip RPC checks app_admins", async () => {
  const sql = await migrationPromise;
  for (const name of [
    "admin_create_trip_plan_draft",
    "admin_update_trip_plan_settings",
    "admin_delete_trip_plan_draft",
  ]) assert.match(functionBody(sql, name), /public\.app_admins/);
});

test("25 Trip RPC execute is authenticated-only", async () => {
  const sql = await migrationPromise;
  for (const name of [
    "admin_create_trip_plan_draft",
    "admin_update_trip_plan_settings",
    "admin_delete_trip_plan_draft",
  ]) {
    assert.match(sql, new RegExp(`revoke execute on function public\\.${name}[\\s\\S]+from public`, "i"));
    assert.match(sql, new RegExp(`revoke execute on function public\\.${name}[\\s\\S]+from anon`, "i"));
    assert.match(sql, new RegExp(`grant execute on function public\\.${name}[\\s\\S]+to authenticated`, "i"));
  }
});

test("26 Admin Trip runtime does not use service_role", async () => {
  const runtime = `${await actionsPromise}\n${await repositoryPromise}`;
  assert.doesNotMatch(runtime, /service_role|SUPABASE_SECRET_KEY|createSupabaseAdminClient/i);
  assert.match(runtime, /@\/lib\/supabase\/server/);
});

test("27 an administrator can create a Draft through its RPC", async () => {
  const body = functionBody(await migrationPromise, "admin_create_trip_plan_draft");
  assert.match(body, /insert into public\.trip_plans/i);
  assert.match(body, /'draft'/i);
});

test("28 create fixes user_id to auth.uid", async () => {
  const body = functionBody(await migrationPromise, "admin_create_trip_plan_draft");
  assert.match(body, /v_user_id uuid := auth\.uid\(\)/i);
  assert.match(body, /user_id[\s\S]+v_user_id/i);
});

test("29 the create signature accepts no client user_id", async () => {
  const body = functionBody(await migrationPromise, "admin_create_trip_plan_draft");
  const signature = body.slice(0, body.indexOf("returns table"));
  assert.doesNotMatch(signature, /p_user_id/i);
});

test("30 creating a Draft creates no Stops", async () => {
  assert.doesNotMatch(functionBody(await migrationPromise, "admin_create_trip_plan_draft"), /insert into public\.trip_plan_stops/i);
});

test("31 creating a Draft creates no Segments", async () => {
  assert.doesNotMatch(functionBody(await migrationPromise, "admin_create_trip_plan_draft"), /insert into public\.trip_plan_segments/i);
});

test("32 non-admin Draft creation is rejected", async () => {
  assert.match(functionBody(await migrationPromise, "admin_create_trip_plan_draft"), /Administrator access is required/i);
});

test("33 Draft settings RPC updates only planning settings", async () => {
  const body = functionBody(await migrationPromise, "admin_update_trip_plan_settings");
  for (const field of ["trip_type", "corridor_miles", "max_extra_minutes", "max_extra_miles", "max_stops", "stop_duration_minutes"]) {
    assert.match(body, new RegExp(`${field} = p_`, "i"));
  }
  const update = body.slice(body.indexOf("update public.trip_plans"));
  assert.doesNotMatch(update, /status =|user_id =|show_on_homepage =|planned_distance_meters =/i);
});

test("34 non-Draft settings updates are rejected", async () => {
  assert.match(functionBody(await migrationPromise, "admin_update_trip_plan_settings"), /v_plan\.status <> 'draft'[\s\S]+Only draft Trip Plans/i);
});

test("35 one administrator cannot update another user Draft", async () => {
  assert.match(functionBody(await migrationPromise, "admin_update_trip_plan_settings"), /tp\.user_id = v_user_id/i);
});

test("36 delete RPC deletes only Drafts", async () => {
  assert.match(functionBody(await migrationPromise, "admin_delete_trip_plan_draft"), /v_plan\.status <> 'draft'[\s\S]+Only draft Trip Plans/i);
});

test("37 confirmed active and completed Plans cannot use Draft deletion", async () => {
  const body = functionBody(await migrationPromise, "admin_delete_trip_plan_draft");
  assert.match(body, /if v_plan\.status <> 'draft'/i);
  assert.doesNotMatch(body, /status in \('confirmed', 'active', 'completed'\)/i);
});

test("38 Admin navigation contains Trips", async () => {
  assert.match(await navigationPromise, /href: "\/admin\/trips", label: "Trips"/);
});

test("39 Trips Empty State is explicit", async () => {
  assert.match(await listPagePromise, /No trip plans yet\./);
});

test("40 compatibility defaults are 50 120 null no Stop cap and a three-minute Stop", () => {
  assert.deepEqual(DEFAULT_TRIP_PLAN_SETTINGS, {
    tripType: "one_way",
    corridorMiles: 50,
    maxExtraMinutes: 120,
    maxExtraMiles: null,
    maxStops: null,
    stopDurationMinutes: 3,
  });
});

test("41 One-way and Round trip are selectable", async () => {
  const source = await routeBasicsFieldsPromise;
  assert.match(source, /\["one_way", "One way"\]/);
  assert.match(source, /\["round_trip", "Round trip"\]/);
  assert.match(source, /type="radio"/);
});

test("42 invalid planning values are rejected server-side", () => {
  assert.equal(validateTripPlanSettings({ ...DEFAULT_TRIP_PLAN_SETTINGS, corridorMiles: 0 }).success, false);
  assert.equal(validateTripPlanSettings({ ...DEFAULT_TRIP_PLAN_SETTINGS, maxExtraMinutes: -1 }).success, false);
  assert.equal(validateTripPlanSettings({ ...DEFAULT_TRIP_PLAN_SETTINGS, maxExtraMiles: -1 }).success, false);
  assert.equal(validateTripPlanSettings({ ...DEFAULT_TRIP_PLAN_SETTINGS, stopDurationMinutes: -1 }).success, false);
});

test("43 successful creation navigates to its detail page", async () => {
  assert.match(await newFormPromise, /router\.push\(`\/admin\/trips\/\$\{result\.tripPlanId\}`/);
});

test("44 Draft detail delegates route rendering to the 3B.2 planner", async () => {
  const source = await detailPagePromise;
  assert.match(source, /TripRoutePlanner/);
  assert.match(source, /routeCalculatedAt/);
  assert.doesNotMatch(source, /FeatureCollection|LineString/);
});

test("45 detail page provides the reusable endpoint planner", async () => {
  const source = await detailPagePromise;
  assert.match(source, /persistedSegments=\{segments\}/);
  assert.match(source, /initialSuggestedStops=\{suggestedStops\}/);
});

test("46 Delete Draft uses a custom second-confirmation dialog", async () => {
  const source = await managerPromise;
  assert.match(source, /role="dialog"/);
  assert.match(source, /Delete this Draft\?/);
  assert.match(source, /Stations and historical Visits will remain unchanged/);
});

test("47 list UI does not display a user UUID", async () => {
  const source = await listPagePromise;
  assert.doesNotMatch(source, /userId|user_id|User UUID|database UUID/i);
});

test("48 list DTO query contains no Geometry", async () => {
  const source = await repositoryPromise;
  const listColumns = source.slice(source.indexOf("const TRIP_PLAN_LIST_COLUMNS"), source.indexOf("export class TripRepositoryError"));
  assert.doesNotMatch(listColumns, /geometry/i);
  assert.match(listColumns, /trip_plan_stops\(count\)/);
  assert.match(source, /\.limit\(100\)/);
});

test("49 Client Components contain no Supabase secret", async () => {
  assert.doesNotMatch(await readClientSources("src"), /SUPABASE_SECRET_KEY|service_role/i);
});

test("50 Phase 3B.1 component set contains no direct browser Mapbox API call", async () => {
  const sources = [
    await actionsPromise,
    await repositoryPromise,
    await newFormPromise,
    await routeBasicsFieldsPromise,
    await detailPagePromise,
    await managerPromise,
  ].join("\n");
  assert.doesNotMatch(sources, /matrix\/v\d|searchbox|optimization\/v\d/i);
});

test("51 Trip Domain types are camelCase and separated from database rows", async () => {
  const source = await typesPromise;
  assert.match(source, /interface TripPlan/);
  assert.match(source, /originLatitude/);
  assert.match(source, /plannedDistanceMeters/);
  assert.doesNotMatch(source, /origin_latitude|planned_distance_meters/);
});

test("52 public home reads Trips only through the curated public repository", async () => {
  const homeSource = await homePagePromise;
  const mapSource = await publicMapPromise;
  assert.match(homeSource, /getPublicHomepageTrip/);
  assert.doesNotMatch(`${homeSource}\n${mapSource}`, /trip_plans|trip_plan_stops|trip_plan_segments/);
  assert.doesNotMatch(mapSource, /@\/lib\/trips/);
});

test("53 compatibility Migration makes max_stops nullable and defaults it to null", async () => {
  const sql = await nullableStopLimitMigrationPromise;
  assert.match(sql, /alter column max_stops drop not null/i);
  assert.match(sql, /alter column max_stops drop default/i);
  assert.doesNotMatch(sql, /drop column max_stops/i);
});

test("54 compatibility Migration preserves existing numeric Stop limits", async () => {
  const schemaChange = (await nullableStopLimitMigrationPromise).split("create or replace function")[0];
  assert.doesNotMatch(schemaChange, /update\s+public\.trip_plans|delete\s+from\s+public\.trip_plans/i);
});

test("55 current create uses route basics and legacy settings still submits a null Stop cap", async () => {
  const source = await actionsPromise;
  assert.equal((source.match(/p_max_stops: null/g) ?? []).length, 1);
  assert.match(source, /admin_create_trip_plan_route_draft/);
  assert.doesNotMatch(source, /p_max_stops:\s*settings\./);
});

test("56 replacement RPCs accept null while validating legacy numbers", async () => {
  const sql = await nullableStopLimitMigrationPromise;
  assert.equal((sql.match(/p_max_stops is not null and p_max_stops < 0/gi) ?? []).length, 2);
  assert.match(sql, /v_plan\.max_stops is distinct from p_max_stops/i);
  assert.match(sql, /max_stops = p_max_stops/i);
});

test("57 generated database types keep the legacy Stop cap nullable", async () => {
  const source = await databaseTypesPromise;
  assert.match(source, /max_stops: number \| null/);
  assert.match(source, /p_max_stops: number \| null/);
});

test("58 Maximum Stops is absent from New Trip, route basics, Draft actions, and detail summary", async () => {
  const source = `${await newFormPromise}\n${await routeBasicsFieldsPromise}\n${await managerPromise}\n${await detailPagePromise}`;
  assert.doesNotMatch(source, /Maximum stops|name="maxStops"|Zero is allowed/i);
});

test("59 route basics explain the manual-selection objective", async () => {
  assert.match(await newFormPromise, /Select the Superchargers you want to visit\. The planner will optimize their visit order\./i);
  assert.doesNotMatch(await newFormPromise, /add as many unvisited stations as possible within your detour budget/i);
  assert.equal(TRIP_STOP_SELECTION_OBJECTIVE, "maximize_unvisited_stations_within_detour_budget");
});

test("60 null never reaches the legacy Stop cap", () => {
  assert.equal(isLegacyStopLimitReached(null, 1_000_000), false);
  assert.equal(isLegacyStopLimitReached(8, 7), false);
  assert.equal(isLegacyStopLimitReached(8, 8), true);
});

test("61 Phase 3B.3 contract records every budget and feasibility stop condition", async () => {
  const source = await phaseDocPromise;
  for (const phrase of [
    "max_extra_minutes",
    "max_extra_miles",
    "no feasible unvisited candidate",
    "no reachable candidate",
    "technical guard",
    "non-null legacy `max_stops`",
  ]) assert.match(source, new RegExp(phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i"));
});

test("62 technical shortlist and iteration guards are not persisted as Trip settings", async () => {
  const sql = await nullableStopLimitMigrationPromise;
  assert.doesNotMatch(sql, /MATRIX_SHORTLIST_LIMIT|DIRECTIONS_COORDINATE_LIMIT|ITERATION_LIMIT/i);
  assert.match(await phaseDocPromise, /stay in application code\/configuration, never in `trip_plans`/i);
});

test("63 future Trip Drafts use a three-minute Station dwell default", async () => {
  const sql = await threeMinuteStopMigrationPromise;
  assert.match(sql, /alter column stop_duration_minutes set default 3/i);
  assert.match(sql, /admin_create_trip_plan_draft\([\s\S]+null::integer,[\s\S]+3[\s\S]+\) as created/i);
});

test("64 existing Drafts on the hidden ten-minute default move to three minutes", async () => {
  const sql = await threeMinuteStopMigrationPromise;
  assert.match(sql, /update public\.trip_plans as tp[\s\S]+stop_duration_minutes = 3/);
  assert.match(sql, /where tp\.status = 'draft'[\s\S]+tp\.stop_duration_minutes = 10/);
});

test("65 migrated Draft Stop totals use three minutes per saved Stop", async () => {
  const sql = await threeMinuteStopMigrationPromise;
  assert.match(sql, /select count\(\*\)::integer \* 3 \* 60[\s\S]+from public\.trip_plan_stops as tps[\s\S]+tps\.trip_plan_id = tp\.id/);
});

test("66 the dwell-time Migration preserves historical and custom Trip values", async () => {
  const sql = await threeMinuteStopMigrationPromise;
  assert.doesNotMatch(sql, /where tp\.status (?:<>|!=) 'draft'|where tp\.status in/i);
  assert.match(sql, /tp\.stop_duration_minutes = 10/);
  assert.doesNotMatch(sql, /delete from public\.trip_plans|delete from public\.trip_plan_stops/i);
});

test("67 the replacement route Draft RPC keeps its security contract", async () => {
  const sql = await threeMinuteStopMigrationPromise;
  assert.match(sql, /create or replace function public\.admin_create_trip_plan_route_draft/);
  assert.match(sql, /security definer[\s\S]+set search_path = public/);
  assert.match(sql, /revoke all on function public\.admin_create_trip_plan_route_draft[\s\S]+from public, anon/);
  assert.match(sql, /grant execute on function public\.admin_create_trip_plan_route_draft[\s\S]+to authenticated/);
});
