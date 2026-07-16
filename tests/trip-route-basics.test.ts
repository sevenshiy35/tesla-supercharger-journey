import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const manager = source("src/components/admin/TripDraftManager.tsx");
const newForm = source("src/components/admin/NewTripForm.tsx");
const basics = source("src/components/admin/TripRouteBasicsFields.tsx");
const picker = source("src/components/admin/TripEndpointPicker.tsx");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const selection = source("src/components/admin/TripStationSelectionPanel.tsx");
const stops = source("src/components/admin/TripSuggestionsPanel.tsx");
const detail = source("src/app/admin/(protected)/trips/[id]/page.tsx");
const actions = source("src/app/admin/trip-actions.ts");
const validation = source("src/lib/trips/validation.ts");
const repository = source("src/lib/trips/repository.ts");
const tripTypes = source("src/lib/trips/types.ts");
const candidateApi = source("src/app/api/admin/trips/[id]/station-candidates/route.ts");
const routeMigration = source("supabase/migrations/20260715235500_trip_route_basics.sql");
const endpointMigration = source("supabase/migrations/20260715180000_trip_route_endpoints.sql");
const selectedMigration = source("supabase/migrations/20260715220000_trip_selected_out_and_back.sql");
const databaseTypes = source("src/types/database.ts");

const clientSources = [manager, newForm, basics, picker, planner, selection, stops, detail].join("\n");
const routeBasicsAction = actions.slice(
  actions.indexOf("export async function saveTripPlanRouteBasicsAction"),
  actions.indexOf("export async function updateTripPlanSettingsAction"),
);

const cases: Array<[string, () => void]> = [];
const add = (name: string, body: () => void) => cases.push([name, body]);

// UI removal (1-8)
add("01 Draft actions does not show Route corridor", () => assert.doesNotMatch(manager, /Route corridor/i));
add("02 Draft actions does not show Maximum extra driving time", () => assert.doesNotMatch(manager, /Maximum extra driving time/i));
add("03 Draft actions does not show Maximum extra distance", () => assert.doesNotMatch(manager, /Maximum extra distance/i));
add("04 Draft actions does not show Estimated time at each station", () => assert.doesNotMatch(manager, /Estimated time at each station/i));
add("05 Draft actions does not show Save Settings", () => assert.doesNotMatch(manager, /Save Settings/i));
add("06 old automatic objective card is absent", () => assert.doesNotMatch(`${manager}\n${newForm}`, /add as many unvisited stations as possible within your detour budget/i));
add("07 Planning limits copy is absent from current UI", () => assert.doesNotMatch(clientSources, /Planning limits|Edit planning limits/i));
add("08 Draft actions exposes Edit route and Delete draft", () => { assert.match(manager, /Edit route/); assert.match(manager, /Delete draft/); });

// Route basics (9-16)
add("09 Trip Type shares the endpoint fields component", () => { assert.match(basics, /Trip Type/); assert.equal((basics.match(/<TripEndpointPicker/g) ?? []).length, 2); });
add("10 One-way is selectable", () => assert.match(basics, /\["one_way", "One way"\]/));
add("11 Round-trip is selectable", () => assert.match(basics, /\["round_trip", "Round trip"\]/));
add("12 Round-trip explains its turnaround destination", () => assert.match(basics, /The destination is the turnaround point\. The trip returns to the origin after visiting it\./));
add("13 Origin input is present", () => assert.match(basics, /title="Origin"/));
add("14 Destination input is present", () => { assert.match(basics, /Turnaround destination/); assert.match(basics, /"Destination"/); });
add("15 route basics uses one dynamic primary save or calculate button", () => { assert.match(planner, /routeBasicsDirty \? "Save Route Basics" : "Calculate Base Route"/); assert.equal((planner.match(/Save Route Basics/g) ?? []).length, 1); });
add("16 Trip Type control is not duplicated", () => assert.equal((basics.match(/name="tripType"/g) ?? []).length, 1));

// Revision and invalidation (17-26)
add("17 unchanged route basics returns without another revision", () => { assert.match(routeMigration, /v_endpoint_changed or v_type_changed/); assert.match(routeMigration, /v_type_changed := v_before\.trip_type is distinct from p_trip_type/); });
add("18 unchanged values do not enter either invalidation branch", () => assert.match(routeMigration, /if v_endpoint_changed then[\s\S]+elsif v_type_changed then/));
add("19 Trip Type-only change advances revision", () => assert.match(routeMigration, /elsif v_type_changed then[\s\S]+route_input_revision = tp\.route_input_revision \+ 1/));
add("20 Origin changes are null-safe and advance through endpoint revision", () => assert.match(endpointMigration, /origin_source is distinct from p_origin_source[\s\S]+route_input_revision = tp\.route_input_revision \+ 1/));
add("21 Destination changes are null-safe and advance through endpoint revision", () => assert.match(endpointMigration, /destination_source is distinct from p_destination_source[\s\S]+route_input_revision = tp\.route_input_revision \+ 1/));
add("22 real route changes clear Stops", () => assert.match(routeMigration, /delete from public\.trip_plan_stops/));
add("23 real route changes clear Base and Planned Segments", () => assert.match(routeMigration, /delete from public\.trip_plan_segments/));
add("24 real route changes clear route metrics", () => assert.match(routeMigration, /base_distance_meters = null[\s\S]+planned_distance_meters = null[\s\S]+extra_duration_seconds = null/));
add("25 route basics does not modify Station or Visit records", () => assert.doesNotMatch(routeMigration, /(?:update|delete from)\s+public\.(?:stations|station_visits|visit_photos|charging_sessions)/i));
add("26 stale route revision is rejected", () => assert.match(routeMigration, /route_input_revision <> p_expected_revision[\s\S]+trip changed while this operation was running/i));

// Display corridor (27-33)
add("27 Display corridor remains in Station Selection", () => assert.match(selection, /Display corridor/));
add("28 Display corridor defaults to 10 miles with compact options", () => {
  assert.match(selection, /DISPLAY_CORRIDORS = \[10, 20, 30, 50\]/);
  assert.match(selection, /useState\(10\)/);
  assert.match(candidateApi, /corridorMiles[^\n]+"10"/);
  assert.match(candidateApi, /\[10, 20, 30, 50\]\.includes/);
});
add("29 Display corridor is described only as a nearby display control", () => assert.match(selection, /This only controls which nearby stations are shown on the map\./));
add("30 changing candidates preserves selected Stations", () => assert.match(selection, /selectedIdsRef\.current\.has\(candidate\.stationId\)[\s\S]+merged\.set/));
add("31 current Trip Stops remain available independently of filtering", () => { assert.match(selection, /candidate\.isAlreadyInTrip/); assert.match(selection, /Show current Trip Stops/); });
add("32 selected out-and-back validates and saves the full selected set", () => { assert.match(selectedMigration, /cardinality\(p_selected_station_ids\) <> v_stop_count/); assert.match(selectedMigration, /insert into public\.trip_plan_stops/); });
add("33 Display corridor is not a normal Trip setting", () => { assert.doesNotMatch(`${manager}\n${newForm}\n${basics}`, /Display corridor|corridorMiles/); assert.doesNotMatch(selection, /admin_update_trip_plan_settings/); });

// Objective metrics (34-41)
add("34 Base drive time is displayed", () => assert.match(`${planner}\n${selection}\n${stops}`, /Base drive time/));
add("35 Optimized drive time is displayed", () => assert.match(`${planner}\n${selection}\n${stops}`, /Optimized drive time/));
add("36 Additional drive time is displayed", () => assert.match(`${planner}\n${selection}\n${stops}`, /Additional drive time/));
add("37 Base distance is displayed", () => assert.match(`${planner}\n${selection}\n${stops}`, /Base distance/));
add("38 Optimized distance is displayed", () => assert.match(`${planner}\n${selection}\n${stops}`, /Optimized distance/));
add("39 Additional distance is displayed", () => assert.match(`${planner}\n${selection}\n${stops}`, /Additional distance/));
add("40 Budget remaining is absent", () => assert.doesNotMatch(clientSources, /Budget remaining/i));
add("41 Over budget is not a primary UI state", () => assert.doesNotMatch(clientSources, /Budget status|Over budget/i));

// Compatibility (42-49)
add("42 old Trip rows still map through the complete TripPlan mapper", () => { assert.match(repository, /mapTripPlan\(data\)/); assert.match(tripTypes, /corridorMiles: number/); });
add("43 old algorithm Stops still render as legacy saved Stops", () => assert.match(stops, /Legacy saved Stop/));
add("44 old Trips retain Recalculate Route", () => assert.match(stops, /Recalculate Route/));
add("45 retained database fields are compatible but hidden", () => { assert.match(tripTypes, /maxExtraMinutes: number/); assert.doesNotMatch(`${manager}\n${newForm}\n${basics}`, /maxExtraMinutes|stopDurationMinutes/); });
add("46 selected out-and-back remains available", () => assert.match(planner, /<TripStationSelectionPanel/));
add("47 Manual Editing remains available", () => { assert.match(stops, /Add Stop/); assert.match(stops, /Earlier/); assert.match(stops, /Later/); });
add("48 One-way retains the manual Stops panel", () => { assert.match(planner, /<TripStopsPanel/); assert.match(stops, /plan\.tripType === "round_trip"/); });
add("49 Automatic Suggestions UI remains absent", () => assert.doesNotMatch(clientSources, /Automatic Suggestions|Generate Suggested Stops|Regenerate Suggestions/));

// Security (50-57)
add("50 route basics RPC checks auth.uid", () => assert.match(routeMigration, /auth\.uid\(\)/));
add("51 route basics RPC checks app_admins", () => assert.match(routeMigration, /public\.app_admins/));
add("52 route basics RPC scopes ownership", () => assert.match(routeMigration, /tp\.user_id = v_user_id/));
add("53 route basics RPC fixes search_path", () => assert.equal((routeMigration.match(/set search_path = public/g) ?? []).length, 2));
add("54 Browser route basics cannot submit Metrics", () => assert.doesNotMatch(routeBasicsAction, /p_(?:base|planned|extra|corridor_candidate|evaluated_candidate|unreachable_candidate)/));
add("55 Browser route basics cannot submit Geometry", () => assert.doesNotMatch(routeBasicsAction, /geometry|p_segments|p_stops|p_status|p_user_id/i));
add("56 Client Bundle has no Mapbox server token", () => assert.doesNotMatch(clientSources, /MAPBOX_SERVER_ACCESS_TOKEN/));
add("57 Client Bundle has no Supabase Secret", () => { assert.doesNotMatch(clientSources, /SUPABASE_SECRET_KEY|service_role/); assert.match(databaseTypes, /admin_update_trip_plan_route_basics/); assert.match(validation, /tripRouteBasicsSchema/); });

assert.equal(cases.length, 57, "The simplified Trip Planner suite must keep all 57 requested cases.");
for (const [name, body] of cases) test(`Trip route basics ${name}`, body);
