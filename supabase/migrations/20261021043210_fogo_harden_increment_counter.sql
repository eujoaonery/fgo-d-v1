REVOKE EXECUTE ON FUNCTION public.increment_counter(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.increment_counter(uuid, text) FROM anon;
REVOKE EXECUTE ON FUNCTION public.increment_counter(uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.increment_counter(uuid, text) TO service_role;
