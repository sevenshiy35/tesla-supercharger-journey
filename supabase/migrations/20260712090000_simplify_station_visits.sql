begin;

alter table public.station_visits
  drop column completed_at,
  drop column distance_from_station_meters,
  drop column arrival_battery_percent,
  drop column departure_battery_percent,
  drop column odometer_miles,
  drop column verification_status,
  alter column checked_in_at set default now(),
  alter column checked_in_at set not null,
  add column checked_in_timezone text not null default 'UTC';

comment on column public.station_visits.checked_in_timezone is
  'IANA time zone for the check-in location, for example America/New_York.';

commit;
