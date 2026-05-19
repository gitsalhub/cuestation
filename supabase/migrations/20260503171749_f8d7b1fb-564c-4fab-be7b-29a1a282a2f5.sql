
-- ============ ROLES & HELPERS ============
CREATE TYPE public.app_role AS ENUM ('super_admin', 'admin', 'staff');

CREATE TABLE public.cafes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  owner_id UUID,
  subscription_expires_at TIMESTAMPTZ,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT,
  email TEXT,
  cafe_id UUID REFERENCES public.cafes(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.user_roles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role app_role NOT NULL,
  permissions JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, role)
);

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION public.get_user_cafe(_user_id UUID)
RETURNS UUID LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT cafe_id FROM public.profiles WHERE id = _user_id
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = 'super_admin')
$$;

CREATE OR REPLACE FUNCTION public.staff_permission(_user_id UUID, _perm TEXT)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = _user_id
      AND role = 'staff'
      AND COALESCE((permissions ->> _perm)::boolean, false) = true
  )
$$;

-- Auto profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email), NEW.email)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============ DOMAIN TABLES ============
CREATE TABLE public.rate_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  pricing_type TEXT NOT NULL DEFAULT 'hourly', -- hourly | time_based | weekday_weekend
  hourly_rate NUMERIC(10,2) DEFAULT 0,
  weekend_rate NUMERIC(10,2),
  config JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.assets (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'console', -- pool | carrom | ps5 | pc | other
  status TEXT NOT NULL DEFAULT 'available', -- available | occupied | locked
  rate_profile_id UUID REFERENCES public.rate_profiles(id) ON DELETE SET NULL,
  position_x INT DEFAULT 0,
  position_y INT DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.products (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT DEFAULT 'snacks',
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.offers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  offer_type TEXT NOT NULL DEFAULT 'percentage', -- percentage | fixed | time_based
  value NUMERIC(10,2) NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT true,
  conditions JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  asset_id UUID NOT NULL REFERENCES public.assets(id) ON DELETE RESTRICT,
  started_by UUID REFERENCES auth.users(id),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  ended_at TIMESTAMPTZ,
  customer_name TEXT,
  status TEXT NOT NULL DEFAULT 'active', -- active | completed | transferred
  game_amount NUMERIC(10,2) DEFAULT 0,
  items_amount NUMERIC(10,2) DEFAULT 0,
  discount_amount NUMERIC(10,2) DEFAULT 0,
  total_amount NUMERIC(10,2) DEFAULT 0,
  override_amount NUMERIC(10,2),
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.session_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bills (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  session_id UUID REFERENCES public.sessions(id) ON DELETE SET NULL,
  bill_type TEXT NOT NULL DEFAULT 'counter', -- counter | session
  customer_name TEXT,
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  discount NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  override_amount NUMERIC(10,2),
  offer_id UUID REFERENCES public.offers(id) ON DELETE SET NULL,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.bill_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  bill_id UUID NOT NULL REFERENCES public.bills(id) ON DELETE CASCADE,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  product_name TEXT NOT NULL,
  qty INT NOT NULL DEFAULT 1,
  price NUMERIC(10,2) NOT NULL DEFAULT 0
);

CREATE TABLE public.expenses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  category TEXT NOT NULL DEFAULT 'general',
  amount NUMERIC(10,2) NOT NULL DEFAULT 0,
  note TEXT,
  expense_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.transfer_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID NOT NULL REFERENCES public.cafes(id) ON DELETE CASCADE,
  session_id UUID NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  from_asset_id UUID REFERENCES public.assets(id),
  to_asset_id UUID REFERENCES public.assets(id),
  transferred_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE public.activity_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cafe_id UUID REFERENCES public.cafes(id) ON DELETE CASCADE,
  user_id UUID REFERENCES auth.users(id),
  action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ============ RLS ============
ALTER TABLE public.cafes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rate_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.offers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.session_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bill_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transfer_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.activity_logs ENABLE ROW LEVEL SECURITY;

-- profiles
CREATE POLICY "users view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id OR public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid())));
CREATE POLICY "users update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "admin update cafe profiles" ON public.profiles FOR UPDATE USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid())));

-- user_roles
CREATE POLICY "view roles" ON public.user_roles FOR SELECT USING (auth.uid() = user_id OR public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'));
CREATE POLICY "admin manage staff roles" ON public.user_roles FOR ALL USING (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin')) WITH CHECK (public.is_super_admin(auth.uid()) OR public.has_role(auth.uid(),'admin'));

-- cafes
CREATE POLICY "super admin all cafes" ON public.cafes FOR ALL USING (public.is_super_admin(auth.uid())) WITH CHECK (public.is_super_admin(auth.uid()));
CREATE POLICY "users view own cafe" ON public.cafes FOR SELECT USING (id = public.get_user_cafe(auth.uid()));
CREATE POLICY "admin update own cafe" ON public.cafes FOR UPDATE USING (public.has_role(auth.uid(),'admin') AND id = public.get_user_cafe(auth.uid()));

-- generic cafe-scoped policy macro applied per table
-- rate_profiles, assets, products, offers : admin full, staff read
DO $$
DECLARE t TEXT;
BEGIN
  FOREACH t IN ARRAY ARRAY['rate_profiles','assets','products','offers'] LOOP
    EXECUTE format('CREATE POLICY "view %1$s in cafe" ON public.%1$s FOR SELECT USING (public.is_super_admin(auth.uid()) OR cafe_id = public.get_user_cafe(auth.uid()))', t);
    EXECUTE format('CREATE POLICY "admin manage %1$s" ON public.%1$s FOR ALL USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),''admin'') AND cafe_id = public.get_user_cafe(auth.uid()))) WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),''admin'') AND cafe_id = public.get_user_cafe(auth.uid())))', t);
  END LOOP;
END $$;

-- sessions: admin full; staff create/update if permission
CREATE POLICY "view sessions" ON public.sessions FOR SELECT USING (public.is_super_admin(auth.uid()) OR cafe_id = public.get_user_cafe(auth.uid()));
CREATE POLICY "admin all sessions" ON public.sessions FOR ALL USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid()))) WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid())));
CREATE POLICY "staff create sessions" ON public.sessions FOR INSERT WITH CHECK (cafe_id = public.get_user_cafe(auth.uid()) AND public.staff_permission(auth.uid(),'sessions'));
CREATE POLICY "staff update sessions" ON public.sessions FOR UPDATE USING (cafe_id = public.get_user_cafe(auth.uid()) AND public.staff_permission(auth.uid(),'sessions'));

CREATE POLICY "view session_items" ON public.session_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND (public.is_super_admin(auth.uid()) OR s.cafe_id = public.get_user_cafe(auth.uid()))));
CREATE POLICY "manage session_items" ON public.session_items FOR ALL USING (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.cafe_id = public.get_user_cafe(auth.uid()) AND (public.has_role(auth.uid(),'admin') OR public.staff_permission(auth.uid(),'sessions')))) WITH CHECK (EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = session_id AND s.cafe_id = public.get_user_cafe(auth.uid())));

-- bills: counter sale permission for staff
CREATE POLICY "view bills" ON public.bills FOR SELECT USING (public.is_super_admin(auth.uid()) OR cafe_id = public.get_user_cafe(auth.uid()));
CREATE POLICY "admin manage bills" ON public.bills FOR ALL USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid()))) WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid())));
CREATE POLICY "staff create bills" ON public.bills FOR INSERT WITH CHECK (cafe_id = public.get_user_cafe(auth.uid()) AND public.staff_permission(auth.uid(),'counter_sale'));
CREATE POLICY "staff update bills" ON public.bills FOR UPDATE USING (cafe_id = public.get_user_cafe(auth.uid()) AND public.staff_permission(auth.uid(),'counter_sale'));

CREATE POLICY "view bill_items" ON public.bill_items FOR SELECT USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND (public.is_super_admin(auth.uid()) OR b.cafe_id = public.get_user_cafe(auth.uid()))));
CREATE POLICY "manage bill_items" ON public.bill_items FOR ALL USING (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.cafe_id = public.get_user_cafe(auth.uid()))) WITH CHECK (EXISTS (SELECT 1 FROM public.bills b WHERE b.id = bill_id AND b.cafe_id = public.get_user_cafe(auth.uid())));

-- expenses: staff with permission
CREATE POLICY "view expenses" ON public.expenses FOR SELECT USING (public.is_super_admin(auth.uid()) OR cafe_id = public.get_user_cafe(auth.uid()));
CREATE POLICY "admin manage expenses" ON public.expenses FOR ALL USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid()))) WITH CHECK (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid())));
CREATE POLICY "staff create expenses" ON public.expenses FOR INSERT WITH CHECK (cafe_id = public.get_user_cafe(auth.uid()) AND public.staff_permission(auth.uid(),'expenses'));

-- transfer_logs
CREATE POLICY "view transfers" ON public.transfer_logs FOR SELECT USING (public.is_super_admin(auth.uid()) OR cafe_id = public.get_user_cafe(auth.uid()));
CREATE POLICY "create transfers" ON public.transfer_logs FOR INSERT WITH CHECK (cafe_id = public.get_user_cafe(auth.uid()));

-- activity_logs
CREATE POLICY "view activity" ON public.activity_logs FOR SELECT USING (public.is_super_admin(auth.uid()) OR (public.has_role(auth.uid(),'admin') AND cafe_id = public.get_user_cafe(auth.uid())) OR user_id = auth.uid());
CREATE POLICY "insert activity" ON public.activity_logs FOR INSERT WITH CHECK (user_id = auth.uid());

-- realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.assets;
ALTER PUBLICATION supabase_realtime ADD TABLE public.sessions;
ALTER TABLE public.assets REPLICA IDENTITY FULL;
ALTER TABLE public.sessions REPLICA IDENTITY FULL;
