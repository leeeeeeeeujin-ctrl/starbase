# Onboarding Reading Notes (2025-11-09)

본 문서는 프로젝트 문서들을 빠르게 훑으며 파악한 핵심 개념을 요약해 새 팀원이 동일한 맥락에서 일을 시작할 수 있도록 돕기 위해 작성되었습니다. 향후 추가 학습이 필요하면 각 항목의 링크를 따라가 세부 문서를 참고하세요.

## 1. 개발 환경 및 초기 부트스트랩
- `README.md`는 Pages Router 기반 Next.js 애플리케이션을 로컬에서 띄우는 과정을 안내하고, Google OAuth, Storage 버킷, Realtime 구독까지 한 번에 설정하도록 구성돼 있습니다. Supabase 스키마 초기화 시 `supabase.sql`, `supabase_chat.sql`을 그대로 실행해 테이블과 RLS 정책을 재생성합니다.
- 환경 변수 정리는 `docs/environment-variables.md`에서 공통/민감 항목을 구분하며, 배포 전 점검해야 할 키 값을 강조합니다.

## 2. Supabase 스키마 구조
- `docs/supabase-schema-digest.md`는 테이블·뷰·정책·인덱스를 모두 요약한 최신 다이제스트로, `pgcrypto` 확장 활성화부터 영웅 자산, 프롬프트 세트, 랭크 운영 테이블까지 폭넓게 다룹니다. 각 항목은 원본 SQL의 세부 라인과 매핑돼 있어 빠른 역추적이 가능합니다.
- 매칭 및 랭크 운영과 관련된 핵심 테이블(`rank_match_queue`, `rank_match_roster`, `rank_sessions`, `rank_turns`)은 실시간 드롭인 운영을 위해 상태·동시성 데이터를 DB에 고정하고, 서비스 롤 정책으로 자동화 백엔드만이 행을 갱신할 수 있도록 설계돼 있습니다.

## 3. 매칭 플로우 이해
- `docs/matchmaking_auto_flow_notes.md`는 `AutoMatchProgress`와 `useMatchQueue`가 뷰어/히어로/역할 준비 상태를 검증하고 자동 큐잉을 실행하는 과정을 설명합니다. 페이지 진입 즉시 블로커를 제거하고 조건이 맞으면 `join` 액션을 호출해 `/api/rank/match` RPC를 트리거합니다.
- 문제 해결 시에는 뷰어 토큰, 히어로 선택, 듀오 파티 진입 경로 등 필수 선행 조건을 확인하고, 콘솔 로그로 차단 상태를 추적하는 것이 권장됩니다.

## 4. 메인 엔진과 상태 동기화
- `docs/main-engine-overview.md`는 `StartClient`를 구동하는 상태 머신(`mainGameMachine.js`)과 `useStartClientEngine` 훅을 중심으로, Supabase 스냅샷과 Realtime 이벤트를 통합해 UI 상태를 유지하는 흐름을 정리합니다.
- 상태 리듀서는 `RESET`, `PATCH`, `REPLACE_LOGS`, `APPEND_LOGS` 네 가지 액션을 통해 전투 로그·참가자 리스트·타이머를 관리하며, 실시간 세션 관리자와 드롭인 큐 서비스가 세션 스토리지와 연동돼 재접속 시에도 턴 공유 정보가 유지되도록 합니다.

## 5. 운영 및 모니터링 포인트
- `docs/project-overview.md`는 전체 문서를 섹션별로 안내해 주며, 운영/관리 도구로는 `docs/admin-portal.md`, `docs/rank-api-key-cooldown-monitoring.md`, `docs/slot-sweeper-schedule.md` 등을 우선적으로 참고하도록 유도합니다.
- 랭크 블루프린트 진행 상황과 리스크는 `docs/rank-blueprint-overview.md`와 진행 리포트 시리즈(`docs/rank-blueprint-progress-*.md`)에서 최신 업데이트를 추적할 수 있습니다.

## 6. 다음 학습 제안
- 메이커 편집기와 프롬프트 저작 흐름을 더 깊이 이해하려면 `components/maker/editor/MakerEditor.js`와 `docs/maker-json-schema.md`를 함께 읽어 보는 것을 권장합니다.
- 실시간 드롭인 운영 관련 문제를 대비하려면 `docs/rank-realtime-dropin-blueprint.md`, `docs/realtime-troubleshooting-2025-11-08.md`를 추가로 검토하세요.

> 추가로 확인하면 좋을 주제나 최신화해야 할 문서가 생기면 이 노트를 업데이트하거나 `docs/` 디렉터리에 보완 자료를 추가해 주세요.
