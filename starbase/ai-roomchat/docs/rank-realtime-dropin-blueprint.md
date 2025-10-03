# 실시간·난입 매칭 계층화 블루프린트 (초안)

## 개요
- **목표**: 실시간 옵션과 난입 옵션 조합에 따라 진행 중인 전투 재합류 → 실시간 참가자 매칭 → 비실시간 후보 보강까지 단계적으로 수행하는 매칭 파이프라인을 구축한다.
- **현황**: `/api/rank/match`는 실시간 옵션이 꺼진 경우에만 참가자 풀을 섞어 빈 슬롯을 채운다. 난입/재합류, 실시간 전용 표본 축소가 분리되어 있지 않아 비실시간 테스트에서 슬롯 검증이 일관되지 않았다.
- **범위**: API 파이프라인, `useMatchQueue` 클라이언트 훅, Supabase 스키마(세션/슬롯 인덱스, 점수 힌트 열), 운영 문서 업데이트.

## 진행률
| 단계 | 설명 | 상태 | 진행도 |
| --- | --- | --- | --- |
| 1 | 실시간+난입 대상 탐색 설계 및 스키마 요구사항 정리 | 진행 중 | 40% |
| 2 | 실시간 전용 표본 축소(큐 참가자 한정) 로직 구현 | 준비 중 | 10% |
| 3 | 비실시간 보강(참가자 풀 셔플)과 표준 매칭 통합 | 준비 중 | 0% |

- **총괄 진행률**: 17% (1단계 중간점 통과)
- **최근 갱신**: 2025-11-13

## 단계별 작업 내역
### 1단계 – 실시간+난입 대상 탐색
- [x] 파이프라인 스텁 추가: `lib/rank/matchingPipeline.js`에 `extractMatchingToggles`, `loadMatchingResources`, `findRealtimeDropInTarget` 스켈레톤을 도입해 단계별 로직을 분리.
- [x] API 연동: `/api/rank/match`가 새 파이프라인을 호출하고, 실시간+난입 조합일 때 먼저 `findRealtimeDropInTarget`을 시도하도록 분기.
- [ ] 세션/슬롯 인덱스 설계: 진행 중. 난입 탐색에 필요한 `rank_sessions.status`, `rank_room_slots.role`, `rank_room_slots.ready_at` 인덱스를 문서화 예정.
- [ ] 점수 힌트 열 정의: 진행 중. `rank_sessions` 또는 `rank_battles`에 최근 점수대 추적용 `rating_hint` 컬럼 추가 필요성 검토.

### 2단계 – 실시간 표본 축소
- [ ] `findRealtimeDropInTarget` 완성: 진행 중. 현재는 `null`을 반환하며, 이후 실시간 인입 게임 탐색 로직/점수 윈도우 계산을 채울 계획.
- [ ] 표본 필터링: 실시간 모드일 때 큐 데이터만 대상으로 삼고, 난입 실패 시 기존 표본을 유지하도록 API에 반영(스텁 완료, 구현 예정).
- [ ] 클라이언트 알림: 실시간 난입 성공 시 `useMatchQueue`가 즉시 매치 확정 안내를 표출하도록 Hook 확장 필요.

### 3단계 – 비실시간 보강 & 표준 매칭
- [ ] `buildCandidateSample` 확장: 비실시간 보강 시 점수 폭 확대, 참가자 풀 샘플 크기 제한 등을 추가할 계획.
- [ ] 매칭 결과 리포트: 실시간/비실시간 결과 모두 동일 구조로 반환되도록 `/api/rank/match` 응답 정리.
- [ ] QA 체크리스트: 솔로/듀오/캐주얼 조합별 테스트 시나리오 문서화.

## 필요한 Supabase 스키마 확장
| 테이블 | 컬럼/인덱스 | 비고 |
| --- | --- | --- |
| `public.rank_sessions` | `rating_hint integer` (nullable) | 최근 전투 기준 점수대 추적. drop-in 필터링에 사용. |
| `public.rank_sessions` | 인덱스 `(status, game_id, updated_at desc)` | 진행 중 세션 빠르게 탐색.
| `public.rank_room_slots` | 인덱스 `(session_id, role, ready_at nulls last)` | 역할별 빈 슬롯 조회 가속.
| `public.rank_match_queue` | 기존 컬럼 | 실시간 표본 축소 단계에서는 별도 확장 없이 대기열 데이터 사용.

> 스키마 변경분은 `docs/supabase-rank-schema.sql`과 배포 SQL에 반영 필요. 실제 생성 시 RLS 정책 갱신 여부도 확인할 것.

## 다음 작업
1. `rank_sessions`/`rank_room_slots`에 필요한 인덱스와 `rating_hint` 컬럼을 추가하고, 문서/SQL을 갱신한다. (담당: 류, ETA 2025-11-20)
2. `findRealtimeDropInTarget`에 진행 중 세션 검색 및 역할 빈 슬롯 검사를 구현한다. (담당: 류, ETA 2025-11-22)
3. `useMatchQueue`에 실시간 난입 성공 시나리오 토스트/배너를 추가한다. (담당: 라라, ETA 2025-11-25)

