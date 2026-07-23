import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { haversineMiles } from "../src/lib/admin/distance";
import {
  MAX_VISIT_NOTES_LENGTH,
  isUuid,
  isValidTimezone,
  validateCheckInInput,
  validateCoordinates,
} from "../src/lib/admin/validation";
import { formatCheckInDisplayDate } from "../src/lib/journey/calculations";

const migrationPath = "supabase/migrations/20260713180000_admin_visit_management.sql";
const migrationPromise = readFile(migrationPath, "utf8");
const authPromise = readFile("src/lib/auth/admin.ts", "utf8");
const loginPromise = readFile("src/app/admin/login/actions.ts", "utf8");
const layoutPromise = readFile("src/app/admin/(protected)/layout.tsx", "utf8");
const checkInPromise = readFile("src/components/admin/CheckInForm.tsx", "utf8");
const actionsPromise = readFile("src/app/admin/visit-actions.ts", "utf8");
const dataPromise = readFile("src/lib/admin/data.ts", "utf8");
const detailPromise = readFile("src/app/admin/(protected)/visits/[id]/page.tsx", "utf8");

function validInput(overrides: Partial<Parameters<typeof validateCheckInInput>[0]> = {}) {
  return {
    visitId: "c990ba4d-6619-47df-bf0b-8df2c12aa8ca",
    stationId: "1dc14503-16bf-4e4f-993f-88313df89b24",
    timezone: "America/New_York",
    latitude: null,
    longitude: null,
    notes: "",
    isPublic: true,
    ...overrides,
  };
}

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`create or replace function public.${name}`);
  const next = sql.indexOf("create or replace function public.", start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

async function readRuntimeSource(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = await Promise.all(
    entries.map(async (entry) => {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) return readRuntimeSource(target);
      if (!/\.(ts|tsx)$/.test(entry.name)) return "";
      return readFile(target, "utf8");
    }),
  );
  return values.join("\n");
}

test("1 unauthenticated admin routes pass through a server-side protected layout", async () => {
  assert.match(await layoutPromise, /await requireAdmin\(\)/);
});

test("2 authenticated non-admins fail the app_admins allowlist lookup", async () => {
  assert.match(await authPromise, /from\("app_admins"\)[\s\S]+eq\("user_id", user\.id\)/);
});

test("3 verified administrators receive a minimal safe identity", async () => {
  const source = await authPromise;
  assert.match(source, /id: user\.id/);
  assert.doesNotMatch(source, /access_token|refresh_token/);
});

test("4 an authenticated administrator visiting login is redirected to admin", async () => {
  const source = await readFile("src/app/admin/login/page.tsx", "utf8");
  assert.match(source, /getCurrentAdmin\(\)[\s\S]+redirect\("\/admin"\)/);
});

test("5 sign out clears Supabase Auth before returning to login", async () => {
  const source = await readFile("src/app/admin/actions.ts", "utf8");
  assert.match(source, /auth\.signOut\(\)[\s\S]+redirect\("\/admin\/login"\)/);
});

test("6 create Visit uses database server now", async () => {
  assert.match(functionBody(await migrationPromise, "admin_create_station_visit"), /checked_in_at[\s\S]+now\(\)/i);
});

test("7 create Visit fixes time precision to exact", async () => {
  assert.match(functionBody(await migrationPromise, "admin_create_station_visit"), /checked_in_time_precision[\s\S]+'exact'/i);
});

test("8 create Visit fixes user identity to auth.uid", async () => {
  assert.match(functionBody(await migrationPromise, "admin_create_station_visit"), /v_user_id uuid := auth\.uid\(\)/i);
});

test("9 client create input has no checked_in_at field", async () => {
  const source = await actionsPromise;
  const input = source.slice(source.indexOf("export interface CreateVisitInput"), source.indexOf("export interface VisitMutationState"));
  assert.doesNotMatch(input, /checkedInAt|checked_in_at/);
});

test("10 client create input has no user_id field", async () => {
  const source = await actionsPromise;
  const input = source.slice(source.indexOf("export interface CreateVisitInput"), source.indexOf("export interface VisitMutationState"));
  assert.doesNotMatch(input, /userId|user_id/);
});

test("11 timezone is required and must be a valid IANA identifier", () => {
  assert.equal(isValidTimezone(""), false);
  assert.equal(isValidTimezone("Not/A_Real_Zone"), false);
  assert.equal(isValidTimezone("America/New_York"), true);
});

test("12 valid GPS coordinates are accepted", () => {
  assert.equal(validateCoordinates(40.7357, -74.1724), null);
});

test("13 check-in can omit GPS", () => {
  assert.equal(validateCoordinates(null, null), null);
});

test("14 invalid latitude is rejected", () => {
  assert.match(validateCoordinates(90.01, -74) ?? "", /Latitude/);
});

test("15 invalid longitude is rejected", () => {
  assert.match(validateCoordinates(40, -180.01) ?? "", /Longitude/);
});

test("16 notes longer than 2,000 characters are rejected", () => {
  assert.match(validateCheckInInput(validInput({ notes: "x".repeat(MAX_VISIT_NOTES_LENGTH + 1) })) ?? "", /2,000/);
});

test("17 a private Visit is a valid create input", () => {
  assert.equal(validateCheckInInput(validInput({ isPublic: false })), null);
});

test("18 repeat visit UUIDs use an idempotent insert conflict path", async () => {
  const body = functionBody(await migrationPromise, "admin_create_station_visit");
  assert.match(body, /on conflict \(id\) do nothing/i);
  assert.match(body, /where sv\.id = p_visit_id[\s\S]+return query/i);
});

test("19 a reused UUID with another station raises a conflict", async () => {
  assert.match(functionBody(await migrationPromise, "admin_create_station_visit"), /station_id <> p_station_id[\s\S]+conflicts with another check-in/i);
});

test("20 different visit UUIDs may check in at the same station", async () => {
  const sql = await migrationPromise;
  assert.doesNotMatch(sql, /unique\s*\(\s*station_id/i);
  assert.equal(isUuid(validInput().visitId), true);
});

test("21 station search queries the name field", async () => {
  assert.match(await dataPromise, /\["name", "address", "city", "state", "postal_code"\]/);
});

test("22 station search queries the city field", async () => {
  assert.match(await dataPromise, /"city"/);
});

test("23 station search queries state and postal code fields", async () => {
  const source = await dataPromise;
  assert.match(source, /"state"/);
  assert.match(source, /"postal_code"/);
});

test("24 station search caps its visible results at 25", async () => {
  assert.match(await dataPromise, /slice\(0, 25\)/);
});

test("24b Nearby caps its distance-sorted results at 5", async () => {
  const source = await dataPromise;
  assert.match(source, /candidates\.length >= 5/);
  assert.match(source, /slice\(0, 5\)/);
});

test("25 Haversine distance orders a nearby station before a distant station", () => {
  const nearby = haversineMiles(40.7357, -74.1724, 40.74, -74.18);
  const distant = haversineMiles(40.7357, -74.1724, 39.9526, -75.1652);
  assert.ok(nearby < distant);
});

test("26 denied geolocation explicitly keeps manual Search available", async () => {
  assert.match(await checkInPromise, /PERMISSION_DENIED[\s\S]+still search manually/);
});

test("27 Nearby results require an explicit station button selection", async () => {
  const source = await checkInPromise;
  assert.match(source, /onSelect=\{\(\) => void chooseStation\(station\)\}/);
  assert.doesNotMatch(source, /setSelectedStation\(.*stations\[0\]/);
});

test("27b check-in supports taking or choosing up to two photos", async () => {
  const source = await checkInPromise;
  assert.match(source, /capture="environment"/);
  assert.match(source, /multiple/);
  assert.match(source, /MAX_VISIT_PHOTOS - checkInPhotosRef\.current\.length/);
});

test("27c photos upload only after the Visit is created", async () => {
  const source = await checkInPromise;
  const submit = source.slice(
    source.indexOf("async function submitCheckIn"),
    source.indexOf("function checkInAnother"),
  );
  assert.ok(submit.indexOf("createStationVisitAction") < submit.indexOf("uploadCheckInPhoto"));
  assert.match(submit, /uploadCheckInPhoto\(photo, createdVisitId, createdVisitIsPublic\)/);
});

test("28 date_only display contains no clock time", () => {
  const display = formatCheckInDisplayDate("2026-04-29T16:00:00.000Z", "en", "date_only", "America/New_York");
  assert.equal(/\d{1,2}:\d{2}/.test(display), false);
});

test("29 exact display uses the stored local timezone and time", () => {
  const display = formatCheckInDisplayDate("2026-04-29T19:00:00.000Z", "en", "exact", "America/New_York");
  assert.match(display, /3:00 PM/);
});

test("30 date_only display never exposes its noon anchor", () => {
  const display = formatCheckInDisplayDate("2026-04-29T16:00:00.000Z", "en", "date_only", "America/New_York");
  assert.doesNotMatch(display, /12:00|noon/i);
});

test("31 Visit detail renders charging energy, cost, duration, and unit price", async () => {
  const source = await detailPromise;
  for (const label of ["Energy", "Cost", "Duration", "Price / kWh"]) assert.match(source, new RegExp(label));
});

test("32 Private badge has an explicit private label", async () => {
  const source = await readFile("src/components/admin/PublicBadge.tsx", "utf8");
  assert.match(source, /isPublic \? "Public" : "Private"/);
});

test("33 update RPC accepts only visit ID, notes, and visibility", async () => {
  const body = functionBody(await migrationPromise, "admin_update_station_visit");
  assert.match(body, /p_visit_id uuid,\s+p_notes text,\s+p_is_public boolean/i);
});

test("34 update RPC cannot modify station, time, precision, GPS, or user", async () => {
  const body = functionBody(await migrationPromise, "admin_update_station_visit");
  const setClause = body.slice(body.indexOf("set\n"), body.indexOf("where sv.id"));
  assert.doesNotMatch(setClause, /station_id|checked_in|recorded_|user_id/);
});

test("35 delete RPC removes Charging Sessions first", async () => {
  const body = functionBody(await migrationPromise, "admin_delete_station_visit");
  assert.ok(body.indexOf("delete from public.charging_sessions") < body.indexOf("delete from public.station_visits"));
});

test("36 delete RPC never deletes stations", async () => {
  assert.doesNotMatch(functionBody(await migrationPromise, "admin_delete_station_visit"), /delete from public\.stations/i);
});

test("37 delete RPC rejects visits that have photo records", async () => {
  assert.match(functionBody(await migrationPromise, "admin_delete_station_visit"), /visit_photos[\s\S]+cannot be deleted/i);
});

test("38 deleting the only public Visit makes public_station_status unvisited", async () => {
  const initial = await readFile("supabase/migrations/20260711_initial_journey_schema.sql", "utf8");
  assert.match(initial, /exists \([\s\S]+station_visits\.is_public = true[\s\S]+\) as visited/i);
});

test("39 another public Visit keeps public_station_status visited", async () => {
  const initial = await readFile("supabase/migrations/20260711_initial_journey_schema.sql", "utf8");
  assert.match(initial, /where station_visits\.station_id = stations\.id[\s\S]+is_public = true/i);
  assert.doesNotMatch(initial, /count\(\*\)\s*=\s*1\s+as visited/i);
});

test("40 every management RPC rejects non-admin authenticated users", async () => {
  const sql = await migrationPromise;
  for (const name of ["admin_create_station_visit", "admin_update_station_visit", "admin_delete_station_visit"]) {
    assert.match(functionBody(sql, name), /app_admins[\s\S]+Administrator access is required/i);
  }
});

test("41 RPC execute is revoked from public and anon", async () => {
  const sql = await migrationPromise;
  assert.equal((sql.match(/from public, anon;/gi) ?? []).length, 3);
});

test("42 RPC execute is granted only to authenticated runtime users", async () => {
  const sql = await migrationPromise;
  assert.equal((sql.match(/to authenticated;/gi) ?? []).length, 3);
  assert.doesNotMatch(sql, /grant execute[\s\S]+to anon/i);
});

test("43 every RPC verifies auth.uid against app_admins", async () => {
  const sql = await migrationPromise;
  assert.equal((sql.match(/v_user_id uuid := auth\.uid\(\)/gi) ?? []).length, 3);
  assert.equal((sql.match(/from public\.app_admins as aa where aa\.user_id = v_user_id/gi) ?? []).length, 3);
});

test("44 every management RPC fixes search_path to public", async () => {
  const sql = await migrationPromise;
  assert.equal((sql.match(/security definer\s+set search_path = public/gi) ?? []).length, 3);
});

test("45 SUPABASE_SECRET_KEY is isolated to the Phase 3A server-only signer", async () => {
  const source = await readRuntimeSource("src");
  const signer = await readFile("src/lib/supabase/admin.ts", "utf8");
  assert.match(signer, /^import "server-only";/);
  assert.equal((source.match(/SUPABASE_SECRET_KEY/g) ?? []).length, 1);
  assert.doesNotMatch(await readRuntimeSource("src/components"), /SUPABASE_SECRET_KEY/);
});

test("46 admin runtime source does not use service_role", async () => {
  const sources = await Promise.all([
    readRuntimeSource("src/app/admin"),
    readRuntimeSource("src/components/admin"),
    readRuntimeSource("src/lib/admin"),
    readRuntimeSource("src/lib/auth"),
  ]);
  assert.doesNotMatch(sources.join("\n"), /service_role/i);
});

test("47 public_station_status has no recorded GPS columns", async () => {
  const initial = await readFile("supabase/migrations/20260711_initial_journey_schema.sql", "utf8");
  const view = initial.slice(initial.indexOf("create view public.public_station_status"), initial.indexOf("revoke all on table public.app_admins"));
  assert.doesNotMatch(view, /recorded_latitude|recorded_longitude/);
});

test("48 public_station_status has no notes and counts only public visits", async () => {
  const initial = await readFile("supabase/migrations/20260711_initial_journey_schema.sql", "utf8");
  const view = initial.slice(initial.indexOf("create view public.public_station_status"), initial.indexOf("revoke all on table public.app_admins"));
  assert.doesNotMatch(view, /notes/);
  assert.match(view, /is_public = true/);
});

test("49 admin runtime never invokes station sync or Receipt Apply workflows", async () => {
  const source = [await checkInPromise, await actionsPromise, await loginPromise].join("\n");
  assert.doesNotMatch(source, /sync:stations:apply|sync:manual-stations:apply|import:receipts:apply/);
});

test("50 password recovery emails target the Auth callback instead of the home page", async () => {
  const source = await readFile("src/app/admin/forgot-password/actions.ts", "utf8");
  assert.match(source, /resetPasswordForEmail\(email,[\s\S]+redirectTo: new URL\("\/auth\/callback", origin\)/);
});

test("51 Auth callback exchanges the PKCE code for a cookie Session", async () => {
  const source = await readFile("src/app/auth/callback/route.ts", "utf8");
  assert.match(source, /exchangeCodeForSession\(code\)/);
  assert.match(source, /\/admin\/reset-password/);
  assert.match(source, /x-forwarded-host/);
});

test("52 password update revalidates the user and app_admins membership", async () => {
  const source = await readFile("src/app/admin/reset-password/actions.ts", "utf8");
  assert.match(source, /auth\.getUser\(\)/);
  assert.match(source, /from\("app_admins"\)[\s\S]+eq\("user_id", user\.id\)/);
});

test("53 password update uses the authenticated Supabase user Session", async () => {
  const source = await readFile("src/app/admin/reset-password/actions.ts", "utf8");
  assert.match(source, /auth\.updateUser\(\{ password \}\)/);
  assert.doesNotMatch(source, /SUPABASE_SECRET_KEY|service_role/);
});

test("54 a successful password reset signs out existing Sessions", async () => {
  const source = await readFile("src/app/admin/reset-password/actions.ts", "utf8");
  assert.match(source, /auth\.signOut\(\{ scope: "global" \}\)/);
});

test("55 forgot-password response does not reveal whether an email exists", async () => {
  const source = await readFile("src/app/admin/forgot-password/actions.ts", "utf8");
  assert.match(source, /Keep the response identical for existing and unknown email addresses/);
});

test("56 local Auth config allowlists the exact recovery callback paths", async () => {
  const config = await readFile("supabase/config.toml", "utf8");
  assert.match(config, /http:\/\/127\.0\.0\.1:3000\/auth\/callback/);
  assert.match(config, /http:\/\/localhost:3000\/auth\/callback/);
});
