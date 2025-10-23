# 메인 게임 ↔ 방 브리지 관찰 메모 (2025-11-09)

## 1. 방 상세 페이지가 맡는 역할

- `/rooms/[id]` 화면이 매치 준비를 마칠 때 `stageMatch`를 호출하면서 로컬 `matchDataStore`에 참가자, 히어로 선택, 매치 스냅샷, 슬롯 템플릿, 세션 메타까지 일괄로 채워 넣는 구조다.【F:pages/rooms/[id].js†L2865-L3088】
- 동일한 스토어 업데이트가 `asyncFill`·`dropIn` 메타를 즉시 계산해 저장하기 때문에, 메인 게임 진입 전에 난입/대기열 정책이 이미 반영된 상태가 된다.【F:modules/rank/matchDataStore.js†L801-L834】

## 2. Match Ready 단계의 재동기화

- `MatchReadyClient`는 Supabase에서 최신 스냅샷을 다시 끌어와 같은 스토어 키에 덮어쓰기 때문에, 방에서 넘어오는 캐시가 오래됐더라도 준비 단계에서 최신 상태로 교정된다.【F:components/rank/MatchReadyClient.js†L212-L241】
- 이때 세션 히스토리까지 업데이트하면서 진짜 세션 ID·턴 정보를 확보하므로, 메인 게임이 열릴 때 로그/타임라인이 비어 있는 상태로 시작되는 일을 줄인다.【F:components/rank/MatchReadyClient.js†L235-L268】

## 3. 메인 게임 클라이언트가 소비하는 방식

- `StartClient`는 라우터 진입 시 `matchFlow`가 합성한 로컬 스냅샷을 읽고, 스토어 구독으로 방/준비 단계에서 바뀐 값을 계속 반영한다.【F:components/rank/StartClient/index.js†L79-L118】
- `matchFlow` 자체가 auth·키링·슬롯 템플릿·세션 메타를 모두 기본값과 함께 병합하도록 설계돼 있어, 방 단계에서 빠진 필드가 있어도 안정적으로 채워진다.【F:lib/rank/matchFlow.js†L1-L136】

## 4. 느낀 점과 개선 여지

- 방 화면이 매치 데이터 구축, 서버 스테이징, 로컬 스토어 동기화를 모두 책임지는 만큼 로직이 비대해져 있는데, 같은 패턴을 Edge Function(RPC)로 끌어올리면 프런트는 검증된 페이로드만 보관하도록 단순화될 듯하다.【F:pages/rooms/[id].js†L2698-L2811】
- `MatchReadyClient`에서 스냅샷을 강제 덮어쓰는 흐름 덕분에 탭 간 상태 차이가 줄어드는 장점이 있지만, 방 단계에서도 정기적인 재동기화를 한 번 더 거치면 스테이징 실패와 로컬 캐시 불일치를 더 빨리 감지할 수 있을 것 같다.【F:components/rank/MatchReadyClient.js†L212-L241】

## 5. 2025-11-09 갱신 사항

- 방이 정원에 도달하면 15초 제한의 “준비 투표”가 자동으로 열리고, 모든 착석자가 `occupant_ready`를 켜야만 `stageMatch`가 실행되도록 변경했다. 타이머 만료 시에는 경고를 띄우고 방장이 재시작할 수 있는 버튼도 추가해, 세션 동기화 전 합의 과정을 명시적으로 거친다.【F:pages/rooms/[id].js†L2094-L2187】【F:pages/rooms/[id].js†L3325-L3427】
- 매치가 시작돼 상태가 `battle`/`in_progress`로 바뀌면 클라이언트가 방에서 자동 퇴장 처리되는 일을 막기 위해 라우트 전환 전에 정리 타이머를 취소하고, 비호스트 클라이언트도 상태 변화를 감지해 동일한 매치 준비 화면으로 이동하도록 통일했다.【F:pages/rooms/[id].js†L2306-L2331】【F:pages/rooms/[id].js†L3158-L3194】
