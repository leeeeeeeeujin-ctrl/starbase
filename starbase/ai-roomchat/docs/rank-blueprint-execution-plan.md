# 랭크 게임 청사진 실행 플랜

이 문서는 현재 레포에서 확인한 파일 구조와 이미 구현된 기능, 남은 작업을 체계적으로 정리해 향후 개발을 위한 기준으로 삼기 위한 계획서이다. 기존 청사진 문서를 보조하며, 각 단계별로 필요한 코드 위치와 데이터를 명시한다.

2025-11-05 점검 결과는 `rank-blueprint-progress-2025-11-05.md`에 요약돼 있으며, 아래 단계별 계획은 그 점검을 기준으로 최신 상태로 맞춰져 있다.

## 1. 파일 구조 맵

| 영역 | 주요 파일 | 역할 |
| --- | --- | --- |
| 페이지 진입 | `pages/rank/[id].js` | 게임 룸 데이터를 불러와 `GameRoomView`에 전달하고 모드 전환 라우팅을 담당한다. |
| 매칭 페이지 | `pages/rank/[id]/solo.js`, `pages/rank/[id]/duo/index.js`, `pages/rank/[id]/duo/queue.js`, `pages/rank/[id]/casual.js` | 각 모드에서 `MatchQueueClient`/`AutoMatchProgress` 기반 자동 대기열 진입을 수행한다. |
| 메인 룸 UI | `components/rank/GameRoomView.js`, `components/rank/GameRoomView.module.css` | 참가/시작 패널, 세션 히스토리, 안내 패널을 렌더링한다. |
| 매칭 클라이언트 | `components/rank/MatchQueueClient.js`, `components/rank/AutoMatchProgress.js`, `components/rank/DuoMatchClient.js` | 자동 큐 합류, 재시도, 확인 카운트다운, 난입 처리 등 큐 전환 로직을 캡슐화한다. |
| 전투 실행 | `components/rank/StartClient/*` | 세션 토큰 확보, 프롬프트 그래프 실행, 턴 동기화, 오디오 전환을 관리한다. |
| 공유 훅 | `hooks/useGameRoom.js`, `components/rank/hooks/useMatchQueue.js` | 게임·슬롯·세션 데이터를 로드하고 자동 참가를 위한 상태를 제공한다. |
| 서버 API | `pages/api/rank/*.js` | 참가(upsert), 매칭, 세션 생성, 턴 실행, 전투 기록 저장을 처리한다. |
| 도메인 유틸 | `lib/rank/*.js` | 슬롯 계산(`roles.js`), 참가자 갱신(`participants.js`), 매칭 서비스(`matchmakingService.js`), 전투 영속화(`persist.js`), 프롬프트 컴파일(`prompt.js`) 등을 제공한다. |
| 문서화 | `docs/rank-game-logic-plan.md`, `docs/match-mode-structure.md`, `docs/page_state_map.md` | 구현 가이드와 현재 진행 상황을 기록한다. |

## 2. 현재 파이프라인 이해

1. **게임 로드**: `useGameRoom`이 Supabase에서 게임 메타, 슬롯, 참가자, 세션 로그를 로드해 메인 룸과 매칭 페이지에 제공한다.
2. **참가/슬롯 점유**: `/api/rank/join-game`가 서비스 롤로 슬롯을 잠그고 `rank_participants`를 upsert한다.
3. **매칭 진입**: 모드별 페이지에서 `AutoMatchProgress`가 뷰어·히어로·역할 상태를 확인한 뒤 자동으로 큐에 합류하고, 확인 카운트다운 및 페널티 처리를 수행한다.
4. **세션 생성**: 매치가 확정되면 `/api/rank/start-session`이 세션을 만들고 `rank_turns`에 시스템 로그를 기록한다.
5. **턴 실행**: `/api/rank/run-turn`이 인증 토큰을 검증하고 각 프롬프트·응답을 `rank_turns`에 누적한다. 클라이언트는 `StartClient`에서 Supabase 세션 ID를 추적하며 로그를 캐싱한다.
6. **전투 기록**: `/api/rank/play` 및 `recordBattle`이 턴 로그와 참가자 점수/상태를 저장하지만, 다중 방어자와 난입 후속 처리 일부는 미완성 상태다.

## 3. 남은 주요 구현 항목

### 3.1 매칭·세션 일관성
- 듀오/캐주얼 모드도 `/api/rank/play` 파이프라인을 재사용하도록 메인 룸 트리거와 매칭 페이지 확인 단계를 통일한다.
- 난입 슬롯 충원 후 세션 전환이 누락되지 않도록 `AutoMatchProgress` ↔ `useGameRoom` 사이의 상태 합의를 정리한다.

### 3.2 프롬프트 변수 해석 및 상태 갱신
- 프롬프트 제작기의 변수 목록을 코드 상에서 파싱해 `prompt.js`가 슬롯→변수 매핑 테이블을 자동 생성하도록 확장한다.
- 승리/패배/탈락·재참전 상태를 `recordBattle`와 매칭 서비스에 반영해 슬롯 교체, 난입 허용, 재진입 타이머 로직을 확정한다.

### 3.3 히스토리/가시성 기능
- 메인 룸 상단 히스토리 탭과 AI 전용 히스토리를 `rank_turns` 기반으로 구현하고, 인비저블 라인을 사용자별로 필터링한다.
- 새로 합류한 참가자에게 최근 히스토리를 요약해 60초 파악 시간을 부여하는 클라이언트 로직을 추가한다.

### 3.4 오디오·UI 연동 마무리
- 주역 캐릭터 기반 배경/브금 전환을 실전 세션에 연결하고, 서로 다른 BGM 재생 시 기존 트랙을 일시 중단하는 오디오 매니저 작업을 완료한다.
- 모바일 세로형 레이아웃에서 역할군 썸네일, 메인 전투 패널, 투표/동의 버튼 구역을 재배치한다.

### 3.5 운영/안정성 보강
- API 키 고갈 감지 후 5시간 쿨다운, 대체 키 기록, 알림 발송 경로를 구현한다.
- 큐 재시도/타임아웃 이벤트를 Supabase Edge Function 또는 사내 스케줄러로 감시해 `engaged` 상태가 풀리지 않는 문제를 예방한다.

## 4. 단계별 실행 계획

| 단계 | 목표 | 필요한 작업 |
| --- | --- | --- |
| 1 | 매칭 트리거 통일 | 메인 룸 `onStart`와 모드별 페이지를 `/api/rank/play` → `/api/rank/start-session` 시퀀스로 일원화, 확인 UI 동기화 |
| 2 | 세션/전투 동기화 | `recordBattle` 다중 방어자 처리, 승/패/탈락 상태 업데이트, `rank_turns` 히스토리 노출 |
| 3 | 프롬프트 변수 자동화 | `prompt.js`에 슬롯/변수 매핑 로더 추가, 노드 전환 조건을 메타데이터화 |
| 4 | UI·오디오 완성 | 메인 UI 레이아웃 재구성, 오디오 프리셋 적용/중단, 히스토리 탭/AI 뷰어 구현 |
| 5 | 운영 가드 | API 키 고갈/대체 흐름, 큐 모니터링, 난입 후속 처리 자동화 |

각 단계는 선행 단계의 데이터/상태 동기화가 완료된 뒤 진행해야 하며, 단계 2까지는 서버 API 확장이 핵심이다. 단계 3 이후에는 프런트엔드 UI/오디오, 운영 보강이 중심이 된다.

## 5. 요구 리소스 및 체크포인트

- **Supabase 스키마**: `rank_turns` 가시성 플래그, 난입 기록, API 키 고갈 로그용 테이블/뷰가 필요하다.
- **테스트 전략**: 모드별 자동 큐 진입, 난입 재매칭, 프롬프트 변수 해석, 오디오 전환을 각각 통합 테스트 시나리오로 작성한다. 세부 시나리오와 다이어그램은 `rank-blueprint-test-plan.md`에서 관리한다.
- **문서화 유지**: 각 단계 완료 시 `rank-game-logic-plan.md`, `match-mode-structure.md`에 반영하고, 큐/세션 로그를 `matchmaking_diagnostics.md`에 추적한다.

## 6. 즉시 착수 가능한 TODO

1. (완료) 듀오/캐주얼 모드에서 자동 매칭 확정 후 `/api/rank/play`를 호출하도록 `AutoMatchProgress`를 확장했다.【F:components/rank/AutoMatchProgress.js†L333-L432】
2. (완료) `prompt.js`에 슬롯→변수 매핑 프로토타입을 추가하고, 제작기 노드 메타데이터와 구조를 비교 분석한다.
3. (완료) `rank_turns` 히스토리를 메인 룸 히스토리 탭과 AI 전용 뷰어 UI에 연결하기 위한 스펙 초안을 작성한다.【F:starbase/ai-roomchat/docs/rank-turn-history-spec.md†L1-L194】
4. (완료) API 키 고갈 감지에 필요한 감사 로그(`rank_api_key_audit`) 스키마와 핵심 컬럼·인덱스를 설계해 Supabase DDL 문서에 반영한다.【F:ai-roomchat/docs/supabase-ddl-export.md†L117-L154】

## 7. 남은 청사진 세부 계획(업데이트)

### 7.1 단계 1 — 매칭 트리거 통일

- **목표 세분화**
  - 모드별 자동 확인 UI → `/api/rank/play` → `/api/rank/start-session` → `/api/rank/run-turn` 호출 순서를 코드 상에 명시적으로 연결한다.
  - 난입 매치와 일반 매치가 동일한 세션 생명주기를 사용하도록 `AutoMatchProgress` → `useGameRoom` 데이터 갱신 훅을 정의한다.
- **필요 산출물**
  - 모드 라우트 테스트 케이스 (`solo`, `duo`, `casual`, `casual_private`).
  - 매칭 전환 다이어그램(문서 부록) 및 리그레이션 체크리스트.
- **사전 조건**: `GameRoomView`가 슬롯 데이터와 모드 설정을 즉시 제공해야 하므로 `useGameRoom`의 데이터 패치 순서를 재검토한다.

### 7.2 단계 2 — 세션/전투 동기화

- **목표 세분화**
  - `recordBattle`이 공격/방어 다중 결과를 atomic update로 처리하고, `rank_participants`의 `engaged` 타임아웃 해제 로직을 Edge Function으로 구현한다.
  - 턴 로그 저장 시 승/패/탈락/재참전 이벤트를 단일 히스토리 메시지로 묶어 클라이언트가 재조합 없이 사용할 수 있도록 한다.
  - **진행 상황 메모**
    - `/api/rank/run-turn`·`/api/rank/log-turn`이 `is_visible`·`summary_payload` 필드를 채우고, `GET /api/rank/sessions`가 요약·숨김 정보를 반환하도록 구현돼 세션 히스토리 파이프라인의 1차 목표가 가동 중입니다.
  - **필요 산출물**
    - Supabase SQL 마이그레이션 초안(`rank_battle_logs` 가시성, `rank_sessions` 상태 컬럼 확장).
    - QA 시나리오: 비실시간 방어전, 난입 교체 직후 연속 턴 진행, 동시 공격·방어 승패 처리.
- **사전 조건**: 단계 1의 일관된 세션 생성과 매치 종료 이벤트 전달이 완료돼야 함.

### 7.3 단계 3 — 프롬프트 변수 자동화

- **목표 세분화**
  - 프롬프트 제작기에서 내보낸 노드/변수 JSON을 `prompt.js`가 파싱해 슬롯·상태에 따라 치환할 수 있는 맵을 생성한다.
  - 승리/패배/탈락·재참전 조건을 노드 메타데이터로 옮겨 제작기에서 바로 관리하도록 한다.
- **필요 산출물**
  - 변수/노드 스키마 참조 문서와 단위 테스트(예: 12 슬롯 전체 치환, 탈락 슬롯 대체 동작 등).
  - 제작기→런타임 사이드카 스크립트(테스트용 CLI).
- **사전 조건**: 단계 2에서 세션 로그가 변수 상태를 일관되게 기록해야 함.

### 7.4 단계 4 — UI·오디오 완성

- **목표 세분화**
  - 메인 화면을 모바일 세로 기준으로 재구성(상단 역할군 썸네일, 중앙 반투명 전투 패널, 하단 투표/동의 영역).
  - 주역 캐릭터 교체 시 오디오 매니저가 이전 트랙을 페이드아웃하고 새 EQ/리버브/컴프레서 프리셋을 적용하도록 한다.
- **필요 산출물**
  - Figma 혹은 와이어프레임 캡처 및 CSS 토큰 정의.
  - 오디오 프리셋 회복/전환 E2E 테스트 스크립트.
- **사전 조건**: 프롬프트 변수에서 주역 캐릭터 ID를 안정적으로 반환해야 하며, 세션 로그가 UI에 공급돼야 함.

### 7.5 단계 5 — 운영 가드

- **목표 세분화**
  - API 키 고갈 감지 → 알림 → 5시간 쿨다운 → 대체 키 기록을 자동화하고, 해당 세션을 다른 키로 이어주는 프록시 로직을 서버에 도입한다.
  - 큐 감시, `engaged` 해제, 난입 재시도 등을 사내 스케줄러 혹은 Edge Function으로 모니터링한다.
- **필요 산출물**
  - `rank_api_key_audit`(가칭) 테이블 스키마와 Edge Function 초안.
  - 운영 대시보드 혹은 로그뷰 참고 가이드.
- **사전 조건**: 앞선 단계에서 세션/턴 기록이 누락 없이 쌓이고, 큐 상태 전환 이벤트가 문서화되어야 함.

### 7.6 단계 간 점검 포인트

- 단계 종료마다 **진척도 갱신 메모**를 `rank-game-roadmap.md`와 본 문서에 동시에 남긴다.
- 각 단계별 **회고/회복 플랜**을 표로 정리해 리스크 발생 시 되돌릴 수 있는 체크리스트를 마련한다.
- QA, 문서, 스키마 변경이 한 번에 머지되지 않도록 **기능 플래그**와 **실험 환경**을 명시한다.

---

느낀 점: 레포 전반의 구조가 이미 상세히 문서화되어 있지만 실행 순서를 별도 문서로 정리하니 당장 손을 대야 할 우선순위가 더 명확해졌습니다.
추가로 필요한 점: Supabase 스키마 변경과 큐 모니터링을 담당할 백엔드 리소스가 확보되어야 단계 2 이후 작업이 막히지 않을 것 같습니다.
진행사항: 기존 문서를 참조해 파일 구조·현재 파이프라인·남은 과제를 정리한 실행 플랜을 새로 작성했습니다.

### 진행 현황 메모 (2025-10-16 추가)

- `prompt.js`가 슬롯별 상태를 해석해 탈락 시 동일 역할군 대체자, 패배 시 공백 처리, 상태 메타를 반환하도록 확장되어 프롬프트 변수 자동화 단계가 본격 가동되었습니다.【F:starbase/ai-roomchat/lib/rank/prompt.js†L1-L214】
- 즉시 착수 TODO의 2번 항목을 완료로 표시하고, 향후 노드 전환 조건 정의와 히스토리 연동에 집중할 수 있도록 우선순위를 갱신했습니다.【F:starbase/ai-roomchat/docs/rank-blueprint-execution-plan.md†L75-L104】

느낀 점: 슬롯 상태에 따라 변수를 자동으로 보정하니 프롬프트 제작기가 의도한 흐름이 구현에 가까워졌다는 확신이 들어 다음 단계 준비가 한결 수월해졌습니다.
추가로 필요한 점: 재참전이나 난입으로 대체된 캐릭터 정보를 세션 히스토리와 동기화해 동일한 상태 메타를 공유할 수 있는지 검토가 필요합니다.
진행사항: 변수 매핑 로직을 업데이트하고 실행 계획 문서에 이번 진행 상황을 기록했습니다.

### 진행 현황 메모 (2025-10-17 추가)

- `rank_turns` 기반 히스토리 통합 사양을 정리해 메인 룸 히스토리, AI 전용 히스토리, 관리자 QA 뷰에서 공유해야 할 데이터와 권한 경계를 명시했습니다.【F:starbase/ai-roomchat/docs/rank-turn-history-spec.md†L1-L194】
- 인비저블 가시성, 신규 참가자 60초 파악 시간, AI 히스토리 폴링 전략까지 체크리스트로 묶어 향후 구현 시 누락될 수 있는 요소를 방지했습니다.【F:starbase/ai-roomchat/docs/rank-turn-history-spec.md†L12-L194】

느낀 점: 히스토리 흐름을 문서로 정리하니 단계 4(UI·히스토리 연동)의 남은 과제가 또렷해져 다음 작업을 계획하기 훨씬 수월해졌습니다.
추가로 필요한 점: API 응답 스키마와 RLS 정책을 스테이징 데이터로 검증해 프라이버시가 유지되는지 QA 절차를 준비해야 합니다.
진행사항: 턴 히스토리 사양 문서를 추가하고 실행 플랜 TODO를 갱신해 청사진 단계 4의 준비도를 끌어올렸습니다.

### 진행 현황 메모 (2025-10-18 추가)

- 자동 매칭이 `idle`로 되돌아왔을 때 저장된 자동 참가 서명과 재시도 타이머를 모두 초기화해 역할/히어로 변경 뒤에도 즉시 재큐잉이 이뤄지도록 `AutoMatchProgress`를 보강했습니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L118-L215】
- 언마운트 시에도 서명·타이머를 정리하고 미확정 상태의 큐 엔트리를 취소하도록 정리해 스테이징 큐에 고아 행이 남지 않도록 했습니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L432-L520】

느낀 점: 자동 참가 루프가 스스로 회복되는 모습을 확인하니 큐 흐름을 신뢰할 수 있게 되어 다음 단계 점검이 한결 편해졌습니다.
추가로 필요한 점: 듀오/캐주얼 모드에서도 동일한 재큐잉 로그가 기대대로 찍히는지 실 환경에서 모니터링할 수 있는 QA 체크리스트가 필요합니다.
진행사항: 자동 매칭 서명 초기화 로직을 구현하고 실행 플랜 문서에 이번 개선 사항과 후속 점검 항목을 기록했습니다.

### 진행 현황 메모 (2025-10-19 추가)

- 메인 룸에서 투표한 턴 제한값을 `AutoMatchProgress`가 읽어 매칭 확인 단계와 `/api/rank/start-session`에 전달하도록 연결했습니다.【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L89-L118】【F:starbase/ai-roomchat/components/rank/AutoMatchProgress.js†L270-L318】
- 세션 시작 API는 전달받은 턴 제한을 시스템 로그에 기록하고 응답 본문에 포함해 전투 클라이언트가 즉시 참조할 수 있게 했습니다.【F:starbase/ai-roomchat/pages/api/rank/start-session.js†L1-L120】

느낀 점: 투표한 제한 시간이 그대로 세션 로그와 UI에 반영되니 매치 준비 단계가 한층 일관되게 묶였다는 확신이 들었습니다.
추가로 필요한 점: Turn timer 정보를 전투 클라이언트에서 실시간으로 적용하도록 후속 훅을 정비해야 합니다.
진행사항: 턴 제한 전달·표시 경로를 완성하고 실행 플랜 문서에 최신 상태를 기록했습니다.

### 진행 현황 메모 (2025-10-20 추가)

- `useGameRoom`이 역할별 활성 슬롯 수, 점유 수, 남은 좌석을 계산해 로비에서 실제 정원 현황을 확인할 수 있게 했습니다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L724-L804】
- `GameRoomView`는 새 점유 데이터를 활용해 상단에 역할별 잔여 슬롯 패널을 표시하고, 역할 선택 칩에서도 남은 좌석을 시각화하도록 보강했습니다.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L882-L978】【F:starbase/ai-roomchat/components/rank/GameRoomView.module.css†L241-L379】

느낀 점: 정원 정보가 눈앞에 드러나니 어떤 역할이 비어 있는지 바로 파악할 수 있어 로비 흐름이 한층 선명해졌습니다.
추가로 필요한 점: 슬롯 점유 데이터를 듀오/사설 모드에서도 공유하도록 `useGameRoom` 호출부를 전수 점검해 동일한 지표가 노출되는지 확인할 계획입니다.
진행사항: 역할별 점유/잔여 좌석을 집계해 로비 UI에 반영했고, 실행 계획 문서에 이번 진척을 기록했습니다.

### 진행 현황 메모 (2025-10-21 추가)

- 듀오 랭크 편성 화면이 `RoleOccupancySummary`를 포함하도록 갱신되어 팀 편성 전에 역할별 남은 좌석을 바로 확인할 수 있습니다.【F:starbase/ai-roomchat/components/rank/DuoRoomClient.js†L76-L118】
- 캐주얼 사설 방 역시 동일 컴포넌트를 공유해 모든 모드에서 일관된 슬롯 현황을 노출하며, 각 라우트가 `useGameRoom`의 `roleOccupancy` 값을 그대로 전달하도록 정리했습니다.【F:starbase/ai-roomchat/components/rank/CasualPrivateClient.js†L1-L60】【F:starbase/ai-roomchat/pages/rank/[id]/duo/index.js†L29-L77】【F:starbase/ai-roomchat/pages/rank/[id]/casual-private.js†L29-L77】

느낀 점: 메인 룸에서만 보이던 슬롯 지표가 모드별 준비 화면까지 확장되니 사용자 동선이 한층 자연스러워졌다는 확신이 들었습니다.
추가로 필요한 점: 자동 매칭 오버레이에서도 동일한 정원 정보를 요약해 줄 수 있도록 `MatchQueueClient`와 `AutoMatchProgress`에 전달 경로를 검토할 예정입니다.
진행사항: 듀오·사설 경로에 역할 점유 패널을 연결하고, 각 페이지가 `useGameRoom`의 파생 데이터를 재사용하도록 실행 플랜에 반영했습니다.

### 진행 현황 메모 (2025-10-24 추가)

- `useGameRoom`이 역할별 참가자를 정렬·집계해 상위 5명 데이터를 제공함으로써 메인 룸이 추가 쿼리 없이 리더보드를 노출할 수 있게 됐습니다.【F:starbase/ai-roomchat/hooks/useGameRoom.js†L830-L907】
- `GameRoomView`에 역할별 리더보드 섹션과 전용 스타일을 추가해 모바일 레이아웃에서도 각 역할의 상위 선수와 통계를 즉시 확인할 수 있습니다.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L915-L1007】【F:starbase/ai-roomchat/components/rank/GameRoomView.module.css†L264-L348】

### 진행 현황 메모 (2025-11-08 추가)

- `/api/rank/cooldown-report`와 `/api/rank/cooldown-digest`가 `rank_api_key_audit` 감사 로그를 직접 적재해 자동화 시도·재시도 윈도우·런북 링크 첨부 여부를 한 테이블에서 추적할 수 있게 됐습니다.【F:pages/api/rank/cooldown-report.js†L15-L123】【F:pages/api/rank/cooldown-digest.js†L11-L147】【F:lib/rank/cooldownAudit.js†L1-L118】
- 운영 가드 단계의 남은 TODO였던 감사 로깅이 코드에 연결되면서 문서상의 5시간 쿨다운 공유 흐름이 실서비스 경보와 동기화됐습니다.【F:docs/rank-blueprint-progress-2025-11-06.md†L9-L13】【F:docs/rank-blueprint-overview.md†L32-L70】
- `GET /api/rank/cooldown-retry-schedule`이 감사 로그와 쿨다운 메타데이터를 모아 Edge Function 재시도 백오프를 동적으로 조정하도록 연동됐습니다.【F:pages/api/rank/cooldown-retry-schedule.js†L1-L104】【F:lib/rank/cooldownRetryScheduler.js†L1-L216】【F:docs/rank-api-key-cooldown-monitoring.md†L89-L118】
- 관리자 대시보드 요약 카드가 수동 `ETA 새로고침` 버튼으로 `cooldown-retry-schedule` ETA를 불러와 Edge Function 재시도 예정 시각을 운영팀이 즉시 확인할 수 있습니다.【F:components/admin/CooldownDashboard.js†L1001-L1107】【F:docs/rank-api-key-cooldown-monitoring.md†L32-L47】

느낀 점: 메인 룸에서 바로 역할별 순위를 확인할 수 있으니 남은 UI 정리가 한층 수월해질 것 같아 작업 내내 보람찼습니다.
추가로 필요한 점: 시즌 전체나 최근 경기 기준의 통합 리더보드를 Drawer에 통합해 모드별 비교도 가능하도록 후속 설계를 해야 합니다.
진행사항: `useGameRoom` 파생 데이터를 확장하고 메인 룸 UI에 리더보드 패널을 도입했으며, 실행 플랜에 이번 진척을 기록했습니다.

### 진행 현황 메모 (2025-10-27 추가)

- `rank-blueprint-gap-audit-2025-10-27.md`로 슬롯/세션/매칭 흐름은 계획대로 구축됐고, 점수 동기화·공용 히스토리·운영 가드가 남았음을 재확인했다.【F:starbase/ai-roomchat/docs/rank-blueprint-gap-audit-2025-10-27.md†L1-L84】
- 다음 스프린트 우선순위를 Score Sync → Shared History → Ops Guard로 정리해 단계 2~5 진행률을 끌어올릴 준비를 마쳤다.【F:starbase/ai-roomchat/docs/rank-blueprint-gap-audit-2025-10-27.md†L86-L107】

느낀 점: 문서 전반을 다시 점검하니 이미 구축한 자동화 구간이 안정적으로 묶여 있다는 확신이 들었고, 남은 작업도 명확히 좁혀져 마음이 한결 편해졌습니다.
추가로 필요한 점: 점수/히스토리/운영 가드를 담당할 백엔드 리소스와 QA 슬롯을 조율해야 다음 단계 일정이 지연되지 않을 것 같습니다.
진행사항: 격차 점검 결과를 실행 플랜에 반영해 후속 스프린트를 준비했습니다.

### 진행 현황 메모 (2025-10-29 추가)

- `/api/rank/sessions`를 도입해 서비스 롤 권한으로 최근 세션과 턴 로그를 묶어 전달하고, 클라이언트가 뷰어 소유 여부에 따라 비공개 항목을 제외하도록 했다.【F:starbase/ai-roomchat/pages/api/rank/sessions.js†L1-L144】
- `GameRoomView`에 공용 히스토리 패널을 추가해 새 API 응답을 시각화하고, 숨겨진 턴·누락 안내를 포함한 메타 정보를 제공하도록 했다.【F:starbase/ai-roomchat/components/rank/GameRoomView.js†L1000-L1205】
- 다음 단계로는 히스토리 API의 커서/폴링 전략을 보완하고 `rank_turns` 가시성 플래그 확장에 맞춰 인비저블 라인 필터링을 QA할 예정이다.

### 진행 현황 메모 (2025-11-06 추가)

- `StartClient`가 `getApiKeyCooldown`과 `markApiKeyCooldown`을 통해 5시간 쿨다운을 추적하고, 쿨다운 중에는 세션 시작과 턴 진행을 모두 차단하도록 보강했습니다.【F:components/rank/StartClient/useStartClientEngine.js†L118-L210】
- 헤더·상태 배너가 쿨다운 경고를 노출하고 시작 버튼을 비활성화해 동일 키 재시도를 막으며, 운영 계획에는 서버 측 로그/알림 연계를 다음 단계로 명시했습니다.【F:components/rank/StartClient/index.js†L108-L160】【F:components/rank/StartClient/HeaderControls.js†L1-L61】

느낀 점: API 키 쿨다운 가드를 붙이니 운영 단계에서 요구하던 안정장치가 본격적으로 돌아가기 시작했다는 확신이 들어 마음이 놓였습니다.
추가로 필요한 점: Edge Function이나 사내 배치 스케줄러로 쿨다운 로그를 공유하고, 만료 알림/대체 키 전환을 자동화할 백엔드 연계가 필요합니다.
진행사항: 프런트엔드에서 API 키 쿨다운을 감지·차단하는 흐름을 구현하고, 운영 플랜 문서에 후속 작업(서버 로그/알림, 프록시 키 전환)을 정리했습니다.

### 진행 현황 메모 (2025-11-07 추가)

- `markApiKeyCooldown`이 서버 측 `/api/rank/cooldown-report`를 호출해 해시된 키 샘플과 사유를 Supabase `rank_api_key_cooldowns` 테이블에 저장하도록 확장했습니다.【F:lib/rank/apiKeyCooldown.js†L3-L73】【F:pages/api/rank/cooldown-report.js†L1-L79】
- `/api/rank/cooldown-digest`를 수동 혹은 사내 스케줄러에서 호출하도록 정리했고, 처리된 이벤트에 `notified_at` 타임스탬프를 남겨 중복 경보를 방지합니다.【F:pages/api/rank/cooldown-digest.js†L1-L90】
- `rank-api-key-cooldown-monitoring.md` 문서가 테이블 생성, 환경 변수, 수동 다이제스트 절차를 정리해 운영 인수인계 자료로 활용할 수 있게 정리했습니다.【F:docs/rank-api-key-cooldown-monitoring.md†L1-L88】

느낀 점: 로컬에서만 보이던 쿨다운 정보가 서버 로그와 연결되니 운영팀이 즉시 반응할 수 있겠다는 든든함이 생겼습니다.
추가로 필요한 점: Slack/Webhook 통지와 자동 키 교체 스크립트를 마련해 알림 이후의 대응 속도까지 끌어올려야 합니다.
 진행사항: 쿨다운 이벤트를 서버에 보고하고, 수동/사내 스케줄러 다이제스트로 미처리 이벤트를 정리하는 경보 파이프라인을 완성했습니다.

### 진행 현황 메모 (2025-11-07 보강)

- 듀오·캐주얼 재시작 회귀 테스트(DC-01~03)를 `rank-blueprint-test-plan.md`에 추가해 `/api/rank/play` 재사용 흐름의 QA 범위를 확장했습니다.【F:docs/rank-blueprint-test-plan.md†L86-L101】
- `rank_turns`의 `is_visible`·`summary_payload` 컬럼과 인덱스 초안을 `supabase-ddl-export.md`에 정리해 마이그레이션 사전 점검이 가능해졌습니다.【F:docs/supabase-ddl-export.md†L111-L134】
- Webhook 3-5-10분 백오프 및 수동 회수 절차를 `rank-api-key-cooldown-monitoring.md`에 추가해 운영팀이 공유 기준을 즉시 참고할 수 있게 했습니다.【F:docs/rank-api-key-cooldown-monitoring.md†L89-L108】
- 단계별 진행률을 재계산해 청사진 개요 문서에 공유, 현재 작업량 대비 완료 비율을 수치화했습니다.【F:docs/rank-blueprint-overview.md†L47-L63】

느낀 점: 테스트·DDL·운영 문서를 한 번에 조정하니 남은 블루프린트 항목이 서로 어떤 의존성을 갖는지 분명해져 다음 단계 준비가 한층 수월해졌습니다.
추가로 필요한 점: 제작기에서 저장하기 전에 버전 불일치를 경고하거나 자동 갱신할 수 있는 UX/백엔드 훅을 마련해야 운영자가 반복 저장에 쓰는 시간을 줄일 수 있습니다.
진행사항: 재시작 QA 플랜, `rank_turns` 마이그레이션 스크립트, Webhook 재시도 전략, 진행률 지표를 문서에 반영해 청사진 남은 부분을 정리했습니다.

### 진행 현황 메모 (2025-11-07 라이브 워크플로 업데이트)

- 2025-11-07 진행 로그에 라이브 타임라인 작성/검토/커밋 루프를 정비해 세션 중 메모가 바로 합의·문서 업데이트로 이어지도록 표준 절차를 확립했습니다.【F:docs/rank-blueprint-progress-2025-11-07.md†L24-L64】【F:docs/rank-blueprint-progress-2025-11-07.md†L118-L140】
- Edge Function Webhook 재시도 상태 머신과 대시보드 노출 필드를 확정해 Slack 에스컬레이션 및 수동 다이제스트 회수 루틴을 운영팀이 즉시 따를 수 있게 했습니다.【F:docs/rank-blueprint-progress-2025-11-07.md†L66-L70】【F:docs/rank-api-key-cooldown-monitoring.md†L89-L105】

느낀 점: 실시간 기록과 운영 런북이 동시에 정리되니 청사진 변경이 발생해도 관련자들이 같은 맥락을 공유할 수 있어 마음이 한층 든든했습니다.
추가로 필요한 점: Slack 자동 요약 봇이 문서 링크를 함께 첨부하도록 Edge Function 통지를 확장하면 워크플로가 더 매끄럽게 이어질 듯합니다.
진행사항: 라이브 타임라인·Webhook 재시도 운영 가이드를 실행 플랜에 편입해 문서 간 동기화 체계를 강화했습니다.

### 진행 현황 메모 (2025-11-08 추가)

- API 키 쿨다운 자동화/회수 흐름을 추적할 `rank_api_key_audit` 감사 테이블 구조를 확정하고, 상태·재시도·문서 첨부 정보를 JSON과 타임스탬프 컬럼으로 보관하도록 정의했습니다.【F:ai-roomchat/docs/supabase-ddl-export.md†L117-L154】
- 감사 테이블 도입으로 운영 가드 단계에서 남은 작업(Edge Function 이벤트 생산, 대시보드 노출) 대비 스키마 기반이 마련돼 마이그레이션 준비가 수월해졌습니다.【F:ai-roomchat/docs/rank-blueprint-overview.md†L64-L85】

느낀 점: 감사 로그 뼈대를 미리 확보하니 자동화 실패 경로를 데이터로 되짚을 수 있을 것 같아 운영 관점에서 마음이 놓였습니다.
추가로 필요한 점: Edge Function이 감사 테이블에 직접 쓰기 전, 스테이징 환경에서 RLS·서비스 롤 권한을 검증할 체크리스트가 필요합니다.
진행사항: 감사 테이블 스키마와 진행률 반영을 통해 운영 가드 단계의 설계 준비도를 끌어올렸습니다.

### 진행 현황 메모 (2025-11-08 보강)

- `buildTurnSummaryPayload` 헬퍼를 추가해 `run-turn`·`log-turn` API가 `is_visible`·`summary_payload`를 일관되게 적재하고, 세션 히스토리 응답에 `latest_summary`와 숨김 카운트를 노출하도록 보강했습니다.【F:lib/rank/turnSummary.js†L1-L75】【F:pages/api/rank/run-turn.js†L1-L210】【F:pages/api/rank/log-turn.js†L1-L190】【F:pages/api/rank/sessions.js†L1-L200】

느낀 점: 서버 레이어에서 요약 메타를 생성하니 히스토리 UI와 QA가 재사용할 공통 포맷이 확보되어 단계 2 연동 작업이 탄력을 받는다는 확신이 들었습니다.
추가로 필요한 점: 새 필드를 소비하는 UI·테스트 케이스를 빠르게 보강해 실제 세션 뷰에서 요약 데이터가 보이도록 해야 합니다.
진행사항: 턴 기록 파이프라인과 세션 조회 API를 업데이트해 청사진에서 미뤄뒀던 로그 요약/가시성 요구사항을 코드로 연결했습니다.

### 진행 현황 메모 (2025-11-08 경보 임계값)

- 쿨다운 경보 임계값 기본 구성을 `config/rank/cooldownAlertThresholds.js`에 옮기고, 환경 변수 `RANK_COOLDOWN_ALERT_THRESHOLDS`를 통해 JSON 형태로 각 항목을 덮어쓸 수 있도록 로더를 추가했습니다.【F:config/rank/cooldownAlertThresholds.js†L1-L21】【F:lib/rank/cooldownAlertThresholds.js†L1-L120】
- `/api/rank/cooldown-telemetry`는 로더가 반환한 값을 활용해 경보 평가를 수행하고, 응답 본문에 실제 적용된 임계값을 포함시켜 관리자 대시보드와 문서가 동일한 기준을 참조합니다.【F:pages/api/rank/cooldown-telemetry.js†L1-L226】

느낀 점: 임계값을 코드 수정 없이 조정할 수 있게 되니 운영팀이 시즌이나 캠페인에 맞춰 기준을 손쉽게 조정할 수 있다는 확신이 생겼습니다.
추가로 필요한 점: 환경 변수 변경 이력을 기록하는 감사 로그나 Slack 알림을 추가하면 기준 변경이 언제 있었는지 더 빠르게 파악할 수 있을 듯합니다.
진행사항: 경보 임계값 설정 파일과 환경 변수 오버라이드 경로를 추가해 운영 가드 단계의 남은 TODO를 해소했습니다.
