-- Migration: Add recompute job queue and trigger to enqueue userRequestedWindow requests
-- Purpose: when rank_session_meta.extras.userRequestedWindow is added/changed,
-- create a job in rank_recompute_jobs and notify via pg_notify('rank_recompute', payload).

-- 1) Job table
create table if not exists public.rank_recompute_jobs (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  match_instance_id uuid,
  requested_window integer not null,
  requested_by uuid,
  status text not null default 'pending' check (status in ('pending','processing','done','failed')),
  attempts integer not null default 0,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_rank_recompute_jobs_status_created_at
  on public.rank_recompute_jobs (status, created_at);

-- 2) Trigger function: insert job when userRequestedWindow present/changed
create or replace function public.trigger_rank_session_meta_user_request_window()
returns trigger language plpgsql security definer as $$
declare
  new_extras jsonb;
  old_extras jsonb;
  req jsonb;
  requested_window integer;
  requested_by uuid;
  match_instance uuid;
  existing_count int;
begin
  new_extras := coalesce(NEW.extras, '{}'::jsonb);
  old_extras := coalesce(OLD.extras, '{}'::jsonb);

  -- only act when a userRequestedWindow exists and changed
  if (new_extras -> 'userRequestedWindow') is null then
    return NEW;
  end if;
  if (old_extras -> 'userRequestedWindow') is not null and (old_extras -> 'userRequestedWindow') = (new_extras -> 'userRequestedWindow') then
    return NEW;
  end if;

  req := new_extras -> 'userRequestedWindow';
  requested_window := nullif((req ->> 'requestedWindow'),'')::integer;
  requested_by := nullif(req ->> 'requestedBy','')::uuid;
  match_instance := NEW.session_id; -- use session_id as match session id

  -- avoid duplicate pending job for same session + window
  select count(1) into existing_count
  from public.rank_recompute_jobs j
  where j.session_id = NEW.session_id and j.requested_window = requested_window and j.status = 'pending';

  if existing_count = 0 then
    insert into public.rank_recompute_jobs(session_id, match_instance_id, requested_window, requested_by)
    values (NEW.session_id, match_instance, requested_window, requested_by);

    -- notify watchers (payload is simple JSON text)
    perform pg_notify('rank_recompute', json_build_object('session_id', NEW.session_id, 'requested_window', requested_window)::text);
  end if;

  return NEW;
end; $$;

-- 3) Trigger that fires after insert or update on rank_session_meta
drop trigger if exists trg_rank_session_meta_user_request on public.rank_session_meta;
create trigger trg_rank_session_meta_user_request
after insert or update on public.rank_session_meta
for each row
when (new.extras is not null)
execute procedure public.trigger_rank_session_meta_user_request_window();

-- 4) Grants: allow service role to insert/select/update jobs (service role uses SUPABASE service key)
grant insert, select, update on public.rank_recompute_jobs to service_role;
grant select on public.rank_recompute_jobs to authenticated;

-- NOTES:
-- - This migration is written to be safe to re-run (uses IF NOT EXISTS / CREATE OR REPLACE
--   / DROP TRIGGER IF EXISTS). It is idempotent for the common re-deploy case.
-- - Recommended deployment methods (prefer in order):
--     1) Use the repository's CI workflow `.github/workflows/apply-sql-migration.yml` which
--        runs `psql` against `SUPABASE_DB_URL` (set as a GitHub Actions secret) to apply SQL.
--     2) Use Supabase CLI for advanced workflows, authenticated with `SUPABASE_ACCESS_TOKEN` in CI
--        (see `.github/workflows/edge-functions-deploy.yml` and `scripts/deploy-edge-functions.js`).
--     3) Use the Supabase SQL editor for ad-hoc runs (avoid storing service role keys in workflows).
-- - The worker should LISTEN on channel 'rank_recompute' or poll the jobs table.
-- - This migration intentionally keeps logic in a job queue so business logic can run in a Node worker
--   (safer and easier to debug) rather than embedding heavy matching logic in PL/pgSQL.
