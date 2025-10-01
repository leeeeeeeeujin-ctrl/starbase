# Rank Game Implementation Roadmap

## Objective
The lobby and registration flows are functional, but everything after joining a room still relies on scaffolding. This document outlines the remaining systems we need to implement—participation, matchmaking, battle execution, AI history, and scoring—along with the Supabase tables and React surfaces they must touch.

## Current Gaps
- **Slot lifecycle still lacks a proper leave/release flow.** `joinGame` now claims `rank_game_slots` rows and stamps `hero_owner_id`, but cleanup only happens when the same owner rejoins or the entire game is deleted, so slots linger if someone simply backs out.【F:starbase/ai-roomchat/pages/api/rank/join-game.js†L43-L153】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L521-L612】
- **Room UI still lacks cross-mode leaderboard summaries.** `GameRoomView` now surfaces per-role leaderboards alongside slot controls, yet seasonal or overall standings still live outside the room experience.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L894-L1007】
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

## Progress Update — 2025-10-07
- **Session history wiring**: `useGameRoom` now retrieves the viewer’s latest `rank_sessions` and `rank_turns`, exposing a refresh helper so the room can show personal logs without a full reload.【F:hooks/useGameRoom.js†L244-L323】
- **Game room UI**: The lobby displays a “내 세션 히스토리” panel summarizing recent public turns, hidden entries, and truncation counts to validate the new data flow.【F:components/rank/GameRoomView.js†L134-L210】
- **Next steps**: Extend the same Supabase-backed history to shared room chat, hook the session starter into `/api/rank/start-session`, and resume the battle/score synchronization work outlined in Phases 2–3.

## Progress Update — 2025-10-12
- **Auto-match verification**: Confirmed that the solo, duo, and casual matchmaking routes now mount `AutoMatchProgress` directly, so players enter the queue immediately without manual buttons while preserving hero/role readiness gates.【F:starbase/ai-roomchat/pages/rank/[id]/solo.js†L1-L42】【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L120】
- **Start flow status**: The game room keeps the start controls disabled until slots are filled and sessions initialize successfully, reducing duplicate launches across modes.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L1-L120】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L1-L200】
- **Overall progress**: Phase 2 remains partially complete and Phase 3 still requires scoring sync, so the cumulative rollout estimate holds at **63%** pending battle finalization and shared history UI polish.

## Progress Update — 2025-10-13
- **Authenticated run-turn**: `/api/rank/run-turn` now requires a Supabase bearer token and session ID, validates ownership, and appends prompt/response pairs to `rank_turns` while bumping the session timestamp.【F:starbase/ai-roomchat/pages/api/rank/run-turn.js†L1-L176】
- **Client logging trim**: `StartClient` reuses the viewer token for run-turn calls and skips the fallback `log-turn` API when the server already stored the entries, preventing duplicate rows.【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L780-L1059】
- **Progress update**: With session turns now recorded server-side, Phase 2 advances to roughly 0.95 completion and overall rollout climbs to about **69%** ((2×1.0 + 0.95 + 0.8 + 0.4) / 6). Remaining focus areas are score/status sync and the shared history surface.

## Progress Update — 2025-10-15
- **Queue cleanup**: `AutoMatchProgress` now cancels the viewer’s queue entry as soon as the confirmation succeeds, preventing matched players from lingering in `rank_match_queue` when they transition into the battle scene.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L620】
- **Confirmation guard**: The overlay keeps the confirmation banner visible after success even if local queue state resets, so players no longer see the UI snap back to “대기” while navigation is in flight.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L520-L620】
- **Progress update**: Queue hygiene work nudges Phase 2 toward completion (≈0.97) and the overall rollout estimate to about **70%**, with the remaining effort focused on duo/casual start triggers and shared history displays.

## Progress Update — 2025-10-18
- **Auto-join reset guard**: When the queue state falls back to `idle`, `AutoMatchProgress` now clears any stored join signature and pending retry timer so hero/role changes immediately trigger a fresh automatic enqueue without manual input.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L118-L207】
- **Retry hygiene**: The component also clears retry handles during teardown to avoid ghost enqueue attempts after navigating away, reducing the risk of stale `rank_match_queue` rows.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L432-L520】
- **Progress update**: Automatic requeue reliability improves Phase 2’s readiness to roughly **0.98**, keeping the overall rollout estimate near **70%** while the remaining backlog centers on duo/casual triggers and shared history UI.

## Progress Update — 2025-10-19
- **Confirmation timer carry-over**: `AutoMatchProgress` now preserves the room’s turn-timer vote, surfaces it in the confirmation overlay, and forwards it to `/api/rank/start-session` so every match starts with the agreed countdown.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L89-L118】【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L270-L318】
- **Session summary enrichment**: The start-session API appends the selected turn timer to the system turn log and echoes it back to the client, giving the room immediate feedback on the enforced limit.【F:starbase/ai-roomchat/pages/api/rank/start-session.js†L1-L120】
- **Progress update**: Phase 2 is effectively complete (≈1.0) and Phase 4’s UI signals inch forward, nudging the overall rollout estimate to about **71%** while upcoming work focuses on shared history views and score synchronization.

## Progress Update — 2025-10-20
- **Role occupancy telemetry**: `useGameRoom` now aggregates active slot totals, occupied seats, and remaining capacity per role so the lobby can reflect real slot pressure instead of raw participant counts.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L724-L804】
- **Lobby visibility**: `GameRoomView` surfaces the per-role occupancy meter above the join controls and highlights remaining slots inside each role chip, making it clear when seats are scarce or full.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L882-L978】【F:starbase/ai-roomchat/components/rank/GameRoomView.module.css†L241-L379】
- **Progress update**: Slot-awareness closes one of the initial Phase 1 UI gaps, nudging the overall rollout estimate to roughly **72%** while the next focus shifts to multi-role scoring and shared history playback.

## Progress Update — 2025-10-21
- **Mode parity for slot metrics**: The duo room client and casual private lobby now reuse `RoleOccupancySummary` so teams can review remaining seats before organizing parties.【F:starbase/ai-roomchat/components/rank/DuoRoomClient.js†L76-L118】【F:starbase/ai-roomchat/components/rank/CasualPrivateClient.js†L1-L60】
- **Shared data plumbing**: The duo and casual-private routes forward `useGameRoom`'s `roleOccupancy` output into the respective clients, ensuring the same metrics appear outside the main room.【F:starbase/ai-roomchat/pages/rank/[id]/duo/index.js†L29-L77】【F:starbase/ai-roomchat/pages/rank/[id]/casual-private.js†L29-L77】
- **Progress update**: Phase 1’s visibility work now spans the mode selection and private lobby flows, nudging the rollout estimate toward **73%** while remaining tasks focus on slot release APIs and leaderboard wiring.

## Progress Update — 2025-10-22
- **Slot release API**: Added `/api/rank/leave-game` so players can relinquish their claimed slot, which clears `rank_game_slots` ownership and marks the corresponding participant row as `out` without touching their rating history.【F:starbase/ai-roomchat/pages/api/rank/leave-game.js†L1-L92】
- **Room controls**: The game room now surfaces a dedicated “슬롯 비우기” button whenever you’ve already joined, calling the new leave action and refreshing slot/participant state immediately.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L930-L1004】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L608-L676】
- **Progress update**: Phase 1’s slot lifecycle work is nearly complete, raising the overall rollout estimate to roughly **74%** while upcoming efforts center on slot release automation and leaderboard surfacing.

## Progress Update — 2025-10-23
- **Automatic slot sweeper**: Introduced the reusable `releaseStaleSlots` helper and `/api/rank/slot-sweeper` worker so service-role tasks or cron jobs can free slots automatically when participants time out, are kicked, or leave stale queue entries behind.【F:starbase/ai-roomchat/lib/rank/slotCleanup.js†L1-L245】【F:starbase/ai-roomchat/pages/api/rank/slot-sweeper.js†L1-L66】
- **Status normalization**: The sweeper also normalizes lingering participant rows by marking stale claimants as `timeout`/`out`, ensuring hosts no longer have to rely on manual cleanup for timeouts and forced removals.【F:starbase/ai-roomchat/lib/rank/slotCleanup.js†L165-L223】
- **Progress update**: With automated cleanup in place the slot lifecycle is effectively closed, nudging the overall rollout estimate toward **75%** while the remaining backlog shifts to leaderboard surfacing and shared history polish.

## Progress Update — 2025-10-24
- **Per-role standings surfaced**: `useGameRoom` now groups participants by role, sorts them by rating/score, and exposes the top entries so downstream panels can render real leaderboards without additional Supabase calls.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L830-L907】
- **Lobby UI update**: `GameRoomView` renders a new 역할별 리더보드 카드 with avatars, rankings, and stat lines for each role, styled for the mobile-first layout.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L915-L1007】【F:starbase/ai-roomchat/components/rank/GameRoomView.module.css†L264-L348】
- **Progress update**: Bringing per-role rankings into the main room closes a major Phase 4 UI item, raising the overall rollout estimate to about **77%** while shared history playback and scoring sync stay on deck.

## Progress Update — 2025-10-26
- **Integrated leaderboard drawer**: The room drawer now combines season snapshots, recent match performance, and lifetime standings with mode filters so players can compare 솔로·듀오·캐주얼 trends without leaving the lobby.【F:starbase/ai-roomchat/components/rank/LeaderboardDrawer.js†L1-L409】【F:starbase/ai-roomchat/components/rank/LeaderboardDrawer.module.css†L1-L214】
- **Follow-up focus**: Populate per-mode slices with authoritative stats (queue mode tagging for battles, season snapshots per mode) and expose drawer metrics in the roadmap dashboards to keep automation milestones visible.
  - **Backend requirement**: Tag every battle log and season snapshot with the originating matchmaking mode (solo/duo/casual) so the drawer’s filters stay accurate; coordinate Supabase migrations or backfills to stamp legacy rows with mode metadata.
