# 메인 게임 청사진 (자동 진행형 랭크/난입 모드)

## 1. 턴 타이머 및 세션 진입 흐름

- **게임 진입**: 매칭 완료 후 메인 룸으로 이동하면 프롬프트 제작기에서 지정한 *시작 노드*가 즉시 실행돼 첫 턴 프롬프트를 생성한다.
- **추가 유예**: 최초 턴에는 전역 턴 제한시간 외에 **+30초 보너스**를 더해 입장 직후 정렬 시간을 확보한다.
- **난입 보너스**: 난입 플레이어(역할군) 합류 턴에는 해당 턴에 한해 전역 턴 제한시간에 **+40초**를 추가해 새 참가자가 상황을 파악할 시간을 보장한다.
- **표시 방식**: 화면 상단에 남은 시간을 실시간으로 노출하고, 10초 이하일 때 경고 색상과 진동(웹 진동 API)으로 마감 임박을 알린다.
- **자동 진행**: 제한시간이 만료되면 현재 노드 상태를 기준으로 자동으로 다음 턴이 실행된다. 실시간/비실시간 여부와 무관하게 동일하게 동작한다.
- **비정상 감지**: 턴 제한시간을 넘긴 뒤에도 일정 시간 이상 진행되지 않으면 세션 감시기가 자동으로 무효 처리하고 타임라인에 이유와 함께 기록한다.
- **조기 종료 투표**: 제한시간 내에 **참여 가능 인원의 80% 이상이 “다음” 버튼**을 누르면 즉시 턴을 종료하고 다음 노드로 넘어간다. 실시간 모드에서 탈락·관전 전환된 슬롯은 계산에서 제외한다.

## 2. 프롬프트 그래프와 변수 시스템 연동

- **규칙 블록**: 프롬프트 최상단 규칙 문구에 `누가 봐도 이 게임의 주역이다 싶은 캐릭터가 있다면, 이름을 마지막에서 세 번째 줄에 적어라.`를 고정 추가한다.
- **변수 선언**: 적극/수동 변수, 게임 종료 변수 등은 프롬프트 제작기의 규칙 선언으로 통일해 프롬프트 빌더와 실행 엔진이 동일한 메타데이터를 참조한다.
- **슬롯 바인딩**: 슬롯마다 `이름/능력/설명` 등의 트리거를 정의해 턴 프롬프트에 자동 주입하고, 특정 슬롯 전용 응답(비공개 라인)도 제작기 설정값을 그대로 따른다.
- **노드 조건**: 브리지 조건에 턴 수, 변수 플래그, 역할군 생존 여부, 난입 상태 등을 조합할 수 있도록 설계하고, 조건 불충족 시에는 대체 브리지(우선순위 순)로 폴백한다.
- **AI/유저 슬롯**: 유저 입력 슬롯에는 안내 문구(작성 가이드)를 함께 제공하고, AI 슬롯은 해당 참가자의 API 키 또는 대역 실행 키를 통해 자동 호출한다.

## 3. 실시간 모드 vs 비실시간 모드

| 구분        | 실시간 ON                                                                   | 실시간 OFF                                                         |
| ----------- | --------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 매칭 대상   | 실제 큐에 참가한 플레이어들만 게임에 참여                                   | 큐 신청자(호스트)만 직접 참여, 나머지는 대역으로 채움              |
| 응답 주체   | 전원 플레이어. 탈주 시 경고 2회 → 3번째부터 대역 전환                       | 플레이어 슬롯 외 전원 AI 대역이 응답                               |
| “다음” 버튼 | 실참여 중인 플레이어만 집계. 대역 전환된 슬롯은 제외                        | 큐 신청자(혹은 듀오 파티)만 집계                                   |
| API 키      | 각 플레이어의 개인 키. 키 고갈 시 경고 후 대역 키로 대체 가능               | 호스트(또는 파티) 키 1개로 실행, 대역 키는 운영용 풀에서 자동 할당 |
| 난입 처리   | 패배 역할군은 즉시 관전 전환, 새 매칭 인원이 차면 해당 역할군으로 난입 가능 | 패배한 대역은 즉시 교체, 플레이어는 계속 진행                      |

### 실시간 모드 보호 장치

1. **경고 시스템**: 턴 종료 투표에 참여하지 않으면 2회까지 경고(시각·음향). 3번째 미응답부터는 자동으로 대역 처리, 다음 버튼 비활성화, 참가자 리스트에 ‘대역’ 뱃지 표기.
2. **관전 전환**: 역할군 패배 시 플레이어는 관전 상태로 남아 히스토리를 열람할 수 있지만 게임 진행에는 영향 없음.
3. **난입 승인**: 난입 요청이 들어오면 동일 역할군 대기열이 충족될 때까지 대기 → 승인 시 즉시 슬롯에 배치, 다음 턴부터 참여.

### 비실시간 모드 운영

1. **대역 응답**: 슬롯별 AI 호출 시 히스토리, 캐릭터 설정, 유저 프롬프트 안내문을 합쳐 대역 프롬프트를 생성한다.
2. **API 고갈 대응**: 호스트 키가 고갈되면 실시간 여부에 따라 중단(실시간 OFF) 또는 경고 후 다른 참가자/운영 키로 대체(실시간 ON).
3. **자동 진행**: 대역 응답 완료 후 즉시 턴 종료, 남은 시간과 무관하게 다음 턴으로 전환된다.

## 4. 난입 옵션 세부 규칙

- **공통**: 난입 옵션이 켜져 있으면 게임 종료 변수(끝에서 두 번째 줄 선언) 혹은 더 이상 이어질 프롬프트가 없을 때까지 지속. 승리 조건을 달성해도 해당 역할군은 계속 참여 가능하며, 승리 횟수는 최종 점수에 가산한다.
- **실시간 모드**: 역할군 전원이 탈락하거나 패배 조건에 도달하면 즉시 관전으로 이동. 동일 역할군의 신규 플레이어 매칭이 완료되면 다음 턴 시작 시점에 난입.
- **비실시간 모드**: 패배한 대역을 새 대역으로 교체하고, 교체가 끝나면 다음 턴에서 자동으로 등장.
- **점수 처리**: 난입으로 합류한 참가자의 승/패/난입 횟수를 별도로 기록해 결과 로그 및 리더보드에 반영한다.

## 5. 게임 종료 조건 정리

1. **역할군 전멸**: 역할군 전원이 탈락하고 대체 승패 조건이 없다면 해당 역할군 패배로 게임 종료.
2. **종료 변수**: 프롬프트 출력의 마지막에서 두 번째 줄에 `게임종료`(혹은 등록 페이지에서 정의한 키워드)가 등장하면 즉시 종료.
3. **그래프 종착**: 브리지 조건을 모두 평가했을 때 다음 노드가 없고 승패가 확정되지 않은 경우 무승부 처리 후 종료.

## 6. 히스토리 및 로그 관리

- **실시간 히스토리**: 진행 중인 세션의 AI 히스토리를 별도 버퍼에 유지해 프롬프트 빌더가 참고할 수 있도록 한다. 세션 종료 시에는 폐기.
- **플레이어 히스토리**: 각 플레이어는 자신이 볼 수 있었던 AI 응답(해당 슬롯 노출 제한 포함)과 자신의 입력(유저 응답)을 실시간 히스토리 패널에서 확인할 수 있으며, 세션이 끝나면 이를 모아 ‘배틀 로그’로 저장한다.
- **배틀 로그 구성**: 턴별로 `노출 대상`, `입력자`, `AI 응답`, `선언된 변수`, `결과(승/패/무)`를 기록하고, 난입 횟수·승리 횟수도 메타데이터로 첨부.
- **경고/대역 이벤트 동기화**: 경고·대역 전환이 발생하면 `rank_turns`에 `eventType`·`ownerId`·`strike`·`remaining`·`reason`을 담은 시스템 로그를 기록하고, `realtimePresence.events` 배열을 통해 관전자와 운영 대시보드가 동일한 페이로드를 실시간으로 수신해 UI에 반영한다.
- **BGM/배경 제어**: 마지막에서 세 번째 줄에 특정 캐릭터 이름이 등장하면 전 플레이어의 UI를 반투명 처리하고, 공용 BGM/배경을 해당 캐릭터 테마로 전환(기존 트랙은 중지).

## 7. 운영 고려 사항 및 TODO

- **API 키 관리**: 키 사용량을 턴 단위로 추적해 고갈 시 즉시 알림 → 대역 키 대체 → 로그 기록까지 자동화.
- **관전 UX**: 관전 전환된 플레이어에게 실시간 진행 로그와 채팅만 노출하도록 권한 분리.
- **매칭 연동**: 난입을 위한 대기열 관리, 실시간/비실시간 큐 분리, 패배 역할군 자동 대체 로직을 `rank_matching` 서비스로 확장.
- **UI 개선**: 타이머, 난입 안내, 관전 상태 표시를 메인 뷰 헤더/사이드패널에 통합하고, 반투명 모드 전환 시 접근성(명암비) 점검.
- **테스트 플랜**: 턴 타이머, 조기 종료 투표, 난입 승인, API 고갈, BGM 트리거, 종료 변수 등 핵심 시나리오별 통합 테스트 케이스 작성.

## 8. 구현 계획 (모듈별 분할)

### Phase 0. 준비 작업

- **문서 싱크**: 프롬프트 제작기 스키마 정의(`rank-blueprint-schema`)와 현재 청사진을 비교해 누락된 변수/노드 속성을 식별.
- **인프라 플래그**: 실시간/비실시간, 난입 여부를 제어할 Supabase 테이블 및 환경 변수 플래그 목록을 재점검.

### Phase 1. 세션·타이머 모듈

- `turnTimerService`: 첫 턴 +30초, 난입 턴 +40초, 기본 턴 제한시간을 한 서비스에서 계산하도록 설계.
- `turnVoteController`: 80% 조기 종료 투표 집계, 실시간/관전 상태에 따른 참여자 필터링.
- `autoAdvanceScheduler`: 제한시간 만료 시 다음 노드 호출, 대역 응답 완료 신호 수신 시 즉시 실행 로직 통합.

### Phase 2. 프롬프트 그래프 실행기

- 규칙 블록 자동 주입(주역 캐릭터 선언 문구 포함)과 변수 선언 파서를 `promptCompiler`에 추가.
- 슬롯 트리거/비공개 응답 처리용 `slotBindingResolver` 구현.
- 브리지 조건 평가기(`bridgeEvaluator`)에 난입 상태·역할군 생존 여부·턴 카운터를 확장.

### Phase 3. 모드 전환 레이어

- `realtimeSessionManager`: 실시간 모드 경고 2회→3회 대역 전환, 관전 상태 전환, 난입 승인 큐 연동.
- `asyncSessionManager`: 비실시간 대역 응답용 API 호출 파이프라인, 호스트 키 고갈 시 중단 처리.
- 공통 인터페이스를 정의해 프런트엔드 컴포넌트가 모드별 차이를 최소한의 분기만으로 제어.

### Phase 4. 난입 및 키 관리

- `dropInQueueService`: 역할군별 대기열, 승리 후 계속 참여 로직, 난입 턴 보너스 플래그 제공.
- `apiKeyPool`: 플레이어 개인 키와 운영 대역 키를 통합 관리, 고갈 시 교체 및 로그 남기기.
- 매칭 서비스와 Webhook 이벤트 연동으로 난입 승인 시 세션 상태 갱신.

### Phase 5. 히스토리·로그·오디오

- `historyBuffer`: 세션 중 AI 전용 히스토리, 플레이어 노출 제한이 걸린 응답, 유저 입력을 슬롯별로 보존.
- `battleLogBuilder`: 종료 시 히스토리를 정규화해 베틀로그 레코드에 저장(난입/승리 횟수 메타 포함).
- `bgmController`: 주역 캐릭터 감지(마지막에서 세 번째 줄 이름) 시 BGM/배경 전환 및 UI 반투명 처리.

### Phase 6. UI/UX 통합

- 메인 룸 헤더에 타이머, 난입 보너스, 경고 상태를 통합 표시.
- 관전/대역 상태 뱃지, “다음” 버튼 활성화 조건, 난입 알림 모달 구현.
- 접근성 점검: 반투명 UI 대비 확보, 진동·사운드 알림의 토글 옵션 제공.

### Phase 7. QA 및 모니터링

- 통합 테스트: 타이머, 투표, 난입, BGM 트리거, 종료 변수 등 주요 시나리오 자동화.
- 로깅/알림: 턴 지연, API 고갈, 난입 실패 등 이벤트를 Slack/Webhook으로 전파.
- 운영 대시보드 위젯: 난입 큐 상태, 현재 세션 타이머, 대역 전환 현황 시각화.

## 구현 진행 현황 업데이트

- **진행률**: 100% – 청사진에 정의된 게임 진행/난입/타임라인 기능은 코드·백엔드·문서까지 반영 완료했고, 현재 작업은 안정화와 구조 리팩터링 범주입니다.
- **완료 사항**:
  - `rank_session_timeline_events` 테이블·인덱스·RLS 정책을 정의하고 `/api/rank/log-turn`이 정규화된 타임라인 이벤트를 업서트하도록 수정해 백엔드가 `api_key_pool_replaced`/`drop_in_matching_context` 메타데이터를 영속화합니다.
  - `/api/rank/sessions`가 `timelineLimit` 파라미터와 함께 세션별 `timeline_events` 배열을 반환하며, `useGameRoom`이 개인/공유 히스토리를 타임라인으로 정규화해 관전 및 재생 뷰 모두에서 동일 데이터를 사용할 수 있게 했습니다.
  - `GameRoomView` 메인 탭에 관전 타임라인과 내 세션 타임라인 섹션을 추가하고 `TimelineSection`의 메타 출력에 세션 라벨·시작 시각을 확장해 실시간/재생 UI가 같은 컴포넌트를 공유합니다.
  - 새 타임라인 스키마(`docs/rank-session-timeline-spec.md`)를 문서화해 서비스 롤 함수와 운영 자동화가 동일 포맷으로 이벤트를 발행할 수 있도록 기준을 마련했습니다.
  - Supabase Edge Function(`rank-match-timeline`, `rank-api-key-rotation`)이 매칭·키 교체 메타를 `rank_session_timeline_events`에 업서트하고 Realtime/Slack 경보를 동시에 발행하도록 배포 스크립트를 추가했습니다. (→ `supabase/functions/*`, `docs/rank-edge-function-schema.md`)
  - `scripts/deploy-edge-functions.js` + GitHub Actions 워크플로(`.github/workflows/edge-functions-deploy.yml`)로 Edge Function 변경 감지·재시도·Slack/PagerDuty 경보를 자동화하고, 실패·재시도 메타를 `rank_edge_function_deployments` 테이블에 적재하도록 연결했습니다. (→ `supabase.sql`, `docs/rank-edge-deploy-schema.md`, `docs/environment-variables.md`)
  - Edge Function 배포 워크플로를 스테이징/프로덕션 매트릭스로 분리하고, 비밀 검증 스크립트(`scripts/verify-edge-deploy-config.js`)와 스모크 테스트 실행·실패 시 PagerDuty 알림을 추가했습니다. (→ `.github/workflows/edge-functions-deploy.yml`, `package.json`, `scripts/deploy-edge-functions.js`)
  - `useStartClientEngine` 상단에 모여 있던 프롬프트/타임라인/참여자/쿨다운 포맷터를 `actorContext`, `timelineState`, `participants`, `apiKeyUtils` 모듈로 옮기고, 타임라인 로그 합성을 `buildLogEntriesFromEvents` 헬퍼로 일원화해 엔진 훅의 책임을 세션 상태 조정에 집중시켰습니다.
  - `useStartApiKeyManager`, `useStartSessionLifecycle`, `useHistoryBuffer` 훅을 도입해 API 키 관리·세션 라이프사이클·히스토리 버퍼를 전담 모듈로 분리하고, `useStartClientEngine`은 턴 진행·UI 연계 로직에 집중하도록 정리했습니다.
  - 수동 응답과 쿨다운 책임을 `useStartManualResponse`, `useStartCooldown` 훅으로 분리하고 각 훅의 JSDoc 타입 가이드를 추가해 엔진 서브 모듈의 인터페이스를 명확히 했습니다.
  - `useHistoryBuffer`, `useStartSessionLifecycle`, `useStartApiKeyManager`, `useStartCooldown`, `useStartManualResponse`에 대한 단위 테스트를 작성해 데이터 흐름과 세션 메타 로깅이 기대대로 유지되는지 검증했습니다. (→ `__tests__/components/rank/StartClient/hooks/startHooks.test.js`)
  - 세션 감시 훅 `useStartSessionWatchdog`이 턴 정체를 감시해 자동 무효 처리·타임라인 로깅을 수행하고, jsdom 테스트로 비정상 시나리오와 진행 재개 시 재설정을 검증했습니다.【F:components/rank/StartClient/hooks/useStartSessionWatchdog.js†L1-L149】【F:**tests**/components/rank/StartClient/hooks/startHooks.test.js†L250-L335】
  - 타이머 경고 UI, `battleLogDraft` 캡처, 관전/대역 뱃지 구현과 함께 타깃 테스트를 추가해 청사진의 남은 UX 요구사항을 충족했습니다.【F:components/rank/StartClient/TurnInfoPanel.js†L1-L108】【F:components/rank/StartClient/engine/battleLogBuilder.js†L1-L199】【F:components/rank/StartClient/RosterPanel.js†L1-L206】【F:**tests**/components/rank/StartClient/engine/battleLogBuilder.test.js†L1-L110】【F:**tests**/components/rank/StartClient/TurnInfoPanel.test.js†L1-L58】
- **다음 단계 메모**:
  - Edge Function 스모크 테스트 엔드포인트를 정기적으로 점검해 스테이징/프로덕션 모두에서 커버리지·응답 시간을 모니터링할 지표를 정의하기.
  - 베틀로그 상세/캐릭터 대시보드에 `TimelineSection`을 재사용해 턴 기록과 타임라인 이벤트를 함께 탐색할 수 있는 필터/검색 UI를 설계하기.
  - StartClient 엔진 전반(타이머·투표·난입·쿨다운·수동 응답 포함)의 통합 테스트를 설계해 브라우저/Node 환경 모두에서 회귀를 조기 감지할 수 있도록 자동화 범위를 확장하기.
  - 새 훅 패턴을 `turnTimerService`, `turnVoteController` 등 기존 서비스 레이어에도 적용할 수 있도록 타입 가이드와 모듈 경계를 재정의하고, 스토리북/문서화를 통해 소비자를 정리하기.

## 교차 검증 메모 (2025-10-04)

### 구현으로 확인된 항목

- **턴 타이머/자동 진행**: 첫 턴 +30초와 난입 턴 +40초 보너스가 `turnTimerService`에서 계산되고, 세션 시작 시 자동 실행·시간 만료 자동 진행 루틴이 `StartClient`에 연결돼 있습니다.【F:components/rank/StartClient/services/turnTimerService.js†L1-L86】【F:components/rank/StartClient/index.js†L378-L422】
- **조기 종료 투표**: 실참여자 80% 합의 규칙을 `turnVoteController`가 집계하고, `StartClient`가 합의 임계치를 UI에 반영합니다.【F:components/rank/StartClient/services/turnVoteController.js†L1-L148】【F:components/rank/StartClient/index.js†L448-L459】
- **프롬프트/변수 시스템**: 주역 캐릭터 지시문과 마지막 세 줄 포맷이 시스템 프롬프트에 고정 포함되고, 응답 분석으로 추출한 배우 이름을 배경/BGM 상태에 반영합니다.【F:components/rank/StartClient/engine/systemPrompt.js†L17-L29】【F:lib/promptEngine/outcome.js†L3-L24】【F:components/rank/StartClient/useStartClientEngine.js†L1568-L1612】
- **슬롯 가시성/조건 분기**: 슬롯별 공개 범위가 `slotBindingResolver`에서 정규화되고, 확장된 브리지 평가기가 난입·승수·역할군 조건을 검사해 다음 노드를 선택합니다.【F:components/rank/StartClient/engine/slotBindingResolver.js†L1-L38】【F:lib/promptEngine/bridges.js†L1-L188】
- **모드 전환 계층**: 실시간 경고/대역 전환은 `realtimeSessionManager`, 비실시간 난입 교대는 `asyncSessionManager`와 `dropInQueueService`가 담당하며, 공통 타임라인 이벤트로 통합돼 있습니다.【F:components/rank/StartClient/services/realtimeSessionManager.js†L1-L200】【F:components/rank/StartClient/services/asyncSessionManager.js†L1-L108】【F:components/rank/StartClient/services/dropInQueueService.js†L1-L200】
- **타임라인 파이프라인**: `/api/rank/log-turn`이 타임라인 이벤트를 영속화·브로드캐스트하고, `useGameRoom`과 `TimelineSection`이 관전/개인 타임라인을 같은 포맷으로 렌더링합니다.【F:pages/api/rank/log-turn.js†L20-L271】【F:supabase.sql†L1189-L1221】【F:hooks/useGameRoom.js†L260-L371】【F:components/rank/GameRoomView.js†L2514-L2548】【F:components/rank/Timeline/TimelineSection.js†L1-L200】
- **훅 단위 테스트**: 히스토리·세션·API 키·쿨다운·수동 응답 훅이 jsdom 환경 테스트로 검증돼 있습니다.【F:**tests**/components/rank/StartClient/hooks/startHooks.test.js†L1-L186】
- **타이머 경고 UX**: 턴 타이머가 10초 이하로 떨어지면 `TurnInfoPanel`이 경고 배경·강조 색상과 함께 진동 알림을 발동합니다.【F:components/rank/StartClient/TurnInfoPanel.js†L1-L108】
- **배틀 로그 빌더**: `captureBattleLog`이 세션 종료 시점의 히스토리·타임라인·난입 스냅샷을 `battleLogDraft`로 정규화하며, 드롭인 교체 케이스를 다루는 테스트를 포함했습니다.【F:components/rank/StartClient/engine/battleLogBuilder.js†L1-L199】【F:components/rank/StartClient/useStartClientEngine.js†L720-L829】【F:**tests**/components/rank/StartClient/engine/battleLogBuilder.test.js†L1-L110】
- **관전/대역 뱃지 UI**: `RosterPanel`이 실시간 프레즌스와 난입 큐 스냅샷을 사용해 관전/대역/난입 상태 뱃지를 렌더링합니다.【F:components/rank/StartClient/RosterPanel.js†L1-L206】

### 미완료 또는 추가 작업 필요 항목

- **브라우저 통합 테스트**: 배틀 로그 빌더·타이머 경고에 대한 단위 검증은 추가됐지만, 전체 세션 플로우를 아우르는 브라우저 기반 통합 테스트는 아직 필요합니다.【F:**tests**/components/rank/StartClient/engine/battleLogBuilder.test.js†L1-L110】【F:**tests**/components/rank/StartClient/TurnInfoPanel.test.js†L1-L58】

---

느낀 점: 타이머 임계 경고와 난입/관전 뱃지, 배틀 로그 정규화까지 구현해 보니 청사진상 UX 잔여 과제들이 실제 플레이 흐름과 맞물려 동작하는 모습이 선명해졌습니다.
추가로 필요한 점: 브라우저 통합 테스트와 베틀 로그 영속 계층(저장·재생 UI) 연동을 마련해 새 `battleLogDraft`가 전 구간에서 검증되도록 해야 합니다.
진행사항: 타이머 경고 UX, 배틀 로그 빌더, 관전/대역 뱃지 UI, 관련 단위 테스트를 추가해 교차 검증 메모의 미완료 항목을 처리했습니다.

### 추가 교차 검증 (2025-12-02)

- **배틀 로그 영속화/재생**: `/api/rank/save-battle-log`이 `rank_session_battle_logs`에 드래프트를 저장하고, `useGameRoom`·`GameRoomView`가 개인/공유 리플레이 패널과 JSON 다운로드 버튼을 표면화합니다.【F:pages/api/rank/save-battle-log.js†L1-L109】【F:supabase.sql†L1223-L1263】【F:hooks/useGameRoom.js†L228-L367】【F:components/rank/GameRoomView.js†L2268-L2627】
- **브라우저 통합 러너 준비**: Playwright 설정과 e2e 스켈레톤을 추가해 세션 재생 플로우를 자동화할 토대를 마련했습니다.【F:playwright.config.ts†L1-L18】【F:tests/e2e/battle-log.spec.ts†L1-L8】【F:package.json†L9-L14】

느낀 점: 프론트·백엔드가 동일한 `battleLogDraft` 스키마로 움직이면서 타임라인·리플레이·다운로드가 한 파이프라인으로 묶였다는 확신이 들었습니다.
추가로 필요한 점: Playwright 시나리오에 실제 세션 종료→리플레이 패널 노출→JSON 다운로드까지 이어지는 절차를 녹여 자동화 커버리지를 완성해야 합니다.
진행사항: 배틀 로그 영속화/리플레이 패널·JSON 저장 기능을 연결하고 e2e 러너 구성을 마련해 교차 검증 메모의 공백을 줄였습니다.
