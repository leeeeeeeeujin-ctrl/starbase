-- Migration 001: create prompt_runs base table

CREATE TABLE IF NOT EXISTS public.prompt_runs (
  id BIGSERIAL PRIMARY KEY,
  prompt_id TEXT,
  user_id TEXT,
  inputs JSONB,
  outputs JSONB,
  status TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);
