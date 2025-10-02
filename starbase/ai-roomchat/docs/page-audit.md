# AI Roomchat Page & Route Audit

This document captures a page-by-page walkthrough of the current Next.js `pages` tree, including key imports, local state, side-effects, and notable integration details to help future contributors ramp up quickly.

## Global Application Shell

### `pages/_app.js`
- Boots `ClientErrorReporter` before rendering each page so unhandled errors feed `/api/errors/report`, while keeping the global overlays active and applying `styles/globals.css`.【F:pages/_app.js†L1-L29】

### Shared behaviors
- Many pages depend on Supabase client helpers in `lib/supabase` or `lib/rank/*` for auth, storage, and leaderboard workflows.
- `window.localStorage` keys such as `selectedHeroId` and `selectedHeroOwnerId` are used to persist hero context across pages (`character/[id]`, `useGameRoom`).【F:pages/character/[id].js†L82-L108】【F:hooks/useGameRoom.js†L97-L134】

## Top-Level Landing & Auth

### `pages/index.js`
- Renders a full-screen landing page with themed background, title (“랭크 청사진에 맞춘 전선으로 바로 합류하세요”), and `AuthButton` to kick off Supabase auth flow while auto-redirecting authenticated users to `/roster`.【F:pages/index.js†L1-L118】
- Uses `Home.module.css` for glassmorphism styling, a core feature list, and blueprint overview widgets that now pull priority/리소스 메타 alongside 담당자·기한 정보를 JSON에서 읽어와 D-Day 배지, 우선순위/예상 리소스 칩, 정렬 토글(우선순위·기한·목록순)을 함께 노출합니다. `npm run refresh:blueprint-progress` regenerates the JSON payloads and 문서 경고 블록 from the overview doc so the UI stays aligned without manual edits, `npm run check:blueprint-progress-freshness` (also executed weekly via GitHub Actions) fails when the snapshot is older than the 14일 한계치, and `npm run check:blueprint-next-actions` fails CI when 마감이 지난 항목이 발견돼 문서/랜딩 모두에서 경고를 즉시 띄울 수 있습니다.【F:pages/index.js†L52-L246】【F:styles/Home.module.css†L1-L332】【F:data/rankBlueprintProgress.json†L1-L35】【F:data/rankBlueprintNextActions.json†L1-L60】【F:scripts/refresh-rank-blueprint-progress.js†L1-L362】【F:scripts/check-rank-blueprint-progress-freshness.js†L1-L74】【F:scripts/check-rank-blueprint-next-actions.js†L1-L87】【F:.github/workflows/blueprint-progress-freshness.yml†L1-L22】

### `pages/auth-callback.js`
- Client-side handler for Supabase OAuth redirects. Parses the current URL, forwards to `handleOAuthCallback`, and responds based on returned status (direct redirect vs. error with retry).【F:pages/auth-callback.js†L1-L35】
- Uses defensive guards (`mounted` flag) to avoid state updates on unmounted component and provides user-facing progress strings.

## Character Creation & Management

### `pages/create.js`
- Client component that mounts `CreateHeroScreen`; no local logic here.【F:pages/create.js†L1-L9】

### `pages/roster.js`
- Client component delegating to `RosterContainer` (manages hero list selection).【F:pages/roster.js†L1-L7】

### `pages/character/[id].js`
- Comprehensive hero dashboard page.
- Pulls hero ID from router params, synchronizes `useCharacterDashboard` hook, and handles loader and error states via inline `FullScreenState` component.【F:pages/character/[id].js†L1-L120】
- Persists chosen hero metadata in localStorage for other flows (e.g., joining games).【F:pages/character/[id].js†L82-L108】
- Manages `StartBattleOverlay` visibility and forwards participation context into overlay actions, including navigation to `/rank/[gameId]/start` when the battle begins.【F:pages/character/[id].js†L121-L180】
- Implements a resilience loop: if initial fetch stalls beyond two seconds, redirects to `/roster` and forces reload to recover from potential auth glitches.【F:pages/character/[id].js†L48-L81】

### Hook: `hooks/useCharacterDashboard.js`
- Composes profile, participation, and battle sub-hooks while exposing legacy-compatible fields (e.g., `onBackgroundUpload`, `battleSummary`).【F:hooks/useCharacterDashboard.js†L1-L76】
- Consolidates loading state and hero naming into `status` and `heroName` for the page container.

## Lobby Experience

### `pages/lobby.js`
- Hosts the lobby layout, maintaining active tab (`chat | games | alerts`) and orchestrating routing to hero-specific lobby via `heroId` query param.【F:pages/lobby.js†L1-L67】
- Integrates three domain hooks:
  - `useLobbyChat` resolves user display name (preferring selected hero), subscribes to Supabase realtime message inserts, and exposes list/compose bindings.【F:components/lobby/hooks/useLobbyChat.js†L1-L112】
  - `useGameBrowser` debounces search input, applies sort presets, and lazily fetches games plus participants/roles when a game is selected.【F:components/lobby/hooks/useGameBrowser.js†L1-L114】
  - `useLobbyAlerts` provides memoized placeholder alerts list.【F:components/lobby/hooks/useLobbyAlerts.js†L1-L18】
- `handleEnterGame` routes into `/rank/{gameId}` optionally including `role` query string for pre-selected slot.【F:pages/lobby.js†L24-L36】

## Maker Area

### `pages/maker/index.js`
- Client entry for content creators, wrapping `MakerHomeContainer`. No additional state on the page shell.【F:pages/maker/index.js†L1-L8】

## Play Hub Shortcut

### `pages/play/index.js`
- Thin alias that renders `RankHubScreen`, mirroring `/rank` landing experience.【F:pages/play/index.js†L1-L5】

## Private Placeholder

### `pages/private/index.js `
- Minimal stub page indicating future “private room/event” destination. Note the filename includes a trailing space; this may cause tooling friction on some platforms and should be normalized in the future.【F:pages/private/index.js ␠†L1-L6】

## Ranking Ecosystem

### `pages/rank/index.js`
- Rank hub listing page that fetches total game count via Supabase (exact count query) and renders `GameListPanel` plus persistent `SharedChatDock`. Provides quick link to `/rank/new` for game registration.【F:pages/rank/index.js†L1-L35】

### `pages/rank/new.js`
- Uses `next/dynamic` to import `RankNewClient` with `ssr: false`, ensuring heavy client-only editors are loaded on demand.【F:pages/rank/new.js†L1-L11】

### `pages/rank/[id].js`
- Game room orchestrator managing participant roster, hero selection modal, leaderboard drawer, and AI chat stub via `useAiHistory` and `useGameRoom` hook.【F:pages/rank/[id].js†L1-L70】【F:pages/rank/[id].js†L71-L115】
- Delegates rendering to `GameRoomView` while providing event handlers for join/start/delete flows. Mock chat responses append timestamped stub text until real AI integration is wired in.【F:pages/rank/[id].js†L71-L115】

### `pages/rank/RolesEditor.js`
- Local stateful form utility that syncs a roles array, emitting changes to parent via `onChange`. Provides add/update/remove controls with simple inline styling.【F:pages/rank/RolesEditor.js†L1-L30】

### Hook: `hooks/useGameRoom.js`
- Bootstraps auth, game metadata, slots, and participant roster; caches hero selection in localStorage; exposes actions for hero selection, joining, refreshing, and owner-only deletion.【F:hooks/useGameRoom.js†L1-L200】【F:hooks/useGameRoom.js†L200-L274】
- Calculates derived flags (`canStart`, `isOwner`, `alreadyJoined`) for the UI layer.【F:hooks/useGameRoom.js†L228-L266】

## API Routes Overview

### Messaging APIs (`pages/api/messages/*`)
- `list.js`: returns up to 500 chat messages ordered oldest-first, default limit 200.【F:pages/api/messages/list.js†L1-L28】
- `send.js`: validates required chat fields and inserts into `messages` table with optional avatar/hero metadata.【F:pages/api/messages/send.js†L1-L33】

### Rank APIs (`pages/api/rank/*`)
### Error Reporting APIs
- `/api/errors/report`: rate-limited endpoint that stores client-side error payloads in `rank_user_error_reports` using the service role, trimming stack/context payloads and normalising severity.【F:pages/api/errors/report.js†L1-L94】
- `/api/admin/errors`: cookie-gated admin feed that summarises recent reports (총/24시간/심각도별) and returns the latest entries for the 관리자 포털 모니터 패널.【F:pages/api/admin/errors.js†L1-L86】

- `list-games.js`: filters and sorts rank games using predefined order plans; supports query string search and result limits.【F:pages/api/rank/list-games.js†L1-L44】
- `game-detail.js`: fetches roles and participants for a game, enriching participants with hero details via admin client when possible.【F:pages/api/rank/game-detail.js†L1-L56】
- `join-game.js`: inserts a hero into `rank_participants`, defaulting score to 1000 when unspecified.【F:pages/api/rank/join-game.js†L1-L36】
- `play.js`: server-side battle simulator orchestrating hero slot validation, opponent selection, prompt compilation, OpenAI call, outcome judging, and persistence via `recordBattle`. Requires authenticated user and user-supplied API key.【F:pages/api/rank/play.js†L1-L66】
- `finalize-session.js`: owner-authorized endpoint to finalize battles—updates participant scores/status, records battle summary/log, and handles optimistic concurrency conflicts.【F:pages/api/rank/finalize-session.js†L1-L96】
- `register-game.js`: ensures caller auth, writes new game via service role, and seeds optional role rows with sanitized score delta bounds.【F:pages/api/rank/register-game.js†L1-L53】
- `run-turn.js`: minimal wrapper over `callChat` enabling manual turn execution with arbitrary API keys/system prompts.【F:pages/api/rank/run-turn.js†L1-L35】

## Additional Observations & Potential Follow-Ups
- 클라이언트 전역 오류 리포터(`ClientErrorReporter`)가 `/api/errors/report`로 전송한 스냅샷을 관리자 포털의 `UserErrorMonitor`가 `/api/admin/errors`를 통해 집계해 운영팀이 현장 오류를 즉시 파악할 수 있습니다.【F:components/ClientErrorReporter.js†L1-L119】【F:components/admin/UserErrorMonitor.js†L1-L94】
- Supabase table helpers (`withTable`) abstract table name prefix differences across environments—most hooks and API routes rely on them for multi-tenant support.
- Several UI shells (create, roster, maker) defer most logic to component containers; reviewing those components is recommended for full domain context beyond this page-oriented audit.
- Ensure environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, etc.) are set for server APIs like `finalize-session` to work outside local mocks.【F:pages/api/rank/finalize-session.js†L1-L8】

