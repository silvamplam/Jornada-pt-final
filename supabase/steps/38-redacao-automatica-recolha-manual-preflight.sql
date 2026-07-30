-- Step 38 - preflight read-only para entrada manual de notícias.
-- Não executa DDL, DML ou funções de escrita.

with article_table as (
  select
    class.oid,
    pg_get_userbyid(class.relowner) as owner_name,
    class.relrowsecurity as rls_enabled,
    class.relforcerowsecurity as rls_forced
  from pg_class class
  join pg_namespace namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'newsroom_articles'
    and class.relkind = 'r'
),
snapshot_table as (
  select
    class.oid,
    pg_get_userbyid(class.relowner) as owner_name,
    class.relrowsecurity as rls_enabled,
    class.relforcerowsecurity as rls_forced
  from pg_class class
  join pg_namespace namespace
    on namespace.oid = class.relnamespace
  where namespace.nspname = 'public'
    and class.relname = 'newsroom_article_snapshots'
    and class.relkind = 'r'
),
url_columns as (
  select
    count(*) filter (
      where column_name = 'original_url'
        and data_type = 'text'
        and is_nullable = 'NO'
    ) = 1 as original_url_expected,
    count(*) filter (
      where column_name = 'normalized_url'
        and data_type = 'text'
        and is_nullable = 'NO'
    ) = 1 as normalized_url_expected
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'newsroom_articles'
),
base_constraints as (
  select
    count(*) filter (
      where constraint_row.conname = 'newsroom_articles_source_url_key'
        and constraint_row.contype = 'u'
    ) = 1 as source_url_unique_present,
    count(*) filter (
      where constraint_row.conname = 'newsroom_article_snapshots_article_hash_key'
        and constraint_row.contype = 'u'
    ) = 1 as snapshot_hash_unique_present,
    count(*) filter (
      where constraint_row.conname = 'newsroom_article_snapshots_article_fkey'
        and constraint_row.contype = 'f'
    ) = 1 as snapshot_article_fk_present
  from pg_constraint constraint_row
  where constraint_row.conrelid in (
    to_regclass('public.newsroom_articles'),
    to_regclass('public.newsroom_article_snapshots')
  )
),
new_objects as (
  select
    to_regclass('public.newsroom_manual_entry_requests') is not null
      as request_table_present,
    (
      select count(*)
      from pg_proc proc
      join pg_namespace namespace
        on namespace.oid = proc.pronamespace
      where namespace.nspname = 'public'
        and proc.proname = 'newsroom_create_manual_entry'
    ) as manual_function_count,
    exists (
      select 1
      from pg_constraint constraint_row
      where constraint_row.conrelid = to_regclass('public.newsroom_articles')
        and constraint_row.conname = 'newsroom_articles_manual_origin_urls_check'
    ) as manual_url_constraint_present
),
data_compatibility as (
  select
    count(*) filter (
      where article.original_url is null
        or article.normalized_url is null
    ) as existing_null_url_count,
    count(*) filter (
      where article.source_code = 'manual_entry'
    ) as existing_manual_source_count
  from public.newsroom_articles article
),
failed_smoke_residue as (
  select count(*)::integer as residue_count
  from public.newsroom_article_snapshots snapshot
  where snapshot.source_metadata ->> 'manualSubmissionId' =
    '00000000-0000-4000-8000-000000000410'
)
select jsonb_build_object(
  'step', 38,
  'article_table_present', (select count(*) from article_table) = 1,
  'snapshot_table_present', (select count(*) from snapshot_table) = 1,
  'article_owner', (select owner_name from article_table),
  'snapshot_owner', (select owner_name from snapshot_table),
  'current_user_is_owner',
    (select owner_name from article_table) = current_user
    and (select owner_name from snapshot_table) = current_user,
  'base_rls', jsonb_build_object(
    'article_enabled', coalesce((select rls_enabled from article_table), false),
    'article_forced', coalesce((select rls_forced from article_table), false),
    'snapshot_enabled', coalesce((select rls_enabled from snapshot_table), false),
    'snapshot_forced', coalesce((select rls_forced from snapshot_table), false)
  ),
  'url_columns', to_jsonb(url_columns),
  'base_constraints', to_jsonb(base_constraints),
  'new_objects', to_jsonb(new_objects),
  'data_compatibility', to_jsonb(data_compatibility),
  'failed_smoke_residue_count', failed_smoke_residue.residue_count,
  'service_role_base_access', jsonb_build_object(
    'articles_select', coalesce(
      has_table_privilege('service_role', 'public.newsroom_articles', 'SELECT'),
      false
    ),
    'snapshots_select', coalesce(
      has_table_privilege('service_role', 'public.newsroom_article_snapshots', 'SELECT'),
      false
    )
  ),
  'ready_to_apply',
    (select count(*) from article_table) = 1
    and (select count(*) from snapshot_table) = 1
    and (select owner_name from article_table) = current_user
    and (select owner_name from snapshot_table) = current_user
    and coalesce((select rls_enabled and rls_forced from article_table), false)
    and coalesce((select rls_enabled and rls_forced from snapshot_table), false)
    and url_columns.original_url_expected
    and url_columns.normalized_url_expected
    and base_constraints.source_url_unique_present
    and base_constraints.snapshot_hash_unique_present
    and base_constraints.snapshot_article_fk_present
    and not new_objects.request_table_present
    and new_objects.manual_function_count = 0
    and not new_objects.manual_url_constraint_present
    and data_compatibility.existing_null_url_count = 0
    and data_compatibility.existing_manual_source_count = 0
    and failed_smoke_residue.residue_count = 0,
  'writes_performed', false,
  'next_step',
    'run 39-redacao-automatica-recolha-manual-apply.sql manually'
) as preflight_summary
from url_columns
cross join base_constraints
cross join new_objects
cross join data_compatibility
cross join failed_smoke_residue;
