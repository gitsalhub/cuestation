-- Fix cross-cafe visibility and privilege escalation on user_roles
DROP POLICY IF EXISTS "view roles" ON public.user_roles;
DROP POLICY IF EXISTS "admin manage staff roles" ON public.user_roles;

-- Admins may only see role rows for users in their own cafe; users see their own; super admins see all
CREATE POLICY "view roles"
ON public.user_roles
FOR SELECT
USING (
  auth.uid() = user_id
  OR is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND get_user_cafe(user_roles.user_id) = get_user_cafe(auth.uid())
  )
);

-- Admins may only manage staff (non-super_admin) rows for users in their own cafe; super admins manage all
CREATE POLICY "admin manage staff roles"
ON public.user_roles
FOR ALL
USING (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND get_user_cafe(user_roles.user_id) = get_user_cafe(auth.uid())
  )
)
WITH CHECK (
  is_super_admin(auth.uid())
  OR (
    has_role(auth.uid(), 'admin'::app_role)
    AND role <> 'super_admin'::app_role
    AND get_user_cafe(user_roles.user_id) = get_user_cafe(auth.uid())
  )
);