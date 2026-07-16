begin;

alter table public.stations
  add column tesla_paid_parking boolean not null default false,
  add column parking_fee_note text null;

alter table public.stations
  add constraint stations_parking_fee_note_length
  check (parking_fee_note is null or char_length(parking_fee_note) <= 500);

comment on column public.stations.tesla_paid_parking is
  'True only when the current Tesla/NLR source explicitly indicates that parking fees apply. False means Tesla did not mark parking as paid; it is not a guarantee of free parking.';
comment on column public.stations.parking_fee_note is
  'Sanitized, length-limited Tesla/NLR parking-fee notice. No third-party or inferred parking data.';

create or replace view public.public_station_status
with (security_invoker = true)
as
select
  stations.id,
  stations.external_id,
  stations.name,
  stations.address,
  stations.city,
  stations.state,
  stations.postal_code,
  stations.latitude,
  stations.longitude,
  stations.stall_count,
  stations.max_power_kw,
  stations.operational_status,
  stations.source_updated_at,
  exists (
    select 1
    from public.station_visits
    where station_visits.station_id = stations.id
      and station_visits.is_public = true
  ) as visited,
  (
    select max(station_visits.checked_in_at)
    from public.station_visits
    where station_visits.station_id = stations.id
      and station_visits.is_public = true
  ) as latest_visit_at,
  stations.tesla_paid_parking,
  stations.parking_fee_note
from public.stations;

grant select on table public.public_station_status to anon, authenticated;

commit;
