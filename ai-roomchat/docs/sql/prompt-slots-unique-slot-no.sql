-- Ensure per-set unique slot_no in prompt_slots
-- ---------------------------------------------
-- 문제: 같은 set_id, slot_no 조합으로 prompt_slots 레코드가 여러 개 존재하면
-- Maker 프롬프트-노드 에디터에서 동일 위치에 중복 프롬프트 노드가 생성되는 현상이 생긴다.
-- 해결: (set_id, slot_no) 기준으로 한 행만 남기고 나머지를 정리한 뒤, 유니크 인덱스를 추가한다.

-- 1) 중복 슬롯 정리 (가장 최근 created_at 행을 남기고 나머지 삭제)
with duplicated as (
  select
    id,
    row_number() over (
      partition by set_id, slot_no
      order by created_at desc, id desc
    ) as row_rank
  from public.prompt_slots
)
delete from public.prompt_slots
where id in (
  select id from duplicated where row_rank > 1
);

-- 2) (set_id, slot_no) 유니크 인덱스 추가
create unique index if not exists prompt_slots_set_id_slot_no_key
  on public.prompt_slots (set_id, slot_no);

