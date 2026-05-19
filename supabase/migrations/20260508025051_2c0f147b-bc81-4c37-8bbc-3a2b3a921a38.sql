
REVOKE ALL ON FUNCTION public.force_delete_asset(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.force_delete_cafe(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.force_delete_asset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_cafe(uuid) TO authenticated;
