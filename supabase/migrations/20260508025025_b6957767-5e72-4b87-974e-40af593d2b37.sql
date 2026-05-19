
-- ============== Force delete asset ==============
CREATE OR REPLACE FUNCTION public.force_delete_asset(_asset_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cafe uuid;
BEGIN
  SELECT cafe_id INTO _cafe FROM public.assets WHERE id = _asset_id;
  IF _cafe IS NULL THEN RETURN; END IF;
  IF NOT (public.is_super_admin(auth.uid())
          OR (public.has_role(auth.uid(), 'admin') AND _cafe = public.get_user_cafe(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized to delete this asset';
  END IF;

  DELETE FROM public.session_items WHERE session_id IN (SELECT id FROM public.sessions WHERE asset_id = _asset_id);
  DELETE FROM public.transfer_logs WHERE from_asset_id = _asset_id OR to_asset_id = _asset_id;
  UPDATE public.bills SET session_id = NULL WHERE session_id IN (SELECT id FROM public.sessions WHERE asset_id = _asset_id);
  DELETE FROM public.sessions WHERE asset_id = _asset_id;
  DELETE FROM public.bookings WHERE asset_id = _asset_id;
  DELETE FROM public.assets WHERE id = _asset_id;
END;
$$;

-- ============== Force delete cafe ==============
CREATE OR REPLACE FUNCTION public.force_delete_cafe(_cafe_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Only super admin can delete a cafe';
  END IF;

  DELETE FROM public.session_items WHERE session_id IN (SELECT id FROM public.sessions WHERE cafe_id = _cafe_id);
  DELETE FROM public.bill_items WHERE bill_id IN (SELECT id FROM public.bills WHERE cafe_id = _cafe_id);
  DELETE FROM public.transfer_logs WHERE cafe_id = _cafe_id;
  DELETE FROM public.activity_logs WHERE cafe_id = _cafe_id;
  DELETE FROM public.bills WHERE cafe_id = _cafe_id;
  DELETE FROM public.sessions WHERE cafe_id = _cafe_id;
  DELETE FROM public.bookings WHERE cafe_id = _cafe_id;
  DELETE FROM public.expenses WHERE cafe_id = _cafe_id;
  DELETE FROM public.assets WHERE cafe_id = _cafe_id;
  DELETE FROM public.offers WHERE cafe_id = _cafe_id;
  DELETE FROM public.products WHERE cafe_id = _cafe_id;
  DELETE FROM public.rate_profiles WHERE cafe_id = _cafe_id;

  DELETE FROM public.user_roles WHERE user_id IN (
    SELECT id FROM public.profiles WHERE cafe_id = _cafe_id
  ) AND role = 'staff';
  UPDATE public.profiles SET cafe_id = NULL WHERE cafe_id = _cafe_id;

  DELETE FROM public.cafes WHERE id = _cafe_id;
END;
$$;

-- ============== Tighten bookings RLS ==============
DROP POLICY IF EXISTS "manage bookings" ON public.bookings;
CREATE POLICY "bookings insert" ON public.bookings FOR INSERT
  WITH CHECK (
    is_super_admin(auth.uid()) OR
    (cafe_id = get_user_cafe(auth.uid()) AND (has_role(auth.uid(), 'admin') OR staff_permission(auth.uid(), 'sessions')))
  );
CREATE POLICY "bookings update" ON public.bookings FOR UPDATE
  USING (
    is_super_admin(auth.uid()) OR
    (cafe_id = get_user_cafe(auth.uid()) AND (has_role(auth.uid(), 'admin') OR staff_permission(auth.uid(), 'sessions')))
  );
CREATE POLICY "bookings delete" ON public.bookings FOR DELETE
  USING (
    is_super_admin(auth.uid()) OR
    (cafe_id = get_user_cafe(auth.uid()) AND (has_role(auth.uid(), 'admin') OR staff_permission(auth.uid(), 'sessions')))
  );

-- ============== activity_logs insert: must match user's cafe ==============
DROP POLICY IF EXISTS "insert activity" ON public.activity_logs;
CREATE POLICY "insert activity" ON public.activity_logs FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND (cafe_id IS NULL OR cafe_id = get_user_cafe(auth.uid()) OR is_super_admin(auth.uid()))
  );

-- ============== transfer_logs insert: must be admin or sessions-staff ==============
DROP POLICY IF EXISTS "create transfers" ON public.transfer_logs;
CREATE POLICY "create transfers" ON public.transfer_logs FOR INSERT
  WITH CHECK (
    cafe_id = get_user_cafe(auth.uid())
    AND (has_role(auth.uid(), 'admin') OR staff_permission(auth.uid(), 'sessions'))
  );

-- ============== user_roles: prevent admins from granting super_admin ==============
DROP POLICY IF EXISTS "admin manage staff roles" ON public.user_roles;
CREATE POLICY "admin manage staff roles" ON public.user_roles FOR ALL
  USING (is_super_admin(auth.uid()) OR has_role(auth.uid(), 'admin'))
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (has_role(auth.uid(), 'admin') AND role <> 'super_admin')
  );
