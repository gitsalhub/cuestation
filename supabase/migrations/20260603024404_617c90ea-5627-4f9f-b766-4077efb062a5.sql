ALTER TABLE public.assets
  ADD COLUMN IF NOT EXISTS tuya_enabled boolean NOT NULL DEFAULT false;

-- Backward compatibility: any asset that already has a smart switch linked
-- (a Tuya device id present) is considered to have the smart switch enabled.
UPDATE public.assets
  SET tuya_enabled = true
  WHERE tuya_device_id IS NOT NULL AND length(trim(tuya_device_id)) > 0;