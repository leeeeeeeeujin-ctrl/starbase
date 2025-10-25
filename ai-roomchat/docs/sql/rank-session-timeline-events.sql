-- Supabase rank session timeline events bundle
-- Creates the rank_session_timeline_events table plus supporting indexes and
-- policies so drop-in timeline entries from `/api/rank/session-meta` and the
-- edge functions can persist safely.

do $$
begin
  if not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'rank_session_timeline_events'
  ) then
    create table public.rank_session_timeline_events (
      id uuid primary key default gen_random_uuid(),
      session_id uuid not null references public.rank_sessions(id) on delete cascade,
      game_id uuid references public.rank_games(id) on delete set null,
      event_id text not null,
      event_type text not null,
      owner_id text,
      reason text,
      strike integer,
      remaining integer,
      limit integer,
      status text,
      turn integer,
      event_timestamp timestamptz not null default now(),
      context jsonb,
      metadata jsonb,
      created_at timestamptz not null default now()
    );
  end if;
end;
$$;

create unique index if not exists rank_session_timeline_events_event_id_key
  on public.rank_session_timeline_events (event_id);

create index if not exists rank_session_timeline_events_session_idx
  on public.rank_session_timeline_events (session_id, event_timestamp desc);

alter table public.rank_session_timeline_events enable row level security;

create policy if not exists rank_session_timeline_events_select
  on public.rank_session_timeline_events for select using (true);

create policy if not exists rank_session_timeline_events_insert
  on public.rank_session_timeline_events for insert
  with check (auth.role() = 'service_role');
