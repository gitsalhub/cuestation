ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS alert_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS alert_minutes integer NOT NULL DEFAULT 0;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS transfer_history jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS rate_profile_id uuid;