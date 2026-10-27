CREATE OR REPLACE FUNCTION public.increment_counter(p_org_id uuid, p_name text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v integer;
BEGIN
  INSERT INTO public.counters (organization_id, name, value)
  VALUES (p_org_id, p_name, 1)
  ON CONFLICT (organization_id, name)
  DO UPDATE SET value = public.counters.value + 1
  RETURNING value INTO v;
  RETURN v;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_counter(uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_counter(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.increment_counter(uuid, text) TO authenticated;
