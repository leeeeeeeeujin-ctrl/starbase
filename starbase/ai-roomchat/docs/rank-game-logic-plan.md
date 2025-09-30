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

## 5. 다음 단계 체크리스트
- [x] `useGameRoom` 데이터 모델 확장(역할·슬롯·참가자 동기화).
  - `rank_game_slots`를 전부 불러와 정원 요약을 계산하고, 슬롯 상태를 상태값으로 노출했습니다.
  - 슬롯 점유 요약을 기반으로 `canStart`가 역할별 정원 충족 여부를 판단하도록 변경했습니다.
- [x] `joinGame` → 슬롯 점유 + 정원 검증 + 참가자 상태 저장.
  - 남은 슬롯을 계산하고 비어 있는 슬롯에 한해 `hero_id`/`hero_owner_id`를 업데이트합니다.
  - 슬롯 점유 실패 시 재동기화와 안내 로그를 남겨 중복 점유를 방지합니다.
- [ ] 메인룸 `onStart` → `/api/rank/play` 호출, 성공 응답 UI 반영.
- [ ] `/api/rank/play` → 슬롯 검증, 상대 매칭 개선, 난입 규칙 반영.
- [ ] `recordBattle` → `game_id` 포함 및 점수/상태 업데이트 보강.
- [ ] 최근 전투 목록 UI를 실제 응답 구조에 맞춰 갱신.

## 6. 메인 게임 청사진 (UI, 프롬프트, 상태 흐름)
### 6.1 화면 구성
- **좌/우 사이드 패널**: 역할군별 초상화와 상태(활성/승리/패배/탈락/난입)를 표시한다. 승리·패배·탈락에 따라 테두리와 투명도, 난입 대기 중인 슬롯에는 펄스 애니메이션을 입힌다.
- **중앙 메인 UI**: 실제 전투 UI를 반투명 오버레이로 두어 텍스트 없이 진행 상황을 시각적으로만 보여준다. 텍스트·로그는 아래 히스토리 트레이에서 확인한다.
- **히스토리 트레이**: 모든 사용자가 볼 수 있는 상단 탭으로, 본인이 접근 가능한 정보(인비저블 제외)만 노출한다. 신규 난입자에게는 자동으로 펼쳐 주고 최소 60초간 제한 시간을 일시 해제한다.
- **AI 히스토리 패널**: AI 호출 시 과거 프롬프트·응답·설명문을 함께 넘겨 참조할 수 있는 별도 데이터 블록을 유지한다.

### 6.2 오디오·배경 처리
- 프롬프트의 끝에서 세 번째 줄에 현재 턴의 주역 캐릭터 이름(복수일 경우 쉼표 구분)을 삽입한다.
- 해당 캐릭터의 설정(BGM, EQ, 리버브, 컴프레서)을 찾아 배경과 오디오를 교체한다.
- 새 트랙이 재생될 때 기존 BGM은 즉시 정지하여 겹침을 방지한다.
- 동명이 캐릭터가 있을 경우 슬롯 ID를 함께 적어 충돌을 피한다(`주역: {slotId}:{heroName}` 형태 권장).

### 6.3 프롬프트 라인 규칙
1. **본문**: 장면 설명과 지시문.
2. **변수 줄**: 마지막에서 두 번째 줄에 JSON 또는 `key=value` 포맷으로 현재 슬롯 데이터(이름, 능력, 설명, 상태)를 표기한다.
3. **승패 줄**: 맨 마지막 줄에 각 슬롯의 승리/패배/탈락 상태와 난입 허용 여부를 요약한다.

### 6.4 슬롯 매핑 및 상태 전파
- 슬롯은 총 12개이며 `rank_game_slots` 테이블과 동기화한다.
- 활성 슬롯에 캐릭터가 없으면 동일 역할군 내 대기열에서 대체자를 선택한다.
- 슬롯이 탈락 상태면 동일 역할군의 살아 있는 후보를 우선 대체하고, 없으면 슬롯을 비활성화한다.
- 승리한 슬롯은 행동권을 잃지만 게임 종료 전까지 자리만 유지한다.
- 난입은 패배하여 추방된 슬롯을 대상으로 하며, 역할군 내 빈 자리가 모두 채워질 때까지 대기한다.

### 6.5 자동 프롬프트 매핑 파이프라인
1. 현재 턴의 노드가 요구하는 변수 목록을 분석한다(`prompt_slots` 메타데이터 활용).
2. 각 변수는 `slotId` 또는 `role` 기준으로 현재 참가자의 이름, 능력, 설명 등을 조회해 매핑한다.
3. 슬롯 상태가 `eliminated`(탈락)면 동일 역할군의 다음 후보를 찾고, `defeated`면 해당 변수는 스킵한다.
4. `rejoin` 플래그가 감지되면 동일 이름의 캐릭터 슬롯을 재활성화한다(동명이 발생 시 slot UUID로 식별).
5. 완성된 변수 줄을 프롬프트 끝에서 두 번째 줄에 삽입하고 AI 호출 전에 캐릭터별 오디오 큐를 갱신한다.

### 6.6 난입(중도 참여) 처리
- 승리자는 행동권을 유지하지만, 난입 슬롯에는 참여하지 않는다.
- 패배로 비워진 슬롯은 난입 대기열에서 점수대가 유사한 참가자를 찾아 즉시 투입한다.
- 여러 슬롯이 비었을 때에는 역할군 세트를 완전히 채울 수 있을 때만 난입을 허용한다.
- 난입자에게도 히스토리와 60초 파악 시간을 제공한다.

### 6.7 실시간 옵션 비활성화 시 흐름
- 실시간 옵션이 꺼져 있고 사용자 행동 차례가 아닌 캐릭터에게 입력 기회가 주어지면, 시스템은 설명문과 캐릭터 정보를 AI에 전달해 대행 응답을 생성한다.
- 생성된 응답은 동일 턴 내에 다시 AI에게 재전달해 본 턴에서 사용할 수 있도록 한다.
- 사용자 행동 턴에는 1회 입력만 허용하며, 설명문(`userActionPrompt`)과 실제 입력을 묶어 AI에 전달한다.

### 6.8 가시성(인비저블) 옵션
- 각 로그, 설명문, 변수에는 `visibility` 속성을 두어 특정 사용자에게만 보이도록 제한한다.
- 히스토리 패널은 역할군·가시성 조건을 모두 만족하는 항목만 펼친다.
- AI 히스토리에는 인비저블 항목까지 포함하여 맥락을 유지하되, 사용자 UI에는 숨긴다.

### 6.9 다음 구현 과제
- 사이드 패널/메인 UI 와이어프레임 제작 및 컴포넌트 구조 정의.
- 프롬프트 빌더에 변수 줄/승패 줄 강제 배치 로직 추가.
- 슬롯 상태 엔진에 난입·재참전 규칙 통합.
- 오디오 매니저 개발(BGM 전환 + 이펙트 파이프라인).
- 히스토리/가시성 제어 API 설계(플레이어/AI용 데이터 분리).

---
느낀 점: UI·오디오·프롬프트를 한꺼번에 엮어 보니 메인 게임이 지향하는 몰입감 있는 그림이 좀 더 명확히 떠올랐습니다.
추가로 필요한 점: 난입/재참전 상태를 DB 트랜잭션으로 일관되게 처리할 수 있도록 슬롯 상태 전환 설계를 보강해야 합니다.
진행사항: 메인 게임 청사진, 프롬프트 라인 규칙, 난입 및 가시성 흐름을 포함한 확장 설계안을 문서에 반영했습니다.
