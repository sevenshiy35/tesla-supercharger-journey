# Tesla Receipt import operations

## Configuration

Keep all real values in ignored `.env.local`:

```dotenv
NEXT_PUBLIC_SUPABASE_URL=
SUPABASE_SECRET_KEY=
IMPORT_USER_ID=
```

`IMPORT_USER_ID` must be an `auth.users.id` UUID that also exists in `public.app_admins`. The script
never prints this UUID. Apply uses the server-only secret client; the publishable key never writes.

The default input is `~/Downloads/JAN_2026-JAN_2027.zip`. Override it when necessary:

```bash
npm run import:receipts:dry -- --input="C:/path/to/receipts.zip"
```

The input may be a ZIP, one PDF, or a directory containing PDFs. Source PDFs and the existing Excel
audit workbook are read-only.

## Date-only Receipt rule

The current 75 Tesla Invoices have event dates but no start clock times or durations. They import as
valid `date_only` history without manual time completion:

- `station_visits.checked_in_at`: local event date at noon, converted to UTC as an ordering anchor;
- `station_visits.checked_in_time_precision`: `date_only`;
- `charging_sessions.started_at`: `null`;
- `charging_sessions.charging_minutes`: `null`.

Noon is not the actual charging time and must never be displayed as one. It avoids common UTC
offsets moving the anchor onto a different date. PDF CreationDate and file timestamps are not used.

For future exact-time evidence, an optional ignored JSON file may supply reviewed times:

```json
[
  {
    "sourceReceiptId": "TESLA_INVOICE_NUMBER",
    "localStartedAt": "2026-04-29T15:00:00",
    "timezone": "America/New_York"
  }
]
```

`timezone` is optional; when omitted it is looked up from the matched station coordinate. An exact
override writes the real UTC value to both the Visit anchor and Session start with precision
`exact`.

## Migration and Dry Run

Review the pending database change first:

```bash
npx supabase db push --dry-run
```

After explicitly applying the Migration through the normal project process, run:

```bash
npm run import:receipts
npm run import:receipts:dry
```

Use `--limit=10` only for diagnostics. Dry Run parses all selected PDFs, resolves current station
UUIDs, validates the administrator, computes timezone/UTC/fingerprint/visitId, checks existing rows,
and writes ignored JSON/CSV reports. It never calls the write RPC.

Apply is intentionally separate:

```bash
npm run import:receipts:apply
```

Apply is blocked unless stations is nonempty, both manual IDs exist, the import user is an app
administrator, and invalid/unmatched/ambiguous/duplicate-conflict counts are all zero. Each valid
Receipt then makes one sequential atomic RPC call with limited retry only for transient transport
failures.

Date-only precision and missing duration are report metrics, not Apply blockers.

The production RPC uses the named `charging_sessions_visit_id_key` constraint for idempotent
Session upsert, avoiding ambiguity with its returned `visit_id` column.

## Reports

Every completed plan writes ignored files:

```text
artifacts/receipt-import-report.json
artifacts/receipt-import-report.csv
```

They contain only Receipt identity, charging location, normalized values, station IDs, event date,
precision, exact Session time or date anchor, fingerprint/visit ID, status, and concise errors.
They exclude secrets, access tokens,
the import user UUID, customer details, VIN, and full Receipt text.

## Safe reruns

The fixed UUID v5 namespace makes the same Tesla Invoice resolve to the same Visit ID. The RPC
updates matching rows while preserving `created_at`; `updated_at` may advance. A station/user/time
identity mismatch raises a conflict instead of silently overwriting it. Do not delete or truncate
rows to resolve a conflict—review the source and mapping.

## Post-import SQL verification

Total Visits and Charging Sessions:

```sql
select count(*) from public.station_visits;
select count(*) from public.charging_sessions;
```

Orphan Visits (expected none for this import):

```sql
select sv.id
from public.station_visits sv
left join public.charging_sessions cs on cs.visit_id = sv.id
where cs.id is null;
```

Possible duplicate timestamps:

```sql
select station_id, checked_in_at, count(*)
from public.station_visits
group by station_id, checked_in_at
having count(*) > 1;
```

Station totals:

```sql
select
  s.name,
  s.city,
  s.state,
  count(*) as visits,
  sum(cs.energy_kwh) as total_energy_kwh,
  sum(cs.cost_usd) as total_cost_usd
from public.station_visits sv
join public.stations s on s.id = sv.station_id
join public.charging_sessions cs on cs.visit_id = sv.id
group by s.id, s.name, s.city, s.state
order by visits desc;
```

Garfield Avenue and Piscataway:

```sql
select s.external_id, count(*) as visits
from public.station_visits sv
join public.stations s on s.id = sv.station_id
where s.external_id in (
  'manual:tesla:jersey-city-garfield-ave',
  'manual:tesla:piscataway-centennial-ave'
)
group by s.external_id;
```

Expected source counts are 31 Garfield and 1 Piscataway when all 75 valid date-only records import.

Visited station count:

```sql
select count(*)
from public.public_station_status
where visited = true;
```

After all 75 Receipts import successfully, this should reflect about 25 independent visited
stations, not 75. Latest Visit and map color derive from public Visits; no Mapbox layer change is
required.

When presenting Visit history, render local date and time only for `exact`. For `date_only`, render
the local date without any time component; local noon is sorting metadata only.
