ALTER TABLE public.sessions ADD COLUMN IF NOT EXISTS parent_session_id uuid;
CREATE INDEX IF NOT EXISTS idx_sessions_parent ON public.sessions(parent_session_id);