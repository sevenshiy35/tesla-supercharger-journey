begin;

alter table public.trip_plans
  add column planned_route_stale boolean not null default false;

comment on column public.trip_plans.planned_route_stale is
  'True when the saved stop set/order changed after the last authoritative planned-route calculation.';

create or replace function public.clear_trip_suggestion_audit_on_revision()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.route_input_revision is distinct from old.route_input_revision
    and (new.planned_route_stale or new.base_distance_meters is null or new.base_duration_seconds is null) then
    new.corridor_candidate_count := null;
    new.evaluated_candidate_count := null;
    new.unreachable_candidate_count := null;
    new.technical_limit_reached := false;
    new.technical_limit_reason := null;
  end if;
  return new;
end;
$$;

create function public.sync_trip_planned_route_stale_on_full_invalidation()
returns trigger language plpgsql set search_path = public as $$
begin
  if new.base_distance_meters is null or new.base_duration_seconds is null then
    new.planned_route_stale := false;
  elsif old.base_distance_meters is null and new.base_distance_meters is not null
    and new.algorithm_version = 'base-route-v1' then
    new.planned_route_stale := false;
  end if;
  return new;
end;
$$;

create trigger trip_plans_sync_planned_route_stale
before update on public.trip_plans
for each row execute function public.sync_trip_planned_route_stale_on_full_invalidation();

-- Explicit reordering is atomic, so the per-trip sequence key must be deferrable.
alter table public.trip_plan_stops
  drop constraint trip_plan_stops_trip_sequence_key;
alter table public.trip_plan_stops
  add constraint trip_plan_stops_trip_sequence_key
  unique (trip_plan_id, sequence) deferrable initially immediate;

create function public.admin_add_trip_plan_stop(
  p_trip_plan_id uuid,
  p_station_id uuid,
  p_leg text,
  p_insert_position integer default null,
  p_expected_revision bigint default null
)
returns table (trip_plan_stop_id uuid, route_input_revision bigint, planned_route_stale boolean)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_stop_id uuid;
  v_leg_count integer;
  v_position integer;
  v_global_sequence integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  select tp.* into v_plan from public.trip_plans tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can be edited.'; end if;
  if p_expected_revision is null or v_plan.route_input_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'The trip changed while this operation was running. Refresh and try again.';
  end if;
  if p_leg not in ('outbound', 'return') or (v_plan.trip_type = 'one_way' and p_leg <> 'outbound') then
    raise exception using errcode = '22023', message = 'The requested Trip leg is invalid.';
  end if;
  if p_station_id = v_plan.origin_station_id or p_station_id = v_plan.destination_station_id then
    raise exception using errcode = '22023', message = 'An endpoint Station cannot also be a Trip Stop.';
  end if;
  if exists (select 1 from public.trip_plan_stops tps where tps.trip_plan_id = v_plan.id and tps.station_id = p_station_id) then
    raise exception using errcode = '23505', message = 'That Station is already in this Trip Plan.';
  end if;
  if not exists (
    select 1 from public.stations s where s.id = p_station_id
      and s.latitude between -90 and 90 and s.longitude between -180 and 180
      and lower(btrim(s.operational_status)) not in ('closed', 'permanently closed', 'removed', 'inactive')
  ) then raise exception using errcode = 'P0002', message = 'The Station is unavailable or has invalid coordinates.'; end if;

  select count(*) into v_leg_count from public.trip_plan_stops tps
  where tps.trip_plan_id = v_plan.id and tps.leg = p_leg;
  v_position := coalesce(p_insert_position, v_leg_count);
  if v_position < 0 or v_position > v_leg_count then
    raise exception using errcode = '22023', message = 'The requested insertion position is invalid.';
  end if;
  if p_leg = 'outbound' then v_global_sequence := v_position;
  else
    select count(*) + v_position into v_global_sequence from public.trip_plan_stops tps
    where tps.trip_plan_id = v_plan.id and tps.leg = 'outbound';
  end if;

  set constraints trip_plan_stops_trip_sequence_key deferred;
  update public.trip_plan_stops tps set sequence = tps.sequence + 1
  where tps.trip_plan_id = v_plan.id and tps.sequence >= v_global_sequence;
  insert into public.trip_plan_stops (
    trip_plan_id, station_id, sequence, leg, source, is_locked, status,
    estimated_arrival_at, estimated_detour_seconds, estimated_detour_meters,
    corridor_distance_meters, route_progress, selection_rank, visit_id
  ) values (
    v_plan.id, p_station_id, v_global_sequence, p_leg, 'manual', true, 'planned',
    null, null, null, null, null, null, null
  ) returning id into v_stop_id;
  delete from public.trip_plan_segments tps where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';
  update public.trip_plans tp set route_input_revision = tp.route_input_revision + 1, planned_route_stale = true
  where tp.id = v_plan.id returning tp.* into v_plan;
  return query select v_stop_id, v_plan.route_input_revision, v_plan.planned_route_stale;
end;
$$;

create function public.admin_remove_trip_plan_stop(
  p_trip_plan_id uuid,
  p_trip_plan_stop_id uuid,
  p_expected_revision bigint
)
returns table (route_input_revision bigint, planned_route_stale boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_sequence integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then raise exception using errcode = '42501', message = 'Administrator access is required.'; end if;
  select tp.* into v_plan from public.trip_plans tp where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can be edited.'; end if;
  if v_plan.route_input_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'The trip changed while this operation was running. Refresh and try again.'; end if;
  select tps.sequence into v_sequence from public.trip_plan_stops tps
  where tps.id = p_trip_plan_stop_id and tps.trip_plan_id = v_plan.id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Stop not found.'; end if;
  set constraints trip_plan_stops_trip_sequence_key deferred;
  delete from public.trip_plan_stops tps where tps.id = p_trip_plan_stop_id and tps.trip_plan_id = v_plan.id;
  update public.trip_plan_stops tps set sequence = tps.sequence - 1
  where tps.trip_plan_id = v_plan.id and tps.sequence > v_sequence;
  delete from public.trip_plan_segments tps where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';
  update public.trip_plans tp set route_input_revision = tp.route_input_revision + 1, planned_route_stale = true
  where tp.id = v_plan.id returning tp.* into v_plan;
  return query select v_plan.route_input_revision, v_plan.planned_route_stale;
end;
$$;

create function public.admin_set_trip_plan_stop_lock(
  p_trip_plan_id uuid,
  p_trip_plan_stop_id uuid,
  p_is_locked boolean,
  p_expected_revision bigint
)
returns table (route_input_revision bigint, is_locked boolean, planned_route_stale boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_source text;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then raise exception using errcode = '42501', message = 'Administrator access is required.'; end if;
  select tp.* into v_plan from public.trip_plans tp where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can be edited.'; end if;
  if v_plan.route_input_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'The trip changed while this operation was running. Refresh and try again.'; end if;
  select tps.source into v_source from public.trip_plan_stops tps
  where tps.id = p_trip_plan_stop_id and tps.trip_plan_id = v_plan.id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Stop not found.'; end if;
  if v_source <> 'algorithm' then raise exception using errcode = '22023', message = 'Manually added Stops are always locked and cannot be unlocked.'; end if;
  update public.trip_plan_stops tps set is_locked = p_is_locked where tps.id = p_trip_plan_stop_id;
  update public.trip_plans tp set route_input_revision = tp.route_input_revision + 1
  where tp.id = v_plan.id returning tp.* into v_plan;
  return query select v_plan.route_input_revision, p_is_locked, v_plan.planned_route_stale;
end;
$$;

create function public.admin_reorder_trip_plan_stops(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_stops jsonb
)
returns table (route_input_revision bigint, planned_route_stale boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_count integer;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then raise exception using errcode = '42501', message = 'Administrator access is required.'; end if;
  select tp.* into v_plan from public.trip_plans tp where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can be edited.'; end if;
  if v_plan.route_input_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'The trip changed while this operation was running. Refresh and try again.'; end if;
  if jsonb_typeof(p_stops) <> 'array' then raise exception using errcode = '22023', message = 'The Stop order must be an array.'; end if;
  select count(*) into v_count from public.trip_plan_stops tps where tps.trip_plan_id = v_plan.id;
  if jsonb_array_length(p_stops) <> v_count then raise exception using errcode = '22023', message = 'The Stop order must include every current Stop exactly once.'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_stops) item
    where jsonb_typeof(item) <> 'object'
      or item - array['stopId','sequence','leg'] <> '{}'::jsonb
      or not (item ?& array['stopId','sequence','leg'])
      or (item->>'stopId') !~* '^[0-9a-f-]{36}$'
      or (item->>'sequence') !~ '^\d+$'
      or (item->>'sequence')::integer not between 0 and greatest(v_count - 1, 0)
      or item->>'leg' not in ('outbound','return')
      or (v_plan.trip_type = 'one_way' and item->>'leg' <> 'outbound')
  ) then raise exception using errcode = '22023', message = 'The Stop order contains invalid metadata.'; end if;
  if (select count(distinct item->>'stopId') from jsonb_array_elements(p_stops) item) <> v_count
    or (select count(distinct (item->>'sequence')::integer) from jsonb_array_elements(p_stops) item) <> v_count
    or exists (
      select 1 from jsonb_array_elements(p_stops) item
      left join public.trip_plan_stops tps on tps.id = (item->>'stopId')::uuid and tps.trip_plan_id = v_plan.id
      where tps.id is null
    )
    or exists (
      select 1 from jsonb_array_elements(p_stops) a, jsonb_array_elements(p_stops) b
      where (a->>'sequence')::integer < (b->>'sequence')::integer and a->>'leg' = 'return' and b->>'leg' = 'outbound'
    ) then raise exception using errcode = '22023', message = 'The Stop order is incomplete, duplicated, foreign, or has invalid leg ordering.'; end if;
  set constraints trip_plan_stops_trip_sequence_key deferred;
  update public.trip_plan_stops tps set
    sequence = (item->>'sequence')::integer,
    leg = item->>'leg',
    is_locked = case when tps.source = 'manual' then true else tps.is_locked end
  from jsonb_array_elements(p_stops) item
  where tps.trip_plan_id = v_plan.id and tps.id = (item->>'stopId')::uuid;
  delete from public.trip_plan_segments tps where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';
  update public.trip_plans tp set route_input_revision = tp.route_input_revision + 1, planned_route_stale = true
  where tp.id = v_plan.id returning tp.* into v_plan;
  return query select v_plan.route_input_revision, v_plan.planned_route_stale;
end;
$$;

-- Directions results are saved separately from edits. Recalculation preserves the exact Stop rows.
create function public.admin_save_recalculated_trip_route(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_planned_distance_meters bigint,
  p_planned_drive_seconds integer,
  p_planned_stop_seconds integer,
  p_extra_distance_meters bigint,
  p_extra_duration_seconds integer,
  p_segments jsonb,
  p_persist_geometry boolean
)
returns table (route_input_revision bigint, route_calculated_at timestamptz, geometry_persisted boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_stop_count integer;
  v_distance_sum bigint;
  v_duration_sum bigint;
  v_item jsonb;
  v_segment_index integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then raise exception using errcode = '42501', message = 'Administrator access is required.'; end if;
  select tp.* into v_plan from public.trip_plans tp where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can save a recalculated route.'; end if;
  if v_plan.route_input_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'The trip changed while this operation was running. Refresh and try again.'; end if;
  if v_plan.base_distance_meters is null or v_plan.base_duration_seconds is null then raise exception using errcode = '22023', message = 'A Base Route is required.'; end if;
  select count(*) into v_stop_count from public.trip_plan_stops tps where tps.trip_plan_id = v_plan.id;
  if p_planned_distance_meters < 0 or p_planned_drive_seconds < 0 or p_planned_stop_seconds < 0
    or p_extra_distance_meters <> greatest(0, p_planned_distance_meters - v_plan.base_distance_meters)
    or p_extra_duration_seconds <> greatest(0, p_planned_drive_seconds - v_plan.base_duration_seconds)
    or p_planned_stop_seconds::bigint <> v_stop_count::bigint * v_plan.stop_duration_minutes::bigint * 60
  then raise exception using errcode = '22023', message = 'Recalculated route metrics are inconsistent.'; end if;
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) < 1 then raise exception using errcode = '22023', message = 'Recalculated route Segments are invalid.'; end if;
  for v_item in select item from jsonb_array_elements(p_segments) item loop
    if jsonb_typeof(v_item) <> 'object'
      or v_item - array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'] <> '{}'::jsonb
      or (v_item->>'segmentIndex')::integer <> v_segment_index or v_item->>'provider' <> 'mapbox'
      or v_item->>'leg' not in ('outbound','return') or (v_plan.trip_type='one_way' and v_item->>'leg'<>'outbound')
      or (v_item->>'distanceMeters')::bigint < 0 or (v_item->>'durationSeconds')::integer < 0
      or jsonb_typeof(v_item->'geometry') <> 'object' or v_item->'geometry'->>'type' <> 'LineString'
      or jsonb_typeof(v_item->'geometry'->'coordinates') <> 'array' or jsonb_array_length(v_item->'geometry'->'coordinates') < 2
      or exists(select 1 from jsonb_array_elements(v_item->'geometry'->'coordinates') coordinate
        where jsonb_typeof(coordinate)<>'array' or jsonb_array_length(coordinate)<>2
          or jsonb_typeof(coordinate->0)<>'number' or jsonb_typeof(coordinate->1)<>'number'
          or (coordinate->>0)::double precision not between -180 and 180
          or (coordinate->>1)::double precision not between -90 and 90)
    then raise exception using errcode='22023',message='Recalculated route Segment metadata is invalid.'; end if;
    v_segment_index := v_segment_index + 1;
  end loop;
  select coalesce(sum((item->>'distanceMeters')::bigint),0), coalesce(sum((item->>'durationSeconds')::bigint),0)
  into v_distance_sum, v_duration_sum from jsonb_array_elements(p_segments) item
  where item->>'provider' = 'mapbox' and item->>'leg' in ('outbound','return')
    and jsonb_typeof(item->'geometry') = 'object' and item->'geometry'->>'type' = 'LineString';
  if v_distance_sum <> p_planned_distance_meters or v_duration_sum <> p_planned_drive_seconds then
    raise exception using errcode = '22023', message = 'Recalculated route Segment totals do not match.';
  end if;
  delete from public.trip_plan_segments tps where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';
  if p_persist_geometry then
    insert into public.trip_plan_segments (trip_plan_id, route_kind, segment_index, leg, start_sequence, end_sequence, provider, distance_meters, duration_seconds, geometry)
    select v_plan.id, 'planned', (item->>'segmentIndex')::integer, item->>'leg',
      case when jsonb_typeof(item->'startSequence') = 'null' then null else (item->>'startSequence')::integer end,
      case when jsonb_typeof(item->'endSequence') = 'null' then null else (item->>'endSequence')::integer end,
      'mapbox', (item->>'distanceMeters')::bigint, (item->>'durationSeconds')::integer, item->'geometry'
    from jsonb_array_elements(p_segments) item order by (item->>'segmentIndex')::integer;
  end if;
  update public.trip_plans tp set route_provider = 'mapbox', algorithm_version = 'manual-route-v1',
    planned_distance_meters = p_planned_distance_meters, planned_drive_seconds = p_planned_drive_seconds,
    planned_stop_seconds = p_planned_stop_seconds, extra_distance_meters = p_extra_distance_meters,
    extra_duration_seconds = p_extra_duration_seconds, route_calculated_at = now(), planned_route_stale = false
  where tp.id = v_plan.id returning tp.* into v_plan;
  return query select v_plan.route_input_revision, v_plan.route_calculated_at, p_persist_geometry;
end;
$$;

-- Re-optimization may replace only unlocked algorithm rows. Manual and locked rows are fixed anchors.
create function public.admin_save_reoptimized_trip_plan(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_stops jsonb,
  p_planned_distance_meters bigint,
  p_planned_drive_seconds integer,
  p_planned_stop_seconds integer,
  p_extra_distance_meters bigint,
  p_extra_duration_seconds integer,
  p_segments jsonb,
  p_persist_geometry boolean,
  p_corridor_candidate_count integer,
  p_evaluated_candidate_count integer,
  p_unreachable_candidate_count integer,
  p_technical_limit_reached boolean,
  p_technical_limit_reason text
)
returns table (route_input_revision bigint, stop_count integer, route_calculated_at timestamptz, geometry_persisted boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_current_anchors jsonb;
  v_next_anchors jsonb;
  v_stop_count integer;
  v_item jsonb;
  v_distance_sum bigint;
  v_duration_sum bigint;
  v_segment_index integer := 0;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then raise exception using errcode = '42501', message = 'Administrator access is required.'; end if;
  select tp.* into v_plan from public.trip_plans tp where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can be re-optimized.'; end if;
  if v_plan.route_input_revision <> p_expected_revision then raise exception using errcode = '40001', message = 'The trip changed while this operation was running. Refresh and try again.'; end if;
  if jsonb_typeof(p_stops) <> 'array' then raise exception using errcode = '22023', message = 'Re-optimized Stops must be an array.'; end if;
  select coalesce(jsonb_agg(jsonb_build_object('stopId',tps.id,'stationId',tps.station_id,'leg',tps.leg,'source',tps.source,'isLocked',tps.is_locked) order by tps.sequence), '[]'::jsonb)
    into v_current_anchors from public.trip_plan_stops tps
    where tps.trip_plan_id = v_plan.id and (tps.source = 'manual' or tps.is_locked);
  select coalesce(jsonb_agg(jsonb_build_object('stopId',(item->>'stopId')::uuid,'stationId',(item->>'stationId')::uuid,'leg',item->>'leg','source',item->>'source','isLocked',(item->>'isLocked')::boolean) order by (item->>'sequence')::integer), '[]'::jsonb)
    into v_next_anchors from jsonb_array_elements(p_stops) item
    where item->>'source' = 'manual' or coalesce((item->>'isLocked')::boolean,false);
  if v_current_anchors <> v_next_anchors then raise exception using errcode = '40001', message = 'Fixed manual or locked Stops changed while re-optimizing.'; end if;
  v_stop_count := jsonb_array_length(p_stops);
  if p_corridor_candidate_count is null or p_corridor_candidate_count < 0
    or p_evaluated_candidate_count is null or p_evaluated_candidate_count < 0
    or p_unreachable_candidate_count is null or p_unreachable_candidate_count < 0
    or (p_technical_limit_reached and p_technical_limit_reason not in ('matrix_request_budget','algorithm_iteration_budget','directions_request_budget','candidate_query_budget'))
    or (not p_technical_limit_reached and p_technical_limit_reason is not null)
    or (select count(distinct item->>'stationId') from jsonb_array_elements(p_stops) item) <> v_stop_count
    or (select count(distinct (item->>'sequence')::integer) from jsonb_array_elements(p_stops) item) <> v_stop_count
    or coalesce((select min((item->>'sequence')::integer) from jsonb_array_elements(p_stops) item), 0) <> 0
    or coalesce((select max((item->>'sequence')::integer) from jsonb_array_elements(p_stops) item), -1) <> v_stop_count - 1
    or exists (
      select 1 from jsonb_array_elements(p_stops) a, jsonb_array_elements(p_stops) b
      where (a->>'sequence')::integer < (b->>'sequence')::integer and a->>'leg' = 'return' and b->>'leg' = 'outbound'
    )
  then raise exception using errcode = '22023', message = 'Re-optimized Stops must be unique and continuous.'; end if;
  for v_item in select item from jsonb_array_elements(p_stops) item loop
    if jsonb_typeof(v_item) <> 'object'
      or v_item - array['stopId','stationId','sequence','leg','source','isLocked','status','estimatedDetourSeconds','estimatedDetourMeters','corridorDistanceMeters','routeProgress','selectionRank'] <> '{}'::jsonb
      or not (v_item ?& array['stopId','stationId','sequence','leg','source','isLocked','status','estimatedDetourSeconds','estimatedDetourMeters','corridorDistanceMeters','routeProgress','selectionRank'])
      or (v_item->>'stationId') !~* '^[0-9a-f-]{36}$'
      or (v_item->>'sequence') !~ '^\d+$'
      or jsonb_typeof(v_item->'isLocked') <> 'boolean'
      or v_item->>'source' not in ('manual','algorithm') or v_item->>'leg' not in ('outbound','return')
      or v_item->>'status' <> 'planned'
      or (v_plan.trip_type = 'one_way' and v_item->>'leg' <> 'outbound')
      or (v_item->>'source' = 'manual' and not (v_item->>'isLocked')::boolean)
    then raise exception using errcode = '22023', message = 'Re-optimized Stop metadata is invalid.'; end if;
    if (v_item->>'stationId')::uuid in (v_plan.origin_station_id, v_plan.destination_station_id) then raise exception using errcode = '22023', message = 'An endpoint cannot be a Stop.'; end if;
    if not exists (select 1 from public.stations s where s.id = (v_item->>'stationId')::uuid and s.latitude between -90 and 90 and s.longitude between -180 and 180
      and ((v_item->>'source' = 'manual' or (v_item->>'isLocked')::boolean) or lower(btrim(s.operational_status)) in ('available','open'))
    ) then raise exception using errcode = 'P0002', message = 'A re-optimized Station is unavailable.'; end if;
    if v_item->>'source' = 'algorithm' and not (v_item->>'isLocked')::boolean and exists (
      select 1 from public.station_visits sv where sv.user_id = v_user_id and sv.station_id = (v_item->>'stationId')::uuid
    ) then raise exception using errcode = '22023', message = 'An unlocked algorithm Station has already been visited.'; end if;
  end loop;
  if p_planned_distance_meters < 0 or p_planned_drive_seconds < 0 or p_planned_stop_seconds < 0
    or p_extra_distance_meters < 0 or p_extra_duration_seconds < 0
    or p_planned_stop_seconds::bigint <> v_stop_count::bigint * v_plan.stop_duration_minutes::bigint * 60
    or p_extra_distance_meters <> greatest(0, p_planned_distance_meters - v_plan.base_distance_meters)
    or p_extra_duration_seconds <> greatest(0, p_planned_drive_seconds - v_plan.base_duration_seconds)
  then raise exception using errcode = '22023', message = 'Re-optimized route metrics are inconsistent.'; end if;
  if jsonb_typeof(p_segments) <> 'array' or jsonb_array_length(p_segments) < 1 then raise exception using errcode = '22023', message = 'Re-optimized route Segments are invalid.'; end if;
  for v_item in select item from jsonb_array_elements(p_segments) item loop
    if jsonb_typeof(v_item) <> 'object'
      or v_item - array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'] <> '{}'::jsonb
      or (v_item->>'segmentIndex')::integer <> v_segment_index or v_item->>'provider' <> 'mapbox'
      or v_item->>'leg' not in ('outbound','return') or (v_plan.trip_type = 'one_way' and v_item->>'leg' <> 'outbound')
      or (v_item->>'distanceMeters')::bigint < 0 or (v_item->>'durationSeconds')::integer < 0
      or jsonb_typeof(v_item->'geometry') <> 'object' or v_item->'geometry'->>'type' <> 'LineString'
      or jsonb_typeof(v_item->'geometry'->'coordinates') <> 'array' or jsonb_array_length(v_item->'geometry'->'coordinates') < 2
      or exists (select 1 from jsonb_array_elements(v_item->'geometry'->'coordinates') coordinate
        where jsonb_typeof(coordinate) <> 'array' or jsonb_array_length(coordinate) <> 2
          or jsonb_typeof(coordinate->0) <> 'number' or jsonb_typeof(coordinate->1) <> 'number'
          or (coordinate->>0)::double precision not between -180 and 180
          or (coordinate->>1)::double precision not between -90 and 90)
    then raise exception using errcode = '22023', message = 'Re-optimized route Segment metadata is invalid.'; end if;
    v_segment_index := v_segment_index + 1;
  end loop;
  select coalesce(sum((item->>'distanceMeters')::bigint),0), coalesce(sum((item->>'durationSeconds')::bigint),0)
  into v_distance_sum, v_duration_sum from jsonb_array_elements(p_segments) item;
  if v_distance_sum <> p_planned_distance_meters or v_duration_sum <> p_planned_drive_seconds then raise exception using errcode = '22023', message = 'Re-optimized Segment totals do not match.'; end if;
  set constraints trip_plan_stops_trip_sequence_key deferred;
  delete from public.trip_plan_stops tps where tps.trip_plan_id = v_plan.id;
  insert into public.trip_plan_stops (id,trip_plan_id,station_id,sequence,leg,source,is_locked,status,estimated_detour_seconds,estimated_detour_meters,corridor_distance_meters,route_progress,selection_rank)
  select coalesce((nullif(item->>'stopId',''))::uuid,gen_random_uuid()), v_plan.id, (item->>'stationId')::uuid,
    (item->>'sequence')::integer,item->>'leg',item->>'source',(item->>'isLocked')::boolean,'planned',
    (nullif(item->>'estimatedDetourSeconds',''))::integer,(nullif(item->>'estimatedDetourMeters',''))::bigint,
    (nullif(item->>'corridorDistanceMeters',''))::double precision,(nullif(item->>'routeProgress',''))::double precision,
    (nullif(item->>'selectionRank',''))::integer
  from jsonb_array_elements(p_stops) item order by (item->>'sequence')::integer;
  delete from public.trip_plan_segments tps where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';
  if p_persist_geometry then
    insert into public.trip_plan_segments (trip_plan_id,route_kind,segment_index,leg,start_sequence,end_sequence,provider,distance_meters,duration_seconds,geometry)
    select v_plan.id,'planned',(item->>'segmentIndex')::integer,item->>'leg',case when jsonb_typeof(item->'startSequence')='null' then null else (item->>'startSequence')::integer end,case when jsonb_typeof(item->'endSequence')='null' then null else (item->>'endSequence')::integer end,'mapbox',(item->>'distanceMeters')::bigint,(item->>'durationSeconds')::integer,item->'geometry'
    from jsonb_array_elements(p_segments) item;
  end if;
  update public.trip_plans tp set route_input_revision=tp.route_input_revision+1,route_provider='mapbox',algorithm_version='anchor-max-stops-v1',planned_distance_meters=p_planned_distance_meters,planned_drive_seconds=p_planned_drive_seconds,planned_stop_seconds=p_planned_stop_seconds,extra_distance_meters=p_extra_distance_meters,extra_duration_seconds=p_extra_duration_seconds,corridor_candidate_count=p_corridor_candidate_count,evaluated_candidate_count=p_evaluated_candidate_count,unreachable_candidate_count=p_unreachable_candidate_count,technical_limit_reached=p_technical_limit_reached,technical_limit_reason=p_technical_limit_reason,route_calculated_at=now(),planned_route_stale=false
  where tp.id=v_plan.id returning tp.* into v_plan;
  return query select v_plan.route_input_revision,v_stop_count,v_plan.route_calculated_at,p_persist_geometry;
end;
$$;

-- Strong-confirmation workflow: deliberately replaces every Stop, including anchors.
create function public.admin_save_regenerated_trip_plan(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_stops jsonb,
  p_planned_distance_meters bigint,
  p_planned_drive_seconds integer,
  p_planned_stop_seconds integer,
  p_extra_distance_meters bigint,
  p_extra_duration_seconds integer,
  p_segments jsonb,
  p_persist_geometry boolean,
  p_corridor_candidate_count integer,
  p_evaluated_candidate_count integer,
  p_unreachable_candidate_count integer,
  p_technical_limit_reached boolean,
  p_technical_limit_reason text
)
returns table (route_input_revision bigint, stop_count integer, route_calculated_at timestamptz, geometry_persisted boolean)
language plpgsql security definer set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_count integer;
  v_item jsonb;
  v_distance_sum bigint;
  v_duration_sum bigint;
  v_segment_index integer := 0;
begin
  if v_user_id is null then raise exception using errcode='42501',message='Authentication is required.'; end if;
  if not exists(select 1 from public.app_admins aa where aa.user_id=v_user_id) then raise exception using errcode='42501',message='Administrator access is required.'; end if;
  select tp.* into v_plan from public.trip_plans tp where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode='P0002',message='Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode='55000',message='Only draft Trip Plans can be regenerated.'; end if;
  if v_plan.route_input_revision <> p_expected_revision then raise exception using errcode='40001',message='The trip changed while this operation was running. Refresh and try again.'; end if;
  if v_plan.base_distance_meters is null or v_plan.base_duration_seconds is null
    or jsonb_typeof(p_stops) <> 'array' then raise exception using errcode='22023',message='Base Route and a Stop array are required.'; end if;
  v_count := jsonb_array_length(p_stops);
  if p_corridor_candidate_count is null or p_corridor_candidate_count < 0
    or p_evaluated_candidate_count is null or p_evaluated_candidate_count < 0
    or p_unreachable_candidate_count is null or p_unreachable_candidate_count < 0
    or (p_technical_limit_reached and p_technical_limit_reason not in ('matrix_request_budget','algorithm_iteration_budget','directions_request_budget','candidate_query_budget'))
    or (not p_technical_limit_reached and p_technical_limit_reason is not null)
    or v_count > p_corridor_candidate_count or v_count > p_evaluated_candidate_count
    or v_count + p_unreachable_candidate_count > p_evaluated_candidate_count
    or (v_plan.max_stops is not null and v_count > v_plan.max_stops)
    or (select count(distinct item->>'stationId') from jsonb_array_elements(p_stops) item) <> v_count
    or (select count(distinct (item->>'sequence')::integer) from jsonb_array_elements(p_stops) item) <> v_count
    or coalesce((select min((item->>'sequence')::integer) from jsonb_array_elements(p_stops) item),0) <> 0
    or coalesce((select max((item->>'sequence')::integer) from jsonb_array_elements(p_stops) item),-1) <> v_count - 1
    or (select count(distinct (item->>'selectionRank')::integer) from jsonb_array_elements(p_stops) item) <> v_count
    or exists (select 1 from jsonb_array_elements(p_stops) a, jsonb_array_elements(p_stops) b
      where (a->>'sequence')::integer < (b->>'sequence')::integer and a->>'leg'='return' and b->>'leg'='outbound')
  then raise exception using errcode='22023',message='Regenerated Stop counts, order, or ranks are invalid.'; end if;
  for v_item in select item from jsonb_array_elements(p_stops) item loop
    if jsonb_typeof(v_item) <> 'object'
      or v_item - array['stationId','sequence','leg','source','isLocked','status','estimatedDetourSeconds','estimatedDetourMeters','corridorDistanceMeters','routeProgress','selectionRank'] <> '{}'::jsonb
      or not (v_item ?& array['stationId','sequence','leg','source','isLocked','status','estimatedDetourSeconds','estimatedDetourMeters','corridorDistanceMeters','routeProgress','selectionRank'])
      or (v_item->>'stationId') !~* '^[0-9a-f-]{36}$' or (v_item->>'sequence') !~ '^\d+$'
      or v_item->>'source'<>'algorithm' or jsonb_typeof(v_item->'isLocked') <> 'boolean'
      or (v_item->>'isLocked')::boolean or v_item->>'status'<>'planned'
      or v_item->>'leg' not in ('outbound','return') or (v_plan.trip_type='one_way' and v_item->>'leg'<>'outbound')
      or (v_item->>'estimatedDetourSeconds')::integer < 0 or (v_item->>'estimatedDetourMeters')::bigint < 0
      or (v_item->>'corridorDistanceMeters')::double precision < 0
      or (v_item->>'routeProgress')::double precision not between 0 and 1
      or (v_item->>'selectionRank')::integer not between 1 and greatest(v_count,1)
    then raise exception using errcode='22023',message='Regenerated Stops must be valid unlocked algorithm Suggestions.'; end if;
    if (v_item->>'stationId')::uuid = v_plan.origin_station_id or (v_item->>'stationId')::uuid = v_plan.destination_station_id
      or not exists(select 1 from public.stations s where s.id=(v_item->>'stationId')::uuid
        and lower(btrim(s.operational_status)) in ('available','open')
        and s.latitude between -90 and 90 and s.longitude between -180 and 180)
    then raise exception using errcode='22023',message='A regenerated Station is not plannable.'; end if;
    if exists(select 1 from public.station_visits sv where sv.user_id=v_user_id and sv.station_id=(v_item->>'stationId')::uuid) then raise exception using errcode='22023',message='A regenerated Station has already been visited.'; end if;
  end loop;
  if p_planned_distance_meters < 0 or p_planned_drive_seconds < 0 or p_planned_stop_seconds < 0
    or p_extra_distance_meters <> greatest(0,p_planned_distance_meters-v_plan.base_distance_meters)
    or p_extra_duration_seconds <> greatest(0,p_planned_drive_seconds-v_plan.base_duration_seconds)
    or p_planned_stop_seconds::bigint <> v_count::bigint*v_plan.stop_duration_minutes::bigint*60
    or p_extra_duration_seconds>v_plan.max_extra_minutes*60
    or (v_plan.max_extra_miles is not null and p_extra_distance_meters::numeric>v_plan.max_extra_miles*1609.344)
  then raise exception using errcode='22023',message='Regenerated route exceeds the detour budget or has inconsistent Metrics.'; end if;
  if jsonb_typeof(p_segments)<>'array' or jsonb_array_length(p_segments)<1 then raise exception using errcode='22023',message='Regenerated route Segments are invalid.'; end if;
  for v_item in select item from jsonb_array_elements(p_segments) item loop
    if jsonb_typeof(v_item)<>'object'
      or v_item - array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'] <> '{}'::jsonb
      or (v_item->>'segmentIndex')::integer<>v_segment_index or v_item->>'provider'<>'mapbox'
      or v_item->>'leg' not in ('outbound','return') or (v_plan.trip_type='one_way' and v_item->>'leg'<>'outbound')
      or (v_item->>'distanceMeters')::bigint<0 or (v_item->>'durationSeconds')::integer<0
      or jsonb_typeof(v_item->'geometry')<>'object' or v_item->'geometry'->>'type'<>'LineString'
      or jsonb_typeof(v_item->'geometry'->'coordinates')<>'array' or jsonb_array_length(v_item->'geometry'->'coordinates')<2
      or exists(select 1 from jsonb_array_elements(v_item->'geometry'->'coordinates') coordinate
        where jsonb_typeof(coordinate)<>'array' or jsonb_array_length(coordinate)<>2
          or jsonb_typeof(coordinate->0)<>'number' or jsonb_typeof(coordinate->1)<>'number'
          or (coordinate->>0)::double precision not between -180 and 180
          or (coordinate->>1)::double precision not between -90 and 90)
    then raise exception using errcode='22023',message='Regenerated route Segment metadata is invalid.'; end if;
    v_segment_index:=v_segment_index+1;
  end loop;
  select sum((item->>'distanceMeters')::bigint),sum((item->>'durationSeconds')::bigint)
    into v_distance_sum,v_duration_sum from jsonb_array_elements(p_segments) item;
  if v_distance_sum<>p_planned_distance_meters or v_duration_sum<>p_planned_drive_seconds then raise exception using errcode='22023',message='Regenerated Segment totals do not match.'; end if;
  set constraints trip_plan_stops_trip_sequence_key deferred;
  delete from public.trip_plan_stops tps where tps.trip_plan_id=v_plan.id;
  insert into public.trip_plan_stops (trip_plan_id,station_id,sequence,leg,source,is_locked,status,estimated_detour_seconds,estimated_detour_meters,corridor_distance_meters,route_progress,selection_rank)
  select v_plan.id,(item->>'stationId')::uuid,(item->>'sequence')::integer,item->>'leg','algorithm',false,'planned',(item->>'estimatedDetourSeconds')::integer,(item->>'estimatedDetourMeters')::bigint,(item->>'corridorDistanceMeters')::double precision,(item->>'routeProgress')::double precision,(item->>'selectionRank')::integer from jsonb_array_elements(p_stops) item;
  delete from public.trip_plan_segments tps where tps.trip_plan_id=v_plan.id and tps.route_kind='planned';
  if p_persist_geometry then insert into public.trip_plan_segments(trip_plan_id,route_kind,segment_index,leg,start_sequence,end_sequence,provider,distance_meters,duration_seconds,geometry) select v_plan.id,'planned',(item->>'segmentIndex')::integer,item->>'leg',case when jsonb_typeof(item->'startSequence')='null' then null else (item->>'startSequence')::integer end,case when jsonb_typeof(item->'endSequence')='null' then null else (item->>'endSequence')::integer end,'mapbox',(item->>'distanceMeters')::bigint,(item->>'durationSeconds')::integer,item->'geometry' from jsonb_array_elements(p_segments) item; end if;
  update public.trip_plans tp set route_input_revision=tp.route_input_revision+1,route_provider='mapbox',algorithm_version='corridor-max-stops-v1',planned_distance_meters=p_planned_distance_meters,planned_drive_seconds=p_planned_drive_seconds,planned_stop_seconds=p_planned_stop_seconds,extra_distance_meters=p_extra_distance_meters,extra_duration_seconds=p_extra_duration_seconds,corridor_candidate_count=p_corridor_candidate_count,evaluated_candidate_count=p_evaluated_candidate_count,unreachable_candidate_count=p_unreachable_candidate_count,technical_limit_reached=p_technical_limit_reached,technical_limit_reason=p_technical_limit_reason,route_calculated_at=now(),planned_route_stale=false where tp.id=v_plan.id returning tp.* into v_plan;
  return query select v_plan.route_input_revision,v_count,v_plan.route_calculated_at,p_persist_geometry;
end;
$$;

comment on function public.admin_add_trip_plan_stop(uuid,uuid,text,integer,bigint) is 'Adds a server-owned manual, locked Stop and stales only the planned route.';
comment on function public.admin_remove_trip_plan_stop(uuid,uuid,bigint) is 'Removes one current Stop, resequences atomically, and preserves Base Route data.';
comment on function public.admin_set_trip_plan_stop_lock(uuid,uuid,boolean,bigint) is 'Locks or unlocks algorithm Stops; manual Stops are permanently locked.';
comment on function public.admin_reorder_trip_plan_stops(uuid,bigint,jsonb) is 'Validates an exact complete Stop order and optional Round Trip leg reassignment.';
comment on function public.admin_save_recalculated_trip_route(uuid,bigint,bigint,integer,integer,bigint,integer,jsonb,boolean) is 'Saves an exact Directions recalculation without enforcing the human-edit detour budget.';
comment on function public.admin_save_reoptimized_trip_plan(uuid,bigint,jsonb,bigint,integer,integer,bigint,integer,jsonb,boolean,integer,integer,integer,boolean,text) is 'Atomically preserves manual/locked anchors while replacing only unlocked algorithm Stops.';

revoke execute on function public.admin_add_trip_plan_stop(uuid,uuid,text,integer,bigint) from public,anon;
revoke execute on function public.admin_remove_trip_plan_stop(uuid,uuid,bigint) from public,anon;
revoke execute on function public.admin_set_trip_plan_stop_lock(uuid,uuid,boolean,bigint) from public,anon;
revoke execute on function public.admin_reorder_trip_plan_stops(uuid,bigint,jsonb) from public,anon;
revoke execute on function public.admin_save_recalculated_trip_route(uuid,bigint,bigint,integer,integer,bigint,integer,jsonb,boolean) from public,anon;
revoke execute on function public.admin_save_reoptimized_trip_plan(uuid,bigint,jsonb,bigint,integer,integer,bigint,integer,jsonb,boolean,integer,integer,integer,boolean,text) from public,anon;
revoke execute on function public.admin_save_regenerated_trip_plan(uuid,bigint,jsonb,bigint,integer,integer,bigint,integer,jsonb,boolean,integer,integer,integer,boolean,text) from public,anon;
revoke all on function public.sync_trip_planned_route_stale_on_full_invalidation() from public,anon,authenticated;
grant execute on function public.admin_add_trip_plan_stop(uuid,uuid,text,integer,bigint) to authenticated;
grant execute on function public.admin_remove_trip_plan_stop(uuid,uuid,bigint) to authenticated;
grant execute on function public.admin_set_trip_plan_stop_lock(uuid,uuid,boolean,bigint) to authenticated;
grant execute on function public.admin_reorder_trip_plan_stops(uuid,bigint,jsonb) to authenticated;
grant execute on function public.admin_save_recalculated_trip_route(uuid,bigint,bigint,integer,integer,bigint,integer,jsonb,boolean) to authenticated;
grant execute on function public.admin_save_reoptimized_trip_plan(uuid,bigint,jsonb,bigint,integer,integer,bigint,integer,jsonb,boolean,integer,integer,integer,boolean,text) to authenticated;
grant execute on function public.admin_save_regenerated_trip_plan(uuid,bigint,jsonb,bigint,integer,integer,bigint,integer,jsonb,boolean,integer,integer,integer,boolean,text) to authenticated;

commit;
