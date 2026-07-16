# MyTesla2026Journey

A Next.js travel log for tracking a 2026 journey across the United States Tesla Supercharger network.

## Local setup

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:3000/`.

Copy `.env.example` to `.env.local` and fill only the values needed for the feature being tested.
Never commit `.env.local` or place secret/service-role keys in a `NEXT_PUBLIC_` variable.

## Supabase setup

Phase 2A adds the Supabase SDK, CLI configuration, database migrations, RLS policies, explicit Data
API grants, and a public station-status view. It does not connect the current map repository to
Supabase.

Set the cloud project's public client values in `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
```

The public URL and publishable key may be used by browser code, but RLS—not the key—authorizes data
access. Do not add a secret key or service-role key to client code.

The CLI is installed as a development dependency. Authenticate and link this directory locally:

```bash
npx supabase login
npm run supabase:link -- --project-ref YOUR_PROJECT_REF
```

Review and apply the migration only after linking the intended project:

```bash
npx supabase db push --dry-run
npm run supabase:push
```

Then generate authoritative TypeScript types from the linked schema:

```bash
npm run supabase:types
```

Run type generation only after the migration push succeeds. `src/types/database.ts` is generated
output and should not be edited by hand; domain types stay separate in the other files under
`src/types/`.

### Check-in data model

The follow-up migration `20260712090000_simplify_station_visits.sql` keeps `station_visits` focused on one
simple check-in: station, user, absolute check-in time, IANA time zone, optional recorded
coordinates, notes, visibility, and audit timestamps. `checked_in_at` is `timestamptz not null` and
defaults to server `now()`. `checked_in_timezone` is text, defaults to `UTC`, and should contain an
IANA identifier such as `America/New_York`. Local wall-clock time is not stored separately as a
timestamp without time zone.

Charging energy and cost remain in `charging_sessions`; photo metadata remains in `visit_photos`.
The public station-status view still derives `visited` and `latest_visit_at` only from public visits
and never returns precise recorded coordinates.

`charging_sessions` stores only a visit reference, optional receipt-derived start time, energy,
cost, charging minutes, unit price, and audit timestamps. A unique `visit_id` keeps the relationship
one-to-zero-or-one. It does not store an end time, currency, OCR status, or source field. Future
Tesla receipt images belong in `visit_photos` with `photo_type = 'receipt'`; the OCR workflow will
create or update the normalized charging-session row.

To create the first administrator, first create the user in **Supabase Dashboard → Authentication →
Users**, then add that UUID through the Dashboard SQL Editor as documented in `ADMIN-SETUP.md`. Never
hard-code a real user UUID in a migration or source file.

The Phase 2B sync has populated the current station directory. Phase 2D adds Supabase Auth login,
server-protected administrator pages, and mobile Visit management. See `PHASE-2A.md` for the base
schema, `PHASE-2D.md` for the administrator architecture and application steps, and
`SECURITY-CHECKLIST.md` for required manual RLS verification.

## Phase 2B station synchronization

Phase 2B adds a controlled NLR-to-Supabase pipeline and a public Supabase repository. Add the
server-only values to `.env.local` without committing them:

```dotenv
NLR_API_KEY=
SUPABASE_SECRET_KEY=
```

Preview the complete import without changing the database:

```bash
npm run sync:stations:dry
```

Only the explicit apply command writes batches to `public.stations`:

```bash
npm run sync:stations:apply
```

The operation is idempotent on `external_id`, preserves station UUIDs and visits, and never deletes
stations missing from the current source. See `SUPABASE-STATION-SYNC.md` for counts, SQL checks,
red-to-blue verification, and troubleshooting.

Administrators can add a private **Pay to park** marker after reviewing a Supercharger in their own
Tesla app. This is a personal preference, not Tesla-verified, NLR-derived, or public Station data.
It persists across Trips, appears as a yellow `$` on private Trip maps, and is removed only when the
administrator explicitly unmarks it. **Select all visible unvisited** skips marked Stations, while
individual selection and route optimization continue to retain any Station the administrator chose.

Two receipt-confirmed New Jersey stations that are not yet in NLR live in a script-only manual
definition. Preview them without writing:

```bash
npm run sync:manual-stations:dry
```

The explicit `sync:manual-stations:apply` command is the only manual-station write path. NLR sync
checks new IDs against these rows and writes review candidates to
`artifacts/station-reconciliation-report.json`; it never merges rows or replaces temporary IDs.
See `MANUAL-STATIONS.md` for the reviewed fields, receipt aliases, and UUID-preserving adoption of a
future confirmed NLR ID.

## Phase 2C Tesla Receipt import

The Receipt importer reads the original Tesla Invoice ZIP, uses the 25 reviewed location mappings,
resolves live station UUIDs, and plans one Visit plus one Charging Session per Invoice. It defaults
to Dry Run:

```bash
npm run import:receipts:dry
```

Set an administrator UUID only in ignored `.env.local`:

```dotenv
IMPORT_USER_ID=
```

The current 75 Invoices contain event dates, energy, final cost, and explicit unit prices, but no
charging start clock time or duration. They are valid `date_only` records: the Visit stores local
noon converted to UTC only as a sortable date anchor, records precision `date_only`, and leaves the
Charging Session start and duration null. No 75-item manual time entry is required, and PDF/file
metadata is never used. Displays show date only, not the noon anchor.

Apply remains blocked until the new atomic RPC Migration is applied, the import administrator is
valid, both manual stations exist, and Dry Run reports no invalid, unmatched, ambiguous, or
conflicting records. Missing duration and date-only precision are not blockers.

Only `npm run import:receipts:apply` writes, through one service-role-only atomic RPC per Receipt.
See `PHASE-2C.md` for the model and safety design and `TESLA-RECEIPT-IMPORT.md` for preparation,
reports, safe reruns, and SQL verification.

## Phase 2D administrator login and mobile check-in

The administrator surface is available at:

```text
/admin/login
/admin/forgot-password
/admin/reset-password
/admin
/admin/check-in
/admin/visits
/admin/visits/[id]
/admin/trips
/admin/trips/new
/admin/trips/[id]
```

Create the Supabase Auth email/password user manually and register its UUID in `app_admins` as
documented in `ADMIN-SETUP.md`; the app has no registration or invitation flow. Auth cookies are
refreshed by `src/proxy.ts`, while every protected page and mutation verifies the Session with
`auth.getUser()` and the server-managed allowlist.

The phone flow supports protected station search, optional user-initiated Geolocation, Nearby
Haversine sorting, plain-text notes, and a Public/Private toggle. Mobile check-ins always store
database `now()` with precision `exact`; historical Receipt records retain `date_only` and display
only their local date. GPS is optional, stays out of URLs and localStorage, and is not included in
the public station-status View.

Review the pending management RPC Migration without applying it:

```bash
npx supabase db push --dry-run
```

After review, apply it manually and regenerate linked types:

```bash
npx supabase db push
npm run supabase:types
```

The three RPCs use Auth identity, RLS-compatible Sessions, fixed `search_path`, administrator
checks, and authenticated-only execute grants. Phase 2D Admin/Auth runtime does not use a secret
client; Phase 3A later adds one isolated server-only signer for validated public photos. Full test,
deployment, deletion, privacy, and first-phone-check-in steps are in `PHASE-2D.md`.

### Password recovery redirect

Password recovery must start from `/admin/forgot-password`, not the Dashboard's generic recovery
button. The app supplies `/auth/callback` as `redirectTo`, exchanges the PKCE code for the SSR Cookie
Session, and then opens `/admin/reset-password`.

In **Supabase Dashboard → Authentication → URL Configuration**, add the exact callback URL for each
environment, for example:

```text
http://127.0.0.1:3000/auth/callback
https://YOUR_PRODUCTION_DOMAIN/auth/callback
```

Keep Site URL set to the normal public site root. If the Recovery email template was customized,
its link must use `{{ .ConfirmationURL }}` rather than a hard-coded Site URL. After changing URL
Configuration, request a fresh email; an already-issued link keeps its old redirect destination.

## Mapbox setup

1. Create or sign in to a [Mapbox account](https://account.mapbox.com/).
2. Create a public token beginning with `pk.`. The default public scopes are sufficient for the Mapbox base map.
3. Add the token to `.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN`.
4. Restart the development server.

The map is working when the neutral dark United States base map, navigation controls, station clusters, and individual station points are visible. Without the token, the page remains usable and displays a configuration notice.

The private Trip Planner additionally needs a dedicated server token as
`MAPBOX_SERVER_ACCESS_TOKEN`. It performs Permanent Geocoding, Directions, and Matrix only on the server;
never prefix this token with `NEXT_PUBLIC_`. Keep `MAPBOX_PERSIST_ROUTE_GEOMETRY=false` unless your
account-specific Mapbox contract has been reviewed to permit long-term Directions Geometry storage.

## NLR station data

Request an API key from the [NLR Developer Network](https://developer.nlr.gov/signup/). Keep this key server-side as `NLR_API_KEY`; never prefix it with `NEXT_PUBLIC_`.

Create `.env.local`:

```dotenv
NEXT_PUBLIC_MAPBOX_TOKEN=pk_your_mapbox_public_token
NLR_API_KEY=your_nlr_api_key
STATION_DATA_SOURCE=nlr
```

Restart the development server after changing environment variables. The page should display `NLR Supercharger data`, a nationwide total much larger than the 20 sample records, and a data-driven last-updated date.

The server requests:

```text
GET https://developer.nlr.gov/api/alt-fuel-stations/v1.json
fuel_type=ELEC
country=US
ev_network=Tesla
access=public
status=E
limit=all
```

The raw NLR response is large, so the server validates and normalizes it before storing the compact station directory in the Next.js data cache with a 24-hour revalidation window. The API key is added only by the server repository and is never passed to the browser.

## Switching data sources

`STATION_DATA_SOURCE` accepts exactly three values:

- `sample` uses the 20 development records in `src/data/stations.sample.ts` and their sample visits.
- `nlr` uses the live NLR Tesla Supercharger directory. Personal visits are read only from explicit NLR IDs in `src/data/visited-stations.local.ts`.
- `supabase` pages through the complete `public_station_status` View. Visited state comes only from
  public Supabase visits.

Sample, NLR, and Supabase records are intentionally never merged, and no production source silently
falls back to another. Their IDs describe different data sets, and fuzzy matching by station name
could incorrectly mark a real station as visited. With an empty real visit list, NLR mode correctly
shows zero visited stations.

## Phase 3A Visit photos

Phase 3A is implemented in code and documented in [PHASE-3A.md](./PHASE-3A.md). It adds a Private
Supabase Storage Bucket contract, mobile photo processing/upload on `/admin/visits/[id]`, photo
management, public `/visits/[id]` pages, and real public Covers in Latest Check-ins.

The linked remote Migration history includes the Phase 3A Migration as of July 15, 2026. Before
using photos, verify the generated Supabase types and create (or verify) a **Private** Storage Bucket
named `visit-photos`. The Migration intentionally does not create the Bucket. Allow JPEG, PNG, and WebP stored objects and use Supabase's default platform
file-size configuration or a suitably high value. The project sets no custom photo-count, original
file-size, or output file-size limit; actual uploads remain subject to Supabase Storage, the browser,
device memory, and network conditions.

Every selection is appended to a controlled queue. At most two items are decoded/compressed and at
most two are uploaded at once, with per-item cancellation, retry, and failure isolation. Images are
optimized to a 2,048 px maximum edge at JPEG quality 0.88, but they do not have to reach a fixed byte
target. Supported JPEG/PNG/WebP originals can be used if Canvas encoding fails. HEIC/HEIF is converted
to JPEG in a lazily loaded Web Worker; only capture date fields are read and EXIF GPS is not parsed.
Video is not supported in Phase 3A.

Public images use `/api/public/photos/[photoId]`. The server verifies both Photo and parent Visit are
public before generating a 10-minute Signed URL. Because anonymous Storage reads are forbidden, the
server runtime needs `SUPABASE_SECRET_KEY` in its protected environment. It must never be prefixed
with `NEXT_PUBLIC_`; the key is isolated to a `server-only` module and is not included in client
bundles. Admin upload, Metadata mutations, and protected previews continue to use the authenticated
Cookie Session, `app_admins`, RLS, Storage Policies, and secured RPCs.

Review any later pending plan without applying it:

```bash
npx supabase db push --dry-run
```

See PHASE-3A.md for Bucket settings, EXIF/time rules, deletion compensation, security verification,
manual Supabase operations, and the first iPhone acceptance test.

## Phase 3B Trip Planner: simplified route basics and manual Station selection

Phases 3B.1–3B.4.1 and the nullable Stop-limit Migration are applied remotely. Full design and acceptance
instructions are in [PHASE-3B.md](./PHASE-3B.md). New Drafts choose **Trip Type, Origin, and
Destination in one Route basics step** before creation. The detail editor uses the same compact Route
basics card. For round trips the administrator chooses the complete Station set on the map; the server
uses Matrix costs to assign legs and optimize order, then verifies the final route with segmented
Directions. One-way retains Add Stop, reorder, and exact Recalculate Route. The previous Planning
Limits form and automatic candidate-generation product path are no longer exposed.

The current Draft stepper is **Route basics → Select stations → Optimize route → Review**. Phase
3B.5 confirmation and homepage work remains paused.

The Admin runtime uses its Cookie Session and never service role for Trip operations. Authenticated
clients receive base-table `SELECT` only; Draft mutations are RPC-only. An administrator can see and
mutate only their own Plans, while Stops and Segments inherit that boundary through the parent Plan.
No public Trip View or anonymous Policy exists.

Geocoding v6 requests use `permanent=true`, US-only results, and an Admin-only no-store proxy.
Directions runs in Server Actions; the browser never submits Geometry or route metrics. A monotonic
input revision and transaction RPC reject stale provider results. A real Trip Type, Origin, or
Destination change invalidates old route data exactly once; an identical save changes nothing.
Round trips request both directions independently rather than reversing the outbound Geometry.

Matrix is server-only, uses `mapbox/driving` with distance/duration annotations, preserves `null` as
unreachable, and supplies no Geometry. The Mapbox Optimization API, traffic, EV routing, and Search
Box remain unused. A Planned Stop remains planning intent and never creates a Visit or changes
`public_station_status` or the public home map. Public and Private Visits by the current administrator
both exclude a Station; other users' Visits do not affect candidates.

The Foundation, endpoint, and nullable Stop-limit Migrations (`20260715120000`, `20260715180000`,
and `20260715190000`) are applied remotely. The compatibility Migration is:

```text
supabase/migrations/20260715190000_nullable_trip_stop_limit.sql
```

It preserves existing numeric `max_stops` values and makes the column nullable. The database still
retains `corridor_miles`, `max_extra_minutes`, `max_extra_miles`, `max_stops`, and
`stop_duration_minutes` for old Trips and RPC compatibility, but ordinary UI neither displays nor
edits them. New Route Drafts use internal compatibility values of 50 miles, 120 minutes, no distance
cap, no Stop cap, and 10 minutes per Station. They are not current user planning limits. The applied
Phase 3B.3 Migration is:

```text
supabase/migrations/20260715200000_trip_suggestion_algorithm.sql
```

It introduced Base/planned Segment kinds, Stop corridor/progress/rank fields, compact algorithm audit
fields, and hardened atomic Save/Clear Suggestions RPCs. Those database fields and RPCs remain for
legacy `source=algorithm` Trip compatibility, but Automatic Suggestions has been removed from the
current product and application actions. Geometry persistence still defaults off
because the reviewed official public Directions terms did not clearly establish this account's
indefinite storage rights. Endpoints, Stops, and Metrics remain saved; sanitized Base/planned lines
are rebuilt after refresh through an administrator-only `private, no-store` preview.

Phase 3B.4 added the applied manual-editing Migration:

```text
supabase/migrations/20260715210000_trip_manual_editing.sql
```

The Trip detail editor can search and manually add any usable Supercharger (including visited
Stations), remove Stops, drag or button-reorder them, and move Round Trip legs. Recalculate Route
preserves the exact human set/order/leg and reports objective route metrics.
Legacy algorithm Stops still load, display, delete, reorder, and recalculate, but the UI no longer
offers Generate, Regenerate, Re-optimize, Clear Suggestions, or Stop lock/unlock actions. Every
mutation uses the monotonic revision, stale planned routes are labelled/faded, and no edit creates a
Visit or changes public data.

Round trips now use **Select Stations on Map** as the primary mode. The user selects the complete
Station set; the server reloads those rows, builds a chunked asymmetric driving Matrix, assigns
outbound/return legs around the fixed Destination, and optimizes visit order using deterministic
cheapest-insertion, regret-2, multi-seed, relocate, swap, and directed 2-opt heuristics. Segmented
Directions then supplies the authoritative route and metrics. Every selected Station is retained
once, including visited or out-of-display-corridor selections. Old database budget values neither
warn nor block this mode. Results show Base, Optimized, and Additional driving time/distance instead
of budget status. Selected rows are saved as manual, locked, planned Stops. Users choose every
Station; the software only assigns legs, optimizes order, and calculates the route. One-way Base
Route, Add Stop, manual ordering, and Recalculate Route remain available.

The **Display corridor** control remains 10/25/50/75/100 miles and defaults to 50. It is client-side
map filtering only: it changes which nearby candidates are displayed, never writes
`trip_plans.corridor_miles`, removes an existing selection/Stop, or limits optimization.

The applied Phase 3B.4.1 Migration is:

```text
supabase/migrations/20260715220000_trip_selected_out_and_back.sql
```

The current internal guard is 48 selected Stations per run. It is derived from the reviewed Matrix
coordinate, element, request-rate, and runtime constraints, remains application-only, and is not a
user Stop limit or database setting. The browser submits only Trip ID, expected revision, and Station
IDs. The new RPC revalidates the exact set and atomically replaces Stops and planned Segments while
preserving Base Segments. Phase 3B.5 confirmation/homepage work remains paused.

The simplified Route basics RPCs are defined in the new pending Migration:

```text
supabase/migrations/20260715235500_trip_route_basics.sql
```

`admin_create_trip_plan_route_draft` creates a Draft with internal compatibility defaults and both
endpoints atomically. `admin_update_trip_plan_route_basics` validates Auth/Admin/ownership/Draft,
expected revision, Trip Type, complete endpoints, authoritative Station metadata, and null-safe
changes. A real change clears only that Draft's Stops, Segments, route metrics, and audit state and
advances revision once. The older create/settings/endpoints/swap RPCs and database columns remain for
history and compatibility, but ordinary UI no longer calls the Settings RPC. This Migration has not
been applied by the application workflow.

## Verification

Run the project checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

In NLR mode, select a state and confirm that the visible clusters, individual stations, and statistics all change together. Select `All United States` to restore the complete source and mainland view.
