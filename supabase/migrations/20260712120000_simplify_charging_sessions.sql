begin;

alter table public.charging_sessions
  drop column ended_at,
  drop column currency,
  drop column data_source;

comment on table public.charging_sessions is
  'Standardized charging results extracted from Tesla receipt photos for a station visit.';

commit;
