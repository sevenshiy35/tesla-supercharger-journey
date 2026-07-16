begin;

create table public.trip_plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text,
  trip_type text not null,
  status text not null default 'draft',
  origin_label text,
  origin_latitude double precision,
  origin_longitude double precision,
  destination_label text,
  destination_latitude double precision,
  destination_longitude double precision,
  corridor_miles numeric not null default 25,
  max_extra_minutes integer not null default 120,
  max_extra_miles numeric,
  max_stops integer not null default 8,
  stop_duration_minutes integer not null default 10,
  route_provider text,
  algorithm_version text,
  base_distance_meters bigint,
  base_duration_seconds integer,
  planned_distance_meters bigint,
  planned_drive_seconds integer,
  planned_stop_seconds integer,
  extra_distance_meters bigint,
  extra_duration_seconds integer,
  route_calculated_at timestamptz,
  is_public boolean not null default false,
  show_on_homepage boolean not null default false,
  confirmed_at timestamptz,
  activated_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_plans_name_check
    check (
      name is null
      or (name = btrim(name) and char_length(name) between 1 and 120)
    ),
  constraint trip_plans_trip_type_check
    check (trip_type in ('one_way', 'round_trip')),
  constraint trip_plans_status_check
    check (status in ('draft', 'confirmed', 'active', 'completed', 'archived')),
  constraint trip_plans_non_draft_name_check
    check (status = 'draft' or name is not null),
  constraint trip_plans_origin_label_check
    check (
      origin_label is null
      or (origin_label = btrim(origin_label) and char_length(origin_label) between 1 and 200)
    ),
  constraint trip_plans_destination_label_check
    check (
      destination_label is null
      or (destination_label = btrim(destination_label) and char_length(destination_label) between 1 and 200)
    ),
  constraint trip_plans_origin_latitude_check
    check (origin_latitude is null or origin_latitude between -90 and 90),
  constraint trip_plans_origin_longitude_check
    check (origin_longitude is null or origin_longitude between -180 and 180),
  constraint trip_plans_destination_latitude_check
    check (destination_latitude is null or destination_latitude between -90 and 90),
  constraint trip_plans_destination_longitude_check
    check (destination_longitude is null or destination_longitude between -180 and 180),
  constraint trip_plans_corridor_miles_check check (corridor_miles > 0),
  constraint trip_plans_max_extra_minutes_check check (max_extra_minutes >= 0),
  constraint trip_plans_max_extra_miles_check
    check (max_extra_miles is null or max_extra_miles >= 0),
  constraint trip_plans_max_stops_check check (max_stops >= 0),
  constraint trip_plans_stop_duration_minutes_check check (stop_duration_minutes >= 0),
  constraint trip_plans_base_distance_meters_check
    check (base_distance_meters is null or base_distance_meters >= 0),
  constraint trip_plans_base_duration_seconds_check
    check (base_duration_seconds is null or base_duration_seconds >= 0),
  constraint trip_plans_planned_distance_meters_check
    check (planned_distance_meters is null or planned_distance_meters >= 0),
  constraint trip_plans_planned_drive_seconds_check
    check (planned_drive_seconds is null or planned_drive_seconds >= 0),
  constraint trip_plans_planned_stop_seconds_check
    check (planned_stop_seconds is null or planned_stop_seconds >= 0),
  constraint trip_plans_extra_distance_meters_check
    check (extra_distance_meters is null or extra_distance_meters >= 0),
  constraint trip_plans_extra_duration_seconds_check
    check (extra_duration_seconds is null or extra_duration_seconds >= 0),
  constraint trip_plans_homepage_status_check
    check (not show_on_homepage or status <> 'archived'),
  constraint trip_plans_confirmed_timestamp_check
    check (status <> 'confirmed' or confirmed_at is not null),
  constraint trip_plans_activated_timestamp_check
    check (status <> 'active' or activated_at is not null),
  constraint trip_plans_completed_timestamp_check
    check (status <> 'completed' or completed_at is not null)
);

create table public.trip_plan_stops (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete restrict,
  sequence integer not null,
  leg text not null default 'outbound',
  source text not null,
  is_locked boolean not null default false,
  status text not null default 'planned',
  estimated_arrival_at timestamptz,
  estimated_detour_seconds integer,
  estimated_detour_meters bigint,
  visit_id uuid references public.station_visits(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_plan_stops_sequence_check check (sequence >= 0),
  constraint trip_plan_stops_leg_check check (leg in ('outbound', 'return')),
  constraint trip_plan_stops_source_check check (source in ('algorithm', 'manual')),
  constraint trip_plan_stops_status_check check (status in ('planned', 'visited', 'skipped')),
  constraint trip_plan_stops_estimated_detour_seconds_check
    check (estimated_detour_seconds is null or estimated_detour_seconds >= 0),
  constraint trip_plan_stops_estimated_detour_meters_check
    check (estimated_detour_meters is null or estimated_detour_meters >= 0),
  constraint trip_plan_stops_trip_sequence_key unique (trip_plan_id, sequence),
  constraint trip_plan_stops_trip_station_key unique (trip_plan_id, station_id)
);

create table public.trip_plan_segments (
  id uuid primary key default gen_random_uuid(),
  trip_plan_id uuid not null references public.trip_plans(id) on delete cascade,
  segment_index integer not null,
  leg text not null,
  start_sequence integer,
  end_sequence integer,
  provider text not null default 'mapbox',
  distance_meters bigint not null,
  duration_seconds integer not null,
  geometry jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint trip_plan_segments_segment_index_check check (segment_index >= 0),
  constraint trip_plan_segments_leg_check check (leg in ('outbound', 'return')),
  constraint trip_plan_segments_start_sequence_check
    check (start_sequence is null or start_sequence >= 0),
  constraint trip_plan_segments_end_sequence_check
    check (end_sequence is null or end_sequence >= 0),
  constraint trip_plan_segments_distance_meters_check check (distance_meters >= 0),
  constraint trip_plan_segments_duration_seconds_check check (duration_seconds >= 0),
  constraint trip_plan_segments_geometry_object_check check (jsonb_typeof(geometry) = 'object'),
  constraint trip_plan_segments_trip_index_key unique (trip_plan_id, segment_index)
);

create index trip_plans_user_id_idx on public.trip_plans (user_id);
create index trip_plans_status_idx on public.trip_plans (status);
create index trip_plans_user_status_idx on public.trip_plans (user_id, status);
create index trip_plans_updated_at_idx on public.trip_plans (updated_at desc);
create unique index trip_plans_one_homepage_per_user_idx
  on public.trip_plans (user_id)
  where show_on_homepage = true;

create index trip_plan_stops_trip_plan_id_idx on public.trip_plan_stops (trip_plan_id);
create index trip_plan_stops_station_id_idx on public.trip_plan_stops (station_id);
create index trip_plan_stops_status_idx on public.trip_plan_stops (status);

create index trip_plan_segments_trip_plan_id_idx on public.trip_plan_segments (trip_plan_id);

create trigger trip_plans_set_updated_at
before update on public.trip_plans
for each row execute function public.set_updated_at();

create trigger trip_plan_stops_set_updated_at
before update on public.trip_plan_stops
for each row execute function public.set_updated_at();

create trigger trip_plan_segments_set_updated_at
before update on public.trip_plan_segments
for each row execute function public.set_updated_at();

alter table public.trip_plans enable row level security;
alter table public.trip_plan_stops enable row level security;
alter table public.trip_plan_segments enable row level security;

create policy "trip_plans_select_admin_own"
on public.trip_plans
for select
to authenticated
using (
  user_id = (select auth.uid())
  and (select public.is_app_admin())
);

create policy "trip_plans_insert_admin_own"
on public.trip_plans
for insert
to authenticated
with check (
  user_id = (select auth.uid())
  and (select public.is_app_admin())
);

create policy "trip_plans_update_admin_own"
on public.trip_plans
for update
to authenticated
using (
  user_id = (select auth.uid())
  and (select public.is_app_admin())
)
with check (
  user_id = (select auth.uid())
  and (select public.is_app_admin())
);

create policy "trip_plans_delete_admin_own_draft"
on public.trip_plans
for delete
to authenticated
using (
  user_id = (select auth.uid())
  and status = 'draft'
  and (select public.is_app_admin())
);

create policy "trip_plan_stops_select_admin_own"
on public.trip_plan_stops
for select
to authenticated
using (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_stops.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_plan_stops_insert_admin_own"
on public.trip_plan_stops
for insert
to authenticated
with check (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_stops.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_plan_stops_update_admin_own"
on public.trip_plan_stops
for update
to authenticated
using (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_stops.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
)
with check (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_stops.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_plan_stops_delete_admin_own"
on public.trip_plan_stops
for delete
to authenticated
using (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_stops.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_plan_segments_select_admin_own"
on public.trip_plan_segments
for select
to authenticated
using (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_segments.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_plan_segments_insert_admin_own"
on public.trip_plan_segments
for insert
to authenticated
with check (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_segments.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_plan_segments_update_admin_own"
on public.trip_plan_segments
for update
to authenticated
using (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_segments.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
)
with check (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_segments.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

create policy "trip_plan_segments_delete_admin_own"
on public.trip_plan_segments
for delete
to authenticated
using (
  (select public.is_app_admin())
  and exists (
    select 1
    from public.trip_plans as tp
    where tp.id = trip_plan_segments.trip_plan_id
      and tp.user_id = (select auth.uid())
  )
);

revoke all on table public.trip_plans from public, anon, authenticated;
revoke all on table public.trip_plan_stops from public, anon, authenticated;
revoke all on table public.trip_plan_segments from public, anon, authenticated;

-- Normal Admin runtime reads through the authenticated Cookie Session. All
-- Draft mutations remain RPC-only so clients cannot update status or metrics.
grant select on table public.trip_plans to authenticated;
grant select on table public.trip_plan_stops to authenticated;
grant select on table public.trip_plan_segments to authenticated;

create function public.admin_create_trip_plan_draft(
  p_trip_type text,
  p_corridor_miles numeric,
  p_max_extra_minutes integer,
  p_max_extra_miles numeric,
  p_max_stops integer,
  p_stop_duration_minutes integer
)
returns table (
  trip_plan_id uuid,
  trip_type text,
  status text,
  corridor_miles numeric,
  max_extra_minutes integer,
  max_extra_miles numeric,
  max_stops integer,
  stop_duration_minutes integer,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (
    select 1 from public.app_admins as aa where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_trip_type is null or p_trip_type not in ('one_way', 'round_trip') then
    raise exception using errcode = '22023', message = 'Trip type must be one_way or round_trip.';
  end if;
  if p_corridor_miles is null or p_corridor_miles <= 0 then
    raise exception using errcode = '22023', message = 'Route corridor must be greater than zero.';
  end if;
  if p_max_extra_minutes is null or p_max_extra_minutes < 0 then
    raise exception using errcode = '22023', message = 'Maximum extra driving time cannot be negative.';
  end if;
  if p_max_extra_miles is not null and p_max_extra_miles < 0 then
    raise exception using errcode = '22023', message = 'Maximum extra distance cannot be negative.';
  end if;
  if p_max_stops is null or p_max_stops < 0 then
    raise exception using errcode = '22023', message = 'Maximum stops cannot be negative.';
  end if;
  if p_stop_duration_minutes is null or p_stop_duration_minutes < 0 then
    raise exception using errcode = '22023', message = 'Station time cannot be negative.';
  end if;

  insert into public.trip_plans as tp (
    user_id,
    trip_type,
    status,
    corridor_miles,
    max_extra_minutes,
    max_extra_miles,
    max_stops,
    stop_duration_minutes
  ) values (
    v_user_id,
    p_trip_type,
    'draft',
    p_corridor_miles,
    p_max_extra_minutes,
    p_max_extra_miles,
    p_max_stops,
    p_stop_duration_minutes
  )
  returning tp.* into v_plan;

  return query select
    v_plan.id,
    v_plan.trip_type,
    v_plan.status,
    v_plan.corridor_miles,
    v_plan.max_extra_minutes,
    v_plan.max_extra_miles,
    v_plan.max_stops,
    v_plan.stop_duration_minutes,
    v_plan.created_at,
    v_plan.updated_at;
end;
$$;

create function public.admin_update_trip_plan_settings(
  p_trip_plan_id uuid,
  p_trip_type text,
  p_corridor_miles numeric,
  p_max_extra_minutes integer,
  p_max_extra_miles numeric,
  p_max_stops integer,
  p_stop_duration_minutes integer
)
returns table (
  trip_plan_id uuid,
  trip_type text,
  status text,
  corridor_miles numeric,
  max_extra_minutes integer,
  max_extra_miles numeric,
  max_stops integer,
  stop_duration_minutes integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (
    select 1 from public.app_admins as aa where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_trip_plan_id is null then
    raise exception using errcode = '22023', message = 'Trip Plan ID is required.';
  end if;
  if p_trip_type is null or p_trip_type not in ('one_way', 'round_trip') then
    raise exception using errcode = '22023', message = 'Trip type must be one_way or round_trip.';
  end if;
  if p_corridor_miles is null or p_corridor_miles <= 0 then
    raise exception using errcode = '22023', message = 'Route corridor must be greater than zero.';
  end if;
  if p_max_extra_minutes is null or p_max_extra_minutes < 0 then
    raise exception using errcode = '22023', message = 'Maximum extra driving time cannot be negative.';
  end if;
  if p_max_extra_miles is not null and p_max_extra_miles < 0 then
    raise exception using errcode = '22023', message = 'Maximum extra distance cannot be negative.';
  end if;
  if p_max_stops is null or p_max_stops < 0 then
    raise exception using errcode = '22023', message = 'Maximum stops cannot be negative.';
  end if;
  if p_stop_duration_minutes is null or p_stop_duration_minutes < 0 then
    raise exception using errcode = '22023', message = 'Station time cannot be negative.';
  end if;

  select tp.*
  into v_plan
  from public.trip_plans as tp
  where tp.id = p_trip_plan_id
    and tp.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can update settings.';
  end if;

  update public.trip_plans as tp
  set
    trip_type = p_trip_type,
    corridor_miles = p_corridor_miles,
    max_extra_minutes = p_max_extra_minutes,
    max_extra_miles = p_max_extra_miles,
    max_stops = p_max_stops,
    stop_duration_minutes = p_stop_duration_minutes
  where tp.id = v_plan.id
  returning tp.* into v_plan;

  return query select
    v_plan.id,
    v_plan.trip_type,
    v_plan.status,
    v_plan.corridor_miles,
    v_plan.max_extra_minutes,
    v_plan.max_extra_miles,
    v_plan.max_stops,
    v_plan.stop_duration_minutes,
    v_plan.updated_at;
end;
$$;

create function public.admin_delete_trip_plan_draft(p_trip_plan_id uuid)
returns table (trip_plan_id uuid)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (
    select 1 from public.app_admins as aa where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_trip_plan_id is null then
    raise exception using errcode = '22023', message = 'Trip Plan ID is required.';
  end if;

  select tp.*
  into v_plan
  from public.trip_plans as tp
  where tp.id = p_trip_plan_id
    and tp.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can be deleted.';
  end if;

  delete from public.trip_plans as tp where tp.id = v_plan.id;
  return query select v_plan.id;
end;
$$;

comment on table public.trip_plans is
  'Private administrator-owned Trip Plan settings and route-calculation summary. No raw provider response or secret belongs here.';
comment on table public.trip_plan_stops is
  'Planned station references. A planned stop is not a Station Visit until visit_id is set by a later real Check-in flow.';
comment on table public.trip_plan_segments is
  'Future compact route segments. Geometry will contain only reviewed GeoJSON LineString objects, never complete provider responses.';
comment on function public.admin_create_trip_plan_draft(text, numeric, integer, numeric, integer, integer) is
  'Creates an empty Draft for auth.uid(); it creates no Stops, Segments, Visits, or route data.';
comment on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer) is
  'Updates only planning settings on the current administrator own Draft.';
comment on function public.admin_delete_trip_plan_draft(uuid) is
  'Deletes only the current administrator own Draft. Stops and Segments cascade; Stations and Visits remain.';

revoke execute on function public.admin_create_trip_plan_draft(text, numeric, integer, numeric, integer, integer)
  from public;
revoke execute on function public.admin_create_trip_plan_draft(text, numeric, integer, numeric, integer, integer)
  from anon;
revoke execute on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer)
  from public;
revoke execute on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer)
  from anon;
revoke execute on function public.admin_delete_trip_plan_draft(uuid) from public;
revoke execute on function public.admin_delete_trip_plan_draft(uuid) from anon;

grant execute on function public.admin_create_trip_plan_draft(text, numeric, integer, numeric, integer, integer)
  to authenticated;
grant execute on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer)
  to authenticated;
grant execute on function public.admin_delete_trip_plan_draft(uuid) to authenticated;

commit;
