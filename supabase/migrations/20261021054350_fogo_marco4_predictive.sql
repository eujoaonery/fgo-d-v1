CREATE TYPE public.prediction_type AS ENUM (
  'region_risk',
  'maintenance_due',
  'incident_spike'
);

CREATE TYPE public.prediction_review_status AS ENUM (
  'pending',
  'confirmed',
  'missed',
  'partial',
  'expired'
);

CREATE TABLE IF NOT EXISTS public.predictions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  external_id text NOT NULL,
  prediction_type public.prediction_type NOT NULL,
  target_label text NOT NULL,
  region text,
  asset_external_id text,
  horizon_hours int NOT NULL DEFAULT 24,
  calculated_at timestamptz NOT NULL DEFAULT now(),
  predicted_value numeric,
  baseline_value numeric,
  probability numeric,
  model_name text NOT NULL DEFAULT 'fogo-rules-v1',
  model_version text NOT NULL DEFAULT '1.0.0',
  input_summary jsonb,
  explanation text NOT NULL,
  recommendation text,
  alert_protocol text,
  observed_value numeric,
  observed_at timestamptz,
  review_status public.prediction_review_status NOT NULL DEFAULT 'pending',
  review_note text,
  reviewed_at timestamptz,
  reviewed_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, external_id)
);

CREATE INDEX IF NOT EXISTS predictions_org_calc_idx ON public.predictions (organization_id, calculated_at DESC);
CREATE INDEX IF NOT EXISTS predictions_org_review_idx ON public.predictions (organization_id, review_status);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY predictions_org_isolation ON public.predictions
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
