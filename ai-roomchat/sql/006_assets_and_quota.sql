-- Create minimal tables for assets and monthly quota tracking.
-- Run this in Supabase SQL editor or through your migrations.

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  hash text unique not null,
  key text not null,
  size bigint,
  mime text,
  game_id text,
  visibility text default 'public',
  ref_count bigint default 1,
  created_by uuid,
  created_at timestamptz default now()
);

create table if not exists public.asset_usage_quota (
  month_key text primary key,
  class_a_ops bigint default 0,
  class_b_ops bigint default 0,
  storage_bytes bigint default 0,
  updated_at timestamptz default now()
);

-- Optional helper: atomic increment via RPC for a chosen field
create or replace function public.increment_quota_counter(
  p_month_key text,
  p_field text,
  p_delta bigint
) returns void as $$
begin
  if p_field = 'class_a_ops' then
    insert into public.asset_usage_quota(month_key, class_a_ops)
      values (p_month_key, p_delta)
    on conflict (month_key) do update set class_a_ops = public.asset_usage_quota.class_a_ops + p_delta, updated_at = now();
  elsif p_field = 'class_b_ops' then
    insert into public.asset_usage_quota(month_key, class_b_ops)
      values (p_month_key, p_delta)
    on conflict (month_key) do update set class_b_ops = public.asset_usage_quota.class_b_ops + p_delta, updated_at = now();
  elsif p_field = 'storage_bytes' then
    insert into public.asset_usage_quota(month_key, storage_bytes)
      values (p_month_key, p_delta)
    on conflict (month_key) do update set storage_bytes = public.asset_usage_quota.storage_bytes + p_delta, updated_at = now();
  end if;
end;
$$ language plpgsql security definer;

-- RLS policies (optional; allow only service role by default)
alter table public.asset_usage_quota enable row level security;
create policy if not exists asset_quota_service_only
  on public.asset_usage_quota
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

alter table public.assets enable row level security;
create policy if not exists assets_service_only
  on public.assets
  for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

