ALTER TABLE public.platform_admins
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS is_original boolean NOT NULL DEFAULT false;

ALTER TABLE public.platform_admins
  DROP CONSTRAINT IF EXISTS platform_admins_status_check;

ALTER TABLE public.platform_admins
  ADD CONSTRAINT platform_admins_status_check CHECK (status IN ('active', 'inactive'));

UPDATE public.platform_admins
SET is_original = true
WHERE user_id = (
  SELECT user_id FROM public.platform_admins
  ORDER BY created_at ASC NULLS LAST, user_id ASC
  LIMIT 1
)
AND NOT EXISTS (SELECT 1 FROM public.platform_admins WHERE is_original);

CREATE OR REPLACE FUNCTION public.is_platform_super_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.platform_admins pa
    WHERE pa.user_id = auth.uid()
      AND coalesce(pa.status, 'active') = 'active'
  );
$$;
