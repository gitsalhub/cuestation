ALTER TABLE public.rate_profiles
  ADD COLUMN IF NOT EXISTS cooling_minutes integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS cooling_amount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS grace_minutes integer NOT NULL DEFAULT 0;