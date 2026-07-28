-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGO-PLANEADO-RASCUNHO-CONTROLADO-1
-- SQL 3/4 — POSTFLIGHT READ-ONLY
-- Valida coluna, integridade, imutabilidade, assinatura, segurança e permissões.

begin;
set local transaction_read_only = on;

do $$
declare
  v_create_function oid;
  v_save_function oid;
  v_config text[];
  v_create_definition text;
  v_save_definition text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and attname = 'editorial_article_id'
      and atttypid = 'uuid'::regtype
      and not attnotnull
      and not attisdropped
  ) then
    raise exception 'postflight_editorial_article_id_column_invalid'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and conname = 'newsroom_editorial_dossier_article_plans_editorial_article_fkey'
      and contype = 'f'
      and confrelid = to_regclass('public.editorial_articles')
      and confdeltype = 'r'
  ) then
    raise exception 'postflight_editorial_article_foreign_key_invalid'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index index_row
    join pg_catalog.pg_class index_class
      on index_class.oid = index_row.indexrelid
    where index_row.indrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and index_class.relname = 'newsroom_editorial_dossier_article_plans_editorial_article_id_uidx'
      and index_row.indisunique
      and pg_catalog.pg_get_expr(index_row.indpred, index_row.indrelid)
        ilike '%editorial_article_id is not null%'
  ) then
    raise exception 'postflight_editorial_article_unique_index_missing'
      using errcode = '55000';
  end if;

  v_create_function := to_regprocedure(
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)'
  );
  v_save_function := to_regprocedure(
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])'
  );

  if v_create_function is null or v_save_function is null then
    raise exception 'postflight_required_function_missing'
      using errcode = '42883';
  end if;

  select procedure_row.proconfig, pg_catalog.pg_get_functiondef(procedure_row.oid)
  into v_config, v_create_definition
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = v_create_function;

  if (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = v_create_function
  ) then
    raise exception 'postflight_create_function_must_use_security_invoker'
      using errcode = '55000';
  end if;

  if v_config is null or not ('search_path=""' = any(v_config) or 'search_path=' = any(v_config)) then
    raise exception 'postflight_create_function_search_path_not_locked'
      using errcode = '55000';
  end if;

  if v_create_definition not ilike '%for update%'
     or v_create_definition not ilike '%editorial_article_id%'
     or v_create_definition not ilike '%body%'
     or v_create_definition not ilike '%reused%' then
    raise exception 'postflight_create_function_definition_incomplete'
      using errcode = '55000';
  end if;

  select pg_catalog.pg_get_functiondef(procedure_row.oid)
  into v_save_definition
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = v_save_function;

  if v_save_definition not ilike '%editorial_dossier_article_plan_already_converted%' then
    raise exception 'postflight_save_function_does_not_freeze_converted_plan'
      using errcode = '55000';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'postflight_service_role_execute_missing'
      using errcode = '42501';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)',
    'EXECUTE'
  ) then
    raise exception 'postflight_unexpected_client_execute_privilege'
      using errcode = '42501';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGO-PLANEADO-RASCUNHO-CONTROLADO-1',
  'link_column', 'public.newsroom_editorial_dossier_article_plans.editorial_article_id',
  'rpc', 'public.newsroom_create_editorial_dossier_article_plan_draft',
  'security_invoker', true,
  'service_role_execute', has_function_privilege(
    'service_role',
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.newsroom_create_editorial_dossier_article_plan_draft(uuid,uuid)',
    'EXECUTE'
  ),
  'converted_plan_immutable', true,
  'postflight_ok', true
) as postflight_result;

rollback;
