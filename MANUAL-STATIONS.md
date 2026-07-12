# Manual Tesla stations

## Why this layer exists

NLR is the normal directory source, but a newly opened Supercharger can produce valid Tesla
charging receipts before it appears in NLR. A Tesla receipt is first-party evidence of an actual
charging transaction. For Piscataway, Tesla's public Find Us page independently confirms the
address, equipment, power, and availability. For Jersey City, 31 Tesla receipts at the same exact
address confirm operation, while the public Tesla location identity remains unverified.

Manual rows use an explicit `manual:tesla:*` namespace so they cannot be mistaken for NLR numeric
IDs. They are normal `public.stations` rows: Supabase generates the stable `stations.id` UUID, and
all future visits and charging records must reference that UUID.

## Reviewed definitions

| Station | Temporary `external_id` | Address | Coordinates | Source | Stalls / power |
|---|---|---|---|---|---|
| Piscataway, NJ - Centennial Avenue | `manual:tesla:piscataway-centennial-ave` | 88 Centennial Avenue, Piscataway, NJ 08854 | 40.539647, -74.501189 | `tesla_official` | 12 / 325 kW |
| Jersey City, NJ - Garfield Avenue | `manual:tesla:jersey-city-garfield-ave` | 2-36 Garfield Avenue, Jersey City, NJ 07305 | 40.685172, -74.099118 | `tesla_receipt_verified` | null / null |

Piscataway's address, 12 stalls, 325 kW maximum, and 24/7 operation come from the reviewed
[Tesla Find Us location 15015](https://www.tesla.com/findus/location/supercharger/15015). Its
coordinates are the exact rooftop result from the reviewed Mapbox permanent geocode because the
Tesla page does not publish coordinates.

Jersey City's address is repeated in 31 Tesla charging receipts. Its coordinates are the reviewed
Mapbox exact point result. Stall count and maximum power remain `null`: third-party claims do not
populate authoritative fields. The unconfirmed identifier `27400` is deliberately not used.
Detailed evidence is recorded in `UNMATCHED-STATION-AUDIT.md`; internal `evidenceNotes` stay in the
script-only definition and are never written into the public station model.

## Receipt aliases

Aliases are explicit, normalized, and map only to the temporary external IDs. They include:

- Piscataway: full 88 Centennial Avenue/Ave address variants, receipt-order `Centennial Avenue 88`,
  and `Wawa Piscataway`.
- Jersey City: `2-36` and Unicode-dash Garfield Avenue/Ave variants, receipt-order
  `Garfield Ave 2-36`, and `Twin City Shopping Center`.

`Piscataway` and `Jersey City` alone are not aliases. Future receipt import should try stable ID,
explicit alias, exact normalized full address, address-plus-coordinate candidates, then manual
review. It must never choose a station from city, fuzzy name, nearest distance, or receipt count
alone.

## Synchronization

Preview the two definitions with read-only credentials:

```bash
npm run sync:manual-stations
npm run sync:manual-stations:dry
```

Only this explicit command writes with `SUPABASE_SECRET_KEY`:

```bash
npm run sync:manual-stations:apply
```

The upsert conflict key is `external_id`. The payload omits `id`, `created_at`, and `updated_at`, so
the first Apply lets Supabase create a UUID and later Apply runs preserve it. The script never
deletes stations or changes visits.

Before and after Apply, record the UUIDs:

```sql
select id, external_id, source
from public.stations
where external_id in (
  'manual:tesla:piscataway-centennial-ave',
  'manual:tesla:jersey-city-garfield-ave'
)
order by external_id;
```

Running the query again after a second Apply must show the same two `id` values and no duplicate
`external_id`.

## NLR reconciliation and why it is not automatic

NLR sync compares each new NLR external ID with manual-source rows by state, city, normalized
address, house/street identity, and Haversine distance. A strong same-address candidate is skipped
and reported; a nearby different address is only a warning and continues to insert. This protects
against duplicate map points without merging distinct Superchargers in the same shopping center or
city.

The sync never changes a manual row's identity. Review
`artifacts/station-reconciliation-report.json`, verify Tesla/NLR evidence, and adopt an NLR ID only
after a human confirms both records are the same physical station.

## Adopting a confirmed NLR ID while preserving history

Do not insert a second station. In the Supabase SQL Editor, substitute reviewed values and update by
the existing UUID:

```sql
update public.stations
set
  external_id = 'NLR_EXTERNAL_ID',
  source = 'nlr',
  name = 'NLR_OR_CONFIRMED_NAME',
  address = 'CONFIRMED_ADDRESS',
  latitude = CONFIRMED_LATITUDE,
  longitude = CONFIRMED_LONGITUDE,
  stall_count = CONFIRMED_STALL_COUNT,
  max_power_kw = CONFIRMED_MAX_POWER,
  source_updated_at = 'CONFIRMED_SOURCE_TIME'
where id = 'EXISTING_STATION_UUID';
```

Run a `select id, external_id ... where id = 'EXISTING_STATION_UUID'` before and after. Because
`stations.id` does not change, `station_visits.station_id`, charging sessions reached through those
visits, visit photos, checked-in state, and the existing map point remain intact. This SQL is a
manual review procedure only; no project command executes it automatically.
