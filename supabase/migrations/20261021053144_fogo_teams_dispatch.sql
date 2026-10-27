CREATE TABLE IF NOT EXISTS public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  name text NOT NULL,
  specialty_label text NOT NULL,
  capabilities jsonb NOT NULL DEFAULT '[]'::jsonb,
  region text NOT NULL,
  status text NOT NULL DEFAULT 'disponível',
  assigned_incident_protocol text,
  member_names jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY teams_org_select ON public.teams
  FOR SELECT TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
    )
  );

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS required_capability text,
  ADD COLUMN IF NOT EXISTS assigned_team_external_id text;

CREATE INDEX IF NOT EXISTS idx_teams_org_status ON public.teams (organization_id, status);
CREATE INDEX IF NOT EXISTS idx_incidents_org_open ON public.incidents (organization_id, status);
