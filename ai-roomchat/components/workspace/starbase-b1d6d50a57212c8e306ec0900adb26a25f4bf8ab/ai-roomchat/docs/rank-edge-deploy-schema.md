# Rank Edge Function Deploy Audit Schema

Supabase Edge Function 배포 자동화를 감시하고 Pager/Slack 경보와 재시도 알림을 남기기 위해 `rank_edge_function_deployments` 테이블을 유지합니다. 운영 환경에서는 아래 컬럼이 모두 생성됐는지 확인하세요.

| 컬럼            | 타입          | 기본값/설명                                                                                 |
| --------------- | ------------- | ------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| `id`            | `uuid`        | `uuid_generate_v4()` 기본값. 각 배포 시도를 고유 식별자로 기록합니다.                       |
| `function_name` | `text`        | 배포 대상 Edge Function 이름 (`rank-match-timeline`, `rank-api-key-rotation` 등).           |
| `status`        | `text`        | `succeeded` / `retrying` / `failed` 중 하나. Slack/Pager 알림과 동일한 상태를 보관합니다.   |
| `attempt`       | `smallint`    | 1부터 시작하는 현재 시도 횟수.                                                              |
| `max_attempts`  | `smallint`    | 자동화 스크립트가 허용한 최대 시도 횟수. 재시도 한계를 파악할 때 사용합니다.                |
| `exit_code`     | `smallint`    | Supabase CLI 프로세스 종료 코드. 미보고 시 `null`.                                          |
| `duration_ms`   | `integer`     | 해당 시도에 소요된 시간(ms). 성능 추세 분석에 활용합니다.                                   |
| `logs`          | `text`        | 표준 출력/에러 요약(최대 3,000자). 세부 로그는 CI 아티팩트와 비교할 때 참고합니다.          |
| `next_retry_at` | `timestamptz` | 다음 재시도 예정 시각. 마지막 실패(`failed`)일 경우 `null`.                                 |
| `environment`   | `text`        | `staging`/`production` 등 배포 타깃 환경 라벨. 스모크 테스트 결과도 동일 라벨로 기록합니다. |
| `metadata`      | `jsonb`       | 자동화 버전·단계(`phase=deploy                                                              | smoke`)·스모크 테스트 URL 목록 등을 JSON으로 남깁니다. |
| `created_at`    | `timestamptz` | `now()` 기본값. 시도 기록 생성 시각.                                                        |

## 인덱스 및 RLS

- `(function_name, created_at desc)`와 `(status, created_at desc)` 인덱스로 최근 실패/재시도 기록을 빠르게 조회합니다.
- `(environment, created_at desc)` 인덱스로 스테이징/프로덕션 배포 이력을 빠르게 필터링합니다.
- RLS는 `select` 전체 허용, `insert`는 `service_role`만 허용하도록 구성했습니다. 배포 자동화 스크립트는 서비스 롤 키로 실행돼야 합니다.

이 테이블은 Slack/Pager 경보와 동일한 메타데이터를 보관하며, `function_name='smoke-tests'` 레코드는 배포 후 스모크 테스트 결과를 담습니다. 관제 대시보드·감사 로그에서 Edge Function 배포 상태와 스모크 테스트 추세를 함께 추적할 때 참고합니다.
