begin;

create function public.admin_check_in_station(
  p_visit_id uuid,
  p_station_id uuid,
  p_checked_in_timezone text,
  p_recorded_latitude numeric default null,
  p_recorded_longitude numeric default null,
  p_notes text default null,
  p_is_public boolean default true
)
returns table (
  visit_id uuid,
  station_id uuid,
  checked_in_at timestamptz,
  checked_in_timezone text,
  is_public boolean,
  trip_plan_id uuid,
  trip_plan_stop_id uuid,
  trip_activated boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_visit record;
  v_trip_plan_id uuid;
  v_trip_plan_stop_id uuid;
  v_trip_status text;
  v_trip_activated boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (
    select 1
    from public.app_admins aa
    where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  select created.*
  into v_visit
  from public.admin_create_station_visit(
    p_visit_id,
    p_station_id,
    p_checked_in_timezone,
    p_recorded_latitude,
    p_recorded_longitude,
    p_notes,
    p_is_public
  ) created;

  -- An idempotent retry must return the existing Trip link rather than attach
  -- the same Visit to another Trip that happens to contain this Station.
  select tps.trip_plan_id, tps.id
  into v_trip_plan_id, v_trip_plan_stop_id
  from public.trip_plan_stops tps
  join public.trip_plans tp on tp.id = tps.trip_plan_id
  where tps.visit_id = v_visit.visit_id
    and tp.user_id = v_user_id
  order by tps.updated_at desc, tps.id
  limit 1;

  if not found then
    -- A current Active Trip wins. Otherwise the newest confirmed Trip that
    -- actually contains this planned Station becomes the current Trip.
    select tp.id, tps.id, tp.status
    into v_trip_plan_id, v_trip_plan_stop_id, v_trip_status
    from public.trip_plan_stops tps
    join public.trip_plans tp on tp.id = tps.trip_plan_id
    where tp.user_id = v_user_id
      and tp.status in ('active', 'confirmed')
      and tps.station_id = p_station_id
      and tps.status = 'planned'
      and tps.visit_id is null
    order by
      case when tp.status = 'active' then 0 else 1 end,
      coalesce(tp.activated_at, tp.confirmed_at, tp.updated_at) desc,
      tp.id
    limit 1
    for update of tp, tps;

    if found then
      update public.trip_plan_stops tps
      set status = 'visited',
          visit_id = v_visit.visit_id
      where tps.id = v_trip_plan_stop_id;

      if v_trip_status = 'confirmed' then
        update public.trip_plans tp
        set status = 'active',
            activated_at = coalesce(tp.activated_at, now())
        where tp.id = v_trip_plan_id
          and tp.user_id = v_user_id;
        v_trip_activated := true;
      end if;
    end if;
  end if;

  return query select
    v_visit.visit_id,
    v_visit.station_id,
    v_visit.checked_in_at,
    v_visit.checked_in_timezone,
    v_visit.is_public,
    v_trip_plan_id,
    v_trip_plan_stop_id,
    v_trip_activated;
end;
$$;

create function public.reset_trip_stop_on_visit_delete()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.trip_plan_stops tps
  set status = 'planned',
      visit_id = null
  where tps.visit_id = old.id;
  return old;
end;
$$;

create trigger station_visits_reset_trip_stop_before_delete
before delete on public.station_visits
for each row execute function public.reset_trip_stop_on_visit_delete();

comment on function public.admin_check_in_station(uuid, uuid, text, numeric, numeric, text, boolean) is
  'Creates an exact administrator Check-in and atomically marks the matching current Trip Stop visited; a confirmed Trip becomes active on its first matching Check-in.';
comment on function public.reset_trip_stop_on_visit_delete() is
  'Restores a linked Trip Stop to planned before its Visit is deleted.';

revoke all on function public.admin_check_in_station(uuid, uuid, text, numeric, numeric, text, boolean) from public, anon;
grant execute on function public.admin_check_in_station(uuid, uuid, text, numeric, numeric, text, boolean) to authenticated;
revoke all on function public.reset_trip_stop_on_visit_delete() from public, anon, authenticated;

commit;
