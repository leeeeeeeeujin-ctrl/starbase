# Matchmaking Schema Reference

This note captures every Supabase table that participates in queueing players, filling rooms, and persisting the resulting sessions. Use it when rebuilding the database after a reset or auditing migrations tied to the matchmaking flow.

## Catalog & Role Capacity

### `public.rank_games`
- Core game definition with owner linkage, hero prompt metadata, engagement counters, and the `realtime_match` mode (`off`, `standard`, or `pulse`) that decides whether a room must queue or can start instantly.【F:starbase/ai-roomchat/supabase.sql†L500-L524】
- RLS policies allow anyone to read games while only the owner can insert, update, or delete rows.【F:starbase/ai-roomchat/supabase.sql†L512-L524】

### `public.rank_game_roles`
- Declares each role name, slot quota, active flag, and score delta bounds the matcher references when distributing participants.【F:starbase/ai-roomchat/supabase.sql†L526-L551】
- Owner-scoped `for all` policy ensures only the game creator can adjust role caps while the roster UI may read them freely.【F:starbase/ai-roomchat/supabase.sql†L537-L551】

### `public.rank_game_slots`
- Provides the baseline slot grid (index, role, default hero owner) used to render the lobby and enforce minimum seating requirements.【F:starbase/ai-roomchat/supabase.sql†L605-L632】
- Unique `(game_id, slot_index)` constraint keeps slot ordering deterministic for the lobby renderer.【F:starbase/ai-roomchat/supabase.sql†L605-L616】

## Persistent Player State

### `public.rank_participants`
- Stores each player’s enrollment per game with hero selections, mirrored slot assignment via `slot_no`, cached hero arrays, role preference, rating/score counters, and readiness status fields.【F:starbase/ai-roomchat/supabase.sql†L898-L916】
- RLS lets everyone read the leaderboard while participants alone may insert/update/delete their own row to record progress, with a partial unique index ensuring one occupant per `(game_id, slot_no)` when the column is populated.【F:starbase/ai-roomchat/supabase.sql†L918-L938】【F:starbase/ai-roomchat/supabase.sql†L921-L923】

### `public.rank_battles` & `public.rank_battle_logs`
- Battle envelopes capture attacker/defender hero arrays, outcomes, score deltas, and timestamps; logs capture per-turn prompts and AI responses for review.【F:starbase/ai-roomchat/supabase.sql†L668-L698】
- Both tables permit universal reads, while authenticated clients can append new battle records to keep history in sync.【F:starbase/ai-roomchat/supabase.sql†L681-L687】【F:starbase/ai-roomchat/supabase.sql†L836-L840】

## Rooms & Live Occupancy

### `public.rank_rooms`
- Represents every open lobby room with game/owner FKs, join code, mode, realtime mode, status, slot/ready counters, host role caps, brawl rule snapshot, and host heartbeat timestamps.【F:starbase/ai-roomchat/supabase.sql†L700-L719】
- The optional `blind_mode` flag hides occupant hero names until the match-ready flow hands control to the main game client.【F:starbase/ai-roomchat/supabase.sql†L700-L719】
- RLS allows public reads, owner-only inserts, and updates by either the host or seated occupants to reflect joins/leaves.【F:starbase/ai-roomchat/supabase.sql†L749-L774】

### `public.rank_room_slots`
- Tracks per-room slot index, assigned role, occupant owner/hero IDs, readiness flag, join timestamp, and audit columns with uniqueness on `(room_id, slot_index)`.【F:starbase/ai-roomchat/supabase.sql†L715-L810】
- Policies gate inserts to the room owner and updates to either the occupant or owner, preventing unauthorized seat shuffles.【F:starbase/ai-roomchat/supabase.sql†L781-L810】

## Queue Management

### `public.rank_match_queue`
- Central queue table storing game/mode/role, owning user, optional hero pick, rating score, party key, status enum, timestamps, and the latest match code.【F:starbase/ai-roomchat/supabase.sql†L728-L833】
- Composite indexes power queue scans (`game_id, mode, role, status, joined_at`) and owner lookups (`game_id, mode, owner_id, status`).【F:starbase/ai-roomchat/supabase.sql†L743-L747】
- RLS exposes waiting entries to everyone, while insert/update/delete is restricted to the owning player to manage their queue state.【F:starbase/ai-roomchat/supabase.sql†L814-L833】

## Session Runtime

### `public.rank_sessions`
- Records active session envelope with game reference, optional owner (null for shared sessions), status, turn pointer, and audit timestamps.【F:starbase/ai-roomchat/supabase.sql†L842-L861】
- RLS lets the owner (or anyone for null-owner sessions) read/write, supporting co-op and spectator flows.【F:starbase/ai-roomchat/supabase.sql†L852-L861】

### `public.rank_turns`
- Stores ordered turn transcript rows with session FK, turn index, acting role, public flag, text body, and creation timestamp.【F:starbase/ai-roomchat/supabase.sql†L863-L879】
- Policies permit global reads and authenticated inserts so session participants can append their turns.【F:starbase/ai-roomchat/supabase.sql†L873-L879】

## Diagnostics & Logging

### `public.rank_matchmaking_logs`
- Persists each pipeline stage (drop-in scan, realtime queue, offline sample, etc.) with status, reason, score window, and match code so operators can audit why a match succeeded or stalled.【F:starbase/ai-roomchat/supabase.sql†L1014-L1039】
- Service-role-only insert/select policies protect the log stream while letting the admin portal and diagnostics API report summaries without exposing data to clients.【F:starbase/ai-roomchat/supabase.sql†L1031-L1039】

## Related Configuration

- Weekly trend RPCs and monitoring tables (`rank_audio_events`, etc.) are optional for matchmaking but support operational dashboards; consult the monitoring schema note if rebuilding analytics after restoring the queue tables.
- When restoring from scratch, run `supabase.sql` to recreate these definitions, then seed initial games, roles, and slots so the lobby has the minimum structure before players queue.

