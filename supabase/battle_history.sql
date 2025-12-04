-- Battle history table for settlement persistence.
create table if not exists battle_history (
  id bigint generated always as identity primary key,
  session_id text not null,
  game_id text not null,
  user_id text,
  battle_log jsonb not null,
  result jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists battle_history_session_idx on battle_history(session_id);
create index if not exists battle_history_game_idx on battle_history(game_id);
