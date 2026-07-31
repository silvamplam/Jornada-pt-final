do $$
declare
  v_signature text :=
    'public.newsroom_apply_complete_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,text,text,text,jsonb,integer,integer,integer)';
  v_function_oid regprocedure;
  v_security_definer boolean;
  v_config text[];
begin
  v_function_oid := to_regprocedure(v_signature);
  if v_function_oid is null then
    raise exception 'complete_generation_rpc_missing';
  end if;

  select prosecdef, proconfig
  into v_security_definer, v_config
  from pg_proc
  where oid = v_function_oid;

  if v_security_definer then
    raise exception 'complete_generation_rpc_must_be_security_invoker';
  end if;

  if coalesce(array_to_string(v_config, ','), '') not like '%search_path=%' then
    raise exception 'complete_generation_rpc_search_path_invalid';
  end if;

  if has_function_privilege('public', v_function_oid, 'EXECUTE')
     or has_function_privilege('anon', v_function_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_function_oid, 'EXECUTE') then
    raise exception 'complete_generation_rpc_public_execution_detected';
  end if;

  if not has_function_privilege('service_role', v_function_oid, 'EXECUTE') then
    raise exception 'complete_generation_rpc_service_role_missing';
  end if;
end;
$$;
