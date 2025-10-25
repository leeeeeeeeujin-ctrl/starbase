# 방 스테이징 RPC 보강 실행 계획 (2025-11-10)

## 1. 왜 필요한가?

방 → 매칭 → 메인게임 전환 과정에서 클라이언트가 수행하는 준비 체크, 세션 생성, 난입 메타 보관을 **서버 RPC로 강제**하지 않으면 다음과 같은 문제가 재발합니다.

1. 직접 API 호출이나 경쟁 탭이 준비 투표를 건너뛰고 `stage-room-match`를 실행할 수 있음.
2. 세션 ID 없이 Match Ready 단계가 열려 `ready-check` 호출이 실패함.
3. 난입 자동 채움(async fill) 정보가 영속화되지 않아 `MatchReady`가 새로고침될 때 메타가 사라짐.

따라서 다음 네 가지 RPC를 Supabase에 추가하고, 기존 `/api/rank/stage-room-match` 및 Match Ready 파이프라인에 연결해야 합니다.

---

## 2. 배포 전 실행 순서

1. **SQL 배포**: 아래 3개 함수를 `supabase/sql` 또는 DB 마이그레이션 스크립트로 추가합니다. Arena 전용 RPC까지 한 번에 배포하려면 `docs/arena-supabase-migration-2025-11-12.md`의 통합 스크립트를 그대로 사용하세요.
   - `public.assert_room_ready(p_room_id uuid)`
   - `public.ensure_rank_session_for_room(p_room_id uuid, p_game_id uuid, p_owner_id uuid, p_mode text, p_vote jsonb)`
   - `public.reconcile_rank_queue_for_roster(p_game_id uuid, p_mode text, p_roster jsonb)`
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
   - `/rooms/[id]`는 전원이 준비되면 즉시 `stageMatch`를 호출하고, 타임아웃 시 미준비 좌석을 비우므로 API는 중복 호출·인원 변동에 대비해 멱등성을 유지해야 한다.
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
  v_room_owner uuid;
  v_room_mode text;
begin
  -- 방 소유자를 교차 검증하고 투표 결과에 따라 턴 제한을 추출
  select owner_id, mode
    into v_room_owner, v_room_mode
  from public.rank_rooms
  where id = p_room_id;

  if v_room_owner is null then
    raise exception 'room_not_found';
  end if;

  if p_owner_id is null or v_room_owner <> p_owner_id then
    raise exception 'room_owner_mismatch';
  end if;

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
      v_room_owner,
      'active',
      0,
      coalesce(p_mode, v_room_mode),
      v_vote_payload
    )
    returning id into v_session_id;
  else
    update public.rank_sessions
       set updated_at = now(),
           mode = coalesce(p_mode, v_room_mode, mode),
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

### 3.3 대기열 슬롯 재조정

```sql
drop function if exists public.reconcile_rank_queue_for_roster(uuid, text, jsonb);

create or replace function public.reconcile_rank_queue_for_roster(
  p_game_id uuid,
  p_mode text,
  p_roster jsonb
)
returns table (
  reconciled integer,
  inserted integer,
  removed integer,
  sanitized jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_mode text := coalesce(nullif(trim(p_mode), ''), 'solo');
  v_payload jsonb := '[]'::jsonb;
  v_removed integer := 0;
  v_inserted integer := 0;
  v_has_duplicate boolean := false;
  v_has_mismatch boolean := false;
begin
  if p_game_id is null then
    raise exception 'missing_game_id';
  end if;

  if p_roster is null or jsonb_typeof(p_roster) <> 'array' then
    raise exception 'invalid_roster';
  end if;

  with normalized as (
    select
      jsonb_strip_nulls(
        entry
          || jsonb_build_object(
            'owner_id', owner_id::text,
            'hero_id', hero_id::text,
            'role', role,
            'slot_index', slot_index,
            'slot_id', slot_id::text
          )
      ) as sanitized_entry,
      owner_id,
      hero_id,
      role,
      slot_index,
      slot_id,
      ord
    from (
      select
        jsonb_array_elements(p_roster) as entry,
        row_number() over () as ord
    ) indexed
    cross join lateral (
      select *,
        row_number() over (
          partition by owner_id
          order by slot_index, hero_id::text, role, ord
        ) as owner_rank,
        row_number() over (
          partition by slot_token
          order by ord, owner_id::text
        ) as slot_rank
      from (
        select *,
          coalesce(slot_id_text, 'slot-index:' || slot_index::text) as slot_token
        from (
          select
            nullif(trim(indexed.entry->>'owner_id'), '')::uuid as owner_id,
            nullif(trim(indexed.entry->>'hero_id'), '')::uuid as hero_id,
            coalesce(nullif(indexed.entry->>'role', ''), '역할 미지정') as role,
            coalesce((indexed.entry->>'slot_index')::integer, indexed.ord - 1) as slot_index,
            nullif(trim(indexed.entry->>'slot_id'), '')::uuid as slot_id,
            nullif(trim(indexed.entry->>'slot_id'), '') as slot_id_text,
            indexed.ord
        ) base0
      ) base
    ) attributes
    where attributes.owner_id is not null
      and attributes.owner_rank = 1
      and attributes.slot_rank = 1
  )
  select coalesce(
      jsonb_agg(
        sanitized_entry
        order by slot_index,
          coalesce(slot_id::text, owner_id::text, ''),
          ord
      ),
      '[]'::jsonb
    )
    into v_payload
  from normalized;

  if jsonb_typeof(v_payload) <> 'array' or jsonb_array_length(v_payload) = 0 then
    return query
      select 0::integer as reconciled, 0::integer as inserted, 0::integer as removed, '[]'::jsonb as sanitized;
  end if;

  delete from public.rank_match_queue q
  where q.game_id = p_game_id
    and q.mode = v_mode
    and q.owner_id in (
      select (value->>'owner_id')::uuid
      from jsonb_array_elements(v_payload) as value
      where nullif(value->>'owner_id', '') is not null
    );
  GET DIAGNOSTICS v_removed = ROW_COUNT;

  with payload as (
    select
      (value->>'owner_id')::uuid as owner_id,
      nullif(value->>'hero_id', '')::uuid as hero_id,
      coalesce(nullif(value->>'role', ''), '역할 미지정') as role,
      coalesce((value->>'slot_index')::integer, ord::integer - 1) as slot_index,
      ord
    from jsonb_array_elements(v_payload) with ordinality as payload(value, ord)
  ), inserted_rows as (
    insert into public.rank_match_queue (
      game_id,
      mode,
      owner_id,
      hero_id,
      role,
      score,
      simulated,
      party_key,
      status,
      joined_at,
      updated_at,
      match_code
    )
    select
      p_game_id,
      v_mode,
      payload.owner_id,
      payload.hero_id,
      payload.role,
      coalesce(participants.score, 1000),
      false,
      null,
      'matched',
      v_now,
      v_now,
      null
    from payload
    left join public.rank_participants participants
      on participants.game_id = p_game_id
     and participants.owner_id = payload.owner_id
    returning owner_id
  )
  select count(*)
    into v_inserted
  from inserted_rows;

  select exists (
    with payload as (
      select
        (value->>'owner_id')::uuid as owner_id,
        nullif(value->>'hero_id', '')::uuid as hero_id,
        coalesce(nullif(value->>'role', ''), '역할 미지정') as role
      from jsonb_array_elements(v_payload) as value
      where nullif(value->>'owner_id', '') is not null
    )
    select 1
    from public.rank_match_queue q
    join payload on payload.owner_id = q.owner_id
    where q.game_id = p_game_id
      and q.mode = v_mode
    group by q.owner_id
    having count(*) <> 1
  )
  into v_has_duplicate;

  if v_has_duplicate then
    raise exception 'queue_reconcile_failed';
  end if;

  select exists (
    with payload as (
      select
        (value->>'owner_id')::uuid as owner_id,
        nullif(value->>'hero_id', '')::uuid as hero_id,
        coalesce(nullif(value->>'role', ''), '역할 미지정') as role
      from jsonb_array_elements(v_payload) as value
      where nullif(value->>'owner_id', '') is not null
    )
    select 1
    from public.rank_match_queue q
    join payload on payload.owner_id = q.owner_id
    where q.game_id = p_game_id
      and q.mode = v_mode
      and (
        coalesce(q.role, '') <> coalesce(payload.role, '')
        or coalesce(q.hero_id::text, '') <> coalesce(payload.hero_id::text, '')
        or lower(coalesce(q.status, '')) <> 'matched'
      )
  )
  into v_has_mismatch;

  if v_has_mismatch then
    raise exception 'queue_reconcile_failed';
  end if;

    return query
      select
        jsonb_array_length(v_payload)::integer as reconciled,
        v_inserted::integer as inserted,
        v_removed::integer as removed,
        v_payload as sanitized;
  end;
$$;

grant execute on function public.reconcile_rank_queue_for_roster(
  uuid,
  text,
  jsonb
) to authenticated, service_role;
```

### 3.4 난입 메타 영속화

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

### 3.5 권한 부여

```sql
grant execute on function public.assert_room_ready(uuid) to authenticated, service_role;
grant execute on function public.ensure_rank_session_for_room(uuid, uuid, uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.reconcile_rank_queue_for_roster(uuid, text, jsonb)
  to authenticated, service_role;
grant execute on function public.upsert_rank_session_async_fill(uuid, jsonb)
  to authenticated, service_role;
grant execute on function public.prepare_rank_match_session(
  uuid,
  uuid,
  uuid,
  uuid,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  boolean
) to authenticated, service_role;
```

---

## 4. 현재 구현 상태 체크

- `/api/rank/stage-room-match`는 `prepare_rank_match_session` 단일 RPC를 호출해 준비 검증·대기열 정리·로스터 싱크·세션 보강·난입 메타까지 트랜잭션으로 처리합니다. 함수가 배포되어 있지 않으면 `missing_prepare_rank_match_session` 오류를 반환합니다.【F:pages/api/rank/stage-room-match.js†L1-L118】【F:services/rank/matchSupabase.js†L191-L216】
- 방 상세 화면은 스테이징 응답으로 전달받은 `session_id`를 즉시 `matchDataStore`에 기록해 Match Ready가 세션 ID 없이 열리지 않도록 했습니다.【F:pages/rooms/[id].js†L3048-L3073】
- Match Ready 클라이언트는 로컬 스냅샷에서도 세션 ID를 회수하고, 세션 ID가 없으면 `allowStart`를 비활성화합니다.【F:components/rank/MatchReadyClient.js†L140-L210】【F:components/rank/MatchReadyClient.js†L500-L520】

### 3.5 세션 채팅 조회 RPC (신규)

메인 게임 공용 채팅이 `rank_turns` 테이블에서 세션별 히스토리를 스트리밍할 수 있도록, 뷰어 가시성 필터와 숨김 슬롯 정보를 함께 반환하는 RPC를 추가합니다. StartClient는 더 이상 테이블 쿼리로 폴백하지 않으므로, 아래 함수를 배포하지 않으면 세션 채팅이 곧바로 오류를 표시합니다.

```sql
create or replace function public.fetch_rank_session_turns(
  p_session_id uuid,
  p_limit integer default 120
)
returns table (
  id bigint,
  session_id uuid,
  idx integer,
  role text,
  content text,
  public boolean,
  is_visible boolean,
  summary_payload jsonb,
  metadata jsonb,
  created_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_session_id is null then
    raise exception 'missing_session_id';
  end if;

  return query
  select
    t.id,
    t.session_id,
    t.idx,
    t.role,
    t.content,
    t.public,
    coalesce(t.is_visible, true) as is_visible,
    t.summary_payload,
    t.metadata,
    t.created_at
  from public.rank_turns t
  where t.session_id = p_session_id
  order by t.idx asc, t.created_at asc
  limit coalesce(p_limit, 120);
end;
$$;

grant execute on function public.fetch_rank_session_turns(uuid, integer) to authenticated, service_role;
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
