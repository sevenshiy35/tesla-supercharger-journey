begin;

-- The paid-parking migration is already part of remote history. Rebuild the
-- public view before removing its source columns, preserving the Visit logic.
drop view if exists public.public_station_status;

-- These Find Us objects are included defensively for databases where the
-- abandoned local migration may have been applied outside migration history.
drop index if exists public.stations_tesla_findus_location_key_unique;

alter table public.stations
  drop constraint if exists stations_tesla_findus_location_key_valid,
  drop constraint if exists stations_tesla_findus_url_valid,
  drop constraint if exists stations_tesla_parking_parse_version_length,
  drop constraint if exists stations_parking_fee_note_length,
  drop column if exists tesla_findus_location_key,
  drop column if exists tesla_findus_url,
  drop column if exists tesla_parking_checked_at,
  drop column if exists tesla_parking_source_hash,
  drop column if exists tesla_parking_parse_version,
  drop column if exists tesla_paid_parking,
  drop column if exists parking_fee_note;

create view public.public_station_status
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
  ) as latest_visit_at
from public.stations;

grant select on table public.public_station_status to anon, authenticated;

commit;
