# 매칭 및 방 모드 구조 초안

이 문서는 통합 랭크와 캐주얼(매칭/사설) 모드를 한 화면에서 엮기 위해 필요한 상위
구조를 정리합니다. 지금은 스케치 단계이지만, 각 모드가 공유하는 큐와 슬롯, 그리고
난입/관전 규칙을 명시해 두면 이후 어댑터 구현과 UI 개발이 수월해집니다.

## 공통 용어

- **큐 그룹(queue group)**: 실제 매칭 풀을 공유하는 모드 묶음입니다. 랭크는 `rank`
  그룹으로 묶이고, 캐주얼 매칭과 사설 방은 각각 `casual`, `private`로 구분합니다.
- **모드 키(mode key)**: 프론트엔드와 Supabase가 동일하게 사용하는 식별자입니다.
  현재는 `rank`, `casual_match`, `casual_private` 세 가지를 사용합니다.
- **파티 크기(party size)**: 한 큐 엔트리가 동시에 공급하는 슬롯 수입니다. 랭크는
  역할군 방을 기준으로 1~3인 파티를 지원하며, 사설 방은 슬롯에 따라 자유롭게 변합니다.

## 모드별 특징 요약

| 모드             | 큐 그룹 | 기본 파티 | 최대 파티 | 난입 허용                   | 관전 허용 | 설명                                                 |
| ---------------- | ------- | --------- | --------- | --------------------------- | --------- | ---------------------------------------------------- |
| `rank`           | rank    | 1         | 3         | ✔ (패배 시 동일 역할 대체) | ✖        | 역할군 방을 만들거나 솔로 참가로 빈 슬롯을 채웁니다. |
| `casual_match`   | casual  | 1         | 4         | ✖                          | ✖        | 점수를 사용하지 않는 빠른 매칭입니다.                |
| `casual_private` | private | 1         | 12        | ✔ (동의 시 관전자 투입)    | ✔        | 모든 활성 슬롯을 직접 채워 시작하는 사설 방입니다.   |

## 큐 테이블 요구 사항(`rank_match_queue`)

| 컬럼         | 타입        | 비고                                                                  |
| ------------ | ----------- | --------------------------------------------------------------------- |
| `mode`       | text        | 위 모드 키 값. 랭크/캐주얼/사설 구분에 따라 저장합니다.               |
| `party_key`  | text        | 랭크 파티 그룹 식별자. 솔로 참가자는 비워둡니다.                      |
| `party_size` | int         | 기본값 1. 랭크 파티는 3인까지, 사설 방 난입은 상황에 맞게 기록합니다. |
| `joined_at`  | timestamptz | 매칭 우선순위 정렬에 사용합니다.                                      |
| `status`     | text        | `waiting`, `matched`, `cancelled` 등.                                 |

> 아직 `party_size` 컬럼은 존재하지 않으므로, 파티 매칭을 정식으로 붙이기 전에
> 마이그레이션이 필요합니다. 당장은 `party_key`로 그룹을 묶고, 역할군별 파티를 최대
> 3인까지 지원하는 구조로 준비되어 있습니다.

## 슬롯과 방 규칙

- 랭크 게임은 **활성화된 역할 슬롯 수**만큼 인원이 모이면 바로 시작할 수 있습니다.
- 랭크 방은 같은 역할군 1~3인으로 구성되며, 다른 역할군은 남은 슬롯에 솔로 참가자로
  채워집니다.
- 캐주얼 사설 방은 모든 활성 슬롯을 수동으로 채워야 시작이 가능하며, 난입 옵션이 켜진
  경우 관전자도 참여자 동의 하에 즉시 투입할 수 있습니다.

## 구현 단계 권장 순서

1. `rank_match_queue`에 `party_size` 컬럼 추가 및 기본값 1 설정.
2. Supabase 함수/정책에서 `mode` 컬럼을 새 키로 업데이트.
3. `matchmakingService`가 `matchModes.js` 정의를 읽어 큐를 공유하거나 필터링하도록 확장.
4. 랭크 큐가 역할군 파티와 솔로 참가자를 함께 조합하도록 `matchRankParticipants`를
   파티 크기 가변 구조로 보강.
5. 캐주얼 사설 방 전용 어댑터(슬롯 점유·관전 입장)를 작성.

## 참조

- `lib/rank/matchModes.js`: 위 표를 코드로 직렬화한 설정 모듈입니다.
- `lib/rank/matchmakingService.js`: 큐를 조회하고 매칭 헬퍼를 호출하는 서비스.

이 문서는 앞으로 구현하면서 계속 갱신할 예정입니다.

## 2025-09-30 구현 메모

> ※ 아래 2025-09-30/10-14 메모는 솔로·듀오가 분리돼 있던 시점을 다루며, 현재 통합
> 랭크 구조에서는 흐름이 간소화되었습니다.

- `/rank/[id]/solo`, `/rank/[id]/casual`, `/rank/[id]/duo/queue` 페이지는 `AutoMatchProgress` 오버레이로 진입 즉시 큐에 합류하고, 매칭이 성사되면 10초 확인 카운트다운과 함께 참가자 전원이 “전투 시작하기” 버튼을 눌렀을 때 전투 화면으로 이동합니다.
- `/rank/[id]/duo`는 `DuoRoomClient`로 듀오 방 편성 UI를 제공하며, 준비가 끝나면 위 큐 페이지로 이동합니다.
- 메인 룸에서는 더 이상 “게임 시작” 버튼을 노출하지 않고, 역할/캐릭터가 준비된 순간 자동으로 모드 선택 모달이 열려 솔로·듀오·캐주얼 경로를 고를 수 있습니다. 필요 시 “모드 선택 열기” 버튼으로 동일 모달을 다시 띄울 수 있습니다.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L326-L911】【F:starbase/ai-roomchat/pages/rank/[id].js†L1-L446】

## 2025-10-14 구현 메모

- 솔로·듀오·캐주얼 매칭 페이지는 라우터 진입 시 즉시 `AutoMatchProgress`를 마운트하고, 이전에 남아 있던 수동 “대기열 참가” 버튼을 렌더링하지 않습니다. 페이지가 로드될 때 뷰어·역할·히어로 토큰이 모두 준비될 때까지 대기한 후 자동 참가를 시도하므로 수동 버튼이 다시 보이는 문제를 방지합니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L420】【F:starbase/ai-roomchat/components/rank/hooks/useMatchQueue.js†L1-L210】
- 듀오 경로는 `DuoMatchClient`를 통해 동일한 자동 참가 루틴을 사용하지만, 파티 편성이 끝날 때까지 `DuoRoomClient`에서 참가자 구성을 완료하도록 대기합니다. 이후 자동으로 `/duo/queue` 페이지로 전환해 두 명 모두 동일 큐 진입 시나리오를 공유합니다.【F:starbase/ai-roomchat/components/rank/DuoMatchClient.js†L1-L80】【F:starbase/ai-roomchat/pages/rank/[id]/duo/index.js†L1-L160】
- `AutoMatchProgress`는 매칭 확정 전에 대기열 타이머와 확인 카운트다운을 관리하고, 조건을 충족하지 못했을 때(예: 히어로 미지정, 확인 미응답) 자동으로 메인 룸으로 되돌리거나 재시도하도록 큐 서명을 초기화합니다. 이 동작은 멀티 모드 페이지에서 모두 동일하게 유지됩니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L420】
- 매칭이 확정되고 확인 버튼을 누르면 `AutoMatchProgress`가 곧바로 `/api/rank/play`를 호출해 듀오·캐주얼 모드도 솔로와 동일한 서버 전투 파이프라인을 사용합니다. 호출 결과는 오버레이 메타 영역에 노출돼 플레이어가 바로 승패를 확인할 수 있습니다.【F:components/rank/AutoMatchProgress.js†L333-L432】【F:components/rank/AutoMatchProgress.js†L747-L812】

## 2025-10-16 구현 메모

- 솔로와 듀오 큐는 이제 동일한 **공유 방(room)** 구조를 사용합니다. `matchRankParticipants`가 파티 유무와 관계없이 역할별 그룹을 묶어 역할별 ±200 점수 윈도우 안에서 방을 만들고, 빈 슬롯이 남으면 `rooms[].missingSlots`로 표시해 대기 상태를 반환합니다. 동일 역할군 내 점수 편차만 검사하도록 파티 anchor가 역할별로 분리되었습니다.【F:starbase/ai-roomchat/lib/rank/matching.js†L51-L238】
- `runMatching`의 응답에는 `rooms` 필드가 추가되어 운영자가 역할별 충원 상황을 빠르게 파악할 수 있습니다. 준비가 끝난 방은 `ready: true`, 부족한 방은 `missingSlots`가 0보다 큰 상태로 돌아옵니다.【F:starbase/ai-roomchat/lib/rank/matching.js†L24-L111】【F:starbase/ai-roomchat/lib/rank/matchmakingService.js†L640-L646】
- 듀오 파티는 동일 역할 내에서만 그룹화되며, 초대 인원이 점수 윈도우 밖에 있으면 자동으로 다음 윈도우가 열릴 때까지 대기합니다.【F:starbase/ai-roomchat/lib/rank/matching.js†L120-L206】

### 큐 충원 규칙

- 게임 설정에서 **실시간 매칭**이 꺼져 있으면 `rank_participants` 참여자 풀을 랜덤으로 섞어 빈 슬롯을 채웁니다.
- 실시간 모드는 큐에 실제로 합류한 참가자만 대상으로 매칭하며, 중복 선발을 막기 위해 큐 소유자와 참여자 풀을 분리합니다.

### 난입(brawl) 처리

- `rank_games.rules.brawl_rule = 'allow-brawl'`인 경우 `/api/rank/match`가 패배로 비워진 역할군을 다시 채우기 위해 **난입 전용 매칭**을 우선 실행합니다.【F:starbase/ai-roomchat/pages/api/rank/match.js†L17-L142】
- 역할군별 패배/생존 카운트는 `loadRoleStatusCounts`로 수집하며, 빈 슬롯이 모두 채워질 수 있을 때만 난입 매칭을 확정합니다.【F:starbase/ai-roomchat/lib/rank/matchmakingService.js†L88-L129】
- 난입 매칭이 성사되면 API 응답의 `matchType`이 `brawl`로 설정되고, 대체 인원/역할 메타데이터가 함께 반환됩니다. 오버레이는 매치 코드와 난입 대상 역할, 점수 범위까지 즉시 표시해 참가자가 상황을 파악할 수 있도록 했습니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L420】

### 자동 참가 관찰 포인트

- 오버레이는 진입 즉시 큐 합류를 시도하며, 로그인/역할/캐릭터가 준비되지 않았을 때는 안내 문구를 띄우고 조건을 충족하면 자동으로 재시도합니다.
- 캐릭터가 비어 있는 경우 3초 뒤 메인 룸으로 되돌리고, 1분 안에 매칭이 성사되지 않으면 대기열을 취소한 뒤 재진입을 유도합니다.
- 매칭이 확정되면 "매칭이 잡혔습니다~" 메시지와 함께 10초 확인 카운트다운을 노출하고, 참가자가 버튼을 누르면 약 1초 후 전투 화면(`/rank/[id]/start`)으로 이동합니다. 동시에 역할별 선발 명단과 매치 메타(난입 여부, 점수 범위, 매치 코드)를 보여줘 합류 직후에도 누가 함께 들어오는지 빠르게 확인할 수 있습니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L420】
