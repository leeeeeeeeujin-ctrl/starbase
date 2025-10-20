# Rank Session Timeline Backend Spec

이 문서는 `rank_session_timeline_events` 테이블과 Supabase 백엔드가 발행해야 하는 타임라인 이벤트 페이로드 스키마를 정리합니다. 클라이언트는 이 스키마를 기준으로 실시간 관전 타임라인과 베틀로그 재생 화면을 구성합니다.

## 1. 테이블 정의

| 컬럼 | 타입 | 설명 |
| --- | --- | --- |
| `id` | `uuid` | 기본 키. `gen_random_uuid()` 기본값. |
| `session_id` | `uuid` | `rank_sessions.id` FK. 세션 삭제 시 cascade. |
| `game_id` | `uuid` | `rank_games.id` FK. 세션과 동일 게임 식별자. |
| `event_id` | `text` | 클라이언트/백엔드가 생성한 이벤트 고유 ID. 유니크 인덱스. |
| `event_type` | `text` | 이벤트 종류 (`warning`, `proxy_escalated`, `drop_in_joined`, `api_key_pool_replaced`, `drop_in_matching_context`, `turn_timeout`, `consensus_reached` 등). |
| `owner_id` | `text` | 이벤트 관련 참가자(플레이어/슬롯) 식별자. 문자열 형태 유지. |
| `reason` | `text` | 이벤트 발생 사유 또는 상태 코드. |
| `strike` | `integer` | 경고 누적 횟수. 없으면 `NULL`. |
| `remaining` | `integer` | 남은 경고/기회 수. 없으면 `NULL`. |
| `limit_remaining` | `integer` | 최대 허용 횟수. 없으면 `NULL`. |
| `status` | `text` | 이벤트 처리 후 상태 (`active`, `proxy`, `spectating`, `defeated` 등). |
| `turn` | `integer` | 이벤트가 발생한 턴 번호. 없으면 `NULL`. |
| `event_timestamp` | `timestamptz` | 이벤트 발생 시각. 기본값 `now()`. 클라이언트는 ms 단위 타임스탬프를 ISO 문자열로 변환해 저장. |
| `context` | `jsonb` | 역할/캐릭터/모드/세션 라벨 등 UI 메타데이터. |
| `metadata` | `jsonb` | API 키 교체, 난입 매칭 메타데이터 등 추가 정보. |
| `created_at` | `timestamptz` | 레코드 생성 시각. 기본값 `now()`. |

### 인덱스 & 정책
- `event_id` 유니크 인덱스 (`rank_session_timeline_events_event_id_key`).
- `(session_id, event_timestamp desc)` 보조 인덱스.
- RLS: `select`는 전체 공개, `insert`는 `service_role` 전용.

## 2. 이벤트 발행 규칙

1. **API 라우트**: `/api/rank/log-turn`은 클라이언트에서 전달받은 타임라인 페이로드를 `sanitizeTimelineEvents`로 정규화한 뒤 `rank_session_timeline_events`에 업서트합니다. `event_id` 충돌 시 최신 메타데이터로 갱신합니다.
2. **Realtime/웹훅 동기화**: 테이블에 기록된 동일한 이벤트 객체를 Supabase Realtime 채널(`rank:timeline-event`)과 Slack/Webhook 알림으로 동시에 브로드캐스트합니다.
3. **백엔드 서비스**: 매치 메타(`drop_in_matching_context`)와 API 키 풀 교체(`api_key_pool_replaced`) 이벤트는 Supabase 백엔드 함수도 동일 스키마로 `event_id`를 생성해 업서트/브로드캐스트해야 합니다. `supabase/functions/rank-match-timeline`과 `supabase/functions/rank-api-key-rotation`이 이를 담당하며, 실패 시 Slack/Webhook 경보를 동시에 발행합니다.
4. **타임라인 조회**: 관전/재생 화면용 `/api/rank/sessions`는 `timelineLimit` 파라미터를 받아 세션별 최근 이벤트를 조회합니다. 응답은 `timeline_events` 배열로 포함되며 각 항목은 `TimelineSection`이 소비할 수 있는 정규화된 객체입니다.

## 3. 클라이언트 기대치

- `context.sessionLabel`, `context.sessionCreatedAt`이 존재할 경우 타임라인 UI에서 세션 구분 정보를 표시합니다.
- `metadata.apiKeyPool` 및 `metadata.matching` 구조는 다음 키를 포함할 수 있습니다:
  - `apiKeyPool.source`, `provider`, `poolId`, `rotationId`, `reason`, `newSample`, `replacedSample`, `viewerId`
  - `matching.matchType`, `matchCode`, `dropInTarget.role`, `dropInMeta.queueSize`, `sampleMeta`
- 이벤트 배열은 시간 역순(desc)으로 정렬된 상태로 전달하는 것이 기본이며, 클라이언트는 최대 80개까지 표시합니다.

## 4. 마이그레이션 노트

- 기존 데이터베이스에는 `rank_session_timeline_events`가 없으므로 `supabase.sql`에 정의된 스키마를 적용한 뒤 서비스 롤 API에 업서트 로직을 추가해야 합니다.
- 백엔드 함수/Edge Functions가 기존에 Slack만 알리던 경고·난입 이벤트도 이제 동일한 `event_id`/`event_type` 포맷으로 테이블에 기록해야 합니다.
- 대량 삽입 시 `event_timestamp`는 ms 단위 숫자 → ISO 문자열로 변환한 값을 사용하십시오.

