# Supabase security checklist

Run these checks against a non-production environment after applying the migration. Test with three
separate contexts: the publishable key without a user session (`anon`), a normal authenticated user,
and an authenticated user whose UUID is present in `public.app_admins`.

- [ ] **Anonymous users can read stations.** Query `stations` and confirm a successful response.
- [ ] **Anonymous users cannot write stations.** Attempt insert, update, and delete operations and
  confirm each is denied.
- [ ] **Anonymous users can read public visits.** Create a public visit as an admin, then confirm it
  is returned without a session.
- [ ] **Anonymous users cannot read private visits.** Create a private visit as an admin and confirm
  it is absent from anonymous results, including direct ID filters.
- [ ] **Ordinary authenticated users cannot write journey data.** Confirm insert, update, and delete
  fail for `stations`, `station_visits`, `charging_sessions`, and `visit_photos`.
- [ ] **Administrators can write journey data.** Confirm an allowlisted authenticated user can
  insert, update, and delete test rows in all four journey tables.
- [ ] **Users cannot promote themselves.** As both anonymous and ordinary authenticated users,
  confirm insert, update, and delete operations on `app_admins` fail.
- [ ] **The administrator list is not exposed.** An authenticated user can select only the
  `app_admins` row matching its own `auth.uid()`; anonymous users receive no rows/access.
- [ ] **`public_station_status` leaks no private data.** Confirm the view has only public station
  fields, `visited`, and `latest_visit_at`; a station with only private visits must show `visited =
  false` and `latest_visit_at = null`.
- [ ] **The publishable key is not admin authority.** Repeat all anonymous write tests using the
  configured publishable key and confirm RLS rejects them.
- [ ] **`.env.local` is not committed.** Run `git check-ignore .env.local` and confirm the file is
  ignored, then inspect `git status` before every commit.
- [ ] **No secret key reaches the client bundle.** Search source and built client assets for secret
  or service-role keys. Only `NEXT_PUBLIC_SUPABASE_URL` and
  `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` may be referenced by browser code.

Also confirm sessions and photos tied to a private visit are hidden even when their own row is marked
public. Keep all test user UUIDs and credentials outside the repository.

## Receipt import RPC

- [ ] **Migration review:** confirm `import_receipt_charge` is `security definer`, has an explicit
  `search_path`, and is introduced only by the new Phase 2C Migration.
- [ ] **Execute is service-role only:** confirm EXECUTE is revoked from public, anon, and
  authenticated and granted only to service_role.
- [ ] **No DELETE authority:** confirm Phase 2C grants only required SELECT and RPC EXECUTE to
  service_role; it grants no table DELETE.
- [ ] **Administrator validation:** call with a UUID absent from `app_admins` and confirm the whole
  transaction fails without a Visit or Charging Session.
- [ ] **Station validation:** call with a missing station UUID and confirm neither table changes.
- [ ] **Atomic rollback:** intentionally fail the Charging Session constraints and confirm the Visit
  insert is rolled back.
- [ ] **Identity conflicts:** confirm an existing deterministic Visit with different station, user,
  or timestamp is rejected rather than overwritten.
- [ ] **GPS and notes untouched:** on repeat import, confirm existing `recorded_latitude`,
  `recorded_longitude`, and `notes` are not modified by the RPC.
- [ ] **Time precision validation:** confirm the RPC rejects values other than `exact` and
  `date_only`, rejects a missing Session start for exact, and keeps Session start null for
  date-only.
- [ ] **Date-only display:** confirm a date-only Visit renders only its local event date and never
  exposes the local-noon anchor as an actual charging time.
- [ ] **Import environment:** keep `IMPORT_USER_ID`, the Receipt time-override file, and all secrets
  outside source control. Reports must not contain the user UUID or customer identity.

## Phase 2D Auth and administrator pages

- [ ] **Unauthenticated route protection:** in a private browser, confirm `/admin`,
  `/admin/check-in`, `/admin/visits`, and a Visit detail URL redirect to `/admin/login`.
- [ ] **Non-admin Session:** sign in with an Auth user absent from `app_admins`; confirm the login
  action signs it out, direct Admin access is refused, and no allowlist contents are shown.
- [ ] **Administrator Session:** sign in with an allowlisted user and confirm all five Admin routes
  are available. Open `/admin/login` again and confirm it redirects to `/admin`.
- [ ] **Sign out:** sign out from both desktop and mobile navigation, then confirm protected URLs no
  longer render from browser history or a fresh request.
- [ ] **Session expiry:** invalidate or expire the Session and confirm the next protected page or
  mutation returns to login without exposing a token, Cookie, or database error.
- [ ] **Cookie refresh boundary:** confirm the Next.js `proxy.ts` refreshes only the Supabase
  Session; final authorization still occurs in `requireAdmin`, Server Actions, RLS, and RPCs.

## Phase 2D management RPCs

- [ ] **Pending Migration only:** review
  `20260713180000_admin_visit_management.sql` with `npx supabase db push --dry-run` before any Apply.
- [ ] **Fixed function environment:** confirm all three functions are `security definer` with
  `set search_path = public`.
- [ ] **Execute grants:** confirm execute is revoked from `public` and `anon` and granted only to
  `authenticated`. Confirm an ordinary authenticated user is still rejected by the internal
  `auth.uid()` plus `app_admins` check.
- [ ] **No client identity/time:** inspect the create signature and browser request; neither
  `user_id`, `checked_in_at`, nor precision is accepted. Confirm the row uses `auth.uid()`, `now()`,
  and `exact`.
- [ ] **Input validation:** test missing/invalid timezone, latitude outside -90..90, longitude
  outside -180..180, an incomplete coordinate pair, notes over 2,000 characters, missing station,
  and null visibility. Confirm no row is written.
- [ ] **Idempotence:** submit one `p_visit_id` twice with the same user/station and confirm one row
  and the original server timestamp. Reuse it with another station and confirm a conflict. Use a
  new UUID at the same station and confirm a legitimate second Visit.
- [ ] **Update limits:** confirm the update RPC changes only `notes` and `is_public`; station, user,
  timestamp, timezone, precision, GPS, and Charging Session remain unchanged.
- [ ] **Delete dependencies:** delete a Visit with a Charging Session and no photos; confirm the
  Session is deleted, the Visit is deleted, and the station remains. Phase 3A separately covers the
  Storage-first photo-backed Visit workflow.
- [ ] **Public recalculation:** delete or privatize the only public Visit and confirm the station
  becomes unvisited. Repeat with another public Visit remaining and confirm it stays visited.

## Phase 2D browser privacy and runtime

- [ ] **User-initiated location:** confirm the page does not request Geolocation until **Use My
  Location** is tapped. Deny permission and confirm manual Search remains usable.
- [ ] **GPS handling:** inspect network requests and browser storage. Coordinates must appear only
  in the Server Action payload, never URL/query parameters, logs, localStorage, or copied station
  coordinates. **Clear GPS** must store both fields as null.
- [ ] **Public data:** confirm `public_station_status` contains no GPS or notes, a Private Visit does
  not change `visited/latest_visit_at`, and private notes do not appear in public Latest Check-ins.
- [ ] **Plain-text notes:** confirm no Admin component uses `dangerouslySetInnerHTML`.
- [ ] **Server-only signing secret:** `SUPABASE_SECRET_KEY` may appear only in
  `src/lib/supabase/admin.ts`, which must begin with `import "server-only"`. It exists solely because
  anonymous Storage SELECT is forbidden and the public route must sign an already-validated object.
  It must be absent from `src/components`, Client Components, action inputs/outputs, logs, and URLs.
- [ ] **No sensitive logging:** exercise Login, Search, Nearby, create, update, and delete failures;
  logs and UI must contain no password, token, Cookie, secret, full GPS, SQL, or stack trace.
- [ ] **Bundle inspection:** after `npm run build`, inspect `.next/static` for secret/service-role
  values. Only the public Supabase URL and publishable key may reach browser code.

## Phase 3A private Visit photos

- [ ] **Manual private Bucket:** create `visit-photos` manually and confirm Public Bucket is off,
  allowed stored MIME types are JPEG, PNG, and WebP, and the size setting uses the platform default or
  a suitably high value rather than a small project cap. The Migration must not insert
  `storage.buckets` and no app code may create a Bucket.
- [ ] **Anonymous Storage denial:** without a Session, confirm list, download/select, insert, update,
  and delete fail for `visit-photos`. There must be no `anon` policy on `storage.objects`.
- [ ] **Ordinary-user denial:** as an authenticated non-admin, confirm upload, signed preview,
  update, and delete fail. Confirm allowlist membership is checked by Storage Policies and every RPC.
- [ ] **Managed path only:** as admin, reject paths whose first folder is not `auth.uid()`, whose
  second folder is not an existing Visit UUID, whose filename is not a photo UUID, or whose extension
  disagrees with verified MIME. Confirm `..`, Captions, and original names never enter paths.
- [ ] **No overwrite:** upload the same path twice and confirm `upsert: false` plus the no-UPDATE
  policy prevents replacement. Reusing a photo ID with its same Visit/path returns the original
  Metadata; using it with another Visit/path raises a conflict.
- [ ] **Base Metadata privacy:** anon cannot query `visit_photos`. `public_visit_photos` exposes only
  public Photo ID/Visit ID, Caption, taken time, dimensions, ordering, Cover, and creation time; it
  exposes no user, Bucket, path, MIME, private flag, or GPS.
- [ ] **Public signing gate:** Public Visit + Public Photo returns a redirect to a 10-minute Signed
  URL. Public Visit + Private Photo, Private Visit + Public Photo, missing rows, wrong Bucket, and
  malformed ID all return 404 without distinguishing the reason.
- [ ] **Admin signing gate:** `/api/admin/photos/[photoId]` requires the Cookie Session and allowlist.
  It accepts no Storage path from the browser and redirects only after Metadata validation.
- [ ] **Upload validation:** verify JPEG, PNG, WebP, HEIC, and HEIF; reject a MIME/signature mismatch,
  non-image, empty file, decode failure, and damaged/unsupported HEIC variant. Confirm large files are
  not rejected by a project MB threshold and other queue items continue after one fails.
- [ ] **Orientation:** upload portrait Orientation 6/8 and rotated/mirrored test fixtures. Confirm
  normalized JPEG output is upright and no downstream EXIF rotation is required.
- [ ] **EXIF minimization:** confirm only DateTimeOriginal, reliable CreateDate fallback, matching
  offset, and Orientation are parsed. No GPS IFD, full EXIF JSON, camera model, original name, or file
  modified time is read into Metadata.
- [ ] **EXIF timezone:** a capture time with offset preserves its instant. One without offset uses the
  parent Visit IANA timezone. Ambiguous/nonexistent local time, pre-2000, implausible future, and parse
  failure save `taken_at = null` without blocking upload. A >31-day difference shows a warning.
- [ ] **Unlimited controlled queue:** confirm every selected image enters Waiting, existing Visits can
  continue beyond any prior count, and there is no per-selection, per-Visit, account, original-MB, or
  output-MB business cap. Confirm Caption <=1,000, the stored MIME enum, positive byte/dimension
  values, 2,048 px optimization, two compression workers, and two upload workers remain enforced.
- [ ] **Queue lifecycle:** confirm per-item states/counters, Waiting cancellation, same-photo-ID retry,
  failure isolation, append-during-upload, and Object URL/ImageBitmap/Canvas/temporary Blob release.
  A large batch must show guidance without being blocked.
- [ ] **HEIC isolation:** confirm the converter and HEIC metadata reader are lazy-loaded only for a
  verified HEIC/HEIF signature, conversion runs in its worker, output is verified JPEG, and only
  DateTimeOriginal/CreateDate plus matching offsets are parsed. GPS and full EXIF remain excluded.
- [ ] **Compensation:** force Metadata creation to fail after Storage succeeds. Confirm the exact
  object is removed. Force compensation to fail and confirm the UI returns the orphan photo ID for
  manual repair without a secret, token, Cookie, GPS, or path.
- [ ] **Cover transaction:** first photo becomes Cover; setting another clears the old Cover; the
  partial unique index blocks two Covers. A Private Cover remains usable in Admin but public pages
  choose the first public photo, then placeholder.
- [ ] **Reorder integrity:** Move Earlier/Later persists a full ordered UUID list. Missing, duplicate,
  or foreign-Visit IDs are rejected transactionally.
- [ ] **Single delete ordering:** Storage deletion occurs before Metadata deletion. Storage failure
  keeps Metadata. Metadata failure after Storage reports manual repair. Deleting Cover selects the
  next photo by display order, creation time, then ID.
- [ ] **Visit delete ordering:** the server queries all paths; any Storage failure keeps Visit,
  Metadata, and Charging Session. After Storage succeeds, the RPC verifies the exact photo-ID set and
  transactionally deletes Metadata, Charging Session, and Visit. The Station must remain.
- [ ] **Public Visit privacy:** Private and missing Visit IDs both render not-found. Public pages and
  DTOs contain no user ID, recorded GPS, Bucket/path, Auth data, Receipt Invoice ID, or admin actions.
  Notes/Caption render as plain text without `dangerouslySetInnerHTML`.
- [ ] **Latest Check-ins:** query at most six Visits plus one batched safe-photo View query. Confirm
  Public Cover, first public fallback, and placeholder; Private Visits/photos never appear; exact and
  date-only display rules remain correct; cards link to `/visits/[id]`.
- [ ] **Signed expiry:** keep a public page open past 10 minutes and reload the image route; confirm a
  fresh redirect is issued. Change visibility and confirm new route requests return 404. Account for
  at most the remaining lifetime of an already-issued Signed URL.
- [ ] **No secret in client:** run `npm run build`, then scan `.next/static` for
  `SUPABASE_SECRET_KEY` and `service_role`. Confirm no matches and inspect browser source maps/network
  payloads for secrets or arbitrary Storage paths.

## Password recovery follow-up

- [ ] **Redirect allowlist:** add the exact `/auth/callback` URL for local, preview, and production
  environments in Supabase Auth URL Configuration. Keep Site URL pointed at the public site root.
- [ ] **Recovery template:** confirm the Recovery email button uses `{{ .ConfirmationURL }}` and
  does not hard-code `{{ .SiteURL }}` as the destination.
- [ ] **Fresh email:** request recovery through `/admin/forgot-password`; an old Dashboard-issued
  link retains its old home-page redirect and cannot be repaired retroactively.
- [ ] **PKCE callback:** confirm `/auth/callback` exchanges the one-time code, sets the SSR Cookie
  Session, and redirects only to `/admin/reset-password`.
- [ ] **Admin-only reset:** verify the reset action calls `getUser()`, checks `app_admins`, requires
  matching 12–128 character passwords, and never accepts a user UUID from the browser.
- [ ] **Enumeration resistance:** existing and unknown email addresses receive the same successful
  forgot-password screen; Auth provider errors remain generic.
- [ ] **Session cleanup:** after a successful password update, confirm existing Sessions are signed
  out globally and the new password is required at `/admin/login`.
