# Realtime Troubleshooting — Rank Match Ready Flow

## Symptom

- 클라이언트에서 `Unable to subscribe to changes with given parameters` 오류가 출력되며 실시간 이벤트가 도착하지 않습니다.
- 매치 준비 화면에 세션 정보가 비어 있고 `세션 정보가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.` 메시지가 반복됩니다.

## Root Cause

Supabase Realtime 게시(publication)에 `rank_match_roster`, `rank_sessions`, `rank_rooms`, `rank_session_meta` 테이블이 등록되어 있지 않거나, 프로젝트 대시보드에서 해당 테이블의 Realtime 전파가 비활성화된 상태입니다. 실시간 진단 패널에서도 동일한 메시지를 확인할 수 있습니다.

## Fix

1. Supabase SQL Editor에서 다음 스크립트를 실행해 실시간 게시에 필요한 테이블을 추가합니다.

```sql
alter publication supabase_realtime add table
  public.rank_match_roster,
  public.rank_sessions,
  public.rank_rooms,
  public.rank_session_meta;
```

> 이미 게시에 포함된 테이블이 있으면 PostgreSQL이 `42710` 오류를 반환합니다. 이는 중복 추가를 시도했다는 의미일 뿐이므로, 아래처럼
> `pg_publication_tables`에서 존재 여부를 확인하거나 예외를 무시하는 DO 블록을 실행하면 매번 안전하게 적용할 수 있습니다.

```sql
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_match_roster'
  ) then
    alter publication supabase_realtime add table public.rank_match_roster;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_sessions'
  ) then
    alter publication supabase_realtime add table public.rank_sessions;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_rooms'
  ) then
    alter publication supabase_realtime add table public.rank_rooms;
  end if;

  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_session_meta'
  ) then
    alter publication supabase_realtime add table public.rank_session_meta;
  end if;
end $$;
```

2. Supabase Dashboard → Database → Replication → Realtime 탭으로 이동해 위 테이블들이 모두 활성화되었는지 확인합니다. 비활성화된 항목이 있다면 스위치를 켜주세요.

3. 실시간 채널이 다시 연결되는지 확인하려면 매치 준비 화면에서 진단 패널을 열어 `실시간 채널 오류`가 사라졌는지, `실시간 상태`가 `SUBSCRIBED` 혹은 `CONNECTED`로 전환되었는지 확인합니다.

## Verification Checklist

- [ ] `select * from pg_publication_tables where pubname = 'supabase_realtime';` 쿼리 결과에 네 개의 테이블이 모두 포함된다.
- [ ] 진단 패널에 노출되는 `실시간 채널 오류`가 비어 있으며, 마지막 이벤트 타임스탬프가 갱신된다.
- [ ] 매치 세션이 준비 상태로 전환되면 메인 게임으로 진입할 수 있다.

## Ready-check 401 Unauthorized

### Symptom

- 브라우저 네트워크 패널에 `POST /api/rank/ready-check 401 (Unauthorized)`가 반복해서 찍히고 진단 패널에 준비 신호 실패 메시지가 표시된다.

### Root Cause

클라이언트가 Supabase 액세스 토큰 없이 준비 신호 API를 호출하면 API 라우트가 `Authorization` 헤더를 찾지 못해 401을 반환한다. 세션이 만료되었거나 브라우저가 아직 토큰을 복원하지 못한 초기 상태에서 주로 발생한다.

### Fix

1. 클라이언트는 `requestMatchReadySignal` 호출 전에 `supabase.auth.getSession()`으로 액세스 토큰을 확보하고, 준비 신호 요청에 `Authorization: Bearer <token>` 헤더를 포함해야 한다. 2025-11-08 패치에서 이 로직이 자동화되었다.
2. 사용자가 장시간 대기했거나 새 탭에서 바로 진입한 경우, 진단 패널 안내에 따라 페이지를 새로고침하거나 다시 로그인해 세션을 갱신한다.

### Verification Checklist

- [ ] 개발자 도구 네트워크 패널에서 `ready-check` 요청이 200으로 응답하고, 요청 헤더에 `Authorization: Bearer ...`가 포함되어 있다.
- [ ] Match Ready 진단 패널의 준비 신호 상태가 정상으로 표시되며 `세션 인증이 만료되었습니다` 경고가 사라진다.

## Notes

- 실시간 게시에 테이블을 추가한 뒤에는 Supabase가 해당 테이블의 변경 사항을 스트림하기 시작합니다. 만약 RLS 정책이 너무 제한적이라면 Realtime이 이벤트를 전송하지 못할 수 있으므로, `enable_realtime` 정책을 별도로 구성해야 할 수도 있습니다.
- 테스트 및 스테이징 환경에서도 동일한 게시 구성이 유지되도록 마이그레이션 스크립트나 IaC 코드에 위 SQL을 포함하는 것이 좋습니다.
