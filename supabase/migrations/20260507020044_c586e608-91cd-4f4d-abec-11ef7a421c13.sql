
-- Allow staff (with sessions permission) to update asset status
CREATE POLICY "staff update asset status" ON public.assets FOR UPDATE
  USING (cafe_id = get_user_cafe(auth.uid()) AND staff_permission(auth.uid(),'sessions'))
  WITH CHECK (cafe_id = get_user_cafe(auth.uid()) AND staff_permission(auth.uid(),'sessions'));

-- Realtime
ALTER TABLE public.assets REPLICA IDENTITY FULL;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
ALTER TABLE public.bookings REPLICA IDENTITY FULL;

DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.bookings;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
