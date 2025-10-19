# Rank Arena Supabase Migration Checklist (2025-11-12)

이 문서는 Rank Arcade 6페이지 흐름을 운영 환경에 배포할 때 필요한 Supabase RPC와 Publication 구성을 **하나의 SQL 스크립트로** 정리합니다. 아래 스니펫을 그대로 마이그레이션 파일이나 `psql` 세션에 적용하면 됩니다.

## 1. 실행 순서 요약
1. `rank_queue_tickets`, `rank_sessions`, `rank_session_meta`, `rank_turns` 테이블이 `supabase_realtime` publication에 포함되어 있는지 확인하고, 누락 시 추가합니다.
2. 큐 진입·스테이징·타임아웃·세션 조회·정산에 쓰이는 RPC 여섯 개(`join_rank_queue`, `fetch_rank_queue_ticket`, `stage_rank_match`, `evict_unready_participant`, `fetch_rank_session_turns`, `finalize_rank_session`)를 생성합니다.
3. 기존 방 스테이징 보강 RPC 네 개(`assert_room_ready`, `ensure_rank_session_for_room`, `reconcile_rank_queue_for_roster`, `upsert_rank_session_async_fill`)를 함께 재적용해 `/api/rank/stage-room-match`가 호출하는 전 체인을 확보합니다.
4. 모든 함수에 `authenticated`, `service_role` 권한을 부여합니다.

## 2. 통합 SQL 스크립트
> 필요한 경우 마지막 `commit;` 전에 트랜잭션을 `begin;`으로 감싸고 실행하세요.

```sql
-- 1) Realtime publication (idempotent)
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_queue_tickets'
  ) then
    alter publication supabase_realtime add table public.rank_queue_tickets;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_sessions'
  ) then
    alter publication supabase_realtime add table public.rank_sessions;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_session_meta'
  ) then
    alter publication supabase_realtime add table public.rank_session_meta;
  end if;

  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'rank_turns'
  ) then
    alter publication supabase_realtime add table public.rank_turns;
  end if;
end $$;

-- Ensure queue rows expose the simulated stand-in flag used by the client overlay.
alter table if exists public.rank_match_queue
  add column if not exists simulated boolean not null default false;

-- join_rank_queue
create or replace function public.join_rank_queue(
  queue_id text,
  payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record; -- record avoids 42704 errors when the composite type is missing during initial migrations
begin
  if queue_id is null then
    raise exception 'missing_queue_id';
  end if;

  insert into public.rank_queue_tickets (queue_id, payload)
  values (queue_id, payload)
  returning * into v_ticket;

  return row_to_json(v_ticket)::jsonb;
end;
$$;

grant execute on function public.join_rank_queue(text, jsonb)
  to authenticated, service_role;

-- fetch_rank_queue_ticket
create or replace function public.fetch_rank_queue_ticket(
  queue_ticket_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record;
begin
  if queue_ticket_id is null then
    raise exception 'missing_queue_ticket';
  end if;

  select *
    into v_ticket
  from public.rank_queue_tickets
  where id = queue_ticket_id;

  if not found then
    raise exception 'queue_ticket_not_found';
  end if;

  return row_to_json(v_ticket)::jsonb;
end;
$$;

grant execute on function public.fetch_rank_queue_ticket(uuid)
  to authenticated, service_role;

-- 3) Match staging RPC chain
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

grant execute on function public.assert_room_ready(uuid)
  to authenticated, service_role;

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

grant execute on function public.ensure_rank_session_for_room(uuid, uuid, uuid, text, jsonb)
  to authenticated, service_role;

create or replace function public.reconcile_rank_queue_for_roster(
  p_game_id uuid,
  p_mode text,
  p_roster jsonb
)
returns table (
  reconciled integer,
  inserted integer,
  removed integer
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

  select coalesce(
      jsonb_agg(
        jsonb_build_object(
          'owner_id', owner_id::text,
          'hero_id', hero_id::text,
          'role', role,
          'slot_index', slot_index
        )
      ),
      '[]'::jsonb
    )
    into v_payload
  from (
    select owner_id, hero_id, role, slot_index
    from (
      select
        nullif(trim(entry->>'owner_id'), '')::uuid as owner_id,
        nullif(trim(entry->>'hero_id'), '')::uuid as hero_id,
        coalesce(nullif(entry->>'role', ''), '역할 미지정') as role,
        coalesce((entry->>'slot_index')::integer, ord - 1) as slot_index,
        row_number() over (
          partition by nullif(trim(entry->>'owner_id'), '')::uuid
          order by coalesce((entry->>'slot_index')::integer, ord - 1),
            nullif(trim(entry->>'hero_id'), ''),
            coalesce(nullif(entry->>'role', ''), '역할 미지정'),
            ord
        ) as owner_rank
      from (
        select jsonb_array_elements(p_roster) as entry, row_number() over () as ord
      ) indexed
    ) ranked
    where owner_id is not null
      and owner_rank = 1
  ) deduped;

  if jsonb_typeof(v_payload) <> 'array' or jsonb_array_length(v_payload) = 0 then
    return query
      select 0::integer as reconciled, 0::integer as inserted, 0::integer as removed;
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
      coalesce((value->>'slot_index')::integer, ord::integer - 1) as slot_index
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
      v_removed::integer as removed;
end;
$$;

grant execute on function public.reconcile_rank_queue_for_roster(uuid, text, jsonb)
  to authenticated, service_role;

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

grant execute on function public.upsert_rank_session_async_fill(uuid, jsonb)
  to authenticated, service_role;

create or replace function public.stage_rank_match(
  queue_ticket_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_ticket record; -- record avoids 42704 errors when the composite type is missing during initial migrations
  v_session_id uuid;
  v_ready_expires_at timestamptz;
  v_seats jsonb;
begin
  if queue_ticket_id is null then
    raise exception 'missing_queue_ticket';
  end if;

  select * into v_ticket
  from public.rank_queue_tickets
  where id = queue_ticket_id;

  if not found then
    raise exception 'queue_ticket_not_found';
  end if;

  perform public.assert_room_ready(v_ticket.room_id);

  v_session_id := public.ensure_rank_session_for_room(
    v_ticket.room_id,
    v_ticket.game_id,
    v_ticket.owner_id,
    v_ticket.mode,
    v_ticket.ready_vote
  );

  perform public.upsert_rank_session_async_fill(v_session_id, v_ticket.async_fill_meta);

  v_ready_expires_at := now() + interval '15 seconds';

  v_seats := (
    select jsonb_agg(
      jsonb_build_object(
        'index', slot.slot_index,
        'owner_id', slot.occupant_owner_id,
        'hero_name', slot.occupant_hero_name,
        'ready', slot.occupant_ready
      )
      order by slot.slot_index
    )
    from public.rank_room_slots slot
    where slot.room_id = v_ticket.room_id
  );

  return jsonb_build_object(
    'session_id', v_session_id,
    'ready_expires_at', v_ready_expires_at,
    'seats', coalesce(v_seats, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.stage_rank_match(uuid)
  to authenticated, service_role;

-- 4) Ready timeout eviction
create or replace function public.evict_unready_participant(
  queue_ticket_id uuid,
  seat_index integer
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.rank_room_slots
  set occupant_owner_id = null,
      occupant_ready = false,
      occupant_hero_id = null,
      joined_at = null
  where room_id = (
    select room_id from public.rank_queue_tickets where id = queue_ticket_id
  )
    and slot_index = seat_index;
end;
$$;

grant execute on function public.evict_unready_participant(uuid, integer)
  to authenticated, service_role;

-- 5) Session turn history
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

grant execute on function public.fetch_rank_session_turns(uuid, integer)
  to authenticated, service_role;

-- 6) Session finalization
create or replace function public.finalize_rank_session(
  p_session_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.rank_sessions;
  v_participants jsonb;
begin
  select * into v_session from public.rank_sessions where id = p_session_id;
  if not found then
    raise exception 'session_not_found';
  end if;

  v_participants := (
    select jsonb_agg(
      jsonb_build_object(
        'owner_id', slot.occupant_owner_id,
        'hero_name', slot.occupant_hero_name,
        'score_delta', slot.score_delta,
        'final_score', slot.final_score
      )
    )
    from public.rank_session_meta slot
    where slot.session_id = p_session_id
  );

  return jsonb_build_object(
    'session_id', p_session_id,
    'status', v_session.status,
    'completed_at', v_session.completed_at,
    'participants', coalesce(v_participants, '[]'::jsonb)
  );
end;
$$;

grant execute on function public.finalize_rank_session(uuid)
  to authenticated, service_role;
```

## 3. 배포 후 점검
- `/api/rank/stage-room-match`는 위 RPC를 모두 호출하며, 누락 시 `missing_assert_room_ready`, `missing_ensure_rank_session_for_room` 등의 오류 메시지를 반환합니다. 클라이언트가 동일한 오류를 보여 주는지 확인하세요.【F:pages/api/rank/stage-room-match.js†L337-L523】
- 큐/스테이징/세션 UI는 새 RPC 응답을 기준으로 동작하며, `SessionChatPanel`은 `fetch_rank_session_turns` 미배포 시 즉시 오류를 띄웁니다.【F:components/rank/StartClient/SessionChatPanel.js†L38-L169】
- Realtime publication을 확인하려면 `select * from pg_publication_tables where pubname = 'supabase_realtime';` 쿼리로 위 네 개 테이블이 포함됐는지 다시 체크하세요.

## 4. 참고 문서
- `docs/arena-rpc-reference-2025-11-12.md`: 각 RPC 설계 이유와 파라미터 설명.
- `docs/rank-room-rpc-hardening-plan-2025-11-10.md`: 기존 방 스테이징 보강 맥락과 연동 체크리스트.
- `docs/refactor-blueprint-2025-11-12.md`: 여섯 페이지 Rank Arcade 흐름 개요.
