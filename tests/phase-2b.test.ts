import assert from "node:assert/strict";
import test from "node:test";
import { buildStationSyncPlan, executeStationWrites, mapNlrStationToUpsertRow, parseSyncArguments, prepareStationUpsertRows } from "../scripts/lib/station-sync";
import { getJourneySummary } from "../src/lib/journey/calculations";
import { parseStationDataSource } from "../src/lib/stations/data-source";
import { StationDataEmptyError } from "../src/lib/stations/errors";
import { normalizeNlrStationsDetailed, type NlrStation } from "../src/lib/stations/mappers";
import { readAllPages } from "../src/lib/stations/pagination";
import {
  mapPublicStationStatusRows,
  mapPublicStationStatusRowToStation,
  type PublicStationStatusRow,
} from "../src/lib/stations/supabase-public-mappers";
import type { SuperchargerStation } from "../src/types/station";

function domainStation(overrides: Partial<SuperchargerStation> = {}): SuperchargerStation {
  return {
    id: "nlr-101",
    externalId: "101",
    name: "Tesla Supercharger",
    address: "1 Main Street",
    city: "Newark",
    state: "NJ",
    postalCode: "07102",
    latitude: 40.7357,
    longitude: -74.1724,
    status: "unvisited",
    operationalStatus: "available",
    stallCount: 12,
    maxPowerKw: 250,
    lastUpdated: "2026-07-12T12:00:00Z",
    ...overrides,
  };
}

function nlrStation(overrides: Partial<NlrStation> = {}): NlrStation {
  return {
    id: 101,
    station_name: "Tesla Supercharger",
    street_address: "1 Main Street",
    city: "Newark",
    state: "NJ",
    zip: "07102",
    latitude: 40.7357,
    longitude: -74.1724,
    status_code: "E",
    ev_dc_fast_num: 12,
    updated_at: "2026-07-12T12:00:00Z",
    ...overrides,
  };
}

function publicRow(overrides: Partial<PublicStationStatusRow> = {}): PublicStationStatusRow {
  return {
    id: "12a14ac5-c1d8-47a2-9cbe-58fba26f83e6",
    external_id: "101",
    name: "Tesla Supercharger",
    address: "1 Main Street",
    city: "Newark",
    state: "NJ",
    postal_code: "07102",
    latitude: 40.7357,
    longitude: -74.1724,
    stall_count: 12,
    max_power_kw: 250,
    operational_status: "available",
    source_updated_at: "2026-07-12T12:00:00Z",
    visited: false,
    latest_visit_at: null,
    ...overrides,
  };
}

test("maps normalized NLR data to the existing stations upsert shape", () => {
  const row = mapNlrStationToUpsertRow(domainStation());
  assert.deepEqual(row, {
    external_id: "101",
    name: "Tesla Supercharger",
    address: "1 Main Street",
    city: "Newark",
    state: "NJ",
    postal_code: "07102",
    country: "US",
    latitude: 40.7357,
    longitude: -74.1724,
    stall_count: 12,
    max_power_kw: 250,
    operational_status: "available",
    source: "nlr",
    source_updated_at: "2026-07-12T12:00:00Z",
  });
});

test("deduplicates NLR records by external_id", () => {
  const result = normalizeNlrStationsDetailed([nlrStation(), nlrStation()], []);
  assert.equal(result.stations.length, 1);
  assert.equal(result.duplicatesRemoved, 1);
});

test("rejects invalid NLR coordinates without retaining the raw payload", () => {
  const result = normalizeNlrStationsDetailed([nlrStation({ latitude: 120 })], []);
  assert.equal(result.stations.length, 0);
  assert.equal(result.rejected, 1);
  assert.equal(result.rejectionExamples.length, 1);
});

test("dry run never invokes the batch writer", async () => {
  assert.equal(parseSyncArguments([]).apply, false);
  let writes = 0;
  const result = await executeStationWrites({
    rows: [mapNlrStationToUpsertRow(domainStation())],
    apply: false,
    batchSize: 300,
    writeBatch: async () => {
      writes += 1;
    },
  });
  assert.equal(writes, 0);
  assert.deepEqual(result, { succeeded: 0, failed: 0 });
});

test("a second synchronization classifies existing external_ids as updates, not inserts", () => {
  const prepared = prepareStationUpsertRows([domainStation(), domainStation()]);
  const plan = buildStationSyncPlan(prepared.rows, prepared.rows, new Set(["101"]));
  assert.equal(prepared.rows.length, 1);
  assert.equal(plan.newCount, 0);
  assert.equal(plan.updatedCount, 1);
});

test("maps a public view row without leaking snake_case into the domain", () => {
  const station = mapPublicStationStatusRowToStation(publicRow());
  assert.equal(station.externalId, "101");
  assert.equal(station.postalCode, "07102");
  assert.equal("external_id" in station, false);
});

test("maps visited=true to the blue visited domain status", () => {
  const station = mapPublicStationStatusRowToStation(
    publicRow({ visited: true, latest_visit_at: "2026-07-12T14:00:00Z" }),
  );
  assert.equal(station.status, "visited");
  assert.equal(station.visitDate, "2026-07-12T14:00:00Z");
});

test("maps visited=false to the red unvisited domain status", () => {
  assert.equal(mapPublicStationStatusRowToStation(publicRow()).status, "unvisited");
});

test("pagination reads more than 1,000 rows", async () => {
  const source = Array.from({ length: 2_505 }, (_, index) => index);
  const rows = await readAllPages(async (from, to) => source.slice(from, to + 1));
  assert.equal(rows.length, 2_505);
  assert.equal(rows.at(-1), 2_504);
});

test("pagination stops after the final short page", async () => {
  const source = Array.from({ length: 1_250 }, (_, index) => index);
  let calls = 0;
  const rows = await readAllPages(async (from, to) => {
    calls += 1;
    return source.slice(from, to + 1);
  });
  assert.equal(rows.length, 1_250);
  assert.equal(calls, 2);
});

test("Supabase source selection is explicit and invalid values do not fall back to sample", () => {
  assert.equal(parseStationDataSource("supabase"), "supabase");
  assert.throws(() => parseStationDataSource("production"), /sample, nlr, or supabase/);
});

test("private visit fields never enter the public station domain model", () => {
  const station = mapPublicStationStatusRowToStation(publicRow());
  for (const privateField of ["user_id", "notes", "recorded_latitude", "recorded_longitude"]) {
    assert.equal(privateField in station, false);
  }
});

test("journey summary counts one station even when the view represents multiple visits", () => {
  const station = mapPublicStationStatusRowToStation(
    publicRow({ visited: true, latest_visit_at: "2026-07-12T14:00:00Z" }),
  );
  const summary = getJourneySummary([station]);
  assert.equal(summary.totalStations, 1);
  assert.equal(summary.visitedStations, 1);
});

test("an empty Supabase station view produces the explicit import empty state", () => {
  assert.throws(() => mapPublicStationStatusRows([]), StationDataEmptyError);
});
