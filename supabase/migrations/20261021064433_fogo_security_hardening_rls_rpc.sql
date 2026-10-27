-- Espelho da migration aplicada via MCP (fogo_security_hardening_rls_rpc)

DROP POLICY IF EXISTS org_groups_select_member ON public.organization_groups;
CREATE POLICY org_groups_select_member ON public.organization_groups
  FOR SELECT TO authenticated
  USING (public.is_org_member(organization_id));

DROP POLICY IF EXISTS org_groups_admin_insert ON public.organization_groups;
CREATE POLICY org_groups_admin_insert ON public.organization_groups
  FOR INSERT TO authenticated
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS org_groups_admin_update ON public.organization_groups;
CREATE POLICY org_groups_admin_update ON public.organization_groups
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS org_groups_admin_delete ON public.organization_groups;
CREATE POLICY org_groups_admin_delete ON public.organization_groups
  FOR DELETE TO authenticated
  USING (public.is_org_admin(organization_id));

DROP POLICY IF EXISTS system_logs_admin_select ON public.system_logs;
CREATE POLICY system_logs_admin_select ON public.system_logs
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members m
      WHERE m.organization_id = system_logs.organization_id
        AND m.user_id = auth.uid()
        AND m.role IN ('admin', 'manager')
    )
  );

REVOKE EXECUTE ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.is_platform_super_admin() FROM anon;

-- Ver também migration fogo_security_revoke_anon_org_rpc (is_org_* anon, is_platform_super_admin authenticated)
