# Supabase station synchronization

## Required environment

Keep these values in `.env.local`; never commit or print them:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=
SUPABASE_SECRET_KEY=
NLR_API_KEY=
NEXT_PUBLIC_MAPBOX_TOKEN=
STATION_DATA_SOURCE=sample
```

Dry Run uses `NEXT_PUBLIC_SUPABASE_URL`, the publishable key, and `NLR_API_KEY`; it has no database
write authority. Apply mode additionally requires `SUPABASE_SECRET_KEY`. The public home page uses
only the URL and publishable key. Never rename the secret to a `NEXT_PUBLIC_` variable.

## Dry Run

Both commands fetch and normalize NLR, page through existing Supabase external IDs, validate rows,
and calculate New/Updated/Missing counts without writing:

```bash
npm run sync:stations
npm run sync:stations:dry
```

For a smaller diagnostic plan:

```bash
npm run sync:stations:dry -- --limit=100 --batch-size=300
```

Successful Dry Run output ends with `DRY RUN — no database changes were made`.

Every NLR run also checks new NLR IDs against existing rows whose source is `tesla_official`,
`tesla_receipt_verified`, or `manual`. It writes the secret-free review artifact to
`artifacts/station-reconciliation-report.json`. High-confidence same-address candidates and clearly
same addresses within 1,600 m are omitted from `New`; nearby rows with different addresses remain
eligible and are reported as warnings.

## Manual station Dry Run and Apply

The reviewed receipt-confirmed definitions are separate from the NLR feed:

```bash
npm run sync:manual-stations:dry
npm run sync:manual-stations:apply
```

The default `npm run sync:manual-stations` is also a Dry Run. Apply uses the existing Admin client
and upserts on `external_id`; it never submits a UUID or modifies visits. See
`MANUAL-STATIONS.md` for field evidence, aliases, UUID verification, and the manual NLR adoption
procedure.

## Apply

Review the Dry Run first. An explicit apply flag is the only write path:

```bash
npm run sync:stations:apply
```

The script sequentially upserts 300 rows per request by default and retries transient failures at
most three times. It never deletes stations missing from NLR and never modifies visits.

Before an NLR batch writes, reconciliation candidates are evaluated independently. The process
does not update a manual external ID, merge rows, or adopt an NLR identity. Review the JSON report
and follow the UUID-preserving SQL procedure only after confirming the physical station manually.

## Database checks

Station total:

```sql
select count(*)
from public.stations;
```

Duplicate external IDs (must return no rows):

```sql
select external_id, count(*)
from public.stations
group by external_id
having count(*) > 1;
```

Public View total:

```sql
select count(*)
from public.public_station_status;
```

Visited total:

```sql
select count(*)
from public.public_station_status
where visited = true;
```

Station count by state:

```sql
select state, count(*)
from public.stations
group by state
order by state;
```

The table and View counts should match. The duplicate query should be empty.

## Switch the home page

After a successful import, set locally:

```dotenv
STATION_DATA_SOURCE=supabase
```

Restart Next.js. The page must show the Supabase data label and must not stop at 1,000 records.
The repository reads every imported row; the current home-page journey scope then excludes Alaska
and Hawaii to match its existing contiguous-US map bounds. Sample, live NLR, and Supabase records
are never merged.

## Manual red-to-blue test

Do not place real UUIDs in source control. In the Supabase SQL Editor:

1. Find one New Jersey station:

```sql
select id, external_id, name, city, state
from public.stations
where state = 'NJ'
order by external_id
limit 1;
```

2. Insert a public test Visit using obvious placeholders:

```sql
insert into public.station_visits (
  station_id,
  user_id,
  checked_in_at,
  checked_in_timezone,
  is_public
)
values (
  'STATION_UUID',
  'ADMIN_USER_UUID',
  now(),
  'America/New_York',
  true
)
returning id;
```

3. Confirm the View changed:

```sql
select id, external_id, state, visited, latest_visit_at
from public.public_station_status
where id = 'STATION_UUID';
```

4. Refresh the home page. Confirm the NJ point changes from red to blue, the national visited count
   increases by one, and NJ statistics update.
5. Delete only the development test Visit:

```sql
delete from public.station_visits
where id = 'TEST_VISIT_UUID';
```

6. Re-run the View query and refresh. The point should return to red if no other public Visit exists.

## Common errors

- **Missing NLR_API_KEY:** add the server-only NLR key to `.env.local`.
- **Missing SUPABASE_SECRET_KEY:** add a current Supabase secret key; do not use the publishable key
  for synchronization.
- **Unauthorized upsert:** verify the script is using the secret key for the linked project.
- **429/502/503/504:** the script retries a batch with exponential backoff, then exits nonzero.
- **Only 1,000 stations shown:** verify the Supabase repository pagination remains enabled and the
  query is ordered by `external_id`.
- **Empty page state:** run a Dry Run, review counts, then explicitly run the Apply command.
- **Point remains red:** confirm the Visit is public, references the displayed station UUID, and is
  visible in `public_station_status`.
