# Supabase chat realtime checklist

이 문서는 `/supabase/chat_realtime_backend.sql` 스크립트에 포함된 핵심 DDL/RLS/트리거 세트를 요약합니다. Supabase SQL Editor에서 스크립트를 실행하면 아래 항목이 한 번에 적용됩니다.

## 포함 사항

1. **채팅방 테이블과 RLS**
   `chat_rooms`, `chat_room_members`, `chat_room_moderators`를 생성하고 선택/삽입/수정/삭제 정책을 등록합니다. 각 테이블은 `updated_at`/`last_active_at`을 자동으로 갱신하는 트리거를 가집니다. 운영자 멤버십은 `chat_room_members` 트리거가 `chat_room_moderators` 캐시로 동기화하고, 동시에 `room_owner_id`·`room_visibility` 메타데이터를 미리 채워 RLS 평가 중 `chat_rooms` ↔ `chat_room_members`가 서로 재귀 호출되지 않도록 분리합니다. 추가로 멤버 행에는 `joined_at`, `last_read_message_at`, `last_read_message_id` 컬럼을 포함해 클라이언트가 읽지 않은 메시지 수를 계산할 수 있습니다.

2. **`messages` 테이블 기본값 및 정책**
   메시지의 기본값·제약·인덱스를 정리하고, 기존 SELECT 정책을 모두 제거한 뒤 `messages_select_public` 단일 정책만 남겨 글로벌/방/세션/귓속말 노출을 제어하도록 구성합니다. 세션 판별을 위해 `is_rank_session_owner_or_roster` 함수도 함께 배포됩니다.

3. **Realtime 권한 및 브로드캐스트**
   `realtime.messages` 스키마에 인증 사용자용 SELECT 정책을 추가하고, `emit_realtime_payload` + `broadcast_messages_changes` 트리거가 `messages:*` 토픽으로 브로드캐스트하도록 설정합니다.

4. **퍼블리케이션 연결**
   `supabase_realtime` 퍼블리케이션에 `messages`, `chat_rooms`, `chat_room_members`가 포함되어 Postgres Changes 스트림이 즉시 구독됩니다.

5. **채팅방 읽음/첨부 파일 전송 경로**
   `send_rank_chat_message` 함수가 `metadata.attachments` 배열을 수용하도록 확장되어 텍스트 없이도 압축된 파일 첨부를 게시할 수 있습니다. 클라이언트는 Supabase Storage `chat-attachments` 버킷에 업로드 후 서명 URL을 통해 내려받습니다.
    `mark_chat_room_read(room_id, message_id)` RPC는 사용자가 특정 채팅방을 읽은 시각을 저장해 카드 뷰의 안 읽은 메시지 배지를 계산합니다.
    `fetch_chat_rooms(search, limit)` / `fetch_chat_dashboard(limit)` RPC는 `joined`·`available` 목록에 `latest_message`, `unread_count`, `cover_url`, `last_message_at`, `last_read_message_at` 등 카드 UI가 요구하는 필드를 함께 반환합니다. 동시에 `chat_room_search_terms` 캐시 테이블에 검색어를 기록해 상위 5개 실시간 키워드와 검색어 기반 추천을 `trendingKeywords` / `suggestedKeywords` 배열로 제공합니다.

### `fetch_chat_rooms` / `fetch_chat_dashboard` 응답 형식

```jsonc
{
  "joined": [
    {
      "id": "…",
      "name": "방 제목",
      "cover_url": "https://…/hero.png",
      "member_count": 4,
      "unread_count": 2,
      "last_message_at": "2024-05-26T15:00:00Z",
      "latest_message": {
        "id": "…",
        "text": "최근 대화",
        "created_at": "2024-05-26T15:00:00Z",
        "owner_id": "…"
      }
    }
  ],
  "available": [ /* 공개 방 목록, joined와 동일 구조 */ ],
  "trendingKeywords": [
    {
      "keyword": "마피아",        // 최근 검색이 많은 키워드 (소문자로 정규화)
      "search_count": 42,
      "last_searched_at": "2024-05-27T00:30:00Z"
    }
  ],
  "suggestedKeywords": [
    {
      "keyword": "마피아 레이드", // 입력 중인 검색어와 유사한 추천 키워드
      "search_count": 7,
      "last_searched_at": "2024-05-27T00:28:00Z"
    }
  ]
}
```

`fetch_chat_dashboard`는 위 구조를 `roomSummary.joined` / `roomSummary.available`로 포함하면서 `rooms`(가입한 방)·`publicRooms`(추천 공개 방) 배열을 평탄화해 제공합니다.

## 사용 방법

1. Supabase 프로젝트 대시보드 → SQL Editor를 열고 `/supabase/chat_realtime_backend.sql` 파일 내용을 그대로 붙여넣은 뒤 실행합니다.
2. 성공 후 Realtime → Database 탭에서 `supabase_realtime` 퍼블리케이션에 위 테이블이 등록됐는지 확인합니다.
3. Realtime 로그에 `topic:messages:*` 이벤트가 올라오는지 살펴보고, 필요 시 클라이언트가 사용하는 토픽과 일치하는지 점검합니다.

스크립트는 재실행해도 안전하도록 `drop ... if exists` / `create ... if not exists` 패턴을 사용합니다.

### 첨부 파일 버킷 준비

채팅 첨부는 Supabase Storage `chat-attachments` 버킷을 사용합니다. 아래 SQL을 프로젝트에 적용해 버킷과 인증 사용자 전용 정책을 준비하세요.

```sql
insert into storage.buckets (id, name, public)
values ('chat-attachments', 'chat-attachments', false)
on conflict (id) do nothing;

drop policy if exists chat_attachments_select on storage.objects;
create policy chat_attachments_select
on storage.objects for select to authenticated
using (bucket_id = 'chat-attachments');

drop policy if exists chat_attachments_insert on storage.objects;
create policy chat_attachments_insert
on storage.objects for insert to authenticated
with check (bucket_id = 'chat-attachments');

drop policy if exists chat_attachments_delete on storage.objects;
create policy chat_attachments_delete
on storage.objects for delete to authenticated
using (bucket_id = 'chat-attachments');
```

버킷 권한을 적용한 뒤, 클라이언트는 `storage.from('chat-attachments')` API로 업로드하고 만료 60초의 서명 URL로 다운로드합니다.【F:starbase/ai-roomchat/components/social/ChatOverlay.js†L82-L144】【F:starbase/ai-roomchat/components/social/ChatOverlay.js†L1165-L1350】

### 핵심 정책 · 트리거 이름

| 분류 | 객체 이름 | 설명 |
| --- | --- | --- |
| SELECT RLS | `messages_select_public` | 인증 사용자가 글로벌·방·세션·귓속말 메시지를 열람할 수 있도록 허용합니다. 스크립트는 적용 전에 기존 SELECT 정책을 모두 제거합니다. |
| INSERT RLS | `messages_insert_service_role` | 서비스 롤만 직접 INSERT할 수 있게 제한합니다. |
| UPDATE RLS | `messages_update_service_role` | 서비스 롤만 UPDATE를 수행할 수 있게 제한합니다. |
| DELETE RLS | `messages_delete_service_role` | 서비스 롤만 DELETE를 수행할 수 있게 제한합니다. |
| Realtime RLS | `realtime_messages_select_authenticated` | `realtime.messages` 뷰에서 인증 사용자가 브로드캐스트 메시지를 받을 수 있도록 허용합니다. |
| 함수 | `public.emit_realtime_payload` | 브로드캐스트 토픽 배열을 순회하며 `realtime.broadcast_changes`에 전달합니다. |
| 함수 | `public.broadcast_messages_changes` | `messages` 테이블 변경을 토픽별로 가공하고 `emit_realtime_payload`를 호출합니다. |
| 함수 | `public.sync_chat_room_moderators` | `chat_room_members` 변동을 감지해 `chat_room_moderators` 캐시를 최신으로 유지합니다. |
| 트리거 | `trg_messages_broadcast` | `messages` 테이블 변경 시 `broadcast_messages_changes` 함수를 실행합니다. |
| 트리거 | `trg_chat_room_members_sync_moderators` | 운영자 승격/강등 시 `chat_room_moderators` 캐시를 갱신합니다. |
| 트리거 | `trg_chat_room_members_room_metadata` | 멤버십 행 삽입/갱신 시 방 소유자·공개 여부를 미리 채워 순환 RLS를 방지합니다. |
| 트리거 | `trg_chat_rooms_refresh_member_metadata` | 방 소유자나 공개 여부가 변경되면 모든 멤버 행의 캐시를 갱신합니다. |

퍼블리케이션은 `alter publication supabase_realtime add table ...` 구문으로 `messages`, `chat_rooms`, `chat_room_members`가 등록되어 있어야 합니다.

## 자주 묻는 항목 요약

실시간 채팅이 동작하려면 다음 SQL 조각이 반드시 적용돼 있어야 합니다. 이미 `/supabase/chat_realtime_backend.sql`에 포함되어 있지만, 필요한 블록만 다시 실행하고 싶을 때 참고하세요.

### 어떤 Realtime 채널을 쓰나요?

클라이언트는 `supabase.channel(...).on('postgres_changes', ...)`를 통해 **Postgres Changes** 스트림을 직접 구독합니다. `lib/chat/messages.js`의 `subscribeToMessages` 훅이 `public.messages` 테이블에 대한 `INSERT/UPDATE` 이벤트를 받아 채팅 목록을 즉시 갱신하죠.【F:starbase/ai-roomchat/lib/chat/messages.js†L211-L274】

백엔드는 같은 변경을 `public.broadcast_messages_changes` 트리거로 `realtime.broadcast_changes`에 중계해 `messages:global`, `messages:room:<id>` 등 토픽으로 흘려보냅니다.【F:starbase/ai-roomchat/supabase/chat_realtime_backend.sql†L491-L548】 이 브로드캐스트 경로는 랭크 전용 클라이언트나 외부 워커가 필요한 토픽만 선택 구독할 수 있도록 준비된 옵션 채널입니다. 그러나 현재 대시보드 채팅 UI는 별도의 broadcast API 없이 Postgres Changes 피드만 사용합니다.

요약하면:

* **대시보드 채팅** → Postgres Changes(`pgchanges`) 구독.
* **브로드캐스트 토픽** → 동일한 변경을 선택적으로 청취해야 하는 다른 클라이언트(랭크 매칭 등)가 사용할 수 있도록 백엔드에서 함께 내보내는 보조 채널.

실제 배포에서는 두 경로 모두 동일한 `messages` 변경을 바라보므로, 한쪽이 장애가 나더라도 다른 경로로 재구성하기 쉽도록 유지하고 있습니다.

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
      select 1 from public.chat_room_members crm
      where crm.room_id = messages.chat_room_id
        and crm.owner_id = auth.uid()
    )
  )
  or (
    room_id is not null
    and (
      exists (
        select 1 from public.rank_room_slots rrs
        where rrs.room_id = messages.room_id
          and rrs.occupant_owner_id = auth.uid()
      )
      or exists (
        select 1 from public.rank_rooms rr
        where rr.id = messages.room_id
          and rr.owner_id = auth.uid()
      )
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
alter publication supabase_realtime add table public.chat_room_moderators;
```

위 코드만 실행해도 메시지 테이블 RLS, 브로드캐스트 트리거, 퍼블리케이션 연결이 복구됩니다.
