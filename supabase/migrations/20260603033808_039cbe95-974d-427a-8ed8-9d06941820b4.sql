ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS payment_collected_at timestamp with time zone,
  ADD COLUMN IF NOT EXISTS payment_collected_by uuid,
  ADD COLUMN IF NOT EXISTS session_notes text;