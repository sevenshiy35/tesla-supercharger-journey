begin;

alter table public.trip_plan_segments
  add column route_kind text not null default 'base';

alter table public.trip_plan_segments
  add constraint trip_plan_segments_route_kind_check
  check (route_kind in ('base', 'planned'));

alter table public.trip_plan_segments
  drop constraint trip_plan_segments_trip_index_key;

alter table public.trip_plan_segments
  add constraint trip_plan_segments_trip_kind_index_key
  unique (trip_plan_id, route_kind, segment_index);

alter table public.trip_plan_stops
  add column corridor_distance_meters double precision,
  add column route_progress double precision,
  add column selection_rank integer;

alter table public.trip_plan_stops
  add constraint trip_plan_stops_corridor_distance_check
    check (corridor_distance_meters is null or corridor_distance_meters >= 0),
  add constraint trip_plan_stops_route_progress_check
    check (route_progress is null or route_progress between 0 and 1),
  add constraint trip_plan_stops_selection_rank_check
    check (selection_rank is null or selection_rank > 0);

create unique index trip_plan_stops_trip_selection_rank_key
  on public.trip_plan_stops (trip_plan_id, selection_rank)
  where selection_rank is not null;

alter table public.trip_plans
  add column corridor_candidate_count integer,
  add column evaluated_candidate_count integer,
  add column unreachable_candidate_count integer,
  add column technical_limit_reached boolean not null default false,
  add column technical_limit_reason text;

alter table public.trip_plans
  add constraint trip_plans_corridor_candidate_count_check
    check (corridor_candidate_count is null or corridor_candidate_count >= 0),
  add constraint trip_plans_evaluated_candidate_count_check
    check (evaluated_candidate_count is null or evaluated_candidate_count >= 0),
  add constraint trip_plans_unreachable_candidate_count_check
    check (unreachable_candidate_count is null or unreachable_candidate_count >= 0),
  add constraint trip_plans_candidate_count_order_check
    check (
      corridor_candidate_count is null
      or evaluated_candidate_count is null
      or evaluated_candidate_count <= corridor_candidate_count
    ),
  add constraint trip_plans_unreachable_count_order_check
    check (
      unreachable_candidate_count is null
      or evaluated_candidate_count is null
      or unreachable_candidate_count <= evaluated_candidate_count
    ),
  add constraint trip_plans_technical_limit_reason_check
    check (
      (not technical_limit_reached and technical_limit_reason is null)
      or (
        technical_limit_reached
        and technical_limit_reason in (
          'matrix_request_budget',
          'algorithm_iteration_budget',
          'directions_request_budget',
          'candidate_query_budget'
        )
      )
    );

create function public.clear_trip_suggestion_audit_on_revision()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.route_input_revision is distinct from old.route_input_revision then
    new.corridor_candidate_count := null;
    new.evaluated_candidate_count := null;
    new.unreachable_candidate_count := null;
    new.technical_limit_reached := false;
    new.technical_limit_reason := null;
  end if;
  return new;
end;
$$;

create trigger trip_plans_clear_suggestion_audit_on_revision
before update of route_input_revision on public.trip_plans
for each row execute function public.clear_trip_suggestion_audit_on_revision();

create function public.clear_trip_suggestions_on_base_route_save()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.algorithm_version = 'base-route-v1'
    and old.algorithm_version is distinct from new.algorithm_version then
    delete from public.trip_plan_stops as tps
    where tps.trip_plan_id = new.id and tps.source = 'algorithm' and not tps.is_locked;
    delete from public.trip_plan_segments as tps
    where tps.trip_plan_id = new.id and tps.route_kind = 'planned';
  end if;
  return new;
end;
$$;

create trigger trip_plans_clear_suggestions_on_base_route_save
after update of algorithm_version on public.trip_plans
for each row execute function public.clear_trip_suggestions_on_base_route_save();

create function public.admin_save_trip_plan_suggestions(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_algorithm_version text,
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
returns table (
  trip_plan_id uuid,
  route_input_revision bigint,
  selected_stop_count integer,
  planned_distance_meters bigint,
  planned_drive_seconds integer,
  planned_stop_seconds integer,
  extra_distance_meters bigint,
  extra_duration_seconds integer,
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
  v_stop jsonb;
  v_segment jsonb;
  v_geometry jsonb;
  v_coordinate jsonb;
  v_station_id uuid;
  v_stop_count integer;
  v_sequence integer := 0;
  v_selection_rank_count integer;
  v_seen_return boolean := false;
  v_seen_return_segment boolean := false;
  v_segment_index integer := 0;
  v_start_sequence integer;
  v_end_sequence integer;
  v_distance_sum bigint := 0;
  v_duration_sum bigint := 0;
  v_coordinate_count integer := 0;
  v_longitude double precision;
  v_latitude double precision;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_algorithm_version is distinct from 'corridor-max-stops-v1' then
    raise exception using errcode = '22023', message = 'Unsupported Trip suggestion algorithm version.';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 or p_persist_geometry is null then
    raise exception using errcode = '22023', message = 'Suggestion request metadata is invalid.';
  end if;
  if p_stops is null or jsonb_typeof(p_stops) <> 'array' or pg_column_size(p_stops) > 1048576 then
    raise exception using errcode = '22023', message = 'Suggested Stops payload is invalid or too large.';
  end if;
  if p_segments is null or jsonb_typeof(p_segments) <> 'array' or pg_column_size(p_segments) > 8388608 then
    raise exception using errcode = '22023', message = 'Planned route Segment payload is invalid or too large.';
  end if;
  if p_corridor_candidate_count is null or p_corridor_candidate_count < 0
    or p_evaluated_candidate_count is null or p_evaluated_candidate_count < 0
    or p_evaluated_candidate_count > p_corridor_candidate_count
    or p_unreachable_candidate_count is null or p_unreachable_candidate_count < 0
    or p_unreachable_candidate_count > p_evaluated_candidate_count then
    raise exception using errcode = '22023', message = 'Suggestion audit counts are invalid.';
  end if;
  if p_technical_limit_reached is null
    or (not p_technical_limit_reached and p_technical_limit_reason is not null)
    or (p_technical_limit_reached and (p_technical_limit_reason is null or p_technical_limit_reason not in (
      'matrix_request_budget', 'algorithm_iteration_budget',
      'directions_request_budget', 'candidate_query_budget'
    ))) then
    raise exception using errcode = '22023', message = 'Suggestion technical limit state is invalid.';
  end if;

  select tp.* into v_plan
  from public.trip_plans as tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;
  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can save suggestions.';
  end if;
  if v_plan.route_input_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Stale route result. The Trip inputs changed while suggestions were calculating.';
  end if;
  if v_plan.origin_source is null or v_plan.destination_source is null
    or v_plan.origin_latitude is null or v_plan.origin_longitude is null
    or v_plan.destination_latitude is null or v_plan.destination_longitude is null
    or v_plan.base_distance_meters is null or v_plan.base_duration_seconds is null then
    raise exception using errcode = '22023', message = 'Endpoints and Base Metrics are required before saving suggestions.';
  end if;
  if (v_plan.origin_source = 'station' and v_plan.origin_station_id is null)
    or (v_plan.destination_source = 'station' and v_plan.destination_station_id is null) then
    raise exception using errcode = '22023', message = 'A Station endpoint is no longer available.';
  end if;
  if exists (
    select 1 from public.trip_plan_stops as tps
    where tps.trip_plan_id = v_plan.id and (tps.source <> 'algorithm' or tps.is_locked)
  ) then
    raise exception using errcode = '55000', message = 'Manual or locked Stops require the Phase 3B.4 regeneration workflow.';
  end if;

  v_stop_count := jsonb_array_length(p_stops);
  if v_stop_count > p_corridor_candidate_count
    or v_stop_count > p_evaluated_candidate_count
    or v_stop_count + p_unreachable_candidate_count > p_evaluated_candidate_count
    or (v_plan.max_stops is not null and v_stop_count > v_plan.max_stops) then
    raise exception using errcode = '22023', message = 'Suggested Stop count exceeds the compatible limit.';
  end if;
  if p_planned_distance_meters is null or p_planned_distance_meters < 0
    or p_planned_drive_seconds is null or p_planned_drive_seconds < 0
    or p_planned_stop_seconds is null or p_planned_stop_seconds < 0
    or p_extra_distance_meters is null or p_extra_distance_meters < 0
    or p_extra_duration_seconds is null or p_extra_duration_seconds < 0
    or p_extra_distance_meters <> greatest(0, p_planned_distance_meters - v_plan.base_distance_meters)
    or p_extra_duration_seconds <> greatest(0, p_planned_drive_seconds - v_plan.base_duration_seconds)
    or p_planned_stop_seconds::bigint <> v_stop_count::bigint * v_plan.stop_duration_minutes::bigint * 60
    or p_extra_duration_seconds::bigint > v_plan.max_extra_minutes::bigint * 60
    or (v_plan.max_extra_miles is not null and p_extra_distance_meters::numeric > v_plan.max_extra_miles * 1609.344) then
    raise exception using errcode = '22023', message = 'Planned route metrics exceed the detour budget or are inconsistent.';
  end if;

  for v_stop in select value from jsonb_array_elements(p_stops)
  loop
    if jsonb_typeof(v_stop) <> 'object'
      or not (v_stop ?& array[
        'stationId','sequence','leg','source','isLocked','status',
        'estimatedDetourSeconds','estimatedDetourMeters','corridorDistanceMeters',
        'routeProgress','selectionRank'
      ])
      or v_stop - array[
        'stationId','sequence','leg','source','isLocked','status',
        'estimatedDetourSeconds','estimatedDetourMeters','corridorDistanceMeters',
        'routeProgress','selectionRank'
      ] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'Suggested Stop shape is invalid.';
    end if;
    if jsonb_typeof(v_stop->'stationId') <> 'string'
      or (v_stop->>'stationId') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(v_stop->'sequence') <> 'number'
      or (v_stop->>'sequence') !~ '^\d+$'
      or (v_stop->>'sequence')::integer <> v_sequence
      or jsonb_typeof(v_stop->'leg') <> 'string'
      or v_stop->>'leg' not in ('outbound', 'return')
      or jsonb_typeof(v_stop->'source') <> 'string'
      or v_stop->>'source' <> 'algorithm'
      or jsonb_typeof(v_stop->'isLocked') <> 'boolean'
      or (v_stop->>'isLocked')::boolean
      or jsonb_typeof(v_stop->'status') <> 'string'
      or v_stop->>'status' <> 'planned' then
      raise exception using errcode = '22023', message = 'Suggested Stop metadata is invalid.';
    end if;
    if v_plan.trip_type = 'one_way' and v_stop->>'leg' <> 'outbound' then
      raise exception using errcode = '22023', message = 'One-way Suggestions cannot contain a return Stop.';
    end if;
    if v_stop->>'leg' = 'return' then v_seen_return := true; end if;
    if v_seen_return and v_stop->>'leg' = 'outbound' then
      raise exception using errcode = '22023', message = 'Outbound Stops must precede return Stops.';
    end if;
    if jsonb_typeof(v_stop->'estimatedDetourSeconds') <> 'number'
      or (v_stop->>'estimatedDetourSeconds') !~ '^\d+$'
      or jsonb_typeof(v_stop->'estimatedDetourMeters') <> 'number'
      or (v_stop->>'estimatedDetourMeters') !~ '^\d+$'
      or jsonb_typeof(v_stop->'corridorDistanceMeters') <> 'number'
      or (v_stop->>'corridorDistanceMeters')::double precision < 0
      or jsonb_typeof(v_stop->'routeProgress') <> 'number'
      or (v_stop->>'routeProgress')::double precision not between 0 and 1
      or jsonb_typeof(v_stop->'selectionRank') <> 'number'
      or (v_stop->>'selectionRank') !~ '^\d+$'
      or (v_stop->>'selectionRank')::integer not between 1 and greatest(v_stop_count, 1) then
      raise exception using errcode = '22023', message = 'Suggested Stop measurements are invalid.';
    end if;
    v_station_id := (v_stop->>'stationId')::uuid;
    if v_station_id = v_plan.origin_station_id or v_station_id = v_plan.destination_station_id then
      raise exception using errcode = '22023', message = 'An endpoint Station cannot also be a Suggested Stop.';
    end if;
    if not exists (
      select 1 from public.stations as s
      where s.id = v_station_id
        and lower(btrim(s.operational_status)) in ('available', 'open')
        and upper(btrim(s.country)) in ('US', 'USA', 'UNITED STATES', 'UNITED STATES OF AMERICA')
        and s.latitude between -90 and 90 and s.longitude between -180 and 180
    ) then
      raise exception using errcode = 'P0002', message = 'A Suggested Station does not exist or is not currently plannable.';
    end if;
    if exists (
      select 1 from public.station_visits as sv
      where sv.user_id = v_user_id and sv.station_id = v_station_id
    ) then
      raise exception using errcode = '22023', message = 'A Suggested Station has already been visited.';
    end if;
    if exists (
      select 1 from jsonb_array_elements(p_stops) as duplicate(item)
      where duplicate.item->>'stationId' = v_stop->>'stationId'
      group by duplicate.item->>'stationId' having count(*) > 1
    ) then
      raise exception using errcode = '22023', message = 'Suggested Stations must be unique.';
    end if;
    v_sequence := v_sequence + 1;
  end loop;

  select count(distinct (item->>'selectionRank')::integer)
  into v_selection_rank_count
  from jsonb_array_elements(p_stops) as ranks(item);
  if v_selection_rank_count <> v_stop_count then
    raise exception using errcode = '22023', message = 'Selection ranks must be unique and continuous.';
  end if;

  if jsonb_array_length(p_segments) < 1 then
    raise exception using errcode = '22023', message = 'Planned route has an invalid Segment count.';
  end if;
  for v_segment in select value from jsonb_array_elements(p_segments)
  loop
    if jsonb_typeof(v_segment) <> 'object'
      or not (v_segment ?& array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'])
      or v_segment - array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'] <> '{}'::jsonb
      or jsonb_typeof(v_segment->'segmentIndex') <> 'number'
      or (v_segment->>'segmentIndex') !~ '^\d+$'
      or (v_segment->>'segmentIndex')::integer <> v_segment_index
      or jsonb_typeof(v_segment->'leg') <> 'string'
      or v_segment->>'leg' not in ('outbound', 'return')
      or (v_plan.trip_type = 'one_way' and v_segment->>'leg' <> 'outbound')
      or jsonb_typeof(v_segment->'provider') <> 'string'
      or v_segment->>'provider' <> 'mapbox'
      or jsonb_typeof(v_segment->'distanceMeters') <> 'number'
      or (v_segment->>'distanceMeters') !~ '^\d+$'
      or jsonb_typeof(v_segment->'durationSeconds') <> 'number'
      or (v_segment->>'durationSeconds') !~ '^\d+$' then
      raise exception using errcode = '22023', message = 'Planned route Segment metadata is invalid.';
    end if;
    if not (
      jsonb_typeof(v_segment->'startSequence') = 'null'
      or (jsonb_typeof(v_segment->'startSequence') = 'number' and (v_segment->>'startSequence') ~ '^\d+$')
    ) or not (
      jsonb_typeof(v_segment->'endSequence') = 'null'
      or (jsonb_typeof(v_segment->'endSequence') = 'number' and (v_segment->>'endSequence') ~ '^\d+$')
    ) then
      raise exception using errcode = '22023', message = 'Planned route Segment boundaries are invalid.';
    end if;
    if v_segment->>'leg' = 'return' then
      v_seen_return_segment := true;
    elsif v_seen_return_segment then
      raise exception using errcode = '22023', message = 'Outbound Segments must precede return Segments.';
    end if;
    v_start_sequence := case when jsonb_typeof(v_segment->'startSequence') = 'null'
      then null else (v_segment->>'startSequence')::integer end;
    v_end_sequence := case when jsonb_typeof(v_segment->'endSequence') = 'null'
      then null else (v_segment->>'endSequence')::integer end;
    if (v_start_sequence is not null and v_start_sequence >= v_stop_count)
      or (v_end_sequence is not null and v_end_sequence >= v_stop_count)
      or (v_stop_count = 0 and (v_start_sequence is not null or v_end_sequence is not null))
      or (v_start_sequence is not null and p_stops->v_start_sequence->>'leg' <> v_segment->>'leg')
      or (v_end_sequence is not null and p_stops->v_end_sequence->>'leg' <> v_segment->>'leg') then
      raise exception using errcode = '22023', message = 'Planned route Segment boundaries do not match Suggested Stops.';
    end if;
    v_geometry := v_segment->'geometry';
    if jsonb_typeof(v_geometry) <> 'object'
      or not (v_geometry ?& array['type','coordinates'])
      or v_geometry - array['type','coordinates'] <> '{}'::jsonb
      or v_geometry->>'type' <> 'LineString'
      or jsonb_typeof(v_geometry->'coordinates') <> 'array'
      or jsonb_array_length(v_geometry->'coordinates') < 2 then
      raise exception using errcode = '22023', message = 'Planned route Geometry must be a valid LineString.';
    end if;
    for v_coordinate in select value from jsonb_array_elements(v_geometry->'coordinates')
    loop
      v_coordinate_count := v_coordinate_count + 1;
      if v_coordinate_count > 100000
        or jsonb_typeof(v_coordinate) <> 'array'
        or jsonb_array_length(v_coordinate) <> 2
        or jsonb_typeof(v_coordinate->0) <> 'number'
        or jsonb_typeof(v_coordinate->1) <> 'number' then
        raise exception using errcode = '22023', message = 'Planned route Geometry coordinates are invalid or too large.';
      end if;
      v_longitude := (v_coordinate->>0)::double precision;
      v_latitude := (v_coordinate->>1)::double precision;
      if v_longitude not between -180 and 180 or v_latitude not between -90 and 90 then
        raise exception using errcode = '22023', message = 'Planned route Geometry coordinates are out of range.';
      end if;
    end loop;
    v_distance_sum := v_distance_sum + (v_segment->>'distanceMeters')::bigint;
    v_duration_sum := v_duration_sum + (v_segment->>'durationSeconds')::bigint;
    v_segment_index := v_segment_index + 1;
  end loop;
  if v_distance_sum <> p_planned_distance_meters or v_duration_sum <> p_planned_drive_seconds then
    raise exception using errcode = '22023', message = 'Planned route totals do not match Segment metrics.';
  end if;

  delete from public.trip_plan_stops as tps
  where tps.trip_plan_id = v_plan.id and tps.source = 'algorithm' and not tps.is_locked;
  delete from public.trip_plan_segments as tps
  where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';

  insert into public.trip_plan_stops (
    trip_plan_id, station_id, sequence, leg, source, is_locked, status,
    estimated_detour_seconds, estimated_detour_meters, corridor_distance_meters,
    route_progress, selection_rank
  )
  select
    v_plan.id,
    (item->>'stationId')::uuid,
    (item->>'sequence')::integer,
    item->>'leg',
    'algorithm',
    false,
    'planned',
    (item->>'estimatedDetourSeconds')::integer,
    (item->>'estimatedDetourMeters')::bigint,
    (item->>'corridorDistanceMeters')::double precision,
    (item->>'routeProgress')::double precision,
    (item->>'selectionRank')::integer
  from jsonb_array_elements(p_stops) as stops(item)
  order by (item->>'sequence')::integer;

  if p_persist_geometry then
    insert into public.trip_plan_segments (
      trip_plan_id, route_kind, segment_index, leg, start_sequence, end_sequence,
      provider, distance_meters, duration_seconds, geometry
    )
    select
      v_plan.id,
      'planned',
      (item->>'segmentIndex')::integer,
      item->>'leg',
      case when jsonb_typeof(item->'startSequence') = 'null' then null else (item->>'startSequence')::integer end,
      case when jsonb_typeof(item->'endSequence') = 'null' then null else (item->>'endSequence')::integer end,
      'mapbox',
      (item->>'distanceMeters')::bigint,
      (item->>'durationSeconds')::integer,
      item->'geometry'
    from jsonb_array_elements(p_segments) as segments(item)
    order by (item->>'segmentIndex')::integer;
  end if;

  update public.trip_plans as tp
  set
    route_provider = 'mapbox',
    algorithm_version = 'corridor-max-stops-v1',
    planned_distance_meters = p_planned_distance_meters,
    planned_drive_seconds = p_planned_drive_seconds,
    planned_stop_seconds = p_planned_stop_seconds,
    extra_distance_meters = p_extra_distance_meters,
    extra_duration_seconds = p_extra_duration_seconds,
    corridor_candidate_count = p_corridor_candidate_count,
    evaluated_candidate_count = p_evaluated_candidate_count,
    unreachable_candidate_count = p_unreachable_candidate_count,
    technical_limit_reached = p_technical_limit_reached,
    technical_limit_reason = p_technical_limit_reason,
    route_calculated_at = now()
  where tp.id = v_plan.id
  returning tp.* into v_plan;

  return query select
    v_plan.id, v_plan.route_input_revision, v_stop_count,
    v_plan.planned_distance_meters, v_plan.planned_drive_seconds,
    v_plan.planned_stop_seconds, v_plan.extra_distance_meters,
    v_plan.extra_duration_seconds, v_plan.route_calculated_at, p_persist_geometry;
end;
$$;

create function public.admin_clear_trip_plan_suggestions(p_trip_plan_id uuid)
returns table (
  trip_plan_id uuid,
  route_input_revision bigint,
  planned_distance_meters bigint,
  planned_drive_seconds integer,
  planned_stop_seconds integer,
  extra_distance_meters bigint,
  extra_duration_seconds integer,
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
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  select tp.* into v_plan
  from public.trip_plans as tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can clear suggestions.';
  end if;
  if v_plan.base_distance_meters is null or v_plan.base_duration_seconds is null then
    raise exception using errcode = '22023', message = 'A Base Route is required before clearing suggestions.';
  end if;
  if exists (
    select 1 from public.trip_plan_stops as tps
    where tps.trip_plan_id = v_plan.id and (tps.source <> 'algorithm' or tps.is_locked)
  ) then
    raise exception using errcode = '55000', message = 'Manual or locked Stops require the Phase 3B.4 clear workflow.';
  end if;

  delete from public.trip_plan_stops as tps
  where tps.trip_plan_id = v_plan.id and tps.source = 'algorithm' and not tps.is_locked;
  delete from public.trip_plan_segments as tps
  where tps.trip_plan_id = v_plan.id and tps.route_kind = 'planned';

  update public.trip_plans as tp
  set
    algorithm_version = 'base-route-v1',
    planned_distance_meters = tp.base_distance_meters,
    planned_drive_seconds = tp.base_duration_seconds,
    planned_stop_seconds = 0,
    extra_distance_meters = 0,
    extra_duration_seconds = 0,
    corridor_candidate_count = null,
    evaluated_candidate_count = null,
    unreachable_candidate_count = null,
    technical_limit_reached = false,
    technical_limit_reason = null,
    route_calculated_at = now()
  where tp.id = v_plan.id
  returning tp.* into v_plan;

  return query select
    v_plan.id, v_plan.route_input_revision, v_plan.planned_distance_meters,
    v_plan.planned_drive_seconds, v_plan.planned_stop_seconds,
    v_plan.extra_distance_meters, v_plan.extra_duration_seconds, v_plan.updated_at;
end;
$$;

comment on column public.trip_plan_segments.route_kind is
  'Separates the saved base route from the generated planned route without imposing a user Stop limit.';
comment on column public.trip_plan_stops.selection_rank is
  'Deterministic one-based greedy selection order; sequence remains the final route order.';
comment on column public.trip_plans.technical_limit_reached is
  'True only when an internal API/query/iteration guard ended analysis. It is not a user business limit.';
comment on function public.admin_save_trip_plan_suggestions(uuid, bigint, text, jsonb, bigint, integer, integer, bigint, integer, jsonb, boolean, integer, integer, integer, boolean, text) is
  'Atomically validates and replaces algorithm Suggestions and planned Metrics against the current owner, Visit history, revision, and detour budget.';
comment on function public.admin_clear_trip_plan_suggestions(uuid) is
  'Idempotently clears generated Suggestions and planned Segments while preserving endpoints, Base Segments, Base Metrics, and route revision.';

revoke execute on function public.admin_save_trip_plan_suggestions(uuid, bigint, text, jsonb, bigint, integer, integer, bigint, integer, jsonb, boolean, integer, integer, integer, boolean, text) from public, anon;
revoke execute on function public.admin_clear_trip_plan_suggestions(uuid) from public, anon;
revoke all on function public.clear_trip_suggestion_audit_on_revision() from public, anon, authenticated;
revoke all on function public.clear_trip_suggestions_on_base_route_save() from public, anon, authenticated;
grant execute on function public.admin_save_trip_plan_suggestions(uuid, bigint, text, jsonb, bigint, integer, integer, bigint, integer, jsonb, boolean, integer, integer, integer, boolean, text) to authenticated;
grant execute on function public.admin_clear_trip_plan_suggestions(uuid) to authenticated;

commit;
