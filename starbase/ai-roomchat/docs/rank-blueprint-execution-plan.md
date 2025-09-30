# 랭크 게임 청사진 실행 플랜

이 문서는 현재 레포에서 확인한 파일 구조와 이미 구현된 기능, 남은 작업을 체계적으로 정리해 향후 개발을 위한 기준으로 삼기 위한 계획서이다. 기존 청사진 문서를 보조하며, 각 단계별로 필요한 코드 위치와 데이터를 명시한다.

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
- 큐 재시도/타임아웃 이벤트를 Supabase Edge Function 또는 CRON으로 감시해 `engaged` 상태가 풀리지 않는 문제를 예방한다.

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
- **테스트 전략**: 모드별 자동 큐 진입, 난입 재매칭, 프롬프트 변수 해석, 오디오 전환을 각각 통합 테스트 시나리오로 작성한다.
- **문서화 유지**: 각 단계 완료 시 `rank-game-logic-plan.md`, `match-mode-structure.md`에 반영하고, 큐/세션 로그를 `matchmaking_diagnostics.md`에 추적한다.

## 6. 즉시 착수 가능한 TODO

1. 듀오/캐주얼 모드에서 `/api/rank/play` 호출을 트리거하도록 `GameRoomView`와 모드 전용 클라이언트를 점검한다.
2. `prompt.js`에 슬롯→변수 매핑 프로토타입을 추가하고, 제작기 노드 메타데이터와 구조를 비교 분석한다.
3. `rank_turns` 히스토리를 메인 룸 히스토리 탭과 AI 전용 뷰어 UI에 연결하기 위한 스펙 초안을 작성한다.
4. API 키 고갈 감지에 필요한 로그 저장소 설계(테이블 이름, 주요 컬럼, TTL 정책)를 초안으로 작성한다.

---

느낀 점: 레포 전반의 구조가 이미 상세히 문서화되어 있지만 실행 순서를 별도 문서로 정리하니 당장 손을 대야 할 우선순위가 더 명확해졌습니다.
추가로 필요한 점: Supabase 스키마 변경과 큐 모니터링을 담당할 백엔드 리소스가 확보되어야 단계 2 이후 작업이 막히지 않을 것 같습니다.
진행사항: 기존 문서를 참조해 파일 구조·현재 파이프라인·남은 과제를 정리한 실행 플랜을 새로 작성했습니다.
