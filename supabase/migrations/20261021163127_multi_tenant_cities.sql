-- Multi-tenant: estado, modo de operação, provisionamento e auditoria administrativa.
-- A cidade existente (prefeitura-marilia) permanece; nenhum registro operacional é apagado.

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS description text,
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS operation_mode text NOT NULL DEFAULT 'demo',
  ADD COLUMN IF NOT EXISTS settings jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS timezone text NOT NULL DEFAULT 'America/Sao_Paulo',
  ADD COLUMN IF NOT EXISTS locale text NOT NULL DEFAULT 'pt-BR',
  ADD COLUMN IF NOT EXISTS created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_status_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_status_check
  CHECK (status IN ('provisioning', 'active', 'suspended', 'archived'));

ALTER TABLE public.organizations DROP CONSTRAINT IF EXISTS organizations_operation_mode_check;
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_operation_mode_check
  CHECK (operation_mode IN ('demo', 'real'));

UPDATE public.organizations
SET
  status = COALESCE(NULLIF(status, ''), 'active'),
  operation_mode = COALESCE(NULLIF(operation_mode, ''), 'demo'),
  timezone = COALESCE(NULLIF(timezone, ''), 'America/Sao_Paulo'),
  locale = COALESCE(NULLIF(locale, ''), 'pt-BR'),
  updated_at = now()
WHERE true;

CREATE OR REPLACE FUNCTION public.touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS organizations_touch_updated_at ON public.organizations;
CREATE TRIGGER organizations_touch_updated_at
  BEFORE UPDATE ON public.organizations
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_updated_at();

CREATE TABLE IF NOT EXISTS public.tenant_provisioning_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  source_organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('create', 'duplicate')),
  status text NOT NULL DEFAULT 'requested'
    CHECK (status IN ('requested', 'provisioning', 'completed', 'failed', 'cancelled')),
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  steps jsonb NOT NULL DEFAULT '[]'::jsonb,
  error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.tenant_admin_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  action text NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS tenant_provisioning_jobs_org_idx
  ON public.tenant_provisioning_jobs (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS tenant_admin_events_org_idx
  ON public.tenant_admin_events (organization_id, created_at DESC);
CREATE INDEX IF NOT EXISTS organizations_status_idx
  ON public.organizations (status);

ALTER TABLE public.tenant_provisioning_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tenant_admin_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS tenant_jobs_super_admin ON public.tenant_provisioning_jobs;
CREATE POLICY tenant_jobs_super_admin ON public.tenant_provisioning_jobs
  FOR ALL TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

DROP POLICY IF EXISTS tenant_events_super_admin ON public.tenant_admin_events;
CREATE POLICY tenant_events_super_admin ON public.tenant_admin_events
  FOR ALL TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

REVOKE ALL ON public.tenant_provisioning_jobs FROM anon, PUBLIC;
REVOKE ALL ON public.tenant_admin_events FROM anon, PUBLIC;
GRANT SELECT, INSERT, UPDATE ON public.tenant_provisioning_jobs TO authenticated;
GRANT SELECT, INSERT ON public.tenant_admin_events TO authenticated;

COMMENT ON COLUMN public.organizations.status IS 'provisioning | active | suspended | archived';
COMMENT ON COLUMN public.organizations.operation_mode IS 'demo = dados sintéticos autorizados; real = operação municipal';
