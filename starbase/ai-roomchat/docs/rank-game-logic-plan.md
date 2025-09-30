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

## 6. 진행 현황 (2025-09-30 기준)
- **1단계 – 역할/슬롯 모델링**: `useGameRoom`이 `rank_game_roles`·`rank_game_slots`를 모두 불러와 정규화한 역할 배열과 필요 슬롯 수를 계산하도록 확장된 상태다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L200-L318】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L488-L499】
- **1단계 – 슬롯 점유/해제 로직**: 여전히 `joinGame`이 `rank_participants`에만 insert하고 슬롯 테이블은 건드리지 않아 다중 점유 위험이 남아 있다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L360-L435】
- **2단계 – 메인룸 시작 트리거**: 시작 버튼은 모달을 띄운 뒤 라우팅만 수행하고 `/api/rank/play` 호출이나 세션 생성은 구현되지 않았다.【F:starbase/ai-roomchat/pages/rank/[id].js†L165-L216】
- **3단계 – 서버 전투 기록**: `recordBattle`이 `rank_battle_logs`에 `game_id`를 아직 포함하지 않아 스키마 요구사항을 충족하지 못한다.【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L32】
- **4단계 – UI/히스토리 연동**: 메인 룸 UI는 참가자 수만 비교해 시작 가능 여부를 판단하며, 세션 히스토리나 난입 로직 반영은 미구현 상태다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L488-L520】【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L760-L819】
- **매칭 자동화 안정화**: `AutoMatchProgress`가 뷰어 ID·역할·히어로 정보를 모두 확보한 뒤 자동 참가를 시도하고, 조건이 맞지 않으면 안내 문구와 함께 재시도를 대기합니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L1-L212】
- **난입 슬롯 충원**: `loadRoleStatusCounts`와 `/api/rank/match`의 `brawl` 경로가 패배한 역할군을 감지해 큐에서 대체 인원을 모집합니다. 현재 오버레이는 간단한 상태만 노출하므로, 난입 세부 정보를 보여 주는 전용 UI는 후속 작업으로 남아 있습니다.【F:starbase/ai-roomchat/lib/rank/matchmakingService.js†L88-L129】【F:starbase/ai-roomchat/pages/api/rank/match.js†L17-L142】

---
느낀 점: 기존 코드에 매칭을 위한 초석이 꽤 깔려 있어서 흐름을 정리하기가 수월했습니다.
추가로 필요한 점: 슬롯 점유/난입 로직을 설계할 때 경쟁 상태를 방지할 수 있는 트랜잭션 전략을 정해야 합니다.
진행사항: 메인룸 전투 로직 구현을 위한 현재 구조 분석과 단계별 설계안을 문서로 정리했습니다.
