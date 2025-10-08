# 메인 게임(Start) 구조 개요 (2025-05 업데이트)

2025년 5월 현재 `/rank/[id]/start` 화면은 방에서 전달된 매치 스냅샷을 기반으로 `useStartClientEngine`
을 다시 연결하여 실제 전투 진행을 제어합니다. 이 문서는 새 클라이언트가 어떤 구조로 동작하는지
요약합니다.

## 1. 진입 과정과 세션 초기화
- 라우터는 `/rank/[id]/start` 요청을 받으면 클라이언트 전용 `StartClient`를 렌더링합니다.【F:pages/rank/[id]/start.js†L1-L4】
- `StartClient`는 `readMatchFlowState`로 세션 스토리지에 보관된 매치 스냅샷을 불러오고, 라우터가 준비되지
  않았거나 게임 ID가 없으면 즉시 초기화합니다.【F:components/rank/StartClient/index.js†L49-L77】
- 컴포넌트가 언마운트될 때 `clearMatchFlow`를 호출해 동일 브라우저 세션에 이전 전투 데이터가 남지 않도록
  합니다.【F:components/rank/StartClient/index.js†L60-L77】【F:lib/rank/matchFlow.js†L133-L135】
- `useStartClientEngine`는 스냅샷에서 복구한 `rosterSnapshot`을 이용해 Supabase `rank_match_roster`에서 최신
  세션 참가자를 우선 불러오고, 비어 있을 때만 `rank_participants`를 폴백으로 사용합니다. 덕분에 메인 게임이
  방과 무관한 과거 참가자 목록으로 되돌아가지 않습니다.【F:components/rank/StartClient/useStartClientEngine.js†L1135-L1211】


## 2. 상단 헤더와 상태 배너
- `HeaderControls`는 방/게임 정보, 뒤로 가기, 세션 시작(또는 재시작), 다음 턴 호출 버튼을 노출합니다.
  합의가 필요한 실시간 턴이라면 `consensus` 정보를 사용해 동의 진행 상황을 함께 보여 줍니다.【F:components/rank/StartClient/index.js†L120-L141】
- `StatusBanner`는 세션 오류, API 키 경고, 프롬프트 진단 메시지를 순서대로 출력합니다. 메시지는 중복을 제거해
  중요한 경고만 한눈에 볼 수 있습니다.【F:components/rank/StartClient/index.js†L143-L158】
- 시스템 프롬프트는 항상 마지막 여덟 줄 중 다섯 줄을 공백으로 비우고, 남은 세 줄에 활약 캐릭터·활성 변수·판정을
  순서대로 적도록 강제합니다. 판정/변수/활약 정보가 없으면 “무”를 기입하게 안내합니다.【F:components/rank/StartClient/engine/systemPrompt.js†L17-L32】【F:lib/systemPrompt.js†L6-L15】

## 3. 매치 메타데이터와 블라인드 안내
- `buildSessionMeta`는 방 코드, 매치 모드, 점수 범위, 실시간 옵션, 착석 인원 등을 정리해 리스트로 표시합니다.
  방이 블라인드 모드라면 헤더 설명에 “이제 참가자 정보가 공개된다”는 문구를 추가해 진입 시점을 안내합니다.
  【F:components/rank/StartClient/index.js†L15-L47】【F:components/rank/StartClient/index.js†L80-L118】

## 4. 전투 제어 패널(좌측)
- `TurnInfoPanel`은 현재 턴, 진행 중인 노드, 활성 변수, 턴 타이머, API 키/버전/Gemini 모델 설정을 묶어서 보여 줍니다.
  합의 중이면 “동의 n/m명 확보” 메시지를, API 키 쿨다운이 활성화되면 해당 경고를 함께 띄웁니다.
  【F:components/rank/StartClient/index.js†L160-L195】【F:components/rank/StartClient/TurnInfoPanel.js†L5-L173】

## 5. 수동 응답 패널(우측)
- `ManualResponsePanel`은 AI 호출 대신 사용자가 직접 응답을 입력할 수 있는 영역입니다. 현재 턴 주체가 아니거나
  세션이 시작되지 않은 경우 패널이 잠기며 이유를 명확히 안내합니다. 두 버튼을 통해 수동 응답으로 진행하거나
  AI 호출을 즉시 실행할 수 있습니다.【F:components/rank/StartClient/index.js†L168-L195】【F:components/rank/StartClient/ManualResponsePanel.js†L1-L63】

## 6. 참가자 & 로그 패널
- `RosterPanel`은 엔진이 추적하는 참가자/역할 상태, 실시간 접속 스냅샷, 난입 정보를 표시합니다.【F:components/rank/StartClient/index.js†L197-L204】
- `LogsPanel`은 턴 로그, AI 메모리, 플레이어 히스토리, 실시간 타임라인을 카드 형태로 제공하며 검색·필터·하이라이트 기능을
  지원합니다.【F:components/rank/StartClient/index.js†L206-L212】【F:components/rank/StartClient/LogsPanel.js†L1-L400】

## 7. 매치 스냅샷과 블라인드 플로우 연계
- `lib/rank/matchFlow`는 방 상세 페이지에서 저장한 스냅샷을 정규화해 로스터, 배정 정보, 시청자 정보, 활성 API 키 상태를 반환합니다.
  블라인드 방이라면 `room.blindMode`를 포함해 매치 준비/메인 게임에서 일관되게 참조할 수 있도록 했습니다.
  【F:lib/rank/matchFlow.js†L18-L108】【F:components/rank/MatchReadyClient.js†L1-L146】【F:components/rank/StartClient/index.js†L80-L118】

새 구조는 “방 → 매치 준비 → 메인 게임” 구간이 모두 동일한 매치 스냅샷을 공유하며, 엔진 훅을 통해 턴 진행·로그 축적·
실시간 합의를 한 화면에서 관리합니다. 이후 단계에서는 전투 엔진이 기록한 로그를 서버와 동기화하고, Pulse 난입 흐름과의
연계를 확장하는 작업이 예정돼 있습니다.
