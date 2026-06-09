ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS availability text NOT NULL DEFAULT 'available',
  ADD COLUMN IF NOT EXISTS is_hidden boolean NOT NULL DEFAULT false;