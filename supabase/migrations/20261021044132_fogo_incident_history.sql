CREATE TABLE IF NOT EXISTS public.incident_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  incident_protocol text NOT NULL,
  from_status public.incident_status,
  to_status public.incident_status NOT NULL,
  note text,
  actor_label text NOT NULL DEFAULT 'operador',
  changed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_incident_history_protocol ON public.incident_history(organization_id, incident_protocol, changed_at DESC);

ALTER TABLE public.incident_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY incident_history_select ON public.incident_history
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id) OR public.is_platform_super_admin());

CREATE POLICY incident_history_insert ON public.incident_history
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_member(organization_id) OR public.is_platform_super_admin());
