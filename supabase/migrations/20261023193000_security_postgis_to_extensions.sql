-- PostGIS sai de public (Data API) e volta em extensions.
-- geom é reconstruído a partir de location.lat/lng e asset_location_events.

DROP TRIGGER IF EXISTS assets_sync_geom_trg ON public.assets;
DROP TRIGGER IF EXISTS asset_location_events_sync_geom_trg ON public.asset_location_events;
DROP FUNCTION IF EXISTS public.assets_sync_geom();
DROP FUNCTION IF EXISTS public.asset_location_events_sync_geom();
DROP INDEX IF EXISTS public.assets_geom_gix;

ALTER TABLE public.assets DROP COLUMN IF EXISTS geom;
ALTER TABLE public.asset_location_events DROP COLUMN IF EXISTS geom;

DROP EXTENSION IF EXISTS postgis;

CREATE EXTENSION postgis WITH SCHEMA extensions;

ALTER TABLE public.assets
  ADD COLUMN geom extensions.geography(Point, 4326);

ALTER TABLE public.asset_location_events
  ADD COLUMN geom extensions.geography(Point, 4326);

CREATE INDEX assets_geom_gix ON public.assets USING gist (geom);

CREATE OR REPLACE FUNCTION public.assets_sync_geom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
DECLARE
  lat double precision;
  lng double precision;
BEGIN
  IF NEW.location IS NULL THEN
    RETURN NEW;
  END IF;
  BEGIN
    lat := (NEW.location->>'lat')::double precision;
    lng := (NEW.location->>'lng')::double precision;
  EXCEPTION WHEN OTHERS THEN
    RETURN NEW;
  END;
  IF lat IS NOT NULL AND lng IS NOT NULL
     AND lat BETWEEN -90 AND 90 AND lng BETWEEN -180 AND 180 THEN
    NEW.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER assets_sync_geom_trg
BEFORE INSERT OR UPDATE OF location ON public.assets
FOR EACH ROW EXECUTE FUNCTION public.assets_sync_geom();

CREATE OR REPLACE FUNCTION public.asset_location_events_sync_geom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, extensions
AS $$
BEGIN
  NEW.geom := extensions.ST_SetSRID(extensions.ST_MakePoint(NEW.lng, NEW.lat), 4326)::extensions.geography;
  RETURN NEW;
END;
$$;

CREATE TRIGGER asset_location_events_sync_geom_trg
BEFORE INSERT OR UPDATE OF lat, lng ON public.asset_location_events
FOR EACH ROW EXECUTE FUNCTION public.asset_location_events_sync_geom();

REVOKE ALL ON FUNCTION public.assets_sync_geom() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.asset_location_events_sync_geom() FROM PUBLIC, anon, authenticated;

UPDATE public.assets
SET geom = extensions.ST_SetSRID(
  extensions.ST_MakePoint((location->>'lng')::double precision, (location->>'lat')::double precision),
  4326
)::extensions.geography
WHERE location ? 'lat' AND location ? 'lng'
  AND nullif(location->>'lat', '') IS NOT NULL
  AND nullif(location->>'lng', '') IS NOT NULL;

UPDATE public.asset_location_events
SET geom = extensions.ST_SetSRID(extensions.ST_MakePoint(lng, lat), 4326)::extensions.geography
WHERE lat IS NOT NULL AND lng IS NOT NULL;

COMMENT ON COLUMN public.assets.geom IS 'Ponto cadastral WGS84 (geografia). PostGIS em extensions.';
