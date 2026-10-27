CREATE TABLE IF NOT EXISTS public.strategic_briefings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  generated_at timestamptz NOT NULL DEFAULT now(),
  model text,
  context_hash text,
  snapshot_digest jsonb NOT NULL DEFAULT '{}'::jsonb,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  briefing jsonb NOT NULL,
  stale boolean NOT NULL DEFAULT false,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS strategic_briefings_org_generated_idx
  ON public.strategic_briefings (organization_id, generated_at DESC);

CREATE TABLE IF NOT EXISTS public.strategic_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protocol text NOT NULL,
  action_type text NOT NULL,
  status text NOT NULL,
  title text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  justification text,
  region text,
  created_by text,
  approved_by text,
  approved_at timestamptz,
  executed_at timestamptz,
  execution_result jsonb,
  linked_entity text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, protocol)
);

CREATE INDEX IF NOT EXISTS strategic_actions_org_status_idx
  ON public.strategic_actions (organization_id, status, created_at DESC);

CREATE TABLE IF NOT EXISTS public.strategic_action_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  action_id uuid NOT NULL REFERENCES public.strategic_actions(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  detail jsonb,
  actor_label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.contingency_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  protocol text NOT NULL,
  title text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  status text NOT NULL,
  body jsonb NOT NULL DEFAULT '{}'::jsonb,
  parent_id uuid REFERENCES public.contingency_plans(id) ON DELETE SET NULL,
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, protocol, version)
);

ALTER TABLE public.strategic_briefings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.strategic_action_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contingency_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY strategic_briefings_select ON public.strategic_briefings
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY strategic_actions_select ON public.strategic_actions
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY strategic_action_events_select ON public.strategic_action_events
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY contingency_plans_select ON public.contingency_plans
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY strategic_briefings_admin_write ON public.strategic_briefings
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY strategic_actions_admin_write ON public.strategic_actions
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY strategic_action_events_admin_write ON public.strategic_action_events
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));
CREATE POLICY contingency_plans_admin_write ON public.contingency_plans
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

REVOKE ALL ON public.strategic_briefings FROM anon;
REVOKE ALL ON public.strategic_actions FROM anon;
REVOKE ALL ON public.strategic_action_events FROM anon;
REVOKE ALL ON public.contingency_plans FROM anon;
