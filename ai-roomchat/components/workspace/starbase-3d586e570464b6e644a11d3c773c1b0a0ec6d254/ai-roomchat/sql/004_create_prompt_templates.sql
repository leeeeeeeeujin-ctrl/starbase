-- 004_create_prompt_templates.sql
-- Creates table for prompt templates
CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  body TEXT NOT NULL,
  meta JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Optional index on created_at for listing
CREATE INDEX IF NOT EXISTS idx_prompt_templates_created_at ON prompt_templates (created_at DESC);
