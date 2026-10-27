ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active';

ALTER TABLE public.organization_members
  DROP CONSTRAINT IF EXISTS organization_members_status_check;

ALTER TABLE public.organization_members
  ADD CONSTRAINT organization_members_status_check CHECK (status IN ('active', 'inactive'));

CREATE INDEX IF NOT EXISTS idx_organization_members_status
  ON public.organization_members (organization_id, status);

COMMENT ON COLUMN public.organization_members.status IS
  'Conta ativa ou inativa nesta cidade. Inativos não acessam o CCO e ficam ocultos na lista até o administrador pedir para vê-los.';

CREATE OR REPLACE FUNCTION public.is_org_member(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND coalesce(m.status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.is_org_admin(p_org_id uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members m
    WHERE m.organization_id = p_org_id
      AND m.user_id = auth.uid()
      AND m.role IN ('admin', 'manager')
      AND coalesce(m.status, 'active') = 'active'
  );
$$;

REVOKE ALL ON FUNCTION public.is_org_member(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_member(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.is_org_admin(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_org_admin(uuid) TO authenticated;
