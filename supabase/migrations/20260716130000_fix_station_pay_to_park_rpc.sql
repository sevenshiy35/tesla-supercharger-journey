begin;

-- The original function used ON CONFLICT (user_id, station_id). Because a
-- RETURNS TABLE output column is also named station_id, PL/pgSQL could resolve
-- that conflict target as either an output variable or a table column and
-- raised 42702 at runtime. Naming the primary-key constraint removes that
-- ambiguity while preserving the existing RPC contract.
create or replace function public.admin_set_station_pay_to_park(
  p_station_id uuid,
  p_pay_to_park boolean
)
returns table (
  station_id uuid,
  pay_to_park boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_updated_at timestamptz;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;

  if not exists (
    select 1
    from public.app_admins as aa
    where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  if p_station_id is null or not exists (
    select 1
    from public.stations as s
    where s.id = p_station_id
  ) then
    raise exception using errcode = 'P0002', message = 'Station not found.';
  end if;

  if p_pay_to_park is null then
    raise exception using errcode = '22023', message = 'Pay-to-park value is required.';
  end if;

  if p_pay_to_park then
    insert into public.station_user_preferences as sup (
      user_id,
      station_id,
      pay_to_park
    ) values (
      v_user_id,
      p_station_id,
      true
    )
    on conflict on constraint station_user_preferences_pkey do update
    set pay_to_park = excluded.pay_to_park
    returning sup.updated_at into v_updated_at;
  else
    delete from public.station_user_preferences as sup
    where sup.user_id = v_user_id
      and sup.station_id = p_station_id;
    v_updated_at := now();
  end if;

  return query
  select p_station_id, p_pay_to_park, v_updated_at;
end;
$$;

comment on function public.admin_set_station_pay_to_park(uuid, boolean) is
  'Idempotently sets the current administrator personal pay-to-park marker.';

revoke all on function public.admin_set_station_pay_to_park(uuid, boolean) from public, anon;
grant execute on function public.admin_set_station_pay_to_park(uuid, boolean) to authenticated;

commit;
