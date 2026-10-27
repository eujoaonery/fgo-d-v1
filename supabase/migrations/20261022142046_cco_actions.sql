CREATE TABLE IF NOT EXISTS public.cco_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source text NOT NULL CHECK (source IN ('alpha', 'preditivo', 'estrategico')),
  source_id text NOT NULL,
  title text NOT NULL,
  action_text text NOT NULL,
  detail text,
  priority text NOT NULL CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  region text,
  origin_label text NOT NULL,
  status text NOT NULL DEFAULT 'analisar' CHECK (status IN ('analisar', 'delegada', 'tomada', 'ignorada')),
  taken_action text,
  delegated_to_name text,
  delegated_to_user_id text,
  ignored_reason text,
  decided_at timestamptz,
  decided_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source, source_id)
);

CREATE INDEX IF NOT EXISTS cco_actions_org_status_idx
  ON public.cco_actions (organization_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS cco_actions_org_priority_idx
  ON public.cco_actions (organization_id, priority, created_at DESC);

ALTER TABLE public.cco_actions ENABLE ROW LEVEL SECURITY;

CREATE POLICY cco_actions_select ON public.cco_actions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY cco_actions_admin_write ON public.cco_actions
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

REVOKE ALL ON public.cco_actions FROM anon;
GRANT SELECT ON public.cco_actions TO authenticated;
