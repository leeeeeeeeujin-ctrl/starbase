# Documentation Navigator

새로 들어온 팀원이 이미 정리돼 있는 문서를 빠르게 탐색할 수 있도록 핵심 링크와 요약을 모았습니다. 아래 섹션을 순서대로 따라가면 개발 환경 준비부터 랭크 모드 운영까지 필요한 정보를 대부분 찾을 수 있습니다.

## 1. 시작 가이드
- [`README.md`](../README.md): 로컬 개발 준비, 주요 라우트, 핵심 구조 메모를 한 번에 정리한 스타터 가이드입니다.
- [`environment-variables.md`](environment-variables.md): 배포/로컬 공통으로 필요한 환경 변수와 보안 주의사항을 나열합니다.
- [`supabase.sql`](../supabase.sql) · [`supabase_chat.sql`](../supabase_chat.sql): 기본 영웅/랭크/채팅 스키마와 RLS 정책을 한 번에 세팅할 때 실행합니다. 구조 세부 사항은 아래 “데이터 & 스키마” 섹션을 참고하세요.

## 2. 제품 플로우 & 상태 관리
- [`page_state_map.md`](page_state_map.md): 로스터 → 로비 → 방 → 큐 → 전투로 이어지는 주요 상태 저장 위치와 컨텍스트 흐름을 설명합니다.
- [`matchmaking_auto_flow_notes.md`](matchmaking_auto_flow_notes.md): `AutoMatchProgress`와 `useMatchQueue`가 어떻게 자동 큐잉을 수행하는지, 블로커 진단 포인트까지 정리돼 있습니다.
- [`matchmaking_diagnostics.md`](matchmaking_diagnostics.md) / [`matchmaking_state_report_2025-10-11.md`](matchmaking_state_report_2025-10-11.md): 실험 중인 큐 상태를 조사한 리포트와 점검 체크리스트입니다.
- [`page-audit.md`](page-audit.md): 페이지별 역할, 진입 경로, 컴포넌트 분리를 요약해 라우팅 흐름을 빠르게 파악할 수 있습니다.

## 3. 랭크 시스템 로드맵 & 설계
- [`rank-blueprint-overview.md`](rank-blueprint-overview.md): 청사진의 비전, 단계별 상태, 리스크, 다음 액션을 한눈에 요약합니다.
- [`rank-game-roadmap.md`](rank-game-roadmap.md): 시즌 별 목표와 전달 순서를 시간축으로 정리했습니다.
- [`rank-blueprint-execution-plan.md`](rank-blueprint-execution-plan.md) 및 진행 리포트(`rank-blueprint-progress-*.md`): 블루프린트 태스크 분해, 위험 요소, 최근 업데이트를 추적합니다.
- [`rank-matching-adapter.md`](rank-matching-adapter.md): 매칭 어댑터 계층이 Supabase 데이터와 게임 세션을 어떻게 연결하는지 설명합니다.
- [`rank-turn-history-spec.md`](rank-turn-history-spec.md) / [`rank-game-logic-plan.md`](rank-game-logic-plan.md): 턴 로그 스키마와 전투 엔진 의사결정 흐름을 정의합니다.

## 4. 데이터 & 스키마 레퍼런스
- [`supabase-ddl-export.md`](supabase-ddl-export.md): 최신 Supabase 테이블/뷰 DDL을 덤프한 참조본입니다.
- [`supabase-schema-digest.md`](supabase-schema-digest.md) / [`rank-game-schema-reference.md`](rank-game-schema-reference.md) / [`social-schema.md`](social-schema.md): 랭크, 소셜 영역 별 테이블 정의와 관계도를 설명합니다.
- [`supabase_social.sql`](../supabase_social.sql) · [`supabase_chat.sql`](../supabase_chat.sql): 소셜/채팅 전용 스키마를 부트스트랩할 때 사용합니다.

## 5. 운영 & 관리 도구
- [`admin-portal.md`](admin-portal.md): `/admin/portal`에 배포된 운영 대시보드 인증 플로우와 필수 환경 변수, 체크리스트를 안내합니다.
- [`rank-api-key-cooldown-monitoring.md`](rank-api-key-cooldown-monitoring.md): OpenAI API 키 교대와 쿨다운 모니터링 절차를 정리했습니다.
- [`slot-sweeper-schedule.md`](slot-sweeper-schedule.md): 랭크 슬롯 스위퍼 크론이 어떤 시점과 조건으로 실행되는지 기록합니다.
- [`hero-bgm.md`](hero-bgm.md): 히어로별 배경 음악 매핑과 자산 관리 지침입니다.

## 6. 추가 탐색 포인트
- [`initial-survey.md`](initial-survey.md): 온보딩 설문 문항과 응답 파이프라인.
- [`match-mode-structure.md`](match-mode-structure.md): 모드별 화면 구성과 진입 조건.
- [`chat-hero-context.md`](chat-hero-context.md): 히어로 채팅 컨텍스트와 프롬프트 규칙.
- [`rank-game-roadmap.md`](rank-game-roadmap.md)와 짝을 이루는 [`rank-game-logic-plan.md`](rank-game-logic-plan.md)는 전투 설계와 일정 조율에 함께 참고하면 좋습니다.

> 문서는 대부분 최신 상태지만, 작업 전에는 파일 상단의 타임스탬프나 진행 리포트 날짜를 확인해 주세요. 필요 시 새로운 메모를 같은 디렉터리에 추가하고 여기 링크를 확장하면 탐색성이 유지됩니다.
