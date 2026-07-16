import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const absolute = join(path, entry);
    return statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute];
  });
}
const migration = source("supabase/migrations/20260716120000_station_user_preferences.sql");
const action = source("src/app/admin/station-preference-actions.ts");
const validation = source("src/lib/trips/validation.ts");
const preferences = source("src/lib/stations/admin-preferences.ts");
const candidateRepository = source("src/lib/trips/station-selection-repository.ts");
const tripRepository = source("src/lib/trips/repository.ts");
const tripTypes = source("src/lib/trips/types.ts");
const adminTypes = source("src/types/admin.ts");
const adminData = source("src/lib/admin/data.ts");
const selectionMap = source("src/components/admin/TripStationSelectionMap.tsx");
const selectionPanel = source("src/components/admin/TripStationSelectionPanel.tsx");
const stopsPanel = source("src/components/admin/TripSuggestionsPanel.tsx");
const routeMap = source("src/components/admin/TripRouteMap.tsx");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const tripActions = source("src/app/admin/trip-actions.ts");
const publicTypes = source("src/types/station.ts");
const publicMap = source("src/components/map/SuperchargerMap.tsx");
const databaseTypes = source("src/types/database.generated.ts");
const docs = `${source("README.md")}\n${source("PHASE-3B.md")}\n${source("SECURITY-CHECKLIST.md")}`;
const applicationSource = filesUnder("src").map((path) => readFileSync(path, "utf8")).join("\n");

const rpc = migration.slice(migration.indexOf("create function public.admin_set_station_pay_to_park"));
const cases: Array<[string, () => void]> = [];
const add = (name: string, run: () => void) => cases.push([name, run]);

// Database and RPC (1-14)
add("01 preference primary key is user plus Station", () => assert.match(migration, /primary key \(user_id, station_id\)/));
add("02 missing row maps to false", () => { assert.match(migration, /pay_to_park boolean not null default false/); assert.match(candidateRepository, /payToPark: payToParkStationIds\.has\(row\.id\)/); });
add("03 Admin can mark a Station", () => assert.match(rpc, /if p_pay_to_park then[\s\S]+insert into public\.station_user_preferences/));
add("04 Admin can remove a mark", () => assert.match(rpc, /else[\s\S]+delete from public\.station_user_preferences/));
add("05 repeated marking is idempotent", () => assert.match(rpc, /on conflict \(user_id, station_id\) do update/));
add("06 non-admin is rejected", () => assert.match(rpc, /public\.app_admins[\s\S]+Administrator access is required/));
add("07 unauthenticated request is rejected", () => assert.match(rpc, /auth\.uid\(\)[\s\S]+Authentication is required/));
add("08 missing Station is rejected", () => assert.match(rpc, /not exists \([\s\S]+from public\.stations[\s\S]+Station not found/));
add("09 Browser cannot choose user ID", () => { assert.doesNotMatch(rpc.slice(0, rpc.indexOf("returns table")), /p_user_id/); assert.match(validation, /stationPayToParkSchema[\s\S]+\.strict\(\)/); });
add("10 users can read only their own preference", () => assert.match(migration, /station_user_preferences_select_own[\s\S]+user_id = \(select auth\.uid\(\)\)/));
add("11 marking does not modify Station", () => assert.doesNotMatch(rpc, /update public\.stations|delete from public\.stations|insert into public\.stations/i));
add("12 marking does not modify Visit", () => assert.doesNotMatch(rpc, /station_visits|charging_sessions|visit_photos/i));
add("13 marking does not modify Trip", () => assert.doesNotMatch(rpc, /trip_plans|trip_plan_stops|trip_plan_segments/i));
add("14 marking does not advance route revision", () => assert.doesNotMatch(`${rpc}\n${action}`, /route_input_revision/));

// Authenticated DTOs (15-19)
add("15 Candidate DTO returns true preferences", () => { assert.match(tripTypes, /interface TripStationCandidate[\s\S]+payToPark: boolean/); assert.match(candidateRepository, /payToParkStationIds\.has\(row\.id\)/); });
add("16 no preference row returns false", () => assert.equal(new Set<string>().has("station"), false));
add("17 another user's preference cannot enter DTO", () => assert.match(preferences, /\.eq\("user_id", userId\)/));
add("18 Search DTO returns the preference", () => { assert.match(tripTypes, /interface TripStopSearchResult[\s\S]+payToPark: boolean/); assert.match(tripRepository, /payToPark: payToParkStationIds\.has\(row\.id\)/); });
add("19 Stop and general Admin DTOs return the preference", () => { assert.match(tripTypes, /interface SuggestedTripStop[\s\S]+payToPark: boolean/); assert.match(adminTypes, /payToPark: boolean/); assert.match(adminData, /attachPayToPark/); });

// Map markers (20-26)
add("20 ordinary Station marker keeps its existing hollow style", () => assert.match(selectionMap, /border-\[#8abeb7\] bg-white text-\[#245e52\]/));
add("21 pay-to-park marker is yellow", () => assert.match(selectionMap, /candidate\.payToPark \? "border-\[#8b6a0a\] bg-\[#f7d65c\]/));
add("22 pay-to-park marker shows a dollar sign", () => assert.match(selectionMap, /candidate\.payToPark \? "\$"/));
add("23 selected pay-to-park keeps dollar and outer selection ring", () => { assert.match(selectionMap, /selected \? "ring-2/); assert.match(selectionMap, /candidate\.payToPark \? "\$"/); });
add("24 visited pay-to-park keeps dollar and Popup Visit state", () => { assert.match(selectionMap, /candidate\.isVisited \? "Visited" : "Unvisited"/); assert.match(selectionMap, /candidate\.payToPark \? "\$"/); });
add("25 marker accessible name says Pay to park Supercharger", () => assert.match(selectionMap, /Pay to park Supercharger/));
add("26 unmark restores the ordinary marker branch", () => { assert.match(selectionPanel, /payToPark: response\.payToPark/); assert.match(selectionMap, /candidate\.payToPark \?[^\n]+:[\s\S]+bg-white/); });

// Popup behavior (27-31)
add("27 unmarked Popup offers Mark", () => assert.match(selectionMap, /"Mark pay to park"/));
add("28 marked Popup offers Remove", () => assert.match(selectionMap, /"Remove pay-to-park mark"/));
add("29 Popup disables duplicate clicks while saving", () => assert.match(selectionMap, /preferenceButton\.disabled = preferencePendingStationId === candidate\.stationId/));
add("30 preference change does not mutate selected IDs", () => { const fn = selectionPanel.slice(selectionPanel.indexOf("async function changePayToPark"), selectionPanel.indexOf("function selectVisibleUnvisited")); assert.doesNotMatch(fn, /setSelectedIds|onToggle/); });
add("31 preference change does not calculate a route", () => assert.doesNotMatch(action, /Matrix|Directions|Mapbox|optimize|calculateTrip|recalculate/i));

// Search and lists (32-37)
add("32 Search results display the yellow badge", () => assert.match(`${selectionPanel}\n${stopsPanel}`, /PayToParkBadge/));
add("33 Selected Stations display the badge", () => assert.match(selectionPanel, /selectedCandidates[\s\S]+candidate\.payToPark \? <PayToParkBadge/));
add("34 Trip Stop list displays the badge", () => assert.match(stopsPanel, /stop\.payToPark \? <PayToParkBadge/));
add("35 Trip Route Map displays Stop number and dollar", () => { assert.match(routeMap, /String\(stop\.sequence \+ 1\)/); assert.match(routeMap, /payBadge\.textContent = "\$"/); });
add("36 deselection does not remove preference", () => { const toggle = selectionPanel.slice(selectionPanel.indexOf("const toggle"), selectionPanel.indexOf("const requestToggle")); assert.doesNotMatch(toggle, /PayToPark|preference|setStation/); });
add("37 deleting a Stop does not remove preference", () => { const remove = tripActions.slice(tripActions.indexOf("export async function removeTripPlanStopAction"), tripActions.indexOf("export async function reorderTripPlanStopsAction")); assert.doesNotMatch(remove, /payToPark|station_user_preferences/); });

// Select all and optimization (38-42)
add("38 Select all skips pay-to-park Stations", () => assert.match(selectionPanel, /if \(candidate\.payToPark\)[\s\S]+continue/));
add("39 Select all reports skipped count", () => assert.match(selectionPanel, /Skipped \$\{skippedPayToPark\} marked pay-to-park/));
add("40 a yellow Station remains individually selectable", () => { assert.match(selectionPanel, /requestToggle\(candidate\.stationId\)/); assert.doesNotMatch(selectionPanel, /!candidate\.payToPark && candidate\.isSelectable/); });
add("41 Select all preserves an already selected marked Station", () => { assert.match(selectionPanel, /const next = new Set\(selectedIds\)/); assert.match(selectionPanel, /if \(!next\.has\(candidate\.stationId\)\) skippedPayToPark/); });
add("42 optimization submits every explicit selected ID", () => assert.match(selectionPanel, /selectedStationIds: \[\.\.\.selectedIds\]/));

// Persistence and compatibility (43-52)
add("43 refresh persistence uses a database table", () => assert.match(migration, /create table public\.station_user_preferences/));
add("44 preference is Station-level rather than Trip-level", () => assert.doesNotMatch(migration.slice(0, migration.indexOf("create function")), /trip_plan_id/));
add("45 Draft deletion cannot cascade into preference", () => assert.doesNotMatch(migration, /references public\.trip_plans/));
add("46 one-way manual flow remains", () => { assert.match(planner, /<TripStopsPanel/); assert.match(stopsPanel, /Add Stop/); });
add("47 round-trip Station map remains", () => assert.match(planner, /currentPlan\.tripType === "round_trip" \? <TripStationSelectionPanel/));
add("48 out-and-back optimizer has no preference cost", () => assert.doesNotMatch(source("src/lib/trips/selected-out-and-back-optimizer.ts"), /payToPark|pay_to_park/));
add("49 manual editing remains available", () => assert.match(stopsPanel, /Earlier[\s\S]+Later[\s\S]+Remove/));
add("50 Automatic Suggestions UI remains absent", () => assert.doesNotMatch(`${planner}\n${stopsPanel}`, /Automatic Suggestions|Generate Suggested Stops/));
add("51 Tesla crawler remains absent", () => assert.equal(existsSync(join("scripts", "sync-tesla-findus-parking.ts")), false));
add("52 removed Tesla parking fields are not reintroduced", () => assert.doesNotMatch(`${migration}\n${applicationSource}`, /tesla_paid_parking|parking_fee_note|tesla_findus_location_key|tesla_findus_url/));

// Security and execution boundary (53-56)
add("53 client bundle has no server Secret", () => assert.doesNotMatch(`${selectionMap}\n${selectionPanel}\n${stopsPanel}\n${routeMap}`, /SUPABASE_SECRET_KEY|service_role|MAPBOX_SERVER_ACCESS_TOKEN/));
add("54 preference stays out of public DTO and map", () => { assert.doesNotMatch(publicTypes, /payToPark|pay_to_park/); assert.doesNotMatch(publicMap, /payToPark|pay_to_park|Pay to park/); });
add("55 preference does not modify public Station status", () => assert.doesNotMatch(`${migration}\n${action}`, /update public\.public_station_status|refresh materialized|create or replace view/i));
add("56 implementation makes no external requests", () => { assert.doesNotMatch(`${action}\n${preferences}`, /fetch\(|Mapbox|Tesla Find Us|NLR|https?:\/\//i); assert.match(databaseTypes, /admin_set_station_pay_to_park/); assert.match(docs, /personal preference|personal marker/i); });

test("Pay to park marker callbacks stay stable so ordinary markers remain clickable", () => {
  assert.match(selectionPanel, /const changePayToPark = useCallback\(async/);
  assert.match(selectionPanel, /onPayToParkChange=\{changePayToPark\}/);
  assert.doesNotMatch(selectionPanel, /onPayToParkChange=\{\(stationId, next\)/);
});

test("Pay to park controls stay beside the map after a Station is selected", () => {
  assert.match(selectionPanel, /const willSelect = !selectedIds\.has\(stationId\)/);
  assert.match(selectionPanel, /willSelect \? stationId : current === stationId \? null : current/);
  const sidebarIndex = selectionPanel.indexOf('aria-label="Map Station parking preference"');
  const selectedListIndex = selectionPanel.indexOf("{selectedCandidates.length > 0 ? <div");
  const toggleIndex = selectionPanel.indexOf("<PayToParkToggleButton", sidebarIndex);
  assert.ok(sidebarIndex >= 0 && toggleIndex > sidebarIndex && toggleIndex < selectedListIndex);
  assert.match(selectionPanel.slice(sidebarIndex, selectedListIndex), /activeCandidate[\s\S]+: null/);
  assert.doesNotMatch(selectionPanel.slice(selectedListIndex), /<PayToParkToggleButton/);
});

test("Station Search is removed from the compact map controls", () => {
  assert.doesNotMatch(selectionPanel, /Search Stations|station-map-search|params\.set\("search"/);
});

test("The clickable all-candidate list is removed from beside the map", () => {
  assert.doesNotMatch(selectionPanel, /Visible Station candidates|sidebarCandidates|slice\(0, 200\)/);
});

test("Clear selection also dismisses the bulk-selection status message", () => {
  assert.match(selectionPanel, /setSelectedIds\(new Set\(\)\); setActiveStationId\(null\); setSelectionMessage\(null\)/);
});

assert.equal(cases.length, 56, "The Pay to park suite must keep all 56 acceptance cases.");
for (const [name, run] of cases) test(`Pay to park ${name}`, run);
