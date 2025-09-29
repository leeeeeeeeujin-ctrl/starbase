# Rank Game Feature Overview

## High-level Intent
- Provide a lobby surface where players discover registered rank games with search, sorting, tagging, and detailed telemetry.
- Allow creators to register new rank games that define slots, roles, matchmaking rules, and connect to prompt sets for AI-driven battles.
- Operate individual game rooms where players join with their heroes, start matches, and review shared history and chat logs.
- Persist season progress, battles, and engagement metrics so the UI can highlight activity and support future matchmaking automation.

## Key React/Next.js Surfaces
### Lobby (`pages/lobby.js`)
- Hosts the "게임 검색" tab powered by `useGameBrowser`, passing query/sort state, rows, and detail data into `GameSearchPanel` for list/detail layout.【F:starbase/ai-roomchat/pages/lobby.js†L1-L82】
- Alternate "캐릭터 통계" tab uses `useLobbyStats` (not detailed here) and is toggled via `LOBBY_TABS` from `components/lobby/constants.js`.

### Game Search Panel (`components/lobby/GameSearchPanel/*`)
- `GameSearchPanel/index.js` composes `SearchControls`, `GameList`, and `GameDetail` into a two-column layout.【F:starbase/ai-roomchat/components/lobby/GameSearchPanel/index.js†L1-L54】
- `GameList` renders search results with thumbnails, likes/play counts, created date, and tag chips; it highlights the active selection and handles empty/loading states.【F:starbase/ai-roomchat/components/lobby/GameSearchPanel/GameList.js†L1-L43】
- `GameDetail` shows owner-only management controls, tag editing, season management, aggregate stats, participant roster, recent battle logs, and a CTA to enter the game with a chosen role.【F:starbase/ai-roomchat/components/lobby/GameSearchPanel/GameDetail.js†L1-L238】
- Styles are handled via inline objects defined in `styles.js` (not modified here).

### Game Browser Hook (`components/lobby/hooks/useGameBrowser.js`)
- Maintains query debounce, sort selection, selected row, metrics support toggle, and derived role slot occupancy state.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L46-L310】
- Loads games through `withTable` with fallbacks (`rank_games`, legacy `games`, etc.) and reorders depending on whether metrics columns exist.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L105-L210】
- Hydrates detail view by joining roles, participants, tags, seasons, battles, and battle logs from respective tables when the source table is `rank_games`; non-primary sources short-circuit detail fetches.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L212-L332】
- Exposes mutation helpers for tag CRUD, season start/finish, and deletion, each guarded when the backing table is not `rank_games`. It also computes aggregate stats for the detail sidebar.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L334-L478】

### Character Dashboard Integration (`components/character/CharacterDashboard/index.js`)
- Reuses `useGameBrowser` when the dashboard's swipe navigation enables the game search panel, keeping behavior consistent across lobby and character views.【F:starbase/ai-roomchat/components/character/CharacterDashboard/index.js†L1-L120】

### Rank Game Registration (`components/rank/RankNewClient.js`)
- Client-only page that orchestrates registration: collects metadata, roles, slot mapping, rules, and optional brawl settings, then uploads an image before inserting Supabase rows.【F:starbase/ai-roomchat/components/rank/RankNewClient.js†L1-L229】
- Calls `registerGame` helper which inserts into `rank_games` and, when provided, `rank_game_roles`; after success it upserts slot definitions into `rank_game_slots` and redirects to the created game room.【F:starbase/ai-roomchat/components/rank/RankNewClient.js†L1-L137】【F:starbase/ai-roomchat/components/rank/RankNewClient.js†L229-L283】
- Uses supporting editors: `RolesEditor` for role names and score ranges, `SlotMatrix` for 12-slot activation grid, `RulesChecklist` for boolean/limit toggles, and `PromptSetPicker` to select owned prompt sets.【F:starbase/ai-roomchat/components/rank/RolesEditor.js†L1-L142】【F:starbase/ai-roomchat/components/rank/SlotMatrix.js†L1-L94】【F:starbase/ai-roomchat/components/rank/RulesChecklist.js†L1-L77】【F:starbase/ai-roomchat/components/rank/PromptSetPicker.js†L1-L37】

### Game Room (`pages/rank/[id].js` and `hooks/useGameRoom.js`)
- Page-level component uses `useGameRoom` to bootstrap Supabase data, track participants, and navigate into battle flows. Provides hero picker, join/start buttons, leaderboard drawer, and shared chat dock.【F:starbase/ai-roomchat/pages/rank/[id].js†L1-L86】
- `useGameRoom` handles Supabase auth gating, fetches `rank_games`, `rank_game_slots`, and participants with hero details, and exposes actions to join or delete a room. It also persists hero selection to local storage.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L1-L217】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L217-L310】
- `GameRoomView` renders the live room UI including participant cards, history panel, and chat dock, while `ParticipantCard` shows hero previews and optional descriptions.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L1-L124】【F:starbase/ai-roomchat/components/rank/ParticipantCard.js†L1-L25】

### Rank Game List Panel (`components/rank/GameListPanel.js`)
- Provides an infinite-scrolling list of games (likely used elsewhere in rank UI) with local metrics fallback logic similar to the lobby hook.【F:starbase/ai-roomchat/components/rank/GameListPanel.js†L1-L140】

## API Layer (`pages/api/rank/*`)
- `list-games`: Reads `rank_games` with sort plans mirroring UI constants; retries without metric columns when unavailable.【F:starbase/ai-roomchat/pages/api/rank/list-games.js†L1-L78】
- `register-game`: Server-side insertion path using service-role Supabase client; primarily duplicates client registration but enforces bearer auth. Potential convergence target to share validation logic.【F:starbase/ai-roomchat/pages/api/rank/register-game.js†L1-L63】
- `game-detail`: Fetches roles and participants and enriches with hero snapshots (requires service role for hero lookup).【F:starbase/ai-roomchat/pages/api/rank/game-detail.js†L1-L56】
- `join-game`: Inserts a participant row with `ignoreDuplicates` to allow idempotent joins.【F:starbase/ai-roomchat/pages/api/rank/join-game.js†L1-L42】
- Remaining endpoints (`play`, `run-turn`, `finalize-session`) orchestrate actual battle loops; they rely on the `rank_sessions` and `rank_turns` tables defined in the schema (not deeply covered here).

## Supabase Schema Highlights (from `supabase.sql`)
| Table | Purpose | Key Columns |
| --- | --- | --- |
| `rank_games` | Primary registry of games | `id`, `owner_id`, `name`, `description`, `image_url`, `prompt_set_id`, `roles` (legacy JSON copy), `rules`, `rules_prefix`, `realtime_match`, `likes_count`, `play_count`, timestamps.【F:starbase/ai-roomchat/supabase.sql†L243-L262】 |
| `rank_game_roles` | Canonical role definitions per game | `game_id`, `name`, `slot_count`, `active`, `score_delta_min`, `score_delta_max`.【F:starbase/ai-roomchat/supabase.sql†L264-L291】 |
| `rank_game_tags` | User-editable tags surfaced in lobby | `game_id`, `tag`, uniqueness constraint, timestamps.【F:starbase/ai-roomchat/supabase.sql†L293-L317】 |
| `rank_game_seasons` | Season tracking and archived leaderboards | `game_id`, `name`, `status`, `started_at`, `ended_at`, `leaderboard` JSON.【F:starbase/ai-roomchat/supabase.sql†L319-L340】 |
| `rank_game_slots` | Slot layout for team compositions | `game_id`, `slot_index`, `role`, `active`, optional hero/owner links, timestamps.【F:starbase/ai-roomchat/supabase.sql†L342-L370】 |
| `rank_participants` | Enrolled heroes per game | `game_id`, `owner_id`, `hero_id`, `role`, `rating`, `score`, `battles`, `win_rate`, `hero_ids` array (unused placeholder).【F:starbase/ai-roomchat/supabase.sql†L372-L405】 |
| `rank_battles` & `rank_battle_logs` | Battle outcomes and per-turn transcripts used for lobby detail and history drawers.【F:starbase/ai-roomchat/supabase.sql†L407-L449】 |
| `rank_sessions` & `rank_turns` | Runtime match sessions and chronological turns consumed by `play`/`run-turn` APIs.【F:starbase/ai-roomchat/supabase.sql†L451-L488】 |

Row level security grants owners control over inserts/updates for their games and related entities, while reads are generally public.

## Derived State & Important Variables
- `supportsGameMetrics` (hook/local state) toggles when likes/play columns are missing, altering sort options and preventing column access errors.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L82-L144】【F:starbase/ai-roomchat/components/rank/GameListPanel.js†L17-L59】
- `gameSourceTable` tracks which physical table satisfied `withTable`, enabling guardrails against editing when the data came from read-only fallbacks.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L75-L210】
- `roleSlots` memo maps role names to capacity/occupancy to disable joining full roles.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L312-L333】
- `detailRevision` increments to refetch role/participant/tag data after mutations like tag edits or season changes.【F:starbase/ai-roomchat/components/lobby/hooks/useGameBrowser.js†L58-L200】
- Registration stores compiled rules via `buildRulesPrefix`, which concatenates textual guardrails consumed by downstream AI prompts.【F:starbase/ai-roomchat/components/rank/RankNewClient.js†L168-L212】【F:starbase/ai-roomchat/components/rank/RulesChecklist.js†L50-L75】

## Notable Gaps / Incomplete Portions
- Client and server registration paths duplicate logic; consolidating validation and error handling would prevent drift.
- `rank_games.roles` JSON column appears legacy—UI writes to dedicated `rank_game_roles` but does not keep JSON in sync.
- Battle orchestration (`play`, `run-turn`, `finalize-session`) assumes more backend automation than currently exposed in the UI; sessions/turns integration remains skeletal.
- Metrics (`likes_count`, `play_count`) rely on manual updates from other subsystems; without background jobs they remain zero.
- Season leaderboards are derived from current participant ratings at finish time; there is no automation to advance turns or compute win/loss streaks.
- Some fallbacks still reference legacy `games` table; long-term data migration or view alignment is needed to avoid partial feature sets.

## Quick Reference of User Flows
1. **Creator registers a game** via `/rank/new`, filling roles, slots, rules, prompt set, and optional image → inserts into `rank_games`, `rank_game_roles`, `rank_game_slots`.
2. **Lobby lists games** from `rank_games` (or fallback) with search/sort, retrieving tags, stats, seasons, and battle logs for the selected game.
3. **Players enter a game room** (`/rank/{id}`), pick roles, and join; participants recorded in `rank_participants`, with ability to start matches when required slots are filled.
4. **Season management** allows owners to start/finish seasons, storing leaderboard snapshots in `rank_game_seasons` and surfaced in lobby detail.
5. **Battle logs/history** sourced from `rank_battles` and `rank_battle_logs` feed both lobby detail and in-room history panels.

