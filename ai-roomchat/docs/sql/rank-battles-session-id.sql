-- ========================================
-- Rank Battles: session_id column
-- ----------------------------------------
-- 목적:
--   - rank_battles 테이블에 session_id(uuid) 컬럼을 추가해
--     특정 배틀이 어떤 rank_sessions.id / battle session에 대응하는지 저장한다.
--   - 로비/캐릭터 패널의 "최근 베틀로그" 카드에서
--     `/battle-log/[sessionId]` 로 딥링크할 때 사용된다.
--
-- 증상:
--   - 클라이언트 콘솔:
--       [supabase] request failed { code: "42703", message: "column rank_battles.session_id does not exist", ... }
--   - 네트워크 탭:
--       GET /rest/v1/rank_battles?select=...session_id... → 400
--
-- 이 스크립트를 Supabase SQL Editor에서 실행하면,
-- 클라이언트가 rank_battles.session_id를 select 하더라도 400이 발생하지 않는다.
-- ========================================

alter table public.rank_battles
  add column if not exists session_id uuid;

-- 선택 사항: rank_sessions와의 FK를 함께 두고 싶은 경우 활성화
-- (이미 rank_sessions.id가 존재한다고 가정한다.)
-- alter table public.rank_battles
--   add constraint rank_battles_session_fk
--   foreign key (session_id) references public.rank_sessions(id);

-- 인덱스(선택 사항):
-- - 최근 베틀로그를 세션 단위로 조회할 일이 많다면 session_id 인덱스를 추가한다.
-- create index if not exists idx_rank_battles_session_id
--   on public.rank_battles(session_id);

-- ========================================
-- Notes
-- ========================================
-- - 컬럼 이름/타입은 docs/capabilities/persistence.supabase.md 3장에
--   정의된 계약(`rank_battles.session_id` uuid)과 동일하다.
-- - 이미 동일한 컬럼이 존재하는 환경에서 실행해도 add column if not exists 덕분에 안전하다.
-- - 실제 배포는 Supabase 대시보드의 SQL Editor 또는
--   `supabase db execute` 명령으로 이 파일 내용을 실행해서 진행해야 한다.

