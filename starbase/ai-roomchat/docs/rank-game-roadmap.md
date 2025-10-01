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
- **Automatic slot sweeper**: Introduced the reusable `releaseStaleSlots` helper and `/api/rank/slot-sweeper` worker so service-role tasks or internal schedulers can free slots automatically when participants time out, are kicked, or leave stale queue entries behind.【F:starbase/ai-roomchat/lib/rank/slotCleanup.js†L1-L245】【F:starbase/ai-roomchat/pages/api/rank/slot-sweeper.js†L1-L66】
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

## Progress Update — 2025-11-09
- **Matchmaking diagnostics**: `AutoMatchProgress` now logs every auto-join attempt with a numbered signature, records when queue waiting begins, and emits explicit warnings if the 60초 timeout path fires, making it easier to confirm whether the overlay actually enqueued players.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L220-L310】【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L604-L648】
- **Documentation refresh**: The matchmaking diagnostics guide highlights the new attempt/timeout logs so QA can filter for them during investigations.【F:starbase/ai-roomchat/docs/matchmaking_diagnostics.md†L8-L23】
- **Progress update**: Instrumentation improves observability rather than core features, so the rollout estimate stays near **75%**, but we now have clearer signals for finishing the remaining scoring and shared-history milestones.

## Progress Update — 2025-10-27
- **Blueprint gap audit**: 정리한 점검표를 통해 슬롯·세션 자동화는 안정적으로 동작하고 있지만 점수 동기화, 공용 히스토리, 운영 가드는 아직 미완료 구간임을 확인했다.【F:starbase/ai-roomchat/docs/rank-blueprint-gap-audit-2025-10-27.md†L1-L60】
- **Outstanding items**: 다중 방어자 점수 업데이트, 인비저블 히스토리 연결, API 키 고갈 경보가 남은 핵심 과제로 분류됐다.【F:starbase/ai-roomchat/docs/rank-blueprint-gap-audit-2025-10-27.md†L62-L84】
- **Progress check**: 신규 기능 추가 없이 상태만 점검했으므로 누적 진행도는 **77%**로 유지하며, 다음 스프린트는 Score Sync → Shared History → Ops Guard 순으로 진행한다.【F:starbase/ai-roomchat/docs/rank-blueprint-gap-audit-2025-10-27.md†L86-L107】

## Progress Update — 2025-10-28
- **Mobile-first stage layout**: `StartClient`를 세로형 메인 패널과 로그 사이드바로 재배치해 모바일에서도 전투 진행, 입력, 로그를 한 화면에서 확인할 수 있도록 했다.【F:starbase/ai-roomchat/components/rank/StartClient/index.js†L430-L486】【F:starbase/ai-roomchat/components/rank/StartClient/StartClient.module.css†L172-L215】
- **Roster strip refresh**: 참가자 정보를 상단 가로 스트립으로 통합해 현재 턴과 역할군 상태를 한눈에 파악할 수 있게 하고, 배지·하이라이트로 활성 슬롯을 강조했다.【F:starbase/ai-roomchat/components/rank/StartClient/index.js†L349-L418】【F:starbase/ai-roomchat/components/rank/StartClient/StartClient.module.css†L64-L169】
- **Progress update**: 단계 4(UI·오디오)에서 핵심이던 메인 전투 UI 재배치를 완료하며 전체 진행률을 약 **78%**로 상향했고, 이후 작업은 히스토리 탭과 오디오 전환 다듬기에 집중한다.

## Progress Update — 2025-10-29
- **Shared history API**: `/api/rank/sessions` 엔드포인트를 추가해 서비스 롤로 세션·턴 로그를 모아 보고, 뷰어 권한에 맞춰 비공개 라인을 필터링하도록 했다.【F:starbase/ai-roomchat/pages/api/rank/sessions.js†L1-L144】
- **Lobby history panel**: `GameRoomView`가 새 API 응답을 사용해 공용 히스토리를 표시하고, 히어로/역할 메타와 숨겨진 턴 안내를 함께 노출해 신규 참가자가 흐름을 빠르게 파악할 수 있다.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L1000-L1205】【F:starbase/ai-roomchat/components/rank/GameRoomView.module.css†L1553-L1618】
- **Next steps**: 세션 폴링 주기를 다듬고 `rank_turns` 가시성 확장을 반영해 인비저블 라인이 정확히 숨겨지는지 QA 할 계획이다.

## Progress Update — 2025-10-30
- **Duo/Casual auto-start**: `AutoMatchProgress`가 매칭 확정 후 `/api/rank/play`를 호출해 팀 슬롯 구성으로 전투를 즉시 실행하고 결과를 표시하도록 확장했다.【F:components/rank/AutoMatchProgress.js†L333-L432】
- **Flow polish**: 매칭 메타 영역에 전투 결과 안내를 추가해 확인 단계가 끝난 뒤에도 진행 상황을 명확히 전달한다.【F:components/rank/AutoMatchProgress.js†L747-L812】
- **Progress update**: 듀오/캐주얼 자동화가 솔로 흐름과 동일한 파이프라인을 사용하게 되면서 단계 1이 완결됐고 전체 진행률은 약 **79%**로 상승했다.

## Progress Update — 2025-11-05
- **Baseline confirmation**: Re-reviewed the restored lobby/start flows to ensure the manual controls and legacy queue clients remain in sync across solo, duo, and casual pages, matching the documented baseline before resuming feature work.【F:starbase/ai-roomchat/docs/rank-blueprint-progress-2025-11-05.md†L1-L12】
- **Plan alignment**: Updated the execution plan checklist to reference the confirmed baseline so upcoming tasks (score sync, shared history, ops guard) stay focused on the remaining 21 %. Progress remains steady at **79 %** pending those phases.【F:starbase/ai-roomchat/docs/rank-blueprint-progress-2025-11-05.md†L4-L12】

## Progress Update — 2025-11-06
- **API 키 쿨다운 가드**: `StartClient`가 `markApiKeyCooldown`/`getApiKeyCooldown`을 사용해 5시간 쿨다운을 추적하고, 쿨다운 중에는 상태 배너와 헤더 컨트롤에서 즉시 경고를 띄우며 자동 턴 실행을 막는다.【F:components/rank/StartClient/useStartClientEngine.js†L118-L210】【F:components/rank/StartClient/index.js†L108-L160】
- **시작 버튼 보호**: `HeaderControls`가 쿨다운 상태에선 “게임 시작” 버튼을 비활성화해 동일 키로의 반복 시도를 차단하고, 플레이어에게 새 API 키가 필요하다는 사실을 명시한다.【F:components/rank/StartClient/index.js†L418-L436】【F:components/rank/StartClient/HeaderControls.js†L1-L61】
- **진척도**: 운영 가드 단계의 첫 번째 항목이 가동되면서 전체 롤아웃 추정치를 **80 %**로 상향하고, 다음 스텝은 서버 로그/알림으로 쿨다운 정보를 공유하는 것이다.【F:docs/rank-blueprint-progress-2025-11-06.md†L1-L12】

## Progress Update — 2025-11-07
- **쿨다운 서버 보고**: `markApiKeyCooldown`이 새 `/api/rank/cooldown-report` 경로로 해시된 키 샘플과 사유를 전송해 Supabase `rank_api_key_cooldowns` 테이블에 이벤트를 기록한다.【F:lib/rank/apiKeyCooldown.js†L3-L73】【F:pages/api/rank/cooldown-report.js†L1-L79】
- **운영용 다이제스트 파이프라인**: `/api/rank/cooldown-digest`를 수동 혹은 사내 스케줄러에서 호출해 미알림 이벤트를 수집·로그로 남기고, 처리된 항목은 `notified_at` 타임스탬프로 표시한다.【F:pages/api/rank/cooldown-digest.js†L1-L90】
- **운영 가이드**: 새 `rank-api-key-cooldown-monitoring.md` 문서가 테이블 생성, 환경 변수, 수동 다이제스트 절차를 요약해 운영팀이 바로 참고할 수 있도록 정리했다.【F:docs/rank-api-key-cooldown-monitoring.md†L1-L88】
- **진척도**: 운영 가드 하위 항목(서버 경보 연동)을 완료해 남은 작업은 Slack/Webhook 통합과 백엔드 키 재발급 자동화다. 전체 추정 진행도는 **82 %**로 상향한다.

## Progress Update — 2025-11-08
- **운영 경로 재점검**: 청사진 단계별 작업 현황을 재확인하고, 관리자 모니터링 포털이 `/admin/portal` 경로에서 정상적으로 노출되는지 확인했다. 비밀번호 미설정 시에도 안내가 표시되는 기존 가드를 유지한다.【F:docs/admin-portal.md†L1-L40】
- **문서 갱신**: 관리자 접근 정보를 문서 첫머리에서 바로 찾을 수 있도록 보강하고, 향후 Slack/Webhook 연동 이전까지 진행률을 **82 %**로 유지한다고 명시했다.【F:docs/admin-portal.md†L1-L24】
- **다음 단계**: 남은 운영 가드(실시간 알림·자동 키 회전)와 세션 기록 보강을 계속 진행하며, 진행 메모는 청사진 문서에 연속 기록한다.
