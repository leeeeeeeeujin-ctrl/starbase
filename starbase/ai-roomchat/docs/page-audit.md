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
- Uses `Home.module.css` for glassmorphism styling, a core feature list, and blueprint overview widgets that now pull priority/리소스 메타 alongside 담당자·기한 정보를 JSON에서 읽어와 D-Day 배지, 우선순위/예상 리소스 칩, 정렬 토글(우선순위·기한·목록순)을 함께 노출합니다. `npm run refresh:blueprint-progress` regenerates the JSON payloads and 문서 경고 블록 from the overview doc so the UI stays aligned without manual edits, `npm run check:blueprint-progress-freshness` (executed weekly via GitHub Actions와 PR/메인 푸시 CI) fails when the snapshot is older than the 14일 한계치, `npm run check:blueprint-next-actions` fails CI when 마감이 지난 항목이 발견돼 문서/랜딩 모두에서 경고를 즉시 띄울 수 있고, 두 워크플로 모두가 `npm test -- --runInBand`와 `CI=1 npm run build`까지 실행하면서 Next.js 빌드 캐시(`.next/cache`)를 복원/보존하고 `jest-junit` 보고서를 업로드·Step Summary로 노출해 테스트 실행 시간을 추적할 수 있도록 했습니다.【F:pages/index.js†L52-L246】【F:styles/Home.module.css†L1-L332】【F:data/rankBlueprintProgress.json†L1-L35】【F:data/rankBlueprintNextActions.json†L1-L60】【F:scripts/refresh-rank-blueprint-progress.js†L1-L362】【F:scripts/check-rank-blueprint-progress-freshness.js†L1-L74】【F:scripts/check-rank-blueprint-next-actions.js†L1-L87】【F:.github/workflows/blueprint-progress-freshness.yml†L1-L47】【F:.github/workflows/pr-ci.yml†L1-L42】

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
- Rank hub listing page that fetches total game count via Supabase (exact count query) and renders `GameListPanel`. A top-right button jumps to the dedicated `/chat` experience instead of embedding the dock inline.【F:pages/rank/index.js†L1-L37】

### `pages/rank/new.js`
- Uses `next/dynamic` to import `RankNewClient` with `ssr: false`, ensuring heavy client-only editors are loaded on demand.【F:pages/rank/new.js†L1-L11】

### `pages/rank/[id].js`
- Game room orchestrator managing participant roster, hero selection modal, leaderboard drawer, and AI chat stub via `useAiHistory` and `useGameRoom` hook.【F:pages/rank/[id].js†L1-L70】【F:pages/rank/[id].js†L71-L115】
- Delegates rendering to `GameRoomView` while providing event handlers for join/start/delete flows. Mock chat responses append timestamped stub text until real AI integration is wired in.【F:pages/rank/[id].js†L71-L115】
- The hero panel now boots the shared hero audio manager, loading viewer/host/participant BGM automatically, exposing play/pause, mute, and volume controls, rendering a progress meter, and surfacing 재생목록 칩·효과 토글·프리셋 배지 so QA/운영이 상황별 사운드를 즉시 조정하거나 기본값으로 복원할 수 있습니다. 선택한 트랙·프리셋·이펙트는 `rank_audio_preferences`/`rank_audio_events`에 저장돼 재진입 시 복원되며, 변경 로그가 추적됩니다.【F:components/rank/GameRoomView.js†L780-L1160】【F:components/rank/GameRoomView.module.css†L927-L1340】【F:supabase.sql†L1-L120】

### `pages/rank/[id]/start.js`
- Dynamically loads the client-only `StartClient` shell so heavy assets stay out of the main bundle.【F:pages/rank/[id]/start.js†L1-L4】
- StartClient’s log board now normalises turn summaries, prompt previews, actors, and variables into glassmorphism cards, with the history columns stacking vertically on mobile and fanning out into multi-column grids on desktop so 운영/QA can scan context at any breakpoint. 섹션별 축약 토글·검색 입력에 더해 검색어 하이라이트와 액션/주역/태그 다중 필터 칩이 붙어 긴 전투에서도 필요한 카드만 빠르게 추릴 수 있습니다.【F:components/rank/StartClient/LogsPanel.js†L1-L400】【F:components/rank/StartClient/LogsPanel.module.css†L1-L360】【F:components/rank/StartClient/useStartClientEngine.js†L960-L1206】

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
- `/api/admin/audio-events`: owner/profile/hero/event-type filters plus search and CSV export for BGM 변경 로그를 반환하며, `trend=weekly` 요청 시 Supabase `rank_audio_events_weekly_trend` 뷰를 호출해 주간 집계를 돌려 관리자 포털 그래프와 Slack 다이제스트 모두에서 재사용합니다.【F:pages/api/admin/audio-events.js†L1-L244】【F:supabase.sql†L326-L362】

- `list-games.js`: filters and sorts rank games using predefined order plans; supports query string search and result limits.【F:pages/api/rank/list-games.js†L1-L44】
- `game-detail.js`: fetches roles and participants for a game, enriching participants with hero details via admin client when possible.【F:pages/api/rank/game-detail.js†L1-L56】
- `join-game.js`: inserts a hero into `rank_participants`, defaulting score to 1000 when unspecified.【F:pages/api/rank/join-game.js†L1-L36】
- `play.js`: server-side battle simulator orchestrating hero slot validation, opponent selection, prompt compilation, OpenAI call, outcome judging, and persistence via `recordBattle`. Requires authenticated user and user-supplied API key.【F:pages/api/rank/play.js†L1-L66】
- `finalize-session.js`: owner-authorized endpoint to finalize battles—updates participant scores/status, records battle summary/log, and handles optimistic concurrency conflicts.【F:pages/api/rank/finalize-session.js†L1-L96】
- `register-game.js`: ensures caller auth, writes new game via service role, and seeds optional role rows with sanitized score delta bounds.【F:pages/api/rank/register-game.js†L1-L53】
- `run-turn.js`: minimal wrapper over `callChat` enabling manual turn execution with arbitrary API keys/system prompts.【F:pages/api/rank/run-turn.js†L1-L35】

## Admin & Monitoring

### `pages/admin/portal.js`
- Cookie-gated admin surface that either shows the password prompt or, after validating the hashed cookie against `ADMIN_PORTAL_PASSWORD`, renders 운영 체크리스트·링크 카드·연락 섹션, 사용자 오류 모니터, 오디오 이벤트 로그 패널, 쿨다운 대시보드, 쿨다운 분석 보드를 순차로 노출합니다.【F:pages/admin/portal.js†L1-L156】【F:styles/AdminPortal.module.css†L1-L516】【F:components/admin/UserErrorMonitor.js†L1-L102】【F:components/admin/AudioEventMonitor.js†L1-L260】【F:components/admin/CooldownDashboard.js†L1-L160】【F:components/admin/CooldownAnalyticsBoard.js†L1-L162】

## Additional Observations & Potential Follow-Ups
- 클라이언트 전역 오류 리포터(`ClientErrorReporter`)가 `/api/errors/report`로 전송한 스냅샷을 관리자 포털의 `UserErrorMonitor`가 `/api/admin/errors`를 통해 집계해 운영팀이 현장 오류를 즉시 파악할 수 있습니다.【F:components/ClientErrorReporter.js†L1-L119】【F:components/admin/UserErrorMonitor.js†L1-L94】
- `/api/errors/report`와 `/api/admin/errors` 라우트는 `__tests__/api` 스위트와 헬퍼(`testUtils`)로 커버돼 있어 향후 관리자 API가 늘어나도 동일 패턴으로 테스트를 복제하며 회귀를 방지할 수 있습니다.【F:__tests__/api/testUtils.js†L1-L82】【F:__tests__/api/errors/report.test.js†L1-L137】【F:__tests__/api/admin/errors.test.js†L1-L183】
- `/api/admin/audio-events`와 `AudioEventMonitor` 조합이 Owner/프로필/히어로/이벤트 유형 필터, 기간 프리셋, 검색, CSV 다운로드, 주간 트렌드 그래프, 증가/감소 배지, 자동 새로고침을 제공해 오디오 변경 로그를 운영자가 빠르게 분류·추이까지 파악할 수 있습니다. 즐겨찾기·Slack 구독 조건을 저장/복원하는 폼은 마지막으로 적용한 규칙을 로컬에 기억해 재방문 시 자동 복원하고, 패널 상단의 활성 배지가 필터 요약·저장 시각을 동시에 보여 줍니다. 임계치·주간 범위·항상 포함 토글, Webhook 키 메모와 실행 로그 하이라이트 덕분에 대시보드·Slack 다이제스트에서 동일한 조건을 공유하며 Slack 메시지에는 구독 하이라이트 섹션이 포함됩니다. 히어로·담당자 스택 그래프는 상위 3/5/전체 토글과 스크롤 범례를 갖춰 분포가 많아도 손쉽게 비교되며, 전용 Jest 스위트가 필터 체인·CSV 헤더·주간 집계 RPC 호출·구독 하이라이트 포맷을 검증합니다.【F:pages/api/admin/audio-events.js†L1-L244】【F:components/admin/AudioEventMonitor.js†L1-L860】【F:styles/AdminPortal.module.css†L840-L1110】【F:__tests__/api/admin/audio-events.test.js†L1-L256】【F:scripts/notify-audio-event-trends.js†L1-L420】【F:__tests__/scripts/notify-audio-event-trends.test.js†L1-L160】
- `scripts/notify-audio-event-trends.js`는 Supabase RPC로 주간 집계를 조회해 Slack(Webhook)으로 다이제스트를 발송하며, CI 워크플로(`pr-ci.yml`, `blueprint-progress-freshness.yml`)에 통합돼 주간/PR 실행 시 자동으로 동작합니다. 헬퍼 함수들은 Jest에서 단위 검증을 거칩니다.【F:scripts/notify-audio-event-trends.js†L1-L206】【F:.github/workflows/pr-ci.yml†L1-L53】【F:.github/workflows/blueprint-progress-freshness.yml†L1-L53】【F:__tests__/scripts/notify-audio-event-trends.test.js†L1-L66】
- Supabase table helpers (`withTable`) abstract table name prefix differences across environments—most hooks and API routes rely on them for multi-tenant support.
- `rank_audio_preferences`와 `rank_audio_events` 테이블이 추가돼 브금 프리셋 선택과 변경 로그가 Supabase에 저장되며, `GameRoomView`는 `withTable`을 통해 동일 스키마를 읽고/쓰기 합니다.【F:supabase.sql†L1-L120】【F:components/rank/GameRoomView.js†L780-L1160】
- 캐릭터 상세 페이지 상단 글로벌 채팅 런처를 소형 배지로 다듬고 살짝 아래로 내렸습니다. 중앙 영웅 카드의 최대 폭과 비율을 줄여 모바일·데스크톱 모두에서 주변 정보와의 여백을 늘렸고, 설명/능력 오버레이를 상단 중앙 정렬로 옮긴 뒤 능력 단계를 1~4까지 각각 노출하도록 쪼개 가독성을 높였습니다. Supabase 스키마나 RPC는 변경되지 않았습니다.
- Several UI shells (create, roster, maker) defer most logic to component containers; reviewing those components is recommended for full domain context beyond this page-oriented audit.
- Ensure environment variables (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE`, etc.) are set for server APIs like `finalize-session` to work outside local mocks.【F:pages/api/rank/finalize-session.js†L1-L8】

