import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const dashboardPromise = readFile("src/app/admin/(protected)/page.tsx", "utf8");
const dashboardDataPromise = readFile("src/lib/admin/data.ts", "utf8");
const managerPromise = readFile("src/components/admin/TripPhotoManager.tsx", "utf8");
const actionsPromise = readFile("src/app/admin/trip-photo-actions.ts", "utf8");
const migrationPromise = readFile("supabase/migrations/20260716200000_trip_photos.sql", "utf8");

test("Dashboard presents exactly the three requested primary actions", async () => {
  const source = await dashboardPromise;
  assert.match(source, /title: "Trip"/);
  assert.match(source, /title: "Check in"/);
  assert.match(source, /title: "Upload"/);
  assert.match(source, /aria-label="Quick access"/);
});

test("Trip and Upload target the latest updated Trip", async () => {
  assert.match(await dashboardDataPromise, /from\("trip_plans"\)[\s\S]+order\("updated_at", \{ ascending: false \}\)[\s\S]+limit\(1\)/);
  assert.match(await dashboardPromise, /`\/admin\/trips\/\$\{dashboard\.latestTrip\.id\}`/);
  assert.match(await dashboardPromise, /`\/admin\/trips\/\$\{dashboard\.latestTrip\.id\}\/photos`/);
});

test("Trip photos have a separate Trip-owned table and private bucket", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /create table public\.trip_photos/i);
  assert.match(sql, /trip_plan_id uuid not null references public\.trip_plans\(id\) on delete cascade/i);
  assert.match(sql, /values \('trip-photos', 'trip-photos', false\)/i);
  assert.match(sql, /alter table public\.trip_photos enable row level security/i);
  assert.match(sql, /trip_photos_insert_admin[\s\S]+tp\.user_id = \(select auth\.uid\(\)\)/i);
});

test("Trip photos have no application quantity cap", async () => {
  const sources = `${await migrationPromise}\n${await managerPromise}\n${await actionsPromise}`;
  assert.doesNotMatch(sources, /MAX_TRIP_PHOTOS|tripPhotoCount\s*>=|trip_photos[\s\S]{0,120}count\(\*\)[\s\S]{0,80}>=/i);
  assert.match(await managerPromise, /type="file"[\s\S]+multiple/);
  assert.match(await managerPromise, /Large batches may take longer/);
  assert.match(await managerPromise, /beforeunload/);
});

test("Trip upload preparation checks the signed-in owner and exact Storage path", async () => {
  const source = await actionsPromise;
  assert.match(source, /eq\("user_id", admin\.id\)/);
  assert.match(source, /`\$\{admin\.id\}\/\$\{tripPlanId\}\/\$\{photoId\}\.\$\{extensionForPhotoMime\(mimeType\)\}`/);
  assert.match(source, /expectedPath[\s\S]+input\.storagePath !== expectedPath/);
});
