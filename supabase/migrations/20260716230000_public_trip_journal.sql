begin;

create or replace function public.get_public_homepage_trip()
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  with visible_plan as (
    select tp.*
    from public.trip_plans tp
    where tp.is_public = true
      and tp.show_on_homepage = true
      and tp.status in ('confirmed', 'active', 'completed')
      and tp.name is not null
    order by
      case tp.status when 'active' then 0 when 'confirmed' then 1 else 2 end,
      coalesce(tp.activated_at, tp.confirmed_at, tp.completed_at, tp.updated_at) desc,
      tp.id
    limit 1
  )
  select jsonb_build_object(
    'id', tp.id,
    'name', tp.name,
    'status', tp.status,
    'confirmedAt', tp.confirmed_at,
    'activatedAt', tp.activated_at,
    'completedAt', tp.completed_at,
    'updatedAt', tp.updated_at,
    'stops', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', tps.id,
          'sequence', tps.sequence,
          'leg', tps.leg,
          'stationId', s.id,
          'stationName', s.name,
          'city', s.city,
          'state', s.state,
          'latitude', s.latitude,
          'longitude', s.longitude,
          'status', case when tps.status = 'visited' then 'visited' else 'planned' end,
          'estimatedArrivalAt', tps.estimated_arrival_at,
          'checkedInAt', case when sv.is_public = true then sv.checked_in_at else null end
        )
        order by tps.sequence
      )
      from public.trip_plan_stops tps
      join public.stations s on s.id = tps.station_id
      left join public.station_visits sv on sv.id = tps.visit_id
      where tps.trip_plan_id = tp.id
        and tps.status <> 'skipped'
    ), '[]'::jsonb),
    'segments', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'segmentIndex', tpg.segment_index,
          'leg', tpg.leg,
          'startSequence', tpg.start_sequence,
          'endSequence', tpg.end_sequence,
          'geometry', tpg.geometry
        )
        order by tpg.segment_index
      )
      from public.trip_plan_segments tpg
      where tpg.trip_plan_id = tp.id
        and tpg.route_kind = 'planned'
    ), '[]'::jsonb)
  )
  from visible_plan tp;
$$;

comment on function public.get_public_homepage_trip() is
  'Returns one deliberately published homepage Trip without owner identity, private endpoint labels, or private Visit details.';

revoke all on function public.get_public_homepage_trip() from public;
grant execute on function public.get_public_homepage_trip() to anon, authenticated;

create or replace function public.admin_set_trip_publication(
  p_trip_plan_id uuid,
  p_is_public boolean,
  p_show_on_homepage boolean
)
returns table (
  trip_plan_id uuid,
  is_public boolean,
  show_on_homepage boolean,
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
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_trip_plan_id is null or p_is_public is null or p_show_on_homepage is null then
    raise exception using errcode = '22023', message = 'Trip publication settings are required.';
  end if;
  if p_show_on_homepage and not p_is_public then
    raise exception using errcode = '22023', message = 'A homepage Trip must be public.';
  end if;

  select tp.* into v_plan
  from public.trip_plans tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan not found.';
  end if;
  if v_plan.status not in ('confirmed', 'active', 'completed') then
    raise exception using errcode = '55000', message = 'Only confirmed, active, or completed Trips can be published.';
  end if;

  if p_show_on_homepage then
    update public.trip_plans tp
    set show_on_homepage = false
    where tp.user_id = v_user_id
      and tp.id <> v_plan.id
      and tp.show_on_homepage = true;
  end if;

  return query
  update public.trip_plans tp
  set is_public = p_is_public,
      show_on_homepage = case when p_is_public then p_show_on_homepage else false end
  where tp.id = v_plan.id and tp.user_id = v_user_id
  returning tp.id, tp.is_public, tp.show_on_homepage, tp.updated_at;
end;
$$;

comment on function public.admin_set_trip_publication(uuid, boolean, boolean) is
  'Lets the owning administrator explicitly publish one confirmed Trip on the public homepage; publishing replaces their prior homepage Trip.';

revoke all on function public.admin_set_trip_publication(uuid, boolean, boolean) from public, anon;
grant execute on function public.admin_set_trip_publication(uuid, boolean, boolean) to authenticated;

commit;
