# Main Engine Overview

이 문서는 `StartClient` 메인 엔진의 상태 머신(`mainGameMachine.js`)과 이를 구동하는 훅(`useStartClientEngine.js`)의 상호 작용을 요약합니다.

## 1. 메인 상태 스냅샷
`mainGameMachine.js`는 로딩 상태, 참가자 목록, 그래프, 현재 턴 메타, 로그 및 히어로 자산 등 경기 진행에 필요한 모든 정보를 `initialMainGameState`로 정의합니다. 각 필드는 다음과 같은 역할을 가집니다.

- `loading`, `error`: 번들 로딩 및 서비스 초기화 여부를 추적합니다.
- `game`, `participants`, `slotLayout`, `graph`: Supabase에서 받아온 경기/참가자/슬롯/프롬프트 그래프의 최신 스냅샷입니다.
- `preflight`: 사전 점검 단계가 활성화됐는지 여부로, 프롬프트 배치 전 요약을 제어합니다.
- `turn`, `currentNodeId`, `activeGlobal`, `activeLocal`: 현재 턴과 그래프 노드, 적용 중인 글로벌/로컬 규칙을 나타냅니다.
- `logs`, `battleLogDraft`: 타임라인 이벤트와 요약 로그를 합친 UI 로그 버퍼입니다.
- `statusMessage`, `promptMetaWarning`: 운영자 경고 메시지와 프롬프트 메타 진단을 제공합니다.
- `isAdvancing`, `winCount`, `lastDropInTurn`: 턴 진행 중 여부, 누적 승 수, 최근 드롭인 턴을 추적합니다.
- `viewerId`, `turnDeadline`, `timeRemaining`: 시청자 관점에서의 턴 제한 및 남은 시간을 관리합니다.
- `activeHeroAssets`, `activeActorNames`: 현재 장면에 필요한 배경/음악/보이스 프로필과 연기자 명단을 포함합니다.

## 2. 리듀서 액션
메인 엔진은 네 가지 액션으로 상태를 변환합니다.

- `RESET`: 번들 재로딩 또는 매치 교체 시 기본 상태로 되돌립니다.
- `PATCH`: 특정 필드만 부분 업데이트할 때 사용하며, `useReducer`에서 가장 자주 호출됩니다.
- `REPLACE_LOGS`: 기존 로그를 완전히 교체합니다. 히스토리 버퍼를 복원하거나 스냅샷을 로드할 때 활용됩니다.
- `APPEND_LOGS`: 새 이벤트 묶음을 기존 로그 끝에 추가합니다.

이들 액션은 `useStartClientEngine` 훅에서 `dispatchEngine`을 통해 호출되며, 콜백 래퍼(`patchEngineState`, `replaceEngineLogs`, `appendEngineLogs`)로 캡슐화돼 UI·서비스 훅에서 안전하게 재사용됩니다.

## 3. 엔진 구동 흐름
`useStartClientEngine` 훅은 다음 절차로 메인 상태를 갱신합니다.

1. **번들 로딩**: `loadGameBundle`이 Supabase 데이터와 그래프를 가져오고, `patchEngineState`로 `game`, `participants`, `graph` 등을 채웁니다.
2. **프롬프트/룰 준비**: `buildSystemMessage`, `resolveSlotBinding`, `parseRules` 등을 통해 현재 노드의 프롬프트와 적용 규칙을 계산하고, `setStatusMessage` 및 `setPromptMetaWarning`으로 알림을 설정합니다.
3. **타임라인 통합**: `initializeRealtimeEvents`, `appendSnapshotEvents`, `buildLogEntriesFromEvents`가 실시간 이벤트와 스냅샷을 병합하며, 결과는 `setLogs` 또는 `appendEngineLogs`로 반영됩니다.
4. **서비스 연동**: 턴 타이머(`createTurnTimerService`), 투표 컨트롤러(`createTurnVoteController`), 드롭인 큐(`createDropInQueueService`), 비동기 세션(`createAsyncSessionManager`), 실시간 세션(`createRealtimeSessionManager`)이 각각 콜백으로 상태 업데이트를 트리거합니다. 예를 들어, 투표 종료 시 `setTurn`과 `patchEngineState`로 다음 턴을 준비합니다.
5. **감시 및 복구**: `useStartManualResponse`, `useStartCooldown`, `useStartSessionWatchdog` 등이 내부 상태를 모니터링하며, 이상 징후 시 `setStatusMessage` 또는 `patchEngineState`를 통해 운영자에게 경고합니다.

이 흐름을 통해 메인 엔진은 Supabase 데이터, 프롬프트 그래프, 실시간 서비스 이벤트를 하나의 리듀서 상태로 통합해 UI에 안정적으로 공급합니다.

## 4. 룰 병합과 중복 방지

- 게임 등록 페이지의 `rules_prefix`에 과거 수동으로 입력한 지침과, 체크리스트/옵션 토글에서 파생된 룰 문장이 동시에 존재할 수 있습니다.
- `buildRuleSections`는 우선순위를 적용해 룰을 병합하지만, 의미만 겹치고 문장 표현이 다르면 중복이 드러날 수 있었습니다.
- 이를 줄이기 위해 `resolveCanonicalRuleKey`가 인젝션 탐지, 승패 고정, 능력 운용 등 핵심 테마를 정규화 키로 매핑하고, 같은 의미의 문장을 하나로 합칩니다.
- 동일 테마의 새 옵션 라인이 더 높은 우선순위를 가지므로, 기존 수동 입력보다 최신 옵션 문장이 유지되고 중복 출력이 제거됩니다.
