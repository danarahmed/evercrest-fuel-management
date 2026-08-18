-- A station without a location is not much use to a dispatcher, and the
-- manager now filters by it. Both existing rows already carry one, so this
-- tightens without a backfill.
alter table public.stations
  alter column location set not null;

alter table public.stations
  drop constraint if exists stations_location_not_blank;

alter table public.stations
  add constraint stations_location_not_blank check (btrim(location) <> '');
