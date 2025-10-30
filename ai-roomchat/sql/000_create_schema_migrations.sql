-- Create schema_migrations table to track applied migration files
-- This file is intentionally idempotent (CREATE TABLE IF NOT EXISTS)
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  id serial PRIMARY KEY,
  filename text NOT NULL UNIQUE,
  checksum text,
  applied_at timestamptz NOT NULL DEFAULT now()
);

-- Create an index to help lookups (optional but cheap)
CREATE INDEX IF NOT EXISTS idx_schema_migrations_filename ON public.schema_migrations(filename);
