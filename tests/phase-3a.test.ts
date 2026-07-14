import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import {
  MAX_PHOTO_EDGE,
  PHOTO_COMPRESSION_CONCURRENCY,
  PHOTO_UPLOAD_CONCURRENCY,
  VISIT_PHOTO_BUCKET,
  isVisitPhotoType,
} from "../src/lib/photos/constants";
import { detectImageMimeType, readSafeJpegExif } from "../src/lib/photos/exif";
import { assertConvertedJpeg } from "../src/lib/photos/heic-processing";
import { calculateConstrainedDimensions, getOrientationTransform } from "../src/lib/photos/orientation";
import { mapWithConcurrency } from "../src/lib/photos/queue";
import { localDateTimeInTimezoneToUtc, resolveExifTakenAt } from "../src/lib/photos/time";

const migrationPromise = readFile("supabase/migrations/20260714190000_visit_photo_storage.sql", "utf8");
const actionsPromise = readFile("src/app/admin/photo-actions.ts", "utf8");
const managerPromise = readFile("src/components/admin/VisitPhotoManager.tsx", "utf8");
const signingPromise = readFile("src/lib/photos/signing.ts", "utf8");
const publicDataPromise = readFile("src/lib/photos/data.ts", "utf8");
const publicPagePromise = readFile("src/app/visits/[id]/page.tsx", "utf8");
const latestRepoPromise = readFile("src/lib/stations/supabase-public-repository.ts", "utf8");
const latestUiPromise = readFile("src/components/check-ins/LatestCheckIns.tsx", "utf8");
const homePagePromise = readFile("src/app/page.tsx", "utf8");
const publicClientPromise = readFile("src/lib/supabase/public.ts", "utf8");

function functionBody(sql: string, name: string) {
  const start = sql.indexOf(`function public.${name}`);
  const next = sql.indexOf("function public.", start + 1);
  return sql.slice(start, next === -1 ? sql.length : next);
}

function makeExifJpeg() {
  const tiff = Buffer.alloc(126);
  tiff.write("II", 0, "ascii");
  tiff.writeUInt16LE(42, 2);
  tiff.writeUInt32LE(8, 4);
  tiff.writeUInt16LE(2, 8);
  // Orientation 6.
  tiff.writeUInt16LE(0x0112, 10); tiff.writeUInt16LE(3, 12); tiff.writeUInt32LE(1, 14); tiff.writeUInt16LE(6, 18);
  // Exif IFD pointer.
  tiff.writeUInt16LE(0x8769, 22); tiff.writeUInt16LE(4, 24); tiff.writeUInt32LE(1, 26); tiff.writeUInt32LE(38, 30);
  tiff.writeUInt32LE(0, 34);
  tiff.writeUInt16LE(2, 38);
  tiff.writeUInt16LE(0x9003, 40); tiff.writeUInt16LE(2, 42); tiff.writeUInt32LE(20, 44); tiff.writeUInt32LE(68, 48);
  tiff.writeUInt16LE(0x9011, 52); tiff.writeUInt16LE(2, 54); tiff.writeUInt32LE(7, 56); tiff.writeUInt32LE(88, 60);
  tiff.writeUInt32LE(0, 64);
  tiff.write("2026:07:14 13:45:22\0", 68, "ascii");
  tiff.write("-04:00\0", 88, "ascii");
  const payload = Buffer.concat([Buffer.from("Exif\0\0", "binary"), tiff]);
  const app1 = Buffer.alloc(4);
  app1[0] = 0xff; app1[1] = 0xe1; app1.writeUInt16BE(payload.length + 2, 2);
  return new Uint8Array(Buffer.concat([Buffer.from([0xff, 0xd8]), app1, payload, Buffer.from([0xff, 0xd9])]));
}

async function readClientSources(directory: string): Promise<string> {
  const entries = await readdir(directory, { withFileTypes: true });
  return (await Promise.all(entries.map(async (entry) => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return readClientSources(target);
    if (!/\.(ts|tsx)$/.test(entry.name)) return "";
    const source = await readFile(target, "utf8");
    return /^"use client";/.test(source) ? source : "";
  }))).join("\n");
}

test("1 Bucket name is fixed", () => assert.equal(VISIT_PHOTO_BUCKET, "visit-photos"));
test("2 Migration does not create the Bucket", async () => assert.doesNotMatch(await migrationPromise, /insert\s+into\s+storage\.buckets/i));
test("3 Documentation comment requires a private Bucket", async () => assert.match(await migrationPromise, /private bucket/i));
test("4 anon receives no visit_photos base-table SELECT", async () => assert.match(await migrationPromise, /revoke select on table public\.visit_photos from anon/i));
test("5 anon receives no storage.objects policy", async () => assert.doesNotMatch(await migrationPromise, /on storage\.objects[\s\S]{0,120}to anon/i));
test("6 authenticated non-admin Storage upload is blocked", async () => assert.match(await migrationPromise, /for insert[\s\S]+is_app_admin\(\)/i));
test("7 upload paths require auth.uid as the first folder", async () => assert.match(await migrationPromise, /foldername\(name\)\)\[1\][\s\S]+auth\.uid/i));
test("8 upload paths require a valid Visit", async () => assert.match(await migrationPromise, /for insert[\s\S]+exists \([\s\S]+station_visits/i));
test("9 every photo RPC is security definer", async () => {
  const sql = await migrationPromise;
  for (const name of ["admin_create_visit_photo", "admin_update_visit_photo", "admin_set_visit_cover_photo", "admin_reorder_visit_photos", "admin_delete_visit_photo"]) assert.match(functionBody(sql, name), /security definer/i);
});
test("10 every photo RPC fixes search_path", async () => {
  const sql = await migrationPromise;
  for (const name of ["admin_create_visit_photo", "admin_update_visit_photo", "admin_set_visit_cover_photo", "admin_reorder_visit_photos", "admin_delete_visit_photo"]) assert.match(functionBody(sql, name), /set search_path = public/i);
});
test("11 photo RPCs are not executable by anon", async () => assert.match(await migrationPromise, /admin_create_visit_photo[\s\S]+from public, anon/i));
test("12 photo RPCs are executable by authenticated", async () => assert.match(await migrationPromise, /grant execute on function public\.admin_create_visit_photo[\s\S]+to authenticated/i));
test("13 create RPC checks app_admins", async () => assert.match(functionBody(await migrationPromise, "admin_create_visit_photo"), /app_admins/));
test("14 create RPC fixes user_id to auth.uid", async () => assert.match(functionBody(await migrationPromise, "admin_create_visit_photo"), /v_user_id uuid := auth\.uid\(\)[\s\S]+v_user_id/));
test("15 create RPC enforces an exact generated path", async () => assert.match(functionBody(await migrationPromise, "admin_create_visit_photo"), /v_expected_path[\s\S]+p_storage_path is distinct from v_expected_path/i));
test("16 create RPC has no per-Visit photo count cap", async () => assert.doesNotMatch(functionBody(await migrationPromise, "admin_create_visit_photo"), /count\(\*\)[\s\S]+>=\s*\d+/i));
test("17 photo constants define concurrency but no count cap", async () => {
  const source = await readFile("src/lib/photos/constants.ts", "utf8");
  assert.doesNotMatch(source, /MAX_(?:FILES|PHOTOS)|PER_(?:UPLOAD|VISIT)/);
  assert.ok(PHOTO_COMPRESSION_CONCURRENCY >= 1 && PHOTO_COMPRESSION_CONCURRENCY <= 2);
  assert.ok(PHOTO_UPLOAD_CONCURRENCY >= 2 && PHOTO_UPLOAD_CONCURRENCY <= 3);
});
test("18 project code defines no custom photo MB ceiling", async () => {
  const source = await readFile("src/lib/photos/image-processing.ts", "utf8");
  assert.doesNotMatch(source, /MAX_(?:FILE|OUTPUT|ORIGINAL|COMPRESSED).*BYTES|\b20\s*\*\s*1024|\b6\s*\*\s*1024/i);
  assert.doesNotMatch(await actionsPromise, /MAX_(?:FILE|OUTPUT|ORIGINAL|COMPRESSED).*BYTES/i);
});
test("19 Migration keeps only a positive file-size constraint", async () => {
  const sql = await migrationPromise;
  assert.match(sql, /check \(file_size_bytes > 0\)/i);
  assert.doesNotMatch(sql, /file_size_bytes\s*(?:<=|<)\s*(?!0\b)[1-9]\d*/i);
});
test("20 longest compressed edge is 2048", () => assert.equal(MAX_PHOTO_EDGE, 2048));
test("21 JPEG magic bytes are detected", () => assert.equal(detectImageMimeType(Uint8Array.from([0xff, 0xd8, 0xff])), "image/jpeg"));
test("22 PNG magic bytes are detected", () => assert.equal(detectImageMimeType(Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])), "image/png"));
test("23 WebP magic bytes are detected", () => assert.equal(detectImageMimeType(new TextEncoder().encode("RIFFxxxxWEBP")), "image/webp"));
test("24 a non-image signature is rejected", () => assert.equal(detectImageMimeType(new TextEncoder().encode("not-an-image")), null));
test("25 HEIC and HEIF magic brands are detected", () => {
  assert.equal(detectImageMimeType(new TextEncoder().encode("....ftypheic....mif1")), "image/heic");
  assert.equal(detectImageMimeType(new TextEncoder().encode("....ftypmif1....heis")), "image/heif");
});
test("26 AVIF is not misclassified as HEIF", () => assert.equal(detectImageMimeType(new TextEncoder().encode("....ftypavif....mif1")), null));
test("27 compression uses a quality target without a byte target", async () => {
  const source = await readFile("src/lib/photos/image-processing.ts", "utf8");
  assert.match(source, /"image\/jpeg", 0\.88/);
  assert.doesNotMatch(source, /blob\.size\s*(?:>|>=)/);
});
test("28 Orientation 6 swaps dimensions", () => assert.deepEqual(getOrientationTransform(6, 1200, 800), { outputWidth: 800, outputHeight: 1200, matrix: [0, 1, -1, 0, 800, 0] }));
test("29 Orientation 3 rotates without swapping dimensions", () => assert.deepEqual(getOrientationTransform(3, 1200, 800).matrix, [-1, 0, 0, -1, 1200, 800]));
test("30 constrained orientation keeps the longest edge at 2048", () => {
  const result = calculateConstrainedDimensions(4032, 3024, 6, 2048);
  assert.equal(Math.max(result.outputWidth, result.outputHeight), 2048);
});
test("31 DateTimeOriginal and Orientation are read from safe EXIF", () => {
  const parsed = readSafeJpegExif(makeExifJpeg());
  assert.equal(parsed.orientation, 6);
  assert.deepEqual(parsed.takenAt, { localDateTime: "2026-07-14T13:45:22", offsetMinutes: -240, source: "DateTimeOriginal" });
});
test("32 no EXIF produces taken_at null", () => assert.equal(readSafeJpegExif(Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])).takenAt, null));
test("33 corrupt EXIF does not throw", () => assert.doesNotThrow(() => readSafeJpegExif(Uint8Array.from([0xff, 0xd8, 0xff, 0xe1, 0, 40, 1, 2]))));
test("34 EXIF without offset uses the Visit timezone", () => assert.equal(localDateTimeInTimezoneToUtc("2026-07-14T12:00:00", "America/New_York")?.toISOString(), "2026-07-14T16:00:00.000Z"));
test("35 ambiguous wall time is kept null", () => assert.equal(localDateTimeInTimezoneToUtc("2026-11-01T01:30:00", "America/New_York"), null));
test("36 invalid timezone is kept null", () => assert.equal(localDateTimeInTimezoneToUtc("2026-07-14T12:00:00", "Invalid/Zone"), null));
test("37 implausibly old EXIF is rejected", () => assert.equal(resolveExifTakenAt({ localDateTime: "1999-01-01T12:00:00", offsetMinutes: 0, source: "DateTimeOriginal" }, "UTC", "2026-07-14T12:00:00Z").takenAt, null));
test("38 EXIF GPS is neither parsed nor represented", async () => {
  const source = await readFile("src/lib/photos/exif.ts", "utf8");
  assert.doesNotMatch(source, /GPSLatitude|GPSLongitude|0x8825/);
});
test("39 full EXIF JSON is never saved", async () => assert.doesNotMatch(await actionsPromise, /exifJson|metadataJson|cameraModel/i));
test("40 allowed photo types are exact", () => {
  for (const value of ["check_in", "vehicle", "charger", "scenery", "receipt", "other"]) assert.equal(isVisitPhotoType(value), true);
  assert.equal(isVisitPhotoType("site"), false);
});
test("41 first photo automatically becomes cover", async () => assert.match(functionBody(await migrationPromise, "admin_create_visit_photo"), /count\(\*\) = 0[\s\S]+v_is_cover/i));
test("42 at most one cover is enforced by a partial unique index", async () => assert.match(await migrationPromise, /unique index[\s\S]+where is_cover = true/i));
test("43 setting cover clears the old cover first", async () => {
  const body = functionBody(await migrationPromise, "admin_set_visit_cover_photo");
  assert.ok(body.indexOf("set is_cover = false") < body.indexOf("set is_cover = true"));
});
test("44 reorder requires every photo from one Visit", async () => assert.match(functionBody(await migrationPromise, "admin_reorder_visit_photos"), /every Photo from exactly one Visit/i));
test("45 deleting a cover chooses the next stable photo", async () => assert.match(functionBody(await migrationPromise, "admin_delete_visit_photo"), /order by vp\.display_order, vp\.created_at, vp\.id/i));
test("46 single-photo deletion removes Storage before Metadata", async () => {
  const source = await actionsPromise;
  assert.ok(source.indexOf(".remove([photo.storage_path])") < source.indexOf('rpc("admin_delete_visit_photo"'));
});
test("47 Storage deletion failure keeps Metadata", async () => assert.match(await actionsPromise, /Storage deletion failed\. Photo metadata was kept/i));
test("48 Metadata creation failure triggers compensating Storage deletion", async () => assert.match(await actionsPromise, /admin_create_visit_photo[\s\S]+remove\(\[input\.storagePath\]\)/));
test("49 Visit deletion removes all Storage objects before its RPC", async () => {
  const source = await readFile("src/app/admin/visit-actions.ts", "utf8");
  assert.ok(source.indexOf(".remove((photos ?? []).map") < source.indexOf('rpc("admin_delete_station_visit"'));
});
test("50 Visit delete RPC never deletes the station", async () => assert.doesNotMatch(functionBody(await migrationPromise, "admin_delete_station_visit"), /delete from public\.stations/i));
test("51 Visit delete RPC deletes photos, Charging Session, then Visit", async () => {
  const body = functionBody(await migrationPromise, "admin_delete_station_visit");
  assert.ok(body.indexOf("delete from public.visit_photos") < body.indexOf("delete from public.charging_sessions"));
  assert.ok(body.indexOf("delete from public.charging_sessions") < body.indexOf("delete from public.station_visits"));
});
test("52 Public photo signing checks both visibility levels", async () => {
  const source = await signingPromise;
  assert.equal((source.match(/\.eq\("is_public", true\)/g) ?? []).length, 2);
});
test("53 public signer accepts only photo ID, never a browser path", async () => assert.match(await signingPromise, /getPublicVisitPhotoUrl\(photoId: string\)/));
test("54 public DTO contains no Storage path or user ID", async () => {
  const source = await publicDataPromise;
  const publicFunction = source.slice(source.indexOf("getPublicVisitDetail"));
  assert.doesNotMatch(publicFunction, /storage_path|bucket_name|user_id|recorded_latitude|recorded_longitude/);
});
test("55 private or missing Visit returns notFound", async () => {
  assert.match(await publicPagePromise, /if \(!visit\) notFound\(\)/);
  assert.match(await publicDataPromise, /\.eq\("is_public", true\)/);
});
test("56 public alt uses Caption or a safe station default", async () => assert.match(await publicDataPromise, /caption\?\.trim\(\) \|\| `Tesla Supercharger visit photo at/));
test("57 Latest Check-ins batches safe photo Metadata", async () => assert.match(await latestRepoPromise, /\.from\("public_visit_photos"\)[\s\S]+\.in\("visit_id", visitIds\)/));
test("58 Latest Check-ins prefer cover ordering and retain a placeholder", async () => {
  assert.match(await latestRepoPromise, /order\("is_cover", \{ ascending: false \}\)/);
  assert.match(await latestUiPromise, /checkIn\.imageUrl \?\? "\/images\/checkins\/default\.svg"/);
});
test("59 Latest Check-in cards link to the public Visit", async () => assert.match(await latestUiPromise, /href=\{checkIn\.detailUrl\}/));
test("60 client source contains no Supabase secret", async () => assert.doesNotMatch(await readClientSources("src"), /SUPABASE_SECRET_KEY|service_role/i));

test("61 mobile upload supports camera and library without auto-opening", async () => {
  const source = await managerPromise;
  assert.match(source, /capture="environment"/);
  assert.match(source, /multiple/);
  assert.doesNotMatch(source, /\.click\(\)[\s\S]*useEffect/);
});
test("62 unsaved selections register beforeunload protection", async () => assert.match(await managerPromise, /beforeunload/));
test("63 captions are rendered as plain React text", async () => {
  assert.doesNotMatch(await managerPromise, /dangerouslySetInnerHTML/);
  assert.doesNotMatch(await publicPagePromise, /dangerouslySetInnerHTML/);
});

test("64 selecting six or more files adds every file to the queue", async () => {
  const source = await managerPromise;
  assert.match(source, /const additions = incoming\.map/);
  assert.doesNotMatch(source, /incoming\.slice\(0/);
});
test("65 a large selection has no fixed-count rejection", async () => {
  const source = await managerPromise;
  assert.doesNotMatch(source, /at most (?:5|five)|first \$\{allowed\}|MAX_PHOTOS/i);
  assert.match(source, /Large batches may take longer\. Keep this page open while uploads complete\./);
});
test("66 a Visit with more than 20 photos can still prepare an upload", async () => {
  const source = await actionsPromise;
  const body = source.slice(source.indexOf("prepareVisitPhotoUploadAction"), source.indexOf("createVisitPhotoMetadataAction"));
  assert.doesNotMatch(body, /count|capacity|20 photos/i);
});
test("67 a large file is not rejected by a project MB threshold", async () => {
  const source = await readFile("src/lib/photos/image-processing.ts", "utf8");
  assert.match(source, /file\.size <= 0/);
  assert.doesNotMatch(source, /file\.size >|MB or smaller|larger than \d+ MB/i);
});
test("68 Migration has no maximum file-size constraint", async () => {
  const sql = await migrationPromise;
  assert.doesNotMatch(sql, /file_size_bytes\s*(?:<=|<)\s*(?!0\b)[1-9]\d*|6\s*MB|20\s*MB/i);
});
test("69 create RPC has no per-Visit quantity guard", async () => {
  const body = functionBody(await migrationPromise, "admin_create_visit_photo");
  assert.doesNotMatch(body, /at most \d+ photos|count\(\*\)[\s\S]{0,100}>=/i);
});
test("70 Server Actions have no per-batch quantity guard", async () => {
  const source = await actionsPromise;
  assert.doesNotMatch(source, /MAX_(?:FILES|PHOTOS)|photoIds\.length\s*>/);
});
test("71 compression workers never exceed configured concurrency", async () => {
  let active = 0;
  let maximum = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), PHOTO_COMPRESSION_CONCURRENCY, async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
  });
  assert.ok(maximum <= PHOTO_COMPRESSION_CONCURRENCY);
});
test("72 upload workers never exceed configured concurrency", async () => {
  let active = 0;
  let maximum = 0;
  await mapWithConcurrency(Array.from({ length: 12 }, (_, index) => index), PHOTO_UPLOAD_CONCURRENCY, async () => {
    active += 1;
    maximum = Math.max(maximum, active);
    await new Promise((resolve) => setTimeout(resolve, 2));
    active -= 1;
  });
  assert.ok(maximum <= PHOTO_UPLOAD_CONCURRENCY);
});
test("73 files are decoded inside controlled workers, not while selecting", async () => {
  const source = await managerPromise;
  const addFiles = source.slice(source.indexOf("function addFiles"), source.indexOf("function cancelWaiting"));
  assert.doesNotMatch(addFiles, /prepareVisitPhoto|createImageBitmap|document\.createElement\("canvas"\)/);
  assert.match(source, /mapWithConcurrency[\s\S]+processAndUpload/);
});
test("74 one failed queue item does not stop later items", async () => {
  const visited: number[] = [];
  const results = await mapWithConcurrency([1, 2, 3], 1, async (value) => {
    visited.push(value);
    if (value === 2) throw new Error("single failure");
    return value;
  });
  assert.deepEqual(visited, [1, 2, 3]);
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled"]);
});
test("75 a Waiting photo can be cancelled", async () => {
  const source = await managerPromise;
  assert.match(source, /target\.status !== "waiting"/);
  assert.match(source, /status: "cancelled"/);
});
test("76 retry keeps the original photo_id", async () => {
  const source = await managerPromise;
  assert.match(source, /photoId: crypto\.randomUUID\(\)/);
  assert.match(source, /prepareVisitPhotoUploadAction\(visitId, prepared\.mimeType, initial\.photoId\)/);
  assert.match(source, /Retry this photo/);
});
test("77 Object URLs are released after completion", async () => {
  assert.match(await managerPromise, /initial\.previewUrl\?\.startsWith\("blob:"\)[\s\S]+URL\.revokeObjectURL\(initial\.previewUrl\)/);
});
test("78 Object URLs are released after cancellation", async () => {
  assert.match(await managerPromise, /target\.previewUrl\?\.startsWith\("blob:"\)[\s\S]+URL\.revokeObjectURL\(target\.previewUrl\)/);
});
test("79 another selection can be appended after a batch", async () => {
  const source = await managerPromise;
  assert.match(source, /const next = \[\.\.\.current, \.\.\.additions\]/);
  assert.doesNotMatch(source, /Take Photo[\s\S]{0,120}disabled=\{uploading\}/);
});
test("80 the actual Storage size error is shown on that item", async () => {
  const source = await managerPromise;
  assert.match(source, /platformError\("Storage rejected this photo", storage\.error\)/);
  assert.match(source, /status: "failed"/);
});
test("81 a large compressed result still proceeds to Storage upload", async () => {
  const processing = await readFile("src/lib/photos/image-processing.ts", "utf8");
  const manager = await managerPromise;
  assert.doesNotMatch(processing, /blob\.size\s*(?:>|>=)/);
  assert.match(manager, /upload\(target\.storagePath, prepared\.blob/);
});
test("82 successful HEIC conversion is validated as JPEG", async () => {
  const jpeg = new Blob([Uint8Array.from([0xff, 0xd8, 0xff, 0xd9])], { type: "image/jpeg" });
  assert.equal(await assertConvertedJpeg(jpeg), jpeg);
  await assert.rejects(() => assertConvertedJpeg(new Blob(["not jpeg"], { type: "image/jpeg" })), /valid JPEG/);
});
test("83 HEIC conversion failure is isolated to one queue item", async () => {
  const results = await mapWithConcurrency(["before.jpg", "broken.heic", "after.png"], 2, async (name) => {
    if (name.endsWith(".heic")) throw new Error("conversion failed");
    return name;
  });
  assert.deepEqual(results.map((result) => result.status), ["fulfilled", "rejected", "fulfilled"]);
});
test("84 ordinary JPEG PNG and WebP paths do not load the HEIC converter", async () => {
  const processing = await readFile("src/lib/photos/image-processing.ts", "utf8");
  assert.doesNotMatch(processing.split("export async function prepareVisitPhoto")[0], /heic-to|exifr|heic-processing/);
  assert.match(processing, /if \(heic\) \{[\s\S]+await import\("\.\/heic-processing"\)/);
  assert.doesNotMatch(processing, /from "heic-to|from "exifr/);
});
test("85 the public station repository never uses stale Auth cookies", async () => {
  assert.match(await latestRepoPromise, /createPublicClient as createSupabasePublicClient/);
  const source = await publicClientPromise;
  assert.match(source, /persistSession: false/);
  assert.match(source, /autoRefreshToken: false/);
  assert.doesNotMatch(source, /cookies\(|createServerClient/);
});
test("86 a pending photo View degrades Latest Check-ins to placeholders", async () => {
  const source = await latestRepoPromise;
  assert.match(source, /photoError\?\.code === "PGRST205" \|\| photoError\?\.code === "42P01"/);
  assert.match(source, /if \(!photoError\) \{[\s\S]+photosByVisit\.set/);
});
test("87 an optional Latest Check-ins failure cannot clear loaded stations", async () => {
  const source = await homePagePromise;
  const stationsIndex = source.indexOf("getAllStations()");
  const latestTryIndex = source.indexOf("try {", stationsIndex);
  const latestIndex = source.indexOf("getLatestCheckIns(6)");
  const dataErrorIndex = source.indexOf("dataError = toStationDataError", latestIndex);
  assert.ok(stationsIndex >= 0 && latestTryIndex > stationsIndex && latestIndex > latestTryIndex);
  assert.match(source.slice(latestTryIndex, dataErrorIndex), /catch \{[\s\S]+latestCheckIns = \[\]/);
});
