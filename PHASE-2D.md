# Phase 2D: administrator login and mobile check-in

## Scope and architecture

Phase 2D adds the authenticated administrator surface without changing the public home-page or
Mapbox design:

```text
iPhone / browser
  → Next.js src/proxy.ts refreshes Supabase Auth cookies
  → protected Admin layout calls requireAdmin()
  → Supabase Auth getUser() validates the cookie-backed user
  → app_admins confirms the user UUID is allowlisted
  → Server Component reads or Server Action
  → authenticated Supabase client + RLS / security-definer RPC
  → station_visits
  → public_station_status recalculates public visited state
  → dynamic public home page renders the new blue/red status
```

The runtime uses only `NEXT_PUBLIC_SUPABASE_URL` and
`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`. `SUPABASE_SECRET_KEY` remains limited to the existing
station-sync, manual-station, Receipt-import, and maintenance scripts. No Phase 2D page, component,
Server Action, or Auth helper imports it.

## Login and session flow

`/admin/login` supports email and password only. It has accessible labels, password show/hide,
loading and error states, and redirects a verified administrator to `/admin`. There is no public
registration, invitation, or Auth-user creation flow.

Login is a Server Action. After `signInWithPassword`, the server calls `auth.getUser()` and queries
only the signed-in user's allowed `app_admins` row. A user with a valid Auth Session but no
`app_admins` membership is signed out by the login action and receives a generic authorization
error. Direct access with such a Session is redirected to the login page with an explicit
allowlist notice. Passwords and Auth tokens are never logged or returned to the UI.

A follow-up recovery flow is available at `/admin/forgot-password`. It calls
`resetPasswordForEmail` with an explicit `/auth/callback` redirect. The callback exchanges the PKCE
code for a Cookie Session and sends the administrator to `/admin/reset-password`. Password update
revalidates both `getUser()` and `app_admins`, calls `updateUser({ password })`, and globally signs
out Sessions before the user signs in again. Responses never reveal whether an email is registered.

`src/proxy.ts` matches `/admin/:path*` and performs only cookie Session refresh. It does not decide
authorization. `src/app/admin/(protected)/layout.tsx` calls the shared `requireAdmin()` helper for
all protected pages. Every mutation Server Action calls `requireAdmin()` again, and every database
management RPC independently verifies `auth.uid()` and `app_admins`.

## Administrator setup

1. In **Supabase Dashboard → Authentication → Users**, create the email/password user.
2. Copy its UUID without placing it in source control.
3. In Supabase SQL Editor, register it:

   ```sql
   insert into public.app_admins (user_id)
   values ('REPLACE_WITH_AUTH_USER_UUID');
   ```

4. Open `/admin/login` and sign in. See `ADMIN-SETUP.md` for the existing allowlist procedure.

There is no `active` or `status` field in the current `app_admins` table; membership itself is the
authority.

## Mobile check-in flow

`/admin/check-in` is mobile-first:

1. Choose **Nearby** or **Search**.
2. Nearby requests browser location only after **Use My Location** is tapped. Search begins after
   two characters and debounces for 350 ms.
3. Tap a result. Nearby never selects the first result automatically.
4. Review address, visited status, previous Visit count, last Visit, and optional distance.
5. Optionally clear GPS, add up to 2,000 plain-text characters, and choose Public or Private.
6. Tap **Check In Now**.

The form creates one `crypto.randomUUID()` request ID and retains it across failed submissions and
network retries. A new ID is generated only for **Check In Another Station**. The browser resolves
its IANA timezone with `Intl.DateTimeFormat().resolvedOptions().timeZone`; an absent or invalid
timezone blocks submission with a retryable error.

The create RPC ignores any concept of client time or client user identity because neither is in
its signature. PostgreSQL writes `checked_in_at = now()`, `checked_in_time_precision = 'exact'`,
and `user_id = auth.uid()`.

## Station search and Nearby

Search runs only in a protected Server Action using the authenticated Session. Name, address, city,
state, and postal code use separate parameterized Supabase Query Builder `ilike` calls, merged and
ranked on the server. Exact city/state/ZIP, exact or prefix name, name containment, city prefix, and
address relevance determine order. At most 25 records reach the browser.

Nearby validates coordinates, then queries latitude/longitude Bounding Boxes at 35, 100, and at
most 250 miles until enough candidates are available. It never downloads the full station table.
TypeScript calculates Haversine miles, removes candidates outside the circular radius, sorts
ascending, and returns at most 15. No PostGIS extension is required.

## GPS privacy

GPS is optional. The app never prompts on page load. A successful user-initiated Geolocation call
keeps the phone latitude/longitude only in React memory and submits them directly to the Server
Action. The coordinates never enter a URL, log, query string, or localStorage. **Clear GPS** sends
both values as null. Station coordinates are never copied into recorded GPS.

There is no geofence in this phase. Distance may be shown, but a far-away location does not block
check-in. The public `public_station_status` View contains neither recorded coordinates nor notes.
Coordinates are visible only on the protected Visit detail page under the current RLS model.

## Time display

All Visit UI reuses `formatCheckInDisplayDate`:

- `exact`: format the stored instant in `checked_in_timezone` with local date and clock time;
- `date_only`: format only the local calendar date and never show the historical local-noon anchor.

New mobile Visits are always exact. The 75 historical Receipt Visits remain date-only.

## Dashboard and Visit management

`/admin` shows visited stations, total/public/private Visits, 2026 Visits, the five latest records,
and shortcuts for check-in, Visit history, and the public map. It loads only counts and five rows.

`/admin/visits` is newest-first with 24 records per page. URL search params preserve station/city
search, Public/Private, Exact/Date-only, state, and page. The mobile layout uses cards and exposes
local Visit display time, visibility, GPS presence, energy, and cost without user/station UUIDs or
Receipt fingerprints.

`/admin/visits/[id]` shows station address, local Visit date/time rule, precision, timezone,
visibility, administrator-only GPS, notes, and optional charging energy/cost/duration/unit price.
A Charging Session is presented as a Receipt-backed charging record; a Visit without one is a
mobile check-in. Only notes and visibility are editable.

Deletion uses a custom second-confirmation dialog. The delete RPC locks the Visit, refuses deletion
when any `visit_photos` row exists, explicitly deletes `charging_sessions`, and then deletes the
Visit. It never deletes `stations`. Phase 3A must extend this flow to remove Storage objects before
allowing deletion of photo-backed Visits.

## Database Migration and RPC security

Pending Migration:

```text
supabase/migrations/20260713180000_admin_visit_management.sql
```

It creates:

- `admin_create_station_visit`: validates administrator, station, IANA timezone, GPS ranges/pair,
  notes length and visibility; uses Auth identity and database `now()`; returns safe Visit fields.
- `admin_update_station_visit`: validates administrator and allows only `notes` and `is_public`.
- `admin_delete_station_visit`: validates administrator, blocks photo-backed deletion, deletes the
  Charging Session before the Visit, and returns the deleted IDs.

All three are `security definer` with `set search_path = public`. Execute is revoked from `public`
and `anon` and granted to `authenticated`. A non-admin authenticated user is still rejected inside
each function. No new table-wide grant or broad DELETE authority is added.

Create idempotence is based only on `p_visit_id`. An existing ID for the current Auth user and same
station returns the original row and original server timestamp. A different user or station raises
a conflict. Separate UUIDs can create legitimate repeat Visits at the same station.

`public_station_status` already uses only `is_public = true`, so no View replacement is required.
Changing a Visit to Private or deleting its only public Visit returns that station to red; another
remaining public Visit keeps it blue.

## Cache and refresh behavior

Create, update, and delete actions revalidate `/`, `/admin`, `/admin/check-in`, `/admin/visits`, and
the affected detail path. The public home page is already dynamic. No global caching policy was
disabled.

## Local verification

The local automated Phase 2D suite covers 49 requested behaviors through pure-function and source /
Migration security tests. Run all project checks:

```bash
npm run lint
npm run typecheck
npm run test
npm run build
```

Review the linked database plan without applying it:

```bash
npx supabase db push --dry-run
```

After review and only when ready, manually apply and regenerate authoritative types:

```bash
npx supabase db push
npm run supabase:types
```

This implementation does not run the Apply command, station synchronization, manual-station
synchronization, Receipt import, or a Vercel deployment.

## First phone test after applying the Migration

1. Start the app on an HTTPS address reachable from the phone; iPhone Geolocation normally requires
   a secure context. A reviewed preview deployment is suitable.
2. Visit `/admin/login` and sign in with the allowlisted email/password user.
3. Open **Check In**, tap **Use My Location**, and permit location. If permission is denied, confirm
   Search still works.
4. Search or choose a nearby Supercharger and tap it; do not rely on automatic selection.
5. Add a short test note, leave Public on, and tap **Check In Now** once. If the network fails, retry
   without reloading so the same request UUID is reused.
6. Open **View Visit**. Confirm exact local time, timezone, note, Public badge, and GPS status.
7. Open the public map and confirm the station is blue and Latest Check-ins/statistics refresh.
8. Toggle the Visit Private and confirm it no longer affects public status when it is the only
   public Visit at that station; toggle it back if desired.
9. Use the custom delete dialog to remove the test Visit. Confirm its Charging Session (if any) is
   removed, the station remains, and the public map reflects any remaining public Visits.

## Deferred work

Photos, Supabase Storage, EXIF, OCR, Receipt editing, manual Charging Session editing, route
planning, Vlog pages, social accounts, invitations, and registration remain out of scope. Phase 3A
should add photo upload plus transactional database/Storage deletion cleanup.
