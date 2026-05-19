
ALTER TABLE public.cafes ADD COLUMN IF NOT EXISTS tuya_server_url TEXT;
ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS tuya_device_id TEXT,
  ADD COLUMN IF NOT EXISTS tuya_device_name TEXT,
  ADD COLUMN IF NOT EXISTS tuya_server_url TEXT,
  ADD COLUMN IF NOT EXISTS tuya_state TEXT;
