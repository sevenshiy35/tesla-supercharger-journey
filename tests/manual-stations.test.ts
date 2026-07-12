import assert from "node:assert/strict";
import test from "node:test";
import { MANUAL_STATIONS } from "../scripts/data/manual-stations";
import {
  buildConfirmedNlrAdoptionPlan,
  buildManualStationSyncPlan,
  executeManualStationWrites,
  mapManualStationToUpsertRow,
  type ManualStationUpsertRow,
} from "../scripts/lib/manual-station-sync";
import {
  buildStationReconciliationReport,
  reconcileNewNlrStations,
  type ManualStationRecord,
} from "../scripts/lib/station-reconciliation";
import type { StationUpsertRow } from "../scripts/lib/station-sync";
import {
  getStreetAddressIdentity,
  haveSameHouseAndStreet,
  normalizeAddress,
} from "../src/lib/stations/address-normalization";
import {
  JERSEY_CITY_MANUAL_EXTERNAL_ID,
  matchManualStationAlias,
  PISCATAWAY_MANUAL_EXTERNAL_ID,
} from "../src/lib/stations/station-aliases";

function nlrRow(overrides: Partial<StationUpsertRow> = {}): StationUpsertRow {
  return {
    external_id: "nlr-candidate-101",
    name: "Tesla Supercharger",
    address: "88 Centennial Ave",
    city: "Piscataway",
    state: "NJ",
    postal_code: "08854",
    country: "US",
    latitude: 40.53965,
    longitude: -74.50119,
    stall_count: 12,
    max_power_kw: 250,
    operational_status: "available",
    source: "nlr",
    source_updated_at: "2026-07-12T00:00:00Z",
    ...overrides,
  };
}

function manualRecord(overrides: Partial<ManualStationRecord> = {}): ManualStationRecord {
  const definition = MANUAL_STATIONS[0];
  return {
    id: "0d6960a1-6ba9-4f4e-8371-f62080d01f30",
    external_id: definition.externalId,
    name: definition.name,
    address: definition.address,
    city: definition.city,
    state: definition.state,
    postal_code: definition.postalCode,
    latitude: definition.latitude,
    longitude: definition.longitude,
    source: definition.source,
    ...overrides,
  };
}

test("manual station definitions contain the two audited stable external IDs", () => {
  const externalIds = MANUAL_STATIONS.map((station) => station.externalId);
  assert.deepEqual(
    externalIds,
    [PISCATAWAY_MANUAL_EXTERNAL_ID, JERSEY_CITY_MANUAL_EXTERNAL_ID],
  );
  assert.equal(new Set(externalIds).size, externalIds.length);
});

test("Piscataway retains Tesla-official stall and power details", () => {
  const station = MANUAL_STATIONS.find(
    (candidate) => candidate.externalId === PISCATAWAY_MANUAL_EXTERNAL_ID,
  );
  assert.equal(station?.source, "tesla_official");
  assert.equal(station?.stallCount, 12);
  assert.equal(station?.maxPowerKw, 325);
});

test("Jersey City keeps unverified stall and power values null", () => {
  const station = MANUAL_STATIONS.find(
    (candidate) => candidate.externalId === JERSEY_CITY_MANUAL_EXTERNAL_ID,
  );
  assert.equal(station?.source, "tesla_receipt_verified");
  assert.equal(station?.stallCount, null);
  assert.equal(station?.maxPowerKw, null);
});

test("Jersey City does not adopt the unconfirmed numeric Tesla identifier", () => {
  const station = MANUAL_STATIONS.find(
    (candidate) => candidate.externalId === JERSEY_CITY_MANUAL_EXTERNAL_ID,
  );
  assert.equal(JSON.stringify(station).includes("27400"), false);
});

test("normalization unifies Unicode and ASCII dashes", () => {
  assert.equal(
    normalizeAddress("Piscataway, NJ – Centennial Avenue"),
    normalizeAddress("Piscataway NJ - Centennial Ave"),
  );
});

test("normalization unifies spaced house-number ranges", () => {
  assert.equal(
    normalizeAddress("2 - 36 Garfield Avenue"),
    normalizeAddress("2-36 Garfield Ave."),
  );
});

test("normalization converts New Jersey and ZIP+4 to the stable form", () => {
  assert.equal(
    normalizeAddress("88 Centennial Avenue, Piscataway, New Jersey 08854-1234"),
    "88 CENTENNIAL AVE PISCATAWAY NJ 08854",
  );
});

test("street identity preserves the full house-number range", () => {
  assert.deepEqual(getStreetAddressIdentity("2 - 36 Garfield Avenue"), {
    normalized: "2-36 GARFIELD AVE",
    houseNumber: "2-36",
    street: "GARFIELD AVE",
  });
});

test("house and street comparison accepts suffix variants but not different numbers", () => {
  assert.equal(haveSameHouseAndStreet("88 Centennial Avenue", "88 Centennial Ave."), true);
  assert.equal(haveSameHouseAndStreet("88 Centennial Avenue", "89 Centennial Ave."), false);
});

test("explicit receipt aliases match both audited stations", () => {
  assert.equal(matchManualStationAlias("Wawa – Piscataway"), PISCATAWAY_MANUAL_EXTERNAL_ID);
  assert.equal(matchManualStationAlias("Centennial Avenue 88"), PISCATAWAY_MANUAL_EXTERNAL_ID);
  assert.equal(
    matchManualStationAlias("2 - 36 Garfield Avenue"),
    JERSEY_CITY_MANUAL_EXTERNAL_ID,
  );
  assert.equal(matchManualStationAlias("Garfield Ave 2-36"), JERSEY_CITY_MANUAL_EXTERNAL_ID);
});

test("city-only text is never a station alias", () => {
  assert.equal(matchManualStationAlias("Piscataway"), undefined);
  assert.equal(matchManualStationAlias("Jersey City"), undefined);
});

test("manual upsert rows exclude aliases and evidence notes from the public data shape", () => {
  const row = mapManualStationToUpsertRow(MANUAL_STATIONS[0]);
  assert.equal("receiptAliases" in row, false);
  assert.equal("evidenceNotes" in row, false);
  assert.equal("id" in row, false);
  assert.equal("created_at" in row, false);
  assert.equal("updated_at" in row, false);
});

test("manual sync is Dry Run by default at the execution boundary", async () => {
  let writes = 0;
  const plan = buildManualStationSyncPlan(MANUAL_STATIONS, new Set());
  const result = await executeManualStationWrites({
    rows: plan.rows,
    apply: false,
    writeRows: async () => {
      writes += 1;
    },
  });
  assert.equal(writes, 0);
  assert.deepEqual(result, { succeeded: 0, failed: 0 });
});

test("second manual sync updates on external_id without duplicating or replacing UUIDs", async () => {
  const stored = new Map<string, { id: string; row: ManualStationUpsertRow }>();
  let nextId = 1;
  const writeRows = async (rows: ManualStationUpsertRow[]) => {
    for (const row of rows) {
      const current = stored.get(row.external_id);
      stored.set(row.external_id, {
        id: current?.id ?? `stable-uuid-${nextId++}`,
        row,
      });
    }
  };
  const firstPlan = buildManualStationSyncPlan(MANUAL_STATIONS, new Set());
  await executeManualStationWrites({ rows: firstPlan.rows, apply: true, writeRows });
  const firstIds = [...stored.values()].map((value) => value.id);
  const secondPlan = buildManualStationSyncPlan(MANUAL_STATIONS, new Set(stored.keys()));
  await executeManualStationWrites({ rows: secondPlan.rows, apply: true, writeRows });

  assert.equal(stored.size, 2);
  assert.deepEqual([...stored.values()].map((value) => value.id), firstIds);
  assert.equal(secondPlan.newCount, 0);
  assert.equal(secondPlan.updatedCount, 2);
});

test("a high-confidence NLR duplicate is reported and skipped", () => {
  const result = reconcileNewNlrStations({
    selectedRows: [nlrRow()],
    existingExternalIds: new Set(),
    manualStations: [manualRecord()],
  });
  assert.equal(result.highConfidenceCandidates.length, 1);
  assert.deepEqual(result.skippedNlrExternalIds, ["nlr-candidate-101"]);
  assert.equal(result.rowsToSync.length, 0);
});

test("nearby stations at different addresses are warned about but never auto-merged", () => {
  const result = reconcileNewNlrStations({
    selectedRows: [nlrRow({ address: "100 Centennial Avenue" })],
    existingExternalIds: new Set(),
    manualStations: [manualRecord()],
  });
  assert.equal(result.lowConfidenceCandidates.length, 1);
  assert.equal(result.lowConfidenceCandidates[0]?.blocksNlrInsert, false);
  assert.equal(result.rowsToSync.length, 1);
  assert.equal(result.skippedNlrExternalIds.length, 0);
});

test("an exact address 250-1600m away is low-confidence but still blocks a duplicate insert", () => {
  const result = reconcileNewNlrStations({
    selectedRows: [nlrRow({ latitude: 40.5475 })],
    existingExternalIds: new Set(),
    manualStations: [manualRecord()],
  });
  assert.equal(result.lowConfidenceCandidates.length, 1);
  assert.equal(result.lowConfidenceCandidates[0]?.blocksNlrInsert, true);
  assert.equal(result.rowsToSync.length, 0);
});

test("existing NLR external IDs bypass manual reconciliation and remain updates", () => {
  const row = nlrRow();
  const result = reconcileNewNlrStations({
    selectedRows: [row],
    existingExternalIds: new Set([row.external_id]),
    manualStations: [manualRecord()],
  });
  assert.deepEqual(result.rowsToSync, [row]);
  assert.equal(result.highConfidenceCandidates.length, 0);
});

test("reconciliation reports contain candidate facts but no environment secrets", () => {
  const result = reconcileNewNlrStations({
    selectedRows: [nlrRow()],
    existingExternalIds: new Set(),
    manualStations: [manualRecord()],
  });
  const report = buildStationReconciliationReport(
    result,
    "dry-run",
    "2026-07-12T12:00:00.000Z",
  );
  const serialized = JSON.stringify(report);
  assert.equal(report.counts.skippedPossibleDuplicates, 1);
  assert.equal(serialized.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(serialized.includes("NLR_API_KEY"), false);
});

test("future confirmed NLR adoption targets the existing UUID without changing it", () => {
  const plan = buildConfirmedNlrAdoptionPlan("stable-station-uuid", nlrRow());
  assert.equal(plan.stationId, "stable-station-uuid");
  assert.equal("id" in plan.changes, false);
  assert.equal(plan.changes.external_id, "nlr-candidate-101");
});
