
-- Bookings
CREATE TABLE IF NOT EXISTS public.bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id uuid NOT NULL,
  asset_id uuid,
  customer_name text NOT NULL,
  customer_phone text,
  booking_time timestamptz NOT NULL,
  duration_minutes integer DEFAULT 60,
  notes text,
  status text NOT NULL DEFAULT 'pending',
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.bookings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "view bookings" ON public.bookings FOR SELECT
  USING (is_super_admin(auth.uid()) OR cafe_id = get_user_cafe(auth.uid()));
CREATE POLICY "manage bookings" ON public.bookings FOR ALL
  USING (is_super_admin(auth.uid()) OR (cafe_id = get_user_cafe(auth.uid()) AND (has_role(auth.uid(),'admin') OR staff_permission(auth.uid(),'sessions'))))
  WITH CHECK (is_super_admin(auth.uid()) OR (cafe_id = get_user_cafe(auth.uid()) AND (has_role(auth.uid(),'admin') OR staff_permission(auth.uid(),'sessions'))));

-- Sessions: new fields
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS player_segments jsonb DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS transferred_in_amount numeric DEFAULT 0,
  ADD COLUMN IF NOT EXISTS override_reason text,
  ADD COLUMN IF NOT EXISTS applied_offer_id uuid;

-- Bills: override reason
ALTER TABLE public.bills ADD COLUMN IF NOT EXISTS override_reason text;

-- Offers: free-minutes / min-minutes for time-based offers
ALTER TABLE public.offers
  ADD COLUMN IF NOT EXISTS min_minutes integer,
  ADD COLUMN IF NOT EXISTS free_minutes integer;

-- Profiles: theme preference
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS theme text DEFAULT 'gaming';
