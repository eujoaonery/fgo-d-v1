-- Prometheus Alpha: sessões de chat, análises, recomendações e feedback.

CREATE TABLE IF NOT EXISTS public.prometheus_alpha_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  context jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL
);

CREATE TABLE IF NOT EXISTS public.prometheus_alpha_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid NOT NULL REFERENCES public.prometheus_alpha_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prometheus_alpha_analyses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id uuid REFERENCES public.prometheus_alpha_sessions(id) ON DELETE SET NULL,
  kind text NOT NULL,
  title text NOT NULL,
  params jsonb NOT NULL DEFAULT '{}'::jsonb,
  result jsonb NOT NULL DEFAULT '{}'::jsonb,
  sources jsonb NOT NULL DEFAULT '[]'::jsonb,
  model_version text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.prometheus_alpha_recommendations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  analysis_id uuid REFERENCES public.prometheus_alpha_analyses(id) ON DELETE SET NULL,
  category text NOT NULL,
  priority text NOT NULL CHECK (priority IN ('baixa', 'media', 'alta', 'critica')),
  region text,
  related_ref text,
  situation text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '[]'::jsonb,
  justification text NOT NULL,
  action_text text NOT NULL,
  suggested_deadline text,
  expected_benefit text,
  uncertainties text,
  generator text NOT NULL,
  model_version text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'rejected', 'deferred', 'irrelevant')),
  decision_justification text,
  decision_at timestamptz,
  decision_by uuid,
  observed_result text,
  observed_at timestamptz,
  observed_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS prometheus_alpha_sessions_org_user_idx
  ON public.prometheus_alpha_sessions (organization_id, user_id, expires_at DESC);
CREATE INDEX IF NOT EXISTS prometheus_alpha_messages_session_idx
  ON public.prometheus_alpha_messages (session_id, created_at);
CREATE INDEX IF NOT EXISTS prometheus_alpha_analyses_org_created_idx
  ON public.prometheus_alpha_analyses (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS prometheus_alpha_recs_org_status_idx
  ON public.prometheus_alpha_recommendations (organization_id, status, created_at DESC);

ALTER TABLE public.prometheus_alpha_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prometheus_alpha_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prometheus_alpha_analyses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prometheus_alpha_recommendations ENABLE ROW LEVEL SECURITY;
