-- Schema base FOGO (exportado do cloud). Sem dados de tenant.

CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "postgis";

CREATE TYPE public.data_origin AS ENUM ('simulado', 'real', 'integracao');
CREATE TYPE public.incident_priority AS ENUM ('baixa', 'média', 'alta', 'crítica');
CREATE TYPE public.incident_status AS ENUM ('aberta', 'em atendimento', 'resolvida', 'cancelada');
CREATE TYPE public.alert_severity AS ENUM ('informativa', 'baixa', 'média', 'alta', 'crítica');
CREATE TYPE public.alert_state AS ENUM ('novo', 'reconhecido', 'em atendimento', 'em observação', 'resolvido', 'falso positivo');
CREATE TYPE public.asset_status AS ENUM ('operacional', 'alerta', 'inativo');
CREATE TYPE public.maintenance_status AS ENUM ('pendente', 'em execução', 'concluída', 'atrasada');
CREATE TYPE public.member_role AS ENUM ('admin', 'manager', 'operator', 'viewer');
CREATE TYPE public.activity_kind AS ENUM ('asset', 'incident', 'team', 'maintenance', 'alert', 'system');

CREATE TABLE public.organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.cities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  map_image_path text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.organization_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role public.member_role NOT NULL DEFAULT 'operator',
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);

CREATE INDEX idx_org_members_user ON public.organization_members(user_id);

CREATE TABLE public.assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  category text NOT NULL,
  region text NOT NULL,
  status public.asset_status NOT NULL DEFAULT 'operacional',
  health smallint NOT NULL DEFAULT 100 CHECK (health >= 0 AND health <= 100),
  last_seen timestamptz NOT NULL DEFAULT now(),
  map_x numeric(6,2),
  map_y numeric(6,2),
  geom geography(POINT, 4326),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

CREATE TABLE public.incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protocol text NOT NULL,
  description text NOT NULL,
  type text NOT NULL,
  region text NOT NULL,
  priority public.incident_priority NOT NULL,
  status public.incident_status NOT NULL DEFAULT 'aberta',
  opened_at timestamptz NOT NULL DEFAULT now(),
  assignee text,
  related_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  location text NOT NULL,
  notes text,
  data_origin public.data_origin NOT NULL DEFAULT 'real',
  source_alert_protocol text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, protocol)
);

CREATE TABLE public.alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protocol text NOT NULL,
  category text NOT NULL,
  severity public.alert_severity NOT NULL,
  title text NOT NULL,
  description text NOT NULL,
  source text NOT NULL,
  data_origin public.data_origin NOT NULL DEFAULT 'simulado',
  related_asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  region text,
  incident_id uuid REFERENCES public.incidents(id) ON DELETE SET NULL,
  detected_at timestamptz NOT NULL DEFAULT now(),
  state public.alert_state NOT NULL DEFAULT 'novo',
  rule text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, protocol)
);

CREATE TABLE public.alert_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  alert_id uuid NOT NULL REFERENCES public.alerts(id) ON DELETE CASCADE,
  from_state public.alert_state,
  to_state public.alert_state NOT NULL,
  changed_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  note text
);

CREATE TABLE public.maintenance_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  asset_name text NOT NULL,
  type text NOT NULL CHECK (type IN ('preventiva', 'corretiva')),
  priority public.incident_priority NOT NULL,
  assignee text NOT NULL,
  due_date date NOT NULL,
  status public.maintenance_status NOT NULL DEFAULT 'pendente',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

CREATE TABLE public.activity_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  message text NOT NULL,
  kind public.activity_kind NOT NULL,
  data_origin public.data_origin,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

CREATE TABLE public.map_markers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  kind text NOT NULL,
  name text NOT NULL,
  map_x numeric(6,2) NOT NULL,
  map_y numeric(6,2) NOT NULL,
  status text NOT NULL,
  region text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  incident_protocol text,
  priority public.incident_priority,
  asset_id uuid REFERENCES public.assets(id) ON DELETE SET NULL,
  UNIQUE (organization_id, external_id)
);

CREATE TABLE public.system_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  simulation jsonb NOT NULL DEFAULT '{"enabled":false,"intensity":"medium","tickIntervalMs":60000,"ticksTotal":0}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.counters (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  value integer NOT NULL DEFAULT 0,
  PRIMARY KEY (organization_id, name)
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = auth.uid()
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_history ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.maintenance_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.map_markers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.counters ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_select_member ON public.organizations FOR SELECT TO authenticated USING (public.is_org_member(id));
CREATE POLICY cities_select ON public.cities FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY cities_write_admin ON public.cities FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY profiles_select_own ON public.profiles FOR SELECT TO authenticated USING (id = auth.uid());
CREATE POLICY profiles_update_own ON public.profiles FOR UPDATE TO authenticated USING (id = auth.uid()) WITH CHECK (id = auth.uid());
CREATE POLICY profiles_insert_own ON public.profiles FOR INSERT TO authenticated WITH CHECK (id = auth.uid());
CREATE POLICY org_members_select ON public.organization_members FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY org_members_admin_write ON public.organization_members FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY assets_tenant ON public.assets FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY assets_write ON public.assets FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY incidents_select ON public.incidents FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY incidents_write ON public.incidents FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY alerts_select ON public.alerts FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY alerts_write ON public.alerts FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY alert_history_select ON public.alert_history FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY alert_history_insert ON public.alert_history FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY maintenance_select ON public.maintenance_orders FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY maintenance_write ON public.maintenance_orders FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY activity_select ON public.activity_events FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY activity_insert ON public.activity_events FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY map_markers_select ON public.map_markers FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY map_markers_write ON public.map_markers FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY system_settings_select ON public.system_settings FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY system_settings_write ON public.system_settings FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY counters_tenant ON public.counters FOR ALL TO authenticated USING (public.is_org_member(organization_id)) WITH CHECK (public.is_org_member(organization_id));
CREATE POLICY audit_select ON public.audit_log FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY audit_insert ON public.audit_log FOR INSERT TO authenticated WITH CHECK (public.is_org_member(organization_id));

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', NEW.email))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
