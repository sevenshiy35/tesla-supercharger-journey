begin;

-- A Trip name is presentation metadata. Renaming must not invalidate the
-- calculated route, alter Stops, or change the Trip lifecycle status.
create function public.admin_rename_trip_plan(
  p_trip_plan_id uuid,
  p_name text
)
returns table (
  trip_plan_id uuid,
  name text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_name text;
begin
  if v_user_id is null then
    raise exception using errcode = '42501', message = 'Authentication is required.';
  end if;
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;

  v_name := btrim(p_name);
  if v_name is null or char_length(v_name) = 0 then
    raise exception using errcode = '22023', message = 'Trip name is required.';
  end if;
  if char_length(v_name) > 120 then
    raise exception using errcode = '22023', message = 'Trip name must be 120 characters or fewer.';
  end if;

  return query
  update public.trip_plans tp
  set name = v_name
  where tp.id = p_trip_plan_id
    and tp.user_id = v_user_id
  returning tp.id, tp.name, tp.updated_at;

  if not found then
    raise exception using errcode = 'P0002', message = 'Trip Plan not found.';
  end if;
end;
$$;

comment on function public.admin_rename_trip_plan(uuid, text) is
  'Renames an administrator-owned Trip Plan without invalidating route or Stop data.';

revoke all on function public.admin_rename_trip_plan(uuid, text) from public, anon;
grant execute on function public.admin_rename_trip_plan(uuid, text) to authenticated;

commit;
