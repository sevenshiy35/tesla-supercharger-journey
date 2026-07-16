begin;

-- Route type and both endpoints now form one atomic user-facing input. The
-- older settings/endpoints RPCs remain available for historical compatibility.
create function public.admin_update_trip_plan_route_basics(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_trip_type text,
  p_origin_source text,
  p_origin_label text,
  p_origin_full_address text,
  p_origin_latitude double precision,
  p_origin_longitude double precision,
  p_origin_station_id uuid,
  p_origin_provider_id text,
  p_destination_source text,
  p_destination_label text,
  p_destination_full_address text,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_destination_station_id uuid,
  p_destination_provider_id text
)
returns table (
  trip_plan_id uuid,
  trip_type text,
  route_input_revision bigint,
  changed boolean,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_before public.trip_plans%rowtype;
  v_after public.trip_plans%rowtype;
  v_endpoint_changed boolean := false;
  v_type_changed boolean := false;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_trip_type is null or p_trip_type not in ('one_way', 'round_trip') then
    raise exception using errcode = '22023', message = 'Trip type must be one_way or round_trip.';
  end if;
  if p_origin_source is null or p_destination_source is null then
    raise exception using errcode = '22023', message = 'Origin and Destination are required.';
  end if;
  if p_destination_source = 'current_location' then
    raise exception using errcode = '22023', message = 'Destination must be a Supercharger or address.';
  end if;

  select tp.* into v_before
  from public.trip_plans tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_before.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can update route basics.';
  end if;
  if p_expected_revision is null or v_before.route_input_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'The trip changed while this operation was running.';
  end if;

  -- Reuse the already-applied endpoint validator. It re-reads Station sources,
  -- normalizes metadata, compares every value null-safely, and invalidates only
  -- when a real endpoint change exists. The surrounding function keeps this
  -- call and the Trip Type update in one transaction.
  perform 1
  from public.admin_update_trip_plan_endpoints(
    p_trip_plan_id,
    p_origin_source,
    p_origin_label,
    p_origin_full_address,
    p_origin_latitude,
    p_origin_longitude,
    p_origin_station_id,
    p_origin_provider_id,
    p_destination_source,
    p_destination_label,
    p_destination_full_address,
    p_destination_latitude,
    p_destination_longitude,
    p_destination_station_id,
    p_destination_provider_id
  );

  select tp.* into v_after
  from public.trip_plans tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;

  if v_after.origin_latitude = v_after.destination_latitude
    and v_after.origin_longitude = v_after.destination_longitude then
    raise exception using errcode = '22023', message = 'Origin and Destination must be different places.';
  end if;

  v_endpoint_changed := v_after.route_input_revision <> v_before.route_input_revision;
  v_type_changed := v_before.trip_type is distinct from p_trip_type;

  if v_endpoint_changed then
    -- The legacy endpoint RPC already advanced the revision and cleared the
    -- route/stops. Finish the newer audit/stale invalidation without advancing
    -- the revision a second time.
    update public.trip_plans tp
    set
      trip_type = p_trip_type,
      corridor_candidate_count = null,
      evaluated_candidate_count = null,
      unreachable_candidate_count = null,
      technical_limit_reached = false,
      technical_limit_reason = null,
      planned_route_stale = false
    where tp.id = v_after.id
    returning tp.* into v_after;
  elsif v_type_changed then
    delete from public.trip_plan_segments tps where tps.trip_plan_id = v_after.id;
    delete from public.trip_plan_stops tpst where tpst.trip_plan_id = v_after.id;

    update public.trip_plans tp
    set
      trip_type = p_trip_type,
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
      corridor_candidate_count = null,
      evaluated_candidate_count = null,
      unreachable_candidate_count = null,
      technical_limit_reached = false,
      technical_limit_reason = null,
      planned_route_stale = false,
      route_calculated_at = null
    where tp.id = v_after.id
    returning tp.* into v_after;
  end if;

  return query select
    v_after.id,
    v_after.trip_type,
    v_after.route_input_revision,
    (v_endpoint_changed or v_type_changed),
    v_after.updated_at;
end;
$$;

create function public.admin_create_trip_plan_route_draft(
  p_trip_type text,
  p_origin_source text,
  p_origin_label text,
  p_origin_full_address text,
  p_origin_latitude double precision,
  p_origin_longitude double precision,
  p_origin_station_id uuid,
  p_origin_provider_id text,
  p_destination_source text,
  p_destination_label text,
  p_destination_full_address text,
  p_destination_latitude double precision,
  p_destination_longitude double precision,
  p_destination_station_id uuid,
  p_destination_provider_id text
)
returns table (
  trip_plan_id uuid,
  trip_type text,
  route_input_revision bigint,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_plan public.trip_plans%rowtype;
begin
  -- Compatibility defaults are intentionally internal and are not presented
  -- as user planning limits in the current product.
  select created.trip_plan_id into v_plan_id
  from public.admin_create_trip_plan_draft(
    p_trip_type,
    50::numeric,
    120,
    null::numeric,
    null::integer,
    10
  ) created;

  perform 1
  from public.admin_update_trip_plan_route_basics(
    v_plan_id,
    0,
    p_trip_type,
    p_origin_source,
    p_origin_label,
    p_origin_full_address,
    p_origin_latitude,
    p_origin_longitude,
    p_origin_station_id,
    p_origin_provider_id,
    p_destination_source,
    p_destination_label,
    p_destination_full_address,
    p_destination_latitude,
    p_destination_longitude,
    p_destination_station_id,
    p_destination_provider_id
  );

  select tp.* into v_plan from public.trip_plans tp where tp.id = v_plan_id;
  return query select v_plan.id, v_plan.trip_type, v_plan.route_input_revision, v_plan.created_at, v_plan.updated_at;
end;
$$;

revoke all on function public.admin_update_trip_plan_route_basics(
  uuid, bigint, text,
  text, text, text, double precision, double precision, uuid, text,
  text, text, text, double precision, double precision, uuid, text
) from public, anon;
grant execute on function public.admin_update_trip_plan_route_basics(
  uuid, bigint, text,
  text, text, text, double precision, double precision, uuid, text,
  text, text, text, double precision, double precision, uuid, text
) to authenticated;

revoke all on function public.admin_create_trip_plan_route_draft(
  text,
  text, text, text, double precision, double precision, uuid, text,
  text, text, text, double precision, double precision, uuid, text
) from public, anon;
grant execute on function public.admin_create_trip_plan_route_draft(
  text,
  text, text, text, double precision, double precision, uuid, text,
  text, text, text, double precision, double precision, uuid, text
) to authenticated;

commit;
