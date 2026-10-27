-- Motor de previsão v2: controles persistentes, horizontes 24h/7d/30d e log de execução.
-- Reaproveita public.predictions e public.system_settings. Não remove dados existentes.

ALTER TABLE public.system_settings
  ADD COLUMN IF NOT EXISTS predictive jsonb NOT NULL DEFAULT '{
    "learningEnabled": true,
    "forecastsEnabled": true,
    "evaluationEnabled": true,
    "retrainEnabled": true,
    "includeSimulated": true,
    "intervalSec": 900
  }'::jsonb;

COMMENT ON COLUMN public.system_settings.predictive IS
  'Controles do motor de previsão (aprendizagem, emissão, avaliação, retreino) e estado do modelo estatístico.';

DO $$
BEGIN
  ALTER TYPE public.prediction_type ADD VALUE IF NOT EXISTS 'demand_forecast';
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

ALTER TABLE public.predictions
  ADD COLUMN IF NOT EXISTS period_start timestamptz,
  ADD COLUMN IF NOT EXISTS period_end timestamptz,
  ADD COLUMN IF NOT EXISTS interval_low numeric,
  ADD COLUMN IF NOT EXISTS interval_high numeric,
  ADD COLUMN IF NOT EXISTS observation_count integer,
  ADD COLUMN IF NOT EXISTS data_origin_set text,
  ADD COLUMN IF NOT EXISTS dataset_watermark text;

CREATE TABLE IF NOT EXISTS public.predictive_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  duration_ms integer,
  status text NOT NULL CHECK (status IN ('ok', 'error', 'skipped')),
  step text NOT NULL,
  error text,
  summary jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS predictive_runs_org_started_idx
  ON public.predictive_runs (organization_id, started_at DESC);

ALTER TABLE public.predictive_runs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS predictive_runs_org_isolation ON public.predictive_runs;
CREATE POLICY predictive_runs_org_isolation ON public.predictive_runs
  FOR ALL
  USING (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  )
  WITH CHECK (
    organization_id IN (
      SELECT om.organization_id FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
    OR EXISTS (SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid())
  );
