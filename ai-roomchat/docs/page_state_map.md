# Page state map

This note consolidates where matchmaking and the main game store their state so we can trace which values travel between screens. It focuses on the vertical flow the team has been refining: roster → lobby → game room → mode specific queue → battle client.

## Shared storage & contexts

| Scope                                        | Owner                                                            | Keys / fields                                                                                                                                                   | Purpose                                                                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `sessionStorage` (via `startSessionChannel`) | game room start modal (`pages/rank/[id].js`)                     | `rank.start.mode`, `rank.start.casualOption`, `rank.start.apiVersion`, `rank.start.apiKey`, `rank.start.duoOption` (legacy placeholder cleared on write)        | Persist the last start preset the viewer used so returning to the room pre-fills the modal without the modal needing to poke the DOM API directly.           |
| `sessionStorage` (via `startSessionChannel`) | turn timer voting (`pages/rank/[id].js`, `MatchQueueClient`)     | `rank.start.turnTimer`, `rank.start.turnTimerVote`, `rank.start.turnTimerVotes`                                                                                 | Store the viewer's preferred time limit and the most recent vote map so timer decisions survive navigation.                                                  |
| `sessionStorage` (via `startSessionChannel`) | start client engine (`StartClient/useStartClientEngine.js`)      | reuses the same `rank.start.*` keys                                                                                                                             | Allows the running battle client to read the API version/key and resolved timer without re-asking the viewer.                                                |
| `sessionStorage` (via `startSessionChannel`) | manual console (`NonRealtimeConsole`, embedded in `StartClient`) | `rank.start.apiKey`, `rank.start.apiVersion`, `rank.start.geminiMode`, `rank.start.geminiModel`                                                                 | Shares the operator's provider credentials/settings with the queue modal and StartClient while deduplicating writes to avoid stomping the queue's listeners. |
| React context                                | `useGameRoom` hook                                               | `state` (`game`, `roles`, `participants`, `slots`, `recentBattles`, `sessionHistory`), `derived` (ownership, slot readiness), `actions` (join, refresh, delete) | Source of truth for the room header and all mode pages. Every queue client re-subscribes through this hook before enqueuing.                                 |
| React state (per page)                       | `MatchQueueClient`                                               | `queueState`, `autoJoin`, `turnTimerVote`, `blockers`, `retryTimer`                                                                                             | Controls automatic queue joins, confirmation countdowns, and surface level guidance when prerequisites are missing.                                          |
| React state (per page)                       | `StartClient` bundle                                             | `activeSessionId`, `consentState`, `audioProfile`, `promptVariables`                                                                                            | Drives the in-battle UI, consent gating, and background audio swaps.                                                                                         |

## Page-by-page notes

### Roster & character selection (`/rank`)

- Uses the global Supabase viewer session to list owned heroes.
- Selecting a hero commits the choice to Supabase; the value is later picked up by `useGameRoom` as `myHero`.

### Lobby search → room entry

- `handleEnterGame` in the lobby pushes to `/rank/[id]` with only the game id – no extra state is kept in memory.
- Upon mounting, the room page immediately calls `useGameRoom(id)` which:
  - fetches `rank_games`, `rank_participants`, `rank_game_slots`, and the viewer's history; and
  - derives `alreadyJoined`, `myEntry`, and `canStart` from those queries.

### Game room (`pages/rank/[id].js` + `GameRoomView`)

- Holds the modal state (`showStartModal`, `startPreset`, `turnTimerVote`).
- Syncs turn timer vote data to `sessionStorage` so the follow-up queue and battle screens reuse it.
- `joinGame(pickRole)` upserts the participant record and refreshes participants, slots, battles, and session history in one go.
- Clicking “게임 시작” simply toggles the modal; the actual routing happens after a mode is chosen.

### Mode selection modal (`GameStartModeModal`)

- Writes the latest preset to `sessionStorage` before navigation.
- Routes into:
  - `/rank/[id]/match`
  - `/rank/[id]/casual` or `/rank/[id]/casual-private`

### Mode pages

- Each mode page mounts `useGameRoom(id, { suppressRedirects: true })` to re-validate ownership and hero selection.
- On successful load they immediately render the appropriate queue client:
  - `MatchQueueClient` for the unified 랭크 방 큐(`/rank/[id]/match`)
  - `CasualMatchClient` → `MatchQueueClient`
- The queue client checks `autoJoin.blockers` (missing hero, role mismatch, session loading) before calling `/api/rank/match`.
- Confirmation, retry, and timeout timers live entirely inside `MatchQueueClient`; the page itself stays declarative.

### Battle start (`StartClient`)

- Reads the stored preset to pick the API target and the resolved turn timer.
- Calls `/api/rank/start-session` and keeps the returned `sessionId` in `activeSessionId` so `/api/rank/run-turn` and `/api/rank/log-turn` share the same context.
- Streams battle logs to `sessionHistory` via `useGameRoom` refresh actions, keeping the game room panel in sync for spectators.

### Manual console overlay (`NonRealtimeConsole`)

- Hydrates the same `rank.start.*` keys as the mode modal through `startSessionChannel`, so the operator's API key and provider selection flow from the match page into each embedded console turn.
- Relies on the channel's change detection to write back only after hydration and only when values change, preventing redundant `storage` events that would disrupt queue listeners.
- Tracks Gemini `mode`/`model` overrides alongside the shared API key/version so StartClient and the queue modal stay consistent about which provider settings are active.

### Histories & visibility

- `sessionHistory` coming from `useGameRoom` already respects the visibility rules (public vs hidden turns). `GameRoomView` renders notices for redacted entries.
- The in-game AI history uses the same `rank_turns` rows, filtered by ownership on the server so invisible lines never leave Supabase.

## Quick checklist when wiring a new page

1. Call `useGameRoom` first; bail early if the viewer or hero is missing.
2. Mirror any viewer choice that needs to persist (mode, timer, API version) into the `rank.start.*` `sessionStorage` keys through `startSessionChannel` so every consumer stays decoupled from the DOM API.
3. Let `MatchQueueClient` handle queue side effects—pass callbacks instead of reimplementing timers.
4. When leaving the queue, clear any outstanding retries by unmounting the client or calling its teardown helper.
5. Always refresh participants and slots after the server acknowledges a join so the room UI reflects the latest seat map.

## Open questions

- The duo partner selector still keeps its provisional choices in component state; decide whether that should also mirror to `sessionStorage` for parity with solo/casual flows.
- Queue pages currently rely on client-side routing. If we introduce deep links directly from notifications, consider preloading `useGameRoom` data on the server to avoid visible flicker.
