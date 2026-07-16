begin;

create table public.station_user_preferences (
  user_id uuid not null references auth.users(id) on delete cascade,
  station_id uuid not null references public.stations(id) on delete cascade,
  pay_to_park boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, station_id)
);

create index station_user_preferences_pay_to_park_idx
  on public.station_user_preferences (user_id, station_id)
  where pay_to_park = true;

create trigger station_user_preferences_set_updated_at
before update on public.station_user_preferences
for each row execute function public.set_updated_at();

alter table public.station_user_preferences enable row level security;

create policy "station_user_preferences_select_own"
on public.station_user_preferences
for select
to authenticated
using (user_id = (select auth.uid()));

-- Browser reads are private and owner-scoped. Writes are intentionally limited
-- to the RPC below so a client can never choose a user_id.
revoke all on table public.station_user_preferences from anon, authenticated;
grant select on table public.station_user_preferences to authenticated;

create function public.admin_set_station_pay_to_park(
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
  if not exists (select 1 from public.app_admins aa where aa.user_id = v_user_id) then
    raise exception using errcode = '42501', message = 'Administrator access is required.';
  end if;
  if p_station_id is null or not exists (
    select 1 from public.stations s where s.id = p_station_id
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
    on conflict (user_id, station_id) do update
    set pay_to_park = true
    returning sup.updated_at into v_updated_at;
  else
    delete from public.station_user_preferences sup
    where sup.user_id = v_user_id
      and sup.station_id = p_station_id;
    v_updated_at := now();
  end if;

  return query select p_station_id, p_pay_to_park, v_updated_at;
end;
$$;

comment on table public.station_user_preferences is
  'Private per-user Station preferences; not authoritative Station or Tesla data.';
comment on function public.admin_set_station_pay_to_park(uuid, boolean) is
  'Idempotently sets the current administrator personal pay-to-park marker.';

revoke all on function public.admin_set_station_pay_to_park(uuid, boolean) from public, anon;
grant execute on function public.admin_set_station_pay_to_park(uuid, boolean) to authenticated;

commit;
