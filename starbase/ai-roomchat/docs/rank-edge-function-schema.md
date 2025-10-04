# Rank Edge Function Schema Checklist

Supabase Edge Functions가 `drop_in_matching_context`와 `api_key_pool_replaced` 타임라인 이벤트를 발행하려면 아래 테이블 컬럼이 배포 환경에 준비되어 있어야 합니다. 마이그레이션이나 스키마 복구 시 이 목록을 기준으로 빠짐없이 생성됐는지 확인하세요.

## 1. `public.rank_session_timeline_events`
| 컬럼 | 타입 | 필수 여부 | 설명 |
| --- | --- | --- | --- |
| `id` | `uuid` | 기본값 | 기본 키. `gen_random_uuid()` 사용. |
| `session_id` | `uuid` | ✅ | `rank_sessions.id` FK. 세션 삭제 시 cascade. |
| `game_id` | `uuid` | 선택 | 세션과 연결된 게임 ID. |
| `event_id` | `text` | ✅ | 이벤트 고유 식별자. 유니크 인덱스(`rank_session_timeline_events_event_id_key`). |
| `event_type` | `text` | ✅ | `warning`, `proxy_escalated`, `api_key_pool_replaced`, `drop_in_matching_context` 등 이벤트 종류. |
| `owner_id` | `text` | 선택 | 이벤트와 연관된 플레이어/슬롯 ID. |
| `reason` | `text` | 선택 | 발생 사유 또는 상태 코드. |
| `strike` / `remaining` / `limit` | `integer` | 선택 | 경고 누적·남은 기회·허용 한도. 필요 없으면 `NULL`. |
| `status` | `text` | 선택 | `active`, `proxy`, `spectating`, `defeated` 등 후속 상태. |
| `turn` | `integer` | 선택 | 이벤트가 발생한 턴 번호. |
| `event_timestamp` | `timestamptz` | 기본값 | 이벤트 발생 시각. Edge Function은 ms 단위 타임스탬프를 ISO로 변환해 저장. |
| `context` | `jsonb` | 선택 | UI 레이블, 모드, 세션 라벨 등 보조 정보. |
| `metadata` | `jsonb` | 선택 | API 키 풀 메타, 매칭 큐 정보 등 구조화된 페이로드. |
| `created_at` | `timestamptz` | 기본값 | 레코드 생성 시각. |

> RLS 정책: `select` 전체 허용, `insert`는 `service_role`만 허용. Edge Function은 서비스 롤 키로 실행되어야 합니다.

## 2. `public.rank_api_key_cooldowns`
Edge Function이 키 풀 교체 이유를 로깅할 때 참조하는 테이블입니다. 최소한 다음 컬럼이 필요합니다.

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | 기본 키. |
| `key_hash` | `text` | 고유 인덱스. 키 식별용 해시. |
| `reason` | `text` | 고갈/교체 사유. |
| `provider` | `text` | OpenAI, Gemini 등 공급자. |
| `metadata` | `jsonb` | Edge Function이 남긴 회수/교체 메타데이터. |
| `recorded_at` / `reported_at` / `notified_at` | `timestamptz` | 발생/보고/알림 시각. |

감사용 `public.rank_api_key_audit` 테이블도 `cooldown_id`, `status`, `retry_count`, `automation_payload`, `inserted_at` 등을 포함하도록 생성되어야 합니다.

## 3. 매칭 관련 테이블 요약
난입 매칭 메타를 기록할 때 Edge Function이 참조하는 주요 컬럼입니다.

| 테이블 | 핵심 컬럼 | 설명 |
| --- | --- | --- |
| `public.rank_sessions` | `id`, `game_id`, `mode`, `status`, `turn`, `created_at` | 타임라인 이벤트가 속한 세션 정보. |
| `public.rank_match_queue` | `id`, `game_id`, `mode`, `role`, `owner_id`, `score`, `joined_at`, `status`, `match_code` | 난입 큐/매칭 로그에 포함되는 기본 필드. |
| `public.rank_matchmaking_logs` | `id`, `match_code`, `stage`, `status`, `reason`, `metadata` | 매칭 파이프라인 단계 기록. Edge Function 메타(`drop_in_meta`, `role_status`, `assignments`)는 `metadata`에 저장. |

위 컬럼이 준비돼 있으면 Edge Function이 생성한 타임라인 이벤트를 운영 대시보드, 관전 타임라인, Slack/Webhook 알림에서 동일하게 활용할 수 있습니다.

## 4. Edge Function 배포 감사 로그
CI에서 Edge Function 배포 실패/재시도/성공 이력을 추적하려면 `public.rank_edge_function_deployments` 테이블이 필요합니다. 컬럼·인덱스·RLS 요건은 [`docs/rank-edge-deploy-schema.md`](./rank-edge-deploy-schema.md)를 참고하세요.
