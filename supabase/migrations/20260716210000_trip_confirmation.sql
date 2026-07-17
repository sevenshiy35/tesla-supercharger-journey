begin;

create function public.admin_confirm_trip_plan(
  p_trip_plan_id uuid,
  p_expected_revision bigint
)
returns table (
  trip_plan_id uuid,
  status text,
  confirmed_at timestamptz,
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
    select 1
    from public.app_admins aa
    where aa.user_id = v_user_id
  ) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_trip_plan_id is null then
    raise exception using errcode = '22023', message = 'Trip Plan ID is required.';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception using errcode = '22023', message = 'A valid route revision is required.';
  end if;

  select tp.*
  into v_plan
  from public.trip_plans tp
  where tp.id = p_trip_plan_id
    and tp.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can be confirmed.';
  end if;
  if v_plan.route_input_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'The trip changed while this operation was running. Refresh and try again.';
  end if;
  if v_plan.name is null or char_length(btrim(v_plan.name)) = 0 then
    raise exception using errcode = '55000', message = 'Trip name is required before confirmation.';
  end if;
  if v_plan.route_calculated_at is null
    or v_plan.planned_route_stale
    or v_plan.planned_distance_meters is null
    or v_plan.planned_drive_seconds is null
    or v_plan.planned_stop_seconds is null
    or not exists (
      select 1
      from public.trip_plan_stops tps
      where tps.trip_plan_id = v_plan.id
        and tps.status = 'planned'
    )
  then
    raise exception using errcode = '55000', message = 'The planned route is not ready for confirmation.';
  end if;

  return query
  update public.trip_plans tp
  set status = 'confirmed',
      confirmed_at = now()
  where tp.id = v_plan.id
    and tp.user_id = v_user_id
  returning tp.id, tp.status, tp.confirmed_at, tp.updated_at;
end;
$$;

comment on function public.admin_confirm_trip_plan(uuid, bigint) is
  'Atomically confirms the current administrator own, current-revision Draft after its named planned route is ready.';

revoke all on function public.admin_confirm_trip_plan(uuid, bigint) from public, anon;
grant execute on function public.admin_confirm_trip_plan(uuid, bigint) to authenticated;

commit;
