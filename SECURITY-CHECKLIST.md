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

## Phase 3B private Trip Plans

- [ ] **Pending Migration only:** confirm the applied linked history through `20260715234500`, then
  review only `20260715235500_trip_route_basics.sql` with `npx supabase db push --dry-run`. Do not
  Apply it from this workflow.
- [ ] **No anonymous access:** as `anon`, confirm SELECT/INSERT/UPDATE/DELETE fail for `trip_plans`,
  `trip_plan_stops`, and `trip_plan_segments`. There must be no anonymous Trip View or Policy.
- [ ] **Non-admin denial:** as an authenticated user absent from `app_admins`, confirm all three
  tables return no rows and every Admin Trip RPC rejects the request.
- [ ] **Plan ownership:** create one Draft as each of two allowlisted administrators. Confirm each
  administrator can list/open/update/delete only their own Draft and cannot infer whether the other
  ID exists from the safe UI error.
- [ ] **Child ownership:** confirm Stop and Segment SELECT plus every defensive RLS write Policy
  resolves ownership through `trip_plans.user_id = auth.uid()` rather than trusting a child field.
- [ ] **RPC-only mutations:** confirm authenticated has SELECT but no direct INSERT/UPDATE/DELETE
  grant on the three Trip tables. Browser attempts to update `status`, `user_id`, route metrics,
  visibility flags, or Geometry must fail.
- [ ] **Server Action authorization:** confirm Route Draft create, Route basics update, and Draft
  delete Server Actions each call `requireAdmin()` before validating and invoking the authenticated
  RPC.
- [ ] **Fixed RPC environment:** confirm every mutation RPC is `security definer`, uses
  `set search_path = public`, require non-null `auth.uid()`, check `app_admins`, revoke execution from
  `public` and `anon`, and grant only `authenticated`.
- [ ] **Create identity and route intent:** confirm Route Draft create accepts Trip Type plus complete
  Origin/Destination only—never user ID, name, status, Metrics, Geometry, Stops, or Segments. The row
  must use `auth.uid()`, stay Draft, and create zero Stops/Segments/Visits.
- [ ] **Legacy Settings boundary:** confirm the retained Settings RPC changes only its historical
  columns and rejects a non-Draft or foreign-user Plan. Ordinary UI must not call it or expose route
  corridor, extra time/distance, Stop cap, or Station duration controls.
- [ ] **No hidden business cap:** confirm Matrix shortlist, Directions-coordinate, batching, and
  iteration guards remain application-only technical controls. They must not be stored in Trip rows
  or presented as a Maximum Stops setting, and a guard hit must be reported as a partial result.
- [ ] **Draft deletion boundary:** confirm only a current-user Draft can be deleted. Its Stops and
  Segments cascade, Stations remain, and a referenced Visit remains (with only the Stop link subject
  to `ON DELETE SET NULL` when the Visit itself is deleted).
- [ ] **Trip/Visit isolation:** create, edit, and delete a Draft; confirm `station_visits`,
  `charging_sessions`, `visit_photos`, and `public_station_status` do not change and the public map
  keeps the same red/blue status.
- [ ] **No token or raw response storage:** inspect Trip rows and action payloads for the absence of
  Mapbox tokens, Secrets, phone GPS check-in coordinates, complete provider responses, and
  unfiltered station candidate arrays.
- [ ] **List minimization:** confirm `/admin/trips` reads no Segment Geometry or user UUID and limits
  the newest result set to 100 Plans. SQL/PostgREST errors must not reach the browser.
- [ ] **No public Draft leak:** even if `is_public` is manually true in a test environment, signed-out
  users must receive no Plan, address, settings, Stop, or Geometry data in Phase 3B.1.
- [ ] **No disallowed Mapbox calls:** confirm the Trip Planner calls only Geocoding v6, Directions
  v5, and Matrix v1 with `mapbox/driving`; there must be no Search Box, Optimization, live-traffic,
  EV, fallback-speed, or navigation-instruction API.
- [ ] **No secret in client:** after `npm run build`, scan `.next/static` for
  `SUPABASE_SECRET_KEY` and `service_role`; Trip Client Components must contain neither.

### Simplified Route basics boundary

- [ ] **Atomic input:** `admin_update_trip_plan_route_basics` must be `security definer`, fix
  `search_path`, verify non-null Auth, `app_admins`, owner Draft, expected revision, legal Trip Type,
  complete valid endpoints, and different Origin/Destination before returning a safe DTO.
- [ ] **Station authority:** forge Station labels, addresses, provider IDs, or coordinates. The RPC
  must re-read authoritative Station metadata and reject mismatched coordinates.
- [ ] **Null-safe no-op:** submit the exact saved Trip Type and endpoints. Confirm `changed=false`,
  revision and updated route data remain unchanged, and no Stop/Segment deletion occurs.
- [ ] **Single invalidation:** change Trip Type, Origin, Destination, or multiple inputs together.
  Confirm revision advances exactly once; all Base/planned Segments, Stops, route Metrics/audit state,
  and stale flag clear; Station/Visit/photo/Receipt/Charging data remains unchanged.
- [ ] **Intent-only browser payload:** Route basics Server Action may submit only Trip ID, expected
  revision, Trip Type, and endpoint fields. It must not accept ownership, status, Metrics, Geometry,
  Stops, persistence, or stale-state input.
- [ ] **Local Display corridor:** confirm 10/25/50/75/100 miles defaults to 50 and changes candidate
  display only. It must not call Settings RPC, write `trip_plans.corridor_miles`, remove selected or
  current Stops, or cause optimization to omit selected Stations.
- [ ] **No budget product state:** inspect Route summary, map selection, and manual editor for Base,
  Optimized, and Additional drive time/distance. They must not render Budget remaining, Within/Over
  budget, editable Station duration, or Planning Limits.

### Phase 3B.2 endpoints and base route

- [ ] **Token isolation:** configure `MAPBOX_SERVER_ACCESS_TOKEN` only in the protected server
  environment. Confirm it never appears in HTML, RSC/client payloads, `.next/static`, browser URLs,
  logs, error text, or `NEXT_PUBLIC_*`. A separate `NEXT_PUBLIC_MAPBOX_TOKEN` is used only for GL JS.
- [ ] **Permanent Geocoding eligibility:** verify the Mapbox account has the required valid card or
  enterprise contract. Confirm requests set `permanent=true`, `country=US`, and use the protected
  Admin proxy with `Cache-Control: private, no-store`.
- [ ] **Geocoding minimization:** confirm the client receives only provider ID, label, full address,
  coordinates, feature type, and attribution. No access token, request URL, context tree, or raw
  response may be returned or stored.
- [ ] **Geocoding authorization:** signed-out and authenticated non-admin requests to
  `/api/admin/trips/geocode` must fail before any Mapbox request. Validate minimum/maximum query
  lengths and semicolon rejection.
- [ ] **Current-location privacy:** confirm no location prompt occurs on load. Deny and timeout paths
  must preserve address/Station search. GPS must not enter URL, logs, local/session storage, public
  Views, or public map; it persists only after Create Draft or Save Route Basics to the private owner
  Draft.
- [ ] **Station integrity:** attempt to submit a valid `stations.id` with altered coordinates. The
  endpoint RPC must reject it, re-read the Station label/address/coordinates, and never add it to
  `trip_plan_stops`.
- [ ] **Endpoint shape:** Mapbox requires provider ID and permanent address; current location forbids
  Station/provider/address metadata; Station requires stable ID and forbids provider ID. Labels and
  provider IDs are trimmed and bounded.
- [ ] **Revision race:** start A→B calculation, update to A→C before completion, and confirm
  `admin_save_trip_base_route` rejects the old expected revision without changing route metrics or
  Segments.
- [ ] **Transactional invalidation:** a real Route basics change or Clear Route must increment
  revision, delete only this Plan's Segments/Stops, and clear all route metrics. An identical Route
  basics update must do none of those operations. Retained legacy endpoint/settings/swap RPCs remain
  compatibility-only.
- [ ] **Directions boundary:** browser payloads must contain only `tripPlanId`; Geometry, distance,
  duration, provider, algorithm, and expected revision are read/created server-side after
  `requireAdmin()`.
- [ ] **Directions failure:** verify 401, 403, 429, retryable 5xx, timeout, NoRoute/NoSegment, invalid
  Geometry, and stale-save errors become safe messages with no provider body or complete URL.
- [ ] **Round-trip atomicity:** fail the return fixture after outbound succeeds. Confirm no route RPC
  runs and no single Segment or partial metrics are saved.
- [ ] **Geometry validator:** reject Point/MultiLineString, fewer than two coordinates, nonfinite or
  out-of-range values, extra Geometry keys, over 100,000 coordinates, and payloads over 8 MiB.
- [ ] **Persistence safe default:** keep `MAPBOX_PERSIST_ROUTE_GEOMETRY=false` until account-specific
  Directions retention rights are confirmed. With false, endpoints/Stops/Metrics save but planned
  Segment rows do not; refresh must rebuild a sanitized line only through the authenticated,
  owner-scoped, `private, no-store` preview without changing Metrics or revision.
- [ ] **RPC hardening:** verify all four new RPCs and upgraded settings RPC are `security definer`,
  fix `search_path`, check Auth/Admin/owner/Draft, and expose execution to authenticated only.
- [ ] **Trip isolation:** confirm endpoint/route operations never insert `station_visits` or
  `trip_plan_stops`, never change Station/Visit/photo/charging/public status data, and never revalidate
  or modify the public homepage map.
- [ ] **Client bundle scan:** after build, scan `.next/static` for `MAPBOX_SERVER_ACCESS_TOKEN`,
  `SUPABASE_SECRET_KEY`, `service_role`, and any actual configured token value. All must be absent.

### Phase 3B.3 legacy Suggestions schema and planned-route compatibility

- [ ] **No current product entry:** browser and Server Actions expose no Generate Suggestions,
  Regenerate, Re-optimize Unlocked, Clear Suggestions, automatic loading, or technical-limit UI.
  Existing `source=algorithm` Stops must still load, display, remove, reorder, and recalculate.

- [ ] **Current-user Visit definition:** create Public, Private, exact, date-only, Receipt-imported,
  and phone Check-in Visits for test Stations. Every one must exclude that Station from the current
  administrator's candidates. Another user's Visit must not exclude it. Candidate runtime must use
  the Cookie Session and explicit `station_visits.user_id = auth.uid()`, never service role.
- [ ] **Candidate minimization:** verify the server queries expanded Bounding Boxes in pages, performs
  spherical Corridor filtering server-side, and never returns the nationwide Station pool, another
  user's Visit data, private endpoint coordinates, or raw candidate records to the browser.
- [ ] **Eligibility:** closed/non-operational, non-US, invalid-coordinate, Origin, Destination, and
  duplicate Stations must be excluded. Missing postal code, stall count, and power must not exclude
  an otherwise eligible Station. Accept only operational values confirmed in current data.
- [ ] **Matrix isolation:** Matrix must be imported only by `server-only` modules, use
  `mapbox/driving`, request `distance,duration`, omit traffic and `fallback_speed`, keep `null`
  unreachable, validate dimensions, and reuse bounded retry/abort handling. Token, full URL, raw
  Matrix, and endpoint coordinates must not be logged or returned.
- [ ] **Technical guards:** verify Matrix coordinate/elements/request limits, Directions coordinate
  limits, candidate query pages, and algorithm/local/correction iterations exist only as application
  constants. A guard hit may save a valid partial result with `technical_limit_reached`, but must
  never write a user Stop cap or claim mathematical completeness.
- [ ] **Determinism and budgets:** repeat one fixture with unchanged Station/Visit/Mapbox inputs.
  Selected set, order, leg, and ranks must match. Extra-time/distance budgets use Directions driving
  only; Station dwell time is separate. A legacy numeric `max_stops` remains compatible, while null
  imposes no user count limit.
- [ ] **Round-trip midpoint:** verify distinct outbound and return Base Geometry, one fixed
  Destination midpoint, no reversed outbound Geometry, no duplicate Station across legs, and no
  local-optimization move across Destination. Fail any return/Segment request and confirm no partial
  save occurs.
- [ ] **Authoritative correction:** force Matrix to underestimate a detour. Final Directions must
  detect the overage, remove a deterministic costly Stop within the bounded correction loop, and
  save only a compliant route. An uncorrectable route must leave old Suggestions untouched; zero
  Stops must still save a successful Base-equivalent result.
- [ ] **Save RPC hardening:** attempt stale revision, foreign/non-Draft Plan, duplicate/nonexistent/
  endpoint/visited Station, discontinuous sequence, invalid leg/source/lock/status/rank/progress,
  forged Metrics, over-budget totals, wrong algorithm version, and invalid Geometry. Every case must
  roll back without partial Stops, Metrics, or Segments.
- [ ] **Clear isolation:** Clear Suggestions must delete only algorithm/unlocked Stops and planned
  Segments, restore planned Metrics from Base, clear audit state, preserve Base Segments/endpoints/
  revision, and leave Visits, Stations, photos, charging data, and public status untouched. Repeating
  Clear with no Stops must be safe.
- [ ] **Preview isolation:** signed-out, non-admin, foreign-owner, invalid-ID, and invalid-kind preview
  requests must fail before Directions. Valid responses must be `private, no-store`, contain only
  cleaned Segments, and never mutate Stops, Metrics, revision, or audit fields.
- [ ] **Legacy RPC isolation:** no browser route invokes Generate/Regenerate/Clear. Retained database
  compatibility RPCs remain authenticated/owner-scoped and accept no client candidate pool, Matrix,
  Metrics, Geometry, technical state, ownership, Visit status, or persistence policy.
- [ ] **No public effect:** after Preview and every current manual planning action, verify no new Visit
  exists, `public_station_status` and the public homepage are unchanged, and no Draft/Stop/route data
  is available anonymously.

### Phase 3B.4 manual Stops and Anchors

- [ ] **New Migration only:** review `20260715210000_trip_manual_editing.sql` after 3B.3. Do not edit
  or reapply older Migrations; confirm `planned_route_stale` defaults false and internal API limits
  are absent from the schema.
- [ ] **RPC boundary:** for every 3B.4 RPC verify `security definer`, fixed `search_path`, authenticated
  execute only, `auth.uid()` administrator allowlist, owner Draft lock, and expected revision.
- [ ] **Manual identity:** forge source, lock, status, Visit, detour, or selection-rank input. The add
  RPC must still create `manual + locked + planned` with algorithm fields null. Endpoint, duplicate,
  invalid-coordinate, and clearly closed Stations must fail atomically.
- [ ] **Visit privacy:** manual search and Stop reload may expose only a boolean for the current user's
  Visit. Another user's Visit must never appear. No Visit ID, timestamp, notes, GPS, or visibility is
  returned to the Stop editor.
- [ ] **Explicit-edit invalidation:** add/remove/reorder must increment revision, retain Base Segments
  and all route Metrics, delete only planned Segments, and mark stale. Lock/unlock must increment
  revision while retaining Stops, sequence, leg, Metrics, Segments, and the existing stale value.
- [ ] **Exact recalculate:** reorder a human route beyond retained legacy budget values. Recalculate
  must preserve the exact Stop IDs/order/legs, save authoritative Directions metrics, show objective
  Additional time/distance, clear stale, and never auto-remove a manual Stop or show budget status.
- [ ] **Retired Anchor actions:** confirm no application entry exposes Anchor re-optimization,
  lock/unlock, or scratch regeneration. Retained legacy RPCs must remain inaccessible to anonymous
  users and must not be called by the current browser flow.
- [ ] **Complete reorder payload:** omit, duplicate, or inject a foreign Stop ID; repeat a sequence;
  send return on one-way; or interleave outbound after return. The transaction must roll back. A
  valid explicit reorder may move manual/locked Stops and must keep manual rows locked.
- [ ] **Concurrency:** overlap current add, remove, reorder, leg-move, optimize-selected, and
  recalculate operations.
  The loser must show “The trip changed while this operation was running. Refresh and try again.”
  and must not partially replace Stops, Metrics, or Geometry.
- [ ] **Client and public isolation:** scan client bundles for server Mapbox/Supabase secrets and
  confirm all 3B.4 operations leave Stations, Visits, public status, public homepage, receipts,
  photos, and Charging Sessions unchanged.

### Phase 3B.4.1 selected out-and-back route

- [ ] **Pending Migration only:** review `20260715220000_trip_selected_out_and_back.sql` after the
  applied 3B.4 Migration. Do not apply it during implementation and do not modify older Migrations.
- [ ] **Candidate boundary:** Candidate GET must require an allowlisted administrator and owner Draft,
  require a round-trip Base Route, use `private, no-store`, cap/paginate inventory reads, and return
  only the compact Station DTO with the current administrator's visited boolean. It must not return
  user IDs, Visit rows/IDs, GPS history, tokens, raw provider data, or private endpoint metadata.
- [ ] **Client intent only:** Optimize Selected Stations may submit only Trip ID, expected revision,
  and Station IDs. Reject unknown keys such as coordinates, Visit status, leg, sequence, source,
  lock state, metrics, Geometry, provider, algorithm, and persistence policy.
- [ ] **Authoritative reload:** after browser selection, reload every Station on the server and reject
  a missing/closed/invalid-coordinate/endpoint Station. Accept visited Stations, count them as Stops
  and dwell time, and exclude them only from expected-new Check-ins.
- [ ] **Directed Matrix isolation:** Matrix code must be server-only, use source/destination tiling
  within the documented coordinate/element/request limits, retain A→B and B→A independently, retain
  `null` as unreachable, use bounded retry/timeout, enforce request/runtime/iteration guards, and
  never return or log the raw Matrix, URL, or server token.
- [ ] **Exact selected set:** verify Origin → outbound Stops → fixed Destination → return Stops →
  Origin contains every selected Station exactly once. Any unreachable Station, incomplete seed,
  Directions segment failure, stale revision, or technical failure must leave the previous Stops,
  Segments, metrics, and revision intact—never save a partial route.
- [ ] **Heuristic honesty:** confirm no UI promises a guaranteed/mathematically shortest route.
  Technical Station/request/iteration/runtime caps must be labelled internal safety guards and must
  not be stored as Trip business settings.
- [ ] **Directions final authority:** outbound and return must be calculated independently with the
  existing segmented Directions path. Return Geometry must not be reversed outbound Geometry; all
  segment totals must match saved authoritative metrics; Geometry-off mode must still save Stops and
  metrics while leaving planned Segment rows absent and preview rebuildable.
- [ ] **Legacy-budget independence:** force results beyond old time/distance values. All selected
  Stations must remain, the valid route must save, objective Additional time/distance must be shown,
  and no budget warning, correction, blocking, or automatic Station deletion may run in this mode.
- [ ] **RPC hardening:** verify `admin_save_selected_out_and_back_route` is `security definer`, fixes
  `search_path`, checks `auth.uid()`, `app_admins`, owner/Draft/round-trip/revision/base prerequisites,
  exact selected/Stop equality, continuous outbound-before-return sequence, manual/locked/planned
  metadata, Station status, Segment continuity, and metric totals before its atomic replacement.
- [ ] **No side effects:** confirm selection and optimization do not create/update/delete Visits,
  Stations, public status, homepage data, receipts, photos, Charging Sessions, endpoint coordinates,
  or any Phase 3B.5 confirmation/public state.
- [ ] **Secret scan:** production client chunks must not contain `MAPBOX_SERVER_ACCESS_TOKEN`,
  `SUPABASE_SECRET_KEY`, service-role material, raw Matrix/Directions payloads, or internal URLs.

### Parking information boundary

- [ ] **Private preference table:** `station_user_preferences` must use `(user_id, station_id)` as
  its primary key, reference `auth.users` and `stations`, enable RLS, and allow authenticated reads
  only where `user_id = auth.uid()`. It must not be joined into a public View or public DTO.
- [ ] **RPC-only writes:** Browser roles receive SELECT only. `admin_set_station_pay_to_park` must be
  `security definer`, fix `search_path`, derive `user_id` from `auth.uid()`, verify `app_admins`,
  verify the Station exists, reject null input, and expose no client `user_id` parameter.
- [ ] **Idempotent removal:** true must upsert the owner/Station row; false must delete only that
  owner/Station row. Repeated true/false calls must succeed without duplicates.
- [ ] **No authoritative claim:** UI copy must say **Pay to park** and “Personal marker based on your
  Tesla app review.” It must never say Tesla verified, official, or confirmed by Tesla.
- [ ] **No route/data side effects:** Mark/Unmark must not modify `stations`, `station_visits`,
  `public_station_status`, `trip_plans`, `trip_plan_stops`, `trip_plan_segments`, metrics, or route
  revisions and must not call Mapbox, Tesla, NLR, or any external parking source.
- [ ] **Admin-private hydration:** Candidate, search, and Stop repositories must scope preference
  reads to the current administrator. Missing rows map to false; another user's marker must never
  enter the authenticated Admin DTO.
- [ ] **Selection boundary:** Select-all may skip marked unselected Stations, but direct selection and
  optimization must keep every explicitly selected Station. Unselecting a Station or deleting a
  Draft/Stop must not delete the preference.
