-- Chat realtime bootstrap script
-- This extracts the minimal tables, policies, triggers, and publication wiring
-- required for the arena/chat clients. Run inside Supabase SQL editor.

-- 1. Chat room containers ---------------------------------------------------
create table if not exists public.chat_rooms (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  name text not null,
  description text,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hero_id uuid references public.heroes(id) on delete set null,
  visibility text not null default 'public',
  capacity integer,
  is_system boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create table if not exists public.chat_room_members (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.chat_rooms(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  hero_id uuid references public.heroes(id) on delete set null,
  role text,
  status text not null default 'active',
  is_moderator boolean not null default false,
  last_active_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.chat_rooms enable row level security;
alter table public.chat_room_members enable row level security;

-- Room policies -------------------------------------------------------------
drop policy if exists chat_rooms_select on public.chat_rooms;
create policy chat_rooms_select
on public.chat_rooms for select
using (
  visibility = 'public'
  or owner_id = auth.uid()
  or exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_rooms.id
      and m.owner_id = auth.uid()
  )
);

drop policy if exists chat_rooms_insert on public.chat_rooms;
create policy chat_rooms_insert
on public.chat_rooms for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists chat_rooms_update on public.chat_rooms;
create policy chat_rooms_update
on public.chat_rooms for update
using (auth.uid() = owner_id)
with check (auth.uid() = owner_id);

drop policy if exists chat_rooms_delete on public.chat_rooms;
create policy chat_rooms_delete
on public.chat_rooms for delete
using (auth.uid() = owner_id);

drop policy if exists chat_room_members_select on public.chat_room_members;
create policy chat_room_members_select
on public.chat_room_members for select
using (
  owner_id = auth.uid()
  or exists (
    select 1
    from public.chat_rooms r
    where r.id = chat_room_members.room_id
      and (r.owner_id = auth.uid() or r.visibility = 'public')
  )
);

drop policy if exists chat_room_members_insert on public.chat_room_members;
create policy chat_room_members_insert
on public.chat_room_members for insert to authenticated
with check (auth.uid() = owner_id);

drop policy if exists chat_room_members_update on public.chat_room_members;
drop policy if exists chat_room_members_delete on public.chat_room_members;

drop function if exists public.is_chat_room_moderator(uuid, uuid);

create policy chat_room_members_update
on public.chat_room_members for update
using (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_room_members.room_id
      and m.owner_id = auth.uid()
      and m.is_moderator
  )
  or exists (
    select 1
    from public.chat_rooms r
    where r.id = chat_room_members.room_id
      and r.owner_id = auth.uid()
  )
)
with check (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_room_members.room_id
      and m.owner_id = auth.uid()
      and m.is_moderator
  )
  or exists (
    select 1
    from public.chat_rooms r
    where r.id = chat_room_members.room_id
      and r.owner_id = auth.uid()
  )
);

create policy chat_room_members_delete
on public.chat_room_members for delete
using (
  auth.uid() = owner_id
  or exists (
    select 1
    from public.chat_room_members m
    where m.room_id = chat_room_members.room_id
      and m.owner_id = auth.uid()
      and m.is_moderator
  )
  or exists (
    select 1
    from public.chat_rooms r
    where r.id = chat_room_members.room_id
      and r.owner_id = auth.uid()
  )
);

create index if not exists chat_rooms_visibility_idx
  on public.chat_rooms (visibility, updated_at desc);

create index if not exists chat_room_members_owner_idx
  on public.chat_room_members (owner_id, room_id);

create index if not exists chat_room_members_room_idx
  on public.chat_room_members (room_id, last_active_at desc);

create or replace function public.touch_chat_room_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_chat_rooms_set_updated_at on public.chat_rooms;
create trigger trg_chat_rooms_set_updated_at
before update on public.chat_rooms
for each row execute function public.touch_chat_room_updated_at();

create or replace function public.touch_chat_room_member_activity()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  if new.status = 'active' then
    new.last_active_at := timezone('utc', now());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_chat_room_members_touch on public.chat_room_members;
create trigger trg_chat_room_members_touch
before update on public.chat_room_members
for each row execute function public.touch_chat_room_member_activity();

create or replace function public.guard_chat_room_member_moderators()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  acting_user uuid := auth.uid();
begin
  if TG_OP = 'UPDATE' then
    if new.is_moderator and not coalesce(old.is_moderator, false) then
      if acting_user is null then
        raise exception '운영자 권한을 변경하려면 인증이 필요합니다.';
      end if;

      if old.owner_id = acting_user then
        if not exists (
          select 1
          from public.chat_rooms r
          where r.id = new.room_id
            and r.owner_id = acting_user
        ) then
          raise exception '채팅방에서 자신을 운영자로 승격할 수 없습니다.';
        end if;
      end if;
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_chat_room_members_guard on public.chat_room_members;
create trigger trg_chat_room_members_guard
before update on public.chat_room_members
for each row execute function public.guard_chat_room_member_moderators();

alter table public.messages
  alter column created_at set default timezone('utc', now());
alter table public.messages
  alter column updated_at set default timezone('utc', now());
alter table public.messages
  alter column scope set default 'global';
alter table public.messages
  alter column channel_type set default 'lobby';
alter table public.messages
  alter column metadata set default '{}'::jsonb;
alter table public.messages
  alter column visible_owner_ids drop default;

alter table public.messages
  drop constraint if exists messages_channel_type_check;
alter table public.messages
  add constraint messages_channel_type_check
  check (channel_type in ('lobby','main','role','whisper','system','room'));

alter table public.messages
  drop constraint if exists messages_scope_check;
alter table public.messages
  add constraint messages_scope_check
  check (scope in ('global','main','role','whisper','system','room'));

create index if not exists messages_created_at_idx
  on public.messages (created_at desc);
create index if not exists messages_scope_created_at_idx
  on public.messages (scope, created_at desc);
create index if not exists messages_session_scope_idx
  on public.messages (session_id, scope, created_at desc);
create index if not exists messages_match_instance_idx
  on public.messages (match_instance_id, created_at desc);
create index if not exists messages_owner_scope_idx
  on public.messages (owner_id, scope, created_at desc);
create index if not exists messages_chat_room_idx
  on public.messages (chat_room_id, created_at desc);

create or replace function public.touch_messages_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := timezone('utc', now());
  return new;
end;
$$;

drop trigger if exists trg_messages_set_updated_at on public.messages;
create trigger trg_messages_set_updated_at
before update on public.messages
for each row execute function public.touch_messages_updated_at();

-- Reset every SELECT policy on public.messages so legacy entries do not clash
-- with the canonical `messages_select_public` policy below.
do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.messages', policy_record.policyname);
  end loop;
end;
$$;

create or replace function public.is_rank_session_owner_or_roster(
  p_session_id uuid,
  p_owner_id uuid
)
returns boolean
language plpgsql
security definer
stable
set search_path = public
as $$
declare
  v_match_instance uuid := null;
begin
  if p_session_id is null or p_owner_id is null then
    return false;
  end if;

  if exists (
    select 1
    from public.rank_sessions rs
    where rs.id = p_session_id
      and (rs.owner_id is null or rs.owner_id = p_owner_id)
  ) then
    return true;
  end if;

  select public.try_cast_uuid(
           coalesce(
             rsm.extras->>'matchInstanceId',
             rsm.extras->>'match_instance_id',
             rsm.async_fill_snapshot->>'matchInstanceId',
             rsm.async_fill_snapshot->>'match_instance_id'
           )
         )
    into v_match_instance
  from public.rank_session_meta rsm
  where rsm.session_id = p_session_id
  order by rsm.updated_at desc
  limit 1;

  if v_match_instance is null then
    return false;
  end if;

  return exists (
    select 1
    from public.rank_match_roster rmr
    where rmr.match_instance_id = v_match_instance
      and rmr.owner_id = p_owner_id
  );
end;
$$;

do $$
declare
  policy_record record;
begin
  for policy_record in
    select policyname
    from pg_policies
    where schemaname = 'public'
      and tablename = 'messages'
      and cmd = 'SELECT'
  loop
    execute format('drop policy %I on public.messages', policy_record.policyname);
  end loop;
end;
$$;

create policy messages_select_public
on public.messages for select
to authenticated
using (
  scope = 'global'
  or visible_owner_ids is null
  or auth.uid() = owner_id
  or auth.uid() = user_id
  or (visible_owner_ids is not null and auth.uid() = any(visible_owner_ids))
  or (
    chat_room_id is not null
    and exists (
      select 1
      from public.chat_room_members crm
      where crm.room_id = messages.chat_room_id
        and crm.owner_id = auth.uid()
    )
  )
  or (
    match_instance_id is not null
    and exists (
      select 1
      from public.rank_match_roster rmr
      where rmr.match_instance_id = messages.match_instance_id
        and rmr.owner_id = auth.uid()
    )
  )
  or (
    session_id is not null
    and public.is_rank_session_owner_or_roster(messages.session_id, auth.uid())
  )
);

drop policy if exists messages_insert_service_role on public.messages;
create policy messages_insert_service_role
on public.messages for insert
with check (auth.role() = 'service_role');

drop policy if exists messages_update_service_role on public.messages;
create policy messages_update_service_role
on public.messages for update
using (auth.role() = 'service_role')
with check (auth.role() = 'service_role');

drop policy if exists messages_delete_service_role on public.messages;
create policy messages_delete_service_role
on public.messages for delete
using (auth.role() = 'service_role');

-- Realtime schema policy so authenticated clients can receive broadcasts.
drop policy if exists realtime_messages_select_authenticated on realtime.messages;
create policy realtime_messages_select_authenticated
on realtime.messages for select
to authenticated
using (true);

-- 3. Broadcast helpers ------------------------------------------------------
create or replace function public.emit_realtime_payload(
  p_topics text[],
  p_event text,
  p_table text,
  p_schema text,
  p_new jsonb,
  p_old jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  topic text;
  v_topic text;
  v_final_topic text;
begin
  if p_topics is null then
    return;
  end if;

  for topic in
    select distinct trim(both from value)
    from unnest(p_topics) as entries(value)
    where trim(both from value) <> ''
  loop
    v_topic := trim(both from topic);
    if v_topic is null or v_topic = '' then
      continue;
    end if;

    if left(v_topic, 6) = 'topic:' or left(v_topic, 10) = 'broadcast:' or left(v_topic, 9) = 'realtime:' then
      v_final_topic := v_topic;
    else
      v_final_topic := 'topic:' || v_topic;
    end if;

    begin
      perform realtime.broadcast_changes(
        v_final_topic,
        coalesce(p_event, 'UPDATE'),
        coalesce(p_event, 'UPDATE'),
        coalesce(p_table, 'unknown'),
        coalesce(p_schema, 'public'),
        p_new,
        p_old
      );
    exception
      when others then
        raise notice '[emit_realtime_payload] failed for topic %: %', topic, SQLERRM;
    end;
  end loop;
end;
$$;

create or replace function public.broadcast_messages_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_scope text := null;
  v_channel text := null;
  v_session uuid := null;
  v_match uuid := null;
  v_game uuid := null;
  v_room uuid := null;
  v_owner uuid := null;
  v_user uuid := null;
  v_hero uuid := null;
  v_target_owner uuid := null;
  v_target_hero uuid := null;
  v_thread text := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_scope := OLD.scope;
    v_channel := OLD.channel_type;
    v_session := OLD.session_id;
    v_match := OLD.match_instance_id;
    v_game := OLD.game_id;
    v_room := OLD.room_id;
    v_owner := OLD.owner_id;
    v_user := OLD.user_id;
    v_hero := OLD.hero_id;
    v_target_owner := OLD.target_owner_id;
    v_target_hero := OLD.target_hero_id;
    v_thread := OLD.thread_hint;
  else
    v_scope := NEW.scope;
    v_channel := NEW.channel_type;
    v_session := NEW.session_id;
    v_match := NEW.match_instance_id;
    v_game := NEW.game_id;
    v_room := NEW.room_id;
    v_owner := NEW.owner_id;
    v_user := NEW.user_id;
    v_hero := NEW.hero_id;
    v_target_owner := NEW.target_owner_id;
    v_target_hero := NEW.target_hero_id;
    v_thread := NEW.thread_hint;
  end if;

  if TG_OP in ('INSERT','UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE','DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    'broadcast_messages_changes',
    'messages:global',
    case when v_scope is not null then 'messages:scope:' || lower(v_scope) end,
    case when v_channel is not null then 'messages:channel:' || lower(v_channel) end,
    case when v_session is not null then 'messages:session:' || v_session::text end,
    case when v_match is not null then 'messages:match:' || v_match::text end,
    case when v_game is not null then 'messages:game:' || v_game::text end,
    case when v_room is not null then 'messages:room:' || v_room::text end,
    case when v_owner is not null then 'messages:owner:' || v_owner::text end,
    case when v_user is not null then 'messages:user:' || v_user::text end,
    case when v_hero is not null then 'messages:hero:' || v_hero::text end,
    case when v_target_owner is not null then 'messages:target-owner:' || v_target_owner::text end,
    case when v_target_hero is not null then 'messages:target-hero:' || v_target_hero::text end,
    case when v_thread is not null then 'messages:thread:' || v_thread end
  ];

  perform public.emit_realtime_payload(
    v_topics,
    v_event,
    TG_TABLE_NAME,
    TG_TABLE_SCHEMA,
    v_new,
    v_old
  );

  return null;
end;
$$;

drop trigger if exists trg_messages_broadcast on public.messages;
create trigger trg_messages_broadcast
after insert or update or delete
on public.messages
for each row execute function public.broadcast_messages_changes();

-- 4. Publication wiring -----------------------------------------------------
do $$
begin
  if not exists (
    select 1 from pg_publication where pubname = 'supabase_realtime'
  ) then
    perform 1;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_rooms'
  ) then
    alter publication supabase_realtime add table public.chat_rooms;
  end if;
end;
$$;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'chat_room_members'
  ) then
    alter publication supabase_realtime add table public.chat_room_members;
  end if;
end;
$$;
