begin;

alter table public.trip_plans
  alter column stop_duration_minutes set default 3;

-- The simplified planner no longer exposes Station dwell time as a user
-- setting. Move Drafts that still carry the old internal 10-minute default to
-- the new three-minute estimate, while preserving historical non-Draft Plans
-- and any legacy Draft with an explicitly different value.
update public.trip_plans as tp
set
  stop_duration_minutes = 3,
  planned_stop_seconds = case
    when tp.planned_stop_seconds is null then null
    else (
      select count(*)::integer * 3 * 60
      from public.trip_plan_stops as tps
      where tps.trip_plan_id = tp.id
    )
  end,
  updated_at = now()
where tp.status = 'draft'
  and tp.stop_duration_minutes = 10;

create or replace function public.admin_create_trip_plan_route_draft(
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
  -- Compatibility defaults are internal and are not presented as user
  -- planning limits in the current product. Three minutes reflects the
  -- expected quick check-in at each selected Supercharger.
  select created.trip_plan_id into v_plan_id
  from public.admin_create_trip_plan_draft(
    p_trip_type,
    50::numeric,
    120,
    null::numeric,
    null::integer,
    3
  ) as created;

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

  select tp.*
  into v_plan
  from public.trip_plans as tp
  where tp.id = v_plan_id;

  return query
  select v_plan.id, v_plan.trip_type, v_plan.route_input_revision, v_plan.created_at, v_plan.updated_at;
end;
$$;

comment on function public.admin_create_trip_plan_route_draft(
  text,
  text, text, text, double precision, double precision, uuid, text,
  text, text, text, double precision, double precision, uuid, text
) is 'Creates a route-complete Trip Draft with an internal three-minute Station dwell estimate.';

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
