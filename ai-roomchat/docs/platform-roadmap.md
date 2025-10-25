# AI Battle Platform – Roadmap (2025-10-21)

## Vision

누구나 캐릭터·역할·프롬프트만으로 “AI 배틀 스토리” 게임을 만들고 배포할 수 있는 플랫폼.

- 실시간/비실시간 혼합 지원(턴-기반 비동기 + 선택적 실시간 동기화)
- 매칭: 랭크/캐주얼/사설방, 파티(1–3), 점수 윈도우, 난입(빈 슬롯 충원)
- 제작기(Maker): 슬롯/역할, 프롬프트 변수, 룰, 이미지/오디오
- 세션/전투/로그 영속화와 관전/리플레이, 간단한 모더레이션

## Architecture at a glance

- Maker/Blueprint
  - Tables: `rank_games`, `rank_game_roles` (slot_count), optional `rank_game_slots`
  - Docs: `docs/maker-json-schema.md`, `docs/rank-games-overview.md`
  - UI: pages under `pages/rank/*` and components in `components/rank/*`
- Matchmaking Layer
  - Core: `lib/rank/matching.js`, mode config `lib/rank/matchModes.js`
  - API: `pages/api/rank/match.js` (큐 등록/매칭 계획 → matched 표시)
  - Queue: `rank_match_queue` + policies/indexes from `supabase.sql`
  - Drop-in: brawl replacement/난입 지원 훅 존재(`determineBrawlVacancies` in match API)
- Runtime & Persistence
  - Session: `rank_sessions`, `rank_session_meta`
  - Battles: `rank_battles`, Logs: `rank_battle_logs`
  - Turn logs: planned `rank_turns` (docs refer) and existing battle logs
  - APIs: `/api/rank/play`, `/api/rank/finalize-session` (orchestration)
- Realtime/Async
  - Supabase Realtime channels for rooms; polling fallback in Match/Room pages
- Observability & Admin
  - Test plan docs under `docs/*blueprint*`, self-test endpoints, scripts in `scripts/`

## Current repo alignment (highlights)

- Matching modes and policies documented: `lib/rank/matchModes.js`, `docs/rank-matching-adapter.md`
- Matching algorithm present but needs stabilization: `lib/rank/matching.js`
- Match API integrates adapter and supports brawl (난입): `pages/api/rank/match.js`
- Session/Battle persistence works (validated via `scripts/createDirectSession.js`)
- Schema source of truth: `supabase.sql` (RLS, indexes, queue policies, battle logs)

## Phased Plan

### Phase 0 – Stabilize foundations (1–2 weeks)

- Matching hotfix: ensure `matchRankParticipants` yields a plan for simple 1v2 roles.
  - Add adapter fallback: ignore score windows if queue has exact-capacity fit; behind a flag.
  - Unit tests for 3-slot (공격 1, 수비 2) success and minimal edge cases.
- Drop-in MVP: in `pages/api/rank/match.js` path that already computes `determineBrawlVacancies`, wire assignment→slot claim for vacancies and return a join token.
- Schema harmonization: align code to actual columns (`rank_battle_logs.turn_index` = generated; don’t insert). Document diffs in `docs/rank-game-schema-reference.md`.
- Minimal runtime endpoints: harden `/api/rank/start-session`, `/api/rank/run-turn` or reuse play/finalize flow to ensure turns/logs append cleanly.

### Phase 1 – Creator-first MVP (2–4 weeks)

- Maker flow: publish minimal game with roles/slots + prompt set; lobby list + detail; join/leave.
- Match → Start session → Run first turn → Persist battle + logs; viewer UI shows history.
- Private room with manual slot fill; toggle “난입 허용” → open vacancies to queue.
- Basic moderation: report/flag endpoints with admin view.

### Phase 2 – Beta feature set (4–8 weeks)

- Parties (duo/triad), expanded modes; score windows and decay; season snapshots.
- Spectators with replay scrub; room chat overlay + media prompts.
- Maker improvements: variable inspector, prompt graph presets, validation, import/export.

### Phase 3 – Scale & Platform (8+ weeks)

- Stripe billing/credits; per-session/user API key controls & rate limits.
- Abuse protection: caps, cooldowns, anomaly detection; audit trails.
- Multi-region, queue sharding, background workers for long prompts.

## Immediate Next Steps (Actionable)

1. Matching Hotfix & Tests

- Implement a “safe” adapter: if role slots can be filled exactly by currently queued entries per role, return ready=true; bypass score windows. Guard by env flag.
- Add unit tests under `__tests__/lib/matching.*` for 1v2 roles happy path + shortage edge.

2. Drop-in (난입) API wiring

- In `pages/api/rank/match.js`, use `determineBrawlVacancies` when enabled to select candidates from `rank_match_queue` and mark as matched. Return `matchCode` and slot mapping.
- Add `/api/rank/drop-in` convenience that calls the same helper for mid-session vacancies.

3. Runtime hardening

- Ensure `/api/rank/start-session` creates `rank_sessions` + `rank_session_meta` consistently.
- Ensure `/api/rank/run-turn` writes `rank_battle_logs` with correct columns (omit `turn_index`).
- Add a simple “Session Inspector” admin page to browse sessions/battles/logs by game.

4. Maker wiring

- Source roles strictly from `rank_game_roles(name, slot_count, active)`; deprecate legacy JSON roles if any.
- Map prompt variables from Maker meta to runtime prompt compiler; add validation endpoint.

## Risks & Mitigations

- Matching complexity → start with simple exact-fit and iterate; add observability counters.
- Prompt cost/latency → require user API keys; queue long turns; stream partial results to UI.
- Abuse/spam → RLS already in place; add per-IP and per-user rate limits and audit logs.

## Checklists

- Data: `rank_games`, `rank_game_roles`, `rank_match_queue`, `rank_sessions`, `rank_session_meta`, `rank_battles`, `rank_battle_logs` verified and documented.
- Policies: RLS enabled; service-role paths only used on server endpoints.
- Tests: unit (matching), integration (start-session/run-turn), e2e (lobby→match→play).

---

Author: platform engineering notes synthesized from current repo state and working scripts (createDirectSession).
