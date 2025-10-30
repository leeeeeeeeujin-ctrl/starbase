-- Migration: add device_events table for audit logs

CREATE TABLE IF NOT EXISTS public.device_events (
  id BIGSERIAL PRIMARY KEY,
  device_token TEXT,
  device_id TEXT,
  event_type TEXT,
  detail JSONB,
  actor TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
