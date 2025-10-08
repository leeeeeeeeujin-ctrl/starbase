# 메인 게임(Start) 구조 개요 (2025-03 재정비)

2025년 3월 기준 `/rank/[id]/start` 화면은 기존의 대형 전투 엔진 대신, 방에서 전달된 슬롯 스냅샷을 검증하고 전투 준비 단계를 시각화하
는 간결한 클라이언트로 재구성되었습니다. 이 문서는 새 흐름이 어떤 구성요소로 이루어졌는지 요약합니다.

## 1. 진입 과정과 스냅샷 로딩
- 라우터는 `/rank/[id]/start` 요청을 받으면 클라이언트 전용 `StartClient`를 렌더링합니다.【F:pages/rank/[id]/start.js†L1-L4】【F:components/rank/StartClient/index.js†L1-L121】
- `StartClient`는 `readMatchFlowState`를 통해 세션 스토리지에 저장된 매칭 스냅샷을 읽어오고, 라우터가 준비되지 않았거나 게임 ID가 없는 경
우에는 즉시 상태를 초기화합니다.【F:components/rank/StartClient/index.js†L19-L92】【F:lib/rank/matchFlow.js†L59-L125】
- 페이지를 벗어나면 `clearMatchFlow`가 호출되어 동일한 브라우저 세션에서 오래된 스냅샷이 남지 않도록 합니다.【F:components/rank/StartClient/index.js†L71-L92】【F:lib/rank/matchFlow.js†L133-L135】

## 2. 화면 레이아웃
- 상단 헤더는 방 모드·참가자 수를 보여주고, 방 세부 정보나 랭크 대기실로 되돌아갈 수 있는 버튼을 제공합니다.【F:components/rank/StartClient/index.js†L98-L121】
- “매치 정보” 섹션은 방 코드, 점수 범위, 실시간 옵션과 같은 핵심 메타데이터를 리스트로 노출합니다.【F:components/rank/StartClient/index.js†L123-L152】
- “참가자” 섹션은 슬롯별 캐릭터 이름과 역할을 나열하고, 준비 완료 여부를 배지로 표시합니다.【F:components/rank/StartClient/index.js†L154-L180】
- 하단의 “전투 준비 단계” 영역은 본게임 엔진이 재도입되기 전까지 안내 문구를 보여 주는 플레이스홀더 역할을 합니다.【F:components/rank/StartClient/index.js†L182-L188】

## 3. 매칭 스냅샷 처리
- `lib/rank/matchFlow`는 방 상세 페이지에서 저장한 매칭 스냅샷을 정규화해 슬롯, 배정 정보, 뷰어 정보, API 키 상태를 한 번에 제공합니다.【F:lib/rank/matchFlow.js†L1-L132】
- 로스터 항목은 정렬·역할·준비 상태를 포함해 UI가 바로 사용할 수 있는 형태로 반환되며, 참가자 수 요약과 함께 메인 게임 준비 화면에서 그대로 재사용됩니다.【F:lib/rank/matchFlow.js†L15-L52】【F:components/rank/StartClient/index.js†L123-L188】

## 4. 향후 확장 포인트
현재 StartClient는 전투 실행 대신 “세션 점검” 역할에 집중하고 있습니다. 이후 단계에서는 다음과 같은 확장을 염두에 두고 있습니다.
- `MatchReadyClient`에서 수집한 배치·API 키 상태를 바탕으로, 실시간 전투 엔진을 다시 도입하고 턴 로그·AI 응답을 재생산할 수 있는 패널을 추가합니다.【F:components/rank/MatchReadyClient.js†L1-L146】【F:lib/rank/matchFlow.js†L1-L132】
- Pulse 실시간 모드나 난입 규칙과 연동해 전투 중 좌석 변화를 반영하고, 로그 패널을 점진적으로 복원합니다.【F:lib/rank/matchFlow.js†L25-L41】【F:components/rank/MatchReadyClient.js†L5-L64】

이 문서에 기술된 구조는 “방 → 매치 준비 → 메인 게임” 흐름을 단순화하기 위한 1단계 재정비입니다. 후속 작업에서는 이 토대를 기반으로
세션 실행 기능을 순차적으로 복원할 예정입니다.
