-- Floor map: size for assets
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS width INTEGER NOT NULL DEFAULT 140,
  ADD COLUMN IF NOT EXISTS height INTEGER NOT NULL DEFAULT 140;

-- Sessions: player count, planned duration, payment split
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS player_count INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS planned_minutes INTEGER,
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upi_amount NUMERIC DEFAULT 0;

-- Bills: payment split
ALTER TABLE public.bills
  ADD COLUMN IF NOT EXISTS payment_method TEXT,
  ADD COLUMN IF NOT EXISTS cash_amount NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS upi_amount NUMERIC DEFAULT 0;

-- Rate profiles: structured slabs [{minutes:int, players:int, price:numeric}]
ALTER TABLE public.rate_profiles
  ADD COLUMN IF NOT EXISTS slabs JSONB NOT NULL DEFAULT '[]'::jsonb;