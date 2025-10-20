# Rank Session Battle Log Spec

## Table: `public.rank_session_battle_logs`

| Column | Type | Description |
| --- | --- | --- |
| `id` | `uuid` | Primary key. |
| `session_id` | `uuid` | References `public.rank_sessions.id`; cascades on delete. |
| `game_id` | `uuid` | References `public.rank_games.id`; nullable for legacy rows. |
| `owner_id` | `uuid` | References `auth.users.id`; tracks who completed the session. |
| `result` | `text` | Outcome label (`win`, `lose`, `draw`, `terminated`, etc.). |
| `reason` | `text` | Optional human-readable detail for the outcome. |
| `payload` | `jsonb` | Serialized `battleLogDraft` payload (participants, turns, history, timeline). |
| `created_at` | `timestamptz` | Creation timestamp (defaults to `now()`). |
| `updated_at` | `timestamptz` | Last modification timestamp (defaults to `now()`). |

### Indexes
- `rank_session_battle_logs_session_key` enforces one row per session.
- `rank_session_battle_logs_game_idx` speeds up recent-log queries per game.
- `rank_session_battle_logs_owner_idx` supports owner-centric dashboards.

### RLS Policies
- `select`: open to all authenticated clients (`using (true)`).
- `insert`, `update`: restricted to the `service_role` (used by server-side APIs/Edge Functions).

