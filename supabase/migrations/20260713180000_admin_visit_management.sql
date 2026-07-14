begin;

create or replace function public.admin_create_station_visit(
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
  is_public boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_visit public.station_visits%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1 from public.app_admins as aa where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if p_visit_id is null then
    raise exception using errcode = '22023', message = 'Visit ID is required.';
  end if;

  if p_station_id is null or not exists (
    select 1 from public.stations as s where s.id = p_station_id
  ) then
    raise exception using errcode = '22023', message = 'The selected station does not exist.';
  end if;

  if nullif(btrim(p_checked_in_timezone), '') is null
    or char_length(btrim(p_checked_in_timezone)) > 100
    or not exists (
      select 1
      from pg_catalog.pg_timezone_names as t
      where t.name = btrim(p_checked_in_timezone)
    ) then
    raise exception using errcode = '22023', message = 'A valid IANA timezone is required.';
  end if;

  if p_recorded_latitude is not null and p_recorded_latitude not between -90 and 90 then
    raise exception using errcode = '22023', message = 'Latitude must be between -90 and 90.';
  end if;

  if p_recorded_longitude is not null and p_recorded_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Longitude must be between -180 and 180.';
  end if;

  if (p_recorded_latitude is null) <> (p_recorded_longitude is null) then
    raise exception using errcode = '22023', message = 'Latitude and longitude must be provided together.';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception using errcode = '22023', message = 'Notes must be 2,000 characters or fewer.';
  end if;

  if p_is_public is null then
    raise exception using errcode = '22023', message = 'Visit visibility is required.';
  end if;

  select sv.*
  into v_visit
  from public.station_visits as sv
  where sv.id = p_visit_id
  for update;

  if found then
    if v_visit.user_id <> v_user_id or v_visit.station_id <> p_station_id then
      raise exception using errcode = '23505', message = 'Visit ID conflicts with another check-in.';
    end if;

    return query select
      v_visit.id,
      v_visit.station_id,
      v_visit.checked_in_at,
      v_visit.checked_in_timezone,
      v_visit.is_public;
    return;
  end if;

  insert into public.station_visits as sv (
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
    v_user_id,
    now(),
    btrim(p_checked_in_timezone),
    'exact',
    p_recorded_latitude,
    p_recorded_longitude,
    nullif(p_notes, ''),
    p_is_public
  )
  on conflict (id) do nothing
  returning sv.* into v_visit;

  if not found then
    select sv.*
    into v_visit
    from public.station_visits as sv
    where sv.id = p_visit_id
    for update;

    if not found or v_visit.user_id <> v_user_id or v_visit.station_id <> p_station_id then
      raise exception using errcode = '23505', message = 'Visit ID conflicts with another check-in.';
    end if;
  end if;

  return query select
    v_visit.id,
    v_visit.station_id,
    v_visit.checked_in_at,
    v_visit.checked_in_timezone,
    v_visit.is_public;
end;
$$;

create or replace function public.admin_update_station_visit(
  p_visit_id uuid,
  p_notes text,
  p_is_public boolean
)
returns table (
  visit_id uuid,
  notes text,
  is_public boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_visit public.station_visits%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1 from public.app_admins as aa where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if p_visit_id is null then
    raise exception using errcode = '22023', message = 'Visit ID is required.';
  end if;

  if p_notes is not null and char_length(p_notes) > 2000 then
    raise exception using errcode = '22023', message = 'Notes must be 2,000 characters or fewer.';
  end if;

  if p_is_public is null then
    raise exception using errcode = '22023', message = 'Visit visibility is required.';
  end if;

  update public.station_visits as sv
  set
    notes = nullif(p_notes, ''),
    is_public = p_is_public
  where sv.id = p_visit_id
  returning sv.* into v_visit;

  if not found then
    raise exception using errcode = 'P0002', message = 'Visit not found.';
  end if;

  return query select v_visit.id, v_visit.notes, v_visit.is_public, v_visit.updated_at;
end;
$$;

create or replace function public.admin_delete_station_visit(
  p_visit_id uuid
)
returns table (
  visit_id uuid,
  station_id uuid
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_visit public.station_visits%rowtype;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1 from public.app_admins as aa where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if p_visit_id is null then
    raise exception using errcode = '22023', message = 'Visit ID is required.';
  end if;

  select sv.*
  into v_visit
  from public.station_visits as sv
  where sv.id = p_visit_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Visit not found.';
  end if;

  if exists (
    select 1 from public.visit_photos as vp where vp.visit_id = p_visit_id
  ) then
    raise exception using
      errcode = 'P0001',
      message = 'This visit has photo records and cannot be deleted until Storage cleanup is supported.';
  end if;

  delete from public.charging_sessions as cs where cs.visit_id = p_visit_id;
  delete from public.station_visits as sv where sv.id = p_visit_id;

  return query select v_visit.id, v_visit.station_id;
end;
$$;

comment on function public.admin_create_station_visit(uuid, uuid, text, numeric, numeric, text, boolean)
  is 'Admin-only, idempotent mobile check-in using database server time and auth.uid().';
comment on function public.admin_update_station_visit(uuid, text, boolean)
  is 'Admin-only update limited to visit notes and public visibility.';
comment on function public.admin_delete_station_visit(uuid)
  is 'Admin-only atomic visit deletion; refuses visits with photo metadata.';

revoke all on function public.admin_create_station_visit(uuid, uuid, text, numeric, numeric, text, boolean)
  from public, anon;
revoke all on function public.admin_update_station_visit(uuid, text, boolean)
  from public, anon;
revoke all on function public.admin_delete_station_visit(uuid)
  from public, anon;

grant execute on function public.admin_create_station_visit(uuid, uuid, text, numeric, numeric, text, boolean)
  to authenticated;
grant execute on function public.admin_update_station_visit(uuid, text, boolean)
  to authenticated;
grant execute on function public.admin_delete_station_visit(uuid)
  to authenticated;

commit;
