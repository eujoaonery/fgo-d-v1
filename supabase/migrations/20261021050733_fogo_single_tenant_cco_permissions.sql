ALTER TABLE public.organization_members
  ADD COLUMN IF NOT EXISTS permissions jsonb NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN public.organization_members.permissions IS
  'Privilégios por módulo CCO (view/manage). Role admin ignora e tem acesso total.';
