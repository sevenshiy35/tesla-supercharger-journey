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

Phase 2A adds the Supabase SDK, CLI configuration, initial database migration, RLS policies, explicit
Data API grants, and a public station-status view. It does not connect the current map repository to
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

Until that command succeeds, `src/types/database.ts` remains an intentionally empty placeholder;
domain types stay separate in the other files under `src/types/`.

To create the first administrator, first create the user in **Supabase Dashboard → Authentication →
Users**, then add that UUID through the Dashboard SQL Editor as documented in `ADMIN-SETUP.md`. Never
hard-code a real user UUID in a migration or source file.

The 3,025 NLR stations have not been imported. Login and admin UI also do not exist yet. See
`PHASE-2A.md` for the schema and application steps and `SECURITY-CHECKLIST.md` for required manual RLS
verification.

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

`STATION_DATA_SOURCE` accepts exactly two values:

- `sample` uses the 20 development records in `src/data/stations.sample.ts` and their sample visits.
- `nlr` uses the live NLR Tesla Supercharger directory. Personal visits are read only from explicit NLR IDs in `src/data/visited-stations.local.ts`.

Sample records and NLR records are intentionally never merged. Their IDs describe different data sets, and fuzzy matching by station name could incorrectly mark a real station as visited. With an empty real visit list, NLR mode correctly shows zero visited stations.

## Verification

Run the project checks:

```bash
npm run lint
npm run typecheck
npm run build
```

In NLR mode, select a state and confirm that the visible clusters, individual stations, and statistics all change together. Select `All United States` to restore the complete source and mainland view.
