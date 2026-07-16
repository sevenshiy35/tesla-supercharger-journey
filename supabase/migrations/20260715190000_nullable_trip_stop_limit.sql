begin;

-- null means the planner has no user-configured Stop count cap. Existing
-- numeric values remain intact for backward compatibility until the owner
-- next saves settings from the new UI, which submits null.
alter table public.trip_plans
  alter column max_stops drop not null,
  alter column max_stops drop default;

comment on column public.trip_plans.max_stops is
  'Optional legacy/user Stop count cap. Null means maximize feasible unvisited Stations within the detour budget; technical API and algorithm guards remain separate.';

create or replace function public.admin_create_trip_plan_draft(
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
  if p_max_stops is not null and p_max_stops < 0 then
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

create or replace function public.admin_update_trip_plan_settings(
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
  v_changed boolean;
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
  if p_max_stops is not null and p_max_stops < 0 then
    raise exception using errcode = '22023', message = 'Maximum stops cannot be negative.';
  end if;
  if p_stop_duration_minutes is null or p_stop_duration_minutes < 0 then
    raise exception using errcode = '22023', message = 'Station time cannot be negative.';
  end if;

  select tp.* into v_plan
  from public.trip_plans as tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can update settings.';
  end if;

  v_changed :=
    v_plan.trip_type is distinct from p_trip_type
    or v_plan.corridor_miles is distinct from p_corridor_miles
    or v_plan.max_extra_minutes is distinct from p_max_extra_minutes
    or v_plan.max_extra_miles is distinct from p_max_extra_miles
    or v_plan.max_stops is distinct from p_max_stops
    or v_plan.stop_duration_minutes is distinct from p_stop_duration_minutes;

  if v_changed then
    delete from public.trip_plan_segments as tps where tps.trip_plan_id = v_plan.id;
    delete from public.trip_plan_stops as tpst where tpst.trip_plan_id = v_plan.id;

    update public.trip_plans as tp
    set
      trip_type = p_trip_type,
      corridor_miles = p_corridor_miles,
      max_extra_minutes = p_max_extra_minutes,
      max_extra_miles = p_max_extra_miles,
      max_stops = p_max_stops,
      stop_duration_minutes = p_stop_duration_minutes,
      route_input_revision = tp.route_input_revision + 1,
      route_provider = null,
      algorithm_version = null,
      base_distance_meters = null,
      base_duration_seconds = null,
      planned_distance_meters = null,
      planned_drive_seconds = null,
      planned_stop_seconds = null,
      extra_distance_meters = null,
      extra_duration_seconds = null,
      route_calculated_at = null
    where tp.id = v_plan.id
    returning tp.* into v_plan;
  end if;

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

comment on function public.admin_create_trip_plan_draft(text, numeric, integer, numeric, integer, integer) is
  'Creates an owned Draft. A null maximum Stop count means maximize feasible unvisited Stations within the detour budget.';
comment on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer) is
  'Updates Draft settings and invalidates stale route data. A null maximum Stop count means no user count cap.';

revoke execute on function public.admin_create_trip_plan_draft(text, numeric, integer, numeric, integer, integer) from public, anon;
revoke execute on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer) from public, anon;
grant execute on function public.admin_create_trip_plan_draft(text, numeric, integer, numeric, integer, integer) to authenticated;
grant execute on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer) to authenticated;

commit;
