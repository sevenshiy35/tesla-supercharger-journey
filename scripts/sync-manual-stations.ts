import { loadEnvConfig } from "@next/env";
import { MANUAL_STATIONS } from "./data/manual-stations";
import {
  buildManualStationSyncPlan,
  executeManualStationWrites,
} from "./lib/manual-station-sync";
import {
  createSupabaseAdminClient,
  createSupabaseScriptReadClient,
} from "./lib/supabase-admin";
import { parseSyncArguments, readExistingExternalIds } from "./lib/station-sync";

function printMetric(label: string, value: number) {
  console.log(`${label}: ${value.toLocaleString("en-US")}`);
}

async function main() {
  const startedAt = Date.now();
  loadEnvConfig(process.cwd());
  const args = parseSyncArguments(process.argv.slice(2));

  if (args.limit !== undefined) {
    throw new Error("Manual station sync does not accept --limit.");
  }

  const client = args.apply
    ? createSupabaseAdminClient()
    : createSupabaseScriptReadClient();
  const targetIds = MANUAL_STATIONS.map((station) => station.externalId);
  const existingExternalIds = await readExistingExternalIds(async (from, to) => {
    const { data, error } = await client
      .from("stations")
      .select("external_id")
      .in("external_id", targetIds)
      .order("external_id", { ascending: true })
      .range(from, to);

    if (error) {
      throw new Error(`Could not read manual station IDs: ${error.message.slice(0, 500)}`);
    }

    return (data ?? []).map((row) => row.external_id);
  });
  const plan = buildManualStationSyncPlan(MANUAL_STATIONS, existingExternalIds);

  console.log(args.apply ? "Mode: APPLY" : "Mode: DRY RUN");
  printMetric("Definitions loaded", plan.rows.length);
  printMetric("Existing", existingExternalIds.size);
  printMetric("New", plan.newCount);
  printMetric("Updated", plan.updatedCount);

  const result = await executeManualStationWrites({
    rows: plan.rows,
    apply: args.apply,
    writeRows: async (rows) => {
      const { error } = await client
        .from("stations")
        .upsert(rows, { onConflict: "external_id" });

      if (error) {
        throw new Error(`Manual station upsert failed: ${error.message.slice(0, 500)}`);
      }
    },
  });

  printMetric("Succeeded", result.succeeded);
  printMetric("Failed", result.failed);
  console.log(`Elapsed time: ${((Date.now() - startedAt) / 1_000).toFixed(1)}s`);

  if (!args.apply) {
    console.log("DRY RUN — no database changes were made");
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : "Unknown manual station sync error";
  console.error(`Manual station sync failed: ${message.slice(0, 700)}`);
  console.error("Failed: 1");
  process.exitCode = 1;
});
