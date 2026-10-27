-- O gatilho de coordenadas foi recriado depois do GRANT geral.
-- Sem EXECUTE, o service_role não consegue gravar alteração de ativo.
GRANT EXECUTE ON FUNCTION public.assets_sync_geom() TO service_role;
GRANT EXECUTE ON FUNCTION public.asset_location_events_sync_geom() TO service_role;
