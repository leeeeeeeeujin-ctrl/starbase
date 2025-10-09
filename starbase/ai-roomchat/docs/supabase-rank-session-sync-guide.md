# Supabase 랭크 세션 동기화 배포 가이드

다음 순서를 따르면 프론트엔드가 기대하는 슬롯 버전·세션 메타 저장소가 Supabase에 반영된다. 모든 SQL은 Supabase 콘솔의 **SQL Editor**나 `supabase db execute`에 그대로 붙여넣을 수 있도록 준비했다.

## 1. 해야 할 일 한눈에 보기
1. `rank_sessions` 테이블에 슬롯 버전 컬럼을 추가하고, 세션 정보를 확인하는 `validate_session` RPC를 교체한다.
2. 매치 방 스테이징에서 사용할 슬롯 캐시 테이블과 잠금 RPC(`claim_rank_room_slot`)를 생성한다.
3. 제한시간 투표·난입 보너스 등 메타 정보를 저장하는 `rank_session_meta` 테이블과 `upsert_match_session_meta`·`refresh_match_session_async_fill` RPC를 만든다.
4. 방 상세 페이지가 호출하는 `stage-room-match`용 `sync_rank_match_roster` RPC를 배포해 슬롯 버전 충돌을 서버에서 차단한다.
5. 게임 등록을 서버에서 일괄 처리할 `register_rank_game` RPC를 적용해 역할·슬롯 저장을 RPC 경유로 전환한다.
6. (선택) 감사 로그·이미지 정책 보강도 함께 적용하려면 번들 전체를 실행한다.

모든 스키마/함수 정의는 `docs/supabase-rank-backend-upgrades.sql`에 있다. 아래 요약된 스니펫을 순서대로 실행하면 핵심 1~5단계가 완료된다. `time_vote`·`turn_state`·`async_fill_snapshot` 저장만 빠르게 배포하려면 `docs/sql/upsert-match-session-meta.sql`과 `docs/sql/refresh-match-session-async-fill.sql`을, 슬롯 버전 잠금을 즉시 적용하려면 `docs/sql/sync-rank-match-roster.sql`을, 등록 RPC만 따로 배포하려면 `docs/sql/register-rank-game.sql`을 그대로 붙여넣으면 된다.

## 2. 필수 SQL 스니펫
```sql
-- 1) rank_sessions 컬럼 & validate_session, bump 함수 교체
alter table public.rank_sessions
  add column if not exists slot_schema_version integer not null default 1,
  add column if not exists slot_schema_updated_at timestamptz not null default now();

create or replace function public.validate_session(
  p_session_id uuid
)
returns table (
  ok boolean,
  session_id uuid,
  game_id uuid,
  status text,
  slot_schema_version integer,
  slot_schema_updated_at timestamptz,
  updated_at timestamptz,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session record;
begin
  select s.* into v_session
  from public.rank_sessions s
  where s.id = p_session_id;

  if not found then
    return query select false, null, null, null, null, null, null, 'session_not_found';
  end if;

  return query select
    true,
    v_session.id,
    v_session.game_id,
    v_session.status,
    v_session.slot_schema_version,
    v_session.slot_schema_updated_at,
    v_session.updated_at,
    null;
end;
$$;

create or replace function public.refresh_match_session_async_fill(
  p_session_id uuid,
  p_room_id uuid,
  p_host_role_limit integer default null,
  p_max_queue integer default 3
)
returns table (
  session_id uuid,
  selected_time_limit_seconds integer,
  time_vote jsonb,
  drop_in_bonus_seconds integer,
  turn_state jsonb,
  async_fill_snapshot jsonb,
  realtime_mode text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_room record;
  v_now timestamptz := now();
  v_epoch_ms bigint := floor(extract(epoch from v_now) * 1000);
  v_mode text;
  v_host_role text;
  v_host_role_key text;
  v_total integer := 0;
  v_allowed integer := 0;
  v_pending_count integer := 0;
  v_queue_limit integer := 0;
  v_assigned jsonb := '[]'::jsonb;
  v_overflow jsonb := '[]'::jsonb;
  v_seat_indexes jsonb := '[]'::jsonb;
  v_pending_indexes jsonb := '[]'::jsonb;
  v_queue jsonb := '[]'::jsonb;
  v_pool_size integer := 0;
  v_assigned_owner_ids text[] := array[]::text[];
  v_snapshot jsonb := null;
  v_meta record;
begin
  select
    r.id,
    r.game_id,
    r.owner_id,
    coalesce(nullif(lower(trim(r.realtime_mode)), ''), 'off') as realtime_mode,
    coalesce(p_host_role_limit, r.host_role_limit) as host_role_limit
  into v_room
  from public.rank_rooms r
  where r.id = p_room_id
  limit 1;

  if v_room.id is null then
    raise exception 'rank_room_not_found';
  end if;

  v_mode := coalesce(v_room.realtime_mode, 'off');

  if v_mode <> 'off' then
    v_snapshot := jsonb_build_object(
      'mode', v_mode,
      'hostOwnerId', case when v_room.owner_id is null then null else v_room.owner_id::text end,
      'hostRole', null,
      'seatLimit', jsonb_build_object('allowed', 0, 'total', 0),
      'seatIndexes', '[]'::jsonb,
      'pendingSeatIndexes', '[]'::jsonb,
      'assigned', '[]'::jsonb,
      'overflow', '[]'::jsonb,
      'fillQueue', '[]'::jsonb,
      'poolSize', 0,
      'generatedAt', v_epoch_ms
    );
  else
    select
      coalesce(trim(s.role), '')
    into v_host_role
    from public.rank_room_slots s
    where s.room_id = p_room_id
      and s.occupant_owner_id = v_room.owner_id
    order by s.slot_index
    limit 1;

    if v_host_role is null or v_host_role = '' then
      select coalesce(trim(s.role), '')
      into v_host_role
      from public.rank_room_slots s
      where s.room_id = p_room_id
      order by s.slot_index
      limit 1;
    end if;

    if v_host_role is null or v_host_role = '' then
      v_host_role := '역할 미지정';
    end if;

    v_host_role_key := lower(trim(v_host_role));

    with host as (
      select
        s.id as slot_id,
        s.slot_index,
        coalesce(trim(s.role), '') as role,
        lower(trim(coalesce(s.role, ''))) as role_key,
        s.occupant_owner_id,
        s.occupant_hero_id,
        s.occupant_ready,
        s.joined_at,
        h.name as hero_name,
        row_number() over (partition by lower(trim(coalesce(s.role, ''))) order by s.slot_index) as role_position,
        count(*) over (partition by lower(trim(coalesce(s.role, '')))) as role_total
      from public.rank_room_slots s
      left join public.heroes h on h.id = s.occupant_hero_id
      where s.room_id = p_room_id
    )
    select coalesce(max(role_total), 0)
    into v_total
    from host
    where role_key = v_host_role_key;

    if v_total is null then
      v_total := 0;
    end if;

    v_allowed := coalesce(v_room.host_role_limit, p_host_role_limit, 3);
    if v_allowed is null then
      v_allowed := 3;
    end if;
    if v_allowed < 1 then
      v_allowed := 1;
    end if;
    if v_total > 0 and v_allowed > v_total then
      v_allowed := v_total;
    end if;
    if v_total = 0 then
      v_allowed := 0;
    end if;

    with host as (
      select
        s.id as slot_id,
        s.slot_index,
        coalesce(trim(s.role), '') as role,
        lower(trim(coalesce(s.role, ''))) as role_key,
        s.occupant_owner_id,
        s.occupant_hero_id,
        s.occupant_ready,
        s.joined_at,
        h.name as hero_name,
        row_number() over (partition by lower(trim(coalesce(s.role, ''))) order by s.slot_index) as role_position
      from public.rank_room_slots s
      left join public.heroes h on h.id = s.occupant_hero_id
      where s.room_id = p_room_id
    )
    select
      coalesce(jsonb_agg(jsonb_build_object(
        'slotIndex', slot_index,
        'slotId', slot_id::text,
        'ownerId', case when occupant_owner_id is null then null else occupant_owner_id::text end,
        'heroId', case when occupant_hero_id is null then null else occupant_hero_id::text end,
        'heroName', hero_name,
        'role', role,
        'ready', occupant_ready,
        'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(jsonb_build_object(
        'slotIndex', slot_index,
        'slotId', slot_id::text,
        'ownerId', case when occupant_owner_id is null then null else occupant_owner_id::text end,
        'heroId', case when occupant_hero_id is null then null else occupant_hero_id::text end,
        'heroName', hero_name,
        'role', role,
        'ready', occupant_ready,
        'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
      ) order by slot_index) filter (where role_key = v_host_role_key and role_position > v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(slot_index) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed), '[]'::jsonb),
      coalesce(jsonb_agg(to_jsonb(slot_index) order by slot_index) filter (where role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is null), '[]'::jsonb),
      coalesce(array_agg(distinct case when role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is not null then occupant_owner_id::text end), array[]::text[]),
      coalesce(sum(case when role_key = v_host_role_key and role_position <= v_allowed and occupant_owner_id is null then 1 else 0 end), 0)
    into
      v_assigned,
      v_overflow,
      v_seat_indexes,
      v_pending_indexes,
      v_assigned_owner_ids,
      v_pending_count
    from host;

    if v_assigned_owner_ids is null then
      v_assigned_owner_ids := array[]::text[];
    end if;

    if v_pending_count is null then
      v_pending_count := 0;
    end if;

    v_queue_limit := greatest(v_pending_count, coalesce(p_max_queue, 3));
    if v_queue_limit < 0 then
      v_queue_limit := 0;
    end if;

    select count(*)
    into v_pool_size
    from public.rank_match_queue q
    where q.game_id = v_room.game_id
      and lower(trim(coalesce(q.role, ''))) = v_host_role_key
      and q.status = 'waiting'
      and (q.owner_id is null or not (q.owner_id::text = any(v_assigned_owner_ids)))
      and (q.owner_id is distinct from v_room.owner_id);

    with queued as (
      select
        q.owner_id,
        q.hero_id,
        h.name as hero_name,
        q.joined_at,
        q.score,
        p.rating,
        p.win_rate,
        p.battles,
        q.status,
        row_number() over (order by q.joined_at) as rn
      from public.rank_match_queue q
      left join public.rank_participants p
        on p.game_id = q.game_id
       and p.owner_id = q.owner_id
      left join public.heroes h
        on h.id = coalesce(q.hero_id, p.hero_id)
      where q.game_id = v_room.game_id
        and lower(trim(coalesce(q.role, ''))) = v_host_role_key
        and q.status = 'waiting'
        and (q.owner_id is null or not (q.owner_id::text = any(v_assigned_owner_ids)))
        and (q.owner_id is distinct from v_room.owner_id)
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'ownerId', case when owner_id is null then null else owner_id::text end,
      'heroId', case when hero_id is null then null else hero_id::text end,
      'heroName', hero_name,
      'role', v_host_role,
      'score', score,
      'rating', rating,
      'winRate', win_rate,
      'battles', battles,
      'status', status,
      'joinedAt', case when joined_at is null then null else to_char(joined_at at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"') end
    ) order by rn) filter (where rn <= v_queue_limit), '[]'::jsonb)
    into v_queue
    from queued;

    v_snapshot := jsonb_build_object(
      'mode', v_mode,
      'hostOwnerId', case when v_room.owner_id is null then null else v_room.owner_id::text end,
      'hostRole', v_host_role,
      'seatLimit', jsonb_build_object('allowed', v_allowed, 'total', v_total),
      'seatIndexes', v_seat_indexes,
      'pendingSeatIndexes', v_pending_indexes,
      'assigned', v_assigned,
      'overflow', v_overflow,
      'fillQueue', v_queue,
      'poolSize', v_pool_size,
      'generatedAt', v_epoch_ms
    );
  end if;

  insert into public.rank_session_meta as m (
    session_id,
    async_fill_snapshot,
    updated_at
  ) values (
    p_session_id,
    v_snapshot,
    v_now
  )
  on conflict (session_id)
  do update set
    async_fill_snapshot = excluded.async_fill_snapshot,
    updated_at = excluded.updated_at
  returning m.*
  into v_meta;

  return query select
    v_meta.session_id,
    v_meta.selected_time_limit_seconds,
    v_meta.time_vote,
    v_meta.drop_in_bonus_seconds,
    v_meta.turn_state,
    v_meta.async_fill_snapshot,
    v_meta.realtime_mode,
    v_meta.updated_at;
end;
$$;

create or replace function public.bump_rank_session_slot_version(
  p_session_id uuid
)
returns table (
  session_id uuid,
  slot_schema_version integer,
  slot_schema_updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row record;
begin
  update public.rank_sessions
  set
    slot_schema_version = slot_schema_version + 1,
    slot_schema_updated_at = now(),
    updated_at = now()
  where id = p_session_id
  returning * into v_row;

  if not found then
    return query select null::uuid, null::integer, null::timestamptz;
  else
    return query select v_row.id, v_row.slot_schema_version, v_row.slot_schema_updated_at;
  end if;
end;
$$;

-- 2) 슬롯 캐시 테이블 & 잠금 RPC
create table if not exists public.rank_room_slot_cache (
  session_id uuid not null references public.rank_sessions(id) on delete cascade,
  slot_index integer not null,
  role text not null,
  occupant_id uuid references auth.users(id) on delete set null,
  status text not null default 'reserved',
  lock_token uuid not null default gen_random_uuid(),
  version integer not null default 1,
  reserved_at timestamptz not null default now(),
  expires_at timestamptz,
  primary key (session_id, slot_index)
);

create or replace function public.claim_rank_room_slot(
  p_session_id uuid,
  p_slot_index integer,
  p_role text,
  p_user_id uuid,
  p_ttl_seconds integer default 45
)
returns table (
  ok boolean,
  lock_token uuid,
  version integer,
  expires_at timestamptz,
  occupant_id uuid,
  error_code text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_expiry timestamptz := v_now + make_interval(secs => greatest(15, coalesce(p_ttl_seconds, 45)));
  v_row public.rank_room_slot_cache%rowtype;
begin
  if p_role is null or length(trim(p_role)) = 0 then
    return query select false, null, null, null, null, 'role_required';
  end if;

  loop
    begin
      insert into public.rank_room_slot_cache as c (
        session_id, slot_index, role, occupant_id, status, reserved_at, expires_at, lock_token, version
      ) values (
        p_session_id,
        p_slot_index,
        p_role,
        p_user_id,
        'reserved',
        v_now,
        v_expiry,
        gen_random_uuid(),
        1
      )
      on conflict (session_id, slot_index)
      do update set
        role = excluded.role,
        occupant_id = excluded.occupant_id,
        status = 'reserved',
        reserved_at = v_now,
        expires_at = v_expiry,
        lock_token = gen_random_uuid(),
        version = c.version + 1
      where c.expires_at is null or c.expires_at <= v_now or c.occupant_id = p_user_id
      returning * into v_row;

      exit;
    exception
      when unique_violation then
        null;
      when no_data_found then
        return query select false, null, null, null, null, 'slot_locked';
    end;
  end loop;

  if v_row.session_id is null then
    return query select false, null, null, null, null, 'slot_locked';
  end if;

  return query select true, v_row.lock_token, v_row.version, v_row.expires_at, v_row.occupant_id, null;
end;
$$;

--    • 최신 스키마를 빠르게 반영하려면 `docs/sql/upsert-match-session-meta.sql`
--      파일을 그대로 붙여넣으면 된다. 기존 프로젝트는 `alter table ... add
--      column if not exists` 블록이 turn_state와 async_fill_snapshot을 추가하고
--      기본값을 맞춰준다.

create table if not exists public.rank_session_meta (
  session_id uuid primary key references public.rank_sessions(id) on delete cascade,
  time_vote jsonb,
  selected_time_limit_seconds integer,
  realtime_mode text default 'off',
  drop_in_bonus_seconds integer default 0,
  turn_state jsonb,
  async_fill_snapshot jsonb,
  updated_at timestamptz not null default now()
);

create or replace function public.upsert_match_session_meta(
  p_session_id uuid,
  p_selected_time_limit integer default null,
  p_time_vote jsonb default null,
  p_drop_in_bonus_seconds integer default 0,
  p_turn_state jsonb default null,
  p_async_fill_snapshot jsonb default null,
  p_realtime_mode text default null
)
returns table (
  session_id uuid,
  selected_time_limit_seconds integer,
  time_vote jsonb,
  drop_in_bonus_seconds integer,
  turn_state jsonb,
  async_fill_snapshot jsonb,
  realtime_mode text,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_now timestamptz := now();
  v_mode text;
  v_row record;
begin
  v_mode := lower(coalesce(p_realtime_mode, 'off'));
  if v_mode not in ('off', 'standard', 'pulse') then
    v_mode := 'off';
  end if;

  insert into public.rank_session_meta as m (
    session_id,
    selected_time_limit_seconds,
    time_vote,
    drop_in_bonus_seconds,
    turn_state,
    async_fill_snapshot,
    realtime_mode,
    updated_at
  ) values (
    p_session_id,
    p_selected_time_limit,
    p_time_vote,
    p_drop_in_bonus_seconds,
    p_turn_state,
    p_async_fill_snapshot,
    v_mode,
    v_now
  )
  on conflict (session_id)
  do update set
    selected_time_limit_seconds = excluded.selected_time_limit_seconds,
    time_vote = excluded.time_vote,
    drop_in_bonus_seconds = excluded.drop_in_bonus_seconds,
    turn_state = excluded.turn_state,
    async_fill_snapshot = excluded.async_fill_snapshot,
    realtime_mode = excluded.realtime_mode,
    updated_at = v_now
  returning * into v_row;

  return query select
    v_row.session_id,
    v_row.selected_time_limit_seconds,
    v_row.time_vote,
    v_row.drop_in_bonus_seconds,
    v_row.turn_state,
    v_row.async_fill_snapshot,
    v_row.realtime_mode,
    v_row.updated_at;
end;
$$;
```

## 3. 실행 권한 부여
위 RPC를 호출할 주체에 따라 다음 `grant` 문도 함께 실행한다.

```sql
grant execute on function public.validate_session(uuid) to authenticated;
grant execute on function public.bump_rank_session_slot_version(uuid) to service_role;
grant execute on function public.claim_rank_room_slot(uuid, integer, text, uuid, integer) to service_role;
grant execute on function public.upsert_match_session_meta(uuid, integer, jsonb, integer, jsonb, jsonb, text) to service_role;
grant execute on function public.refresh_match_session_async_fill(uuid, uuid, integer, integer) to service_role;
```

## 4. 참고
- 전체 번들을 실행하려면 `docs/supabase-rank-backend-upgrades.sql` 파일을 그대로 붙여넣으면 된다.
- 프론트엔드는 `matchDataStore`에서 `validate_session` 응답의 `slot_schema_version`을 사용하고, `StartClient`는 `upsert_match_session_meta`로 저장된 제한시간/보너스를 재활용한다.
- 실행 후에는 Supabase Table Editor에서 `rank_session_meta`가 채워지는지 확인하고, `validate_session` RPC 테스트 호출로 버전 필드가 노출되는지 검증하면 된다.
