# Phase 2B: NLR station synchronization and Supabase public reads

## Current data flow

The home page selects one `StationsRepository` from `STATION_DATA_SOURCE`. Before Phase 2B, sample
and NLR repositories were available, and NLR mode fetched the live NLR response through the Next.js
cache. Supabase contained the journey schema but the `stations` table was empty.

## Target production data flow

```text
NLR API
  → controlled sync script
  → manual-station duplicate preflight
  → public.stations
  → public.public_station_status
  → SupabasePublicStationsRepository
  → SuperchargerStation domain model
  → existing home page, statistics, and Mapbox layers
```

Visit status flows independently:

```text
public station_visits insert
  → public_station_status.visited/latest_visit_at
  → domain status visited/unvisited
  → existing blue/red Mapbox layers and journey statistics
```

Production does not need the NLR API on a page request. The NLR repository remains available for
manual source comparison, debugging, and incident investigation; it is not an automatic fallback.

## Shared NLR source

`src/lib/stations/nlr-source.ts` owns the request to
`https://developer.nlr.gov/api/alt-fuel-stations/v1.json` and its fixed Tesla/public/open filters.
It validates the response envelope and individual records, then calls the existing NLR Mapper.
Both the cached NLR repository and `scripts/sync-nlr-stations.ts` use this source, so field mapping,
coordinate rejection, external ID handling, and physical-station deduplication are not duplicated.

Only normalized data is retained. Up to ten concise validation examples may be logged; the large raw
response and API key are never logged or written to disk.

## Idempotent synchronization

The script maps Domain stations to the existing `stations` columns and validates every write row.
It never submits database-owned `id`, `created_at`, or `updated_at` values. Writes use:

```text
upsert(..., onConflict: external_id)
```

Existing IDs are read first in stable, 1,000-row pages. That set produces exact New and Updated
counts. Re-running the same source updates matching rows without creating a second `external_id` or
changing `stations.id`, so foreign-key links from `station_visits` remain intact.

Rows missing from the current NLR response are counted but never deleted, disabled, or overwritten.
There is no truncate, replacement-table, or historical cleanup path.

Before a new NLR external ID is inserted, the script compares it with manual-source Supabase rows.
Same-state, same-address candidates within 250 m, or same-state/city/house/street candidates within
500 m, are reported and skipped. A clearly identical address up to 1,600 m is a lower-confidence
blocked candidate; distance-only nearby rows are warnings and continue. The preflight never merges,
updates, or changes either identity. A secret-free report is written under `artifacts/`.

Receipt-confirmed stations that NLR does not yet list are maintained by the separate, default-Dry
Run `scripts/sync-manual-stations.ts`. It uses temporary `manual:tesla:*` IDs and the same
`external_id` upsert invariant, so database-owned UUIDs remain stable. Evidence notes are held only
in script-side definitions and never reach the public Domain model.

Default execution is a Dry Run. Only `--apply` enables writes. Apply mode sends sequential batches
of 300 rows by default (maximum configurable batch size 500). Transient network failures and HTTP
429/502/503/504 results receive at most three attempts with exponential backoff. A permanently
failed batch reports its range and terminates with a nonzero status.

## Supabase pagination and public mapping

`SupabasePublicStationsRepository` reads only `public_station_status` with the publishable key and
explicitly requests its public columns. Pages are ordered by `external_id`, fetched with inclusive
`range()` windows of 1,000 rows, and stop when the returned page is shorter than 1,000. A ten-page
safety limit prevents infinite loops. Duplicate view IDs and invalid/null required values fail with
a controlled validation error instead of reaching the map.

`mapPublicStationStatusRowToStation()` is the snake_case-to-Domain boundary. `visited` maps directly
to `status`, while `latest_visit_at` maps to `visitDate`. No user ID, notes, recorded GPS, private
visit, or storage path is requested or added to the public Domain model.

Latest check-ins explicitly query public `station_visits`, station identity fields, and optional
charging energy/cost. RLS remains the final boundary, and the query does not request user IDs,
notes, or recorded coordinates. Missing photos use the existing placeholder visual.

## Home page source switching

`STATION_DATA_SOURCE` accepts exactly `sample`, `nlr`, or `supabase`:

- `sample` selects only the mock repository and sample visits.
- `nlr` selects only the cached live NLR repository and its explicit local visited-ID adapter.
- `supabase` selects only `SupabasePublicStationsRepository`; visit state comes exclusively from
  `public_station_status`.

There is no cross-source merge or automatic fallback. Supabase mode displays a Supabase source
label, reads the complete paginated directory before the existing contiguous-US journey scope is
applied, and shows controlled states for missing configuration, failed requests, or an empty
imported directory. The current map deliberately excludes Alaska and Hawaii; expanding that visual
scope requires a later map/bounds design change.

## Security boundary

- Browser-safe URL and publishable key are used for public page reads.
- `NLR_API_KEY` is loaded only by the Node synchronization process. Dry Run uses the publishable
  key for its read-only existing-ID query; Apply mode additionally requires `SUPABASE_SECRET_KEY`.
- The Admin client is under `scripts/`, has no user session/cookies, and is never imported by the
  page repository.
- Dry Run still queries existing IDs but performs no insert, update, delete, or upsert.
- Keys, raw NLR arrays, private visit fields, and real user UUIDs are never logged or committed.

## Testing

Run `npm run test`. The local suite uses fixtures and mocked page readers/writers; it does not need a
production database. It covers mapping, duplicate and coordinate rejection, Dry Run behavior,
repeat synchronization, red/blue status mapping, multi-page reads, termination, source isolation,
privacy, summary counting, empty-directory behavior, manual definitions and aliases, address
normalization, UUID-preserving idempotence, and NLR reconciliation without automatic merging.

Operational verification and SQL checks are in `SUPABASE-STATION-SYNC.md`.
Manual station evidence and future NLR identity adoption are in `MANUAL-STATIONS.md`.

## Next phase

After a reviewed `--apply` import and manual red-to-blue verification, a later phase may add login,
admin check-in UI, photo Storage, and receipt OCR. Phase 2B does not add a scheduler; future recurring
sync should call this same idempotent core from a controlled server job with equivalent secrets and
observability.
