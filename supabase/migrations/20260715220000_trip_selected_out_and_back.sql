begin;

-- Phase 3B.4.1: atomically replace a Draft round trip with the exact Station
-- set selected by the user and a server-calculated out-and-back route.
-- Detour budgets are deliberately informational for this manual selection mode.
create function public.admin_save_selected_out_and_back_route(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_selected_station_ids uuid[],
  p_stops jsonb,
  p_planned_distance_meters bigint,
  p_planned_drive_seconds integer,
  p_planned_stop_seconds integer,
  p_extra_distance_meters bigint,
  p_extra_duration_seconds integer,
  p_segments jsonb,
  p_persist_geometry boolean,
  p_algorithm_version text
)
returns table (
  route_input_revision bigint,
  stop_count integer,
  route_calculated_at timestamptz,
  geometry_persisted boolean
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_stop_count integer;
  v_item jsonb;
  v_segment_index integer := 0;
  v_distance_sum bigint;
  v_duration_sum bigint;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  select tp.* into v_plan
  from public.trip_plans tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can save a selected route.';
  end if;
  if v_plan.trip_type <> 'round_trip' then
    raise exception using errcode = '22023', message = 'Selected out-and-back routing requires a round trip.';
  end if;
  if v_plan.route_input_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Stale route result. Refresh and try again.';
  end if;
  if v_plan.origin_latitude is null or v_plan.origin_longitude is null
    or v_plan.destination_latitude is null or v_plan.destination_longitude is null
    or v_plan.base_distance_meters is null or v_plan.base_duration_seconds is null then
    raise exception using errcode = '22023', message = 'Saved endpoints and a Base Route are required.';
  end if;
  if p_algorithm_version is distinct from 'selected-out-and-back-v1' then
    raise exception using errcode = '22023', message = 'Selected route algorithm version is invalid.';
  end if;
  if p_selected_station_ids is null or jsonb_typeof(p_stops) <> 'array' then
    raise exception using errcode = '22023', message = 'Selected Station IDs and Stops are required.';
  end if;

  v_stop_count := jsonb_array_length(p_stops);
  if cardinality(p_selected_station_ids) <> v_stop_count
    or exists (select 1 from unnest(p_selected_station_ids) selected_id where selected_id is null)
    or (select count(distinct selected_id) from unnest(p_selected_station_ids) selected_id) <> v_stop_count
    or (select count(distinct item->>'stationId') from jsonb_array_elements(p_stops) item) <> v_stop_count
    or exists (
      select selected_id from unnest(p_selected_station_ids) selected_id
      except select (item->>'stationId')::uuid from jsonb_array_elements(p_stops) item
    )
    or exists (
      select (item->>'stationId')::uuid from jsonb_array_elements(p_stops) item
      except select selected_id from unnest(p_selected_station_ids) selected_id
    )
    or (select count(distinct (item->>'sequence')::integer) from jsonb_array_elements(p_stops) item) <> v_stop_count
    or coalesce((select min((item->>'sequence')::integer) from jsonb_array_elements(p_stops) item), 0) <> 0
    or coalesce((select max((item->>'sequence')::integer) from jsonb_array_elements(p_stops) item), -1) <> v_stop_count - 1
    or exists (
      select 1 from jsonb_array_elements(p_stops) earlier, jsonb_array_elements(p_stops) later
      where (earlier->>'sequence')::integer < (later->>'sequence')::integer
        and earlier->>'leg' = 'return' and later->>'leg' = 'outbound'
    ) then
    raise exception using errcode = '22023', message = 'Selected Stops must exactly match a unique continuous Station set.';
  end if;

  for v_item in select item from jsonb_array_elements(p_stops) item loop
    if jsonb_typeof(v_item) <> 'object'
      or v_item - array['stationId','sequence','leg','source','isLocked','status'] <> '{}'::jsonb
      or not (v_item ?& array['stationId','sequence','leg','source','isLocked','status'])
      or (v_item->>'stationId') !~* '^[0-9a-f-]{36}$'
      or (v_item->>'sequence') !~ '^\d+$'
      or v_item->>'leg' not in ('outbound','return')
      or v_item->>'source' <> 'manual'
      or jsonb_typeof(v_item->'isLocked') <> 'boolean'
      or not (v_item->>'isLocked')::boolean
      or v_item->>'status' <> 'planned' then
      raise exception using errcode = '22023', message = 'Selected Stop metadata is invalid.';
    end if;
    if (v_item->>'stationId')::uuid = v_plan.origin_station_id
      or (v_item->>'stationId')::uuid = v_plan.destination_station_id
      or not exists (
        select 1 from public.stations s
        where s.id = (v_item->>'stationId')::uuid
          and lower(btrim(s.operational_status)) in ('available','open')
          and s.latitude between -90 and 90
          and s.longitude between -180 and 180
      ) then
      raise exception using errcode = '22023', message = 'A selected Station is not plannable.';
    end if;
  end loop;

  if p_planned_distance_meters is null or p_planned_distance_meters < 0
    or p_planned_drive_seconds is null or p_planned_drive_seconds < 0
    or p_planned_stop_seconds is null or p_planned_stop_seconds < 0
    or p_extra_distance_meters is null or p_extra_distance_meters < 0
    or p_extra_duration_seconds is null or p_extra_duration_seconds < 0
    or p_planned_stop_seconds::bigint <> v_stop_count::bigint * v_plan.stop_duration_minutes::bigint * 60
    or p_extra_distance_meters <> greatest(0, p_planned_distance_meters - v_plan.base_distance_meters)
    or p_extra_duration_seconds <> greatest(0, p_planned_drive_seconds - v_plan.base_duration_seconds) then
    raise exception using errcode = '22023', message = 'Selected route metrics are inconsistent.';
  end if;

  if p_persist_geometry is null or jsonb_typeof(p_segments) <> 'array'
    or jsonb_array_length(p_segments) < 2 then
    raise exception using errcode = '22023', message = 'Selected route Segments are invalid.';
  end if;
  for v_item in select item from jsonb_array_elements(p_segments) item loop
    if jsonb_typeof(v_item) <> 'object'
      or v_item - array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'] <> '{}'::jsonb
      or not (v_item ?& array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'])
      or (v_item->>'segmentIndex')::integer <> v_segment_index
      or v_item->>'provider' <> 'mapbox'
      or v_item->>'leg' not in ('outbound','return')
      or (v_item->>'distanceMeters')::bigint < 0
      or (v_item->>'durationSeconds')::integer < 0
      or jsonb_typeof(v_item->'geometry') <> 'object'
      or v_item->'geometry'->>'type' <> 'LineString'
      or jsonb_typeof(v_item->'geometry'->'coordinates') <> 'array'
      or jsonb_array_length(v_item->'geometry'->'coordinates') < 2
      or exists (
        select 1 from jsonb_array_elements(v_item->'geometry'->'coordinates') coordinate
        where jsonb_typeof(coordinate) <> 'array' or jsonb_array_length(coordinate) <> 2
          or jsonb_typeof(coordinate->0) <> 'number' or jsonb_typeof(coordinate->1) <> 'number'
          or (coordinate->>0)::double precision not between -180 and 180
          or (coordinate->>1)::double precision not between -90 and 90
      )
      or (
        jsonb_typeof(v_item->'startSequence') <> 'null'
        and not exists (
          select 1 from jsonb_array_elements(p_stops) stop
          where (stop->>'sequence')::integer = (v_item->>'startSequence')::integer
            and stop->>'leg' = v_item->>'leg'
        )
      )
      or (
        jsonb_typeof(v_item->'endSequence') <> 'null'
        and not exists (
          select 1 from jsonb_array_elements(p_stops) stop
          where (stop->>'sequence')::integer = (v_item->>'endSequence')::integer
            and stop->>'leg' = v_item->>'leg'
        )
      ) then
      raise exception using errcode = '22023', message = 'Selected route Segment metadata is invalid.';
    end if;
    v_segment_index := v_segment_index + 1;
  end loop;
  if (p_segments->0->>'leg') <> 'outbound'
    or (p_segments->(jsonb_array_length(p_segments) - 1)->>'leg') <> 'return'
    or not exists (select 1 from jsonb_array_elements(p_segments) item where item->>'leg' = 'outbound')
    or not exists (select 1 from jsonb_array_elements(p_segments) item where item->>'leg' = 'return')
    or exists (
      select 1 from jsonb_array_elements(p_segments) earlier, jsonb_array_elements(p_segments) later
      where (earlier->>'segmentIndex')::integer < (later->>'segmentIndex')::integer
        and earlier->>'leg' = 'return' and later->>'leg' = 'outbound'
    )
    or exists (
      select 1
      from (
        select item,
          row_number() over (partition by item->>'leg' order by (item->>'segmentIndex')::integer) as leg_row,
          row_number() over (partition by item->>'leg' order by (item->>'segmentIndex')::integer desc) as reverse_leg_row,
          lag(item->'endSequence') over (partition by item->>'leg' order by (item->>'segmentIndex')::integer) as prior_end
        from jsonb_array_elements(p_segments) item
      ) ordered
      where (ordered.leg_row = 1 and jsonb_typeof(ordered.item->'startSequence') <> 'null')
        or (ordered.reverse_leg_row = 1 and jsonb_typeof(ordered.item->'endSequence') <> 'null')
        or (ordered.leg_row > 1 and ordered.item->'startSequence' is distinct from ordered.prior_end)
    ) then
    raise exception using errcode = '22023', message = 'Selected route Segment sequence is not continuous.';
  end if;

  select coalesce(sum((item->>'distanceMeters')::bigint), 0),
    coalesce(sum((item->>'durationSeconds')::bigint), 0)
  into v_distance_sum, v_duration_sum
  from jsonb_array_elements(p_segments) item;
  if v_distance_sum <> p_planned_distance_meters or v_duration_sum <> p_planned_drive_seconds then
    raise exception using errcode = '22023', message = 'Selected route Segment totals do not match.';
  end if;

  set constraints trip_plan_stops_trip_sequence_key deferred;
  delete from public.trip_plan_stops tps where tps.trip_plan_id = v_plan.id;
  insert into public.trip_plan_stops (
    trip_plan_id, station_id, sequence, leg, source, is_locked, status,
    estimated_detour_seconds, estimated_detour_meters, corridor_distance_meters,
    route_progress, selection_rank
  )
  select v_plan.id, (item->>'stationId')::uuid, (item->>'sequence')::integer,
    item->>'leg', 'manual', true, 'planned', null, null, null, null, null
  from jsonb_array_elements(p_stops) item
  order by (item->>'sequence')::integer;

  delete from public.trip_plan_segments tps
  where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';
  if p_persist_geometry then
    insert into public.trip_plan_segments (
      trip_plan_id, route_kind, segment_index, leg, start_sequence, end_sequence,
      provider, distance_meters, duration_seconds, geometry
    )
    select v_plan.id, 'planned', (item->>'segmentIndex')::integer, item->>'leg',
      case when jsonb_typeof(item->'startSequence') = 'null' then null else (item->>'startSequence')::integer end,
      case when jsonb_typeof(item->'endSequence') = 'null' then null else (item->>'endSequence')::integer end,
      'mapbox', (item->>'distanceMeters')::bigint, (item->>'durationSeconds')::integer,
      item->'geometry'
    from jsonb_array_elements(p_segments) item;
  end if;

  update public.trip_plans tp set
    route_input_revision = tp.route_input_revision + 1,
    route_provider = 'mapbox',
    algorithm_version = p_algorithm_version,
    planned_distance_meters = p_planned_distance_meters,
    planned_drive_seconds = p_planned_drive_seconds,
    planned_stop_seconds = p_planned_stop_seconds,
    extra_distance_meters = p_extra_distance_meters,
    extra_duration_seconds = p_extra_duration_seconds,
    corridor_candidate_count = null,
    evaluated_candidate_count = null,
    unreachable_candidate_count = null,
    technical_limit_reached = false,
    technical_limit_reason = null,
    route_calculated_at = now(),
    planned_route_stale = false
  where tp.id = v_plan.id
  returning tp.* into v_plan;

  return query select v_plan.route_input_revision, v_stop_count,
    v_plan.route_calculated_at, p_persist_geometry;
end;
$$;

comment on function public.admin_save_selected_out_and_back_route(
  uuid, bigint, uuid[], jsonb, bigint, integer, integer, bigint, integer, jsonb, boolean, text
) is 'Atomically saves every user-selected Station exactly once in a directed round-trip route; detour budgets are informational.';

revoke all on function public.admin_save_selected_out_and_back_route(
  uuid, bigint, uuid[], jsonb, bigint, integer, integer, bigint, integer, jsonb, boolean, text
) from public, anon;
grant execute on function public.admin_save_selected_out_and_back_route(
  uuid, bigint, uuid[], jsonb, bigint, integer, integer, bigint, integer, jsonb, boolean, text
) to authenticated;

commit;
