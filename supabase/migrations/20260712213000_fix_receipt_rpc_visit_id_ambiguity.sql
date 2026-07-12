begin;

create or replace function public.import_receipt_charge(
  p_visit_id uuid,
  p_station_id uuid,
  p_user_id uuid,
  p_checked_in_at timestamptz,
  p_checked_in_timezone text,
  p_checked_in_time_precision text,
  p_session_started_at timestamptz,
  p_is_public boolean,
  p_energy_kwh numeric,
  p_cost_usd numeric,
  p_charging_minutes integer,
  p_price_per_kwh numeric
)
returns table (
  visit_id uuid,
  visit_created boolean,
  charging_session_created boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing_visit public.station_visits%rowtype;
  v_visit_existed boolean;
  v_charging_session_existed boolean;
begin
  if not exists (
    select 1
    from public.app_admins
    where user_id = p_user_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Receipt import user is not an application administrator.';
  end if;

  if not exists (
    select 1
    from public.stations
    where id = p_station_id
  ) then
    raise exception using
      errcode = '22023',
      message = 'Receipt import station does not exist.';
  end if;

  if p_checked_in_at is null then
    raise exception using
      errcode = '22023',
      message = 'Receipt import timestamp is required.';
  end if;

  if nullif(btrim(p_checked_in_timezone), '') is null then
    raise exception using
      errcode = '22023',
      message = 'Receipt import IANA timezone is required.';
  end if;

  if p_checked_in_time_precision is null
    or p_checked_in_time_precision not in ('exact', 'date_only') then
    raise exception using
      errcode = '22023',
      message = 'Receipt import time precision must be exact or date_only.';
  end if;

  if p_checked_in_time_precision = 'exact' and p_session_started_at is null then
    raise exception using
      errcode = '22023',
      message = 'Exact Receipt import requires a session start timestamp.';
  end if;

  if p_checked_in_time_precision = 'date_only' and p_session_started_at is not null then
    raise exception using
      errcode = '22023',
      message = 'Date-only Receipt import must not claim an exact session start timestamp.';
  end if;

  select *
  into v_existing_visit
  from public.station_visits
  where id = p_visit_id
  for update;

  v_visit_existed := found;

  if v_visit_existed and v_existing_visit.station_id <> p_station_id then
    raise exception using
      errcode = '22023',
      message = 'Receipt visitId already belongs to a different station.';
  end if;

  if v_visit_existed and v_existing_visit.user_id <> p_user_id then
    raise exception using
      errcode = '22023',
      message = 'Receipt visitId already belongs to a different user.';
  end if;

  if v_visit_existed and v_existing_visit.checked_in_at <> p_checked_in_at then
    raise exception using
      errcode = '22023',
      message = 'Receipt visitId already has a different timestamp.';
  end if;

  if v_visit_existed
    and v_existing_visit.checked_in_time_precision <> p_checked_in_time_precision then
    raise exception using
      errcode = '22023',
      message = 'Receipt visitId already has a different time precision.';
  end if;

  select exists (
    select 1
    from public.charging_sessions as cs
    where cs.visit_id = p_visit_id
  ) into v_charging_session_existed;

  insert into public.station_visits (
    id,
    station_id,
    user_id,
    checked_in_at,
    checked_in_timezone,
    checked_in_time_precision,
    recorded_latitude,
    recorded_longitude,
    notes,
    is_public
  ) values (
    p_visit_id,
    p_station_id,
    p_user_id,
    p_checked_in_at,
    btrim(p_checked_in_timezone),
    p_checked_in_time_precision,
    null,
    null,
    null,
    p_is_public
  )
  on conflict (id) do update
  set
    station_id = excluded.station_id,
    user_id = excluded.user_id,
    checked_in_at = excluded.checked_in_at,
    checked_in_timezone = excluded.checked_in_timezone,
    checked_in_time_precision = excluded.checked_in_time_precision,
    is_public = excluded.is_public;

  insert into public.charging_sessions (
    visit_id,
    started_at,
    energy_kwh,
    cost_usd,
    charging_minutes,
    price_per_kwh
  ) values (
    p_visit_id,
    p_session_started_at,
    p_energy_kwh,
    p_cost_usd,
    p_charging_minutes,
    p_price_per_kwh
  )
  on conflict (visit_id) do update
  set
    started_at = excluded.started_at,
    energy_kwh = excluded.energy_kwh,
    cost_usd = excluded.cost_usd,
    charging_minutes = excluded.charging_minutes,
    price_per_kwh = excluded.price_per_kwh;

  return query
  select p_visit_id, not v_visit_existed, not v_charging_session_existed;
end;
$$;

revoke all on function public.import_receipt_charge(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  timestamptz,
  boolean,
  numeric,
  numeric,
  integer,
  numeric
) from public, anon, authenticated;

grant execute on function public.import_receipt_charge(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  timestamptz,
  boolean,
  numeric,
  numeric,
  integer,
  numeric
) to service_role;

commit;
