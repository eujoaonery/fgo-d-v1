-- Tenta reduzir grants de spatial_ref_sys sem ALTER (owner = PostGIS).
DO $$
BEGIN
  BEGIN
    REVOKE ALL ON TABLE public.spatial_ref_sys FROM anon;
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE NOTICE 'spatial_ref_sys revoke anon: %', SQLERRM;
  END;
  BEGIN
    REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON TABLE public.spatial_ref_sys FROM authenticated;
  EXCEPTION WHEN insufficient_privilege OR OTHERS THEN
    RAISE NOTICE 'spatial_ref_sys revoke write: %', SQLERRM;
  END;
END $$;
