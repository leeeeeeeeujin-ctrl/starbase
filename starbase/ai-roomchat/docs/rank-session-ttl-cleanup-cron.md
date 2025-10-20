# Rank 세션 TTL 정리 Edge Function 크론 등록 가이드

`rank-session-ttl-cleanup` Edge Function은 세션 메타(`rank_session_meta`)와 턴 이벤트(`rank_turn_state_events`)의 TTL을 주기적으로 정리해
데이터베이스 상태를 클라이언트 캐시와 일치시키는 역할을 한다. 아래 절차를 따르면 Supabase 프로젝트에 함수를 배포하고,
Cron 스케줄을 등록한 뒤 실행 결과를 `rank_game_logs`에 기록할 수 있다.

## 1. Edge Function 배포
1. 서비스 롤 키를 `.env` 또는 Supabase CLI 설정에 포함시킨다.
2. 다음 명령으로 함수를 배포한다. (JWT 검증이 필요 없으므로 `--no-verify-jwt` 옵션을 추가한다.)
   ```bash
   supabase functions deploy rank-session-ttl-cleanup --project-ref <project-id> --no-verify-jwt
   ```
3. `SUPABASE_URL`과 `SUPABASE_SERVICE_ROLE_KEY`가 Edge Function 환경 변수에 등록되어 있는지 확인한다. (`supabase functions secrets` 명령으로 설정 가능)

## 2. Cron 스케줄 등록
Supabase는 Edge Function 배포 시 `--schedule` 인자를 지정하거나, CLI를 통해 스케줄을 별도로 생성할 수 있다. 아래 예시는 30분마다
세션 정리를 실행하는 방법이다.

```bash
supabase functions deploy rank-session-ttl-cleanup \
  --project-ref <project-id> \
  --no-verify-jwt \
  --schedule "*/30 * * * *"
```

이미 함수를 배포했다면 `supabase functions schedule create` 명령으로도 등록할 수 있다.

```bash
supabase functions schedule create rank-session-ttl-cleanup-30m \
  --project-ref <project-id> \
  --cron "*/30 * * * *" \
  --function "rank-session-ttl-cleanup"
```

필요에 따라 `--cron` 값을 조정해 TTL 정리 주기를 결정한다. 클라이언트의 TTL 워커가 6시간 간격으로 실행된다면
`0 */6 * * *` 스케줄을 추천한다.

## 3. 실행 결과 로깅 확인
Edge Function은 실행이 끝날 때마다 `rank_game_logs` 테이블에 다음 정보를 기록한다.

- `event_type`: `session_ttl_cleanup_completed`, `session_ttl_cleanup_failed`, `session_ttl_cleanup_rejected`
- `payload`: `cutoffMinutes`, `batchLimit`, 삭제된 세션 수, 삭제된 턴 이벤트 수, RPC 결과 목록 등이 담긴 JSON
- `error_code`: 실패 시 Supabase 에러 코드 (`rpc_failed` 등)

로그는 `source = 'edge:rank-session-ttl-cleanup'`으로 저장되며, 다음 SQL로 최근 실행 내역을 확인할 수 있다.

```sql
select created_at, event_type, error_code, payload
from public.rank_game_logs
where source = 'edge:rank-session-ttl-cleanup'
order by created_at desc
limit 20;
```

필요하다면 Supabase Log Drains나 외부 Observability 파이프라인으로 `rank_game_logs`를 연동해 장기 보관/알림에 활용할 수 있다.

## 4. 모니터링/경보 팁
- Supabase Cron 대시보드에서 마지막 성공 시각과 오류 메시지를 확인할 수 있다.
- 실패 로그(`event_type = 'session_ttl_cleanup_failed'`)가 2회 이상 연속 발생하면 Slack/메일 알림을 트리거하도록
  [Database Webhooks](https://supabase.com/docs/guides/database/webhooks)나 외부 워커를 연결한다.
- `batch_limit` 값을 줄여도 삭제 대상이 많은 경우 RPC가 여러 번 실행될 수 있으므로, 모니터링 파이프라인에서
  `payload->>'deletedSessions'` 합계를 기준으로 경고 임계치를 설정한다.

## 5. 참고 자료
- SQL 스니펫: `docs/sql/cleanup-rank-session-snapshots.sql`
- Edge Function 소스: `supabase/functions/rank-session-ttl-cleanup/index.ts`
- 전체 배포 가이드: `docs/supabase-rank-session-sync-guide.md`
