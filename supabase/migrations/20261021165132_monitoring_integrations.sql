-- Monitoramento técnico, conectores e ingestão (multi-tenant).
-- Segredos ficam em connector_secrets, sem política de SELECT para authenticated.

CREATE TABLE IF NOT EXISTS public.connector_secrets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ciphertext text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.connectors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'configured', 'active', 'paused', 'error')),
  health text NOT NULL DEFAULT 'unknown'
    CHECK (health IN ('unknown', 'healthy', 'degraded', 'down')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  secret_id uuid REFERENCES public.connector_secrets(id) ON DELETE SET NULL,
  last_attempt_at timestamptz,
  last_success_at timestamptz,
  last_error text,
  metrics jsonb NOT NULL DEFAULT '{}'::jsonb,
  adapter_version text NOT NULL DEFAULT '1',
  enabled boolean NOT NULL DEFAULT false,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS connectors_org_kind_idx ON public.connectors (organization_id, kind);
CREATE UNIQUE INDEX IF NOT EXISTS connectors_webhook_public_id_idx
  ON public.connectors ((config->>'publicId'))
  WHERE kind = 'webhook_in' AND config ? 'publicId';

CREATE TABLE IF NOT EXISTS public.monitoring_checks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_external_id text,
  connector_id uuid REFERENCES public.connectors(id) ON DELETE SET NULL,
  kind text NOT NULL,
  name text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  enabled boolean NOT NULL DEFAULT false,
  last_run_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS monitoring_checks_org_enabled_idx
  ON public.monitoring_checks (organization_id, enabled, last_run_at);

CREATE TABLE IF NOT EXISTS public.monitoring_check_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  check_id uuid NOT NULL REFERENCES public.monitoring_checks(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  ok boolean NOT NULL DEFAULT false,
  result text NOT NULL,
  latency_ms numeric,
  packet_loss numeric,
  http_status integer,
  tls_ok boolean,
  detail jsonb NOT NULL DEFAULT '{}'::jsonb,
  error text,
  data_origin text NOT NULL DEFAULT 'integracao'
);

CREATE INDEX IF NOT EXISTS monitoring_check_runs_org_started_idx
  ON public.monitoring_check_runs (organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS monitoring_check_runs_check_idx
  ON public.monitoring_check_runs (check_id, started_at DESC);

CREATE TABLE IF NOT EXISTS public.ingest_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid REFERENCES public.connectors(id) ON DELETE SET NULL,
  idempotency_key text NOT NULL,
  source_kind text NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'received'
    CHECK (status IN ('received', 'queued', 'processed', 'rejected', 'failed')),
  payload jsonb,
  payload_hash text,
  error text,
  data_origin text NOT NULL DEFAULT 'integracao',
  UNIQUE (organization_id, connector_id, idempotency_key)
);

CREATE INDEX IF NOT EXISTS ingest_events_org_received_idx
  ON public.ingest_events (organization_id, received_at DESC);

CREATE TABLE IF NOT EXISTS public.normalized_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ingest_event_id uuid REFERENCES public.ingest_events(id) ON DELETE SET NULL,
  asset_external_id text,
  event_type text NOT NULL,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  quality text NOT NULL DEFAULT 'conhecida',
  data_origin text NOT NULL DEFAULT 'integracao',
  source text
);

CREATE INDEX IF NOT EXISTS normalized_events_org_occurred_idx
  ON public.normalized_events (organization_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.telemetry_samples (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_external_id text,
  connector_id uuid REFERENCES public.connectors(id) ON DELETE SET NULL,
  metric text NOT NULL,
  value numeric,
  unit text,
  occurred_at timestamptz NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  quality text NOT NULL DEFAULT 'conhecida',
  data_origin text NOT NULL DEFAULT 'integracao',
  ingest_event_id uuid REFERENCES public.ingest_events(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS telemetry_samples_org_metric_idx
  ON public.telemetry_samples (organization_id, metric, occurred_at DESC);
CREATE INDEX IF NOT EXISTS telemetry_samples_asset_idx
  ON public.telemetry_samples (organization_id, asset_external_id, occurred_at DESC);

CREATE TABLE IF NOT EXISTS public.asset_monitor_states (
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  asset_external_id text NOT NULL,
  state text NOT NULL
    CHECK (state IN ('operational', 'degraded', 'unavailable', 'unknown', 'stale', 'maintenance')),
  reason text,
  evidence jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_check_at timestamptz,
  last_ok_at timestamptz,
  consecutive_failures integer NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (organization_id, asset_external_id)
);

CREATE TABLE IF NOT EXISTS public.outbound_webhook_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  connector_id uuid NOT NULL REFERENCES public.connectors(id) ON DELETE CASCADE,
  event_type text NOT NULL,
  event_id text NOT NULL,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'delivered', 'failed')),
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  response_status integer,
  next_retry_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, connector_id, event_id)
);

CREATE INDEX IF NOT EXISTS outbound_webhook_deliveries_retry_idx
  ON public.outbound_webhook_deliveries (status, next_retry_at);

CREATE TABLE IF NOT EXISTS public.ingest_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL,
  ref_id uuid,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'processing', 'done', 'failed')),
  run_after timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  error text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);

CREATE INDEX IF NOT EXISTS ingest_jobs_pending_idx
  ON public.ingest_jobs (status, run_after);

ALTER TABLE public.connector_secrets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.connectors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_checks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monitoring_check_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.normalized_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.telemetry_samples ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asset_monitor_states ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.outbound_webhook_deliveries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ingest_jobs ENABLE ROW LEVEL SECURITY;

-- Segredos: nenhum acesso via JWT (somente service_role).
REVOKE ALL ON public.connector_secrets FROM anon, authenticated, PUBLIC;

CREATE POLICY connectors_select ON public.connectors
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY connectors_admin ON public.connectors
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY monitoring_checks_select ON public.monitoring_checks
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY monitoring_checks_admin ON public.monitoring_checks
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY monitoring_check_runs_select ON public.monitoring_check_runs
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY ingest_events_select ON public.ingest_events
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY normalized_events_select ON public.normalized_events
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY telemetry_samples_select ON public.telemetry_samples
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY asset_monitor_states_select ON public.asset_monitor_states
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));
CREATE POLICY outbound_webhook_deliveries_select ON public.outbound_webhook_deliveries
  FOR SELECT TO authenticated USING (public.is_org_member(organization_id));

CREATE POLICY ingest_jobs_admin ON public.ingest_jobs
  FOR ALL TO authenticated USING (public.is_org_admin(organization_id)) WITH CHECK (public.is_org_admin(organization_id));

REVOKE ALL ON public.connectors FROM anon;
REVOKE ALL ON public.monitoring_checks FROM anon;
REVOKE ALL ON public.monitoring_check_runs FROM anon;
REVOKE ALL ON public.ingest_events FROM anon;
REVOKE ALL ON public.normalized_events FROM anon;
REVOKE ALL ON public.telemetry_samples FROM anon;
REVOKE ALL ON public.asset_monitor_states FROM anon;
REVOKE ALL ON public.outbound_webhook_deliveries FROM anon;
REVOKE ALL ON public.ingest_jobs FROM anon;
