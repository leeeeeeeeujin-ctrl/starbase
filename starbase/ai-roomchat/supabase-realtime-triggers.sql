-- Supabase realtime broadcast policies, helpers, and triggers
-- Run this script in the Supabase SQL editor to (re)create the realtime
-- publication plumbing for matchmaking and chat updates.

-- Table-level RLS for chat writes/reads plus realtime channel access.
drop policy if exists messages_select_public on public.messages;
create policy messages_select_public
on public.messages for select
using (
  scope = 'global'
  or visible_owner_ids is null
  or auth.uid() = owner_id
  or auth.uid() = user_id
  or (visible_owner_ids is not null and auth.uid() = any(visible_owner_ids))
);

drop policy if exists messages_insert_service_role on public.messages;
drop policy if exists messages_insert_auth on public.messages;
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

-- Allow authenticated clients to receive broadcast payloads emitted via
-- realtime.broadcast_changes/emit_realtime_payload.
drop policy if exists realtime_messages_select_authenticated on realtime.messages;
create policy realtime_messages_select_authenticated
on realtime.messages for select
  to authenticated
  using (true);

-- Helper to fan out payloads across multiple channel topics.
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

    if left(v_topic, 6) = 'topic:'
       or left(v_topic, 10) = 'broadcast:'
       or left(v_topic, 9) = 'realtime:' then
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

-- Messages ---------------------------------------------------------------
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
  elsif TG_OP = 'INSERT' then
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
  else
    v_scope := coalesce(NEW.scope, OLD.scope);
    v_channel := coalesce(NEW.channel_type, OLD.channel_type);
    v_session := coalesce(NEW.session_id, OLD.session_id);
    v_match := coalesce(NEW.match_instance_id, OLD.match_instance_id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_room := coalesce(NEW.room_id, OLD.room_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
    v_user := coalesce(NEW.user_id, OLD.user_id);
    v_hero := coalesce(NEW.hero_id, OLD.hero_id);
    v_target_owner := coalesce(NEW.target_owner_id, OLD.target_owner_id);
    v_target_hero := coalesce(NEW.target_hero_id, OLD.target_hero_id);
    v_thread := coalesce(NEW.thread_hint, OLD.thread_hint);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    'broadcast_messages_changes',
    'messages:global',
    case when v_scope is not null and trim(both from v_scope) <> '' then 'messages:scope:' || lower(trim(both from v_scope)) end,
    case when v_channel is not null and trim(both from v_channel) <> '' then 'messages:channel:' || lower(trim(both from v_channel)) end,
    case when v_session is not null then 'messages:session:' || v_session::text end,
    case when v_match is not null then 'messages:match:' || v_match::text end,
    case when v_game is not null then 'messages:game:' || v_game::text end,
    case when v_room is not null then 'messages:room:' || v_room::text end,
    case when v_owner is not null then 'messages:owner:' || v_owner::text end,
    case when v_user is not null then 'messages:user:' || v_user::text end,
    case when v_hero is not null then 'messages:hero:' || v_hero::text end,
    case when v_target_owner is not null then 'messages:target-owner:' || v_target_owner::text end,
    case when v_target_hero is not null then 'messages:target-hero:' || v_target_hero::text end,
    case when v_thread is not null and trim(both from v_thread) <> '' then 'messages:thread:' || trim(both from v_thread) end
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
after insert or update or delete on public.messages
for each row execute function public.broadcast_messages_changes();

-- Matchmaking tables -----------------------------------------------------
create or replace function public.broadcast_rank_queue_tickets()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_ticket uuid := null;
  v_queue text := null;
  v_owner uuid := null;
  v_room uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_ticket := OLD.id;
    v_queue := OLD.queue_id;
    v_owner := OLD.owner_id;
    v_room := OLD.room_id;
  elsif TG_OP = 'INSERT' then
    v_ticket := NEW.id;
    v_queue := NEW.queue_id;
    v_owner := NEW.owner_id;
    v_room := NEW.room_id;
  else
    v_ticket := coalesce(NEW.id, OLD.id);
    v_queue := coalesce(NEW.queue_id, OLD.queue_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
    v_room := coalesce(NEW.room_id, OLD.room_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_ticket is not null then 'rank_queue_tickets:ticket:' || v_ticket::text end,
    case when v_queue is not null then 'rank_queue_tickets:queue:' || v_queue end,
    case when v_owner is not null then 'rank_queue_tickets:owner:' || v_owner::text end,
    case when v_room is not null then 'rank_queue_tickets:room:' || v_room::text end
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

drop trigger if exists trg_rank_queue_tickets_broadcast on public.rank_queue_tickets;
create trigger trg_rank_queue_tickets_broadcast
after insert or update or delete on public.rank_queue_tickets
for each row execute function public.broadcast_rank_queue_tickets();

create or replace function public.broadcast_rank_rooms()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_room uuid := null;
  v_game uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_room := OLD.id;
    v_game := OLD.game_id;
    v_owner := OLD.owner_id;
  elsif TG_OP = 'INSERT' then
    v_room := NEW.id;
    v_game := NEW.game_id;
    v_owner := NEW.owner_id;
  else
    v_room := coalesce(NEW.id, OLD.id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_room is not null then 'rank_rooms:room:' || v_room::text end,
    case when v_game is not null then 'rank_rooms:game:' || v_game::text end,
    case when v_owner is not null then 'rank_rooms:owner:' || v_owner::text end
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

drop trigger if exists trg_rank_rooms_broadcast on public.rank_rooms;
create trigger trg_rank_rooms_broadcast
after insert or update or delete on public.rank_rooms
for each row execute function public.broadcast_rank_rooms();

create or replace function public.broadcast_rank_room_slots()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_room uuid := null;
  v_slot integer := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_room := OLD.room_id;
    v_slot := OLD.slot_index;
    v_owner := OLD.occupant_owner_id;
  elsif TG_OP = 'INSERT' then
    v_room := NEW.room_id;
    v_slot := NEW.slot_index;
    v_owner := NEW.occupant_owner_id;
  else
    v_room := coalesce(NEW.room_id, OLD.room_id);
    v_slot := coalesce(NEW.slot_index, OLD.slot_index);
    v_owner := coalesce(NEW.occupant_owner_id, OLD.occupant_owner_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_room is not null then 'rank_room_slots:room:' || v_room::text end,
    case when v_room is not null and v_slot is not null then 'rank_room_slots:room:' || v_room::text || ':slot:' || v_slot::text end,
    case when v_owner is not null then 'rank_room_slots:owner:' || v_owner::text end
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

drop trigger if exists trg_rank_room_slots_broadcast on public.rank_room_slots;
create trigger trg_rank_room_slots_broadcast
after insert or update or delete on public.rank_room_slots
for each row execute function public.broadcast_rank_room_slots();

create or replace function public.broadcast_rank_sessions()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_id uuid := null;
  v_game uuid := null;
  v_owner uuid := null;
  v_room uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_id := OLD.id;
    v_game := OLD.game_id;
    v_owner := OLD.owner_id;
    v_room := OLD.room_id;
  elsif TG_OP = 'INSERT' then
    v_id := NEW.id;
    v_game := NEW.game_id;
    v_owner := NEW.owner_id;
    v_room := NEW.room_id;
  else
    v_id := coalesce(NEW.id, OLD.id);
    v_game := coalesce(NEW.game_id, OLD.game_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
    v_room := coalesce(NEW.room_id, OLD.room_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_id is not null then 'rank_sessions:session:' || v_id::text end,
    case when v_game is not null then 'rank_sessions:game:' || v_game::text end,
    case when v_owner is not null then 'rank_sessions:owner:' || v_owner::text end,
    case when v_room is not null then 'rank_sessions:room:' || v_room::text end
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

drop trigger if exists trg_rank_sessions_broadcast on public.rank_sessions;
create trigger trg_rank_sessions_broadcast
after insert or update or delete on public.rank_sessions
for each row execute function public.broadcast_rank_sessions();

create or replace function public.broadcast_rank_session_meta()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_session uuid := null;
  v_game uuid := null;
  v_room uuid := null;
  v_match uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
  v_match_hint text := null;
begin
  if TG_OP = 'DELETE' then
    v_session := OLD.session_id;
    v_owner := OLD.occupant_owner_id;
    v_match_hint := coalesce(
      OLD.extras->>'matchInstanceId',
      OLD.extras->>'match_instance_id',
      OLD.async_fill_snapshot->>'matchInstanceId',
      OLD.async_fill_snapshot->>'match_instance_id'
    );
  elsif TG_OP = 'INSERT' then
    v_session := NEW.session_id;
    v_owner := NEW.occupant_owner_id;
    v_match_hint := coalesce(
      NEW.extras->>'matchInstanceId',
      NEW.extras->>'match_instance_id',
      NEW.async_fill_snapshot->>'matchInstanceId',
      NEW.async_fill_snapshot->>'match_instance_id'
    );
  else
    v_session := coalesce(NEW.session_id, OLD.session_id);
    v_owner := coalesce(NEW.occupant_owner_id, OLD.occupant_owner_id);
    v_match_hint := coalesce(
      NEW.extras->>'matchInstanceId',
      NEW.extras->>'match_instance_id',
      NEW.async_fill_snapshot->>'matchInstanceId',
      NEW.async_fill_snapshot->>'match_instance_id',
      OLD.extras->>'matchInstanceId',
      OLD.extras->>'match_instance_id',
      OLD.async_fill_snapshot->>'matchInstanceId',
      OLD.async_fill_snapshot->>'match_instance_id'
    );
  end if;

  if v_session is not null then
    select s.game_id, s.room_id
      into v_game, v_room
    from public.rank_sessions s
    where s.id = v_session
    limit 1;
  end if;

  v_match := public.try_cast_uuid(v_match_hint);

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_session is not null then 'rank_session_meta:session:' || v_session::text end,
    case when v_game is not null then 'rank_session_meta:game:' || v_game::text end,
    case when v_room is not null then 'rank_session_meta:room:' || v_room::text end,
    case when v_match is not null then 'rank_session_meta:match:' || v_match::text end,
    case when v_owner is not null then 'rank_session_meta:owner:' || v_owner::text end
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

drop trigger if exists trg_rank_session_meta_broadcast on public.rank_session_meta;
create trigger trg_rank_session_meta_broadcast
after insert or update or delete on public.rank_session_meta
for each row execute function public.broadcast_rank_session_meta();

create or replace function public.broadcast_rank_match_roster()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_match uuid := null;
  v_session uuid := null;
  v_owner uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_match := OLD.match_instance_id;
    v_session := OLD.session_id;
    v_owner := OLD.owner_id;
  elsif TG_OP = 'INSERT' then
    v_match := NEW.match_instance_id;
    v_session := NEW.session_id;
    v_owner := NEW.owner_id;
  else
    v_match := coalesce(NEW.match_instance_id, OLD.match_instance_id);
    v_session := coalesce(NEW.session_id, OLD.session_id);
    v_owner := coalesce(NEW.owner_id, OLD.owner_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_match is not null then 'rank_match_roster:match:' || v_match::text end,
    case when v_session is not null then 'rank_match_roster:session:' || v_session::text end,
    case when v_owner is not null then 'rank_match_roster:owner:' || v_owner::text end
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

drop trigger if exists trg_rank_match_roster_broadcast on public.rank_match_roster;
create trigger trg_rank_match_roster_broadcast
after insert or update or delete on public.rank_match_roster
for each row execute function public.broadcast_rank_match_roster();

create or replace function public.broadcast_rank_turns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_session uuid := null;
  v_match uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_session := OLD.session_id;
    v_match := OLD.match_instance_id;
  elsif TG_OP = 'INSERT' then
    v_session := NEW.session_id;
    v_match := NEW.match_instance_id;
  else
    v_session := coalesce(NEW.session_id, OLD.session_id);
    v_match := coalesce(NEW.match_instance_id, OLD.match_instance_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_session is not null then 'rank_turns:session:' || v_session::text end,
    case when v_match is not null then 'rank_turns:match:' || v_match::text end
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

drop trigger if exists trg_rank_turns_broadcast on public.rank_turns;
create trigger trg_rank_turns_broadcast
after insert or update or delete on public.rank_turns
for each row execute function public.broadcast_rank_turns();

create or replace function public.broadcast_rank_turn_state_events()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_session uuid := null;
  v_match uuid := null;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP = 'DELETE' then
    v_session := OLD.session_id;
    v_match := OLD.match_instance_id;
  elsif TG_OP = 'INSERT' then
    v_session := NEW.session_id;
    v_match := NEW.match_instance_id;
  else
    v_session := coalesce(NEW.session_id, OLD.session_id);
    v_match := coalesce(NEW.match_instance_id, OLD.match_instance_id);
  end if;

  if TG_OP in ('INSERT', 'UPDATE') then
    v_new := to_jsonb(NEW);
  end if;

  if TG_OP in ('UPDATE', 'DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    case when v_session is not null then 'rank_turn_state_events:session:' || v_session::text end,
    case when v_match is not null then 'rank_turn_state_events:match:' || v_match::text end
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

-- Optional: rank_turn_state_events (if the table exists)
do $$
begin
  if exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and table_name = 'rank_turn_state_events'
  ) then
    execute 'drop trigger if exists trg_rank_turn_state_events_broadcast on public.rank_turn_state_events';
    execute 'create trigger trg_rank_turn_state_events_broadcast after insert or update or delete on public.rank_turn_state_events for each row execute function public.broadcast_rank_turn_state_events()';
  end if;
end;
$$;
