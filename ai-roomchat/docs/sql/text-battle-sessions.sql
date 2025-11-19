-- ========================================
-- Text Battle Sessions & Turns Schema (draft)
-- ----------------------------------------
-- 텍스트 배틀(core.text-runtime) 세션/턴을 Supabase에 저장하기 위한 최소 테이블 설계.
-- 이 스키마는 WORKSPACE_EDITOR_RUNTIME.md 10.8에서 정의한
-- variables.battleLast / battleResult / battleWinner / battleScore를 그대로 매핑한다.
-- ========================================

-- 1. text_battle_sessions
-- 한 번의 배틀(여러 턴 포함)을 나타내는 상위 엔터티.

create table if not exists public.text_battle_sessions (
  id uuid primary key default gen_random_uuid(),
  -- 외부 참조용 식별자 (예: room_id, match_id, custom session key)
  external_id text,

  -- 소유자/생성자 정보 (optional)
  owner_id uuid references auth.users(id),

  -- 어떤 게임/프롬프트 세트에 해당하는지 (optional)
  prompt_set_id uuid,
  game_name text,

  -- 상태 플래그
  status text not null default 'active', -- 'active' | 'completed' | 'cancelled'
  winner text,                           -- 'hero' | 'rival' | 기타 문자열

  -- 최종 스코어 (variables.battleScore와 동일한 구조를 JSON으로 저장)
  final_score jsonb,                     -- 예: { "hero": 1, "rival": 0 }

  -- 메타데이터
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


-- 2. text_battle_turns
-- 각 턴(프롬프트/응답/판정)을 한 행으로 기록.

create table if not exists public.text_battle_turns (
  id bigserial primary key,
  session_id uuid not null references public.text_battle_sessions(id) on delete cascade,

  turn_index integer not null, -- 0부터 시작하거나 1부터 시작, 클라이언트 규약에 맞춰 사용

  -- 노드/장소 정보
  node_id text,
  node_label text,

  -- 플레이어/캐릭터 정보 (간단 버전)
  hero_id text,
  rival_id text,

  -- 프롬프트/응답 요약
  prompt text,
  ai_response text,

  -- variables.battleLast와 동일한 필드
  result text,         -- 'success' | 'failure' | 'partial' | 'critical' | 'continue'
  battle_end boolean,
  winner text,
  effects jsonb,

  -- variables.battleScore 스냅샷
  score jsonb,         -- 예: { "hero": 1, "rival": 0 }

  -- 기타 메타
  duration_ms integer,
  created_at timestamptz not null default now()
);

-- 세션별 턴 순서 조회 최적화
create index if not exists idx_text_battle_turns_session_turn
  on public.text_battle_turns (session_id, turn_index);


-- 3. updated_at 트리거(선택 사항)

create or replace function public.update_text_battle_sessions_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_text_battle_sessions_updated_at on public.text_battle_sessions;

create trigger trg_text_battle_sessions_updated_at
before update on public.text_battle_sessions
for each row
execute function public.update_text_battle_sessions_updated_at();


-- ========================================
-- Notes
-- ========================================
-- - 이 스키마는 텍스트 배틀 전용 뷰/로그 역할을 하며,
--   기존 rank/matchmaking 테이블과 1:1로 직접 연결되지는 않는다.
-- - 추후 필요하면:
--   - rank_match_sessions.id를 external_id 또는 별도 컬럼으로 참조하여 연동할 수 있다.
--   - hero/rival 외에 팀전/멀티 캐릭터를 지원하려면 participants를 JSONB 배열로 확장한다.
-- - 이 파일은 설계 초안이며, 실제 배포 시에는 Supabase SQL 에디터나
--   `supabase db execute`로 실행해야 한다.

