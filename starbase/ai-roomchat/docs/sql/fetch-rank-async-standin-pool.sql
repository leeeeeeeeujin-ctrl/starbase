-- Supabase RPC to select stand-in candidates for async match fill.
-- Returns participants from rank_participants filtered by role and ranked by
-- closeness to the desired score/rating so the client can auto-fill seats.
--
-- Parameters:
--   p_game_id              - Target game identifier.
--   p_role                 - Optional role filter (case-insensitive).
--   p_limit                - Maximum number of candidates to return (defaults to 8).
--   p_reference_score      - Optional score to measure distance against.
--   p_reference_rating     - Optional rating to measure distance against.
--   p_excluded_owner_ids   - Optional array of owner ids to exclude.
--
-- Usage: paste this file into the Supabase SQL editor and execute. Grant
-- `EXECUTE` to `service_role` and `authenticated` so both server-side code and
-- authenticated clients can call the RPC.

create or replace function public.fetch_rank_async_standin_pool(
  p_game_id uuid,
  p_role text default null,
  p_limit integer default 8,
  p_reference_score integer default null,
  p_reference_rating integer default null,
  p_excluded_owner_ids uuid[] default null
)
returns table (
  owner_id uuid,
  hero_id uuid,
  hero_name text,
  role text,
  score integer,
  rating integer,
  battles integer,
  win_rate numeric,
  status text,
  updated_at timestamptz,
  score_gap integer,
  rating_gap integer
)
language sql
security definer
set search_path = public
stable
as $$
  with base as (
    select
      p.owner_id,
      p.hero_id,
      coalesce(nullif(trim(p.role), ''), '역할 미지정') as role,
      p.score,
      p.rating,
      p.battles,
      p.win_rate,
      coalesce(nullif(trim(p.status), ''), 'active') as status,
      p.updated_at,
      abs(coalesce(p.score, p_reference_score, 0) - coalesce(p_reference_score, 0)) as score_gap,
      abs(coalesce(p.rating, p_reference_rating, 0) - coalesce(p_reference_rating, 0)) as rating_gap
    from public.rank_participants p
    where p.game_id = p_game_id
      and (p_role is null or lower(trim(coalesce(p.role, ''))) = lower(trim(coalesce(p_role, ''))))
      and (p_excluded_owner_ids is null or not (p.owner_id = any(p_excluded_owner_ids)))
      and coalesce(nullif(trim(p.status), ''), 'active') in ('active', 'idle', 'waiting')
  )
  select
    b.owner_id,
    b.hero_id,
    h.name as hero_name,
    b.role,
    b.score,
    b.rating,
    b.battles,
    b.win_rate,
    b.status,
    b.updated_at,
    b.score_gap,
    b.rating_gap
  from base b
  left join public.heroes h on h.id = b.hero_id
  order by b.score_gap asc, b.rating_gap asc, coalesce(b.updated_at, now()) desc
  limit greatest(1, coalesce(p_limit, 8));
$$;

grant execute on function public.fetch_rank_async_standin_pool(
  uuid,
  text,
  integer,
  integer,
  integer,
  uuid[]
) to service_role;

grant execute on function public.fetch_rank_async_standin_pool(
  uuid,
  text,
  integer,
  integer,
  integer,
  uuid[]
) to authenticated;
