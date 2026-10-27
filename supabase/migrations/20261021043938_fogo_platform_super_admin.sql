CREATE TABLE IF NOT EXISTS public.platform_admins (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.platform_admins ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.platform_admins pa WHERE pa.user_id = auth.uid()
  );
$$;

REVOKE ALL ON FUNCTION public.is_platform_super_admin() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.is_platform_super_admin() TO authenticated;

CREATE POLICY platform_admins_self ON public.platform_admins
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_platform_super_admin());

CREATE POLICY org_super_admin_select ON public.organizations
  FOR SELECT TO authenticated
  USING (public.is_platform_super_admin() OR public.is_org_member(id));

CREATE POLICY org_super_admin_insert ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY org_super_admin_update ON public.organizations
  FOR UPDATE TO authenticated
  USING (public.is_platform_super_admin())
  WITH CHECK (public.is_platform_super_admin());

CREATE POLICY cities_super_admin ON public.cities
  FOR ALL TO authenticated
  USING (public.is_platform_super_admin() OR public.is_org_member(organization_id))
  WITH CHECK (public.is_platform_super_admin() OR public.is_org_admin(organization_id));

CREATE POLICY org_members_super_admin ON public.organization_members
  FOR ALL TO authenticated
  USING (public.is_platform_super_admin() OR public.is_org_member(organization_id))
  WITH CHECK (public.is_platform_super_admin() OR public.is_org_admin(organization_id));

CREATE POLICY profiles_super_admin_read ON public.profiles
  FOR SELECT TO authenticated
  USING (id = auth.uid() OR public.is_platform_super_admin());
