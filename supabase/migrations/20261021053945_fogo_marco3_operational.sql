-- Marco 3: telemetria, SLA de alertas, prazos de ocorrência

CREATE TABLE IF NOT EXISTS public.telemetry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  idempotency_key text NOT NULL,
  event_type text NOT NULL,
  source text NOT NULL DEFAULT 'monitoramento',
  asset_external_id text,
  alert_protocol text,
  region text,
  payload jsonb,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS telemetry_events_org_occurred_idx
  ON public.telemetry_events (organization_id, occurred_at DESC);

CREATE INDEX IF NOT EXISTS telemetry_events_org_asset_idx
  ON public.telemetry_events (organization_id, asset_external_id)
  WHERE asset_external_id IS NOT NULL;

ALTER TABLE public.alerts
  ADD COLUMN IF NOT EXISTS response_due_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalated_at timestamptz,
  ADD COLUMN IF NOT EXISTS escalation_level int NOT NULL DEFAULT 0;

ALTER TABLE public.incidents
  ADD COLUMN IF NOT EXISTS due_at timestamptz,
  ADD COLUMN IF NOT EXISTS resolved_at timestamptz;

ALTER TABLE public.alert_history
  ADD COLUMN IF NOT EXISTS actor_label text DEFAULT 'sistema';

ALTER TABLE public.telemetry_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY telemetry_events_org_isolation ON public.telemetry_events
  FOR ALL
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );
