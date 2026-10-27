-- Endurecimento de segurança do schema public:
-- 1) status de membro (migration local não aplicada no remoto)
-- 2) políticas nas tabelas com RLS sem policy
-- 3) revoke de anon / privilégios perigosos
-- 4) search_path nas funções de trigger
-- 5) spatial_ref_sys só leitura autenticada

-- ---------------------------------------------------------------------------
-- Membros inativos não passam em is_org_member / is_org_admin
-- ---------------------------------------------------------------------------
ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_status_check;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_status_check CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_organization_members_status
  ON public.organization_members (organization_id, status);

COMMENT ON COLUMN public.organization_members.status IS
  'Conta ativa ou inativa nesta cidade. Inativos não acessam o CCO.';

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND coalesce(m.status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'manager')
      AND coalesce(m.status, 'active') = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_platform_super_admin() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO service_role;
REVOKE ALL ON FUNCTION public.increment_counter(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.increment_counter(uuid, text) TO service_role;

-- ---------------------------------------------------------------------------
-- Funções de trigger: search_path fixo
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.assets_sync_geom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
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
    NEW.geom := ST_SetSRID(ST_MakePoint(lng, lat), 4326)::geography;
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.asset_location_events_sync_geom()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.geom := ST_SetSRID(ST_MakePoint(NEW.lng, NEW.lat), 4326)::geography;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.assets_sync_geom() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.asset_location_events_sync_geom() FROM PUBLIC, anon, authenticated;

REVOKE ALL ON FUNCTION public.st_estimatedextent(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.st_estimatedextent(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.st_estimatedextent(text, text, text, boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Políticas nas tabelas que tinham RLS sem policy
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS asset_location_events_select ON public.asset_location_events;
CREATE POLICY asset_location_events_select ON public.asset_location_events
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS prometheus_alpha_sessions_select ON public.prometheus_alpha_sessions;
CREATE POLICY prometheus_alpha_sessions_select ON public.prometheus_alpha_sessions
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS prometheus_alpha_messages_select ON public.prometheus_alpha_messages;
CREATE POLICY prometheus_alpha_messages_select ON public.prometheus_alpha_messages
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS prometheus_alpha_analyses_select ON public.prometheus_alpha_analyses;
CREATE POLICY prometheus_alpha_analyses_select ON public.prometheus_alpha_analyses
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS prometheus_alpha_recommendations_select ON public.prometheus_alpha_recommendations;
CREATE POLICY prometheus_alpha_recommendations_select ON public.prometheus_alpha_recommendations
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

-- Segredos: negação explícita para JWT; somente service_role lê/escreve.
DROP POLICY IF EXISTS connector_secrets_deny ON public.connector_secrets;
CREATE POLICY connector_secrets_deny ON public.connector_secrets
  FOR ALL TO authenticated, anon
  USING (false)
  WITH CHECK (false);
REVOKE ALL ON public.connector_secrets FROM PUBLIC, anon, authenticated;

-- spatial_ref_sys pertence ao PostGIS: o papel da migration não é owner.
-- RLS/ALTER nessa tabela falha (42501). A exposição via PostgREST deve
-- ser reduzida no dashboard (unexpose) ou com revoke pelo owner da extensão.

-- ---------------------------------------------------------------------------
-- Histórico de rotas: append-only para JWT
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.operational_route_history FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.operational_route_history TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_route_history TO service_role;

REVOKE ALL ON public.operational_routes FROM PUBLIC, anon;
REVOKE ALL ON public.operational_route_stops FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_routes TO authenticated, service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_route_stops TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Nenhum acesso anon nas tabelas public; JWT sem TRUNCATE
-- ---------------------------------------------------------------------------
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
      AND c.relname <> 'spatial_ref_sys'
  LOOP
    EXECUTE format('REVOKE ALL ON TABLE public.%I FROM anon, PUBLIC', r.relname);
    EXECUTE format('REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.%I FROM authenticated', r.relname);
  END LOOP;
END $$;
