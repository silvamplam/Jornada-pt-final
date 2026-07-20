-- Jornada.pt - remocao segura de clubes: postflight exclusivamente read-only.
-- Executar depois do aplicar e antes do smoke.

do $postflight$
declare
  v_rpc_oid oid := to_regprocedure(
    'public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text)'
  );
  v_trigger_function_oid oid := to_regprocedure(
    'public.prevent_team_deletion_audit_event_mutation()'
  );
  v_audit_oid oid := to_regclass('public.team_deletion_audit_events');
  v_actual_fks text[];
  v_expected_fks constant text[] := array[
    'public.goals(team_id)',
    'public.match_events(team_id)',
    'public.matches(away_team_id)',
    'public.matches(home_team_id)',
    'public.players(team_id)',
    'public.season_teams(team_id)',
    'public.standing_rows(team_id)',
    'public.team_aliases(team_id)',
    'public.team_public_name_audit_events(team_id)'
  ];
  v_definition text;
begin
  if v_rpc_oid is null
     or v_trigger_function_oid is null
     or v_audit_oid is null then
    raise exception 'postflight_schema_incompatible: phase_object_missing'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (values
      ('id', 'uuid', 'NO'),
      ('deleted_team_id', 'uuid', 'NO'),
      ('team_snapshot', 'jsonb', 'NO'),
      ('aliases_snapshot', 'jsonb', 'NO'),
      ('dependency_snapshot', 'jsonb', 'NO'),
      ('confirmed_action', 'text', 'NO'),
      ('confirmed_preview_fingerprint', 'text', 'NO'),
      ('actor_type', 'text', 'NO'),
      ('actor_reference', 'text', 'NO'),
      ('source', 'text', 'NO'),
      ('request_reference', 'text', 'NO'),
      ('created_at', 'timestamptz', 'NO'),
      ('contract_version', 'text', 'NO')
    ) expected(column_name, udt_name, is_nullable)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'team_deletion_audit_events'
        and c.column_name = expected.column_name
        and c.udt_name = expected.udt_name
        and c.is_nullable = expected.is_nullable
    )
  ) or (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_deletion_audit_events'
  ) <> 13 then
    raise exception 'postflight_schema_incompatible: deletion_audit_column_contract'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_deletion_audit_events'
      and c.column_name = 'id'
      and position('gen_random_uuid()' in coalesce(c.column_default, '')) > 0
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_deletion_audit_events'
      and c.column_name = 'created_at'
      and position('now()' in coalesce(c.column_default, '')) > 0
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_deletion_audit_events'
      and c.column_name = 'contract_version'
      and pg_catalog.regexp_replace(
        coalesce(c.column_default, ''),
        '::[a-zA-Z0-9_ ]+',
        '',
        'g'
      ) = '''v1'''
  ) then
    raise exception 'postflight_schema_incompatible: deletion_audit_default_contract'
      using errcode = '55000';
  end if;

  if pg_catalog.has_function_privilege('service_role', v_trigger_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_trigger_function_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_trigger_function_oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_trigger_function_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'postflight_permission_denied: immutability_function_grants_invalid'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
  ) then
    raise exception 'postflight_schema_incompatible: deletion_audit_must_not_have_foreign_keys'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.conname = 'team_deletion_audit_events_pkey'
      and c.contype = 'p'
  ) or exists (
    select expected.constraint_name
    from (values
      ('team_deletion_audit_events_team_snapshot_object_check'),
      ('team_deletion_audit_events_team_snapshot_identity_check'),
      ('team_deletion_audit_events_aliases_snapshot_array_check'),
      ('team_deletion_audit_events_dependency_snapshot_array_check'),
      ('team_deletion_audit_events_confirmed_action_check'),
      ('team_deletion_audit_events_fingerprint_check'),
      ('team_deletion_audit_events_actor_type_not_blank_check'),
      ('team_deletion_audit_events_actor_reference_not_blank_check'),
      ('team_deletion_audit_events_source_not_blank_check'),
      ('team_deletion_audit_events_request_reference_not_blank_check'),
      ('team_deletion_audit_events_contract_version_check')
    ) expected(constraint_name)
    where not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = v_audit_oid
        and c.conname = expected.constraint_name
        and c.contype = 'c'
    )
  ) then
    raise exception 'postflight_schema_incompatible: deletion_audit_constraint_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = v_trigger_function_oid
      and r.rolname = 'postgres'
      and not p.prosecdef
      and p.prorettype = 'trigger'::regtype
      and p.proconfig @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'postflight_schema_incompatible: immutability_function_contract'
      using errcode = '55000';
  end if;

  if to_regclass('public.team_deletion_audit_events_deleted_team_created_at_idx') is null
     or to_regclass('public.team_deletion_audit_events_created_at_idx') is null
     or to_regclass('public.team_deletion_audit_events_request_reference_uidx') is null then
    raise exception 'postflight_schema_incompatible: deletion_audit_index_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indexrelid = 'public.team_deletion_audit_events_request_reference_uidx'::regclass
      and i.indrelid = v_audit_oid
      and i.indisunique
      and i.indisvalid
  ) then
    raise exception 'postflight_schema_incompatible: request_reference_index_not_unique'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = v_audit_oid
      and t.tgname = 'team_deletion_audit_events_prevent_mutation'
      and t.tgfoid = v_trigger_function_oid
      and not t.tgisinternal
      and t.tgenabled = 'O'
  ) then
    raise exception 'postflight_schema_incompatible: immutability_trigger_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_roles r on r.oid = c.relowner
    where c.oid = v_audit_oid
      and r.rolname = 'postgres'
      and c.relrowsecurity
  ) then
    raise exception 'postflight_schema_incompatible: deletion_audit_owner_or_rls'
      using errcode = '55000';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.team_deletion_audit_events',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'public.team_deletion_audit_events',
    'INSERT'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'public.team_deletion_audit_events',
    'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'public.team_deletion_audit_events',
    'DELETE'
  ) or pg_catalog.has_table_privilege(
    'anon',
    'public.team_deletion_audit_events',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'anon',
    'public.team_deletion_audit_events',
    'INSERT'
  ) or pg_catalog.has_table_privilege(
    'anon',
    'public.team_deletion_audit_events',
    'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'anon',
    'public.team_deletion_audit_events',
    'DELETE'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.team_deletion_audit_events',
    'SELECT'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.team_deletion_audit_events',
    'INSERT'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.team_deletion_audit_events',
    'UPDATE'
  ) or pg_catalog.has_table_privilege(
    'authenticated',
    'public.team_deletion_audit_events',
    'DELETE'
  ) or exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid = v_audit_oid
      and acl.grantee = 0
      and acl.privilege_type in ('SELECT', 'INSERT', 'UPDATE', 'DELETE')
  ) then
    raise exception 'postflight_permission_denied: deletion_audit_grants_invalid'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_roles r on r.oid = p.proowner
    where p.oid = v_rpc_oid
      and r.rolname = 'postgres'
      and p.prosecdef
      and p.prorettype = 'jsonb'::regtype
      and p.provolatile = 'v'
      and p.proconfig @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'postflight_schema_incompatible: rpc_security_or_return_contract'
      using errcode = '55000';
  end if;

  if not pg_catalog.has_function_privilege('service_role', v_rpc_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_rpc_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_rpc_oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_rpc_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'postflight_permission_denied: rpc_grants_invalid'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_alias_audit_events'
      and c.column_name = 'team_alias_id'
      and (c.udt_name <> 'uuid' or c.is_nullable <> 'YES')
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conname = 'team_alias_audit_events_team_alias_id_fkey'
      and c.conrelid = 'public.team_alias_audit_events'::regclass
      and c.confrelid = 'public.team_aliases'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'n'
  ) then
    raise exception 'postflight_schema_incompatible: alias_audit_set_null_contract'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_public_name_audit_events'
      and c.column_name = 'team_id'
      and (c.udt_name <> 'uuid' or c.is_nullable <> 'YES')
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conname = 'team_public_name_audit_events_team_id_fkey'
      and c.conrelid = 'public.team_public_name_audit_events'::regclass
      and c.confrelid = 'public.teams'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'n'
  ) then
    raise exception 'postflight_schema_incompatible: public_name_audit_set_null_contract'
      using errcode = '55000';
  end if;

  select coalesce(array_agg(fk.signature order by fk.signature), array[]::text[])
  into v_actual_fks
  from (
    select pg_catalog.format(
      '%I.%I(%I)',
      child_ns.nspname,
      child.relname,
      child_column.attname
    ) as signature
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid = c.conrelid
    join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_catalog.pg_attribute child_column
      on child_column.attrelid = c.conrelid
     and child_column.attnum = c.conkey[1]
    join pg_catalog.pg_attribute parent_column
      on parent_column.attrelid = c.confrelid
     and parent_column.attnum = c.confkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.teams'::regclass
      and parent_column.attname = 'id'
  ) fk;

  if v_actual_fks <> v_expected_fks then
    raise exception 'postflight_unknown_dependency: %',
      pg_catalog.array_to_string(v_actual_fks, ', ')
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.teams'::regclass
      and not t.tgisinternal
  ) then
    raise exception 'postflight_unknown_dependency: teams_trigger_requires_review'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (values
      ('public.season_teams'::regclass, 'team_id', 'c', false),
      ('public.matches'::regclass, 'home_team_id', 'a', false),
      ('public.matches'::regclass, 'away_team_id', 'a', false),
      ('public.standing_rows'::regclass, 'team_id', 'a', false),
      ('public.goals'::regclass, 'team_id', 'a', false),
      ('public.players'::regclass, 'team_id', 'n', true),
      ('public.match_events'::regclass, 'team_id', 'n', true),
      ('public.team_aliases'::regclass, 'team_id', 'r', false)
    ) expected(table_oid, column_name, delete_action, nullable)
    where not exists (
      select 1
      from pg_catalog.pg_constraint c
      join pg_catalog.pg_attribute a
        on a.attrelid = c.conrelid
       and a.attnum = c.conkey[1]
      where c.contype = 'f'
        and c.conrelid = expected.table_oid
        and c.confrelid = 'public.teams'::regclass
        and a.attname = expected.column_name
        and c.confdeltype = expected.delete_action
        and a.attnotnull = not expected.nullable
    )
  ) then
    raise exception 'postflight_schema_incompatible: competitive_fk_changed'
      using errcode = '55000';
  end if;

  v_definition := pg_catalog.lower(pg_catalog.pg_get_functiondef(v_rpc_oid));

  if exists (
    select expected.key
    from unnest(array[
      'contract_version',
      'mode',
      'applied',
      'team_id',
      'name',
      'public_name',
      'short_name',
      'code',
      'slug',
      'country',
      'active_aliases',
      'inactive_aliases',
      'alias_count',
      'alias_audit_count',
      'public_name_audit_count',
      'dependencies',
      'status',
      'can_delete',
      'proposed_action',
      'reason_code',
      'reason_message',
      'preview_fingerprint',
      'deleted_team_id',
      'aliases_deleted_count',
      'alias_audit_events_preserved_count',
      'public_name_audit_events_preserved_count',
      'deletion_audit_event_id'
    ]::text[]) expected(key)
    where position(pg_catalog.quote_literal(expected.key) in v_definition) = 0
  ) then
    raise exception 'postflight_schema_incompatible: rpc_response_key_missing'
      using errcode = '55000';
  end if;

  if v_definition not like '%team_safe_deletion:v1:%'
     or v_definition not like '%pg_advisory_xact_lock%'
     or v_definition not like '%for update%'
     or v_definition not like '%preview_stale%'
     or v_definition not like '%removable_with_aliases%'
     or v_definition not like '%blocking_dependencies_found%'
     or v_definition not like '%team_deletion_audit_events%'
     or v_definition like '%p_country_id%'
     or v_definition like '%spain%'
     or v_definition like '%espanha%'
     or v_definition like '%la liga%' then
    raise exception 'postflight_schema_incompatible: rpc_definition_contract'
      using errcode = '55000';
  end if;

  if pg_catalog.obj_description(v_rpc_oid, 'pg_proc') is null
     or pg_catalog.obj_description(v_audit_oid, 'pg_class') is null then
    raise exception 'postflight_schema_incompatible: required_comment_missing'
      using errcode = '55000';
  end if;
end
$postflight$;

select
  'postflight_ok'::text as result,
  'public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text)'::text as rpc_signature,
  'jsonb'::text as return_type,
  'v1'::text as contract_version,
  true as service_role_only;
