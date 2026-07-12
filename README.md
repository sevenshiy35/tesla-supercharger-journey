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

The Phase 2B sync has populated the current station directory; login and admin UI do not exist yet.
See `PHASE-2A.md` for the schema and application steps and `SECURITY-CHECKLIST.md` for required
manual RLS verification.

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

## Mapbox setup

1. Create or sign in to a [Mapbox account](https://account.mapbox.com/).
2. Create a public token beginning with `pk.`. The default public scopes are sufficient for the Mapbox base map.
3. Add the token to `.env.local` as `NEXT_PUBLIC_MAPBOX_TOKEN`.
4. Restart the development server.

The map is working when the neutral dark United States base map, navigation controls, station clusters, and individual station points are visible. Without the token, the page remains usable and displays a configuration notice.

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

## Verification

Run the project checks:

```bash
npm run lint
npm run typecheck
npm run build
```

In NLR mode, select a state and confirm that the visible clusters, individual stations, and statistics all change together. Select `All United States` to restore the complete source and mainland view.
