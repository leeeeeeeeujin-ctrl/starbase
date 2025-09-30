# 랭크 게임 메인룸 → 전투 진행 로직 설계안

## 1. 현재 흐름 요약
- **페이지 진입**: `/rank/[id].js`가 `useGameRoom` 훅으로 게임, 참가자, 최근 전투를 불러와 `GameRoomView`에 전달한다. `onStart` 이벤트는 `/rank/[id]/start` 경로로 라우팅만 하고 실제 매칭은 수행하지 않는다.【F:starbase/ai-roomchat/pages/rank/[id].js†L1-L76】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L1-L213】
- **게임 시작 화면**: `/rank/[id]/start`는 `StartClient`를 불러와 로컬 상태로 프롬프트 그래프를 돌리고 AI 호출을 수동으로 시도할 수 있게 한다. 현재는 참가자/슬롯 검증, 결과 반영, Supabase 기록이 연결돼 있지 않다.【F:starbase/ai-roomchat/pages/rank/[id]/start.js†L1-L4】【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L1-L200】
- **서버 API**: `/api/rank/play` 엔드포인트는 `rank_participants`에서 상대를 뽑아 프롬프트를 만들고 OpenAI 호출 후 `recordBattle`로 `rank_battles`·`rank_battle_logs`를 적재하도록 설계돼 있다. 다만 슬롯 충족/상태 업데이트/반환 데이터는 MVP 수준이다.【F:starbase/ai-roomchat/pages/api/rank/play.js†L1-L74】【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L33】

## 2. 주요 데이터 포인트
- **참가·슬롯 정보**: `rank_game_roles`로 역할별 정원을, `rank_game_slots`로 실제 슬롯 인덱스/활성 여부를 추적해야 한다.【F:starbase/ai-roomchat/lib/rank/roles.js†L1-L16】
- **참가자 상태**: `rank_participants`가 `role`, `hero_id`, `status`, `rating`, `hero_ids` 등을 보관한다. 매칭 시 이 정보를 조합해 역할별 파티를 구성한다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L8-L118】
- **프롬프트 그래프**: `loadGameBundle`이 `prompt_slots`·`prompt_bridges`를 묶어 노드/엣지 그래프를 만든다. 전투 중 AI 대화 히스토리는 `createAiHistory`에만 남고 Supabase 동기화는 비어 있다.【F:starbase/ai-roomchat/components/rank/StartClient/engine/loadGameBundle.js†L1-L78】

## 3. 미비 구간 진단
1. **클라이언트 매칭 진입**
   - `joinGame`은 슬롯 점유를 기록하지 않아 다수 참가자가 같은 슬롯을 공유할 수 있다.
   - `canStart`는 단순히 참가자 수만 세므로 실제 활성 슬롯 충족과 무관하다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L120-L213】
2. **전투 실행 파이프라인**
   - 메인룸의 시작 버튼은 단순 라우팅만 수행하고 `/api/rank/play`를 호출하지 않는다.
   - `StartClient`는 사용자 API 키를 요구하는 실험용 도구 수준으로, 정식 매칭 로직(슬롯 충족 → 상대 매칭 → AI 호출 → 결과 저장)을 UI와 연결하지 못한다.【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L37-L162】
3. **결과 반영/히스토리**
   - `recordBattle`가 `rank_battle_logs`에 `game_id`를 넣지 않아 스키마 요구사항을 충족하지 못한다.【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L33】
   - 참가자 점수/전적 업데이트가 MVP 수준(누적 점수만 증가)이라 랭킹 반영, 탈락 처리, 난입 규칙 등이 구현되지 않았다.

## 4. 구현 방향 제안
### 4.1 매칭 사전 조건 강화
- `useGameRoom`에서 `rank_game_roles`·`rank_game_slots`를 함께 로딩해 역할별 최소 인원과 비어 있는 슬롯 수를 계산한다.
- `joinGame` 시 선택한 역할의 남은 슬롯을 확인하고, 성공하면 해당 `rank_game_slots` 행에 `hero_id`, `owner_id`를 기록하도록 `supabase.from('rank_game_slots')` 업데이트를 추가한다.
- `canStart` 계산식은 활성 슬롯 수와 실제 참가자 점유를 비교해 모든 역할 조건이 충족될 때만 `true`로 만든다.

### 4.2 매칭 트리거 → 서버 실행
- 메인룸에서 `onStart`는 `/api/rank/play`를 직접 호출하도록 변경하고, 성공 시 전투 결과를 토스트/모달로 보여주거나 새 전투 로그 섹션에 반영한다.
- API 호출 페이로드에는 `selectedRole`, `heroIds`(역할 슬롯별 히어로 배열), `useRealtime` 등 클라이언트 상태를 명시한다. 필요 시 서버에서 `rank_game_role_slots`를 기반으로 자동 정렬한다.
- **상태 매핑 위임**: 승리/패배/탈락 등 상태 문자열은 프롬프트 제작기의 두 번째 변수 탭에서 최종 라벨로 매핑하도록 두고, 클라이언트에서는 상태 코드만 전달해 중복 로직을 피한다.
- `/api/rank/play`는 다음을 보장하도록 확장한다:
  1. 선택된 `heroIds`가 `rank_game_slots` 점유 정보와 일치하는지 검증.
  2. 점수 매칭: 요청자의 점수 ±100 범위에서 상대 후보(`getOpponentCandidates`)를 가져오되 부족하면 범위를 200, 300으로 넓힌다.
  3. 난입 허용 규칙(brawl): 경기 중 탈락자가 있으면 동일 역할 대기열에서 즉시 대체하는 로직을 위한 대기열/상태 플래그 반환.
  4. 결과 저장: `recordBattle` 확장으로 `rank_battle_logs`, `rank_participants`의 `score`, `rating`, `battles`, `status`를 모두 갱신하고, 탈락 시 `status='out'` 처리.

### 4.3 전투 기록/히스토리 정착
- `recordBattle`에 `game_id` 컬럼과 턴 로그(요약·AI 응답)을 다중 행으로 저장할 수 있도록 확장한다.
- `useGameRoom`의 `refreshBattles`를 승패 결과/점수 변화까지 보여주도록 보강하고, 전투 직후 자동 갱신을 호출한다.
- 장기적으로 `useStartClientEngine` 대신 서버 주도의 매칭 결과를 읽어오는 `useBattleSession` 훅을 만들어, 사용자가 별도 API 키 없이도 전투 기록을 열람·재생산할 수 있게 한다.

### 4.4 후속 고려 사항
- **큐/매칭 서버**: 실시간 모드에서 다수 사용자가 동시에 시작할 때 충돌을 피하기 위해 `rank_queue` 류의 테이블 또는 Edge Function 큐를 도입.
- **AI 비용 관리**: `/api/rank/run-turn`과 `/api/rank/play` 호출에 대한 속도 제한, 에러 핸들링, userApiKey 검증 로직을 공통화.
- **사운드/배경 제어**: 전투 시작/종료 시 BGM 전환을 `GameRoomView`에서 제어할 수 있도록 이벤트를 발행하고, 순위 화면 재진입 시 원래 트랙으로 복귀.

### 4.5 API 키 고갈 대응 메모
- **개별 키 사용**: 각 참가자는 본인의 LLM API 키로만 응답을 전송하며, 동일 턴에서 키가 섞이지 않도록 호출 스케줄러를 분리한다.
- **사용량 감시**: 전투 프롬프트는 항상 5줄 구조(마지막 줄: 승패, 마지막에서 두 번째: 변수, 마지막에서 세 번째: 주역, 마지막 두 줄은 공란)를 유지하고, 각 줄이 비정상적으로 길어지면 해당 참가자의 키가 고갈된 것으로 간주한다.
- **대체 키 처리**: 키 고갈이 감지되면 즉시 사용자에게 교체 알림을 띄우고, 고갈 시각·사용자 ID·게임 ID를 기록한 뒤 5시간 동안 동일 키로 새 게임을 시작하지 못하게 제한한다.
- **임시 프록시 호출**: 알림 이후에는 동일 게임 한정으로 다른 참가자 키(또는 운영용 키)로 대체 호출을 수행하되, 사후 정산을 위해 모든 대체 호출 로그를 남긴다.

## 5. 다음 단계 체크리스트
1. `useGameRoom` 데이터 모델 확장(역할·슬롯·참가자 동기화).
2. `joinGame` → 슬롯 점유 + 정원 검증 + 참가자 상태 저장.
3. 메인룸 `onStart` → `/api/rank/play` 호출, 성공 응답 UI 반영.
4. `/api/rank/play` → 슬롯 검증, 상대 매칭 개선, 난입 규칙 반영.
5. `recordBattle` → `game_id` 포함 및 점수/상태 업데이트 보강.
6. 최근 전투 목록 UI를 실제 응답 구조에 맞춰 갱신.

## 6. 진행 현황 (2025-10-02 갱신)

| 구분 | 상태 | 비고 |
| --- | --- | --- |
| 1단계 – 역할/슬롯 모델링 | ✅ 완료 | `useGameRoom`이 `rank_game_roles`·`rank_game_slots`를 동시 로딩해 정규화된 역할 배열과 활성 슬롯 집계를 제공합니다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L200-L318】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L488-L520】 |
| 1단계 – 슬롯 점유/해제 로직 | ✅ 완료 | `/api/rank/join-game`이 빈 슬롯을 검색·점유하고 기존 소유 슬롯을 해제한 뒤 `rank_participants`에 upsert합니다.【F:starbase/ai-roomchat/pages/api/rank/join-game.js†L1-L162】 |
| 2단계 – 메인룸 시작 트리거 | ⚠️ 부분 구현 | `AutoMatchProgress`가 확인 단계에서 `/api/rank/start-session`을 호출해 `rank_sessions`·`rank_turns`를 시드하지만, 전투 실행(`run-turn`/`play`) 연결은 아직 남았습니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L260】【F:starbase/ai-roomchat/pages/api/rank/start-session.js†L1-L158】 |
| 3단계 – 서버 전투 기록 | ⚠️ 부분 구현 | `recordBattle`이 `rank_battle_logs`에 `game_id`를 기록하도록 보강했지만, 다중 방어자 처리·점수/상태 동기화는 MVP 수준입니다.【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L37】 |
| 4단계 – UI/히스토리 연동 | ⚠️ 진행 중 | 세션 시작 시 `rank_turns`에 시스템 로그를 기록해 히스토리 데이터는 쌓이기 시작했지만, `GameRoomView`와 도크 UI는 여전히 로컬 상태를 사용합니다.【F:starbase/ai-roomchat/pages/api/rank/start-session.js†L1-L158】【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L720-L819】 |
| 5단계 – 후속 개선 | ⏳ 미착수 | 큐 실시간화, 프롬프트 세션 훅 등은 계획만 문서화된 상태입니다. |

### 진행도 추산
- 완료 2개(역할/슬롯 모델링, 슬롯 점유), 부분 완료 2개(세션 트리거 0.85, 전투 기록 0.5), 진행 중 1개(히스토리 연동 0.25)로 환산하면 약 **60%** 달성((2×1.0 + 0.85 + 0.5 + 0.25) / 6 ≈ 60%).
- 남은 핵심 과제는 전투 API 연동, 세션 뷰어 UI, 점수/상태 동기화 확장, 실시간 큐 고도화입니다.

---
느낀 점: 확인 단계에서 세션이 실제로 생성되고 히스토리가 쌓이기 시작하니 메인 로직으로 넘어갈 준비가 눈에 보이기 시작해 마음이 한결 가벼워졌습니다.
추가로 필요한 점: 전투 API(`run-turn`/`play`)를 세션과 묶을 트랜잭션·락 전략을 세워 남은 15%를 마무리할 준비가 필요합니다.
진행사항: 자동 매칭 확인 단계에서 세션을 생성·로깅하는 흐름을 붙이고, 진행률 산정을 60%로 갱신했습니다.

### 진행 현황 메모 (2025-10-04 추가)

- 신규 구현 착수 전 진척도 재점검 결과, 문서화된 5단계 중 **2단계 진행률이 0.85**, **3단계 0.5**, **4단계 0.25** 수준을 유지해 전체 추산은 여전히 **60%**입니다.
- `/api/rank/play`와 세션 동기화, 점수·상태 업데이트 보강이 착수되지 않아 산정치를 추가로 높이기 어렵습니다.
- 다음 작업은 전투 API 연동과 히스토리 뷰어 구축을 우선 순위로 삼아 3·4단계의 진행률을 끌어올리는 방향으로 계획되어야 합니다.

느낀 점: 현재 지점에서 멈춰 있는 작업 항목을 다시 적어보니, 남은 과업이 명확히 보이면서도 당장 급하게 서두르지 않고 차례로 해결해야겠다는 생각이 들었습니다.
추가로 필요한 점: 전투 API 스펙을 확정하려면 `rank_turns` 활용 방식을 먼저 정리하고, 서버·클라이언트가 공유할 응답 포맷 표를 작성하는 것이 좋겠습니다.
진행사항: 새로운 기능 구현 없이 진행률 재점검 메모를 추가해 후속 개발 순서를 분명히 했습니다.
