# Rank Mode Metadata Backfill Plan

## Objective

Add authoritative matchmaking mode metadata to historical and future rank telemetry so leaderboard filters remain accurate across solo, duo, and casual views. This covers turn-level battle logs stored in `public.rank_battle_logs` and season leaderboard snapshots persisted in `public.rank_game_seasons`.

## Current Gaps

| Dataset             | Existing shape                                                                                                                                  | Missing element                                                                                     |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `rank_battle_logs`  | Columns: `game_id`, `battle_id`, `turn_no`, `prompt`, `ai_response`, `meta` JSON.                                                               | No dedicated column for the matchmaking mode that produced the battle. 【F:supabase.sql†L437-L445】 |
| `rank_battles`      | Tracks the enclosing engagement but likewise lacks a `mode` column, making backfills costly if we skip the parent. 【F:supabase.sql†L416-L427】 |
| `rank_game_seasons` | Stores archived standings inside the `leaderboard` JSON array, without per-mode context. 【F:supabase.sql†L325-L335】                           |

## Migration Steps

1. **Add mode columns**

   ```sql
   alter table public.rank_battles
     add column if not exists mode text;

   alter table public.rank_battle_logs
     add column if not exists mode text;

   alter table public.rank_game_seasons
     add column if not exists leaderboard_by_mode jsonb default '{}'::jsonb;
   ```

   _Optional:_ create partial index to keep query plans fast.

   ```sql
   create index if not exists rank_battle_logs_mode_idx
     on public.rank_battle_logs (game_id, mode, created_at);
   ```

2. **RLS & policy refresh** – extend existing policies to allow authenticated inserts/updates on the new columns. No policy text changes are necessary if we only append nullable columns, but re-running the policy block after migration keeps Supabase definitions tidy.

## Data Audit Checklist

Before mutating data, capture baseline metrics so we can validate the backfill.

```sql
-- Missing mode counts
select count(*) filter (where mode is null) as missing_mode,
       count(*) as total
from public.rank_battles;

select count(*) filter (where mode is null) as missing_mode,
       count(*) as total
from public.rank_battle_logs;

-- Snapshot structure audit
select id,
       jsonb_path_exists(leaderboard, '$[*] ? (@ ? (@.mode exists))') as leaderboard_has_mode,
       jsonb_array_length(leaderboard) as entry_count
from public.rank_game_seasons
order by updated_at desc
limit 50;
```

Log the results in the operations runbook so we can prove the backfill reduced the `missing_mode` counts to zero.

## Backfill Plan

1. **Battle metadata** – derive modes using the best available source, in priority order:
   - join `rank_battles` → `rank_sessions` (future state once sessions store mode),
   - fallback to `rank_match_queue` history via `match_code`,
   - fallback to `rank_rooms.mode` for historical engagements.

   ```sql
   update public.rank_battles b
   set mode = coalesce(s.mode, q.mode, r.mode)
   from public.rank_sessions s
     left join public.rank_match_queue q on q.match_code = s.match_code
     left join public.rank_rooms r on r.id = s.room_id
   where b.id = s.battle_id and b.mode is null;

   update public.rank_battle_logs bl
   set mode = b.mode
   from public.rank_battles b
   where bl.battle_id = b.id
     and bl.mode is null;
   ```

   For legacy data without session joins, export to a script (Node/TypeScript) that infers the mode from naming conventions or historical release notes.

2. **Season snapshots** – rebuild the leaderboard JSON so each entry carries its originating mode. Example migration script outline:

   ```ts
   const { data: seasons } = await supabase.from('rank_game_seasons').select('id, leaderboard');

   for (const season of seasons) {
     const enriched = (season.leaderboard || []).map(entry => ({
       ...entry,
       mode: entry.mode ?? inferMode(entry),
     }));

     const grouped = enriched.reduce(
       (acc, entry) => {
         const mode = entry.mode || 'solo';
         acc[mode] = acc[mode] || [];
         acc[mode].push(entry);
         return acc;
       },
       {} as Record<string, unknown[]>
     );

     await supabase
       .from('rank_game_seasons')
       .update({
         leaderboard: enriched,
         leaderboard_by_mode: grouped,
       })
       .eq('id', season.id);
   }
   ```

   The `inferMode` helper should consult historical snapshots, score brackets, or roster sizes to guess whether a record came from solo/duo/casual when the original entry lacked an explicit label.

3. **Verification** – rerun the audit queries and add automated tests (e.g., nightly Supabase scheduled function) that assert `mode is not null` for the affected tables.

## Rollout Timeline (tentative)

| Day   | Task                                                                                                            |
| ----- | --------------------------------------------------------------------------------------------------------------- |
| Day 0 | Apply migrations in staging, run audit queries, and export CSV of missing mode records.                         |
| Day 1 | Execute battle/season backfill scripts in staging, verify counts, and add regression checks.                    |
| Day 2 | Promote migrations to production, replay scripts using throttled batches (≤5k rows per minute) with monitoring. |
| Day 3 | Enable the nightly audit job and announce completion to the feature owners.                                     |

## Resource Requests

- **Service role key** for staging and production so the backfill script can bypass RLS while preserving policy compliance during inserts/updates.
- **Script execution slot** (Node.js or Deno runtime) with network access to Supabase—either via existing operations tooling or a temporary GitHub Action runner.
- **Historical data export** if we need to infer modes manually for records predating queue instrumentation.
- **QA support window** to validate leaderboard filters once the new columns land.

## Risks & Mitigations

- **Ambiguous legacy records** – document any entries we cannot classify. Leave their `mode` as `'unknown'` and exclude them from mode-specific leaderboards until cleaned.
- **Long-running updates** – break updates into batches (`limit 1000`) and wrap in transactions to avoid row locks on hot tables.
- **Client dependencies** – once the migrations are live, update the API layer to populate `mode` for all new battles and season snapshots so we never regress.
