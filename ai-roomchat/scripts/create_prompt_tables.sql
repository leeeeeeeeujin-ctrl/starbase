-- SQL migration to create prompts and prompt_runs tables for Supabase/Postgres

CREATE TABLE IF NOT EXISTS prompts (
  id TEXT PRIMARY KEY,
  name TEXT,
  body TEXT,
  format TEXT,
  metadata JSONB,
  version INTEGER DEFAULT 1,
  created_by TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

CREATE TABLE IF NOT EXISTS prompt_runs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid(),
  prompt_id TEXT REFERENCES prompts(id) ON DELETE SET NULL,
  prompt_version INTEGER,
  input JSONB,
  rendered_prompt TEXT,
  provider TEXT,
  provider_response JSONB,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Indexes for query performance
CREATE INDEX IF NOT EXISTS idx_prompt_runs_prompt_id ON prompt_runs(prompt_id);

-- Note: gen_random_uuid() requires the pgcrypto or pgcrypto-equivalent extension
-- Alternatively use uuid_generate_v4() if uuid-ossp is available.
