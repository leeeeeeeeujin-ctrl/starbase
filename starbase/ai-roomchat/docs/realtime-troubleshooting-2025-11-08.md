# Realtime Troubleshooting — Rank Match Ready Flow

## Symptom
* 클라이언트에서 `Unable to subscribe to changes with given parameters` 오류가 출력되며 실시간 이벤트가 도착하지 않습니다.
* 매치 준비 화면에 세션 정보가 비어 있고 `세션 정보가 준비되지 않았습니다. 잠시 후 다시 시도해 주세요.` 메시지가 반복됩니다.

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

2. Supabase Dashboard → Database → Replication → Realtime 탭으로 이동해 위 테이블들이 모두 활성화되었는지 확인합니다. 비활성화된 항목이 있다면 스위치를 켜주세요.

3. 실시간 채널이 다시 연결되는지 확인하려면 매치 준비 화면에서 진단 패널을 열어 `실시간 채널 오류`가 사라졌는지, `실시간 상태`가 `SUBSCRIBED` 혹은 `CONNECTED`로 전환되었는지 확인합니다.

## Verification Checklist
- [ ] `select * from pg_publication_tables where pubname = 'supabase_realtime';` 쿼리 결과에 네 개의 테이블이 모두 포함된다.
- [ ] 진단 패널에 노출되는 `실시간 채널 오류`가 비어 있으며, 마지막 이벤트 타임스탬프가 갱신된다.
- [ ] 매치 세션이 준비 상태로 전환되면 메인 게임으로 진입할 수 있다.

## Notes
* 실시간 게시에 테이블을 추가한 뒤에는 Supabase가 해당 테이블의 변경 사항을 스트림하기 시작합니다. 만약 RLS 정책이 너무 제한적이라면 Realtime이 이벤트를 전송하지 못할 수 있으므로, `enable_realtime` 정책을 별도로 구성해야 할 수도 있습니다.
* 테스트 및 스테이징 환경에서도 동일한 게시 구성이 유지되도록 마이그레이션 스크립트나 IaC 코드에 위 SQL을 포함하는 것이 좋습니다.
