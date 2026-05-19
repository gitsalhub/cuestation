
-- Restrict storage SELECT to authenticated only (logos still load via public URL through CDN)
DROP POLICY IF EXISTS "Public read cafe logos" ON storage.objects;
CREATE POLICY "Auth read cafe logos" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'cafe-logos');

-- Revoke EXECUTE on internal helpers from anon role
REVOKE EXECUTE ON FUNCTION public.force_reset_session(uuid, text) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.force_delete_asset(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.force_delete_cafe(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_role(uuid, app_role) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.get_user_cafe(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.staff_permission(uuid, text) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.force_reset_session(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_asset(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.force_delete_cafe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_super_admin(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_user_cafe(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.staff_permission(uuid, text) TO authenticated;
