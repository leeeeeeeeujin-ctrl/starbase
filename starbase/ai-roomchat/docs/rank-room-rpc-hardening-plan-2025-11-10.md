# 방 스테이징 RPC 보강 실행 계획 (2025-11-10)

## 1. 왜 필요한가?
방 → 매칭 → 메인게임 전환 과정에서 클라이언트가 수행하는 준비 체크, 세션 생성, 난입 메타 보관을 **서버 RPC로 강제**하지 않으면 다음과 같은 문제가 재발합니다.

1. 직접 API 호출이나 경쟁 탭이 준비 투표를 건너뛰고 `stage-room-match`를 실행할 수 있음.
2. 세션 ID 없이 Match Ready 단계가 열려 `ready-check` 호출이 실패함.
3. 난입 자동 채움(async fill) 정보가 영속화되지 않아 `MatchReady`가 새로고침될 때 메타가 사라짐.

따라서 다음 세 가지 RPC를 Supabase에 추가하고, 기존 `/api/rank/stage-room-match` 및 Match Ready 파이프라인에 연결해야 합니다.

---

## 2. 배포 전 실행 순서

1. **SQL 배포**: 아래 3개 함수를 `supabase/sql` 또는 DB 마이그레이션 스크립트로 추가합니다.
   - `public.assert_room_ready(p_room_id uuid)`
   - `public.ensure_rank_session_for_room(p_room_id uuid, p_game_id uuid, p_owner_id uuid, p_mode text, p_vote jsonb)`
   - `public.upsert_rank_session_async_fill(p_session_id uuid, p_async_fill jsonb)`
2. **권한 확인**: 호출 주체가 `service_role` 또는 `authenticated`인 경우에만 접근해야 하므로, 필요한 `grant execute`를 명시합니다.
3. **API 연동**:
   - `/api/rank/stage-room-match`
     1. 기존 로직 시작부에 `select public.assert_room_ready(room_id);` 추가.
     2. 매치 스테이징 성공 후 `ensure_rank_session_for_room`를 호출해 세션 ID를 확보하고 응답 페이로드에 포함.
     3. 난입 자동 채움 메타가 존재하면 `upsert_rank_session_async_fill`을 호출.
   - `/api/rank/ready-check`
     - 세션 ID 미존재 시 반환하던 `missing_session_id` 에러를, 위에서 채운 세션 ID로 대체하여 정상 진행.
4. **클라이언트 업데이트**:
   - `stageMatch` 호출 이후 응답으로 받은 `sessionId`를 `MatchReadyClient`에 전달.
   - 난입 메타(`asyncFillMeta`)를 서버 호출로 동시에 전송하도록 수정.
5. **운영 점검**: Realtime publication(`rank_room_slots`, `rank_rooms`, `rank_sessions`, `rank_session_meta`)이 등록되어 있는지 확인.

---

## 3. SQL 스니펫

### 3.1 준비 상태 검증
```sql
create or replace function public.assert_room_ready(p_room_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_required integer;
  v_ready integer;
  v_locked integer;
begin
  select count(*),
         count(*) filter (where occupant_ready),
         count(*) filter (where seat_locked)
    into v_required, v_ready, v_locked
  from public.rank_room_slots
  where room_id = p_room_id;

  if v_required = 0 then
    raise exception 'room_empty';
  end if;

  if v_locked > 0 then
    raise exception 'room_locked';
  end if;

  if v_ready < v_required then
    raise exception 'ready_check_incomplete';
  end if;
end;
$$;
```

### 3.2 세션 생성/보강
```sql
create or replace function public.ensure_rank_session_for_room(
  p_room_id uuid,
  p_game_id uuid,
  p_owner_id uuid,
  p_mode text,
  p_vote jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_turn_limit integer;
  v_vote_payload jsonb;
begin
  -- 투표 결과에 따라 턴 제한이나 커스텀 설정을 추출
  v_turn_limit := coalesce((p_vote->>'turn_limit')::integer, 0);
  v_vote_payload := coalesce(p_vote, '{}'::jsonb);

  select id
    into v_session_id
  from public.rank_sessions
  where room_id = p_room_id
    and status = 'active'
  order by updated_at desc
  limit 1;

  if v_session_id is null then
    insert into public.rank_sessions (
      room_id,
      game_id,
      owner_id,
      status,
      turn,
      mode,
      vote_snapshot
    )
    values (
      p_room_id,
      p_game_id,
      p_owner_id,
      'active',
      0,
      p_mode,
      v_vote_payload
    )
    returning id into v_session_id;
  else
    update public.rank_sessions
       set updated_at = now(),
           mode = coalesce(p_mode, mode),
           vote_snapshot = v_vote_payload
     where id = v_session_id;
  end if;

  if v_turn_limit > 0 then
    update public.rank_session_meta
       set turn_limit = v_turn_limit,
           updated_at = now()
     where session_id = v_session_id;

    if not found then
      insert into public.rank_session_meta (session_id, turn_limit)
      values (v_session_id, v_turn_limit);
    end if;
  end if;

  return v_session_id;
end;
$$;
```

### 3.3 난입 메타 영속화
```sql
create or replace function public.upsert_rank_session_async_fill(
  p_session_id uuid,
  p_async_fill jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rank_session_meta
     set async_fill_snapshot = p_async_fill,
         updated_at = now()
   where session_id = p_session_id;

  if not found then
    insert into public.rank_session_meta (
      session_id,
      async_fill_snapshot
    )
    values (
      p_session_id,
      p_async_fill
    );
  end if;
end;
$$;
```

### 3.4 권한 부여
```sql
grant execute on function public.assert_room_ready(uuid) to authenticated, service_role;
grant execute on function public.ensure_rank_session_for_room(uuid, uuid, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.upsert_rank_session_async_fill(uuid, jsonb)
  to authenticated, service_role;
```

---

## 4. API/클라이언트 연동 체크리스트

- [ ] `pages/api/rank/stage-room-match.js`
  - [ ] 매치 스테이징 전에 `assert_room_ready` 호출
  - [ ] 성공 후 `ensure_rank_session_for_room` 호출하여 세션 ID 확보
  - [ ] `asyncFillMeta`가 존재하면 `upsert_rank_session_async_fill` 호출
  - [ ] 응답에 `sessionId` 포함
- [ ] `pages/api/rank/ready-check.js`
  - [ ] 세션 ID 누락 시 에러 대신 `ensure_rank_session_for_room` 결과 사용
- [ ] `modules/rank/matchFlow.js`
  - [ ] `stageMatch` 응답에서 받은 `sessionId`를 `MatchReadyClient`에 전달
  - [ ] 난입 메타 전송 시 서버 RPC를 호출하여 영속화
- [ ] `modules/rank/matchRealtimeSync.js`
  - [ ] Realtime 스냅샷에 `async_fill_snapshot`이 포함되는지 재검증

---

## 5. 추가 참고
- 마이그레이션 파일에 위 SQL을 포함한 뒤, CI/CD에서 Supabase에 자동 반영되도록 구성하세요.
- 함수는 모두 `security definer`로 작성했으므로 소유자가 `supabase_admin` 등 충분한 권한을 가진 계정인지 확인해야 합니다.
- 운영 반영 후 `select * from pg_publication_tables where pubname = 'supabase_realtime';`로 테이블 게시 상태를 재확인하세요.

