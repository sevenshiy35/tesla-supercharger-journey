begin;

create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = pg_catalog
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_updated_at() from public;

create table public.app_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.app_admins
    where user_id = (select auth.uid())
  );
$$;

revoke all on function public.is_app_admin() from public;
grant execute on function public.is_app_admin() to authenticated;

create table public.stations (
  id uuid primary key default gen_random_uuid(),
  external_id text not null unique,
  name text not null,
  address text not null,
  city text not null,
  state text not null,
  postal_code text,
  country text not null default 'US',
  latitude double precision not null,
  longitude double precision not null,
  stall_count integer,
  max_power_kw integer,
  operational_status text not null default 'open',
  source text not null default 'nlr',
  source_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint stations_latitude_check check (latitude between -90 and 90),
  constraint stations_longitude_check check (longitude between -180 and 180),
  constraint stations_stall_count_check check (stall_count is null or stall_count >= 0),
  constraint stations_max_power_kw_check check (max_power_kw is null or max_power_kw >= 0),
  constraint stations_state_check check (state ~ '^[A-Z]{2}$'),
  constraint stations_country_check check (country ~ '^[A-Z]{2}$')
);

create index stations_state_idx on public.stations (state);
-- The external_id unique constraint creates its required unique B-tree index.
create index stations_operational_status_idx on public.stations (operational_status);
create index stations_source_updated_at_idx on public.stations (source_updated_at);
create index stations_coordinates_idx on public.stations (latitude, longitude);

create trigger stations_set_updated_at
before update on public.stations
for each row execute function public.set_updated_at();

create table public.station_visits (
  id uuid primary key default gen_random_uuid(),
  station_id uuid not null references public.stations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  checked_in_at timestamptz not null,
  completed_at timestamptz,
  recorded_latitude double precision,
  recorded_longitude double precision,
  distance_from_station_meters numeric,
  arrival_battery_percent integer,
  departure_battery_percent integer,
  odometer_miles numeric,
  notes text,
  is_public boolean not null default true,
  verification_status text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint station_visits_completed_at_check
    check (completed_at is null or completed_at >= checked_in_at),
  constraint station_visits_recorded_latitude_check
    check (recorded_latitude is null or recorded_latitude between -90 and 90),
  constraint station_visits_recorded_longitude_check
    check (recorded_longitude is null or recorded_longitude between -180 and 180),
  constraint station_visits_distance_check
    check (distance_from_station_meters is null or distance_from_station_meters >= 0),
  constraint station_visits_arrival_battery_check
    check (arrival_battery_percent is null or arrival_battery_percent between 0 and 100),
  constraint station_visits_departure_battery_check
    check (departure_battery_percent is null or departure_battery_percent between 0 and 100),
  constraint station_visits_odometer_check
    check (odometer_miles is null or odometer_miles >= 0),
  constraint station_visits_verification_status_check
    check (verification_status in ('manual', 'gps_verified', 'tesla_verified', 'needs_review'))
);

create index station_visits_station_id_idx on public.station_visits (station_id);
create index station_visits_user_id_idx on public.station_visits (user_id);
create index station_visits_checked_in_at_idx on public.station_visits (checked_in_at desc);
create index station_visits_is_public_idx on public.station_visits (is_public);
create index station_visits_station_public_idx on public.station_visits (station_id, is_public);

create trigger station_visits_set_updated_at
before update on public.station_visits
for each row execute function public.set_updated_at();

create table public.charging_sessions (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null unique references public.station_visits(id) on delete cascade,
  started_at timestamptz,
  ended_at timestamptz,
  energy_kwh numeric,
  cost_usd numeric,
  charging_minutes integer,
  price_per_kwh numeric,
  currency text not null default 'USD',
  data_source text not null default 'manual',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint charging_sessions_time_check
    check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint charging_sessions_energy_check check (energy_kwh is null or energy_kwh >= 0),
  constraint charging_sessions_cost_check check (cost_usd is null or cost_usd >= 0),
  constraint charging_sessions_minutes_check
    check (charging_minutes is null or charging_minutes >= 0),
  constraint charging_sessions_price_check check (price_per_kwh is null or price_per_kwh >= 0),
  constraint charging_sessions_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint charging_sessions_data_source_check
    check (data_source in ('manual', 'tesla_api', 'ocr', 'import'))
);

create trigger charging_sessions_set_updated_at
before update on public.charging_sessions
for each row execute function public.set_updated_at();

create table public.visit_photos (
  id uuid primary key default gen_random_uuid(),
  visit_id uuid not null references public.station_visits(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  bucket_name text not null,
  storage_path text not null,
  photo_type text not null default 'site',
  caption text,
  is_public boolean not null default true,
  taken_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visit_photos_storage_path_key unique (bucket_name, storage_path),
  constraint visit_photos_photo_type_check
    check (photo_type in ('site', 'vehicle', 'charger', 'tesla_screen', 'receipt', 'environment', 'other'))
);

create trigger visit_photos_set_updated_at
before update on public.visit_photos
for each row execute function public.set_updated_at();

alter table public.app_admins enable row level security;
alter table public.stations enable row level security;
alter table public.station_visits enable row level security;
alter table public.charging_sessions enable row level security;
alter table public.visit_photos enable row level security;

create policy "app_admins_select_own"
on public.app_admins
for select
to authenticated
using (user_id = (select auth.uid()));

create policy "stations_select_public"
on public.stations
for select
to anon, authenticated
using (true);

create policy "stations_insert_admin"
on public.stations
for insert
to authenticated
with check ((select public.is_app_admin()));

create policy "stations_update_admin"
on public.stations
for update
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

create policy "stations_delete_admin"
on public.stations
for delete
to authenticated
using ((select public.is_app_admin()));

create policy "station_visits_select_public"
on public.station_visits
for select
to anon, authenticated
using (is_public = true);

create policy "station_visits_select_admin"
on public.station_visits
for select
to authenticated
using ((select public.is_app_admin()));

create policy "station_visits_insert_admin"
on public.station_visits
for insert
to authenticated
with check ((select public.is_app_admin()));

create policy "station_visits_update_admin"
on public.station_visits
for update
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

create policy "station_visits_delete_admin"
on public.station_visits
for delete
to authenticated
using ((select public.is_app_admin()));

create policy "charging_sessions_select_public"
on public.charging_sessions
for select
to anon, authenticated
using (
  exists (
    select 1
    from public.station_visits
    where station_visits.id = charging_sessions.visit_id
      and station_visits.is_public = true
  )
);

create policy "charging_sessions_select_admin"
on public.charging_sessions
for select
to authenticated
using ((select public.is_app_admin()));

create policy "charging_sessions_insert_admin"
on public.charging_sessions
for insert
to authenticated
with check ((select public.is_app_admin()));

create policy "charging_sessions_update_admin"
on public.charging_sessions
for update
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

create policy "charging_sessions_delete_admin"
on public.charging_sessions
for delete
to authenticated
using ((select public.is_app_admin()));

create policy "visit_photos_select_public"
on public.visit_photos
for select
to anon, authenticated
using (
  is_public = true
  and exists (
    select 1
    from public.station_visits
    where station_visits.id = visit_photos.visit_id
      and station_visits.is_public = true
  )
);

create policy "visit_photos_select_admin"
on public.visit_photos
for select
to authenticated
using ((select public.is_app_admin()));

create policy "visit_photos_insert_admin"
on public.visit_photos
for insert
to authenticated
with check ((select public.is_app_admin()));

create policy "visit_photos_update_admin"
on public.visit_photos
for update
to authenticated
using ((select public.is_app_admin()))
with check ((select public.is_app_admin()));

create policy "visit_photos_delete_admin"
on public.visit_photos
for delete
to authenticated
using ((select public.is_app_admin()));

create view public.public_station_status
with (security_invoker = true)
as
select
  stations.id,
  stations.external_id,
  stations.name,
  stations.address,
  stations.city,
  stations.state,
  stations.postal_code,
  stations.latitude,
  stations.longitude,
  stations.stall_count,
  stations.max_power_kw,
  stations.operational_status,
  stations.source_updated_at,
  exists (
    select 1
    from public.station_visits
    where station_visits.station_id = stations.id
      and station_visits.is_public = true
  ) as visited,
  (
    select max(station_visits.checked_in_at)
    from public.station_visits
    where station_visits.station_id = stations.id
      and station_visits.is_public = true
  ) as latest_visit_at
from public.stations;

revoke all on table public.app_admins from anon, authenticated;
revoke all on table public.stations from anon, authenticated;
revoke all on table public.station_visits from anon, authenticated;
revoke all on table public.charging_sessions from anon, authenticated;
revoke all on table public.visit_photos from anon, authenticated;
revoke all on table public.public_station_status from anon, authenticated;

grant usage on schema public to anon, authenticated;

grant select on table public.stations to anon, authenticated;
grant select on table public.station_visits to anon, authenticated;
grant select on table public.charging_sessions to anon, authenticated;
grant select on table public.visit_photos to anon, authenticated;
grant select on table public.app_admins to authenticated;

grant insert, update, delete on table public.stations to authenticated;
grant insert, update, delete on table public.station_visits to authenticated;
grant insert, update, delete on table public.charging_sessions to authenticated;
grant insert, update, delete on table public.visit_photos to authenticated;

grant select on table public.public_station_status to anon, authenticated;

commit;
