-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-UX-1
-- SQL 3/4 — POSTFLIGHT READ-ONLY
-- Valida assinatura, segurança, configuração e permissões da RPC.

begin;
set local transaction_read_only = on;

do $$
declare
  v_function_oid oid;
  v_config text[];
begin
  v_function_oid := to_regprocedure(
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])'
  );

  select procedure_row.proconfig
  into v_config
  from pg_catalog.pg_proc procedure_row
  where procedure_row.oid = v_function_oid;

  if v_function_oid is null then
    raise exception 'postflight_target_function_missing'
      using errcode = '42883';
  end if;

  if (
    select procedure_row.prosecdef
    from pg_catalog.pg_proc procedure_row
    where procedure_row.oid = v_function_oid
  ) then
    raise exception 'postflight_function_must_use_security_invoker'
      using errcode = '55000';
  end if;

  if v_config is null or not ('search_path=""' = any(v_config) or 'search_path=' = any(v_config)) then
    raise exception 'postflight_function_search_path_not_locked'
      using errcode = '55000';
  end if;

  if not has_function_privilege(
    'service_role',
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])',
    'EXECUTE'
  ) then
    raise exception 'postflight_service_role_execute_missing'
      using errcode = '42501';
  end if;

  if has_function_privilege(
    'authenticated',
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])',
    'EXECUTE'
  ) or has_function_privilege(
    'anon',
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])',
    'EXECUTE'
  ) then
    raise exception 'postflight_unexpected_client_execute_privilege'
      using errcode = '42501';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-UX-1',
  'rpc', 'public.newsroom_save_editorial_dossier_article_plan',
  'security_invoker', true,
  'service_role_execute', has_function_privilege(
    'service_role',
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])',
    'EXECUTE'
  ),
  'authenticated_execute', has_function_privilege(
    'authenticated',
    'public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])',
    'EXECUTE'
  ),
  'postflight_ok', true
) as postflight_result;

rollback;
