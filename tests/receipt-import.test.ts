import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  CONFIRMED_RECEIPT_LOCATION_MAPPINGS,
} from "../scripts/data/receipt-station-mappings";
import {
  createReceiptFingerprint,
  createReceiptVisitId,
  normalizeDecimal,
} from "../scripts/lib/receipt-import/fingerprint";
import {
  buildReceiptImportPlan,
  executeReceiptImport,
  mapReceiptToRpcArguments,
} from "../scripts/lib/receipt-import/importer";
import {
  canonicalizeReceiptStreetAddress,
  matchReceiptToStation,
} from "../scripts/lib/receipt-import/matcher";
import {
  normalizeReceiptRecord,
  normalizeReceiptRecords,
} from "../scripts/lib/receipt-import/normalizer";
import { parseTeslaReceiptText } from "../scripts/lib/receipt-import/parser";
import {
  localDateNoonToUtc,
  localDateTimeToUtc,
} from "../scripts/lib/receipt-import/timezone";
import type {
  NormalizedReceiptRecord,
  ParsedReceiptRecord,
  ReceiptImportPlanRecord,
  ReceiptStationRow,
} from "../scripts/lib/receipt-import/types";
import {
  JERSEY_CITY_MANUAL_EXTERNAL_ID,
  PISCATAWAY_MANUAL_EXTERNAL_ID,
} from "../src/lib/stations/station-aliases";
import { formatCheckInDisplayDate } from "../src/lib/journey/calculations";

function parsedReceipt(overrides: Partial<ParsedReceiptRecord> = {}): ParsedReceiptRecord {
  return {
    sourceFile: "3000P0301161966_EN-US.pdf",
    sourcePage: 1,
    sourceReceiptId: "3000P0301161966",
    referenceId: "052e0fc6-5820-4ba0-a2f0-cde047807280",
    rawLocation: "Piscataway, NJ\nCentennial Avenue 88\n08854 Piscataway NJ, US",
    locationName: "Piscataway, NJ",
    streetAddress: "Centennial Avenue 88",
    city: "Piscataway",
    state: "NJ",
    postalCode: "08854",
    country: "US",
    eventDate: "2026-04-29",
    energyKwh: 42.5,
    costUsd: 12.34,
    chargingMinutes: null,
    pricePerKwh: 0.27,
    ...overrides,
  };
}

function stationRow(overrides: Partial<ReceiptStationRow> = {}): ReceiptStationRow {
  return {
    id: "0d6960a1-6ba9-4f4e-8371-f62080d01f30",
    external_id: PISCATAWAY_MANUAL_EXTERNAL_ID,
    name: "Piscataway, NJ - Centennial Avenue",
    address: "88 Centennial Avenue",
    city: "Piscataway",
    state: "NJ",
    postal_code: "08854",
    latitude: 40.539647,
    longitude: -74.501189,
    ...overrides,
  };
}

function validNormalizedReceipt(
  overrides: Partial<NormalizedReceiptRecord> = {},
): NormalizedReceiptRecord {
  const fingerprint = createReceiptFingerprint({
    sourceReceiptId: "3000P0301161966",
    stationExternalId: PISCATAWAY_MANUAL_EXTERNAL_ID,
    startedAtUtc: "2026-04-29T19:00:00.000Z",
    energyKwh: 42.5,
    costUsd: 12.34,
    chargingMinutes: null,
    sourceFile: "3000P0301161966_EN-US.pdf",
    sourcePage: 1,
  });
  return {
    sourceFile: "3000P0301161966_EN-US.pdf",
    sourcePage: 1,
    sourceReceiptId: "3000P0301161966",
    referenceId: "052e0fc6-5820-4ba0-a2f0-cde047807280",
    rawLocation: "Piscataway",
    eventDate: "2026-04-29",
    normalizedAddress: "88 CENTENNIAL AVE PISCATAWAY NJ 08854",
    stationExternalId: PISCATAWAY_MANUAL_EXTERNAL_ID,
    stationId: "0d6960a1-6ba9-4f4e-8371-f62080d01f30",
    localStartedAt: "2026-04-29T15:00:00",
    timezone: "America/New_York",
    startedAtUtc: "2026-04-29T19:00:00.000Z",
    visitAnchorAtUtc: "2026-04-29T19:00:00.000Z",
    checkedInTimePrecision: "exact",
    energyKwh: 42.5,
    costUsd: 12.34,
    chargingMinutes: null,
    pricePerKwh: 0.27,
    receiptFingerprint: fingerprint,
    visitId: createReceiptVisitId(fingerprint),
    status: "valid",
    matchMethod: "confirmed_external_id",
    error: null,
    ...overrides,
  };
}

test("Tesla Invoice ID produces a stable namespaced fingerprint", () => {
  const input = {
    sourceReceiptId: "3000P0301161966",
    stationExternalId: PISCATAWAY_MANUAL_EXTERNAL_ID,
    startedAtUtc: "2026-04-29T19:00:00.000Z",
    sourceFile: "receipt.pdf",
  };
  assert.equal(createReceiptFingerprint(input), createReceiptFingerprint(input));
  assert.equal(createReceiptFingerprint(input), "tesla:invoice:3000P0301161966");
});

test("fallback fingerprint is stable without a Tesla unique ID", () => {
  const input = {
    stationExternalId: "123",
    startedAtUtc: "2026-04-29T19:00:00.000Z",
    energyKwh: 18.5,
    costUsd: 4.25,
    chargingMinutes: 20,
    sourceFile: "receipt.pdf",
    sourcePage: 1,
  };
  assert.equal(createReceiptFingerprint(input), createReceiptFingerprint({ ...input }));
});

test("decimal normalization treats 18.5 and 18.50 identically", () => {
  assert.equal(normalizeDecimal("18.5"), normalizeDecimal("18.50"));
});

test("UUID v5 is stable for the same Receipt fingerprint", () => {
  assert.equal(createReceiptVisitId("tesla:invoice:1"), createReceiptVisitId("tesla:invoice:1"));
});

test("Invoice-based UUID v5 does not change when the representative anchor changes", () => {
  const first = createReceiptFingerprint({
    sourceReceiptId: "3000P0301161966",
    stationExternalId: PISCATAWAY_MANUAL_EXTERNAL_ID,
    startedAtUtc: "2026-04-29T16:00:00.000Z",
    sourceFile: "receipt.pdf",
  });
  const second = createReceiptFingerprint({
    sourceReceiptId: "3000P0301161966",
    stationExternalId: PISCATAWAY_MANUAL_EXTERNAL_ID,
    startedAtUtc: "2026-04-29T22:00:00.000Z",
    sourceFile: "receipt.pdf",
  });
  assert.equal(createReceiptVisitId(first), createReceiptVisitId(second));
});

test("different Receipts produce different visit IDs", () => {
  assert.notEqual(createReceiptVisitId("tesla:invoice:1"), createReceiptVisitId("tesla:invoice:2"));
});

test("receipt-order street addresses are canonicalized without changing leading house numbers", () => {
  assert.equal(canonicalizeReceiptStreetAddress("Centennial Avenue 88"), "88 Centennial Avenue");
  assert.equal(canonicalizeReceiptStreetAddress("2-36 Garfield Avenue"), "2-36 Garfield Avenue");
});

test("Piscataway and Garfield Receipt locations use their manual station IDs", () => {
  const piscataway = matchReceiptToStation(parsedReceipt(), [stationRow()]);
  const jerseyReceipt = parsedReceipt({
    locationName: "Jersey City, NJ",
    streetAddress: "Garfield Ave 2-36",
    city: "Jersey City",
    postalCode: "07305",
  });
  const jerseyStation = stationRow({
    id: "jersey-uuid",
    external_id: JERSEY_CITY_MANUAL_EXTERNAL_ID,
    name: "Jersey City, NJ - Garfield Avenue",
    address: "2-36 Garfield Avenue",
    city: "Jersey City",
    postal_code: "07305",
    latitude: 40.685172,
    longitude: -74.099118,
  });
  const jersey = matchReceiptToStation(jerseyReceipt, [jerseyStation]);
  assert.equal(piscataway.expectedExternalId, PISCATAWAY_MANUAL_EXTERNAL_ID);
  assert.equal(jersey.expectedExternalId, JERSEY_CITY_MANUAL_EXTERNAL_ID);
});

test("city-only input cannot match a station", () => {
  const result = matchReceiptToStation(
    parsedReceipt({
      locationName: "Piscataway",
      streetAddress: "",
      city: "Piscataway",
      postalCode: "",
    }),
    [stationRow()],
  );
  assert.equal(result.status, "unmatched");
});

test("all 25 reviewed locations map to one unique station external ID", () => {
  const stations = CONFIRMED_RECEIPT_LOCATION_MAPPINGS.map((mapping, index) => stationRow({
    id: `station-${index}`,
    external_id: mapping.stationExternalId,
    name: mapping.locationName,
    address: canonicalizeReceiptStreetAddress(mapping.streetAddress),
    city: mapping.city,
    state: mapping.state,
    postal_code: mapping.postalCode,
  }));
  const matches = CONFIRMED_RECEIPT_LOCATION_MAPPINGS.map((mapping, index) => matchReceiptToStation(
    parsedReceipt({
      sourceReceiptId: `invoice-${index}`,
      locationName: mapping.locationName,
      streetAddress: mapping.streetAddress,
      city: mapping.city,
      state: mapping.state,
      postalCode: mapping.postalCode,
    }),
    stations,
  ));
  assert.equal(CONFIRMED_RECEIPT_LOCATION_MAPPINGS.length, 25);
  assert.equal(matches.every((match) => match.status === "matched" && match.candidates.length === 1), true);
  assert.equal(new Set(matches.map((match) => match.expectedExternalId)).size, 25);
});

test("New York local time converts through 2026 daylight saving time", () => {
  assert.equal(
    localDateTimeToUtc("2026-03-20T15:00:00", "America/New_York"),
    "2026-03-20T19:00:00.000Z",
  );
  assert.equal(
    localDateTimeToUtc("2026-01-20T15:00:00", "America/New_York"),
    "2026-01-20T20:00:00.000Z",
  );
});

test("date-only noon anchors honor New York, Los Angeles, and Phoenix timezone rules", () => {
  assert.equal(
    localDateNoonToUtc("2026-03-20", "America/New_York"),
    "2026-03-20T16:00:00.000Z",
  );
  assert.equal(
    localDateNoonToUtc("2026-07-10", "America/Los_Angeles"),
    "2026-07-10T19:00:00.000Z",
  );
  assert.equal(
    localDateNoonToUtc("2026-07-10", "America/Phoenix"),
    "2026-07-10T19:00:00.000Z",
  );
});

test("nonexistent DST local time is rejected", () => {
  assert.throws(
    () => localDateTimeToUtc("2026-03-08T02:30:00", "America/New_York"),
    /does not exist/,
  );
});

test("Invoice parser extracts ID, reference, event date, energy, cost, and explicit price", () => {
  const parsed = parseTeslaReceiptText("invoice.pdf", [
    "Invoice Number 3000P0290657679",
    "Invoice date 2026/04/01",
    "Reference Number 19c38926-cf0b-44ce-8286-baa0a8a26759",
    "Charging Location",
    "Jersey City, NJ",
    "Garfield Ave 2-36",
    "07305 Jersey City NJ, US",
    "S/N: GF2241000004AP - 2 / 325 kW DC",
    "Date of Event Description Unit Price (USD) Quantity Tax (%) Total (USD)",
    "2026/04/01 Energy fee 0.22 / kWh 45.6290 kWh 6.625 9.84",
    "Total Amount (USD) 10.49",
  ].join("\n"));
  assert.equal(parsed.sourceReceiptId, "3000P0290657679");
  assert.equal(parsed.referenceId, "19c38926-cf0b-44ce-8286-baa0a8a26759");
  assert.equal(parsed.eventDate, "2026-04-01");
  assert.equal(parsed.energyKwh, 45.629);
  assert.equal(parsed.costUsd, 10.49);
  assert.equal(parsed.pricePerKwh, 0.22);
  assert.equal(parsed.chargingMinutes, null);
});

test("a Receipt with only an event date is valid and uses local noon only as its Visit anchor", () => {
  const normalized = normalizeReceiptRecord(parsedReceipt(), [stationRow()], new Map());
  assert.equal(normalized.status, "valid");
  assert.equal(normalized.localStartedAt, null);
  assert.equal(normalized.startedAtUtc, null);
  assert.equal(normalized.visitAnchorAtUtc, "2026-04-29T16:00:00.000Z");
  assert.equal(normalized.checkedInTimePrecision, "date_only");
});

test("reviewed local start time produces a valid UTC Receipt record", () => {
  const normalized = normalizeReceiptRecord(
    parsedReceipt(),
    [stationRow()],
    new Map([["3000P0301161966", {
      sourceReceiptId: "3000P0301161966",
      localStartedAt: "2026-04-29T15:00:00",
    }]]),
  );
  assert.equal(normalized.status, "valid");
  assert.equal(normalized.timezone, "America/New_York");
  assert.equal(normalized.startedAtUtc, "2026-04-29T19:00:00.000Z");
  assert.equal(normalized.visitAnchorAtUtc, normalized.startedAtUtc);
  assert.equal(normalized.checkedInTimePrecision, "exact");
});

test("date-only display shows the local date without exposing the noon anchor as a time", () => {
  const display = formatCheckInDisplayDate(
    "2026-04-29T16:00:00.000Z",
    "en",
    "date_only",
    "America/New_York",
  );
  assert.match(display, /April 29, 2026/);
  assert.doesNotMatch(display, /12:00|PM|AM/);
});

test("exact display retains the real local session time", () => {
  const display = formatCheckInDisplayDate(
    "2026-04-29T19:00:00.000Z",
    "en",
    "exact",
    "America/New_York",
  );
  assert.match(display, /3:00 PM/);
});

test("Dry Run execution never calls the write RPC", async () => {
  let calls = 0;
  const record = { ...validNormalizedReceipt(), visitExists: false, chargingSessionExists: false };
  const result = await executeReceiptImport({
    records: [record],
    importUserId: "00000000-0000-4000-8000-000000000001",
    apply: false,
    callRpc: async () => {
      calls += 1;
    },
  });
  assert.equal(calls, 0);
  assert.deepEqual(result, { succeeded: 0, failed: 0 });
});

test("Apply maps one valid Receipt to one atomic RPC call", async () => {
  const calls: unknown[] = [];
  const record = { ...validNormalizedReceipt(), visitExists: false, chargingSessionExists: false };
  await executeReceiptImport({
    records: [record],
    importUserId: "00000000-0000-4000-8000-000000000001",
    apply: true,
    callRpc: async (args) => {
      calls.push(args);
    },
  });
  assert.equal(calls.length, 1);
});

test("repeat planning classifies the same Visit and Charging Session as existing", () => {
  const record = validNormalizedReceipt();
  const plan = buildReceiptImportPlan({
    records: [record],
    existingVisits: [{
      id: record.visitId,
      station_id: record.stationId ?? "",
      user_id: "00000000-0000-4000-8000-000000000001",
      checked_in_at: record.startedAtUtc ?? "",
      checked_in_time_precision: "exact",
    }],
    existingChargingSessionVisitIds: new Set([record.visitId]),
    importUserId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(plan.newVisits, 0);
  assert.equal(plan.existingVisits, 1);
  assert.equal(plan.newChargingSessions, 0);
  assert.equal(plan.existingChargingSessions, 1);
});

test("a second date-only Apply plan remains idempotent", () => {
  const record = normalizeReceiptRecord(parsedReceipt(), [stationRow()], new Map());
  const plan = buildReceiptImportPlan({
    records: [record],
    existingVisits: [{
      id: record.visitId,
      station_id: record.stationId ?? "",
      user_id: "00000000-0000-4000-8000-000000000001",
      checked_in_at: record.visitAnchorAtUtc,
      checked_in_time_precision: "date_only",
    }],
    existingChargingSessionVisitIds: new Set([record.visitId]),
    importUserId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(plan.newVisits, 0);
  assert.equal(plan.existingVisits, 1);
  assert.equal(plan.newChargingSessions, 0);
  assert.equal(plan.existingChargingSessions, 1);
  assert.equal(plan.records[0]?.status, "valid");
});

test("existing visitId with a different station is a dangerous conflict", () => {
  const record = validNormalizedReceipt();
  const plan = buildReceiptImportPlan({
    records: [record],
    existingVisits: [{
      id: record.visitId,
      station_id: "different-station",
      user_id: "00000000-0000-4000-8000-000000000001",
      checked_in_at: record.startedAtUtc ?? "",
      checked_in_time_precision: "exact",
    }],
    existingChargingSessionVisitIds: new Set(),
    importUserId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(plan.records[0]?.status, "conflict");
});

test("multiple Receipts at one station retain separate visits", () => {
  const first = validNormalizedReceipt();
  const secondFingerprint = createReceiptFingerprint({
    sourceReceiptId: "3000P0301161967",
    stationExternalId: first.stationExternalId ?? "",
    startedAtUtc: "2026-04-30T19:00:00.000Z",
    sourceFile: "second.pdf",
  });
  const second = validNormalizedReceipt({
    sourceFile: "second.pdf",
    sourceReceiptId: "3000P0301161967",
    startedAtUtc: "2026-04-30T19:00:00.000Z",
    receiptFingerprint: secondFingerprint,
    visitId: createReceiptVisitId(secondFingerprint),
  });
  assert.equal(new Set([first.visitId, second.visitId]).size, 2);
  assert.equal(new Set([first.stationId, second.stationId]).size, 1);
});

test("multiple station visits still represent one visited station", () => {
  const records = [validNormalizedReceipt(), validNormalizedReceipt({ visitId: "another-visit" })];
  assert.equal(new Set(records.map((record) => record.stationId)).size, 1);
});

test("RPC arguments never write station coordinates as recorded GPS", () => {
  const record: ReceiptImportPlanRecord = {
    ...validNormalizedReceipt(),
    visitExists: false,
    chargingSessionExists: false,
  };
  const args = mapReceiptToRpcArguments(record, "00000000-0000-4000-8000-000000000001");
  assert.equal("recorded_latitude" in args, false);
  assert.equal("recorded_longitude" in args, false);
});

test("price_per_kwh remains null when it was not explicitly present", () => {
  const record: ReceiptImportPlanRecord = {
    ...validNormalizedReceipt({ pricePerKwh: null }),
    visitExists: false,
    chargingSessionExists: false,
  };
  assert.equal(
    mapReceiptToRpcArguments(record, "00000000-0000-4000-8000-000000000001").p_price_per_kwh,
    null,
  );
});

test("date-only RPC arguments keep session started_at and duration null", () => {
  const normalized = normalizeReceiptRecord(parsedReceipt(), [stationRow()], new Map());
  const record: ReceiptImportPlanRecord = {
    ...normalized,
    visitExists: false,
    chargingSessionExists: false,
  };
  const args = mapReceiptToRpcArguments(record, "00000000-0000-4000-8000-000000000001");
  assert.equal(args.p_checked_in_at, "2026-04-29T16:00:00.000Z");
  assert.equal(args.p_checked_in_time_precision, "date_only");
  assert.equal(args.p_session_started_at, null);
  assert.equal(args.p_charging_minutes, null);
});

test("exact RPC arguments keep the real session started_at", () => {
  const record: ReceiptImportPlanRecord = {
    ...validNormalizedReceipt(),
    visitExists: false,
    chargingSessionExists: false,
  };
  const args = mapReceiptToRpcArguments(record, "00000000-0000-4000-8000-000000000001");
  assert.equal(args.p_checked_in_time_precision, "exact");
  assert.equal(args.p_session_started_at, "2026-04-29T19:00:00.000Z");
});

test("missing duration does not prevent a valid date-only record from being planned", () => {
  const record = normalizeReceiptRecord(parsedReceipt(), [stationRow()], new Map());
  const plan = buildReceiptImportPlan({
    records: [record],
    existingVisits: [],
    existingChargingSessionVisitIds: new Set(),
    importUserId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(record.chargingMinutes, null);
  assert.equal(plan.newVisits, 1);
  assert.equal(plan.newChargingSessions, 1);
});

test("the current reviewed 75-Receipt fixture is entirely valid and date-only", () => {
  const stations = CONFIRMED_RECEIPT_LOCATION_MAPPINGS.map((mapping, index) => stationRow({
    id: `station-${index}`,
    external_id: mapping.stationExternalId,
    name: mapping.locationName,
    address: canonicalizeReceiptStreetAddress(mapping.streetAddress),
    city: mapping.city,
    state: mapping.state,
    postal_code: mapping.postalCode,
  }));
  const receipts = CONFIRMED_RECEIPT_LOCATION_MAPPINGS.flatMap((mapping, mappingIndex) =>
    Array.from({ length: mapping.receiptCount }, (_, receiptIndex) => parsedReceipt({
      sourceFile: `receipt-${mappingIndex}-${receiptIndex}.pdf`,
      sourceReceiptId: `invoice-${mappingIndex}-${receiptIndex}`,
      locationName: mapping.locationName,
      streetAddress: mapping.streetAddress,
      city: mapping.city,
      state: mapping.state,
      postalCode: mapping.postalCode,
    })),
  );
  const normalized = normalizeReceiptRecords(receipts, stations, new Map());
  assert.equal(normalized.length, 75);
  assert.equal(normalized.every((record) => record.status === "valid"), true);
  assert.equal(normalized.every((record) => record.checkedInTimePrecision === "date_only"), true);
  assert.equal(normalized.every((record) => record.startedAtUtc === null), true);
});

test("duplicate Receipt fingerprints are reported as conflicts", () => {
  const record = validNormalizedReceipt();
  const plan = buildReceiptImportPlan({
    records: [record, { ...record }],
    existingVisits: [],
    existingChargingSessionVisitIds: new Set(),
    importUserId: "00000000-0000-4000-8000-000000000001",
  });
  assert.equal(plan.duplicateReceiptsDetected, 1);
  assert.equal(plan.records.every((candidate) => candidate.status === "conflict"), true);
});

test("Receipt report records contain no Secret or import user UUID field", () => {
  const serialized = JSON.stringify(validNormalizedReceipt());
  assert.equal(serialized.includes("SUPABASE_SECRET_KEY"), false);
  assert.equal(serialized.includes("IMPORT_USER_ID"), false);
  assert.equal(serialized.includes("userId"), false);
});

test("import RPC is security definer and executable only by service_role", async () => {
  const sql = await readFile(
    "supabase/migrations/20260712210000_add_date_only_receipt_precision.sql",
    "utf8",
  );
  assert.match(sql, /security definer/i);
  assert.match(sql, /revoke all on function[\s\S]+from public, anon, authenticated/i);
  assert.match(sql, /grant execute on function[\s\S]+to service_role/i);
  assert.match(sql, /p_checked_in_time_precision not in \('exact', 'date_only'\)/i);
  assert.match(sql, /p_checked_in_time_precision = 'date_only'[\s\S]+p_session_started_at is not null/i);
  assert.doesNotMatch(sql, /grant delete/i);
});

test("production RPC qualifies visit_id and uses the named Session conflict constraint", async () => {
  const sql = await readFile(
    "supabase/migrations/20260712214000_fix_receipt_rpc_conflict_target.sql",
    "utf8",
  );
  assert.match(sql, /where cs\.visit_id = p_visit_id/i);
  assert.match(
    sql,
    /on conflict on constraint charging_sessions_visit_id_key do update/i,
  );
});
