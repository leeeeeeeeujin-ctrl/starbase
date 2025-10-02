# Supabase DDL Export Cheatsheet

이 문서는 Supabase/PostgreSQL `public` 스키마에 존재하는 객체의 정의를 한 번에 추출할 수 있는 SQL 스니펫을 정리한 것입니다. Supabase SQL Editor, psql, DBeaver 등에서 그대로 실행하면 테이블, 제약조건, 인덱스, RLS 정책을 순서대로 덤프할 수 있습니다. 필요에 따라 스키마 이름(`public`)을 다른 값으로 바꿔 사용하세요.

> ⚠️ **주의**: 배열 타입, 정밀도가 붙은 숫자 타입 등은 단순화되어 출력됩니다. 이후 수동 보정이 필요할 수 있습니다.

## 1. 테이블 + 컬럼 정의 (PK 포함)
```sql
with cols as (
  select
    c.table_schema,
    c.table_name,
    c.ordinal_position,
    c.column_name,
    c.is_nullable,
    c.data_type,
    c.column_default
  from information_schema.columns c
  join information_schema.tables t
    on t.table_schema = c.table_schema
   and t.table_name   = c.table_name
  where t.table_type = 'BASE TABLE'
    and c.table_schema = 'public'
),
pk as (
  select
    n.nspname as table_schema,
    c.relname as table_name,
    a.attname as column_name,
    i.indkey::text
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  join pg_index i     on i.indrelid = c.oid and i.indisprimary
  join unnest(i.indkey) with ordinality as k(attnum, pos) on true
  join pg_attribute a on a.attrelid = c.oid and a.attnum = k.attnum
  where n.nspname = 'public'
),
pk_cols as (
  select table_schema, table_name,
         string_agg(quote_ident(column_name), ', ' order by column_name) as pk_list
  from pk
  group by table_schema, table_name
),
col_lines as (
  select
    table_schema,
    table_name,
    string_agg(
      format('  %s %s%s%s',
        quote_ident(column_name),
        case
          when data_type ilike 'ARRAY' then 'text[]'
          else data_type
        end,
        case when is_nullable = 'NO' then ' not null' else '' end,
        case when column_default is not null then ' default '||column_default else '' end
      ),
      E',\n' order by ordinal_position
    ) as column_block
  from cols
  group by table_schema, table_name
)
select
  format(
$$create table if not exists %s.%s (
%s%s
);$$,
    quote_ident(cl.table_schema),
    quote_ident(cl.table_name),
    cl.column_block,
    case when pk.pk_list is not null
      then E',\n  primary key ('||pk.pk_list||')'
      else ''
    end
  ) as create_table_ddl
from col_lines cl
left join pk_cols pk
  on pk.table_schema = cl.table_schema
 and pk.table_name   = cl.table_name
order by cl.table_name;
```

## 2. 추가 제약조건 (UNIQUE / CHECK / FK)
```sql
select
  format(
    'alter table %s add constraint %I %s;',
    (conrelid)::regclass,
    conname,
    pg_get_constraintdef(oid)
  ) as alter_constraint_ddl
from pg_constraint
where connamespace = 'public'::regnamespace
  and contype in ('f','u','c')
order by conrelid::regclass::text, conname;
```

## 3. 인덱스 정의
```sql
select indexdef || ';' as create_index_ddl
from pg_indexes
where schemaname = 'public'
order by tablename, indexname;
```

## 4. RLS 정책 정의 (선택)
```sql
with role_names as (
  select oid, rolname from pg_roles
),
pol as (
  select
    pol.polname,
    (pol.polrelid)::regclass as table_name,
    case pol.polcmd
      when 'r' then 'select'
      when 'a' then 'insert'
      when 'w' then 'update'
      when 'd' then 'delete'
      else pol.polcmd
    end as cmd,
    pg_get_expr(pol.polqual, pol.polrelid)      as using_clause,
    pg_get_expr(pol.polwithcheck, pol.polrelid) as with_check_clause,
    array(
      select r.rolname from unnest(pol.polroles) pr(oid)
      join role_names r on r.oid = pr.oid
    ) as roles
  from pg_policy pol
  join pg_class c on c.oid = pol.polrelid
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
)
select
  'create policy '||quote_ident(polname)||
  ' on '||table_name||
  ' for '||cmd||
  case when array_length(roles,1) is not null
       then ' to '||array_to_string(roles, ', ')
       else ''
  end||
  case when using_clause is not null
       then ' using ('||using_clause||')'
       else ''
  end||
  case when with_check_clause is not null
       then ' with check ('||with_check_clause||')'
       else ''
  end||';' as create_policy_ddl
from pol
order by table_name::text, polname;
```

```sql
select 'alter table '||(c.oid)::regclass||' enable row level security;' as enable_rls
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relkind = 'r'
order by (c.oid)::regclass::text;
```

## 5. `rank_turns` 신규 컬럼 반영 (2025-11-07 업데이트)

라이브 타임라인에서 합의한 `is_visible`/`summary_payload` 컬럼 초안을 기반으로 한 DDL 조각입니다. QA 검증 전 스테이징 DB에 적용해
UI·리포트 영향 범위를 확인할 수 있습니다.

```sql
alter table public.rank_turns
  add column if not exists is_visible boolean default true not null,
  add column if not exists summary_payload jsonb;

comment on column public.rank_turns.is_visible is
  '히스토리 탭 노출 여부를 제어하는 플래그 (기본값: true).';

comment on column public.rank_turns.summary_payload is
  '턴 종료 후 저장되는 요약 본문/태그 JSON. 히스토리 요약 UI와 관리자 보고서에서 재사용.';

create index if not exists rank_turns_visible_idx
  on public.rank_turns (is_visible, inserted_at desc);

create index if not exists rank_turns_summary_gin
  on public.rank_turns using gin (summary_payload jsonb_path_ops);
```

## 6. `rank_api_key_audit` 감사 로그 초안 (2025-11-08 업데이트)

쿨다운 자동화/회수 다이제스트 실행 결과를 장기 보관하기 위한 감사 테이블 초안입니다. Edge Function 재시도와 Slack 알림 상태를 한눈에 대조할 수 있도록 JSON 메타 필드와 상태 전환 타임스탬프를 함께 기록합니다.

```sql
create table if not exists public.rank_api_key_audit (
  id uuid primary key default gen_random_uuid(),
  cooldown_id uuid not null references public.rank_api_key_cooldowns(id) on delete cascade,
  status text not null check (status in ('pending','retrying','succeeded','failed','manual_override')),
  retry_count integer not null default 0,
  last_attempt_at timestamptz,
  next_retry_eta timestamptz,
  doc_link_attached boolean,
  automation_payload jsonb default '{}'::jsonb,
  digest_payload jsonb default '{}'::jsonb,
  notes text,
  inserted_at timestamptz not null default now()
);

create index if not exists rank_api_key_audit_cooldown_idx
  on public.rank_api_key_audit (cooldown_id, inserted_at desc);

comment on table public.rank_api_key_audit is
  'API 키 쿨다운 자동화/회수 다이제스트 실행 이력을 보관하는 감사 테이블';

comment on column public.rank_api_key_audit.status is
  '자동화 진행 상태 (pending, retrying, succeeded, failed, manual_override).';

comment on column public.rank_api_key_audit.automation_payload is
  'Edge Function 재시도 응답, Slack 알림 결과 등 자동화 세부 JSON.';

comment on column public.rank_api_key_audit.digest_payload is
  '수동 다이제스트 호출 결과 및 회수 로그 JSON.';
```

## 실행 팁
- Supabase SQL Editor에서 결과를 복사해 `.sql` 파일로 저장하면 백업 스크립트를 빠르게 만들 수 있습니다.
- `psql`을 사용할 때는 `\gset`을 이용해 결과를 변수에 담은 뒤, `\echo :create_table_ddl` 형태로 출력하는 방법도 있습니다.
- 대용량 스키마일 경우 스키마명을 필터링하거나 `and table_name in (...)` 조건을 추가해 필요한 테이블만 추출하세요.
- RLS 정책을 재생성하려면 `enable row level security` 명령도 함께 저장해 두어야 안전합니다.
