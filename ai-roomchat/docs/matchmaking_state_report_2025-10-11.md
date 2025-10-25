# Matchmaking State Report — 2025-10-11

## Current Behaviour Snapshot

- **Automatic entry points**: `/rank/[id]/solo`, `/rank/[id]/duo`, and `/rank/[id]/casual` mount `AutoMatchProgress` immediately, so players with a saved 역할·영웅 조합 attempt to queue without pressing 추가 버튼을 누르지 않습니다.
- **Blocker handling**: `AutoMatchProgress` inspects viewer 인증, locked role, and hero selection via `useMatchQueue`. When any prerequisite is missing the overlay pauses queue attempts, lists the blockers, and logs them to the 콘솔 for QA triage.
- **Confirmation gate**: Once `/api/rank/match` returns a 후보군 that includes the viewer, the overlay starts a 10초 확인 타이머. Everyone must press the 배틀 버튼 within the window, otherwise the queue entry is 취소되고 룸으로 리다이렉트됩니다.

## Pain Points Observed

1. **Manual queue UI resurfacing**
   - When browser storage drops the `selectedHeroId` key, `useMatchQueue` treats the viewer as 무캐릭터 상태. The overlay redirects to the 메인 룸 but legacy `MatchQueueClient` pages still show the manual “대기열 참가” 버튼. This confuses testers who reopen the same 탭.
   - The legacy 컴포넌트 remains in the codebase for reference yet no longer wired into 라우트. Removing or clearly labelling it as deprecated would avoid future 착각.
2. **Duo 파티 합류 지연**
   - `/rank/[id]/duo` 확정 후 `/rank/[id]/duo/queue`에서 party key 전달이 되지 않으면 `enqueueParticipant`가 일반 솔로 큐로 보냅니다. `MatchmakingService`는 아직 파티 슬롯을 우선 조합하지 않아, 같은 파티라도 서로 다른 매치에 배정될 수 있습니다.
3. **Session handshake gaps**
   - `/api/rank/start-session` succeeds during 확인 단계지만, `/rank/[id]/start`가 이어서 `/api/rank/play` 혹은 `/api/rank/run-turn`을 호출하는 부분이 스텁 상태입니다. 세션이 생성됐더라도 실제 전투는 로컬 그래프에 머무릅니다.

## Recommended Next Actions

1. **Storage resilience for hero selection**
   - Mirror the 확정된 히어로를 `rank_participants.hero_id`뿐 아니라 `selectedHeroId` 로컬 스토리지에도 즉시 반영하고, 스토리지 손실 시 가장 최근 서버 값을 복원하는 폴백을 구현합니다.
   - Provide a dismissible 안내 배너 on the overlay explaining why 자동 참가가 중단되었는지, so testers do not assume 페이지가 고장났다고 판단하지 않도록 합니다.
2. **Duo queue payload audit**
   - Extend `enqueueParticipant` to accept `party_key` from `DuoMatchClient` and ensure `/api/rank/match` prioritises completing 파티 단위 assignment before filling with 랜덤 참가자.
3. **Session → Battle wiring**
   - Teach `StartClient` to exchange the 세션 ID returned from `/api/rank/start-session` for a `/api/rank/play` request that finalises the 첫 턴. Persisted 로그 (`rank_turns`) should then mirror what the 클라이언트 shows, closing the loop highlighted in the blueprint.

## Open Questions

- Should we delete or archive `MatchQueueClient` to prevent 혼동, or keep it behind a storybook-like 샌드박스 for QA regression?
- How strict should the 확인 페널티 be? 현재는 단순 리다이렉션만 하지만, 큐 페널티나 재입장 쿨다운을 곧바로 걸지 않아도 되는지 결정이 필요합니다.

---

느낀 점: 자동 매칭 흐름을 다시 훑어보니, 남아 있는 수동 UI 잔재가 테스트 피드백을 헷갈리게 한다는 사실을 분명히 확인할 수 있었습니다.
추가로 필요한 점: 듀오 큐 페이로드와 세션-전투 핸드셰이크를 조만간 착수해 두어야 전체 파이프라인을 실제 게임처럼 돌려볼 수 있겠습니다.
진행사항: 현재 자동 매칭 상태와 문제점을 문서로 정리하고, 다음에 손댈 우선순위를 세 가지 축(스토리지 복원, 파티 큐, 세션 연동)으로 제안했습니다.
