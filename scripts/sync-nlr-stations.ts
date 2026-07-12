import { loadEnvConfig } from "@next/env";
import { resolve } from "node:path";
import { fetchNlrStationDirectory } from "../src/lib/stations/nlr-source";
import {
  buildStationSyncPlan,
  executeStationWrites,
  parseSyncArguments,
  prepareStationUpsertRows,
  readExistingStationReferences,
} from "./lib/station-sync";
import {
  buildStationReconciliationReport,
  MANUAL_STATION_SOURCES,
  reconcileNewNlrStations,
  writeStationReconciliationReport,
  type ManualStationRecord,
} from "./lib/station-reconciliation";
import {
  createSupabaseAdminClient,
  createSupabaseScriptReadClient,
} from "./lib/supabase-admin";

function printMetric(label: string, value: number) {
  console.log(`${label}: ${value.toLocaleString("en-US")}`);
}

async function main() {
  const startedAt = Date.now();
  loadEnvConfig(process.cwd());
  const args = parseSyncArguments(process.argv.slice(2));
  const apiKey = process.env.NLR_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("Missing NLR_API_KEY. Add it to .env.local before running the station sync.");
  }

  console.log(args.apply ? "Mode: APPLY" : "Mode: DRY RUN");
  const source = await fetchNlrStationDirectory({ apiKey });
  const prepared = prepareStationUpsertRows(source.stations);
  const selectedRows = args.limit ? prepared.rows.slice(0, args.limit) : prepared.rows;
  const client = args.apply
    ? createSupabaseAdminClient()
    : createSupabaseScriptReadClient();
  const existingStations = await readExistingStationReferences(async (from, to) => {
    const { data, error } = await client
      .from("stations")
      .select("external_id,source")
      .order("external_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not read existing station IDs: ${error.message.slice(0, 500)}`);
    }

    return (data ?? []).map((row) => ({
      externalId: row.external_id,
      source: row.source,
    }));
  });
  const existingExternalIds = new Set(existingStations.map((station) => station.externalId));
  const existingNlrExternalIds = new Set(
    existingStations
      .filter((station) => station.source === "nlr")
      .map((station) => station.externalId),
  );
  const { data: manualStationData, error: manualStationError } = await client
    .from("stations")
    .select("id,external_id,name,address,city,state,postal_code,latitude,longitude,source")
    .in("source", [...MANUAL_STATION_SOURCES])
    .order("external_id", { ascending: true })
    .limit(1_000);

  if (manualStationError) {
    throw new Error(
      `Could not read manual stations for reconciliation: ${manualStationError.message.slice(0, 500)}`,
    );
  }

  const reconciliation = reconcileNewNlrStations({
    selectedRows,
    existingExternalIds,
    manualStations: (manualStationData ?? []) as ManualStationRecord[],
  });
  const report = buildStationReconciliationReport(
    reconciliation,
    args.apply ? "apply" : "dry-run",
  );
  const reportPath = resolve(process.cwd(), "artifacts", "station-reconciliation-report.json");
  await writeStationReconciliationReport(reportPath, report);
  const plan = buildStationSyncPlan(
    reconciliation.rowsToSync,
    prepared.rows,
    existingExternalIds,
    existingNlrExternalIds,
  );

  printMetric("NLR received", source.received);
  printMetric("Normalized", prepared.rows.length);
  printMetric("Rejected", source.rejected + prepared.rejected);
  printMetric("Duplicates removed", source.duplicatesRemoved + prepared.duplicatesRemoved);
  printMetric("Existing in Supabase", existingExternalIds.size);
  printMetric(
    "Existing by external_id",
    selectedRows.filter((row) => existingExternalIds.has(row.external_id)).length,
  );
  printMetric("Reconciliation candidates", reconciliation.highConfidenceCandidates.length);
  printMetric("Low-confidence nearby candidates", reconciliation.lowConfidenceCandidates.length);
  printMetric("Skipped possible duplicates", reconciliation.skippedNlrExternalIds.length);
  printMetric("New", plan.newCount);
  printMetric("Updated", plan.updatedCount);
  printMetric("Missing from current NLR response", plan.missingFromSourceCount);
  if (args.limit) {
    printMetric("Selected by --limit", selectedRows.length);
  }

  const rejectionExamples = [...source.rejectionExamples, ...prepared.rejectionExamples].slice(0, 10);
  if (rejectionExamples.length > 0) {
    console.log("Rejected examples:");
    rejectionExamples.forEach((message) => console.log(`- ${message}`));
  }

  const result = await executeStationWrites({
    rows: plan.rows,
    apply: args.apply,
    batchSize: args.batchSize,
    onRetry: (message) => console.warn(message),
    writeBatch: async (batch, start, end) => {
      const { error, status } = await client
        .from("stations")
        .upsert(batch, { onConflict: "external_id" });

      if (error) {
        const batchError = new Error(
          `Supabase upsert returned status ${status} for rows ${start + 1}-${end + 1}: ${error.message.slice(0, 300)}`,
        ) as Error & { status?: number };
        batchError.status = status;
        throw batchError;
      }
    },
  });

  printMetric("Succeeded", result.succeeded);
  printMetric("Failed", result.failed);
  console.log(`Reconciliation report: ${reportPath}`);
  console.log(`Elapsed time: ${((Date.now() - startedAt) / 1_000).toFixed(1)}s`);

  if (!args.apply) {
    console.log("DRY RUN — no database changes were made");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown station synchronization error";
  console.error(`Station sync failed: ${message.slice(0, 700)}`);
  console.error("Failed: 1");
  process.exitCode = 1;
});
