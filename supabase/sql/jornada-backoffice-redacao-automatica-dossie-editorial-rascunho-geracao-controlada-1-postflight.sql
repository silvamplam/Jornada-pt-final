-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-RASCUNHO-GERACAO-CONTROLADA-1
-- SQL 3/4 — POSTFLIGHT READ-ONLY
-- Valida tabela de auditoria, integridade, RPC transacional e permissões.

begin;
set local transaction_read_only = on;

do $$
declare
  v_function oid;
  v_config text[];
  v_definition text;
begin
  if to_regclass(
    'public.newsroom_editorial_dossier_article_plan_generations'
  ) is null then
    raise exception 'postflight_generation_table_missing'
      using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass(
      'public.newsroom_editorial_dossier_article_plan_generations'
    )
      and conname = 'newsroom_editorial_dossier_article_plan_generations_plan_key'
      and contype = 'u'
  ) then
    raise exception 'postflight_plan_uniqueness_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass(
      'public.newsroom_editorial_dossier_article_plan_generations'
    )
      and conname = 'newsroom_editorial_dossier_article_plan_generations_article_key'
      and contype = 'u'
  ) then
    raise exception 'postflight_article_uniqueness_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class table_row
    where table_row.oid = to_regclass(
      'public.newsroom_editorial_dossier_article_plan_generations'
    )
      and table_row.relrowsecurity
      and table_row.relforcerowsecurity
  ) then
    raise exception 'postflight_generation_table_rls_invalid'
      using errcode = '55000';
  end if;

  v_function := to_regprocedure(
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)'
  );

  if v_function is null then
    raise exception 'postflight_generation_function_missing'
      using errcode = '42883';
  end if;

  select
    procedure_row.proconfig,
    pg_catalog.pg_get_functiondef(procedure_row.oid)
  into
    v_config,
    v_definition
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = v_function;

  if (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = v_function
  ) then
    raise exception 'postflight_generation_function_must_use_security_invoker'
      using errcode = '55000';
  end if;

  if v_config is null
     or not ('search_path=""' = any(v_config) or 'search_path=' = any(v_config)) then
    raise exception 'postflight_generation_function_search_path_not_locked'
      using errcode = '55000';
  end if;

  if v_definition not ilike '%for update%'
     or v_definition not ilike '%v_article.status <> ''draft''%'
     or v_definition not ilike '%v_article.body%'
     or v_definition not ilike '%p_expected_article_updated_at%'
     or v_definition not ilike '%p_input_snapshot is distinct from v_input_snapshot%'
     or v_definition not ilike '%generation_action%'
     or v_definition not ilike '%''reused''::text%'
     or v_definition not ilike '%''applied''::text%' then
    raise exception 'postflight_generation_function_definition_incomplete'
      using errcode = '55000';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'postflight_service_role_execute_missing'
      using errcode = '42501';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)',
    'EXECUTE'
  ) then
    raise exception 'postflight_unexpected_client_execute_privilege'
      using errcode = '42501';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-RASCUNHO-GERACAO-CONTROLADA-1',
  'generation_table', 'public.newsroom_editorial_dossier_article_plan_generations',
  'rpc', 'public.newsroom_apply_editorial_dossier_article_plan_generation',
  'single_generation_per_plan', true,
  'draft_must_be_empty', true,
  'source_snapshot_match_required', true,
  'security_invoker', true,
  'service_role_execute', has_function_privilege(
    'service_role',
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)',
    'EXECUTE'
  ),
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)',
    'EXECUTE'
  ),
  'postflight_ok', true
) as postflight_result;

rollback;
