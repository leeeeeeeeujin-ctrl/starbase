# 매칭 및 방 모드 구조 초안

이 문서는 솔로·듀오 랭크와 캐주얼(매칭/사설) 모드를 한 화면에서 엮기 위해 필요한
상위 구조를 정리합니다. 지금은 스캐치 단계이지만, 각 모드가 공유하는 큐와 슬롯, 그리고
난입/관전 규칙을 명시해 두면 이후 어댑터 구현과 UI 개발이 수월해집니다.

## 공통 용어
- **큐 그룹(queue group)**: 실제 매칭 풀을 공유하는 모드 묶음입니다. 솔로/듀오 랭크는
  `rank` 그룹으로 묶이고, 캐주얼 매칭과 사설 방은 각각 `casual`, `private`로 구분합니다.
- **모드 키(mode key)**: 프론트엔드와 Supabase가 동일하게 사용하는 식별자입니다.
  현재는 `rank_solo`, `rank_duo`, `casual_match`, `casual_private` 네 가지를 사용합니다.
- **파티 크기(party size)**: 한 큐 엔트리가 동시에 공급하는 슬롯 수입니다. 솔로는 1,
  듀오는 2(향후 3까지 확장), 사설 방은 슬롯에 따라 자유롭게 변합니다.

## 모드별 특징 요약
| 모드 | 큐 그룹 | 기본 파티 | 최대 파티 | 난입 허용 | 관전 허용 | 설명 |
| --- | --- | --- | --- | --- | --- | --- |
| `rank_solo` | rank | 1 | 1 | ✔ (패배 시 동일 역할 대체) | ✖ | 솔로 플레이어가 즉시 랭크 매칭을 돌리며 듀오 큐와 같은 풀을 봅니다. |
| `rank_duo` | rank | 2 | 3 | ✔ | ✖ | 같은 역할군 파티가 방 코드를 공유하거나 직접 합류합니다. |
| `casual_match` | casual | 1 | 4 | ✖ | ✖ | 점수를 사용하지 않는 빠른 매칭입니다. |
| `casual_private` | private | 1 | 12 | ✔ (동의 시 관전자 투입) | ✔ | 모든 활성 슬롯을 직접 채워 시작하는 사설 방입니다. |

## 큐 테이블 요구 사항(`rank_match_queue`)
| 컬럼 | 타입 | 비고 |
| --- | --- | --- |
| `mode` | text | 위 모드 키 값. 솔로/듀오는 둘 다 `rank` 그룹으로 간주됩니다. |
| `party_key` | text | 듀오/파티 그룹 식별자. 솔로 큐는 비워둡니다. |
| `party_size` | int | 기본값 1. 듀오는 2 이상, 사설 방 난입은 상황에 맞게 기록합니다. |
| `joined_at` | timestamptz | 매칭 우선순위 정렬에 사용합니다. |
| `status` | text | `waiting`, `matched`, `cancelled` 등. |

> 아직 `party_size` 컬럼은 존재하지 않으므로, 파티 매칭을 정식으로 붙이기 전에
> 마이그레이션이 필요합니다. 당장은 `party_key`로 그룹을 묶고, 최대 2인 듀오까지만
> 처리하는 구조로 준비되어 있습니다.

## 슬롯과 방 규칙
- 랭크 게임은 **활성화된 역할 슬롯 수**만큼 인원이 모이면 바로 시작할 수 있습니다.
- 듀오 방은 같은 역할군 2~3인으로 제한되며, 다른 역할군은 솔로 큐에서 채워집니다.
- 캐주얼 사설 방은 모든 활성 슬롯을 수동으로 채워야 시작이 가능하며, 난입 옵션이 켜진
  경우 관전자도 참여자 동의 하에 즉시 투입할 수 있습니다.

## 구현 단계 권장 순서
1. `rank_match_queue`에 `party_size` 컬럼 추가 및 기본값 1 설정.
2. Supabase 함수/정책에서 `mode` 컬럼을 새 키로 업데이트.
3. `matchmakingService`가 `matchModes.js` 정의를 읽어 큐를 공유하거나 필터링하도록 확장.
4. 듀오 큐가 솔로 큐와 함께 매칭되도록 `matchRankParticipants`를 파티 크기 가변 구조로 보강.
5. 캐주얼 사설 방 전용 어댑터(슬롯 점유·관전 입장)를 작성.

## 매칭 화면 청사진
아래 섹션은 `/rank/[id]`에서 모드를 선택했을 때 어떤 화면과 상태 흐름이 이어지는지, 현재 코드가 암시하는 의도를 정리한 것입니다.

### 스타트 모달 → 모드별 경로
`GameStartModeModal`에서 모드를 고른 뒤에는 `/rank/[id].js`가 세션 프리셋(`rank.start.*`)을 저장하고 솔로·듀오·캐주얼 매칭/사설 방/전투 실행 화면으로 이동하도록 라우팅합니다.【F:starbase/ai-roomchat/pages/rank/[id].js†L174-L215】 각 경로는 전용 페이지와 클라이언트를 갖추어 진입과 동시에 자동 참가 시퀀스를 시작합니다.

### 로비 → 게임 선택 → 매칭 페이지 연결 상태
1. **로비에서 게임 선택**: `/lobby`는 `GameSearchPanel`과 `useGameBrowser`를 통해 게임을 고른 뒤 `handleEnterGame`으로 `/rank/[id]`로 이동합니다.【F:starbase/ai-roomchat/pages/lobby.js†L40-L143】
2. **메인 룸에서 시작 선택**: `/rank/[id]`는 `GameRoomView`가 `onStart`를 호출하면 `GameStartModeModal`을 열고, 사용자가 API 키와 모드를 확정하면 위에서 저장한 프리셋을 기반으로 모드별 경로(`/solo`, `/duo`, `/casual`, `/casual-private`, `/start`)로 라우팅합니다.【F:starbase/ai-roomchat/pages/rank/[id].js†L167-L215】
3. **솔로 랭크**: `/rank/[id]/solo`는 `useGameRoom`으로 접근 권한을 다시 확인한 뒤 `SoloMatchClient`를 렌더링합니다. 클라이언트는 “비슷한 점수대의 참가자들이 역할별로 매칭될 때까지 잠시만 기다려 주세요.” 문구와 함께 자동 대기열 합류를 수행합니다.【F:starbase/ai-roomchat/pages/rank/[id]/solo.js†L1-L55】【F:starbase/ai-roomchat/components/rank/SoloMatchClient.js†L3-L12】
4. **듀오 랭크**: `/rank/[id]/duo`는 듀오 방을 구성하고, 호스트가 시작을 누르면 세션 프리셋을 `rank_duo`로 고정한 뒤 `/rank/[id]/duo/queue`로 이동해 `DuoMatchClient`를 통해 같은 랭크 큐에 자동 합류시킵니다.【F:starbase/ai-roomchat/pages/rank/[id]/duo.js†L55-L116】【F:starbase/ai-roomchat/pages/rank/[id]/duo/queue.js†L1-L60】【F:starbase/ai-roomchat/components/rank/DuoMatchClient.js†L1-L17】
5. **캐주얼 매칭/사설 방**: 캐주얼 모드는 `casualOption` 값에 따라 `/rank/[id]/casual`(매칭) 또는 `/rank/[id]/casual-private`(사설)로 이동합니다. 매칭 페이지는 `CasualMatchClient`로 자동 큐를 돌리고, 사설 방은 슬롯 채우기 후 `/rank/[id]/start?mode=casual_private`로 연결됩니다.【F:starbase/ai-roomchat/pages/rank/[id]/casual.js†L1-L55】【F:starbase/ai-roomchat/components/rank/CasualMatchClient.js†L3-L12】【F:starbase/ai-roomchat/pages/rank/[id]/casual-private.js†L1-L96】

### 솔로 랭크 매칭 흐름
- `/rank/[id]/solo` 페이지는 `useGameRoom`으로 게임 유효성을 검증한 뒤 `SoloMatchClient`를 호출해 랭크 솔로 큐에 자동 합류합니다.【F:starbase/ai-roomchat/pages/rank/[id]/solo.js†L1-L55】【F:starbase/ai-roomchat/components/rank/SoloMatchClient.js†L3-L12】
- `MatchQueueClient`는 진입 즉시 `useMatchQueue` 훅을 활성화하고, 잠금된 역할 또는 첫 번째 역할 정보를 사용해 자동 참가를 시도합니다. 대기열 상태, 타이머 투표, 매치 확정 시 전투 화면으로 이동하는 로직이 한 곳에 모여 있습니다.【F:starbase/ai-roomchat/components/rank/MatchQueueClient.js†L154-L355】
- `useMatchQueue`는 Supabase에서 사용자·역할 정보를 읽어오고, `/api/rank/match`를 주기적으로 호출해 매치 배정과 히어로 메타를 동기화합니다. 참가/취소 시에는 `enqueueParticipant`, `removeQueueEntry` 등 서비스 계층을 통해 큐 테이블을 직접 조작하도록 의도돼 있습니다.【F:starbase/ai-roomchat/components/rank/hooks/useMatchQueue.js†L1-L355】

### 듀오 랭크 팀 편성 흐름
- 듀오 모드 진입 시에는 `DuoRoomClient`가 로컬 세션 스토리지(`duoRooms:*`)에 저장된 파티 목록을 불러오고, 선택한 역할에 맞춘 방을 만들거나 참여하도록 합니다.【F:starbase/ai-roomchat/components/rank/DuoRoomClient.js†L6-L120】【F:starbase/ai-roomchat/components/rank/DuoRoomClient.js†L200-L382】
- 각 방은 2~3인 정원을 가지며(역할 정원 기반), 호스트만 시작 버튼을 눌러 `onLaunch` 콜백을 호출할 수 있습니다. 모든 멤버가 `ready` 상태여야 출발하며, 출발 시 방은 세션 스토리지에서 제거돼 큐와의 중복을 피합니다.【F:starbase/ai-roomchat/components/rank/DuoRoomClient.js†L221-L382】
- 호스트가 출발을 누르면 `/rank/[id]/duo` 페이지가 `rank.start.mode`와 `rank.start.duoOption`을 `rank_duo`로 갱신하고 듀오 큐 페이지(`/rank/[id]/duo/queue`)로 이동시킵니다. 큐 페이지는 `DuoMatchClient`를 통해 같은 랭크 큐 그룹으로 자동 합류합니다.【F:starbase/ai-roomchat/pages/rank/[id]/duo.js†L55-L116】【F:starbase/ai-roomchat/pages/rank/[id]/duo/queue.js†L1-L60】【F:starbase/ai-roomchat/components/rank/DuoMatchClient.js†L1-L17】
- 듀오 방은 결국 솔로와 동일한 랭크 큐 그룹으로 흘러가도록 `MATCH_MODE_CONFIGS`가 queueModes를 공유하고 있어, 듀오 파티가 만들어지면 곧바로 동일한 매칭 풀로 이어붙일 수 있게 설계돼 있습니다.【F:starbase/ai-roomchat/lib/rank/matchModes.js†L29-L56】

### 캐주얼 매칭 흐름
- 캐주얼 매칭 페이지(`/rank/[id]/casual`)는 `useGameRoom`으로 게임 존재 여부를 확인한 뒤 `CasualMatchClient`(`MatchQueueClient`의 `casual_match` 프리셋)를 렌더링합니다.【F:starbase/ai-roomchat/pages/rank/[id]/casual.js†L1-L55】【F:starbase/ai-roomchat/components/rank/CasualMatchClient.js†L3-L12】
- 매칭 설정은 `MATCH_MODE_CONFIGS`에서 별도의 큐 그룹(`casual`)과 파티 사이즈(최대 4인)를 갖도록 정의돼 있어, 솔로/듀오 랭크와 격리된 풀에서 빠르게 큐를 돌리는 것이 기본 의도입니다.【F:starbase/ai-roomchat/lib/rank/matchModes.js†L59-L70】

### 캐주얼 사설 방 흐름
- `/rank/[id]/casual-private`는 이미 구현된 페이지로, `CasualPrivateClient`가 역할 슬롯 템플릿을 기반으로 세션 스토리지에 사설 방을 구성합니다.【F:starbase/ai-roomchat/pages/rank/[id]/casual-private.js†L1-L62】【F:starbase/ai-roomchat/components/rank/CasualPrivateClient.js†L234-L420】
- 호스트는 슬롯별로 참가자를 배치하고 준비 상태를 확인한 뒤, 모든 슬롯이 `ready`면 `onLaunch`를 통해 `/rank/[id]/start?mode=casual_private`로 이동합니다. 이동 시 방 데이터는 세션에서 지워져 재입장을 방지합니다.【F:starbase/ai-roomchat/pages/rank/[id]/casual-private.js†L63-L96】【F:starbase/ai-roomchat/components/rank/CasualPrivateClient.js†L293-L410】

### 큐 설계에 드러난 의도
`MATCH_MODE_CONFIGS`는 각 모드가 어떤 큐 그룹을 공유하는지, 기본·최대 파티 크기, 관전자 허용 여부 등을 한눈에 정리하고 있어 프론트/백엔드가 동일한 룰셋을 참조할 수 있게 합니다.【F:starbase/ai-roomchat/lib/rank/matchModes.js†L29-L85】 솔로·듀오 랭크가 같은 큐 모드 배열을 공유하고, 캐주얼 매칭/사설 방이 각각 별도 그룹으로 분리된 점에서 “같은 풀에서 역할 슬롯을 채우되 입장 방식만 다르다”는 청사진을 확인할 수 있습니다.

## 참조
- `lib/rank/matchModes.js`: 위 표를 코드로 직렬화한 설정 모듈입니다.
- `lib/rank/matchmakingService.js`: 큐를 조회하고 매칭 헬퍼를 호출하는 서비스.

이 문서는 앞으로 구현하면서 계속 갱신할 예정입니다.
