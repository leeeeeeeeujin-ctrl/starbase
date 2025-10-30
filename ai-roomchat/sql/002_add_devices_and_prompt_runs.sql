-- Migration: add devices table and device audit columns to prompt_runs

-- Create devices table (if not exists)
CREATE TABLE IF NOT EXISTS public.devices (
  id BIGSERIAL PRIMARY KEY,
  device_id TEXT,
  display_name TEXT,
  token TEXT UNIQUE,
  iat INTEGER,
  exp INTEGER,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add columns to prompt_runs for device auditing if they don't exist
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_runs' AND column_name = 'device_token'
  ) THEN
    ALTER TABLE public.prompt_runs ADD COLUMN device_token TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_runs' AND column_name = 'device_id'
  ) THEN
    ALTER TABLE public.prompt_runs ADD COLUMN device_id TEXT;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'prompt_runs' AND column_name = 'device_display_name'
  ) THEN
    ALTER TABLE public.prompt_runs ADD COLUMN device_display_name TEXT;
  END IF;
END$$;
