-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-SCHEMA-1
-- SQL 3/4 — POSTFLIGHT READ-ONLY
-- Valida a estrutura, segurança e invariantes aplicadas.

begin;
set local transaction_read_only = on;

do $$
declare
  v_missing_columns text;
begin
  if to_regclass('public.newsroom_editorial_dossiers') is null
     or to_regclass('public.newsroom_editorial_dossier_sources') is null then
    raise exception 'postflight_target_table_missing'
      using errcode = '42P01';
  end if;

  select string_agg(required.column_name, ', ' order by required.column_name)
  into v_missing_columns
  from (
    values
      ('newsroom_editorial_dossiers', 'id'),
      ('newsroom_editorial_dossiers', 'title'),
      ('newsroom_editorial_dossiers', 'status'),
      ('newsroom_editorial_dossiers', 'editorial_instructions'),
      ('newsroom_editorial_dossiers', 'context_instructions'),
      ('newsroom_editorial_dossiers', 'output_mode'),
      ('newsroom_editorial_dossiers', 'output_count'),
      ('newsroom_editorial_dossiers', 'length_mode'),
      ('newsroom_editorial_dossiers', 'article_kind'),
      ('newsroom_editorial_dossiers', 'output_language'),
      ('newsroom_editorial_dossiers', 'created_at'),
      ('newsroom_editorial_dossiers', 'updated_at'),
      ('newsroom_editorial_dossier_sources', 'id'),
      ('newsroom_editorial_dossier_sources', 'dossier_id'),
      ('newsroom_editorial_dossier_sources', 'newsroom_article_id'),
      ('newsroom_editorial_dossier_sources', 'newsroom_snapshot_id'),
      ('newsroom_editorial_dossier_sources', 'source_role'),
      ('newsroom_editorial_dossier_sources', 'sort_order'),
      ('newsroom_editorial_dossier_sources', 'editorial_note'),
      ('newsroom_editorial_dossier_sources', 'included'),
      ('newsroom_editorial_dossier_sources', 'created_at'),
      ('newsroom_editorial_dossier_sources', 'updated_at')
  ) as required(table_name, column_name)
  where not exists (
    select 1
    from information_schema.columns column_row
    where column_row.table_schema = 'public'
      and column_row.table_name = required.table_name
      and column_row.column_name = required.column_name
  );

  if v_missing_columns is not null then
    raise exception 'postflight_required_columns_missing: %', v_missing_columns
      using errcode = '42703';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_article_snapshots')
      and conname = 'newsroom_article_snapshots_article_id_id_key'
      and contype = 'u'
  ) then
    raise exception 'postflight_snapshot_identity_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_sources')
      and conname = 'newsroom_editorial_dossier_sources_snapshot_identity_fkey'
      and contype = 'f'
      and confrelid = to_regclass('public.newsroom_article_snapshots')
  ) then
    raise exception 'postflight_snapshot_identity_foreign_key_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_sources')
      and conname = 'newsroom_editorial_dossier_sources_dossier_article_key'
      and contype = 'u'
  ) then
    raise exception 'postflight_dossier_article_unique_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = to_regclass('public.newsroom_editorial_dossiers')
      and tgname = 'newsroom_editorial_dossiers_set_updated_at'
      and not tgisinternal
  ) or not exists (
    select 1
    from pg_catalog.pg_trigger
    where tgrelid = to_regclass('public.newsroom_editorial_dossier_sources')
      and tgname = 'newsroom_editorial_dossier_sources_set_updated_at'
      and not tgisinternal
  ) then
    raise exception 'postflight_updated_at_trigger_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossiers')
      and relrowsecurity
      and relforcerowsecurity
  ) or not exists (
    select 1
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossier_sources')
      and relrowsecurity
      and relforcerowsecurity
  ) then
    raise exception 'postflight_rls_not_forced'
      using errcode = '55000';
  end if;

  if not has_table_privilege('service_role', 'public.newsroom_editorial_dossiers', 'SELECT,INSERT,UPDATE,DELETE')
     or not has_table_privilege('service_role', 'public.newsroom_editorial_dossier_sources', 'SELECT,INSERT,UPDATE,DELETE') then
    raise exception 'postflight_service_role_grants_missing'
      using errcode = '42501';
  end if;

  if has_table_privilege('authenticated', 'public.newsroom_editorial_dossiers', 'SELECT')
     or has_table_privilege('authenticated', 'public.newsroom_editorial_dossier_sources', 'SELECT')
     or has_table_privilege('anon', 'public.newsroom_editorial_dossiers', 'SELECT')
     or has_table_privilege('anon', 'public.newsroom_editorial_dossier_sources', 'SELECT') then
    raise exception 'postflight_unexpected_client_privilege'
      using errcode = '42501';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-SCHEMA-1',
  'dossiers_table', to_regclass('public.newsroom_editorial_dossiers')::text,
  'dossier_sources_table', to_regclass('public.newsroom_editorial_dossier_sources')::text,
  'dossiers_rls_forced', (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossiers')
  ),
  'sources_rls_forced', (
    select relrowsecurity and relforcerowsecurity
    from pg_catalog.pg_class
    where oid = to_regclass('public.newsroom_editorial_dossier_sources')
  ),
  'postflight_ok', true
) as postflight_result;

rollback;
