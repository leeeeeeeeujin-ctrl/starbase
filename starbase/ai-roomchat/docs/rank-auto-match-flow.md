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

## 3. 매칭 확정 후 매치 준비 화면으로 이동
- 상태가 `matched`가 되면 `AutoMatchProgress`는 매치 배정, 점수 윈도우, 턴 타이머 정보를 정규화해 저장한 뒤 `/rank/[id]/match-ready`로 리디렉션합니다. 저장된 매치 정보는 이후 단계에서 재사용됩니다.【F:components/rank/AutoMatchProgress.js†L177-L243】
- `MatchQueueClient` 경로에서도 자동 시작 카운트다운 또는 즉시 시작 플래그(`autoStart`)를 통해 `/rank/[id]/start` 페이지로 이동시킵니다.【F:components/rank/MatchQueueClient.js†L1044-L1118】
- 드롭인 매치처럼 룸 합류가 확정되면 5초 카운트다운 후 자동으로 메인 룸(`/rank/[id]`)으로 돌려보내는 안전 장치도 내장되어 있습니다.【F:components/rank/MatchQueueClient.js†L1120-L1179】

## 4. 매치 준비 화면에서 본게임 진입
- `MatchReadyClient`는 저장된 매치 서명을 읽어 재확인하고, 세션 토큰으로 `/api/rank/start-session`과 `/api/rank/play`를 호출합니다. 호출이 성공하면 큐 정리를 수행하고 `/rank/[id]/start`로 이동합니다.【F:components/rank/MatchReadyClient.js†L326-L417】
- `/rank/[id]/start` 페이지는 서버 사이드 렌더링 없이 `StartClient`를 로드해 실제 전투 UI를 표시합니다.【F:pages/rank/[id]/start.js†L1-L4】

## 5. 실패 및 예외 처리
- 캐릭터가 비어 있거나 1분 안에 매칭이 성사되지 않는 경우 자동으로 메인 룸으로 복귀시키는 타이머가 있어 사용자가 수동으로 이동하지 않아도 됩니다.【F:components/rank/AutoMatchProgress.js†L698-L716】【F:components/rank/AutoMatchProgress.js†L720-L747】
- `MatchReadyClient`에서 확인/전투 실행이 실패하면 큐와 저장 정보를 정리한 뒤 매칭 페이지나 메인 룸으로 되돌아가 재시도 경로를 열어둡니다.【F:components/rank/MatchReadyClient.js†L200-L452】

이 흐름을 통해 매칭 페이지에 진입하면 사용자가 별도 버튼을 누르지 않아도 자동으로 매칭을 반복 시도하고,
매칭이 확정되면 본게임 화면으로 자연스럽게 전환되는 전체 로직을 확인할 수 있습니다.
