-- Auditoria 2026-10-23: fecha leitura irrestrita via PostgREST e remove
-- escrita JWT nas tabelas de negócio. O BFF continua com service_role.

-- ---------------------------------------------------------------------------
-- Políticas perigosas
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS asset_history_org_select ON public.asset_history;
CREATE POLICY asset_history_org_select ON public.asset_history
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS asset_attachments_org_select ON public.asset_attachments;
CREATE POLICY asset_attachments_org_select ON public.asset_attachments
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS cities_super_admin ON public.cities;
CREATE POLICY cities_super_admin ON public.cities
  FOR ALL TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS org_members_super_admin ON public.organization_members;
CREATE POLICY org_members_super_admin ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS predictions_org_isolation ON public.predictions;
CREATE POLICY predictions_org_select ON public.predictions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_super_admin());

DROP POLICY IF EXISTS predictive_runs_org_isolation ON public.predictive_runs;
CREATE POLICY predictive_runs_org_select ON public.predictive_runs
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_super_admin());

DROP POLICY IF EXISTS telemetry_events_org_isolation ON public.telemetry_events;
CREATE POLICY telemetry_events_org_select ON public.telemetry_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_super_admin());

GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO authenticated;

-- ---------------------------------------------------------------------------
-- BFF é o único cliente de escrita/leitura de negócio
-- ---------------------------------------------------------------------------
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind IN ('r', 'v', 'm', 'p')
      AND c.relname NOT IN ('spatial_ref_sys', 'geography_columns', 'geometry_columns')
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC, authenticated', r.relname);
  END LOOP;
END $$;

DO $$
BEGIN
  BEGIN
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon, authenticated, PUBLIC;
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE NOTICE 'spatial_ref_sys revoke: %', SQLERRM;
  END;
  BEGIN
    REVOKE ALL ON TABLE public.geography_columns FROM anon, authenticated, PUBLIC;
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE NOTICE 'geography_columns revoke: %', SQLERRM;
  END;
  BEGIN
    REVOKE ALL ON TABLE public.geometry_columns FROM anon, authenticated, PUBLIC;
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE NOTICE 'geometry_columns revoke: %', SQLERRM;
  END;
END $$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND c.relrowsecurity
      AND c.relname <> 'spatial_ref_sys'
  LOOP
    EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY', r.relname);
  END LOOP;
END $$;
