-- Rotas operacionais: planejamento de OS agendadas (sem alterar status da ordem).

CREATE TABLE IF NOT EXISTS public.operational_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  agent_external_id text NOT NULL,
  agent_name text NOT NULL,
  planned_date date,
  origin_latitude double precision NOT NULL,
  origin_longitude double precision NOT NULL,
  origin_description text,
  origin_source text NOT NULL DEFAULT 'cadastro_operacional',
  origin_recorded_at timestamptz,
  geometry jsonb,
  total_distance_meters integer,
  estimated_duration_seconds integer,
  provider text,
  provider_version text,
  optimization text,
  constraints jsonb,
  notes text,
  status text NOT NULL DEFAULT 'planned'
    CHECK (status IN ('draft', 'planned', 'available', 'in_progress', 'completed', 'cancelled')),
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

CREATE TABLE IF NOT EXISTS public.operational_route_stops (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.operational_routes(id) ON DELETE CASCADE,
  incident_protocol text NOT NULL,
  sequence integer NOT NULL,
  latitude double precision NOT NULL,
  longitude double precision NOT NULL,
  address text,
  coord_source text,
  estimated_arrival_at timestamptz,
  estimated_departure_at timestamptz,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'en_route', 'arrived', 'done', 'skipped')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (route_id, incident_protocol),
  UNIQUE (route_id, sequence)
);

CREATE TABLE IF NOT EXISTS public.operational_route_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  route_id uuid NOT NULL REFERENCES public.operational_routes(id) ON DELETE CASCADE,
  action text NOT NULL,
  previous_data jsonb,
  new_data jsonb,
  performed_by text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS operational_routes_org_agent_idx
  ON public.operational_routes (organization_id, agent_external_id, planned_date);
CREATE INDEX IF NOT EXISTS operational_routes_org_status_idx
  ON public.operational_routes (organization_id, status, updated_at DESC);
CREATE INDEX IF NOT EXISTS operational_route_stops_org_route_idx
  ON public.operational_route_stops (organization_id, route_id, sequence);
CREATE INDEX IF NOT EXISTS operational_route_history_route_idx
  ON public.operational_route_history (route_id, created_at DESC);

ALTER TABLE public.operational_routes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_route_stops ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.operational_route_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY operational_routes_select ON public.operational_routes
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY operational_routes_write ON public.operational_routes
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY operational_route_stops_select ON public.operational_route_stops
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY operational_route_stops_write ON public.operational_route_stops
  FOR ALL TO authenticated
  USING (public.is_org_member(organization_id))
  WITH CHECK (public.is_org_member(organization_id));

CREATE POLICY operational_route_history_select ON public.operational_route_history
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY operational_route_history_write ON public.operational_route_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id));

REVOKE ALL ON public.operational_routes FROM anon;
REVOKE ALL ON public.operational_route_stops FROM anon;
REVOKE ALL ON public.operational_route_history FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_routes TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.operational_route_stops TO authenticated;
GRANT SELECT, INSERT ON public.operational_route_history TO authenticated;
