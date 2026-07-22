-- Redação Automática — caixa de entrada persistente read-only.
-- SQL 1/4 — PREFLIGHT READ-ONLY. Não altera schema nem dados.

select
  current_database() as database_name,
  current_user as executed_by,
  now() as checked_at,
  to_regprocedure('gen_random_uuid()') is not null as gen_random_uuid_available;

select
  candidate.table_name,
  to_regclass(format('public.%I', candidate.table_name)) as existing_relation
from (
  values
    ('newsroom_articles'),
    ('newsroom_article_snapshots'),
    ('automatic_newsroom'),
    ('collected_articles'),
    ('source_articles'),
    ('article_snapshots'),
    ('extracted_articles')
) as candidate(table_name)
order by candidate.table_name;

select
  table_schema,
  table_name,
  table_type
from information_schema.tables
where table_schema = 'public'
  and (
    table_name ilike '%newsroom%'
    or table_name ilike '%collected%article%'
    or table_name ilike '%source%article%'
    or table_name ilike '%article%snapshot%'
    or table_name ilike '%extracted%article%'
  )
order by table_name;

select
  n.nspname as schema_name,
  c.relname as relation_name,
  c.relkind,
  c.relrowsecurity as rls_enabled,
  c.relforcerowsecurity as rls_forced
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public'
  and c.relname in ('newsroom_articles', 'newsroom_article_snapshots')
order by c.relname;

select
  schemaname,
  tablename,
  policyname,
  roles,
  cmd,
  qual,
  with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('newsroom_articles', 'newsroom_article_snapshots')
order by tablename, policyname;

select
  grantee,
  table_name,
  privilege_type
from information_schema.role_table_grants
where table_schema = 'public'
  and table_name in ('newsroom_articles', 'newsroom_article_snapshots')
order by table_name, grantee, privilege_type;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-CAIXA-ENTRADA-PERSISTENCIA-READONLY-1',
  'expected', 'target relations absent and no equivalent schema requiring reuse',
  'next_step_if_clear', 'run 15-redacao-automatica-newsroom-apply.sql manually',
  'writes_performed', false
) as preflight_summary;
