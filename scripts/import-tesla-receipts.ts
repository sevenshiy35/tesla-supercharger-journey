import { loadEnvConfig } from "@next/env";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { z } from "zod";
import { readAllPages } from "../src/lib/stations/pagination";
import {
  JERSEY_CITY_MANUAL_EXTERNAL_ID,
  PISCATAWAY_MANUAL_EXTERNAL_ID,
} from "../src/lib/stations/station-aliases";
import {
  buildReceiptImportPlan,
  executeReceiptImport,
} from "./lib/receipt-import/importer";
import { normalizeReceiptRecords } from "./lib/receipt-import/normalizer";
import {
  parseTeslaReceiptInput,
  readReceiptTimeOverrides,
} from "./lib/receipt-import/parser";
import { writeReceiptImportReports } from "./lib/receipt-import/report";
import type {
  ExistingVisitRow,
  ReceiptStationRow,
} from "./lib/receipt-import/types";
import { createSupabaseAdminClient } from "./lib/supabase-admin";

interface ImportArguments {
  apply: boolean;
  inputPath: string;
  timeOverridesPath?: string;
  limit?: number;
}

function parsePositiveInteger(name: string, value: string) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

export function parseReceiptImportArguments(args: string[]): ImportArguments {
  let apply = false;
  let explicitlyDry = false;
  let inputPath = join(homedir(), "Downloads", "JAN_2026-JAN_2027.zip");
  let timeOverridesPath: string | undefined;
  let limit: number | undefined;

  for (const argument of args) {
    if (argument === "--apply") {
      apply = true;
    } else if (argument === "--dry-run") {
      explicitlyDry = true;
    } else if (argument.startsWith("--input=")) {
      inputPath = resolve(argument.slice("--input=".length));
    } else if (argument.startsWith("--time-overrides=")) {
      timeOverridesPath = resolve(argument.slice("--time-overrides=".length));
    } else if (argument.startsWith("--limit=")) {
      limit = parsePositiveInteger("--limit", argument.slice("--limit=".length));
    } else {
      throw new Error(`Unknown Receipt import argument: ${argument}`);
    }
  }

  if (apply && explicitlyDry) {
    throw new Error("Choose either --apply or --dry-run, not both.");
  }

  return { apply, inputPath, timeOverridesPath, limit };
}

function printMetric(label: string, value: number) {
  console.log(`${label}: ${value.toLocaleString("en-US")}`);
}

async function main() {
  const startedAt = Date.now();
  loadEnvConfig(process.cwd());
  const args = parseReceiptImportArguments(process.argv.slice(2));
  const importUserValue = process.env.IMPORT_USER_ID?.trim() || null;
  const importUserId = importUserValue && z.string().uuid().safeParse(importUserValue).success
    ? importUserValue
    : null;
  const client = createSupabaseAdminClient();
  const parsed = await parseTeslaReceiptInput(args.inputPath);
  const selectedReceipts = args.limit ? parsed.records.slice(0, args.limit) : parsed.records;
  const timeOverrides = await readReceiptTimeOverrides(args.timeOverridesPath);
  const stations = await readAllPages(async (from, to) => {
    const { data, error } = await client
      .from("stations")
      .select("id,external_id,name,address,city,state,postal_code,latitude,longitude")
      .order("external_id", { ascending: true })
      .range(from, to);
    if (error) {
      throw new Error(`Could not read stations: ${error.message.slice(0, 500)}`);
    }
    return (data ?? []) as ReceiptStationRow[];
  }, { pageSize: 1_000, maxPages: 20 });
  const manualPrerequisitesPresent = [
    JERSEY_CITY_MANUAL_EXTERNAL_ID,
    PISCATAWAY_MANUAL_EXTERNAL_ID,
  ].every((externalId) => stations.some((station) => station.external_id === externalId));
  let importAdminValid = false;

  if (importUserId) {
    const { data, error } = await client
      .from("app_admins")
      .select("user_id")
      .eq("user_id", importUserId)
      .maybeSingle();
    if (error) {
      throw new Error(`Could not validate IMPORT_USER_ID: ${error.message.slice(0, 500)}`);
    }
    importAdminValid = Boolean(data);
  }

  const normalized = normalizeReceiptRecords(selectedReceipts, stations, timeOverrides);
  const visitIds = normalized.map((record) => record.visitId);
  const existingVisits: ExistingVisitRow[] = [];
  const existingChargingSessionVisitIds = new Set<string>();

  for (let start = 0; start < visitIds.length; start += 100) {
    const ids = visitIds.slice(start, start + 100);
    if (ids.length === 0) {
      continue;
    }
    const [{ data: visitData, error: visitError }, { data: sessionData, error: sessionError }] = await Promise.all([
      client
        .from("station_visits")
        .select("id,station_id,user_id,checked_in_at,checked_in_time_precision")
        .in("id", ids),
      client.from("charging_sessions").select("visit_id").in("visit_id", ids),
    ]);
    if (visitError) {
      throw new Error(`Could not read existing visits: ${visitError.message.slice(0, 500)}`);
    }
    if (sessionError) {
      throw new Error(`Could not read existing charging sessions: ${sessionError.message.slice(0, 500)}`);
    }
    existingVisits.push(...((visitData ?? []) as ExistingVisitRow[]));
    for (const row of sessionData ?? []) {
      existingChargingSessionVisitIds.add(row.visit_id);
    }
  }

  const plan = buildReceiptImportPlan({
    records: normalized,
    existingVisits,
    existingChargingSessionVisitIds,
    importUserId,
  });
  const validRecords = plan.records.filter((record) => record.status === "valid");
  const invalid = plan.records.filter((record) => record.status === "invalid").length;
  const unmatched = plan.records.filter((record) => record.status === "unmatched").length;
  const ambiguous = plan.records.filter((record) => record.status === "ambiguous").length;
  const conflicts = plan.records.filter((record) => record.status === "conflict").length;
  const matched = plan.records.filter((record) => record.stationId !== null).length;
  const exactTimeRecords = plan.records.filter(
    (record) => record.checkedInTimePrecision === "exact",
  ).length;
  const dateOnlyRecords = plan.records.filter(
    (record) => record.checkedInTimePrecision === "date_only",
  ).length;
  const failed = parsed.errors.length + invalid + unmatched + ambiguous + conflicts;
  const reportSummary = {
    receiptRecordsLoaded: parsed.loaded,
    valid: validRecords.length,
    invalid,
    exactTimeRecords,
    dateOnlyRecords,
    uniqueStations: new Set(plan.records.flatMap((record) => record.stationId ? [record.stationId] : [])).size,
    matched,
    unmatched,
    ambiguous,
    newVisits: plan.newVisits,
    existingVisits: plan.existingVisits,
    newChargingSessions: plan.newChargingSessions,
    existingChargingSessions: plan.existingChargingSessions,
    missingEnergy: plan.records.filter((record) => record.energyKwh === null).length,
    missingCost: plan.records.filter((record) => record.costUsd === null).length,
    missingDuration: plan.records.filter((record) => record.chargingMinutes === null).length,
    duplicateReceiptsDetected: plan.duplicateReceiptsDetected,
    duplicateConflicts: plan.duplicateConflicts,
    importUserConfigured: Boolean(importUserValue),
    importUserValid: importAdminValid,
    manualStationPrerequisitesPresent: manualPrerequisitesPresent,
    failed,
  };
  const jsonReportPath = resolve(process.cwd(), "artifacts", "receipt-import-report.json");
  const csvReportPath = resolve(process.cwd(), "artifacts", "receipt-import-report.csv");
  await writeReceiptImportReports(jsonReportPath, csvReportPath, {
    generatedAt: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    inputPath: args.inputPath,
    summary: reportSummary,
    records: plan.records,
    parserErrors: parsed.errors,
  });

  console.log(args.apply ? "Mode: APPLY" : "Mode: DRY RUN");
  printMetric("Receipt records loaded", reportSummary.receiptRecordsLoaded);
  printMetric("Valid", reportSummary.valid);
  printMetric("Invalid", reportSummary.invalid);
  printMetric("Exact-time records", reportSummary.exactTimeRecords);
  printMetric("Date-only records", reportSummary.dateOnlyRecords);
  printMetric("Unique stations", reportSummary.uniqueStations);
  printMetric("Matched", reportSummary.matched);
  printMetric("Unmatched", reportSummary.unmatched);
  printMetric("Ambiguous", reportSummary.ambiguous);
  printMetric("New visits", reportSummary.newVisits);
  printMetric("Existing visits", reportSummary.existingVisits);
  printMetric("New charging sessions", reportSummary.newChargingSessions);
  printMetric("Existing charging sessions", reportSummary.existingChargingSessions);
  printMetric("Missing energy", reportSummary.missingEnergy);
  printMetric("Missing cost", reportSummary.missingCost);
  printMetric("Missing duration", reportSummary.missingDuration);
  printMetric("Duplicate receipts detected", reportSummary.duplicateReceiptsDetected);
  printMetric("Duplicate conflicts", reportSummary.duplicateConflicts);
  printMetric("Failed", reportSummary.failed);
  console.log(`IMPORT_USER_ID valid app admin: ${importAdminValid ? "yes" : "no"}`);
  console.log(`Manual station prerequisites present: ${manualPrerequisitesPresent ? "yes" : "no"}`);
  console.log(`JSON report: ${jsonReportPath}`);
  console.log(`CSV report: ${csvReportPath}`);

  if (args.apply) {
    const blockers = [
      stations.length === 0 ? "stations is empty" : null,
      !manualPrerequisitesPresent ? "manual station prerequisites are missing" : null,
      !importUserId ? "IMPORT_USER_ID is missing or is not a UUID" : null,
      !importAdminValid ? "IMPORT_USER_ID is not present in app_admins" : null,
      parsed.errors.length > 0 ? "Receipt parsing errors exist" : null,
      invalid > 0 ? "invalid Receipts exist" : null,
      unmatched > 0 ? "unmatched Receipts exist" : null,
      ambiguous > 0 ? "ambiguous Receipts exist" : null,
      conflicts > 0 || plan.duplicateConflicts > 0 ? "dangerous Receipt conflicts exist" : null,
    ].filter((blocker): blocker is string => blocker !== null);
    if (blockers.length > 0) {
      throw new Error(`Apply blocked: ${blockers.join("; ")}.`);
    }
    if (!importUserId) {
      throw new Error("Apply blocked: IMPORT_USER_ID is missing or invalid.");
    }

    const result = await executeReceiptImport({
      records: plan.records,
      importUserId,
      apply: true,
      callRpc: async (rpcArguments) => {
        const { error, status } = await client.rpc("import_receipt_charge", rpcArguments);
        if (error) {
          const rpcError = new Error(error.message.slice(0, 400)) as Error & { transient?: boolean };
          rpcError.transient = status === 429 || [502, 503, 504].includes(status);
          throw rpcError;
        }
      },
    });
    printMetric("Succeeded", result.succeeded);
    printMetric("Failed writes", result.failed);
  } else {
    console.log("DRY RUN — no receipt records were written");
  }

  console.log(`Elapsed time: ${((Date.now() - startedAt) / 1_000).toFixed(1)}s`);
}

if (process.env.NODE_ENV !== "test") {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "Unknown Receipt import error";
    console.error(`Receipt import failed: ${message.slice(0, 800)}`);
    process.exitCode = 1;
  });
}
