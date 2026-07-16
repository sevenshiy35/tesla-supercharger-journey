import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { maximizeSuggestedStops, type SuggestionRouteNode } from "../src/lib/trips/suggestion-algorithm";
import type { CorridorCandidate } from "../src/lib/trips/corridor";

const source = (path: string) => readFileSync(path, "utf8");
const migration = source("supabase/migrations/20260715210000_trip_manual_editing.sql");
const oldMigration = source("supabase/migrations/20260715200000_trip_suggestion_algorithm.sql");
const actions = source("src/app/admin/trip-actions.ts");
const repository = source("src/lib/trips/repository.ts");
const service = source("src/lib/trips/manual-editing-service.ts");
const suggestionService = source("src/lib/trips/suggestion-service.ts");
const algorithm = source("src/lib/trips/suggestion-algorithm.ts");
const panel = source("src/components/admin/TripSuggestionsPanel.tsx");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const map = source("src/components/admin/TripRouteMap.tsx");
const types = source("src/lib/trips/types.ts");
const dbTypes = source("src/types/database.generated.ts");
const phase = source("PHASE-3B.md");

function body(name: string) {
  return migration.match(new RegExp(`create function public\\.${name}\\([\\s\\S]+?\\n\\$\\$;`, "i"))?.[0] ?? "";
}

let number = 0;
function check(name: string, run: () => void | Promise<void>) {
  number += 1;
  test(`3B.4 ${String(number).padStart(3, "0")} ${name}`, run);
}

check("uses a new migration after 3B.3", () => assert.match(migration, /^begin;/));
check("adds planned_route_stale", () => assert.match(migration, /add column planned_route_stale boolean/));
check("stale defaults false", () => assert.match(migration, /planned_route_stale boolean not null default false/));
check("does not persist an internal shortlist setting", () => assert.doesNotMatch(migration, /MATRIX_SHORTLIST_LIMIT|matrix_shortlist_limit/));
check("makes sequence uniqueness deferrable", () => assert.match(migration, /unique \(trip_plan_id, sequence\) deferrable/));
check("retains the old 3B.3 save RPC", () => assert.match(oldMigration, /admin_save_trip_plan_suggestions/));
check("adds the manual Stop RPC", () => assert.match(migration, /admin_add_trip_plan_stop/));
check("adds the remove Stop RPC", () => assert.match(migration, /admin_remove_trip_plan_stop/));
check("adds the lock RPC", () => assert.match(migration, /admin_set_trip_plan_stop_lock/));
check("adds the reorder RPC", () => assert.match(migration, /admin_reorder_trip_plan_stops/));
check("adds the exact recalculate save RPC", () => assert.match(migration, /admin_save_recalculated_trip_route/));
check("adds the Anchor-aware save RPC", () => assert.match(migration, /admin_save_reoptimized_trip_plan/));
check("adds a distinct scratch save RPC", () => assert.match(migration, /admin_save_regenerated_trip_plan/));

for (const rpc of ["admin_add_trip_plan_stop", "admin_remove_trip_plan_stop", "admin_set_trip_plan_stop_lock", "admin_reorder_trip_plan_stops", "admin_save_recalculated_trip_route", "admin_save_reoptimized_trip_plan", "admin_save_regenerated_trip_plan"]) {
  check(`${rpc} is security definer`, () => assert.match(body(rpc), /security definer/i));
  check(`${rpc} fixes search_path`, () => assert.match(body(rpc), /set search_path = public/i));
  check(`${rpc} requires the administrator allowlist`, () => assert.match(body(rpc), /public\.app_admins/i));
  check(`${rpc} scopes ownership to auth.uid`, () => assert.match(body(rpc), /tp\.user_id = v_user_id/i));
  check(`${rpc} restricts changes to Drafts`, () => assert.match(body(rpc), /status <> 'draft'/i));
  check(`${rpc} checks the expected revision`, () => assert.match(body(rpc), /route_input_revision <> p_expected_revision/i));
}

const addBody = body("admin_add_trip_plan_stop");
check("manual add fixes source on the server", () => assert.match(addBody, /'manual', true, 'planned'/));
check("manual add keeps algorithm fields null", () => assert.match(addBody, /null, null, null, null, null, null/));
check("manual add rejects endpoints", () => assert.match(addBody, /endpoint Station cannot also be a Trip Stop/));
check("manual add rejects duplicates", () => assert.match(addBody, /already in this Trip Plan/));
check("manual add validates coordinates", () => assert.match(addBody, /latitude between -90 and 90/));
check("manual add rejects clearly closed statuses", () => assert.match(addBody, /permanently closed/));
check("manual add does not require unvisited status", () => assert.doesNotMatch(addBody, /station_visits/));
check("manual add allows a bounded insertion position", () => assert.match(addBody, /p_insert_position/));
check("manual add resequences atomically", () => assert.match(addBody, /set constraints trip_plan_stops_trip_sequence_key deferred/));
check("manual add increments revision", () => assert.match(addBody, /route_input_revision = tp\.route_input_revision \+ 1/));
check("manual add marks route stale", () => assert.match(addBody, /planned_route_stale = true/));
check("manual add deletes only planned Segments", () => assert.match(addBody, /route_kind = 'planned'/));
check("manual add never calls Mapbox", () => assert.doesNotMatch(addBody, /mapbox|directions|matrix/i));

const removeBody = body("admin_remove_trip_plan_stop");
check("remove accepts manual or algorithm Stop IDs", () => assert.doesNotMatch(removeBody, /source = 'algorithm'|source = 'manual'/));
check("remove resequences following Stops", () => assert.match(removeBody, /sequence = tps\.sequence - 1/));
check("remove preserves Base Segments", () => assert.match(removeBody, /route_kind = 'planned'/));
check("remove does not delete Station rows", () => assert.doesNotMatch(removeBody, /delete from public\.stations/));
check("remove does not delete Visit rows", () => assert.doesNotMatch(removeBody, /delete from public\.station_visits/));

const lockBody = body("admin_set_trip_plan_stop_lock");
check("manual Stops cannot be unlocked", () => assert.match(lockBody, /Manually added Stops are always locked/));
check("lock is algorithm-only", () => assert.match(lockBody, /v_source <> 'algorithm'/));
check("lock increments revision", () => assert.match(lockBody, /route_input_revision = tp\.route_input_revision \+ 1/));
check("lock preserves planned Segments", () => assert.doesNotMatch(lockBody, /delete from public\.trip_plan_segments/));
check("lock preserves route metrics", () => assert.doesNotMatch(lockBody, /planned_distance_meters\s*=/));
check("lock preserves stale state", () => assert.match(lockBody, /v_plan\.planned_route_stale/));

const reorderBody = body("admin_reorder_trip_plan_stops");
check("reorder accepts only stopId sequence and leg", () => assert.match(reorderBody, /item - array\['stopId','sequence','leg'\]/));
check("reorder requires every current Stop", () => assert.match(reorderBody, /include every current Stop exactly once/));
check("reorder rejects duplicate Stop IDs", () => assert.match(reorderBody, /count\(distinct item->>'stopId'\)/));
check("reorder rejects duplicate sequences", () => assert.match(reorderBody, /count\(distinct \(item->>'sequence'\)::integer\)/));
check("reorder rejects foreign Stops", () => assert.match(reorderBody, /where tps\.id is null/));
check("reorder validates one-way legs", () => assert.match(reorderBody, /trip_type = 'one_way'/));
check("reorder keeps outbound before return", () => assert.match(reorderBody, /a->>'leg' = 'return'[\s\S]+b->>'leg' = 'outbound'/));
check("reorder keeps manual Stops locked", () => assert.match(reorderBody, /tps\.source = 'manual' then true/));
check("reorder explicitly permits moving fixed Stops", () => assert.doesNotMatch(reorderBody, /is_locked[\s\S]+raise exception/));
check("reorder stales route Geometry", () => assert.match(reorderBody, /planned_route_stale = true/));

const recalcBody = body("admin_save_recalculated_trip_route");
check("recalculate preserves Stop rows", () => assert.doesNotMatch(recalcBody, /delete from public\.trip_plan_stops|insert into public\.trip_plan_stops/));
check("recalculate validates dwell time", () => assert.match(recalcBody, /stop_duration_minutes/));
check("recalculate validates Segment totals", () => assert.match(recalcBody, /Segment totals do not match/));
check("recalculate replaces planned Segments only", () => assert.match(recalcBody, /route_kind = 'planned'/));
check("recalculate does not enforce max extra time", () => assert.doesNotMatch(recalcBody, /p_extra_duration_seconds\s*>\s*v_plan\.max_extra_minutes/));
check("recalculate does not enforce max extra miles", () => assert.doesNotMatch(recalcBody, /p_extra_distance_meters.+max_extra_miles/));
check("recalculate clears stale", () => assert.match(recalcBody, /planned_route_stale = false/));
check("recalculate records manual-route-v1", () => assert.match(recalcBody, /manual-route-v1/));
check("recalculate leaves revision unchanged", () => assert.doesNotMatch(recalcBody, /route_input_revision\s*=.+\+\s*1/));

const reoptBody = body("admin_save_reoptimized_trip_plan");
check("reopt compares current and proposed anchors", () => assert.match(reoptBody, /v_current_anchors <> v_next_anchors/));
check("reopt anchors include manual Stops", () => assert.match(reoptBody, /tps\.source = 'manual' or tps\.is_locked/));
check("reopt anchor identity includes stopId", () => assert.match(reoptBody, /'stopId'/));
check("reopt anchor identity includes leg", () => assert.match(reoptBody, /'leg'/));
check("reopt rejects visited unlocked algorithm Stops", () => assert.match(reoptBody, /unlocked algorithm Station has already been visited/));
check("reopt permits visited anchors", () => assert.match(reoptBody, /source' = 'algorithm'[\s\S]+not \(v_item->>'isLocked'\)/));
check("reopt keeps manual rows locked", () => assert.match(reoptBody, /source' = 'manual'[\s\S]+isLocked/));
check("reopt saves anchor algorithm version", () => assert.match(reoptBody, /anchor-max-stops-v1/));
check("reopt clears stale", () => assert.match(reoptBody, /planned_route_stale=false/));
check("reopt advances revision after changing Stop set", () => assert.match(reoptBody, /route_input_revision=tp\.route_input_revision\+1/));

check("scratch requires all rows to be algorithm rows", () => assert.match(body("admin_save_regenerated_trip_plan"), /source'<>'algorithm'/));
check("scratch requires all rows unlocked", () => assert.match(body("admin_save_regenerated_trip_plan"), /isLocked/));
check("scratch rejects visited candidates", () => assert.match(body("admin_save_regenerated_trip_plan"), /has already been visited/));
check("scratch enforces time budget", () => assert.match(body("admin_save_regenerated_trip_plan"), /max_extra_minutes\*60/));
check("scratch enforces optional distance budget", () => assert.match(body("admin_save_regenerated_trip_plan"), /max_extra_miles\*1609\.344/));
check("scratch replaces all Stop rows atomically", () => assert.match(body("admin_save_regenerated_trip_plan"), /delete from public\.trip_plan_stops[\s\S]+insert into public\.trip_plan_stops/));
check("scratch advances revision", () => assert.match(body("admin_save_regenerated_trip_plan"), /route_input_revision=tp\.route_input_revision\+1/));
check("scratch save omits the legacy algorithm-version RPC argument", () => {
  assert.match(suggestionService, /admin_save_regenerated_trip_plan", saveArguments/);
  assert.match(suggestionService, /admin_save_trip_plan_suggestions", \{[\s\S]+p_algorithm_version: TRIP_SUGGESTION_ALGORITHM_VERSION/);
  const commonArguments = suggestionService.match(/const saveArguments = \{[\s\S]+?\n  \};/)?.[0] ?? "";
  assert.doesNotMatch(commonArguments, /p_algorithm_version/);
});

check("search requires two characters", () => assert.match(repository, /normalized\.length < 2/));
check("search caps the query string", () => assert.match(repository, /slice\(0, 100\)/));
check("search covers station name", () => assert.match(repository, /\["name", "address", "city", "state", "postal_code"\]/));
check("search caps results at 25", () => assert.match(repository, /slice\(0, 25\)/));
check("search is scoped to the current Draft owner", () => assert.match(repository, /plan\.userId !== admin\.id/));
check("search checks only current user's Visits", () => assert.match(repository, /\.eq\("user_id", admin\.id\)/));
check("search reports endpoint collisions", () => assert.match(repository, /isEndpoint: endpoint/));
check("search reports duplicate Stops", () => assert.match(repository, /isExistingStop: already/));
check("manual search is independent of the display corridor", () => assert.doesNotMatch(repository, /isOutsideCorridor|plan\.corridorMiles/));
check("search allows unknown operational status with warning", () => assert.match(repository, /Operational status is unknown/));

check("Stop DTO includes manual source", () => assert.match(types, /source: TripPlanStopSource/));
check("Stop DTO includes isLocked", () => assert.match(types, /isLocked: boolean/));
check("Stop DTO includes current-user isVisited", () => assert.match(types, /isVisited: boolean/));
check("repository no longer filters algorithm-only", () => assert.doesNotMatch(repository, /\.eq\("source", "algorithm"\)/));
check("database types expose planned_route_stale", () => assert.match(dbTypes, /planned_route_stale: boolean/));
check("actions submit only IDs and expected revision for remove", () => assert.match(actions, /removeTripPlanStopAction\(tripPlanId: string, stopId: string, expectedRevision: number\)/));
check("actions expose exact recalculate", () => assert.match(actions, /recalculateTripRouteAction/));
check("actions remove the Anchor reoptimization product entry", () => assert.doesNotMatch(actions, /reoptimizeTripRouteAction/));
check("actions map concurrency to the exact safe message", () => assert.match(actions, /The trip changed while this operation was running\. Refresh and try again\./));

check("exact service routes current Stops in sequence", () => assert.match(service, /stops\.map\(\(stop, sequence\)/));
check("exact service calls Directions rather than Matrix", () => assert.match(service, /calculateSegmentedPlannedRoute/));
check("Anchor baseline is calculated before optimization", () => assert.match(service, /const anchorExact = await exactRoute/));
check("over-budget Anchor baseline skips the greedy branch", () => assert.match(service, /if \(isWithinDetourBudget\(anchorExtra, plan\)\)/));
check("budget correction removes only unlocked algorithm Stops", () => assert.match(service, /stop\.source === "algorithm" && !stop\.isLocked/));
check("Anchor routes keep Destination fixed", () => assert.match(service, /key: "destination", kind: "destination"/));
check("existing unlocked Stops retain Anchor intervals", () => assert.match(service, /existingIntervals/));
check("new candidates stay on their nearest leg", () => assert.match(service, /edge\.leg === candidate\.nearestLeg/));
check("algorithm accepts a fixed initial route", () => assert.match(algorithm, /initialRouteNodes/));
check("algorithm accepts a fixed baseline detour", () => assert.match(algorithm, /initialExtraDriveSeconds/));

check("UI has Add Stop", () => assert.match(panel, /Add Stop/));
check("UI search is debounced", () => assert.match(panel, /setTimeout[\s\S]+300/));
check("UI offers outbound add", () => assert.match(panel, /Add Outbound/));
check("Round Trip UI offers return add", () => assert.match(panel, /Add Return/));
check("UI does not present a planning corridor warning", () => assert.doesNotMatch(panel, /Outside the original planning corridor|outside the corridor/i));
check("UI distinguishes Visited and Expected new", () => { assert.match(panel, /Visited/); assert.match(panel, /Expected new/); });
check("UI distinguishes Manual and legacy saved Stops", () => { assert.match(panel, /Manually added/); assert.match(panel, /Legacy saved Stop/); });
check("UI offers accessible Earlier and Later buttons", () => { assert.match(panel, />Earlier</); assert.match(panel, />Later</); });
check("UI supports drag and drop", () => { assert.match(panel, /draggable=/); assert.match(panel, /onDrop=/); });
check("UI offers Round Trip leg movement", () => assert.match(panel, /Move to/));
check("UI removes algorithm Lock and Unlock", () => { assert.doesNotMatch(panel, />Unlock</); assert.doesNotMatch(panel, />Lock</); });
check("no Stop lock control is rendered", () => assert.doesNotMatch(panel, /setTripPlanStopLockAction/));
check("remove confirmation names the Station", () => assert.match(panel, /Remove \{removeStop\.stationName\}/));
check("all Stop controls meet 44px target", () => assert.match(panel, /min-h-11/));
check("UI has Recalculate Route", () => assert.match(panel, /Recalculate Route/));
check("UI removes Re-optimize Unlocked Stops", () => assert.doesNotMatch(panel, /Re-optimize Unlocked Stops/));
check("UI removes automatic Advanced section", () => assert.doesNotMatch(panel, /Advanced: Automatic Suggestions|Regenerate From Scratch/));
check("automatic scratch warning is removed", () => assert.doesNotMatch(panel, /creates a new automatic plan/));
check("stale warning is explicit", () => assert.match(panel, /Route needs recalculation/));
check("budget warning is removed from manual editing", () => assert.doesNotMatch(panel, /Manual edits may exceed the detour budget|Over budget/));
check("summary counts expected new Stops", () => assert.match(panel, /Expected new check-ins/));
check("summary counts manual and legacy Stops", () => assert.match(panel, /Manual \/ Legacy/));
check("summary shows leg counts", () => assert.match(panel, /Outbound \/ Return/));
check("summary shows objective additional metrics", () => { assert.match(panel, /Additional drive time/); assert.match(panel, /Additional distance/); assert.doesNotMatch(panel, /Budget status/); });
check("Destination is a fixed card between legs", () => assert.match(panel, /Fixed route endpoint/));
check("map styles manual markers distinctly", () => assert.match(map, /stop\.source === "manual"/));
check("map exposes legacy and Visit state in popup", () => { assert.match(map, /Legacy saved Stop/); assert.match(map, /Expected new/); });
check("stale planned line is faded", () => assert.match(map, /plannedRouteStale \? 0\.25/));
check("planner synchronizes map Stops after edits", () => assert.match(planner, /onStopsEdited=\{suggestionsEdited\}/));
check("Phase document names 3B.4", () => assert.match(phase, /3B\.4/));

function candidate(id: string, longitude: number): CorridorCandidate {
  return { id, externalId: id, name: id, address: "a", city: "c", state: "s", postalCode: null, country: "US", latitude: 0, longitude,
    operationalStatus: "open", stallCount: null, maxPowerKw: null, corridorDistanceMeters: 0, routeProgress: longitude / 10, nearestSegmentIndex: 0, nearestLeg: "outbound" };
}
async function matrix(coordinates: Array<{ longitude: number; latitude: number }>) {
  const cost = coordinates.map((from) => coordinates.map((to) => Math.round(Math.hypot(from.longitude - to.longitude, from.latitude - to.latitude) * 100)));
  return { durationsSeconds: cost, distancesMeters: cost };
}
const anchored: SuggestionRouteNode[] = [
  { key: "origin:start", kind: "origin", stationId: null, initialLeg: null, longitude: 0, latitude: 0 },
  { key: "anchor:fixed", kind: "station", stationId: "fixed", initialLeg: "outbound", longitude: 5, latitude: 0 },
  { key: "destination", kind: "destination", stationId: null, initialLeg: null, longitude: 10, latitude: 0 },
];
check("fixed initial route is retained with no candidates", async () => {
  const result = await maximizeSuggestedStops({ tripType: "one_way", origin: { longitude: 0, latitude: 0 }, destination: { longitude: 10, latitude: 0 }, candidates: [], maxExtraMinutes: 10, maxExtraMiles: null, legacyMaxStops: null, initialRouteNodes: anchored }, matrix);
  assert.deepEqual(result.routeNodes.map((node) => node.key), anchored.map((node) => node.key));
});
check("candidate insertion never removes an Anchor", async () => {
  const result = await maximizeSuggestedStops({ tripType: "one_way", origin: { longitude: 0, latitude: 0 }, destination: { longitude: 10, latitude: 0 }, candidates: [candidate("new", 2)], maxExtraMinutes: 10, maxExtraMiles: null, legacyMaxStops: null, initialRouteNodes: anchored }, matrix);
  assert.ok(result.routeNodes.some((node) => node.key === "anchor:fixed"));
});
check("initial Anchor detour consumes time budget", async () => {
  const result = await maximizeSuggestedStops({ tripType: "one_way", origin: { longitude: 0, latitude: 0 }, destination: { longitude: 10, latitude: 0 }, candidates: [candidate("new", 2)], maxExtraMinutes: 1, maxExtraMiles: null, legacyMaxStops: null, initialRouteNodes: anchored, initialExtraDriveSeconds: 61 }, matrix);
  assert.equal(result.selectedStops.length, 0);
});
check("initial Anchor detour consumes distance budget", async () => {
  const result = await maximizeSuggestedStops({ tripType: "one_way", origin: { longitude: 0, latitude: 0 }, destination: { longitude: 10, latitude: 0 }, candidates: [candidate("new", 2)], maxExtraMinutes: 10, maxExtraMiles: 0, legacyMaxStops: null, initialRouteNodes: anchored, initialExtraDistanceMeters: 1 }, matrix);
  assert.equal(result.selectedStops.length, 0);
});
check("Anchor interval predicate can forbid every edge", async () => {
  const result = await maximizeSuggestedStops({ tripType: "one_way", origin: { longitude: 0, latitude: 0 }, destination: { longitude: 10, latitude: 0 }, candidates: [candidate("new", 2)], maxExtraMinutes: 10, maxExtraMiles: null, legacyMaxStops: null, initialRouteNodes: anchored, canInsertCandidate: () => false }, matrix);
  assert.equal(result.selectedStops.length, 0);
});
check("Anchor interval predicate can allow a selected edge", async () => {
  const result = await maximizeSuggestedStops({ tripType: "one_way", origin: { longitude: 0, latitude: 0 }, destination: { longitude: 10, latitude: 0 }, candidates: [candidate("new", 2)], maxExtraMinutes: 10, maxExtraMiles: null, legacyMaxStops: null, initialRouteNodes: anchored, canInsertCandidate: (_candidate, _nodes, edge) => edge === 0 }, matrix);
  assert.equal(result.selectedStops.length, 1);
});
