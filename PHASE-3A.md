# Phase 3A — Visit photos and public Visit details

Phase 3A adds a private Supabase Storage photo system, mobile upload and management on
`/admin/visits/[id]`, public Visit pages at `/visits/[id]`, and real public cover photos in Latest
Check-ins. The code is complete locally, but the Migration and Bucket are intentionally not applied
or created by this work session.

## Storage architecture

- Bucket: `visit-photos`
- Visibility: **Private**. Never switch it to Public.
- Object path: `{auth_user_uuid}/{visit_uuid}/{photo_uuid}.{verified_extension}`
- Supported stored MIME types: `image/jpeg`, `image/png`, and `image/webp`
- The current UI always normalizes output to `image/jpeg`, so normal uploads end in `.jpg`.
- Original names, Captions, and timestamps never enter the path. Upload uses `upsert: false`.
- The browser receives only a server-prepared path. Storage RLS and `admin_create_visit_photo`
  independently validate the user folder, Visit folder, UUID filename, Bucket, MIME-derived
  extension, administrator allowlist, and Visit existence.

The Migration does not insert a `storage.buckets` row. Create the Bucket manually so the operator
must explicitly confirm it is Private. Allow stored MIME types `image/jpeg,image/png,image/webp` and
use the Supabase Dashboard's default platform file-size configuration or a suitably high value.
The project sets no custom image file-size limit; actual uploads remain subject to Supabase Storage,
the browser, device memory, and network conditions.

## Migration

Pending file:

```text
supabase/migrations/20260714190000_visit_photo_storage.sql
```

It does not modify an older Migration. It:

- normalizes the unused original photo categories to the Phase 3A set;
- adds required `mime_type`, `file_size_bytes`, `width`, and `height` fields;
- adds `display_order integer not null default 0` and `is_cover boolean not null default false`;
- constrains Bucket, path, Caption length, MIME, positive file size/dimensions, ordering, and Photo Type;
- adds Visit, user, order, and cover indexes plus a partial unique one-cover-per-Visit index;
- removes anonymous base-table `visit_photos` access;
- adds the narrow `public_visit_photos` View without user, Bucket, path, MIME, or GPS fields;
- installs strict `storage.objects` INSERT/SELECT/DELETE policies for allowlisted administrators;
- adds create, update, cover, reorder, and Metadata delete RPCs;
- replaces the Phase 2D Visit delete RPC with a two-argument Storage-cleanup contract.

All management RPCs are `security definer`, use `set search_path = public`, require `auth.uid()`,
check `app_admins`, are revoked from `public` and `anon`, and grant execute only to `authenticated`.
Direct authenticated INSERT/UPDATE/DELETE grants on `visit_photos` are revoked so normal writes go
through these RPCs.

The current precondition is that no `visit_photos` rows exist. The new integrity fields are made
`NOT NULL` without inventing legacy MIME or dimensions. If an environment unexpectedly contains
photo rows, stop and audit/backfill them before applying this Migration.

## Storage policies

There is no anonymous Storage policy. An authenticated request can manage an object only when:

- `bucket_id = 'visit-photos'`;
- `public.is_app_admin()` succeeds;
- the path has exactly three segments and UUID Visit/photo components;
- INSERT uses the current `auth.uid()` as its first folder;
- the Visit exists;
- SELECT/DELETE refer to a valid Visit or an existing Metadata record.

There is intentionally no UPDATE policy. Files cannot be overwritten or moved by the app.

## Upload flow

1. The administrator taps **Add Photos**, then **Take Photo** or **Choose From Library**.
2. Every selected file is appended in Waiting state. Neither a selection, Visit, nor administrator
   account has a project-defined photo-count limit.
3. On upload, two controlled workers process the queue. They read and decode only the current items,
   so a large selection does not create every ImageBitmap or Canvas at once.
4. Each file is checked for nonzero size, a supported declared MIME, matching magic bytes, and actual
   browser decode support. There is no project-defined original or output MB ceiling.
5. The JPEG parser reads only Orientation, DateTimeOriginal/CreateDate, and matching offset tags. It
   never walks the GPS IFD or stores complete EXIF.
6. Canvas normalizes orientation, limits the longest edge to 2,048 px, fills transparency with white,
   and encodes JPEG at quality 0.88. Optimization is not required to reach a fixed byte target. A
   supported, decodable JPEG/PNG/WebP falls back to its original file if Canvas encoding fails.
7. A protected Server Action validates the stable photo UUID and returns the exact Storage path.
8. At most two authenticated uploads run concurrently against the Private Bucket with `upsert: false`.
9. A protected Server Action interprets EXIF time and calls `admin_create_visit_photo`.
10. If Metadata creation fails, it attempts to delete the just-uploaded object. A failed compensation
   returns an explicit orphan photo ID for manual cleanup.
11. Successful actions refresh Admin Visit pages, dashboard/history, `/`, `/visits/[id]`, and photo
    routes.

The UI shows Waiting, Reading metadata, Compressing, Ready, Uploading, Saving metadata, Uploaded,
Failed, and Cancelled states plus total/completed/uploading/failed/waiting counters. A Waiting item can
be cancelled, a Failed item can retry with its original `photo_id`, and more files can be appended
while a batch is active. Other photos continue if one fails. Object URLs, ImageBitmaps, Canvas backing
stores, temporary processed Blobs, and original File references are released as their lifecycle ends.
`beforeunload` warns while unfinished items exist. Large batches show a non-blocking keep-page-open
message rather than being rejected.

## Formats and HEIC

JPEG, PNG, WebP, HEIC, and HEIF inputs are supported. Extension is not trusted; the declared MIME must
match the file signature, and the browser must decode the image. HEIC/HEIF detection lazy-loads
`exifr` for the four allowed date/offset fields and starts a dedicated Web Worker that lazy-loads
`heic-to` 1.5.2 (libheif 1.22.2). The worker converts to JPEG before the normal orientation and
optimization pipeline, keeping the large converter out of the ordinary image path and off the main
thread. Invalid or unsupported HEIC variants fail only their own queue item with a retryable error.
HEIC originals are never silently stored. Video is not supported.

## EXIF time and privacy

Priority is DateTimeOriginal, then EXIF CreateDate (DateTimeDigitized) when syntactically valid, then
`null`. File modified time, selection time, and upload time are never substituted.

- An explicit EXIF offset produces the absolute instant directly.
- A time without an offset is interpreted in the parent Visit's `checked_in_timezone`.
- Ambiguous fall-back times and nonexistent spring-forward times stay `null` rather than guessing.
- Dates before 2000 or more than 48 hours in the future stay `null`.
- A capture time more than 31 days from the Visit is kept but shown with a review warning.
- EXIF GPS, camera model, original EXIF JSON, and the original filename are not saved.

## Photo management

Each photo card shows its protected image, Cover/Public status, type, Caption, capture/upload time,
dimensions, and compressed size. The administrator can edit only `photo_type`, `caption`, and
`is_public`; immutable object identity and evidence fields are absent from the update RPC.

The supported types are `check_in`, `vehicle`, `charger`, `scenery`, `receipt`, and `other`.
`receipt` is only a normal photo category; it does not run OCR or change Charging Sessions.

The first photo becomes Cover under the Visit row lock. Setting a Cover clears the previous one in
the same database transaction. Reorder submits the complete photo ID list; the RPC rejects missing,
duplicate, or foreign-Visit IDs. Stable display is Cover first, then `display_order`, `created_at`,
and `id`.

## Public/private rules and signed URLs

`/visits/[id]` explicitly requires a public Visit; a missing or Private Visit calls `notFound()`.
The public page shows station/address, local Visit date/time rules, public Notes, charging facts,
and only photos in `public_visit_photos`. Notes are plain text. Setting a Visit Public means its
Notes may be displayed publicly; the Admin editor says that turning Public off hides Notes and all
photos.

Public photo URLs are stable same-origin URLs such as `/api/public/photos/{photoId}`—never Storage
paths. The Route Handler:

1. accepts only a UUID photo ID;
2. uses the server-only Supabase client to verify `visit_photos.is_public = true`;
3. verifies the parent `station_visits.is_public = true`;
4. verifies the Bucket is exactly `visit-photos`;
5. creates a 10-minute Signed URL and redirects with `no-store`.

The server-only `SUPABASE_SECRET_KEY` is necessary here because anonymous Storage SELECT is
intentionally forbidden. It is isolated in `src/lib/supabase/admin.ts`, is never prefixed with
`NEXT_PUBLIC_`, and is absent from Client Components and `.next/static`. Admin preview signing uses
the authenticated Cookie Session plus Storage RLS instead of the secret client.

A private photo cannot obtain a public Signed URL even if its parent is public. A public photo cannot
obtain one when its parent Visit is private. A previously issued Signed URL has at most the remaining
portion of its 10-minute lifetime after visibility changes.

## Public Gallery and Latest Check-ins

The Gallery is responsive, uses safe alt text (Caption, otherwise the station-based default), and has
a keyboard-accessible viewer with Close, Escape, arrow keys, focus cycling/restoration, mobile swipe,
and previous/next buttons. Broken images render a placeholder.

The Supabase Latest Check-ins repository fetches at most six public Visits, then performs one batched
`public_visit_photos` query. The safe View already excludes Private Visits/photos. Cover ordering is
first; if it is private or absent, the first public photo by display order is used. If none exists,
the existing placeholder remains. Live cards link to `/visits/{visitId}`. Exact times use the Visit
timezone; date-only records still show no noon anchor.

## Delete flows

Single photo:

1. `requireAdmin()` and load Metadata by ID;
2. validate the fixed Bucket;
3. delete the exact Storage object;
4. only after Storage succeeds, call `admin_delete_visit_photo`;
5. if Cover was deleted, select the next stable photo as Cover;
6. report an explicit manual-repair error if Storage succeeded but Metadata deletion failed.

Visit with photos:

1. `requireAdmin()` and query all photo IDs/paths on the server;
2. validate every Bucket;
3. delete exactly those Storage objects in one request;
4. stop and keep the Visit/Metadata if Storage returns an error;
5. call `admin_delete_station_visit(visit_id, exact_deleted_photo_ids)`;
6. the RPC locks the Visit, verifies the complete ID set, then deletes Photo Metadata, the Charging
   Session, and the Visit in one transaction. It never deletes the Station.

Storage and PostgreSQL cannot share a transaction. If Storage succeeds and the database RPC fails,
the UI explicitly reports that manual repair may be required; it never silently reports success.

## Verification performed

On July 14, 2026:

- `npm run lint` — passed
- `npm run typecheck` — passed
- `npm run test` — passed, 212 tests total including 87 Phase 3A tests
- `npm run build` — passed; all Admin, API, public Visit, and home routes compiled
- HEIC browser worker — the official libheif `example.heic` converted locally to a validated
  `image/jpeg` output (427,729 bytes) without any Storage or database request
- `.next/static` secret scan — no `SUPABASE_SECRET_KEY` or `service_role` marker
- `npx supabase db push --dry-run` — passed and listed only
  `20260714190000_visit_photo_storage.sql`

No Migration was applied. No Bucket was created. No real photo was uploaded. No NLR/Receipt/Manual
Apply, Production deployment, or existing Visit/Charging Session deletion was performed.

## Manual Supabase steps

1. Confirm the linked Supabase project and review the pending Migration.
2. Confirm `public.visit_photos` is empty. Stop and audit if it is not.
3. Apply the Migration manually with `npx supabase db push` only after review.
4. Regenerate authoritative types with `npm run supabase:types` and compare them to the checked-in
   Phase 3A types.
5. In **Storage → New bucket**, create `visit-photos` as **Private**. Allow JPEG, PNG, and WebP stored
   objects. Use the platform default size configuration or a suitably high value; do not introduce a
   small project-specific object cap. Do not add public/anonymous policies.
6. Set `SUPABASE_SECRET_KEY` only in the server runtime's protected environment. Never use a
   `NEXT_PUBLIC_` prefix and never paste it into source or client logs.
7. Deploy to a reviewed Preview environment before Production and complete the phone test below.

## First phone upload acceptance test

1. Open the HTTPS Preview on an iPhone and sign in to `/admin/login` as an allowlisted administrator.
2. Open a Public Visit at `/admin/visits/[id]`; confirm the Notes warning and current photo count.
3. Tap **Take Photo**, take a portrait rear-camera JPEG, add a Caption, keep it Public, and upload.
4. Confirm orientation, 2,048 px maximum edge, compressed size, type, capture time (when EXIF exists),
   Public badge, and automatic Cover state.
5. Tap **Choose From Library** and select a large mixed batch. Confirm every item enters Waiting,
   progress remains responsive, no more than two items process/upload together, and more can be added.
6. Select HEIC/HEIF fixtures and confirm client conversion produces an upright JPEG; confirm a damaged
   HEIC fails only its item and can be retried.
7. Edit Caption/type/visibility; set another Cover; move photos Earlier/Later; reload and confirm the
   stable order.
8. Open `/visits/[id]` signed out. Confirm only public photos/Caption and allowed Visit fields appear;
   test the Gallery, Escape, arrows, swipe, Close focus restoration, and broken-image placeholder.
9. Confirm Latest Check-ins uses the public Cover and links to the Visit page. Make the Cover Private;
   confirm the first remaining public photo is used. Make all photos Private and confirm placeholder.
10. Make the Visit Private. Confirm `/visits/[id]` is indistinguishable from missing, it disappears
    from Latest Check-ins, and `/api/public/photos/{photoId}` returns 404.
11. Restore the Visit if intended, delete a non-Cover photo, then delete the Cover and confirm a new
    Cover is selected.
12. In a disposable test Visit, upload two photos and delete the Visit. Confirm Storage objects,
    Photo Metadata, Charging Session, and Visit are gone while the Station remains.

## Phase 3B candidates

Phase 3B may add reviewed bulk import and orphan-repair tooling. OCR, Invoice extraction, video,
comments, likes, social profiles, AI Captions, route planning, and Vlog features remain out of scope.
