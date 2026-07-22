-- Redação Automática — caixa de entrada persistente read-only.
-- SQL 3/4 — POSTFLIGHT READ-ONLY. Não altera schema nem dados.

select
  c.relname as table_name,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('newsroom_articles', 'newsroom_article_snapshots')
order by c.relname;

select
  table_name,
  ordinal_position,
  column_name,
  data_type,
  udt_name,
  is_nullable,
  column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('newsroom_articles', 'newsroom_article_snapshots')
order by table_name, ordinal_position;

select
  conrelid::regclass::text as table_name,
  conname as constraint_name,
  contype as constraint_type,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where conrelid in (
  'public.newsroom_articles'::regclass,
  'public.newsroom_article_snapshots'::regclass
)
order by table_name, constraint_name;

select
  tablename as table_name,
  indexname as index_name,
  indexdef as definition
from pg_indexes
where schemaname = 'public'
  and tablename in ('newsroom_articles', 'newsroom_article_snapshots')
order by tablename, indexname;

select
  event_object_table as table_name,
  trigger_name,
  action_timing,
  event_manipulation,
  action_statement
from information_schema.triggers
where trigger_schema = 'public'
  and event_object_table in ('newsroom_articles', 'newsroom_article_snapshots')
order by table_name, trigger_name, event_manipulation;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('newsroom_articles', 'newsroom_article_snapshots')
order by table_name, grantee, privilege_type;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd
from pg_policies
where schemaname = 'public'
  and tablename in ('newsroom_articles', 'newsroom_article_snapshots')
order by tablename, policyname;

select jsonb_build_object(
  'articles_table_exists', to_regclass('public.newsroom_articles') is not null,
  'snapshots_table_exists', to_regclass('public.newsroom_article_snapshots') is not null,
  'target_column_count', (
    select count(*)
    from information_schema.columns
    where table_schema = 'public'
      and table_name in ('newsroom_articles', 'newsroom_article_snapshots')
  ),
  'browser_grant_count', (
    select count(*)
    from information_schema.role_table_grants
    where table_schema = 'public'
      and table_name in ('newsroom_articles', 'newsroom_article_snapshots')
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ),
  'policy_count', (
    select count(*)
    from pg_policies
    where schemaname = 'public'
      and tablename in ('newsroom_articles', 'newsroom_article_snapshots')
  ),
  'ready_for_smoke_with_rollback',
    to_regclass('public.newsroom_articles') is not null
    and to_regclass('public.newsroom_article_snapshots') is not null
) as postflight_summary;
