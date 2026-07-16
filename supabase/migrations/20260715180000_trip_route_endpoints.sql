begin;

alter table public.trip_plans
  drop constraint if exists trip_plans_origin_label_check,
  drop constraint if exists trip_plans_destination_label_check,
  add column origin_source text,
  add column origin_full_address text,
  add column origin_station_id uuid references public.stations(id) on delete set null,
  add column origin_provider_id text,
  add column destination_source text,
  add column destination_full_address text,
  add column destination_station_id uuid references public.stations(id) on delete set null,
  add column destination_provider_id text,
  add column route_input_revision bigint not null default 0,
  add constraint trip_plans_origin_label_check
    check (
      origin_label is null
      or (origin_label = btrim(origin_label) and char_length(origin_label) between 1 and 300)
    ),
  add constraint trip_plans_destination_label_check
    check (
      destination_label is null
      or (destination_label = btrim(destination_label) and char_length(destination_label) between 1 and 300)
    ),
  add constraint trip_plans_origin_full_address_check
    check (
      origin_full_address is null
      or (origin_full_address = btrim(origin_full_address) and char_length(origin_full_address) between 1 and 500)
    ),
  add constraint trip_plans_destination_full_address_check
    check (
      destination_full_address is null
      or (destination_full_address = btrim(destination_full_address) and char_length(destination_full_address) between 1 and 500)
    ),
  add constraint trip_plans_origin_source_check
    check (origin_source is null or origin_source in ('mapbox', 'current_location', 'station')),
  add constraint trip_plans_destination_source_check
    check (destination_source is null or destination_source in ('mapbox', 'current_location', 'station')),
  add constraint trip_plans_origin_provider_id_check
    check (
      origin_provider_id is null
      or (
        origin_provider_id = btrim(origin_provider_id)
        and char_length(origin_provider_id) between 1 and 300
      )
    ),
  add constraint trip_plans_destination_provider_id_check
    check (
      destination_provider_id is null
      or (
        destination_provider_id = btrim(destination_provider_id)
        and char_length(destination_provider_id) between 1 and 300
      )
    ),
  add constraint trip_plans_origin_endpoint_shape_check
    check (
      (
        origin_source is null
        and origin_label is null
        and origin_full_address is null
        and origin_latitude is null
        and origin_longitude is null
        and origin_station_id is null
        and origin_provider_id is null
      )
      or (
        origin_source is not null
        and origin_label is not null
        and origin_latitude is not null
        and origin_longitude is not null
      )
    ),
  add constraint trip_plans_destination_endpoint_shape_check
    check (
      (
        destination_source is null
        and destination_label is null
        and destination_full_address is null
        and destination_latitude is null
        and destination_longitude is null
        and destination_station_id is null
        and destination_provider_id is null
      )
      or (
        destination_source is not null
        and destination_label is not null
        and destination_latitude is not null
        and destination_longitude is not null
      )
    ),
  add constraint trip_plans_origin_source_metadata_check
    check (
      origin_source is null
      or (
        origin_source = 'mapbox'
        and origin_provider_id is not null
        and origin_full_address is not null
        and origin_station_id is null
      )
      or (
        origin_source = 'current_location'
        and origin_provider_id is null
        and origin_station_id is null
        and origin_full_address is null
      )
      or (
        origin_source = 'station'
        and origin_provider_id is null
        and origin_full_address is not null
      )
    ),
  add constraint trip_plans_destination_source_metadata_check
    check (
      destination_source is null
      or (
        destination_source = 'mapbox'
        and destination_provider_id is not null
        and destination_full_address is not null
        and destination_station_id is null
      )
      or (
        destination_source = 'current_location'
        and destination_provider_id is null
        and destination_station_id is null
        and destination_full_address is null
      )
      or (
        destination_source = 'station'
        and destination_provider_id is null
        and destination_full_address is not null
      )
    ),
  add constraint trip_plans_origin_station_source_check
    check (origin_station_id is null or origin_source = 'station'),
  add constraint trip_plans_destination_station_source_check
    check (destination_station_id is null or destination_source = 'station'),
  add constraint trip_plans_origin_provider_source_check
    check (origin_provider_id is null or origin_source = 'mapbox'),
  add constraint trip_plans_destination_provider_source_check
    check (destination_provider_id is null or destination_source = 'mapbox'),
  add constraint trip_plans_route_input_revision_check check (route_input_revision >= 0);

create index trip_plans_origin_station_id_idx on public.trip_plans (origin_station_id);
create index trip_plans_destination_station_id_idx on public.trip_plans (destination_station_id);

create or replace function public.admin_update_trip_plan_settings(
  p_trip_plan_id uuid,
  p_trip_type text,
  p_corridor_miles numeric,
  p_max_extra_minutes integer,
  p_max_extra_miles numeric,
  p_max_stops integer,
  p_stop_duration_minutes integer
)
returns table (
  trip_plan_id uuid,
  trip_type text,
  status text,
  corridor_miles numeric,
  max_extra_minutes integer,
  max_extra_miles numeric,
  max_stops integer,
  stop_duration_minutes integer,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_changed boolean;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_trip_plan_id is null then
    raise exception using errcode = '22023', message = 'Trip Plan ID is required.';
  end if;
  if p_trip_type is null or p_trip_type not in ('one_way', 'round_trip') then
    raise exception using errcode = '22023', message = 'Trip type must be one_way or round_trip.';
  end if;
  if p_corridor_miles is null or p_corridor_miles <= 0 then
    raise exception using errcode = '22023', message = 'Route corridor must be greater than zero.';
  end if;
  if p_max_extra_minutes is null or p_max_extra_minutes < 0 then
    raise exception using errcode = '22023', message = 'Maximum extra driving time cannot be negative.';
  end if;
  if p_max_extra_miles is not null and p_max_extra_miles < 0 then
    raise exception using errcode = '22023', message = 'Maximum extra distance cannot be negative.';
  end if;
  if p_max_stops is null or p_max_stops < 0 then
    raise exception using errcode = '22023', message = 'Maximum stops cannot be negative.';
  end if;
  if p_stop_duration_minutes is null or p_stop_duration_minutes < 0 then
    raise exception using errcode = '22023', message = 'Station time cannot be negative.';
  end if;

  select tp.* into v_plan
  from public.trip_plans as tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id
  for update;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can update settings.';
  end if;

  v_changed :=
    v_plan.trip_type is distinct from p_trip_type
    or v_plan.corridor_miles is distinct from p_corridor_miles
    or v_plan.max_extra_minutes is distinct from p_max_extra_minutes
    or v_plan.max_extra_miles is distinct from p_max_extra_miles
    or v_plan.max_stops is distinct from p_max_stops
    or v_plan.stop_duration_minutes is distinct from p_stop_duration_minutes;

  if v_changed then
    delete from public.trip_plan_segments as tps where tps.trip_plan_id = v_plan.id;
    delete from public.trip_plan_stops as tpst where tpst.trip_plan_id = v_plan.id;

    update public.trip_plans as tp
    set
      trip_type = p_trip_type,
      corridor_miles = p_corridor_miles,
      max_extra_minutes = p_max_extra_minutes,
      max_extra_miles = p_max_extra_miles,
      max_stops = p_max_stops,
      stop_duration_minutes = p_stop_duration_minutes,
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
      route_calculated_at = null
    where tp.id = v_plan.id
    returning tp.* into v_plan;
  end if;

  return query select
    v_plan.id,
    v_plan.trip_type,
    v_plan.status,
    v_plan.corridor_miles,
    v_plan.max_extra_minutes,
    v_plan.max_extra_miles,
    v_plan.max_stops,
    v_plan.stop_duration_minutes,
    v_plan.updated_at;
end;
$$;

create function public.admin_update_trip_plan_endpoints(
  p_trip_plan_id uuid,
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
  origin_source text,
  origin_label text,
  origin_full_address text,
  origin_latitude double precision,
  origin_longitude double precision,
  origin_station_id uuid,
  origin_provider_id text,
  destination_source text,
  destination_label text,
  destination_full_address text,
  destination_latitude double precision,
  destination_longitude double precision,
  destination_station_id uuid,
  destination_provider_id text,
  route_input_revision bigint,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
  v_origin_station public.stations%rowtype;
  v_destination_station public.stations%rowtype;
  v_origin_label text := nullif(btrim(p_origin_label), '');
  v_origin_full_address text := nullif(btrim(p_origin_full_address), '');
  v_origin_provider_id text := nullif(btrim(p_origin_provider_id), '');
  v_origin_latitude double precision := p_origin_latitude;
  v_origin_longitude double precision := p_origin_longitude;
  v_destination_label text := nullif(btrim(p_destination_label), '');
  v_destination_full_address text := nullif(btrim(p_destination_full_address), '');
  v_destination_provider_id text := nullif(btrim(p_destination_provider_id), '');
  v_destination_latitude double precision := p_destination_latitude;
  v_destination_longitude double precision := p_destination_longitude;
  v_changed boolean;
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
  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.';
  end if;
  if v_plan.status <> 'draft' then
    raise exception using errcode = '55000', message = 'Only draft Trip Plans can update endpoints.';
  end if;

  if p_origin_source is null then
    if p_origin_label is not null or p_origin_full_address is not null
      or p_origin_latitude is not null or p_origin_longitude is not null
      or p_origin_station_id is not null or p_origin_provider_id is not null then
      raise exception using errcode = '22023', message = 'A cleared Origin cannot include endpoint metadata.';
    end if;
    v_origin_label := null;
    v_origin_full_address := null;
    v_origin_provider_id := null;
  elsif p_origin_source not in ('mapbox', 'current_location', 'station') then
    raise exception using errcode = '22023', message = 'Invalid Origin source.';
  elsif v_origin_label is null or char_length(v_origin_label) > 300 then
    raise exception using errcode = '22023', message = 'Origin label must be 300 characters or fewer.';
  elsif v_origin_latitude is null or v_origin_latitude not between -90 and 90
    or v_origin_longitude is null or v_origin_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Origin coordinates are invalid.';
  elsif p_origin_source = 'mapbox' then
    if v_origin_provider_id is null or char_length(v_origin_provider_id) > 300
      or v_origin_full_address is null or char_length(v_origin_full_address) > 500
      or p_origin_station_id is not null then
      raise exception using errcode = '22023', message = 'Mapbox Origin metadata is invalid.';
    end if;
  elsif p_origin_source = 'current_location' then
    if p_origin_station_id is not null or p_origin_provider_id is not null or p_origin_full_address is not null then
      raise exception using errcode = '22023', message = 'Current location Origin cannot include provider or Station metadata.';
    end if;
    v_origin_full_address := null;
    v_origin_provider_id := null;
  else
    if p_origin_station_id is null or p_origin_provider_id is not null then
      raise exception using errcode = '22023', message = 'Station Origin requires a Station ID only.';
    end if;
    select s.* into v_origin_station from public.stations as s where s.id = p_origin_station_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Origin Station does not exist.';
    end if;
    if p_origin_latitude is distinct from v_origin_station.latitude
      or p_origin_longitude is distinct from v_origin_station.longitude then
      raise exception using errcode = '22023', message = 'Origin Station coordinates do not match the Station directory.';
    end if;
    v_origin_label := v_origin_station.name;
    v_origin_full_address := concat_ws(', ', v_origin_station.address, concat_ws(' ', v_origin_station.city, v_origin_station.state, v_origin_station.postal_code));
    v_origin_latitude := v_origin_station.latitude;
    v_origin_longitude := v_origin_station.longitude;
    v_origin_provider_id := null;
  end if;

  if p_destination_source is null then
    if p_destination_label is not null or p_destination_full_address is not null
      or p_destination_latitude is not null or p_destination_longitude is not null
      or p_destination_station_id is not null or p_destination_provider_id is not null then
      raise exception using errcode = '22023', message = 'A cleared Destination cannot include endpoint metadata.';
    end if;
    v_destination_label := null;
    v_destination_full_address := null;
    v_destination_provider_id := null;
  elsif p_destination_source not in ('mapbox', 'current_location', 'station') then
    raise exception using errcode = '22023', message = 'Invalid Destination source.';
  elsif v_destination_label is null or char_length(v_destination_label) > 300 then
    raise exception using errcode = '22023', message = 'Destination label must be 300 characters or fewer.';
  elsif v_destination_latitude is null or v_destination_latitude not between -90 and 90
    or v_destination_longitude is null or v_destination_longitude not between -180 and 180 then
    raise exception using errcode = '22023', message = 'Destination coordinates are invalid.';
  elsif p_destination_source = 'mapbox' then
    if v_destination_provider_id is null or char_length(v_destination_provider_id) > 300
      or v_destination_full_address is null or char_length(v_destination_full_address) > 500
      or p_destination_station_id is not null then
      raise exception using errcode = '22023', message = 'Mapbox Destination metadata is invalid.';
    end if;
  elsif p_destination_source = 'current_location' then
    if p_destination_station_id is not null or p_destination_provider_id is not null or p_destination_full_address is not null then
      raise exception using errcode = '22023', message = 'Current location Destination cannot include provider or Station metadata.';
    end if;
    v_destination_full_address := null;
    v_destination_provider_id := null;
  else
    if p_destination_station_id is null or p_destination_provider_id is not null then
      raise exception using errcode = '22023', message = 'Station Destination requires a Station ID only.';
    end if;
    select s.* into v_destination_station from public.stations as s where s.id = p_destination_station_id;
    if not found then
      raise exception using errcode = 'P0002', message = 'Destination Station does not exist.';
    end if;
    if p_destination_latitude is distinct from v_destination_station.latitude
      or p_destination_longitude is distinct from v_destination_station.longitude then
      raise exception using errcode = '22023', message = 'Destination Station coordinates do not match the Station directory.';
    end if;
    v_destination_label := v_destination_station.name;
    v_destination_full_address := concat_ws(', ', v_destination_station.address, concat_ws(' ', v_destination_station.city, v_destination_station.state, v_destination_station.postal_code));
    v_destination_latitude := v_destination_station.latitude;
    v_destination_longitude := v_destination_station.longitude;
    v_destination_provider_id := null;
  end if;

  v_changed :=
    v_plan.origin_source is distinct from p_origin_source
    or v_plan.origin_label is distinct from v_origin_label
    or v_plan.origin_full_address is distinct from v_origin_full_address
    or v_plan.origin_latitude is distinct from v_origin_latitude
    or v_plan.origin_longitude is distinct from v_origin_longitude
    or v_plan.origin_station_id is distinct from p_origin_station_id
    or v_plan.origin_provider_id is distinct from v_origin_provider_id
    or v_plan.destination_source is distinct from p_destination_source
    or v_plan.destination_label is distinct from v_destination_label
    or v_plan.destination_full_address is distinct from v_destination_full_address
    or v_plan.destination_latitude is distinct from v_destination_latitude
    or v_plan.destination_longitude is distinct from v_destination_longitude
    or v_plan.destination_station_id is distinct from p_destination_station_id
    or v_plan.destination_provider_id is distinct from v_destination_provider_id;

  if v_changed then
    delete from public.trip_plan_segments as tps where tps.trip_plan_id = v_plan.id;
    delete from public.trip_plan_stops as tpst where tpst.trip_plan_id = v_plan.id;
    update public.trip_plans as tp
    set
      origin_source = p_origin_source,
      origin_label = v_origin_label,
      origin_full_address = v_origin_full_address,
      origin_latitude = v_origin_latitude,
      origin_longitude = v_origin_longitude,
      origin_station_id = p_origin_station_id,
      origin_provider_id = v_origin_provider_id,
      destination_source = p_destination_source,
      destination_label = v_destination_label,
      destination_full_address = v_destination_full_address,
      destination_latitude = v_destination_latitude,
      destination_longitude = v_destination_longitude,
      destination_station_id = p_destination_station_id,
      destination_provider_id = v_destination_provider_id,
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
      route_calculated_at = null
    where tp.id = v_plan.id
    returning tp.* into v_plan;
  end if;

  return query select
    v_plan.id, v_plan.origin_source, v_plan.origin_label, v_plan.origin_full_address,
    v_plan.origin_latitude, v_plan.origin_longitude, v_plan.origin_station_id,
    v_plan.origin_provider_id, v_plan.destination_source, v_plan.destination_label,
    v_plan.destination_full_address, v_plan.destination_latitude, v_plan.destination_longitude,
    v_plan.destination_station_id, v_plan.destination_provider_id,
    v_plan.route_input_revision, v_plan.updated_at;
end;
$$;

create function public.admin_swap_trip_plan_endpoints(p_trip_plan_id uuid)
returns table (
  trip_plan_id uuid,
  origin_source text,
  origin_label text,
  origin_full_address text,
  origin_latitude double precision,
  origin_longitude double precision,
  origin_station_id uuid,
  origin_provider_id text,
  destination_source text,
  destination_label text,
  destination_full_address text,
  destination_latitude double precision,
  destination_longitude double precision,
  destination_station_id uuid,
  destination_provider_id text,
  route_input_revision bigint,
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
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  select tp.* into v_plan from public.trip_plans as tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can swap endpoints.'; end if;

  delete from public.trip_plan_segments as tps where tps.trip_plan_id = v_plan.id;
  delete from public.trip_plan_stops as tpst where tpst.trip_plan_id = v_plan.id;
  update public.trip_plans as tp
  set
    origin_source = v_plan.destination_source,
    origin_label = v_plan.destination_label,
    origin_full_address = v_plan.destination_full_address,
    origin_latitude = v_plan.destination_latitude,
    origin_longitude = v_plan.destination_longitude,
    origin_station_id = v_plan.destination_station_id,
    origin_provider_id = v_plan.destination_provider_id,
    destination_source = v_plan.origin_source,
    destination_label = v_plan.origin_label,
    destination_full_address = v_plan.origin_full_address,
    destination_latitude = v_plan.origin_latitude,
    destination_longitude = v_plan.origin_longitude,
    destination_station_id = v_plan.origin_station_id,
    destination_provider_id = v_plan.origin_provider_id,
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
    route_calculated_at = null
  where tp.id = v_plan.id returning tp.* into v_plan;

  return query select
    v_plan.id, v_plan.origin_source, v_plan.origin_label, v_plan.origin_full_address,
    v_plan.origin_latitude, v_plan.origin_longitude, v_plan.origin_station_id,
    v_plan.origin_provider_id, v_plan.destination_source, v_plan.destination_label,
    v_plan.destination_full_address, v_plan.destination_latitude, v_plan.destination_longitude,
    v_plan.destination_station_id, v_plan.destination_provider_id,
    v_plan.route_input_revision, v_plan.updated_at;
end;
$$;

create function public.admin_clear_trip_plan_route(p_trip_plan_id uuid)
returns table (trip_plan_id uuid, route_input_revision bigint, updated_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_plan public.trip_plans%rowtype;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  select tp.* into v_plan from public.trip_plans as tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can clear a route.'; end if;

  delete from public.trip_plan_segments as tps where tps.trip_plan_id = v_plan.id;
  delete from public.trip_plan_stops as tpst where tpst.trip_plan_id = v_plan.id;
  update public.trip_plans as tp
  set
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
    route_calculated_at = null
  where tp.id = v_plan.id returning tp.* into v_plan;
  return query select v_plan.id, v_plan.route_input_revision, v_plan.updated_at;
end;
$$;

create function public.admin_save_trip_base_route(
  p_trip_plan_id uuid,
  p_expected_revision bigint,
  p_route_provider text,
  p_algorithm_version text,
  p_base_distance_meters bigint,
  p_base_duration_seconds integer,
  p_segments jsonb,
  p_persist_geometry boolean
)
returns table (
  trip_plan_id uuid,
  route_input_revision bigint,
  base_distance_meters bigint,
  base_duration_seconds integer,
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
  v_segment jsonb;
  v_geometry jsonb;
  v_coordinate jsonb;
  v_expected_count integer;
  v_segment_count integer;
  v_segment_index integer := 0;
  v_coordinate_count integer := 0;
  v_distance_sum bigint := 0;
  v_duration_sum bigint := 0;
  v_longitude double precision;
  v_latitude double precision;
  v_endpoint_distance double precision;
begin
  if v_user_id is null then raise exception using errcode = '42501', message = 'Authentication is required.'; end if;
  if not exists (select 1 from public.app_admins as aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_route_provider is distinct from 'mapbox' or p_algorithm_version is distinct from 'base-route-v1' then
    raise exception using errcode = '22023', message = 'Unsupported base route provider or algorithm version.';
  end if;
  if p_expected_revision is null or p_expected_revision < 0
    or p_base_distance_meters is null or p_base_distance_meters < 0
    or p_base_duration_seconds is null or p_base_duration_seconds < 0
    or p_persist_geometry is null then
    raise exception using errcode = '22023', message = 'Base route metrics are invalid.';
  end if;
  if p_segments is null or jsonb_typeof(p_segments) <> 'array'
    or pg_column_size(p_segments) > 8388608 then
    raise exception using errcode = '22023', message = 'Base route Segment payload is invalid or too large.';
  end if;

  select tp.* into v_plan from public.trip_plans as tp
  where tp.id = p_trip_plan_id and tp.user_id = v_user_id for update;
  if not found then raise exception using errcode = 'P0002', message = 'Trip Plan draft not found.'; end if;
  if v_plan.status <> 'draft' then raise exception using errcode = '55000', message = 'Only draft Trip Plans can save a route.'; end if;
  if v_plan.route_input_revision <> p_expected_revision then
    raise exception using errcode = '40001', message = 'Stale route result. The Trip inputs changed while the route was calculating.';
  end if;
  if v_plan.origin_source is null or v_plan.destination_source is null
    or v_plan.origin_latitude is null or v_plan.origin_longitude is null
    or v_plan.destination_latitude is null or v_plan.destination_longitude is null then
    raise exception using errcode = '22023', message = 'Origin and Destination are required before saving a route.';
  end if;
  if (v_plan.origin_source = 'station' and v_plan.origin_station_id is null)
    or (v_plan.destination_source = 'station' and v_plan.destination_station_id is null) then
    raise exception using errcode = '22023', message = 'A Station endpoint is no longer available.';
  end if;

  v_endpoint_distance := 6371000 * 2 * asin(sqrt(least(1,
    power(sin(radians(v_plan.destination_latitude - v_plan.origin_latitude) / 2), 2)
    + cos(radians(v_plan.origin_latitude)) * cos(radians(v_plan.destination_latitude))
      * power(sin(radians(v_plan.destination_longitude - v_plan.origin_longitude) / 2), 2)
  )));
  if v_endpoint_distance < 100 then
    raise exception using errcode = '22023', message = 'Origin and destination are too close to calculate a useful trip.';
  end if;

  v_expected_count := case when v_plan.trip_type = 'round_trip' then 2 else 1 end;
  v_segment_count := jsonb_array_length(p_segments);
  if v_segment_count <> v_expected_count then
    raise exception using errcode = '22023', message = 'Base route has the wrong number of Segments.';
  end if;

  for v_segment in select value from jsonb_array_elements(p_segments)
  loop
    if jsonb_typeof(v_segment) <> 'object'
      or not (v_segment ?& array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'])
      or v_segment - array['segmentIndex','leg','startSequence','endSequence','provider','distanceMeters','durationSeconds','geometry'] <> '{}'::jsonb then
      raise exception using errcode = '22023', message = 'Base route Segment shape is invalid.';
    end if;
    if jsonb_typeof(v_segment->'segmentIndex') <> 'number'
      or (v_segment->>'segmentIndex') !~ '^\d+$'
      or (v_segment->>'segmentIndex')::integer <> v_segment_index then
      raise exception using errcode = '22023', message = 'Segment indexes must start at zero and be continuous.';
    end if;
    if v_segment->>'provider' <> 'mapbox'
      or jsonb_typeof(v_segment->'startSequence') <> 'null'
      or jsonb_typeof(v_segment->'endSequence') <> 'null' then
      raise exception using errcode = '22023', message = 'Base route Segment metadata is invalid.';
    end if;
    if (v_segment_index = 0 and v_segment->>'leg' <> 'outbound')
      or (v_segment_index = 1 and v_segment->>'leg' <> 'return') then
      raise exception using errcode = '22023', message = 'Base route Segment legs are invalid.';
    end if;
    if jsonb_typeof(v_segment->'distanceMeters') <> 'number'
      or (v_segment->>'distanceMeters') !~ '^\d+$'
      or jsonb_typeof(v_segment->'durationSeconds') <> 'number'
      or (v_segment->>'durationSeconds') !~ '^\d+$' then
      raise exception using errcode = '22023', message = 'Base route Segment metrics are invalid.';
    end if;

    v_geometry := v_segment->'geometry';
    if jsonb_typeof(v_geometry) <> 'object'
      or not (v_geometry ?& array['type','coordinates'])
      or v_geometry - array['type','coordinates'] <> '{}'::jsonb
      or v_geometry->>'type' <> 'LineString'
      or jsonb_typeof(v_geometry->'coordinates') <> 'array'
      or jsonb_array_length(v_geometry->'coordinates') < 2 then
      raise exception using errcode = '22023', message = 'Base route Geometry must be a valid LineString.';
    end if;

    for v_coordinate in select value from jsonb_array_elements(v_geometry->'coordinates')
    loop
      v_coordinate_count := v_coordinate_count + 1;
      if v_coordinate_count > 100000
        or jsonb_typeof(v_coordinate) <> 'array'
        or jsonb_array_length(v_coordinate) <> 2
        or jsonb_typeof(v_coordinate->0) <> 'number'
        or jsonb_typeof(v_coordinate->1) <> 'number' then
        raise exception using errcode = '22023', message = 'Base route Geometry coordinates are invalid or too large.';
      end if;
      v_longitude := (v_coordinate->>0)::double precision;
      v_latitude := (v_coordinate->>1)::double precision;
      if v_longitude not between -180 and 180 or v_latitude not between -90 and 90 then
        raise exception using errcode = '22023', message = 'Base route Geometry coordinates are out of range.';
      end if;
    end loop;

    v_distance_sum := v_distance_sum + (v_segment->>'distanceMeters')::bigint;
    v_duration_sum := v_duration_sum + (v_segment->>'durationSeconds')::bigint;
    v_segment_index := v_segment_index + 1;
  end loop;

  if v_distance_sum <> p_base_distance_meters or v_duration_sum <> p_base_duration_seconds then
    raise exception using errcode = '22023', message = 'Base route totals do not match the Segment metrics.';
  end if;
  if v_duration_sum > 2147483647 then
    raise exception using errcode = '22023', message = 'Base route duration is too large.';
  end if;

  delete from public.trip_plan_segments as tps where tps.trip_plan_id = v_plan.id;
  if p_persist_geometry then
    insert into public.trip_plan_segments (
      trip_plan_id, segment_index, leg, start_sequence, end_sequence,
      provider, distance_meters, duration_seconds, geometry
    )
    select
      v_plan.id,
      (segment->>'segmentIndex')::integer,
      segment->>'leg',
      null,
      null,
      'mapbox',
      (segment->>'distanceMeters')::bigint,
      (segment->>'durationSeconds')::integer,
      segment->'geometry'
    from jsonb_array_elements(p_segments) as segments(segment)
    order by (segment->>'segmentIndex')::integer;
  end if;

  update public.trip_plans as tp
  set
    route_provider = 'mapbox',
    algorithm_version = 'base-route-v1',
    base_distance_meters = p_base_distance_meters,
    base_duration_seconds = p_base_duration_seconds,
    planned_distance_meters = p_base_distance_meters,
    planned_drive_seconds = p_base_duration_seconds,
    planned_stop_seconds = 0,
    extra_distance_meters = 0,
    extra_duration_seconds = 0,
    route_calculated_at = now()
  where tp.id = v_plan.id returning tp.* into v_plan;

  return query select
    v_plan.id, v_plan.route_input_revision, v_plan.base_distance_meters,
    v_plan.base_duration_seconds, v_plan.route_calculated_at, p_persist_geometry;
end;
$$;

comment on column public.trip_plans.route_input_revision is
  'Monotonic revision of route inputs. A calculated route may be saved only against the revision read before provider requests began.';
comment on function public.admin_update_trip_plan_endpoints(uuid, text, text, text, double precision, double precision, uuid, text, text, text, text, double precision, double precision, uuid, text) is
  'Updates private Draft endpoints, verifies Station snapshots, increments route revision on change, and invalidates route data transactionally.';
comment on function public.admin_swap_trip_plan_endpoints(uuid) is
  'Atomically swaps every Origin/Destination field and invalidates route data.';
comment on function public.admin_clear_trip_plan_route(uuid) is
  'Keeps endpoints while deleting calculated route data, Stops, and Segments and incrementing revision.';
comment on function public.admin_save_trip_base_route(uuid, bigint, text, text, bigint, integer, jsonb, boolean) is
  'Validates a server-cleaned base route against the current input revision. Geometry persistence is explicit and defaults off in application configuration.';

revoke execute on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer) from public, anon;
revoke execute on function public.admin_update_trip_plan_endpoints(uuid, text, text, text, double precision, double precision, uuid, text, text, text, text, double precision, double precision, uuid, text) from public, anon;
revoke execute on function public.admin_swap_trip_plan_endpoints(uuid) from public, anon;
revoke execute on function public.admin_clear_trip_plan_route(uuid) from public, anon;
revoke execute on function public.admin_save_trip_base_route(uuid, bigint, text, text, bigint, integer, jsonb, boolean) from public, anon;

grant execute on function public.admin_update_trip_plan_endpoints(uuid, text, text, text, double precision, double precision, uuid, text, text, text, text, double precision, double precision, uuid, text) to authenticated;
grant execute on function public.admin_update_trip_plan_settings(uuid, text, numeric, integer, numeric, integer, integer) to authenticated;
grant execute on function public.admin_swap_trip_plan_endpoints(uuid) to authenticated;
grant execute on function public.admin_clear_trip_plan_route(uuid) to authenticated;
grant execute on function public.admin_save_trip_base_route(uuid, bigint, text, text, bigint, integer, jsonb, boolean) to authenticated;

commit;
