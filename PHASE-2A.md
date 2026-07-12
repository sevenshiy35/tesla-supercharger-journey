# Phase 2A: Supabase foundation

## Current architecture

The application is a Next.js 16 App Router project. The public home page is a Server Component and
uses `StationsRepository` to select either the existing sample repository or the server-only NLR
repository. Map rendering stays in Client Components. Phase 2A does not replace either repository,
change the home page, or import live NLR data.

Supabase support is isolated into:

- `src/lib/env/supabase.ts`: public Supabase environment validation without logging values.
- `src/lib/supabase/client.ts`: browser client factory for Client Components.
- `src/lib/supabase/server.ts`: cookie-aware server client factory for Server Components, Server
  Actions, and Route Handlers.
- `src/types/database.ts`: generated from the linked cloud schema; regenerate it after every
  applied migration rather than editing it by hand.
- `supabase/migrations/20260711_initial_journey_schema.sql`: the initial database schema, RLS,
  grants, and public map view.
- `supabase/migrations/20260712090000_simplify_station_visits.sql`: the follow-up migration that reduces
  visits to simple check-ins.
- `supabase/migrations/20260712120000_simplify_charging_sessions.sql`: the follow-up migration that
  reduces charging sessions to standardized values extracted from Tesla receipt photos.

There is intentionally no auth proxy yet because this phase has no sign-in flow.

## Database structure

The migration creates five tables in `public`:

| Table | Purpose |
| --- | --- |
| `app_admins` | Allowlist of authenticated users who may manage journey data. |
| `stations` | Imported station directory keyed by unique `external_id`. |
| `station_visits` | Repeatable, simple check-ins; public/private state and optional recorded coordinates belong here. |
| `charging_sessions` | Optional one-to-one standardized charging result extracted from a Tesla receipt. |
| `visit_photos` | Photo metadata for a visit; no Storage bucket is created. |

The migration also creates `public.set_updated_at()` and attaches it to the four tables containing
an `updated_at` column. The trigger function has a fixed `pg_catalog` search path. The
`public.is_app_admin()` security-definer function checks only `auth.uid()`, accepts no user input,
and has a fixed `public` search path.

## Relationships

```text
auth.users 1 ── 0..1 app_admins
auth.users 1 ── * station_visits * ── 1 stations
auth.users 1 ── * visit_photos   * ── 1 station_visits
station_visits 1 ── 0..1 charging_sessions
```

- Deleting an auth user cascades to that user's admin row, visits, and photo metadata.
- A station with visits cannot be deleted because `station_visits.station_id` uses `on delete
  restrict`.
- Deleting a visit cascades to its charging session and photo metadata.
- A station may have multiple visits. `stations` deliberately has no `visited` column.

### Simplified check-ins

After `20260712090000_simplify_station_visits.sql` is applied, `station_visits` contains only `id`,
`station_id`, `user_id`, `checked_in_at`, `checked_in_timezone`, `recorded_latitude`,
`recorded_longitude`, `notes`, `is_public`, `created_at`, and `updated_at`.

`checked_in_at` is an absolute `timestamptz` instant and defaults to the database server's `now()`.
`checked_in_timezone` stores the IANA zone used to present that instant locally, for example
`America/New_York`, and defaults to `UTC` when the caller does not yet know the local zone. The
schema does not duplicate local wall-clock time in a timestamp without time zone.

Completion time, distance, battery percentages, odometer, and verification state are no longer
visit responsibilities. Charging energy and cost remain in `charging_sessions`; photos remain in
`visit_photos`.

### Simplified charging sessions

After `20260712120000_simplify_charging_sessions.sql` is applied, `charging_sessions` contains only
`id`, `visit_id`, `started_at`, `energy_kwh`, `cost_usd`, `charging_minutes`, `price_per_kwh`,
`created_at`, and `updated_at`.

`visit_id` remains unique and continues to reference `station_visits(id)` with `on delete cascade`,
so a visit has at most one charging session. The nonnegative checks on energy, cost, charging
minutes, and unit price remain in place, as does the `updated_at` trigger. `ended_at`, `currency`,
and `data_source` are removed; the table does not store OCR workflow state or source metadata.

Future Tesla receipt images belong in `visit_photos` with `photo_type = 'receipt'`. The future OCR
workflow reads that image and creates or updates the single normalized `charging_sessions` row.

## RLS permission model

RLS is enabled on all five tables. SQL grants make objects reachable by the Data API; RLS still
decides which rows and operations succeed.

| Role | Read | Write |
| --- | --- | --- |
| `anon` | Stations, public visits, sessions belonging to public visits, public photos belonging to public visits, and `public_station_status`. | None. |
| Ordinary `authenticated` | The same public journey data plus only its own `app_admins` row. | None. |
| Admin `authenticated` | All rows in journey tables; still only its own `app_admins` row through the client. | Insert/update/delete stations, visits, sessions, and photo metadata. Cannot mutate `app_admins` through the client. |

All admin policies call `public.is_app_admin()`. Possessing a publishable key never makes a request
an administrator.

`public.public_station_status` uses `security_invoker = true`. It returns one row per station and
derives `visited` and `latest_visit_at` only from public visits visible through base-table RLS. It
does not expose account IDs, notes, recorded GPS coordinates, private visits, photos, or internal
photo metadata.

## Applying the migration

Migrations created locally are not automatically applied to the cloud project. The initial
`20260711` migration is the deployed baseline; the visit and charging-session follow-ups remain
pending until they are explicitly pushed.

1. Authenticate the CLI without putting credentials in source code: `npx supabase login`.
2. Link the local directory: `npm run supabase:link -- --project-ref YOUR_PROJECT_REF`.
3. Review pending migrations: `npx supabase migration list --linked`.
4. Preview the database push: `npx supabase db push --dry-run`.
5. Apply pending migrations: `npm run supabase:push`.
6. Generate linked database types: `npm run supabase:types`.
7. Create the first administrator by following `ADMIN-SETUP.md`.
8. Execute every check in `SECURITY-CHECKLIST.md` before using production data.

Do not provide a database password in chat or commit it. The CLI prompts or supported environment
mechanisms should handle credentials locally.

## Preparing for the next phase

The unique `stations.external_id`, source metadata, coordinate validation, directory indexes, and
admin-only write policies provide the target for the future 3,025-station import. The next phase
should:

1. Link and apply this migration to the intended cloud project.
2. Generate authoritative TypeScript database types.
3. Build a validated, idempotent NLR import that upserts on `external_id` and records
   `source_updated_at`.
4. Verify imported counts, rejected rows, coordinate bounds, and state/country normalization.
5. Switch the map repository only after parity and RLS checks pass.

Phase 2A does not import stations, switch the map data source, add login/admin/check-in UI, configure
Storage, add GPS, create routes, or add Tesla OAuth.
