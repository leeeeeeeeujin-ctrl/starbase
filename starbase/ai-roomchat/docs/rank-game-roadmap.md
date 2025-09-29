# Rank Game Implementation Roadmap

## Objective
The lobby and registration flows are functional, but everything after joining a room still relies on scaffolding. This document outlines the remaining systems we need to implement—participation, matchmaking, battle execution, AI history, and scoring—along with the Supabase tables and React surfaces they must touch.

## Current Gaps
- **Room bootstrap falls back to placeholder role data and never enforces slot capacity.** `useGameRoom` loads `rank_games` and `rank_game_slots`, but it simply copies the legacy `roles` array (defaulting to `['공격', '수비']`) and counts active slots without checking per-role limits or occupancy.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L123-L144】 Joining only inserts into `rank_participants`, ignoring `rank_game_slots.hero_id` / `hero_owner_id`, so seats remain untracked.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L188-L223】
- **The room UI cannot represent slot status, role locks, or live rankings.** `GameRoomPage` and `GameRoomView` render a generic role dropdown and participant list without capacity indicators or per-role stats, and the start button just checks raw participant count.【F:starbase/ai-roomchat/pages/rank/[id].js†L21-L108】【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L1-L122】
- **AI history is local-only and duplicates unfinished Supabase wiring.** `useAiHistory` stores an in-memory log, while the bottom half of the file contains an abandoned Supabase-backed prototype that references missing state like `sessionId`/`memory` without exporting anything usable.【F:starbase/ai-roomchat/lib/aiHistory.js†L1-L90】
- **Server battle execution lacks the downstream data updates it assumes.** `/api/rank/play` already calls `recordBattle`, but the helper omits `game_id` when inserting `rank_battle_logs` and does not update participant ratings/slot ownership beyond a simple upsert stub.【F:starbase/ai-roomchat/pages/api/rank/play.js†L1-L60】【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L36】
- **Session/turn tables exist but are unused.** Supabase defines `rank_sessions` and `rank_turns` for structured histories, yet neither the room nor the APIs create or read them, leaving run-turn/finalization endpoints disconnected.【F:starbase/ai-roomchat/supabase.sql†L456-L484】

## Data & API Requirements
1. **Participation & Slot Control**
   - Extend `rank_game_slots` usage so each join claims the lowest free slot for the chosen role, stores `hero_id`/`hero_owner_id`, and releases it when a participant leaves. Schema already supports this via `hero_id` / `hero_owner_id` columns.【F:starbase/ai-roomchat/supabase.sql†L342-L364】
   - Mirror slot assignments in `rank_participants` by tracking `hero_ids`, `role`, and `rating`, enabling per-role leaderboards and eligibility checks.【F:starbase/ai-roomchat/supabase.sql†L382-L399】
   - Add API endpoints for joining/leaving that enforce role capacities and update both tables transactionally (service-role Supabase client required for multi-table updates).

2. **Game Start & Battle Lifecycle**
   - When required slots are filled, the owner should create a `rank_sessions` row (status `active`, pointer to the initiating user) and seed `rank_turns` with an initial system prompt or conversation stub.【F:starbase/ai-roomchat/supabase.sql†L456-L484】
   - `/api/rank/run-turn` should read the session, append new prompts/responses to `rank_turns`, and return accumulated history for the UI. `/api/rank/finalize-session` can promote session results into `rank_battles`/`rank_battle_logs`.
   - Update `recordBattle` so every turn log stores `game_id` and per-role outcome adjustments once the session completes.【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L36】

3. **Scoring & Leaderboards**
   - Define rating adjustments per role (e.g., offensive/defensive MMR buckets) and persist them to `rank_participants`. The current `rating`/`battles` columns provide the baseline.【F:starbase/ai-roomchat/supabase.sql†L382-L399】
   - On battle resolution, update participant rows for both attacker and defenders, increment win/loss counts, and emit a summary row in `rank_battles` / `rank_battle_logs` for lobby consumption.【F:starbase/ai-roomchat/pages/api/rank/play.js†L33-L60】【F:starbase/ai-roomchat/supabase.sql†L416-L445】
   - Surface per-role rankings in the room via a new query (or extend `LeaderboardDrawer`) that groups participants by `role` and orders by `rating`.

4. **AI History Synchronization**
   - Replace the current stub with a hook that lazily loads existing `rank_sessions`/`rank_turns`, exposes `beginSession`, `appendTurn`, `setVisibility`, and streams updates to the chat dock. Integrate with `SharedChatDock` so public/private lines display appropriately.【F:starbase/ai-roomchat/lib/aiHistory.js†L1-L90】【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L93-L120】
   - Ensure room and start page share the same hook instance (or context) to avoid diverging histories when players leave/return mid-session.

5. **Client UI Enhancements**
   - Augment `GameRoomView` to show slot occupancy per role (e.g., chips indicating `2/3` filled) and disable join/start buttons when capacity is hit or the user lacks a claimed slot.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L28-L88】
   - Provide a session timeline panel that reads `rank_turns` instead of concatenating strings, enabling pagination and rich formatting once AI prompts grow longer.【F:starbase/ai-roomchat/pages/rank/[id].js†L57-L93】
   - Add ownership and leave controls so players can free slots, triggering slot release logic on the server.

## Roadmap Phases
1. **Slot & Participant Enforcement**
   - Update `joinGame` to fetch role capacities, reject full roles, and call a new `/api/rank/join` endpoint that claims a slot and upserts participant metadata with the correct rating defaults.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L188-L223】
   - Implement `/api/rank/leave` to release slots, decrement participant counts, and ensure owners can kick inactive heroes.

2. **Session Lifecycle & History**
   - Implement a real `useAiHistory` hook returning `{ sessionId, beginSession, appendTurn, publicLog, fullLog }`, backed by Supabase RPC/queries. Wire `GameRoomPage` and `/rank/[id]/start` to call `beginSession` and poll for updates.【F:starbase/ai-roomchat/lib/aiHistory.js†L1-L90】
   - Refactor the chat dock to push through the hook instead of directly appending local arrays.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L93-L120】

3. **Battle Resolution & Scoring**
   - Expand `recordBattle` so it inserts `game_id` into `rank_battle_logs`, writes defender results, and updates `rank_participants` for all involved owners (attackers and defenders).【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L36】
   - Hook `/api/rank/finalize-session` (or extend `/api/rank/play`) to call into this logic once an AI turn indicates victory/defeat, then mark the session `completed` in `rank_sessions`.

4. **UI Feedback & Leaderboards**
   - Fetch aggregated ratings by role to feed the leaderboard drawer and on-page rankings, using `rank_participants` ordering logic similar to `fetchParticipantsWithHeroes`.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L8-L48】
   - Display session summaries (last outcome, score delta) in the room and propagate them to the lobby detail view.

5. **Future Enhancements**
   - Add matchmaking queues that auto-fill slots by scanning `rank_participants` waiting states.
   - Introduce audit logs or moderation tools on `rank_battle_logs` for replays.

Following this roadmap will close the scaffolding gap between “game registered” and “AI-driven matches with persistent history,” giving us a clear checklist for incremental PRs.
