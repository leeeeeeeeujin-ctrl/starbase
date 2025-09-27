-- =========================================
--  친구 시스템 (요청 & 관계)
-- =========================================
create table if not exists public.friend_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  addressee_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'cancelled')),
  message text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists friend_requests_addressee_status on public.friend_requests (addressee_id, status);
create index if not exists friend_requests_requester_status on public.friend_requests (requester_id, status);
create unique index if not exists friend_requests_unique_pending
  on public.friend_requests (requester_id, addressee_id)
  where status = 'pending';

alter table public.friend_requests enable row level security;

create policy if not exists friend_requests_select_participants
on public.friend_requests for select
using (auth.uid() in (requester_id, addressee_id));

create policy if not exists friend_requests_insert_requester
on public.friend_requests for insert to authenticated
with check (auth.uid() = requester_id);

create policy if not exists friend_requests_update_participants
on public.friend_requests for update to authenticated
using (auth.uid() in (requester_id, addressee_id))
with check (auth.uid() in (requester_id, addressee_id));

create policy if not exists friend_requests_delete_participants
on public.friend_requests for delete to authenticated
using (auth.uid() in (requester_id, addressee_id));

create table if not exists public.friendships (
  id uuid primary key default gen_random_uuid(),
  user_id_a uuid not null references auth.users(id) on delete cascade,
  user_id_b uuid not null references auth.users(id) on delete cascade,
  since timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table public.friendships
  add constraint friend_pairs_canonical
  check (user_id_a < user_id_b);

create unique index if not exists friendships_unique_pair
  on public.friendships (user_id_a, user_id_b);

create index if not exists friendships_user_a on public.friendships (user_id_a);
create index if not exists friendships_user_b on public.friendships (user_id_b);

alter table public.friendships enable row level security;

create policy if not exists friendships_select_participants
on public.friendships for select
using (auth.uid() in (user_id_a, user_id_b));

create policy if not exists friendships_insert_participants
on public.friendships for insert to authenticated
with check (auth.uid() in (user_id_a, user_id_b));

create policy if not exists friendships_delete_participants
on public.friendships for delete to authenticated
using (auth.uid() in (user_id_a, user_id_b));

-- =========================================
--  상태 갱신 트리거 (updated_at 자동 갱신)
-- =========================================
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at := now();
  return new;
end;
$$ language plpgsql;

create trigger friend_requests_set_updated_at
before update on public.friend_requests
for each row
execute function public.set_updated_at();
