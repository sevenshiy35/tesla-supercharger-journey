import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";

import type { Database, Json } from "../src/types/database";

type RpcArgs<Name extends keyof Database["public"]["Functions"]> =
  Database["public"]["Functions"][Name] extends { Args: infer Args }
    ? Args
    : never;

const packageSource = readFileSync("package.json", "utf8");
const overrideSource = readFileSync("src/types/database.ts", "utf8");
const generatedSource = readFileSync("src/types/database.generated.ts", "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(?:ts|tsx)$/.test(entry.name) ? [target] : [];
  });
}

const nullableStopLimits: Pick<
  RpcArgs<"admin_create_trip_plan_draft">,
  "p_max_extra_miles" | "p_max_stops"
> = {
  p_max_extra_miles: null,
  p_max_stops: null,
};

const nullableEndpoints: Omit<
  RpcArgs<"admin_update_trip_plan_endpoints">,
  "p_trip_plan_id"
> = {
  p_origin_source: null,
  p_origin_label: null,
  p_origin_full_address: null,
  p_origin_latitude: null,
  p_origin_longitude: null,
  p_origin_station_id: null,
  p_origin_provider_id: null,
  p_destination_source: null,
  p_destination_label: null,
  p_destination_full_address: null,
  p_destination_latitude: null,
  p_destination_longitude: null,
  p_destination_station_id: null,
  p_destination_provider_id: null,
};

const nullablePhoto: Pick<
  RpcArgs<"admin_create_visit_photo">,
  "p_caption" | "p_taken_at"
> = { p_caption: null, p_taken_at: null };

const nullableVisit: Pick<
  RpcArgs<"admin_create_station_visit">,
  "p_recorded_latitude" | "p_recorded_longitude" | "p_notes"
> = {
  p_recorded_latitude: null,
  p_recorded_longitude: null,
  p_notes: null,
};

const nullableTechnicalReason: Pick<
  RpcArgs<"admin_save_trip_plan_suggestions">,
  "p_technical_limit_reason"
> = { p_technical_limit_reason: null };

const selectedRouteArgExists: keyof RpcArgs<"admin_save_selected_out_and_back_route"> =
  "p_trip_plan_id";

const jsonStillExported: Json = null;

test("type generation targets the raw generated file", () => {
  assert.match(
    packageSource,
    /supabase gen types typescript --linked --schema public > src\/types\/database\.generated\.ts/,
  );
});

test("database entry point exports a MergeDeep Database", () => {
  assert.match(overrideSource, /import type \{ MergeDeep \} from "type-fest"/);
  assert.match(overrideSource, /export type Database = MergeDeep<DatabaseGenerated, DatabaseOverrides>/);
});

test("database entry point re-exports Json", () => {
  assert.equal(jsonStillExported, null);
  assert.match(overrideSource, /export type \{ Json \}/);
  assert.match(overrideSource, /export type Tables</);
});

test("Trip Stop limits accept null", () => {
  assert.deepEqual(nullableStopLimits, {
    p_max_extra_miles: null,
    p_max_stops: null,
  });
});

test("endpoint fields accept null", () => {
  assert.equal(Object.values(nullableEndpoints).every((value) => value === null), true);
  assert.equal(Object.keys(nullableEndpoints).length, 14);
});

test("Photo caption and taken_at accept null", () => {
  assert.deepEqual(nullablePhoto, { p_caption: null, p_taken_at: null });
});

test("Visit GPS and notes accept null", () => {
  assert.deepEqual(nullableVisit, {
    p_recorded_latitude: null,
    p_recorded_longitude: null,
    p_notes: null,
  });
});

test("technical_limit_reason accepts null", () => {
  assert.deepEqual(nullableTechnicalReason, { p_technical_limit_reason: null });
});

test("selected out-and-back RPC remains in generated and merged types", () => {
  assert.equal(selectedRouteArgExists, "p_trip_plan_id");
  assert.match(generatedSource, /admin_save_selected_out_and_back_route:/);
});

test("only the database entry point imports the generated Database", () => {
  const directImports = [...sourceFiles("src"), ...sourceFiles("scripts")]
    .filter((file) => file.replaceAll("\\", "/") !== "src/types/database.ts")
    .filter((file) => readFileSync(file, "utf8").includes("database.generated"));
  assert.deepEqual(directImports, []);
});

test("override layer adds no type suppression or unsafe casts", () => {
  assert.doesNotMatch(overrideSource, /@ts-ignore|\bas any\b|\bas never\b/);
});

test("nullable contracts remain null instead of false values", () => {
  assert.doesNotMatch(overrideSource, /p_(?:max_stops|caption|notes|technical_limit_reason):\s*(?:0|""|undefined)/);
  assert.match(overrideSource, /p_max_stops: number \| null/);
});
