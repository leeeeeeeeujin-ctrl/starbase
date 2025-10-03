# 실시간·난입 매칭 계층화 블루프린트 (초안)

## 개요
- **목표**: 실시간 옵션과 난입 옵션 조합에 따라 진행 중인 전투 재합류 → 실시간 참가자 매칭 → 비실시간 후보 보강까지 단계적으로 수행하는 매칭 파이프라인을 구축한다.
- **현황**: `/api/rank/match`는 실시간 옵션이 꺼진 경우에만 참가자 풀을 섞어 빈 슬롯을 채운다. 난입/재합류, 실시간 전용 표본 축소가 분리되어 있지 않아 비실시간 테스트에서 슬롯 검증이 일관되지 않았다.
- **범위**: API 파이프라인, `useMatchQueue` 클라이언트 훅, Supabase 스키마(세션/슬롯 인덱스, 점수 힌트 열), 운영 문서 업데이트.

## 진행률
| 단계 | 설명 | 상태 | 진행도 |
| --- | --- | --- | --- |
| 1 | 실시간+난입 대상 탐색 설계 및 스키마 요구사항 정리 | 완료 | 100% |
| 2 | 실시간 전용 표본 축소(큐 참가자 한정) 로직 구현 | 완료 | 100% |
| 3 | 비실시간 보강(참가자 풀 샘플링)과 표준 매칭 통합 | 진행 중 | 65% |

- **총괄 진행률**: 88% (드롭인 좌석 점유, 실시간 표본 축소, 비실시간 샘플링 1차 적용)
- **최근 갱신**: 2025-11-16

## 단계별 작업 내역
### 1단계 – 실시간+난입 대상 탐색
- [x] 파이프라인 스텁 추가: `lib/rank/matchingPipeline.js`에 `extractMatchingToggles`, `loadMatchingResources`, `findRealtimeDropInTarget` 스켈레톤을 도입해 단계별 로직을 분리.
- [x] API 연동: `/api/rank/match`가 새 파이프라인을 호출하고, 실시간+난입 조합일 때 먼저 `findRealtimeDropInTarget`을 시도하도록 분기.
- [x] 세션/슬롯 인덱스 구현: `rank_room_slots`에 `(room_id, role, occupant_owner_id)` 인덱스, `rank_sessions`에 `rating_hint` 컬럼과 `(status, game_id, updated_at desc)` 인덱스를 추가해 난입 좌석 탐색을 가속.【F:supabase.sql†L948-L951】【F:supabase.sql†L1076-L1079】
- [x] 난입 좌석 점유: 실시간 대상이 발견되면 슬롯을 선점하고 `rank_rooms.filled_count`를 즉시 갱신하도록 서버 파이프라인을 확장.【F:lib/rank/matchingPipeline.js†L1-L283】【F:pages/api/rank/match.js†L140-L159】

### 2단계 – 실시간 표본 축소
- [x] `findRealtimeDropInTarget` 완성: 실시간 난입 후보를 점수 윈도우 기반으로 평가하고, 빈 슬롯을 차지한 뒤 드롭인 매치 응답을 반환한다.【F:lib/rank/matchingPipeline.js†L118-L283】
- [x] 표본 필터링: 실시간 모드에서는 대기열만 표본으로 사용하고, 비실시간만 참가자 풀을 보강한다.【F:lib/rank/matchingPipeline.js†L83-L114】
- [x] 큐 상태 잠금: 드롭인 성공 시 즉시 큐 엔트리를 `matched`로 잠그고 히어로 정보를 응답에 포함해 클라이언트 메시지가 일관되도록 했다.【F:pages/api/rank/match.js†L140-L169】
- [x] 클라이언트 알림: 실시간 난입·보강이 확정되면 `MatchQueueClient`가 룸 코드, 점수 윈도우, 큐 표본 요약을 함께 보여 주도록 안내 문구를 다듬었다.【F:components/rank/MatchQueueClient.js†L215-L238】【F:components/rank/MatchQueueClient.js†L614-L669】

### 3단계 – 비실시간 보강 & 표준 매칭
- [x] `buildCandidateSample` 확장: 비실시간 보강 시 점수 윈도우/역할별 최대치/총 샘플 제한을 적용해 후보를 선별한다.【F:lib/rank/matchingPipeline.js†L300-L373】
- [x] 매칭 결과 리포트: `/api/rank/match` 응답에 표본 메타데이터(`sampleMeta`)를 포함해 실시간/비실시간 모두 동일한 구조로 반환한다.【F:pages/api/rank/match.js†L172-L210】
- [ ] QA 체크리스트: 솔로/듀오/캐주얼 조합별 테스트 시나리오 문서화.
- [ ] 비실시간 잔여 작업: 샘플 메타 데이터 기반 재시도/경고 UX, QA용 로그 정리를 진행.

## 필요한 Supabase 스키마 확장
| 테이블 | 컬럼/인덱스 | 비고 |
| --- | --- | --- |
| `public.rank_sessions` | `rating_hint integer` (nullable) | 최근 전투 기준 점수대 추적. drop-in 필터링에 사용. **(적용 완료)** |
| `public.rank_sessions` | 인덱스 `(status, game_id, updated_at desc)` | 진행 중 세션 빠르게 탐색. **(적용 완료)** |
| `public.rank_room_slots` | 인덱스 `(room_id, role, occupant_owner_id)` | 역할별 빈 슬롯 조회 가속. **(적용 완료)** |
| `public.rank_participants` | 인덱스 `(game_id, role, status, updated_at desc)` | 비실시간 후보 스캔 가속. **(적용 완료)** |
| `public.rank_match_queue` | 기존 컬럼 | 실시간 표본 축소 단계에서는 별도 확장 없이 대기열 데이터 사용.

> 스키마 변경분은 `docs/supabase-rank-schema.sql`과 배포 SQL에 반영 필요. 실제 생성 시 RLS 정책 갱신 여부도 확인할 것.

## 다음 작업
1. 실시간 난입 성공 시 `MatchQueueClient` 자동 안내/리디렉션 UX를 QA하고, 드롭인 실패 재시도 로직을 보강한다. (담당: 라라, ETA 2025-11-21)
2. 비실시간 보강 단계에서 참가자 풀 셔플/윈도우 확장 로직을 설계하고, 실패 원인 리포트를 추가한다. (담당: 류, ETA 2025-11-24)
3. 난입 매치 로그를 운영 대시보드에서 추적할 수 있도록 이벤트/세션 기록 요약을 설계한다. (담당: 세민, ETA 2025-11-27)

