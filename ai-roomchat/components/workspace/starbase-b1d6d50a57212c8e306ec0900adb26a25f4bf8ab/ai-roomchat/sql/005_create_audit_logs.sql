-- Migration: create audit_logs table
-- Run in your DB (or include in CI migration job)

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now() NOT NULL,
  actor_id TEXT,
  device_id TEXT,
  prompt_id TEXT,
  action TEXT,
  input JSONB,
  output JSONB,
  meta JSONB
);

CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_device_id_idx ON audit_logs (device_id);
