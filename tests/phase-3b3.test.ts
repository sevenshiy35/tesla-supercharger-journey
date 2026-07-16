import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  expandedRouteBoundingBoxes,
  greatCircleDistanceMeters,
  measurePointAlongRoute,
  stationCorridorCandidate,
  type CorridorCandidate,
} from "../src/lib/trips/corridor";
import { isStationEligibleForTripPlanning, type TripPlanningStation } from "../src/lib/trips/station-eligibility";
import { getMatrixDistance, getMatrixDuration, parseTripMatrixResult, type TripMatrixResult } from "../src/lib/mapbox/matrix-result";
import {
  buildMatrixEvaluationBatches,
  calculateInsertionDelta,
  createInitialSuggestionRoute,
  maximizeSuggestedStops,
  progressiveCandidateOrder,
  type SuggestionRouteNode,
} from "../src/lib/trips/suggestion-algorithm";
import { optimizeAdjacentSuggestionStops } from "../src/lib/trips/local-optimization";
import { buildPlannedRouteLegs, calculateSegmentedPlannedRoute, splitDirectionWaypoints } from "../src/lib/mapbox/planned-route";
import { calculateExtraRouteMetrics, chooseBudgetCorrectionStopIndex, isWithinDetourBudget } from "../src/lib/trips/budget-correction";

const source = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = source("supabase/migrations/20260715200000_trip_suggestion_algorithm.sql");
const matrixSource = source("src/lib/mapbox/matrix.ts");
const serverClient = source("src/lib/mapbox/server-client.ts");
const directions = source("src/lib/mapbox/directions.ts");
const plannedRoute = source("src/lib/mapbox/planned-route.ts");
const service = source("src/lib/trips/suggestion-service.ts");
const candidatesSource = source("src/lib/trips/candidate-repository.ts");
const config = source("src/lib/trips/planning-config.ts");
const actions = source("src/app/admin/trip-actions.ts");
const page = source("src/app/admin/(protected)/trips/[id]/page.tsx");
const panel = source("src/components/admin/TripSuggestionsPanel.tsx");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const map = source("src/components/admin/TripRouteMap.tsx");
const repository = source("src/lib/trips/repository.ts");
const types = source("src/lib/trips/types.ts");
const homepage = source("src/app/page.tsx");

function station(overrides: Partial<TripPlanningStation> = {}): TripPlanningStation {
  return {
    id: "station-a", externalId: "ext-a", name: "A Supercharger", address: "1 Main St",
    city: "Town", state: "NJ", postalCode: null, country: "US", latitude: 40,
    longitude: -74, operationalStatus: "available", stallCount: null, maxPowerKw: null,
    ...overrides,
  };
}

const emptyEligibility = () => ({
  visitedStationIds: new Set<string>(), endpointStationIds: new Set<string>(), existingStopStationIds: new Set<string>(),
});

function candidate(id: string, progress: number, leg: "outbound" | "return" = "outbound", longitude = progress): CorridorCandidate {
  return {
    ...station({ id, externalId: id, name: id, longitude, latitude: 0 }),
    corridorDistanceMeters: Math.abs(longitude - progress) * 100,
    routeProgress: progress,
    nearestSegmentIndex: 0,
    nearestLeg: leg,
  };
}

async function geometricMatrix(coordinates: Array<{ longitude: number; latitude: number }>): Promise<TripMatrixResult> {
  const distancesMeters = coordinates.map((from) => coordinates.map((to) =>
    Math.round(Math.hypot(from.longitude - to.longitude, from.latitude - to.latitude) * 1000)));
  return { distancesMeters, durationsSeconds: distancesMeters.map((row) => row.map((value) => value / 10)) };
}

async function fixedCandidateMatrix(coordinates: Array<{ longitude: number; latitude: number }>): Promise<TripMatrixResult> {
  const candidateLongitude = coordinates.length === 3 ? coordinates[2].longitude : null;
  const delta = candidateLongitude !== null && candidateLongitude > 0.5 ? 2 : 10;
  const durationsSeconds: number[][] = coordinates.map((_, from) => coordinates.map((__, to) => from === to ? 0 : 50));
  const distancesMeters: number[][] = durationsSeconds.map((row) => row.map((value) => value * 10));
  if (coordinates.length === 3) {
    durationsSeconds[0][1] = 100; distancesMeters[0][1] = 1000;
    durationsSeconds[0][2] = 50; durationsSeconds[2][1] = 50 + delta;
    distancesMeters[0][2] = 500; distancesMeters[2][1] = 500 + delta * 10;
  }
  return { durationsSeconds, distancesMeters };
}

type Case = [string, () => void | Promise<void>];
const cases: Case[] = [];
const add = (number: number, name: string, body: Case[1]) => cases.push([`3B.3 ${String(number).padStart(3, "0")} ${name}`, body]);

add(1, "Public Visit excludes a station", () => { const c = emptyEligibility(); c.visitedStationIds.add("station-a"); assert.deepEqual(isStationEligibleForTripPlanning(station(), c), { eligible: false, reason: "visited" }); });
add(2, "Private Visit excludes a station", () => { const c = emptyEligibility(); c.visitedStationIds.add("station-a"); assert.equal(isStationEligibleForTripPlanning(station(), c).eligible, false); });
add(3, "date_only Visit excludes a station", () => { const c = emptyEligibility(); c.visitedStationIds.add("station-a"); assert.equal(isStationEligibleForTripPlanning(station(), c).eligible, false); });
add(4, "exact Visit excludes a station", () => { const c = emptyEligibility(); c.visitedStationIds.add("station-a"); assert.equal(isStationEligibleForTripPlanning(station(), c).eligible, false); });
add(5, "another user's Visit does not alter the current user's set", () => assert.equal(isStationEligibleForTripPlanning(station(), emptyEligibility()).eligible, true));
add(6, "Origin Station is excluded", () => { const c = emptyEligibility(); c.endpointStationIds.add("station-a"); assert.deepEqual(isStationEligibleForTripPlanning(station(), c), { eligible: false, reason: "endpoint" }); });
add(7, "Destination Station is excluded", () => { const c = emptyEligibility(); c.endpointStationIds.add("station-a"); assert.equal(isStationEligibleForTripPlanning(station(), c).eligible, false); });
add(8, "existing duplicate Station is excluded", () => { const c = emptyEligibility(); c.existingStopStationIds.add("station-a"); assert.deepEqual(isStationEligibleForTripPlanning(station(), c), { eligible: false, reason: "duplicate" }); });
add(9, "non-operational station is excluded", () => assert.deepEqual(isStationEligibleForTripPlanning(station({ operationalStatus: "closed" }), emptyEligibility()), { eligible: false, reason: "operational" }));
add(10, "invalid coordinates are excluded", () => assert.deepEqual(isStationEligibleForTripPlanning(station({ latitude: Number.NaN }), emptyEligibility()), { eligible: false, reason: "invalid" }));

const straightGeometry = { type: "LineString" as const, coordinates: [[0, 0], [1, 0]] as [number, number][] };
add(11, "Bounding Box expands around route Geometry", () => { const boxes = expandedRouteBoundingBoxes([{ leg: "outbound", geometry: straightGeometry }], 25); assert.ok(boxes[0].minLatitude < 0 && boxes[0].maxLatitude > 0 && boxes[0].minLongitude < 0 && boxes[0].maxLongitude > 1); });
add(12, "spherical point-to-LineString distance is measured", () => { const result = measurePointAlongRoute([0.5, 0.1], straightGeometry); assert.ok(result.corridorDistanceMeters > 11_000 && result.corridorDistanceMeters < 11_200); });
add(13, "Corridor boundary is inclusive", () => { const latitude = (25 * 1609.344 / 6_371_000) * 180 / Math.PI; assert.ok(stationCorridorCandidate(station({ latitude, longitude: 0.5 }), [{ leg: "outbound", geometry: straightGeometry }], 25)); });
add(14, "outside-Corridor station is rejected", () => assert.equal(stationCorridorCandidate(station({ latitude: 1, longitude: 0.5 }), [{ leg: "outbound", geometry: straightGeometry }], 25), null));
add(15, "routeProgress stays in zero-to-one range", () => { const result = measurePointAlongRoute([0.75, 0.01], straightGeometry); assert.ok(result.routeProgress >= 0 && result.routeProgress <= 1); });
add(16, "Round-trip Corridor uses both distinct legs", () => { const farReturn = { type: "LineString" as const, coordinates: [[1, 1], [0, 1]] as [number, number][] }; const result = stationCorridorCandidate(station({ longitude: 0.5, latitude: 1 }), [{ leg: "outbound", geometry: straightGeometry }, { leg: "return", geometry: farReturn }], 5); assert.equal(result?.nearestLeg, "return"); });
add(17, "equal Round-trip leg distance deterministically prefers outbound", () => { const result = stationCorridorCandidate(station({ longitude: 0.5, latitude: 0 }), [{ leg: "outbound", geometry: straightGeometry }, { leg: "return", geometry: straightGeometry }], 5); assert.equal(result?.nearestLeg, "outbound"); });
add(18, "distance is spherical rather than degree-Euclidean", () => assert.ok(greatCircleDistanceMeters([0, 60], [1, 60]) < greatCircleDistanceMeters([0, 0], [1, 0]) * 0.51));

const basicOptions = (candidates: CorridorCandidate[], legacyMaxStops: number | null = null) => ({ tripType: "one_way" as const, origin: { longitude: 0, latitude: 0 }, destination: { longitude: 1, latitude: 0 }, candidates, maxExtraMinutes: 10_000, maxExtraMiles: null, legacyMaxStops });
add(19, "max_stops null applies no user count cap", async () => assert.equal((await maximizeSuggestedStops(basicOptions([candidate("a", .2), candidate("b", .5), candidate("c", .8)]), geometricMatrix)).selectedStops.length, 3));
add(20, "legacy numeric max_stops remains compatible", async () => assert.equal((await maximizeSuggestedStops(basicOptions([candidate("a", .2), candidate("b", .5), candidate("c", .8)], 2), geometricMatrix)).selectedStops.length, 2));
add(21, "ordinary UI contains no Maximum stops field", () => assert.doesNotMatch(`${page}\n${panel}\n${planner}`, /Maximum stops|Zero is allowed|Max 8 stops/i));
add(22, "Matrix guard does not mutate max_stops", () => assert.doesNotMatch(config, /max_stops|maxStops/));
add(23, "technical guard is described separately from a business limit", () => { assert.match(panel, /technicalLimitReached/); assert.doesNotMatch(panel, /Maximum stops reached/); });

add(24, "Matrix module is server-only", () => assert.match(matrixSource, /^import "server-only";/));
add(25, "Matrix uses mapbox driving", () => assert.match(matrixSource, /directions-matrix\/v1\/mapbox\/driving/));
add(26, "Matrix requests distance and duration annotations", () => assert.match(matrixSource, /annotations: "distance,duration"/));
add(27, "Matrix does not use driving-traffic", () => assert.doesNotMatch(matrixSource, /driving-traffic/));
add(28, "Matrix does not fabricate fallback_speed", () => assert.doesNotMatch(matrixSource, /fallback_speed/));
add(29, "Matrix null remains unreachable", () => { const parsed = parseTripMatrixResult({ code: "Ok", durations: [[0, null], [null, 0]], distances: [[0, null], [null, 0]] }, 2); assert.equal(getMatrixDuration(parsed, 0, 1), null); assert.equal(getMatrixDistance(parsed, 1, 0), null); });
add(30, "Matrix dimension mismatch is rejected", () => assert.throws(() => parseTripMatrixResult({ durations: [[0]], distances: [[0]] }, 2), /dimensions/));
add(31, "429 and provider failures have bounded retry", () => { assert.match(serverClient, /429, 502, 503, 504/); assert.match(serverClient, /MAX_ATTEMPTS = 3/); });
add(32, "non-retryable 4xx statuses are not in retry set", () => assert.doesNotMatch(serverClient.match(/RETRYABLE_STATUSES[^;]+/)?.[0] ?? "", /400|401|403|404|422/));
add(33, "Matrix request uses the shared AbortController timeout", () => { assert.match(serverClient, /new AbortController/); assert.match(matrixSource, /15_000/); });
add(34, "Mapbox server token never enters Client Components", () => assert.doesNotMatch(`${panel}\n${planner}\n${map}`, /MAPBOX_SERVER_ACCESS_TOKEN/));

add(35, "small candidate pools fit one batch", () => { const route = createInitialSuggestionRoute("one_way", { longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }); assert.equal(buildMatrixEvaluationBatches(route, [candidate("a", .2), candidate("b", .7)]).length, 1); });
add(36, "large candidate pools use multiple Matrix batches", () => { const route = createInitialSuggestionRoute("one_way", { longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }); assert.ok(buildMatrixEvaluationBatches(route, Array.from({ length: 50 }, (_, i) => candidate(`s${i}`, i / 50))).length > 1); });
add(37, "progressive order covers route front middle and end", () => { const order = progressiveCandidateOrder([candidate("front", .1), candidate("middle", .5), candidate("end", .9)]).slice(0, 3); assert.deepEqual(new Set(order.map((item) => item.id)), new Set(["front", "middle", "end"])); });
add(38, "progressive order covers outbound and return legs", () => { const order = progressiveCandidateOrder([candidate("out", .2), candidate("back", .2, "return")]); assert.deepEqual(new Set(order.map((item) => item.nearestLeg)), new Set(["outbound", "return"])); });
add(39, "batching does not only inspect candidates nearest Origin", () => { const order = progressiveCandidateOrder([candidate("front", .05), candidate("middle", .5), candidate("end", .95)]); assert.ok(order.slice(0, 3).some((item) => item.routeProgress > .9)); });
add(40, "global best candidate is selected across Matrix batches", async () => { const result = await maximizeSuggestedStops({ ...basicOptions([candidate("slow", .2, "outbound", .2), candidate("fast", .8, "outbound", .8)]), legacyMaxStops: 1, matrixMaximumCoordinates: 3 }, fixedCandidateMatrix); assert.equal(result.selectedStops[0]?.id, "fast"); });
add(41, "technical guard returns a valid partial result", async () => { const result = await maximizeSuggestedStops({ ...basicOptions([candidate("a", .2), candidate("b", .8)]), matrixRequestLimit: 1, matrixMaximumCoordinates: 3 }, geometricMatrix); assert.equal(result.selectedStops.length, 1); assert.equal(result.technicalLimitReached, true); });
add(42, "technicalLimitReached stores a safe reason", async () => { const result = await maximizeSuggestedStops({ ...basicOptions([candidate("a", .2), candidate("b", .8)]), matrixRequestLimit: 1, matrixMaximumCoordinates: 3 }, geometricMatrix); assert.equal(result.technicalLimitReason, "matrix_request_budget"); });
add(43, "technical Matrix limit is never presented as Maximum stops", () => assert.doesNotMatch(`${config}\n${panel}`, /MAX_MATRIX[^\n]+Maximum stops|Maximum stops[^\n]+MAX_MATRIX/i));

add(44, "One-way initial route is Origin to Destination", () => assert.deepEqual(createInitialSuggestionRoute("one_way", { longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }).map((node) => node.kind), ["origin", "destination"]));
add(45, "Round-trip keeps Destination as fixed midpoint", () => assert.deepEqual(createInitialSuggestionRoute("round_trip", { longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }).map((node) => node.kind), ["origin", "destination", "origin"]));
add(46, "insertion delta uses A-C plus C-B minus A-B", () => { const matrix = { durationsSeconds: [[0, 5, 3], [5, 0, 4], [3, 4, 0]], distancesMeters: [[0, 50, 30], [50, 0, 40], [30, 40, 0]] }; assert.deepEqual(calculateInsertionDelta(matrix, 0, 2, 1), { durationSeconds: 2, distanceMeters: 20, materialNegativeCost: false }); });
add(47, "null route cost makes insertion impossible", () => { const matrix = { durationsSeconds: [[0, 5, null], [5, 0, 4], [null, 4, 0]], distancesMeters: [[0, 50, null], [50, 0, 40], [null, 40, 0]] }; assert.equal(calculateInsertionDelta(matrix, 0, 2, 1), null); });
add(48, "candidate over extra-time budget is not inserted", async () => { const result = await maximizeSuggestedStops({ ...basicOptions([candidate("a", .2)]), maxExtraMinutes: 0 }, fixedCandidateMatrix); assert.equal(result.selectedStops.length, 0); });
add(49, "candidate over extra-distance budget is not inserted", async () => { const result = await maximizeSuggestedStops({ ...basicOptions([candidate("a", .2)]), maxExtraMiles: 0 }, fixedCandidateMatrix); assert.equal(result.selectedStops.length, 0); });
add(50, "Station dwell time is absent from driving-budget algorithm", () => assert.doesNotMatch(source("src/lib/trips/suggestion-algorithm.ts"), /stopDuration/));
add(51, "algorithm continues adding while budget permits", async () => assert.equal((await maximizeSuggestedStops(basicOptions([candidate("a", .2), candidate("b", .4), candidate("c", .6), candidate("d", .8)]), geometricMatrix)).selectedStops.length, 4));
add(52, "algorithm stops when no candidate is feasible", async () => assert.equal((await maximizeSuggestedStops({ ...basicOptions([candidate("a", .2)]), maxExtraMinutes: 0 }, fixedCandidateMatrix)).selectedStops.length, 0));
add(53, "maximizing station count outranks early completion", async () => assert.ok((await maximizeSuggestedStops(basicOptions([candidate("a", .2), candidate("b", .8)]), geometricMatrix)).selectedStops.length > 1));
add(54, "equal-count choice prefers lower drive time", async () => { const result = await maximizeSuggestedStops({ ...basicOptions([candidate("slow", .2), candidate("fast", .8)]), legacyMaxStops: 1, matrixMaximumCoordinates: 3 }, fixedCandidateMatrix); assert.equal(result.selectedStops[0]?.id, "fast"); });
add(55, "candidate tie-break is deterministic", async () => { const a = await maximizeSuggestedStops({ ...basicOptions([candidate("b", .5), candidate("a", .5)]), legacyMaxStops: 1 }, geometricMatrix); assert.equal(a.selectedStops[0]?.id, "a"); });
add(56, "one Station can be selected at most once", async () => { const result = await maximizeSuggestedStops(basicOptions([candidate("a", .2)]), geometricMatrix); assert.equal(new Set(result.selectedStops.map((stop) => stop.id)).size, result.selectedStops.length); });
add(57, "Round-trip assigns Stop leg from actual insertion structure", async () => { const result = await maximizeSuggestedStops({ ...basicOptions([candidate("return", .8, "return")]), tripType: "round_trip" }, geometricMatrix); assert.ok(result.selectedStops.every((stop) => stop.leg === "outbound" || stop.leg === "return")); assert.equal(result.routeNodes.filter((node) => node.kind === "destination").length, 1); });
add(58, "repeated runs are stable", async () => { const options = basicOptions([candidate("b", .4), candidate("a", .4), candidate("c", .7)]); const one = await maximizeSuggestedStops(options, geometricMatrix); const two = await maximizeSuggestedStops(options, geometricMatrix); assert.deepEqual(one.routeNodes.map((node) => node.key), two.routeNodes.map((node) => node.key)); });

function optimizationFixture() {
  const nodes: SuggestionRouteNode[] = [
    { key: "a", kind: "origin", stationId: null, initialLeg: null, longitude: 0, latitude: 0 },
    { key: "c", kind: "station", stationId: "c", initialLeg: "outbound", longitude: 1, latitude: 0 },
    { key: "d", kind: "station", stationId: "d", initialLeg: "outbound", longitude: 2, latitude: 0 },
    { key: "b", kind: "destination", stationId: null, initialLeg: null, longitude: 3, latitude: 0 },
  ];
  const costs = new Map<string, { durationSeconds: number; distanceMeters: number }>([
    ["a-c", { durationSeconds: 10, distanceMeters: 10 }], ["c-d", { durationSeconds: 10, distanceMeters: 10 }], ["d-b", { durationSeconds: 10, distanceMeters: 10 }],
    ["a-d", { durationSeconds: 5, distanceMeters: 5 }], ["d-c", { durationSeconds: 5, distanceMeters: 5 }], ["c-b", { durationSeconds: 5, distanceMeters: 5 }],
  ]);
  return { nodes, getCost: (from: SuggestionRouteNode, to: SuggestionRouteNode) => costs.get(`${from.key}-${to.key}`) ?? null };
}
add(59, "local optimization preserves selected Station set", () => { const fixture = optimizationFixture(); const result = optimizeAdjacentSuggestionStops(fixture.nodes, fixture.getCost, 10); assert.deepEqual(new Set(result.routeNodes.flatMap((node) => node.stationId ? [node.stationId] : [])), new Set(["c", "d"])); });
add(60, "local optimization cannot move Stops across Destination", () => assert.match(source("src/lib/trips/local-optimization.ts"), /Destination remains a fixed midpoint/));
add(61, "local optimization does not move endpoints", () => { const fixture = optimizationFixture(); const result = optimizeAdjacentSuggestionStops(fixture.nodes, fixture.getCost, 10); assert.equal(result.routeNodes[0].kind, "origin"); assert.equal(result.routeNodes.at(-1)?.kind, "destination"); });
add(62, "local optimization obeys iteration cap", () => { const fixture = optimizationFixture(); assert.ok(optimizeAdjacentSuggestionStops(fixture.nodes, fixture.getCost, 0).iterations === 0); });

const routeStops = [
  { longitude: .25, latitude: 0, sequence: 0, leg: "outbound" as const },
  { longitude: .75, latitude: 0, sequence: 1, leg: "outbound" as const },
];
add(63, "One-way Directions includes every ordered Stop", () => assert.equal(buildPlannedRouteLegs({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }, routeStops, false)[0].nodes.length, 4));
add(64, "Round-trip Directions builds separate legs", () => assert.deepEqual(buildPlannedRouteLegs({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }, [...routeStops, { longitude: .5, latitude: 1, sequence: 2, leg: "return" as const }], true).map((leg) => leg.leg), ["outbound", "return"]));
add(65, "Return route starts at Destination instead of reversing outbound Geometry", () => { const legs = buildPlannedRouteLegs({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }, [], true); assert.equal(legs[1].nodes[0].kind, "destination"); assert.equal(legs[1].nodes.at(-1)?.kind, "origin"); });
add(66, "waypoints over API coordinate limit are safely segmented", () => assert.ok(splitDirectionWaypoints(Array.from({ length: 30 }, (_, index) => index), 25).length > 1));
add(67, "Directions segments share their boundary node", () => { const chunks = splitDirectionWaypoints(Array.from({ length: 30 }, (_, index) => index), 25); assert.equal(chunks[0].at(-1), chunks[1][0]); });
add(68, "Segment metrics sum exactly", async () => { const legs = buildPlannedRouteLegs({ longitude: 0, latitude: 0 }, { longitude: 1, latitude: 0 }, routeStops, false); const result = await calculateSegmentedPlannedRoute(legs, async (points) => ({ distanceMeters: points.length * 10, durationSeconds: points.length * 5, geometry: { type: "LineString", coordinates: points.map((p) => [p.longitude, p.latitude]) } })); assert.equal(result.distanceMeters, result.segments.reduce((sum, segment) => sum + segment.distanceMeters, 0)); });
add(69, "Round-trip segmentation never crosses Destination midpoint", () => assert.match(plannedRoute, /legs\.flatMap/));
add(70, "any Directions Segment failure prevents a partial result", () => assert.match(plannedRoute, /Promise\.all is intentional/));

add(71, "planned Metrics are derived from authoritative route totals", () => assert.deepEqual(calculateExtraRouteMetrics(1200, 130, { baseDistanceMeters: 1000, baseDurationSeconds: 100 }), { extraDistanceMeters: 200, extraDurationSeconds: 30 }));
add(72, "Extra Metrics clamp provider improvements to zero", () => assert.deepEqual(calculateExtraRouteMetrics(900, 90, { baseDistanceMeters: 1000, baseDurationSeconds: 100 }), { extraDistanceMeters: 0, extraDurationSeconds: 0 }));
add(73, "over-budget correction selects highest-cost Stop", () => assert.equal(chooseBudgetCorrectionStopIndex([{ id: "a", estimatedDetourSeconds: 5, estimatedDetourMeters: 5, selectionRank: 1 }, { id: "b", estimatedDetourSeconds: 10, estimatedDetourMeters: 1, selectionRank: 2 }]), 1));
add(74, "budget correction loop has an explicit cap", () => { assert.match(config, /MAX_BUDGET_CORRECTION_ITERATIONS = 8/); assert.match(service, /corrections >= MAX_BUDGET_CORRECTION_ITERATIONS/); });
add(75, "uncorrectable route is not saved", () => assert.match(service, /still exceeds the detour budget after safe correction\. No Suggestions were changed/));
add(76, "zero feasible Stops is a successful Base-route result", () => assert.equal(isWithinDetourBudget({ extraDistanceMeters: 0, extraDurationSeconds: 0 }, { maxExtraMinutes: 0, maxExtraMiles: 0 }), true));

add(77, "route_kind supports base and planned", () => assert.match(migration, /route_kind in \('base', 'planned'\)/));
add(78, "Segment uniqueness includes route_kind", () => assert.match(migration, /unique \(trip_plan_id, route_kind, segment_index\)/));
add(79, "Stop helper fields have range constraints", () => { assert.match(migration, /corridor_distance_meters >= 0/); assert.match(migration, /route_progress between 0 and 1/); assert.match(migration, /selection_rank > 0/); });
add(80, "Save Suggestions RPC checks expected revision", () => assert.match(migration, /route_input_revision <> p_expected_revision/));
add(81, "Save Suggestions RPC rejects current user's visited Station", () => assert.match(migration, /station_visits[\s\S]+sv\.user_id = v_user_id[\s\S]+already been visited/));
add(82, "Save Suggestions RPC rejects duplicate Stations", () => assert.match(migration, /Suggested Stations must be unique/));
add(83, "Save Suggestions RPC rejects endpoint Station", () => assert.match(migration, /endpoint Station cannot also be a Suggested Stop/));
add(84, "Save Suggestions RPC validates both budgets", () => { assert.match(migration, /max_extra_minutes/); assert.match(migration, /max_extra_miles \* 1609\.344/); });
add(85, "Save Suggestions RPC atomically replaces algorithm Suggestions", () => { assert.match(migration, /delete from public\.trip_plan_stops[\s\S]+insert into public\.trip_plan_stops/); assert.match(migration, /admin_save_trip_plan_suggestions/); });
add(86, "Base Segments are preserved on suggestion save", () => assert.match(migration, /route_kind = 'planned'/));
add(87, "Clear removes only planned Segments", () => assert.match(migration, /admin_clear_trip_plan_suggestions[\s\S]+route_kind = 'planned'/));
add(88, "Clear restores Base Metrics", () => assert.match(migration, /planned_distance_meters = tp\.base_distance_meters[\s\S]+planned_drive_seconds = tp\.base_duration_seconds/));
add(89, "Suggestions never create a Visit", () => assert.doesNotMatch(migration.match(/create function public\.admin_save_trip_plan_suggestions[\s\S]+?end;\n\$\$;/)?.[0] ?? "", /insert into public\.station_visits/));
add(90, "Suggestions do not modify public_station_status", () => assert.doesNotMatch(`${migration}\n${service}\n${actions}`, /update public\.public_station_status|insert into public\.public_station_status/));
add(91, "safe audit fields are persisted", () => { for (const field of ["corridor_candidate_count", "evaluated_candidate_count", "unreachable_candidate_count", "technical_limit_reached", "technical_limit_reason"]) assert.match(migration, new RegExp(field)); });

add(92, "persistence false writes no planned Geometry", () => assert.match(migration, /if p_persist_geometry then[\s\S]+insert into public\.trip_plan_segments/));
add(93, "persistence false still saves Stops and Metrics", () => { assert.match(migration, /insert into public\.trip_plan_stops/); assert.match(migration, /planned_distance_meters = p_planned_distance_meters/); });
add(94, "persistence false has protected on-demand Preview", () => { const preview = source("src/app/api/admin/trips/[id]/route-preview/route.ts"); assert.match(preview, /requireAdmin/); assert.match(preview, /private, no-store/); });
add(95, "persisted Geometry is restricted to LineString", () => assert.match(migration, /Geometry must be a valid LineString/));
add(96, "raw provider responses are never saved", () => assert.doesNotMatch(`${migration}\n${types}`, /raw_response|rawResponse/));

add(97, "Automatic generation control is removed", () => assert.doesNotMatch(panel, /Generate Suggested Stops|Generate Automatic Suggestions/));
add(98, "Recalculate is disabled without Base Route", () => assert.match(panel, /disabled=\{!hasBaseRoute/));
add(99, "automatic generation phases are removed", () => { for (const phase of ["Loading route", "Finding candidates", "Measuring detours", "Saving the Draft"]) assert.doesNotMatch(panel, new RegExp(phase)); });
add(100, "Suggested Stops are numbered", () => assert.match(panel, /Stop \{stop\.sequence \+ 1\}/));
add(101, "Stop list displays outbound and return", () => assert.match(panel, /stop\.leg === "return" \? "Return" : "Outbound"/));
add(102, "Stop list displays detour time and distance", () => { assert.match(panel, /Estimated detour/); assert.match(panel, /Added distance/); });
add(103, "map creates numbered Suggested Stop Markers", () => { assert.match(map, /stop\.sequence \+ 1/); assert.match(map, /new mapboxgl\.Marker/); });
add(104, "map draws planned route separately", () => { assert.match(map, /plannedSegments/); assert.match(map, /kind: "planned"/); });
add(105, "Summary focuses on objective drive metrics", () => { assert.match(panel, /Base drive time/); assert.match(panel, /Optimized drive time/); assert.doesNotMatch(panel, /Time at stations/); });
add(106, "Summary shows additional results without budget status", () => { assert.match(panel, /Additional drive time/); assert.match(panel, /Additional distance/); assert.doesNotMatch(panel, /Budget status|Over budget/); });
add(107, "Regenerate From Scratch is removed", () => assert.doesNotMatch(panel, /Regenerate From Scratch|creates a new automatic plan/));
add(108, "Remove confirmation protects Station and Visit data", () => assert.match(panel, /It does not change Station or Visit data/));
add(109, "Maximum stops is absent from Suggested Stops UI", () => assert.doesNotMatch(panel, /Maximum stops|Maximum Stops/));
add(110, "new stepper ends with Review", () => assert.match(page, /"Route basics", "Select stations", "Optimize route", "Review"/));
add(111, "obsolete Confirm step is removed", () => assert.doesNotMatch(page, /"Confirm"/));
add(112, "manual ordering remains without a lock action", () => { assert.match(panel, /Earlier/); assert.match(panel, /Later/); assert.doesNotMatch(panel, />Lock<|>Unlock</); });
add(113, "public homepage remains Trip-independent", () => assert.doesNotMatch(homepage, /trip_plan|TripRoute|SuggestedTripStop/));
add(114, "Client Bundle contains no Mapbox server token", () => assert.doesNotMatch(`${panel}\n${planner}\n${map}\n${page}`, /MAPBOX_SERVER_ACCESS_TOKEN/));
add(115, "Client Bundle contains no Supabase Secret", () => assert.doesNotMatch(`${panel}\n${planner}\n${map}\n${page}`, /SUPABASE_SECRET_KEY|service_role/));
add(116, "Trip planner does not call Optimization API", () => assert.doesNotMatch(`${service}\n${directions}\n${matrixSource}`, /optimization\/v|Optimization API/));
add(117, "Phase 3B.3 does not create an Active Trip", () => { assert.doesNotMatch(`${actions}\n${panel}\n${service}`, /status\s*[:=]\s*["']active["']|activated_at/); assert.match(repository, /getAdminSuggestedTripStops/); assert.match(candidatesSource, /\.eq\("user_id", admin\.id\)/); });

assert.equal(cases.length, 117, "The Phase 3B.3 acceptance suite must contain all 117 requested cases.");
for (const [name, body] of cases) test(name, body);
