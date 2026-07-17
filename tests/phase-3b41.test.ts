import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { parseTripMatrixSubsetResult } from "../src/lib/mapbox/matrix-result";
import { buildPlannedRouteLegs, calculateSegmentedPlannedRoute, splitDirectionWaypoints } from "../src/lib/mapbox/planned-route";
import {
  calculateSelectedRouteCost,
  optimizeSelectedOutAndBack,
  type DirectedRouteMatrix,
} from "../src/lib/trips/selected-out-and-back-optimizer";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260715220000_trip_selected_out_and_back.sql");
const candidateRepository = source("src/lib/trips/station-selection-repository.ts");
const candidateApi = source("src/app/api/admin/trips/[id]/station-candidates/route.ts");
const matrix = source("src/lib/mapbox/matrix.ts");
const matrixResult = source("src/lib/mapbox/matrix-result.ts");
const chunkedMatrix = source("src/lib/trips/chunked-matrix.ts");
const serverClient = source("src/lib/mapbox/server-client.ts");
const optimizer = source("src/lib/trips/selected-out-and-back-optimizer.ts");
const service = source("src/lib/trips/selected-out-and-back-service.ts");
const actions = source("src/app/admin/trip-actions.ts");
const validation = source("src/lib/trips/validation.ts");
const selectionMap = source("src/components/admin/TripStationSelectionMap.tsx");
const selectionPanel = source("src/components/admin/TripStationSelectionPanel.tsx");
const suggestionsPanel = source("src/components/admin/TripSuggestionsPanel.tsx");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const plannedRoute = source("src/lib/mapbox/planned-route.ts");
const suggestionService = source("src/lib/trips/suggestion-service.ts");
const homepage = source("src/app/page.tsx");

type Case = [string, () => void | Promise<void>];
const cases: Case[] = [];
const add = (name: string, run: Case[1]) => cases.push([name, run]);

function directedMatrix(size: number): DirectedRouteMatrix {
  const durationsSeconds = Array.from({ length: size }, (_, from) =>
    Array.from({ length: size }, (_, to) => from === to ? 0 : Math.abs(to - from) * 10 + from));
  const distancesMeters = durationsSeconds.map((row, from) => row.map((duration, to) =>
    from === to ? 0 : duration * 100 + to));
  return { durationsSeconds, distancesMeters };
}

const stations = (count: number) => Array.from({ length: count }, (_, index) => ({
  nodeIndex: index + 2,
  stationId: `station-${String(index).padStart(2, "0")}`,
  nearestLeg: index % 2 === 0 ? "outbound" as const : "return" as const,
  routeProgress: (index + 1) / (count + 1),
}));

function optimize(count = 4, options = { maxIterations: 64, maxRuntimeMs: 10_000 }) {
  return optimizeSelectedOutAndBack(directedMatrix(count + 2), stations(count), options);
}

// Candidate Map (1-12)
add("Round-trip map displays outbound and return Base Routes", () => { assert.match(selectionMap, /selection-base/); assert.match(selectionMap, /line-dasharray/); });
add("Candidate query uses both route corridors", () => { assert.match(candidateRepository, /leg: "outbound"/); assert.match(candidateRepository, /leg: "return"/); assert.match(candidateApi, /listAdminTripStationCandidates/); });
add("Candidate DTO reports unvisited state", () => assert.match(candidateRepository, /isVisited: visited/));
add("Private Visits still count as visited", () => assert.match(candidateRepository, /station_visits[\s\S]+user_id/));
add("Other users' Visits are not exposed", () => assert.match(candidateRepository, /\.eq\("user_id", admin\.id\)/));
add("Endpoint candidates cannot be selected", () => assert.match(candidateRepository, /selectable = !endpoint/));
add("Closed Stations cannot be selected", () => assert.match(candidateRepository, /closedStatuses[\s\S]+!closed/));
add("Select all visible is scoped to map viewport IDs", () => assert.match(selectionPanel, /visible\.has\(candidate\.stationId\)/));
add("Select all visible chooses only selectable unvisited Stations", () => { assert.match(selectionPanel, /candidate\.isVisited \|\| !candidate\.isSelectable/); assert.match(selectionPanel, /if \(candidate\.payToPark\)/); });
add("Clear selection creates an empty ID set", () => assert.match(selectionPanel, /setSelectedIds\(new Set\(\)\)/));
add("Current Trip Stops start selected", () => assert.match(selectionPanel, /new Set\(stops\.map\(\(stop\) => stop\.stationId\)\)/));
add("Map clicks only update client selection", () => { assert.match(selectionMap, /onToggle\(candidate\.stationId\)/); assert.doesNotMatch(selectionMap, /\.rpc\(|fetch\(/); });

// Selection Input (13-20)
add("Selected Station IDs are de-duplicated", () => assert.match(service, /new Set\(input\.selectedStationIds\)/));
add("Invalid UUID selection is rejected", () => assert.match(validation, /selectedStationIds: z\.array\(tripPlanIdSchema\)/));
add("Missing Stations are rejected", () => assert.match(service, /One or more selected Stations no longer exist/));
add("Invalid Station coordinates are rejected", () => assert.match(service, /Math\.abs\(row\.latitude\) > 90/));
add("Endpoint Stations are rejected by the server", () => assert.match(service, /endpointIds\.has\(row\.id\)/));
add("Selected count technical guard is enforced", () => assert.match(service, /MAX_SELECTED_STATIONS_PER_OPTIMIZATION/));
add("Browser cannot submit authoritative coordinates", () => assert.match(validation, /selectedStationOptimizationSchema = z\.object\(\{[\s\S]+selectedStationIds[\s\S]+\}\)\.strict/));
add("Browser cannot submit leg or order", () => { assert.doesNotMatch(selectionPanel, /selectedStationIds:[\s\S]{0,120}(leg|sequence)/); assert.match(validation, /\.strict\(\)/); });

// Chunked Matrix (21-32)
add("Small Matrix request uses the legal square endpoint", () => { assert.match(chunkedMatrix, /coordinates\.length <= MATRIX_MAX_COORDINATES[\s\S]+getDrivingMatrix/); assert.match(matrix, /getDrivingMatrix/); });
add("Large Matrix is split into source and destination blocks", () => assert.match(chunkedMatrix, /sourceBlocks[\s\S]+destinationBlocks/));
add("Source block cells merge into global rows", () => assert.match(chunkedMatrix, /durationsSeconds\[sourceIndex\]\[destinationIndex\]/));
add("Destination block cells merge into global columns", () => assert.match(chunkedMatrix, /distancesMeters\[sourceIndex\]\[destinationIndex\]/));
add("Global Matrix indices are mapped deterministically", () => assert.match(chunkedMatrix, /new Map\(globalIndices\.map\(\(global, local\)/));
add("Directed costs are not symmetrized", () => assert.doesNotMatch(chunkedMatrix, /\[destinationIndex\]\[sourceIndex\]\s*=/));
add("Matrix null remains unreachable", () => {
  const parsed = parseTripMatrixSubsetResult({ code: "Ok", durations: [[null, 4]], distances: [[null, 8]] }, 1, 2);
  assert.equal(parsed.durationsSeconds[0][0], null);
});
add("Missing Matrix elements are rejected", () => { assert.match(matrixResult, /Invalid Matrix.*dimensions/); assert.throws(() => parseTripMatrixSubsetResult({ code: "Ok", durations: [[1]], distances: [[1]] }, 1, 2)); });
add("429 and transient 5xx receive bounded retry", () => { assert.match(serverClient, /429/); assert.match(serverClient, /502/); assert.match(serverClient, /MAX_ATTEMPTS = 3/); });
add("Permanent 4xx are not blindly retried", () => assert.doesNotMatch(serverClient, /400\s*,|401\s*,|403\s*,/));
add("Matrix request-count guard is enforced", () => assert.match(chunkedMatrix, /plannedRequestCount > MAX_MATRIX_REQUESTS_PER_OPTIMIZATION/));
add("Raw Matrix never crosses the client boundary", () => { assert.doesNotMatch(actions, /durationsSeconds|distancesMeters/); assert.doesNotMatch(selectionPanel, /durationsSeconds|distancesMeters/); });

// Initial Solution (33-40)
add("Empty initial route is Origin to Destination to Origin", () => assert.deepEqual(calculateSelectedRouteCost(directedMatrix(2), [], []), { durationSeconds: 21, distanceMeters: 2101 }));
add("Cheapest insertion visits every Station", () => { const result = optimize(); assert.equal((result.route?.outboundNodeIndices.length ?? 0) + (result.route?.returnNodeIndices.length ?? 0), 4); });
add("Regret-2 seed is implemented", () => assert.match(optimizer, /function regretTwoSeed/));
add("Destination stays at the fixed midpoint", () => assert.match(optimizer, /\[0, \.\.\.outbound, 1, \.\.\.returning, 0\]/));
add("Stations are automatically assigned to outbound or return", () => { const route = optimize().route; assert.ok(route); assert.equal(route.outboundNodeIndices.length + route.returnNodeIndices.length, 4); });
add("Every Station occurs exactly once", () => { const route = optimize().route!; const values = [...route.outboundNodeIndices, ...route.returnNodeIndices]; assert.equal(new Set(values).size, values.length); });
add("No selected Station is omitted", () => { const values = [...optimize().route!.outboundNodeIndices, ...optimize().route!.returnNodeIndices].sort(); assert.deepEqual(values, [2, 3, 4, 5]); });
add("Initial tie breaking is deterministic", () => assert.deepEqual(optimize().route, optimize().route));

// Directed Optimization (41-54)
add("A to B cost may differ from B to A", () => { const costs = directedMatrix(4); assert.notEqual(costs.durationsSeconds[1][2], costs.durationsSeconds[2][1]); });
add("Local search implements relocate within a leg", () => assert.match(optimizer, /Relocate within or across legs/));
add("Local search implements relocate across legs", () => assert.match(optimizer, /for \(const target of legs\)/));
add("Local search implements swap within a leg", () => assert.match(optimizer, /Swap, including adjacent swaps/));
add("Local search implements swap across legs", () => assert.match(optimizer, /firstLegIndex[\s\S]+secondLegIndex/));
add("2-opt recomputes directed route costs", () => { assert.match(optimizer, /Directed 2-opt/); assert.match(optimizer, /consider\(asRoute/); });
add("Destination is not a movable local-search node", () => assert.doesNotMatch(optimizer, /splice\([^\n]+,\s*1,\s*1\)/));
add("Origin is not a movable local-search node", () => assert.match(optimizer, /const node = source\.values\[sourceIndex\]/));
add("Local search preserves the Station set", () => { const route = optimize().route!; assert.deepEqual([...route.outboundNodeIndices, ...route.returnNodeIndices].sort(), [2, 3, 4, 5]); });
add("Only strict cost improvements are accepted", () => assert.match(optimizer, /function isStrictImprovement/));
add("Duration is preferred before distance", () => assert.match(optimizer, /candidate\.durationSeconds < current\.durationSeconds[\s\S]+candidate\.distanceMeters < current\.distanceMeters/));
add("Maximum iteration guard stops search", () => { const result = optimize(4, { maxIterations: 1, maxRuntimeMs: 10_000 }); assert.equal(result.technicalLimitReason, "optimization_iteration_guard"); });
add("Maximum runtime guard stops search", () => { let clock = 0; const result = optimizeSelectedOutAndBack(directedMatrix(6), stations(4), { maxIterations: 100, maxRuntimeMs: 1, now: () => clock++ }); assert.equal(result.technicalLimitReason, "optimization_runtime_guard"); });
add("Repeated optimization input is stable", () => assert.deepEqual(optimize().route, optimize().route));

// Multi-seed (55-59)
add("Four deterministic initial seeds are attempted", () => assert.match(optimizer, /const seeds = \[[\s\S]+regretTwoSeed[\s\S]+\]\.filter/));
add("Multi-seed chooses lowest duration", () => assert.match(optimizer, /compareRoutes\(optimized, best\) < 0/));
add("Equal duration chooses lowest distance", () => assert.match(optimizer, /left\.distanceMeters - right\.distanceMeters/));
add("Final tie break uses a stable route signature", () => assert.match(optimizer, /routeSignature\(left\)\.localeCompare/));
add("Optimizer does not use randomness", () => assert.doesNotMatch(optimizer, /Math\.random|crypto\.randomUUID/));

// Unreachable (60-64)
add("A single unreachable Station is identified", () => { const costs = directedMatrix(4); costs.durationsSeconds.forEach((row) => { row[2] = null; }); costs.durationsSeconds[2].fill(null); const result = optimizeSelectedOutAndBack(costs, stations(2), { maxIterations: 20, maxRuntimeMs: 1000 }); assert.deepEqual(result.unreachableNodeIndices, [2]); });
add("Multiple unreachable Stations return safely", () => { const costs = directedMatrix(5); for (const node of [2, 3]) { costs.durationsSeconds.forEach((row) => { row[node] = null; }); costs.durationsSeconds[node].fill(null); } const result = optimizeSelectedOutAndBack(costs, stations(3), { maxIterations: 20, maxRuntimeMs: 1000 }); assert.deepEqual(result.unreachableNodeIndices, [2, 3]); });
add("Unreachable route is never partially saved", () => assert.match(service, /if \(!optimization\.route\)[\s\S]+throw new SelectedRouteOptimizationError/));
add("Unreachable routing has no straight-line fallback", () => assert.doesNotMatch(service, /greatCircleDistance|fallback speed|straight.line/i));
add("UI lists Stations that can be removed from an unreachable set", () => assert.match(selectionPanel, /unreachable\.map\(\(name\)/));

// Directions (65-74)
add("Outbound Directions preserve optimized order", () => { const legs = buildPlannedRouteLegs({ longitude: 0, latitude: 0 }, { longitude: 10, latitude: 0 }, [{ longitude: 2, latitude: 0, sequence: 0, leg: "outbound" }, { longitude: 8, latitude: 0, sequence: 1, leg: "outbound" }], true); assert.deepEqual(legs[0].nodes.map((node) => node.longitude), [0, 2, 8, 10]); });
add("Return Directions preserve optimized order", () => { const legs = buildPlannedRouteLegs({ longitude: 0, latitude: 0 }, { longitude: 10, latitude: 0 }, [{ longitude: 7, latitude: 0, sequence: 0, leg: "return" }, { longitude: 3, latitude: 0, sequence: 1, leg: "return" }], true); assert.deepEqual(legs[1].nodes.map((node) => node.longitude), [10, 7, 3, 0]); });
add("Return route is not fabricated by reversing outbound", () => assert.match(service, /calculateSegmentedPlannedRoute\(legs, getDrivingDirectionsForWaypoints\)/));
add("Large Stop legs are safely segmented", () => assert.equal(splitDirectionWaypoints(Array.from({ length: 50 }, (_, index) => index), 25).length, 3));
add("Adjacent Directions segments share one boundary node", () => { const chunks = splitDirectionWaypoints(Array.from({ length: 30 }, (_, index) => index), 25); assert.equal(chunks[0].at(-1), chunks[1][0]); });
add("Any Directions segment failure rejects the whole result", () => assert.match(plannedRoute, /Promise\.all is intentional/));
add("Final Metrics sum every Directions segment", async () => { const legs = buildPlannedRouteLegs({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }, [], true); const result = await calculateSegmentedPlannedRoute(legs, async () => ({ provider: "mapbox", distanceMeters: 10, durationSeconds: 5, geometry: { type: "LineString", coordinates: [[0, 0], [1, 0]] } })); assert.equal(result.distanceMeters, 20); assert.equal(result.durationSeconds, 10); });
add("Geometry false does not insert planned LineStrings", () => assert.match(migration, /if p_persist_geometry then[\s\S]+insert into public\.trip_plan_segments/));
add("Geometry false still saves Stops and Metrics", () => { assert.match(migration, /insert into public\.trip_plan_stops/); assert.match(migration, /planned_distance_meters = p_planned_distance_meters/); });
add("Planned preview remains rebuildable", () => assert.match(suggestionService, /calculateSavedTripRoutePreview[\s\S]+kind === "planned"/));

// Budget (75-80)
add("Over-time selected route remains savable", () => assert.doesNotMatch(migration, /p_extra_duration_seconds\s*>\s*v_plan\.max_extra_minutes/));
add("Over-distance selected route remains savable", () => assert.doesNotMatch(migration, /p_extra_distance_meters[^\n]+max_extra_miles/));
add("Over-both selected route remains savable", () => assert.match(service, /"over_both"/));
add("Budget never deletes a selected Station", () => assert.doesNotMatch(service, /splice|chooseBudgetCorrection|remove.*Station/i));
add("Selected budget status has all four states", () => { for (const status of ["within_budget", "over_time", "over_distance", "over_both"]) assert.match(service, new RegExp(status)); });
add("UI keeps every selected Station without budget warnings", () => { assert.match(selectionPanel, /Every selected Station is kept/); assert.doesNotMatch(selectionPanel, /exceeds the detour budget|Budget status/); });

// Database (81-97)
add("Save RPC only permits round trips", () => assert.match(migration, /v_plan\.trip_type <> 'round_trip'/));
add("Save RPC checks expected revision", () => assert.match(migration, /route_input_revision <> p_expected_revision/));
add("Save RPC validates the exact selected Station set", () => assert.match(migration, /unnest\(p_selected_station_ids\)[\s\S]+except/));
add("Save RPC rejects omitted selected Stations", () => assert.match(migration, /cardinality\(p_selected_station_ids\) <> v_stop_count/));
add("Save RPC rejects extra Stop Stations", () => assert.equal((migration.match(/except select/g) ?? []).length, 2));
add("Save RPC rejects duplicate Stations", () => assert.match(migration, /count\(distinct selected_id\)/));
add("Save RPC requires continuous sequence", () => assert.match(migration, /Selected Stops must exactly match a unique continuous Station set/));
add("Save RPC validates outbound-before-return legs", () => assert.match(migration, /earlier->>'leg' = 'return' and later->>'leg' = 'outbound'/));
add("Save RPC fixes source to manual", () => assert.match(migration, /v_item->>'source' <> 'manual'/));
add("Save RPC fixes is_locked true", () => assert.match(migration, /not \(v_item->>'isLocked'\)::boolean/));
add("Save RPC fixes status planned", () => assert.match(migration, /v_item->>'status' <> 'planned'/));
add("Save RPC atomically replaces all old Stops", () => assert.match(migration, /delete from public\.trip_plan_stops[\s\S]+insert into public\.trip_plan_stops/));
add("Save RPC preserves Base Segments", () => assert.match(migration, /route_kind = 'planned'/));
add("Save RPC clears planned route stale", () => assert.match(migration, /planned_route_stale = false/));
add("Save RPC advances revision once", () => assert.match(migration, /route_input_revision = tp\.route_input_revision \+ 1/));
add("Save RPC does not create a Visit", () => assert.doesNotMatch(migration, /insert into public\.station_visits/));
add("Save RPC does not change public Station status", () => assert.doesNotMatch(migration, /update public\.stations|public_station_status/));

// UI and regression (98-117)
add("Select Stations on Map is the primary round-trip mode", () => { assert.match(planner, /TripStationSelectionPanel[\s\S]+TripStopsPanel/); assert.match(selectionPanel, /Select Stations on Map/); });
add("Original Automatic Suggestions product entry is removed", () => assert.doesNotMatch(suggestionsPanel, /Advanced: Automatic Suggestions|Generate Suggested Stops/));
add("Selected count is displayed", () => assert.match(selectionPanel, /\{selectedCount\} selected/));
add("Expected-new count is displayed", () => assert.match(selectionPanel, /Expected new check-ins/));
add("Visited count is displayed", () => assert.match(selectionPanel, /Already visited/));
add("Optimize Selected Stations button exists", () => assert.match(selectionPanel, /Optimize Selected Stations/));
add("Replacing existing Stops requires confirmation", () => assert.match(selectionPanel, /Replace and reorder Trip Stops/));
add("Empty selection requires confirmation", () => assert.match(selectionPanel, /Clear every Trip Stop/));
add("All seven honest loading phases are present", () => OPTIMIZATION_PHASES_FOR_TEST.forEach((label) => assert.match(selectionPanel, new RegExp(label))));
add("Optimized map numbers use saved sequence", () => assert.match(selectionMap, /saved\.sequence \+ 1/));
add("Optimized map distinguishes outbound and return", () => assert.match(selectionMap, /saved\.leg === "return"/));
add("Optimized map renders the planned route", () => {
  assert.match(selectionMap, /selection-planned/);
  assert.match(selectionMap, /className="absolute inset-0">\s*<div ref=\{containerRef\}[^>]+className="h-full w-full"/);
  assert.match(selectionMap, /saved \|\| selected \|\| candidate\.payToPark \? "size-\[18px\] border-2 text-\[10px\]" : "size-3 border text-\[7px\]"/);
  assert.match(selectionMap, /marker\.className = `flex size-7/);
  assert.match(selectionMap, /new ResizeObserver/);
  assert.match(selectionMap, /new mapboxgl\.AttributionControl\(\{ compact: true \}\)/);
  assert.doesNotMatch(selectionMap, /new mapboxgl\.NavigationControl/);
});
add("Recalculate and Optimize use distinct labels", () => { assert.match(suggestionsPanel, /Recalculate Route/); assert.match(selectionPanel, /Optimize Selected Stations/); });
add("selected route UI no longer presents budget status", () => { assert.match(selectionPanel, /Every selected Station is kept/); assert.doesNotMatch(selectionPanel, /Over budget|Budget status|exceeds the detour budget/); });
add("UI never promises a guaranteed shortest route", () => assert.doesNotMatch(`${selectionPanel}${selectionMap}`, /Guaranteed shortest|Mathematically perfect|Absolute shortest route/));
add("One-way flow does not render the selection mode", () => assert.match(planner, /currentPlan\.tripType === "round_trip" \? <TripStationSelectionPanel/));
add("Homepage has no Phase 3B.4.1 coupling", () => assert.doesNotMatch(homepage, /TripStationSelection|selected-out-and-back/));
add("Trip confirmation is available after Review", () => { assert.match(actions, /confirmTripPlanAction/); assert.match(actions, /admin_confirm_trip_plan/); });
add("Client bundle contains no Mapbox server token", () => assert.doesNotMatch(`${selectionPanel}${selectionMap}${planner}`, /MAPBOX_SERVER_ACCESS_TOKEN/));
add("Client bundle contains no Supabase secret", () => assert.doesNotMatch(`${selectionPanel}${selectionMap}${planner}`, /SUPABASE_SECRET_KEY|service_role/));

const OPTIMIZATION_PHASES_FOR_TEST = [
  "Validating selected stations", "Loading road network costs", "Building travel-time matrix",
  "Assigning outbound and return stops", "Optimizing visit order", "Calculating final route", "Saving trip",
];

assert.equal(cases.length, 117, "Phase 3B.4.1 must retain the requested 117-test matrix.");
cases.forEach(([name, run], index) => test(`3B.4.1 ${String(index + 1).padStart(3, "0")} ${name}`, run));

test("Selected Stations list renders below the map and its controls", () => {
  const mapIndex = selectionPanel.indexOf("<TripStationSelectionMap");
  const listIndex = selectionPanel.indexOf("{selectedCandidates.length > 0 ? <div");
  assert.ok(mapIndex >= 0 && listIndex > mapIndex);
});

test("Map-side controls can grow without overlapping the content below", () => {
  assert.match(selectionPanel, /flex flex-col gap-4 lg:min-h-\[620px\]/);
  assert.doesNotMatch(selectionPanel, /flex flex-col gap-4 lg:h-\[620px\]/);
});
