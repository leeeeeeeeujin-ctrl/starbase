# 메시지 SELECT 정책 배치 가이드

`public.messages` 테이블은 실시간 채팅 파이프라인의 핵심 테이블입니다. 이전 버전의 스키마를 반복해서 적용했다면 다수의 SELECT 정책이 중복 등록되어 RLS가 충돌할 수 있습니다. 아래 순서를 따라 정책을 정리하세요.

## 1. 기존 SELECT 정책 제거

```sql
-- Supabase SQL Editor에서 실행
-- 기존 SELECT 정책 이름을 전부 삭제합니다.
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
```

## 2. 표준 SELECT 정책 생성

```sql
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
    room_id is not null
    and (
      exists (
        select 1
        from public.rank_room_slots rrs
        where rrs.room_id = messages.room_id
          and rrs.occupant_owner_id = auth.uid()
      )
      or exists (
        select 1
        from public.rank_rooms rr
        where rr.id = messages.room_id
          and rr.owner_id = auth.uid()
      )
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
```

## 3. 적용 후 확인

1. `select policyname, cmd from pg_policies where schemaname = 'public' and tablename = 'messages';`
   를 실행해 SELECT 정책이 하나만 남았는지 확인합니다.
2. `alter publication supabase_realtime add table public.messages;` 를 다시 실행해 Postgres Changes 스트림이 활성화되어 있는지 점검합니다.
3. 필요 시 `/supabase/chat_realtime_backend.sql` 전체를 재실행하면 동일한 구성으로 초기화됩니다.

이 과정을 거친 뒤에도 메시지가 실시간으로 보이지 않는다면, `messages` 테이블에 삽입되는 레코드의 `scope`, `visible_owner_ids`, `chat_room_id` 값이 기대하는 범위인지 확인해 주세요.
