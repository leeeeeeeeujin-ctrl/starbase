# Game Structure Overview

이 문서는 `StartClient` 기반 랭킹 전투 클라이언트의 주요 구성 요소와 데이터 흐름을 요약합니다.

## 1. 번들 로딩 (`engine/loadGameBundle.js`)

- Supabase의 논리 테이블을 `withTable` 래퍼로 조회해 게임, 참가자, 슬롯, 프롬프트 그래프 데이터를 불러옵니다.
- `normalizeParticipants`와 `normalizeSlotLayout`이 슬롯 순서와 참가자 메타를 정리하고, `createNodeFromSlot`을 통해 슬롯별 노드 규칙을 생성합니다.

## 2. 클라이언트 엔진 훅 (`useStartClientEngine.js`)

- `mainGameReducer` 상태 머신으로 로딩, 턴 진행, 로그, 승수 등 핵심 상태를 관리합니다.
- `loadGameBundle` 결과와 Supabase 실시간/투표/드롭인 서비스를 조합해 턴을 진행하며, 수동 응답·쿨다운·감시 타이머 훅을 포함합니다.
- 시스템 프롬프트(`buildSystemMessage`), 슬롯 바인딩(`resolveSlotBinding`), 브리지 컨텍스트(`createBridgeContext`) 등 서브 엔진을 호출해 턴별 프롬프트와 로그를 구축합니다.

## 3. 엔진 서브 모듈

- `graph.js`와 `rules.js`는 프롬프트 그래프 탐색과 슬롯 규칙을 해석합니다.
- `systemPrompt.js`와 `actorContext.js`는 시스템 메시지, 참가자 페르소나, 히어로 컨텍스트를 계산합니다.
- `timelineState.js`와 `timelineLogBuilder.js`는 실시간 이벤트를 통합하고 타임라인 로그 엔트리를 생성합니다.
- `preflight.js`, `participants.js`, `battleLogBuilder.js`는 경기 시작 전 요약, 소유자 매핑, 배틀 로그 초안을 담당합니다.

## 4. UI 컴포넌트 (`StartClient/index.js` 등)

- `StartClient` 컴포넌트는 훅에서 제공한 상태를 이용해 헤더, 상태 배너, 로그 패널, 턴 패널, 로스터를 배치합니다.
- 슬롯/참가자/브리지 조건 등의 메타데이터를 문자열로 서술해 운영자를 돕는 유틸리티를 포함합니다.

## 5. Supabase 연동 (`lib/supabaseTables.js`)

- `withTable` 헬퍼가 환경별 실제 테이블 이름을 탐색해 캐시하며, 동일한 코드로 `rank_games`, `rank_participants` 등 다양한 스키마를 처리합니다.

이 구조를 통해 게임 클라이언트는 Supabase에서 정의한 슬롯·참가자·프롬프트 그래프 정보를 불러와 상태 머신 기반으로 턴을 진행하고, 각종 서비스(투표, 드롭인, 실시간)를 결합해 랭킹 전투 세션을 운영합니다.
