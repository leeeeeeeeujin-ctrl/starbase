# 랭크 게임 메인룸 → 전투 진행 로직 설계안

## 1. 현재 흐름 요약
- **페이지 진입**: `/rank/[id].js`가 `useGameRoom` 훅으로 게임, 참가자, 최근 전투를 불러와 `GameRoomView`에 전달한다. `onStart` 이벤트는 `/rank/[id]/start` 경로로 라우팅만 하고 실제 매칭은 수행하지 않는다.【F:starbase/ai-roomchat/pages/rank/[id].js†L1-L76】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L1-L213】
- **게임 시작 화면**: `/rank/[id]/start`는 `StartClient`를 불러와 로컬 상태로 프롬프트 그래프를 돌리고 AI 호출을 수동으로 시도할 수 있게 한다. 이제 메인 룸의 “게임 시작” 버튼은 솔로 랭크 모드에서 바로 `/api/rank/play`를 호출해 서버측 매칭을 수행하고, 응답을 받은 뒤 참가자/슬롯/전투 기록을 자동으로 새로고침한다.【F:starbase/ai-roomchat/pages/rank/[id].js†L1-L308】
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
   - 솔로 랭크는 메인 룸에서 곧바로 `/api/rank/play`를 호출하도록 연결됐지만, 듀오/캐주얼 모드는 여전히 별도 페이지에서 자동 큐만 돌고 있어 동일한 트리거 연동이 필요하다.【F:starbase/ai-roomchat/pages/rank/[id].js†L200-L320】
   - `StartClient`는 사용자 API 키를 요구하는 실험용 도구 수준으로, 정식 매칭 로직(슬롯 충족 → 상대 매칭 → AI 호출 → 결과 저장)을 UI와 완전히 공유하지는 못한다.【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L37-L162】
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
| 2단계 – 메인룸 시작 트리거 | ⚠️ 진행 중 | 솔로 랭크는 메인 룸에서 바로 `/api/rank/play`를 호출해 매칭을 수행하고, 응답 후 참가자·슬롯·전투 기록을 새로고침하도록 연동되었습니다. 듀오/캐주얼 모드와 턴별 재전송 로직은 후속으로 묶어야 합니다.【F:starbase/ai-roomchat/pages/rank/[id].js†L200-L320】 |
| 3단계 – 서버 전투 기록 | ⚠️ 진행 중 | `recordBattle`이 다중 턴 로그를 저장하고 공격자 점수·상태를 갱신하지만, 다중 방어자 처리와 정교한 점수 반영은 추가 구현이 필요합니다.【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L189】 |
| 4단계 – UI/히스토리 연동 | ⚠️ 진행 중 | 세션 시작 시 `rank_turns`에 시스템 로그를 기록해 히스토리 데이터는 쌓이기 시작했지만, `GameRoomView`와 도크 UI는 여전히 로컬 상태를 사용합니다.【F:starbase/ai-roomchat/pages/api/rank/start-session.js†L1-L158】【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L720-L819】 |
| 5단계 – 후속 개선 | ⏳ 미착수 | 큐 실시간화, 프롬프트 세션 훅 등은 계획만 문서화된 상태입니다. |

### 진행도 추산
- 완료 2개(역할/슬롯 모델링, 슬롯 점유), 부분 완료 2개(세션 트리거 0.95, 전투 기록 0.8), 진행 중 1개(히스토리 연동 0.4)로 환산하면 약 **69%** 달성((2×1.0 + 0.95 + 0.8 + 0.4) / 6 ≈ 69%).
- 남은 핵심 과제는 듀오/캐주얼 모드의 전투 API 연동, 세션 뷰어 UI, 다중 방어자 점수/상태 동기화, 실시간 큐 고도화입니다.

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

### 진행 현황 메모 (2025-10-05 추가)

- `/api/rank/play`가 전투 결과를 저장할 때 첫 턴 로그뿐 아니라 전달받은 턴 배열을 모두 `rank_battle_logs`에 기록하며, 공격자 점수와 상태를 즉시 갱신하도록 `recordBattle`을 확장했습니다.【F:starbase/ai-roomchat/pages/api/rank/play.js†L1-L94】【F:starbase/ai-roomchat/lib/rank/persist.js†L1-L189】
- 아직 방어자 점수 조정과 재참전/탈락 규칙은 빠져 있어 3단계 완성도는 0.7 수준으로 추산합니다.

느낀 점: 전투 기록 파이프라인을 다시 손보니 로그와 참가자 상태가 한 흐름으로 이어지기 시작해 다음 단계 설계가 훨씬 편해질 것 같았습니다.
추가로 필요한 점: 방어자 점수/상태 반영과 난입/재참전 규칙을 계산해줄 서비스 롤 API를 별도로 마련해야 완성도를 높일 수 있습니다.
진행사항: `recordBattle`이 턴 배열 저장과 공격자 점수·상태 업데이트까지 처리하도록 확장했습니다.

### 진행 현황 메모 (2025-10-06 추가)

- `/rank/[id]/start`에서 `StartClient`가 세션 토큰을 받아 `/api/rank/start-session`을 먼저 호출하고, 응답이 성공한 뒤에만 프롬프트 그래프를 시작하도록 조정했습니다.【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L120-L227】
- 헤더의 “게임 시작” 버튼은 세션 준비 중 비활성화되고 로딩 레이블을 노출해 자동/수동 진입이 중복 호출되지 않도록 정리했습니다.【F:starbase/ai-roomchat/components/rank/StartClient/HeaderControls.js†L1-L83】【F:starbase/ai-roomchat/components/rank/StartClient/index.js†L400-L436】

느낀 점: 클라이언트가 세션 생성까지 확인한 뒤 전투를 시작하니 서버 상태와 UI가 한 박자 맞아 들어가는 느낌이라 진척도를 실감할 수 있었습니다.
추가로 필요한 점: 세션 생성 이후 턴 실행(`/api/rank/run-turn`)을 같은 토큰 흐름에 묶어 Supabase 히스토리와 동기화하는 후속 작업이 필요합니다.
진행사항: StartClient에 세션 선행 호출과 시작 버튼 로딩 UI를 더해 2단계 자동화 흐름을 한층 다듬었습니다.

### 진행 현황 메모 (2025-10-07 추가)

- `useGameRoom`이 `rank_sessions`와 `rank_turns`를 조회해 뷰어의 최근 세션 로그를 로드하고 새로고침 액션으로 노출합니다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L318-L356】【F:starbase/ai-roomchat/hooks/useGameRoom.js†L370-L413】
- `GameRoomView` 메인 패널에 “내 세션 히스토리” 섹션을 추가해 공개 턴 요약, 비공개 라인 안내, 이전 기록 여부를 모바일 레이아웃에 맞춰 보여줍니다.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L512-L610】【F:starbase/ai-roomchat/components/rank/GameRoomView.module.css†L1-L240】

느낀 점: 메인 룸에서 바로 세션 로그를 확인할 수 있게 되니 전투 흐름이 실제 데이터와 연결된다는 감각이 살아나 차기 구현을 구상하기 쉬워졌습니다.
추가로 필요한 점: 다중 참가자의 세션을 공유하려면 `rank_sessions` RLS 완화를 위한 뷰 또는 서버 프록시가 필요해 공용 히스토리 API 설계를 이어가야 합니다.
진행사항: `useGameRoom`과 메인 룸 UI를 확장해 뷰어 전용 세션 히스토리를 표면화했고, 4단계 진행률을 0.25→0.4 수준으로 끌어올렸습니다.

### 진행 현황 메모 (2025-10-08 추가)

- `/api/rank/play` 경로가 `buildSlotsMap`으로 전달하는 슬롯 메타데이터를 확장해 역할 요구사항과 소유자·상태 정보를 함께 프롬프트 변수에 노출할 수 있게 됐습니다.【F:starbase/ai-roomchat/pages/api/rank/play.js†L28-L71】【F:starbase/ai-roomchat/lib/rank/heroes.js†L1-L149】
- `compileTemplate`는 이제 `{{slotX.role}}`, `{{slotX.status}}`, `{{slotX.owner_id}}` 등 추가 플레이어 속성을 자동 치환하고, 임의의 슬롯 속성도 JSON 문자열로 풀어낼 수 있습니다.【F:starbase/ai-roomchat/lib/rank/prompt.js†L1-L75】

느낀 점: 슬롯 메타를 풍부하게 채워 넣으니 프롬프트 제작기에서 변수를 조합할 때 상상했던 구조가 비로소 구현으로 이어진다는 확신이 들었습니다.
추가로 필요한 점: 슬롯 상태가 전투 중 갱신될 수 있도록 `recordBattle`과 세션 진행 훅에서 같은 메타 키를 사용해 주는 후속 정리가 필요합니다.
진행사항: 역할 요구 슬롯 정보를 opponent 픽에도 함께 넘기고, 프롬프트 컴파일러가 확장된 슬롯 속성을 지원하도록 보강했습니다.

### 진행 현황 메모 (2025-10-09 추가)

- 자동 매칭 진입 경로가 `/rank/[id]/solo`, `/rank/[id]/duo`, `/rank/[id]/casual` 페이지에서 즉시 `AutoMatchProgress`를 호출하도록 통합돼, 모드별 버튼을 다시 누르지 않아도 대기열에 합류합니다.【F:starbase/ai-roomchat/pages/rank/[id]/solo.js†L1-L41】【F:starbase/ai-roomchat/components/rank/SoloMatchClient.js†L1-L5】
- `AutoMatchProgress`는 뷰어·역할·히어로 준비가 끝나야 `joinQueue`를 호출하고, 차단 요인을 콘솔과 UI에 노출해 왜 자동 참가가 지연되는지 추적할 수 있도록 개선돼 있습니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L78-L268】

느낀 점: 페이지 진입만으로 자동 매칭이 굴러가니 큐 플로우가 다시 설계안과 맞물리는 모습이 보여 다음 단계 작업을 추진하기 수월해졌습니다.
추가로 필요한 점: 듀오 모드에서 파티 구성원이 동시에 합류했는지 Supabase 큐 데이터를 모니터링해 재시도 타이밍이나 안내 문구가 필요한지 점검해야 합니다.
진행사항: 모드별 매칭 페이지를 `AutoMatchProgress` 기반으로 통일하고, 자동 참가 차단 로그를 보강해 2단계 진행률은 0.85에서 유지되며 전체 진척도는 약 **63%** 수준을 유지합니다.

### 진행 현황 메모 (2025-10-10 추가)

- `/api/rank/log-turn` 엔드포인트를 추가해 인증된 세션 토큰과 함께 턴 로그를 전달하면 `rank_turns`에 순번을 맞춰 적재하고, 세션의 `turn`·`updated_at`을 동기화하도록 했습니다.【F:starbase/ai-roomchat/pages/api/rank/log-turn.js†L1-L146】
- `StartClient`는 세션 생성 시 반환된 ID를 기억하고, 매 턴 프롬프트/응답을 `log-turn` API로 전송해 히스토리가 Supabase에 즉시 저장되도록 보강했습니다.【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L115-L342】【F:starbase/ai-roomchat/components/rank/StartClient/useStartClientEngine.js†L838-L1003】
- 이로써 3단계(서버 전투 기록) 진행률을 0.8 수준까지 끌어올렸으며, 향후에는 수신된 히스토리를 메인 룸 UI와 공유 AI 히스토리에 연결하는 작업이 남았습니다.

### 진행 현황 메모 (2025-10-14 추가)

- 메인 룸의 “게임 시작” 버튼이 솔로 랭크 모드에서 즉시 `/api/rank/play`를 호출해 매칭을 수행하고, 응답 이후 참가자·슬롯·전투 기록을 한 번에 새로고침하도록 연결했습니다.【F:starbase/ai-roomchat/pages/rank/[id].js†L200-L320】【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L820-L876】【F:starbase/ai-roomchat/components/rank/GameRoomView.module.css†L360-L409】
- 서버 측에서는 서비스 롤 키와 Bearer 토큰을 사용해 플레이 API가 실제 사용자 세션을 검증하도록 정비했습니다.【F:starbase/ai-roomchat/lib/rank/db.js†L1-L18】【F:starbase/ai-roomchat/pages/api/rank/play.js†L1-L94】

느낀 점: 메인 룸에서 바로 전투가 시작되고 결과가 돌아오는 흐름을 체감하니, 청사진에 적어둔 파이프라인이 드디어 살아난다는 확신이 생겼습니다.
추가로 필요한 점: 듀오와 캐주얼 모드도 같은 트리거와 리프레시 구조로 묶고, 실패 시 재시도·알림 흐름을 정비해야 완전한 자동화를 달성할 수 있습니다.
진행사항: 솔로 랭크 시작 버튼을 서버 매칭과 연결하고 API 인증을 강화해 2단계 진행률을 0.95 수준까지 끌어올렸습니다.
