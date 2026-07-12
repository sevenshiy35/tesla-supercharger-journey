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
