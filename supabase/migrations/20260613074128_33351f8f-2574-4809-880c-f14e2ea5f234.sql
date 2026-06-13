CREATE TABLE public.cash_drawer_shifts (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  cafe_id uuid NOT NULL,
  user_id uuid NOT NULL,
  user_name text,
  user_role text,
  opened_at timestamptz NOT NULL DEFAULT now(),
  opening_cash numeric NOT NULL DEFAULT 0,
  opening_notes text,
  closed_at timestamptz,
  closing_cash numeric,
  closing_notes text,
  status text NOT NULL DEFAULT 'open',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.cash_drawer_shifts TO authenticated;
GRANT ALL ON public.cash_drawer_shifts TO service_role;

ALTER TABLE public.cash_drawer_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "View cafe shift records"
ON public.cash_drawer_shifts
FOR SELECT
TO authenticated
USING (
  public.is_super_admin(auth.uid())
  OR cafe_id = public.get_user_cafe(auth.uid())
);

CREATE POLICY "Create own shift record"
ON public.cash_drawer_shifts
FOR INSERT
TO authenticated
WITH CHECK (
  user_id = auth.uid()
  AND cafe_id = public.get_user_cafe(auth.uid())
);

CREATE POLICY "Update own or cafe shift record"
ON public.cash_drawer_shifts
FOR UPDATE
TO authenticated
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND cafe_id = public.get_user_cafe(auth.uid()))
)
WITH CHECK (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
  OR (public.has_role(auth.uid(), 'admin') AND cafe_id = public.get_user_cafe(auth.uid()))
);

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_cash_drawer_shifts_updated_at
BEFORE UPDATE ON public.cash_drawer_shifts
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();