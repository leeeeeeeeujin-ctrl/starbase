# Supabase chat realtime checklist

이 문서는 `/supabase/chat_realtime_backend.sql` 스크립트에 포함된 핵심 DDL/RLS/트리거 세트를 요약합니다. Supabase SQL Editor에서 스크립트를 실행하면 아래 항목이 한 번에 적용됩니다.

## 포함 사항

1. **채팅방 테이블과 RLS**  
   `chat_rooms`, `chat_room_members`를 생성하고 선택/삽입/수정/삭제 정책을 등록합니다. 각 테이블은 `updated_at`/`last_active_at`을 자동으로 갱신하는 트리거를 가집니다.

2. **`messages` 테이블 기본값 및 정책**
   메시지의 기본값·제약·인덱스를 정리하고, 기존 SELECT 정책을 모두 제거한 뒤 `messages_select_public` 단일 정책만 남겨 글로벌/방/세션/귓속말 노출을 제어하도록 구성합니다. 세션 판별을 위해 `is_rank_session_owner_or_roster` 함수도 함께 배포됩니다.

3. **Realtime 권한 및 브로드캐스트**  
   `realtime.messages` 스키마에 인증 사용자용 SELECT 정책을 추가하고, `emit_realtime_payload` + `broadcast_messages_changes` 트리거가 `messages:*` 토픽으로 브로드캐스트하도록 설정합니다.

4. **퍼블리케이션 연결**  
   `supabase_realtime` 퍼블리케이션에 `messages`, `chat_rooms`, `chat_room_members`가 포함되어 Postgres Changes 스트림이 즉시 구독됩니다.

## 사용 방법

1. Supabase 프로젝트 대시보드 → SQL Editor를 열고 `/supabase/chat_realtime_backend.sql` 파일 내용을 그대로 붙여넣은 뒤 실행합니다.
2. 성공 후 Realtime → Database 탭에서 `supabase_realtime` 퍼블리케이션에 위 테이블이 등록됐는지 확인합니다.
3. Realtime 로그에 `topic:messages:*` 이벤트가 올라오는지 살펴보고, 필요 시 클라이언트가 사용하는 토픽과 일치하는지 점검합니다.

스크립트는 재실행해도 안전하도록 `drop ... if exists` / `create ... if not exists` 패턴을 사용합니다.

### 핵심 정책 · 트리거 이름

| 분류 | 객체 이름 | 설명 |
| --- | --- | --- |
| SELECT RLS | `messages_select_public` | 인증/익명 사용자가 글로벌·방·세션·귓속말 메시지를 열람할 수 있도록 허용합니다. 스크립트는 적용 전에 기존 SELECT 정책을 모두 제거합니다. |
| INSERT RLS | `messages_insert_service_role` | 서비스 롤만 직접 INSERT할 수 있게 제한합니다. |
| UPDATE RLS | `messages_update_service_role` | 서비스 롤만 UPDATE를 수행할 수 있게 제한합니다. |
| DELETE RLS | `messages_delete_service_role` | 서비스 롤만 DELETE를 수행할 수 있게 제한합니다. |
| Realtime RLS | `realtime_messages_select_authenticated` | `realtime.messages` 뷰에서 인증 사용자가 브로드캐스트 메시지를 받을 수 있도록 허용합니다. |
| 함수 | `public.emit_realtime_payload` | 브로드캐스트 토픽 배열을 순회하며 `realtime.broadcast_changes`에 전달합니다. |
| 함수 | `public.broadcast_messages_changes` | `messages` 테이블 변경을 토픽별로 가공하고 `emit_realtime_payload`를 호출합니다. |
| 트리거 | `trg_messages_broadcast` | `messages` 테이블 변경 시 `broadcast_messages_changes` 함수를 실행합니다. |

퍼블리케이션은 `alter publication supabase_realtime add table ...` 구문으로 `messages`, `chat_rooms`, `chat_room_members`가 등록되어 있어야 합니다.

## 자주 묻는 항목 요약

실시간 채팅이 동작하려면 다음 SQL 조각이 반드시 적용돼 있어야 합니다. 이미 `/supabase/chat_realtime_backend.sql`에 포함되어 있지만, 필요한 블록만 다시 실행하고 싶을 때 참고하세요.

```sql
-- 메시지 RLS: 먼저 기존 SELECT 정책을 모두 제거합니다.
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
to authenticated, anon
using (
  scope = 'global'
  or visible_owner_ids is null
  or auth.uid() = owner_id
  or auth.uid() = user_id
  or (visible_owner_ids is not null and auth.uid() = any(visible_owner_ids))
  or (
    chat_room_id is not null
    and exists (
      select 1 from public.chat_room_members crm
      where crm.room_id = messages.chat_room_id
        and crm.owner_id = auth.uid()
    )
  )
  or (
    match_instance_id is not null
    and exists (
      select 1 from public.rank_match_roster rmr
      where rmr.match_instance_id = messages.match_instance_id
        and rmr.owner_id = auth.uid()
    )
  )
  or (
    session_id is not null
    and public.is_rank_session_owner_or_roster(messages.session_id, auth.uid())
  )
);

-- 실시간 브로드캐스트 트리거
create or replace function public.broadcast_messages_changes()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event text := TG_OP;
  v_topics text[];
  v_new jsonb := null;
  v_old jsonb := null;
begin
  if TG_OP in ('INSERT','UPDATE') then
    v_new := to_jsonb(NEW);
  end if;
  if TG_OP in ('UPDATE','DELETE') then
    v_old := to_jsonb(OLD);
  end if;

  v_topics := array[
    'broadcast_messages_changes',
    'messages:global',
    case when coalesce(NEW.scope, OLD.scope) is not null
      then 'messages:scope:' || lower(coalesce(NEW.scope, OLD.scope)) end,
    case when coalesce(NEW.chat_room_id, OLD.chat_room_id) is not null
      then 'messages:room:' || coalesce(NEW.chat_room_id, OLD.chat_room_id)::text end
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

-- Postgres Changes 퍼블리케이션
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.chat_rooms;
alter publication supabase_realtime add table public.chat_room_members;
```

위 코드만 실행해도 메시지 테이블 RLS, 브로드캐스트 트리거, 퍼블리케이션 연결이 복구됩니다.
