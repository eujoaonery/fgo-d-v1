CREATE TABLE IF NOT EXISTS public.asset_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  marker_kind text NOT NULL DEFAULT 'sensor',
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, slug)
);

ALTER TABLE public.asset_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY asset_categories_org_select ON public.asset_categories
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS patrimony_code text,
  ADD COLUMN IF NOT EXISTS serial_number text,
  ADD COLUMN IF NOT EXISTS manufacturer text,
  ADD COLUMN IF NOT EXISTS model text,
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS connectivity_status text NOT NULL DEFAULT 'desconhecido',
  ADD COLUMN IF NOT EXISTS cadastral_status text NOT NULL DEFAULT 'ativo',
  ADD COLUMN IF NOT EXISTS criticality text NOT NULL DEFAULT 'média',
  ADD COLUMN IF NOT EXISTS responsible_org text,
  ADD COLUMN IF NOT EXISTS responsible_team text,
  ADD COLUMN IF NOT EXISTS notes text,
  ADD COLUMN IF NOT EXISTS installed_at timestamptz;

ALTER TABLE public.teams
  ADD COLUMN IF NOT EXISTS map_x numeric,
  ADD COLUMN IF NOT EXISTS map_y numeric,
  ADD COLUMN IF NOT EXISTS map_marker_external_id text;

CREATE TABLE IF NOT EXISTS public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  team_id uuid NOT NULL REFERENCES public.teams(id) ON DELETE CASCADE,
  display_name text NOT NULL,
  role_label text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_team_members_team ON public.team_members (team_id);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY team_members_org_select ON public.team_members
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.maintenance_orders
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS origin text DEFAULT 'manual',
  ADD COLUMN IF NOT EXISTS source_alert_protocol text,
  ADD COLUMN IF NOT EXISTS opened_at timestamptz DEFAULT now();

CREATE TABLE IF NOT EXISTS public.maintenance_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  maintenance_external_id text NOT NULL,
  from_status text,
  to_status text NOT NULL,
  note text,
  actor_label text NOT NULL DEFAULT 'operador',
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_maintenance_history_order ON public.maintenance_history (organization_id, maintenance_external_id);

ALTER TABLE public.maintenance_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY maintenance_history_org_select ON public.maintenance_history
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );
