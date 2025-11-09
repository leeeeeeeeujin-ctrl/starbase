# 비실시간 자동 충원 통계 대시보드 설계

`sessionMeta.asyncFill`과 Supabase RPC(`refresh_match_session_async_fill`)가 수집하는 데이터를 기반으로, 운영팀이 비실시간(대기열) 매치를 모니터링할 수 있는 통계 대시보드를 설계한다. 본 문서는 어떤 지표를 계산해야 하는지와 필요한 뷰·Edge Function·임시 테이블을 정리한다.

## 1. 수집 경로 요약

- 클라이언트는 `matchDataStore`가 계산한 대기열 스냅샷을 `/api/rank/session-meta`를 통해 `rank_session_meta.async_fill_snapshot`에 저장한다.【F:modules/rank/matchDataStore.js†L600-L690】【F:pages/api/rank/session-meta.js†L73-L155】
- 서버는 `refresh_match_session_async_fill` RPC로 호스트 역할 좌석 제한, 대기 슬롯, 후보 큐를 재계산해 같은 테이블에 기록한다.【F:docs/sql/refresh-match-session-async-fill.sql†L1-L210】
- StartClient는 세션 메타와 `rank_turn_state_events`를 조합해 드롭인 타임라인을 생성하고, 대기열 이벤트를 프런트 타임라인에 기록한다.【F:components/rank/StartClient/useStartClientEngine.js†L622-L1003】【F:lib/rank/dropInTimeline.js†L12-L137】

## 2. 핵심 지표

| 지표                      | 설명                                                | 계산 방법                                                                                                         |
| ------------------------- | --------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `queued_fill_count`       | 비실시간 게임에서 자동으로 충원된 인원 수           | `rank_turn_state_events`의 드롭인 보너스 이벤트에서 `extras.fillQueue` 길이를 누적                                |
| `async_fill_wait_ms_avg`  | 대기열 진입부터 슬롯 배정까지 평균 대기 시간        | `rank_session_meta.async_fill_snapshot.pendingSeatIndexes`가 0이 될 때까지의 이벤트 간격 측정                     |
| `host_role_shortage_rate` | 호스트 역할 좌석 중 빈 슬롯 비율                    | `seatLimit.allowed - assigned.length` / `seatLimit.allowed`                                                       |
| `fallback_to_queue_ratio` | 방장이 수동 시작을 누르기 전에 대기열이 채워진 비율 | `rank_turn_state_events` 중 `turn-extension` 타입에서 `dropIn.queueDepth > 0`인 이벤트 수 / 전체 수동 시작 이벤트 |
| `retry_start_count`       | 대기열 부족으로 매치가 다시 시작된 횟수             | `rank_sessions` 로그에서 `auto_fill_retry` 플래그 합계                                                            |

## 3. Supabase 뷰/매터리얼라이즈 전략

1. **`view_rank_async_fill_snapshots`**: `rank_session_meta`에서 `async_fill_snapshot` JSON을 구조화한다. 열 예시
   ```sql
   create materialized view if not exists public.view_rank_async_fill_snapshots as
   select
     session_id,
     coalesce((async_fill_snapshot->>'mode'), 'off') as mode,
     (async_fill_snapshot->'seatLimit'->>'allowed')::int as seat_allowed,
     (async_fill_snapshot->'seatLimit'->>'total')::int as seat_total,
     jsonb_array_length(coalesce(async_fill_snapshot->'pendingSeatIndexes', '[]'::jsonb)) as pending_count,
     jsonb_array_length(coalesce(async_fill_snapshot->'fillQueue', '[]'::jsonb)) as queue_depth,
     coalesce(async_fill_snapshot->>'hostRole', '역할 미지정') as host_role,
     coalesce(async_fill_snapshot->>'generatedAt', '0')::bigint as generated_at_ms,
     updated_at
   from public.rank_session_meta;
   ```
2. **`view_rank_async_fill_events`**: `rank_turn_state_events`에서 드롭인 보너스 이벤트만 분리한다. `extras->'dropIn'`에 큐 정보가 들어있다.【F:components/rank/StartClient/useStartClientEngine.js†L740-L1003】
3. **지표 집계 함수**: 위 뷰를 조합해 기간별(예: 1일, 7일) 통계를 반환하는 RPC `get_rank_async_fill_metrics(p_start, p_end)`를 작성한다. 이 함수는 관리자 대시보드에서 호출한다.

## 4. Edge Function 및 백엔드 연동

- **Edge Function `rank-async-fill-metrics`(가칭)**: 관리자 토큰을 검증한 뒤 `get_rank_async_fill_metrics`를 호출하고 JSON으로 반환한다. Vercel/Next.js Admin 콘솔이 이를 호출한다.
- **실시간 알림**: Supabase Realtime에서 `rank_turn_state_events` insert 이벤트를 수신해 대기열이 임계값 이상일 때 Slack/Webhook으로 알린다. 알림 페이로드에는 `host_role`, `queue_depth`, `pending_count`를 포함한다.

## 5. 대시보드 와이어프레임

1. **Top Summary Cards**
   - "하루 평균 대기열" (`avg(queue_depth)`).
   - "호스트 좌석 부족 비율" (`avg(pending_count / nullif(seat_allowed,0))`).
   - "드롭인 보너스 사용률" (`count(turn-extension with bonus)/count(total turns)`).
2. **시간대별 라인 차트**
   - `queue_depth`와 `pending_count`의 시간 추이.
   - 드롭인 보너스 적용 시각 표시.
3. **테이블**
   - 최근 20건의 비실시간 매치: 호스트 역할, 허용 좌석, 대기열 길이, 충원까지 걸린 시간.
   - 자동 충원 실패 사례(`queue_depth = 0`인데 `pending_count > 0`)를 강조.
4. **분포 그래프**
   - `seat_allowed` 대비 실제 `assigned` 분포. `async_fill_snapshot.assigned` 길이를 사용한다.【F:docs/sql/refresh-match-session-async-fill.sql†L80-L180】

## 6. 운영 체크리스트

- [ ] `refresh_match_session_async_fill`를 주기적으로 실행하는 Cron Edge Function이 구성되어 있는가?
- [ ] 뷰/매터리얼라이즈가 `rank_session_meta` 업데이트에 맞춰 `refresh materialized view` 스케줄을 갖고 있는가?
- [ ] 대시보드 접근 권한이 관리자 그룹으로 제한되어 있는가?
- [ ] 큐 길이가 임계값 이상일 때 자동 알림이 동작하는가?

## 7. 향후 확장 아이디어

- `async_fill_snapshot.fillQueue`에 기록된 후보의 `score`·`recentMatches`를 분석해 매칭 품질을 평가한다.
- `rank_turn_state_events`의 `extras.dropIn` 데이터를 기반으로 드롭인 보너스가 적용된 횟수와 추가 시간의 상관관계를 시각화한다.
- 수집 데이터를 BigQuery로 내보내 장기 보관 및 ML 모델링에 활용한다.

---

느낀 점: 대기열 스냅샷을 뷰로 분해해두면 운영팀이 비실시간 매치 병목을 빠르게 파악할 수 있을 것 같다.
추가로 필요한 점: Cron Edge Function과 관리자용 RPC를 실제로 구현해 데이터를 정기적으로 축적할 필요가 있다.
진행사항: 비실시간 자동 충원 통계 대시보드 설계와 필요한 SQL/지표 정의를 문서화했다.
