-- §6.1.2 localização georreferenciada (PostGIS) e eventos de posição corrente.

alter table public.assets
  add column if not exists geom geography(Point, 4326);

create index if not exists assets_geom_gix on public.assets using gist (geom);

create or replace function public.assets_sync_geom()
returns trigger
language plpgsql
as $$
declare
  lat double precision;
  lng double precision;
begin
  if NEW.location is null then
    return NEW;
  end if;
  begin
    lat := (NEW.location->>'lat')::double precision;
    lng := (NEW.location->>'lng')::double precision;
  exception when others then
    return NEW;
  end;
  if lat is not null and lng is not null
     and lat between -90 and 90 and lng between -180 and 180 then
    NEW.geom := ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
  end if;
  return NEW;
end;
$$;

drop trigger if exists assets_sync_geom_trg on public.assets;
create trigger assets_sync_geom_trg
before insert or update of location on public.assets
for each row execute function public.assets_sync_geom();

create table if not exists public.asset_location_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  asset_external_id text not null,
  recorded_at timestamptz not null default now(),
  lat double precision not null,
  lng double precision not null,
  geom geography(Point, 4326),
  source text not null default 'gps',
  accuracy_m numeric,
  constraint asset_location_events_lat_chk check (lat between -90 and 90),
  constraint asset_location_events_lng_chk check (lng between -180 and 180)
);

create index if not exists asset_location_events_asset_idx
  on public.asset_location_events (organization_id, asset_external_id, recorded_at desc);

create or replace function public.asset_location_events_sync_geom()
returns trigger
language plpgsql
as $$
begin
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  return NEW;
end;
$$;

drop trigger if exists asset_location_events_sync_geom_trg on public.asset_location_events;
create trigger asset_location_events_sync_geom_trg
before insert or update of lat, lng on public.asset_location_events
for each row execute function public.asset_location_events_sync_geom();

alter table public.asset_location_events enable row level security;

comment on column public.assets.geom is 'Ponto cadastral WGS84 (geografia).';
comment on table public.asset_location_events is 'Posição corrente de recurso móvel — distinta da base cadastral.';
