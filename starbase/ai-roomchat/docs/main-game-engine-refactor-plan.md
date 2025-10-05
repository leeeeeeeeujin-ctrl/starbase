# 메인게임 엔진 통합 리팩토링 계획

## 1. 배경과 목표
- **증상**
  - 매칭 페이지에서는 역할별 슬롯과 프롬프트 세트가 정상적으로 보이지만, 게임 입장 후 엔진이 슬롯/프롬프트 메타를 누락함.
  - 턴 진행 시 `Cannot access 'Q' before initialization`, `Cannot access 'Z' before initialization` 등 모듈 초기화 순환 의존성 오류가 재발.
  - 동일 캐릭터가 양측 슬롯에 중복 배정되고, 프롬프트 세트가 비어 있어 턴 처리 로직이 흐트러짐.
- **궁극적 목표**
  1. 매칭 → 게임 엔진으로 이어지는 데이터 파이프라인을 명확히 정리하고 단일 소스로 관리.
  2. 슬롯, 프롬프트, 매치 메타데이터를 일관성 있게 주입해 중복 배정과 프롬프트 누락을 근본적으로 방지.
  3. 엔진 초기화·턴 진행 경로에서 순환 의존성/TDZ(Temporal Dead Zone) 문제가 재발하지 않도록 구조 개선.

## 2. 현재 구조 진단 액션
1. **매칭 출력 확인**
   - `lib/rank/matching.js`가 생성하는 `assignments` 구조(역할, heroIds, groupKey 등)와 `startMatchMeta.assignments` 저장 방식 점검.
   - 매칭 페이지에서 세션 스토리지에 쌓는 `startMatchMeta` 직렬화 포맷 샘플 캡처.
2. **게임 엔진 입력 경로 확인**
   - `useStartClientEngine`에서 `consumeStartMatchMeta()` → `matchingMetadata` → `resolveSlotBinding` → `buildSlotsFromParticipants` 흐름 추적.
   - `loadGameBundle`가 가져오는 프롬프트 세트/그래프 번들을 언제/어디에 캐시하는지 조사.
3. **Supabase/Realtime 상태 확인**
   - `realtimeSessionManager`와 `timelineState`가 초기 스냅샷을 만들 때 매칭 메타를 어떻게 병합하는지 살펴보고, 누락된 필드 확인.
   - `rank_participants`에서 `slot_no`·`hero_id` 백필이 실제로 되는지 QA 환경 레코드 점검.
4. **순환 의존성 원인 역추적**
   - `engine/realtimeReasons`, `timelineLogBuilder`, `finalizeRealtimeTurn` 일련의 import 그래프 시각화.
   - 번들에서 `Cannot access 'Q'`가 지목한 구체 모듈과 라인(소스맵 기반) 추적.

## 3. 타깃 아키텍처 개요
- **단일 매치 컨텍스트 객체**
  - `startMatchMeta`, Supabase `rank_games`, `rank_participants`, `rank_prompts` 정보를 수집해 `MatchContext`로 재구성.
  - 필수 필드: `roles`, `slots`(역할별 정렬된 hero list), `promptSets`, `scoreWindow`, `matchCode`, `source`, `turnTimer`.
- **초기화 파이프라인**
  1. 클라이언트 진입 시 `MatchContextLoader` 훅에서 병렬 fetch (Supabase RPC + local storage) 수행.
  2. 로더가 완성된 `MatchContext`를 `StartEngineProvider`에 주입.
  3. 엔진 내부 로직은 `MatchContext`만 참조하고, 세션 스토리지/전역 단일체 접근 제거.
- **슬롯/프롬프트 동기화**
  - 매칭 시점 hero/slot 매핑을 `match_assignments` 테이블 혹은 `rank_game_slots` 업데이트로 고정.
  - 엔진은 Supabase의 권위 데이터를 우선 사용하고, 누락 시에만 `startMatchMeta`를 보조로 사용.
  - `buildSlotsFromParticipants`를 역할 기준 정렬 + 중복 검증하는 `normalizeMatchSlots`로 교체.
- **턴 진행 모듈 구조 조정**
  - `turnAdvanceController`, `realtimeFinalizer`, `timelineLogger` 세 모듈로 분리.
  - 각 모듈은 `MatchContext` 의존성만 받고, 서로를 직접 import하지 않도록 인터페이스화.

## 4. 구현 단계 로드맵
| 단계 | 목표 | 핵심 작업 | 산출물 |
| --- | --- | --- | --- |
| 0. 사전 준비 | 현재 상태 스냅샷 확보 | 매칭/게임 진입 콘솔 로그 캡처, Supabase 매치 레코드 export | 조사 노트 (`docs/main-game-refactor-discovery.md`) |
| 1. 데이터 모델 정리 | MatchContext 설계 | 필드 정의, 타입 선언(`types/match.ts`), 소스별 동기화 정책 문서화 | MatchContext 스펙 문서 |
| 2. 로더 분리 | 초기화 안정화 | `useStartClientEngine`에서 데이터 fetch/준비 로직을 `useMatchContextLoader`로 분리 | 새 훅 + 테스트 |
| 3. 슬롯/프롬프트 통합 | 데이터 일관성 확보 | `normalizeMatchSlots`, `resolvePromptSet` 도입, 중복 감지 에러 핸들링 | 유닛 테스트, QA 체크리스트 |
| 4. 턴 엔진 재배치 | TDZ 제거 | `turnAdvanceController`, `finalizeRealtimeTurn` 등 모듈 단위 재구성, 의존성 주입 패턴 적용 | 리팩터된 엔진 모듈 |
| 5. 회귀 테스트 | 문제 재발 방지 | 매칭→게임 흐름 수동 QA, Realtime 이벤트 모의 테스트, Jest/Playwright 보강 | 테스트 리포트 |
| 6. 배포/모니터링 | 운영 전환 | feature flag 혹은 단계적 롤아웃, 런타임 로그/알림 설정 | 릴리즈 노트, 알림 대시보드 |

## 5. 상세 체크리스트
### 5.1 MatchContext 정의
- [ ] `MatchContext` 타입 설계 (roles, slots, participants, heroMap, promptSets, meta).
- [ ] 매칭 결과(`assignments`)와 Supabase 엔티티 간 매핑 테이블 정리.
- [ ] 누락 필드 fallback 순서 정의 (예: slot_no → startMatchMeta.assignments → role default).

### 5.2 로더/프로바이더 리팩토링
- [ ] `useMatchContextLoader` 훅 초안 작성 및 기존 `useStartClientEngine`에서 참조하도록 변경.
- [ ] 로더 단계에서 비동기 호출 순서/에러 처리 규칙 정리 (Promise.all, timeout 등).
- [ ] 초기화 성공 시 `StartEngineProvider`에 context 전달, 실패 시 사용자-facing 에러 배너 표준화.

### 5.3 슬롯 및 프롬프트 정합성 강화
- [ ] `normalizeMatchSlots`에서 역할별 정렬, heroId/ownerId 중복 검사, 누락 슬롯 자동 채움 로직 구현.
- [ ] `resolvePromptSet`이 게임 번들/프롬프트 테이블에서 우선순위대로 가져오도록 개선.
- [ ] QA: 매칭된 3인 전원 다른 캐릭터인지 확인하는 자동/수동 테스트 시나리오 추가.

### 5.4 턴 엔진 구조 개선
- [ ] `finalizeRealtimeTurn`을 독립 서비스로 옮기고, 상태 콜백을 props로 주입.
- [ ] `timelineLogBuilder`/`realtimeReasons`/`battleLogDraft` 간 import cycle 제거.
- [ ] 턴 진행 진입점(`advanceTurn`, `handleManualTurn`, `handleTimeout`)에서 공통 컨트롤러 호출하도록 통합.

### 5.5 테스트 & 검증
- [ ] 유닛: `matchRankParticipants`가 hero 중복을 방지하는지 케이스 추가.
- [ ] 통합: `useMatchContextLoader` mocking 테스트로 슬롯/프롬프트 삽입 확인.
- [ ] E2E: Playwright로 매칭 → 게임 입장 → 2턴 진행 시나리오 작성, 중복 캐릭터/프롬프트 누락 여부 검증.
- [ ] 실환경 로그: Supabase Realtime 구독 상태, 프롬프트 적용 로그 수집.

## 6. 리스크 및 대응
- **데이터 불일치**: QA 환경과 운영 환경 스키마 차이 → 마이그레이션 스크립트/백필 절차 사전 준비.
- **롤백 난이도**: 대규모 리팩토링으로 회귀 위험 → feature flag(예: `START_ENGINE_V2`)로 점진 롤아웃.
- **성능 우려**: 초기화 시 복수 API 호출 증가 → 캐싱 전략(세션 스토리지 / in-memory) 명시.

## 7. 일정 초안
| 주차 | 목표 | 주요 산출물 |
| --- | --- | --- |
| 1주차 | 조사 + MatchContext 설계 | Discovery 로그, MatchContext 스펙, 리스크 정리 |
| 2주차 | 로더/슬롯 통합 | `useMatchContextLoader`, 슬롯 정규화 코드, 단위 테스트 |
| 3주차 | 턴 엔진 재구성 | 컨트롤러/파이널라이저 분리, 순환 의존성 제거 |
| 4주차 | QA & 배포 준비 | 통합 테스트, 릴리즈 플랜, 모니터링 설정 |

---
**메모**: 모든 구현 단계마다 매칭 메타데이터 샘플(JSON)과 Supabase 실데이터를 대조하는 검증 절차를 문서(`docs/main-game-refactor-checklist.md`)로 병행 작성한다.
