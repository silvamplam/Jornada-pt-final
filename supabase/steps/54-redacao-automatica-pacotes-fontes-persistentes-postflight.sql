-- Step 54 - validação da persistência privada dos pacotes Markdown.

do $$
declare
  v_table oid := to_regclass('public.newsroom_editorial_source_packages');
  v_rls boolean;
  v_force_rls boolean;
begin
  if v_table is null then
    raise exception 'newsroom_editorial_source_packages_missing';
  end if;

  select relrowsecurity, relforcerowsecurity
  into v_rls, v_force_rls
  from pg_class
  where oid = v_table;

  if not v_rls or not v_force_rls then
    raise exception 'newsroom_editorial_source_packages_rls_invalid';
  end if;

  if has_table_privilege('public', v_table, 'SELECT')
     or has_table_privilege('anon', v_table, 'SELECT')
     or has_table_privilege('authenticated', v_table, 'SELECT')
     or has_table_privilege('public', v_table, 'INSERT')
     or has_table_privilege('anon', v_table, 'INSERT')
     or has_table_privilege('authenticated', v_table, 'INSERT')
     or has_table_privilege('public', v_table, 'UPDATE')
     or has_table_privilege('anon', v_table, 'UPDATE')
     or has_table_privilege('authenticated', v_table, 'UPDATE')
     or has_table_privilege('public', v_table, 'DELETE')
     or has_table_privilege('anon', v_table, 'DELETE')
     or has_table_privilege('authenticated', v_table, 'DELETE') then
    raise exception 'newsroom_editorial_source_packages_public_privilege_detected';
  end if;

  if not has_table_privilege('service_role', v_table, 'SELECT')
     or not has_table_privilege('service_role', v_table, 'INSERT')
     or not has_table_privilege('service_role', v_table, 'UPDATE')
     or not has_table_privilege('service_role', v_table, 'DELETE') then
    raise exception 'newsroom_editorial_source_packages_service_role_privilege_missing';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_editorial_source_packages'
      and column_name = 'manifest'
      and data_type = 'jsonb'
      and is_nullable = 'NO'
  ) then
    raise exception 'newsroom_editorial_source_packages_manifest_invalid';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'newsroom_editorial_source_packages'
      and column_name = 'markdown'
      and data_type = 'text'
      and is_nullable = 'NO'
  ) then
    raise exception 'newsroom_editorial_source_packages_markdown_invalid';
  end if;
end;
$$;

select 'Postflight concluído: tabela privada, estrutura e privilégios validados' as resultado;
