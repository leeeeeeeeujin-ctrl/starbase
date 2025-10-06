# Rank 자동 매칭 플로우 개요

이 문서는 `/rank/[id]` 이하 매칭 관련 페이지를 방문했을 때 자동으로 대기열을 시도하고,
매칭이 확정되면 본게임(`start`) 화면으로 이동시키는 흐름을 요약합니다.

## 1. 진입 지점 – 매칭 페이지 로드와 자동 컴포넌트 연결
- 솔로 매칭 경로(`/rank/[id]/solo`, `/rank/[id]/solo-match`)는 `SoloMatchClient`를 통해 즉시 `AutoMatchProgress`를 마운트합니다. 이때 현재 방과 사용자의 기본 영웅을 읽어 초기 상태를 구성합니다.【F:pages/rank/[id]/solo-match.js†L1-L49】【F:components/rank/SoloMatchClient.js†L1-L11】
- 매칭이 시작되면 `/rank/[id]/match` 페이지에서 `MatchQueueClient`가 동일한 자동 참여 로직을 공유하도록 `autoJoin`/`autoStart` 플래그로 초기화됩니다.【F:pages/rank/[id]/match.js†L1-L55】

## 2. 자동 대기열 참가 및 재시도
- `AutoMatchProgress`는 매칭 상태가 `idle`로 되돌아오면 이전 자동 참가 서명을 초기화해 재시도가 가능하도록 만듭니다.【F:components/rank/AutoMatchProgress.js†L156-L175】
- 차단 요인이 없을 때 `useEffect` 훅이 `actions.joinQueue(roleName)`을 호출해 자동으로 대기열에 참가합니다. 실패 시 1.5초 후 서명을 비워 다음 시도를 준비해 여러 번 재시도할 수 있습니다.【F:components/rank/AutoMatchProgress.js†L644-L686】
- 동일한 자동 참가 패턴은 수동 매칭 콘솔에서도 유지되어, 캐릭터와 역할이 준비되면 큐에 합류하고 실패 시 재시도 대기 타이머를 설정합니다.【F:components/rank/MatchQueueClient.js†L767-L845】

## 3. 매칭 확정 후 오버레이에서 확인
- 상태가 `matched`가 되면 `AutoMatchProgress`는 매치 배정, 점수 윈도우, 턴 타이머 정보를 정규화해 저장하고, 해당 매치 연결 정보를 등록해 이후 단계에서 재사용합니다.【F:components/rank/AutoMatchProgress.js†L187-L247】
- 동일한 컴포넌트가 즉시 10초 카운트다운이 표시된 오버레이를 띄워 역할별 참가자 프로파일을 보여줍니다. 플레이어가 "게임 시작" 버튼을 누르면 본게임 전환이 준비되고, 시간을 초과하면 매칭이 취소되어 메인 룸으로 복귀합니다.【F:components/rank/AutoMatchProgress.js†L870-L939】【F:components/rank/AutoMatchProgress.js†L1231-L1408】
- `MatchQueueClient` 경로에서도 자동 참가 흐름은 유지되지만, 최종 시작은 동일한 오버레이 확인을 거쳐 진행되도록 `AutoMatchProgress`가 담당합니다.【F:components/rank/MatchQueueClient.js†L1044-L1118】

## 4. 오버레이에서 확정 후 본게임 진입
- "게임 시작"을 누르면 `AutoMatchProgress`가 저장된 매치 메타데이터와 함께 `/api/rank/start-session`, `/api/rank/play`를 호출해 세션을 준비하고 큐를 정리합니다.【F:components/rank/AutoMatchProgress.js†L560-L707】
- 호출이 성공하면 확인 상태가 `confirmed`로 전환되며, 짧은 지연 후 `/rank/[id]/start`로 이동해 본게임 클라이언트를 띄웁니다.【F:components/rank/AutoMatchProgress.js†L707-L736】
- `/rank/[id]/start` 페이지는 서버 사이드 렌더링 없이 `StartClient`를 로드해 실제 전투 UI를 표시합니다.【F:pages/rank/[id]/start.js†L1-L4】

## 5. 실패 및 예외 처리
- 캐릭터가 비어 있거나 1분 안에 매칭이 성사되지 않는 경우 자동으로 메인 룸으로 복귀시키는 타이머가 있어 사용자가 수동으로 이동하지 않아도 됩니다.【F:components/rank/AutoMatchProgress.js†L698-L716】【F:components/rank/AutoMatchProgress.js†L720-L747】
- `MatchReadyClient`에서 확인/전투 실행이 실패하면 큐와 저장 정보를 정리한 뒤 매칭 페이지나 메인 룸으로 되돌아가 재시도 경로를 열어둡니다.【F:components/rank/MatchReadyClient.js†L200-L452】

이 흐름을 통해 매칭 페이지에 진입하면 사용자가 별도 버튼을 누르지 않아도 자동으로 매칭을 반복 시도하고,
매칭이 확정되면 본게임 화면으로 자연스럽게 전환되는 전체 로직을 확인할 수 있습니다.
