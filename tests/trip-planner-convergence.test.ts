import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";

const source = (path: string) => readFileSync(path, "utf8");
const planner = source("src/components/admin/TripRoutePlanner.tsx");
const stopsPanel = source("src/components/admin/TripSuggestionsPanel.tsx");
const selectionPanel = source("src/components/admin/TripStationSelectionPanel.tsx");
const selectionMap = source("src/components/admin/TripStationSelectionMap.tsx");
const routeMap = source("src/components/admin/TripRouteMap.tsx");
const publicMap = source("src/components/map/SuperchargerMap.tsx");
const tripTypes = source("src/lib/trips/types.ts");
const stationTypes = source("src/types/station.ts");
const optimizer = source("src/lib/trips/selected-out-and-back-optimizer.ts");
const page = source("src/app/admin/(protected)/trips/[id]/page.tsx");
const packageJson = source("package.json");

const removedFieldNames = ["tesla" + "PaidParking", "parking" + "FeeNote"];
const removedDatabaseNames = ["tesla" + "_paid_parking", "parking" + "_fee_note"];
const removedToggle = ["Show", "paid", "parking", "stations"].join(" ");

function filesUnder(path: string): string[] {
  return readdirSync(path).flatMap((entry) => {
    const absolute = join(path, entry);
    return statSync(absolute).isDirectory() ? filesUnder(absolute) : [absolute];
  });
}

test("convergence 01 fee filter UI is absent", () => {
  assert.equal(selectionPanel.toLocaleLowerCase().includes(removedToggle), false);
});

test("convergence 02 personal dollar markers stay off the public map", () => {
  assert.match(`${selectionMap}\n${routeMap}`, /textContent\s*=\s*["']\$["']/);
  assert.doesNotMatch(publicMap, /payToPark|Pay to park|textContent\s*=\s*["']\$["']/);
});

test("convergence 03 private search uses personal rather than official fee language", () => {
  assert.match(`${selectionPanel}\n${stopsPanel}`, /PayToParkBadge/);
  assert.doesNotMatch(`${selectionPanel}\n${stopsPanel}`, /Tesla verified|Official paid parking|Confirmed by Tesla/i);
});

test("convergence 04 Candidate DTO has no fee fields", () => {
  for (const field of removedFieldNames) assert.equal(tripTypes.includes(field), false);
});

test("convergence 05 Station DTO has no fee fields", () => {
  for (const field of removedFieldNames) assert.equal(stationTypes.includes(field), false);
});

test("convergence 06 Select all visible uses only legal unvisited candidates", () => {
  assert.match(selectionPanel, /!visible\.has\(candidate\.stationId\) \|\| candidate\.isVisited \|\| !candidate\.isSelectable/);
  assert.match(selectionPanel, /if \(candidate\.payToPark\)/);
});

test("convergence 07 Station Selection Map remains", () => {
  assert.match(selectionPanel, /<TripStationSelectionMap/);
  assert.match(selectionPanel, /Select Stations on Map/);
});

test("convergence 08 selected Station optimization remains", () => {
  assert.match(selectionPanel, /Optimize Selected Stations/);
  assert.match(selectionPanel, /optimizeSelectedOutAndBackStationsAction/);
});

test("convergence 09 visited filtering remains", () => {
  assert.match(selectionPanel, /Show visited Stations/);
  assert.match(selectionPanel, /candidate\.isVisited && !showVisited/);
});

test("convergence 10 current Trip Stops remain visible", () => {
  assert.match(selectionPanel, /Show current Trip Stops/);
  assert.match(selectionPanel, /candidate\.isAlreadyInTrip/);
});

test("convergence 11 out-and-back optimizer remains", () => {
  assert.match(optimizer, /outbound/);
  assert.match(optimizer, /return/);
  assert.match(optimizer, /optimizeSelectedOutAndBack/);
});

test("convergence 12 one-way manual editing remains", () => {
  assert.match(planner, /currentPlan\.tripType === "round_trip" \? <TripStationSelectionPanel/);
  assert.match(planner, /<TripStopsPanel/);
  assert.match(stopsPanel, /Add Stop/);
});

test("convergence 13 automatic suggestion UI remains absent", () => {
  assert.doesNotMatch(`${planner}\n${stopsPanel}`, /Automatic Suggestions|Generate Suggested Stops|Regenerate Suggestions/);
});

test("convergence 14 client source has no server Secret", () => {
  assert.doesNotMatch(`${planner}\n${stopsPanel}\n${selectionPanel}\n${selectionMap}\n${routeMap}\n${page}`, /SUPABASE_SECRET_KEY|service_role|MAPBOX_SERVER_ACCESS_TOKEN/);
});

test("convergence 15 crawler source is absent", () => {
  const crawler = join("scripts", "sync-tesla-" + "find" + "us-parking.ts");
  const crawlerLibrary = join("scripts", "lib", "tesla-" + "find" + "us");
  assert.equal(existsSync(crawler), false);
  assert.equal(existsSync(crawlerLibrary), false);
});

test("convergence 16 removed package commands are absent", () => {
  assert.equal(packageJson.includes("sync:" + "tesla-parking"), false);
  assert.equal(packageJson.includes("tesla:" + "parking:sync"), false);
});

test("convergence 17 application source has no removed field references", () => {
  const applicationSource = filesUnder("src").map(source).join("\n");
  for (const field of [...removedFieldNames, ...removedDatabaseNames]) {
    assert.equal(applicationSource.includes(field), false);
  }
});
