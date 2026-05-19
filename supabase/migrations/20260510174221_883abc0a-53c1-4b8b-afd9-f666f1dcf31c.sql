
-- 1. Stock threshold
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS stock_threshold integer NOT NULL DEFAULT 5;

-- 2. Cafe logo
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS logo_url text;

-- 3. Session advances
CREATE TABLE IF NOT EXISTS public.session_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  session_id uuid NOT NULL,
  amount numeric NOT NULL DEFAULT 0,
  payment_method text NOT NULL DEFAULT 'cash',
  cash_amount numeric NOT NULL DEFAULT 0,
  upi_amount numeric NOT NULL DEFAULT 0,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.session_advances ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view advances" ON public.session_advances
  FOR SELECT USING (
    public.is_super_admin(auth.uid()) OR cafe_id = public.get_user_cafe(auth.uid())
  );
CREATE POLICY "create advances" ON public.session_advances
  FOR INSERT WITH CHECK (
    cafe_id = public.get_user_cafe(auth.uid())
    AND (public.has_role(auth.uid(), 'admin') OR public.staff_permission(auth.uid(), 'sessions'))
  );
CREATE POLICY "admin manage advances" ON public.session_advances
  FOR ALL USING (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin') AND cafe_id = public.get_user_cafe(auth.uid()))
  ) WITH CHECK (
    public.is_super_admin(auth.uid())
    OR (public.has_role(auth.uid(), 'admin') AND cafe_id = public.get_user_cafe(auth.uid()))
  );

CREATE INDEX IF NOT EXISTS idx_session_advances_session ON public.session_advances(session_id);

-- 4. Close any pre-existing duplicate active sessions (keep oldest), then enforce unique constraint
WITH ranked AS (
  SELECT id, asset_id, started_at,
         ROW_NUMBER() OVER (PARTITION BY asset_id ORDER BY started_at ASC) AS rn
  FROM public.sessions WHERE status = 'active'
)
UPDATE public.sessions s
SET status = 'completed', ended_at = now()
FROM ranked r
WHERE s.id = r.id AND r.rn > 1;

CREATE UNIQUE INDEX IF NOT EXISTS one_active_session_per_asset
  ON public.sessions(asset_id) WHERE status = 'active';

-- 5. Force reset session function (admin / super_admin)
CREATE OR REPLACE FUNCTION public.force_reset_session(_session_id uuid, _reason text DEFAULT NULL)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _cafe uuid;
  _asset uuid;
BEGIN
  SELECT cafe_id, asset_id INTO _cafe, _asset FROM public.sessions WHERE id = _session_id;
  IF _cafe IS NULL THEN RAISE EXCEPTION 'Session not found'; END IF;
  IF NOT (public.is_super_admin(auth.uid())
          OR (public.has_role(auth.uid(), 'admin') AND _cafe = public.get_user_cafe(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized to reset this session';
  END IF;

  UPDATE public.sessions
  SET status = 'reset', ended_at = COALESCE(ended_at, now()),
      override_reason = COALESCE(override_reason, _reason)
  WHERE id = _session_id;

  UPDATE public.assets SET status = 'available' WHERE id = _asset;

  INSERT INTO public.activity_logs (cafe_id, user_id, action, details)
  VALUES (_cafe, auth.uid(), 'force_reset_session',
          jsonb_build_object('session_id', _session_id, 'asset_id', _asset, 'reason', _reason));
END;
$$;

-- 6. Storage bucket for cafe logos
INSERT INTO storage.buckets (id, name, public)
VALUES ('cafe-logos', 'cafe-logos', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "Public read cafe logos" ON storage.objects
  FOR SELECT USING (bucket_id = 'cafe-logos');
CREATE POLICY "Super admin upload cafe logos" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'cafe-logos' AND public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin update cafe logos" ON storage.objects
  FOR UPDATE USING (bucket_id = 'cafe-logos' AND public.is_super_admin(auth.uid()));
CREATE POLICY "Super admin delete cafe logos" ON storage.objects
  FOR DELETE USING (bucket_id = 'cafe-logos' AND public.is_super_admin(auth.uid()));

-- 7. Create super admin account
DO $$
DECLARE
  _uid uuid;
BEGIN
  SELECT id INTO _uid FROM auth.users WHERE email = 'salmanmohammedmd@gmail.com';
  IF _uid IS NULL THEN
    _uid := gen_random_uuid();
    INSERT INTO auth.users (
      instance_id, id, aud, role, email, encrypted_password,
      email_confirmed_at, raw_app_meta_data, raw_user_meta_data,
      created_at, updated_at, confirmation_token, recovery_token, email_change, email_change_token_new
    ) VALUES (
      '00000000-0000-0000-0000-000000000000', _uid, 'authenticated', 'authenticated',
      'salmanmohammedmd@gmail.com', crypt('Cuestation@123', gen_salt('bf')),
      now(), '{"provider":"email","providers":["email"]}'::jsonb, '{"full_name":"Super Admin"}'::jsonb,
      now(), now(), '', '', '', ''
    );
    INSERT INTO auth.identities (id, user_id, identity_data, provider, provider_id, last_sign_in_at, created_at, updated_at)
    VALUES (gen_random_uuid(), _uid,
            jsonb_build_object('sub', _uid::text, 'email', 'salmanmohammedmd@gmail.com', 'email_verified', true),
            'email', _uid::text, now(), now(), now());
    INSERT INTO public.profiles (id, full_name, email)
    VALUES (_uid, 'Super Admin', 'salmanmohammedmd@gmail.com')
    ON CONFLICT (id) DO NOTHING;
  END IF;
  INSERT INTO public.user_roles (user_id, role)
  VALUES (_uid, 'super_admin')
  ON CONFLICT DO NOTHING;
END $$;
