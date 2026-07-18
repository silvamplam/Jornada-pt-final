-- JORNADA-BACKOFFICE-CLUBES-ALIASES-AUDITAVEIS-SCHEMA-RPC-1
-- SQL 3/4 - POSTFLIGHT READ-ONLY
--
-- Valida o resultado contratado sem criar objetos nem alterar dados.

begin;
set transaction read only;

do $postflight$
declare
  v_columns text[];
  v_count bigint;
  v_team_aliases_oid oid := to_regclass('public.team_aliases');
  v_audit_oid oid := to_regclass('public.team_alias_audit_events');
  v_teams_oid oid := to_regclass('public.teams');
  v_normalize_oid oid := to_regprocedure('public.normalize_team_identity_v1(text)');
  v_manage_oid oid := to_regprocedure(
    'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
  );
  v_team_aliases_id_attnum smallint;
  v_team_aliases_team_id_attnum smallint;
  v_team_aliases_normalized_alias_attnum smallint;
  v_teams_id_attnum smallint;
  v_audit_id_attnum smallint;
  v_audit_team_alias_id_attnum smallint;
begin
  if v_team_aliases_oid is null
     or v_audit_oid is null
     or v_teams_oid is null
     or v_normalize_oid is null
     or v_manage_oid is null then
    raise exception 'postflight_required_object_missing' using errcode = '55000';
  end if;

  select array_agg(
    c.column_name || ':' || c.data_type || ':' || c.is_nullable
    order by c.ordinal_position
  )
  into v_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_aliases';

  if v_columns is distinct from array[
    'id:uuid:NO',
    'team_id:uuid:NO',
    'alias:text:NO',
    'normalized_alias:text:NO',
    'created_at:timestamp with time zone:NO',
    'source:text:NO',
    'status:text:NO',
    'updated_at:timestamp with time zone:NO',
    'created_by:text:NO',
    'updated_by:text:NO'
  ]::text[] then
    raise exception 'postflight_team_aliases_columns_unexpected: %', v_columns
      using errcode = '55000';
  end if;

  select array_agg(
    c.column_name || ':' || c.data_type || ':' || c.is_nullable
    order by c.ordinal_position
  )
  into v_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_alias_audit_events';

  if v_columns is distinct from array[
    'id:uuid:NO',
    'team_alias_id:uuid:NO',
    'action:text:NO',
    'actor_type:text:NO',
    'actor_reference:text:NO',
    'source:text:NO',
    'before_state:jsonb:YES',
    'after_state:jsonb:YES',
    'request_reference:text:YES',
    'created_at:timestamp with time zone:NO'
  ]::text[] then
    raise exception 'postflight_audit_columns_unexpected: %', v_columns
      using errcode = '55000';
  end if;

  select count(*) into v_count from public.team_aliases;
  if v_count <> 8 then
    raise exception 'postflight_team_alias_count_expected_8_observed_%', v_count
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    where a.source <> 'legacy_seed'
       or a.status <> 'active'
       or a.created_by <> 'migration_legacy'
       or a.updated_by <> 'migration_legacy'
       or a.updated_at is distinct from a.created_at
  ) then
    raise exception 'postflight_legacy_backfill_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    left join public.teams t on t.id = a.team_id
    where t.id is null
  ) then
    raise exception 'postflight_orphan_team_alias_found' using errcode = '23503';
  end if;

  if exists (
    select a.normalized_alias
    from public.team_aliases a
    group by a.normalized_alias
    having count(*) > 1
  ) then
    raise exception 'postflight_duplicate_normalized_alias_found' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    where a.normalized_alias is distinct from
      public.normalize_team_identity_v1(a.alias)
  ) then
    raise exception 'postflight_alias_normalization_v1_divergence_found'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    join public.teams t on t.id <> a.team_id
    cross join lateral (
      values (t.name), (t.short_name), (t.slug), (t.code)
    ) identity_value(field_value)
    where public.normalize_team_identity_v1(identity_value.field_value) =
      a.normalized_alias
  ) then
    raise exception 'postflight_alias_collision_with_other_team_identity_found'
      using errcode = '23505';
  end if;

  select a.attnum::smallint into v_team_aliases_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_team_aliases_team_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'team_id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_team_aliases_normalized_alias_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'normalized_alias'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_teams_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_teams_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_audit_team_alias_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_audit_oid
    and a.attname = 'team_alias_id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_audit_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_audit_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'p'
      and c.conkey = array[v_team_aliases_id_attnum]::smallint[]
  ) <> 1 then
    raise exception 'postflight_team_aliases_primary_key_unexpected'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'p'
      and c.conkey = array[v_audit_id_attnum]::smallint[]
  ) <> 1 then
    raise exception 'postflight_audit_primary_key_unexpected'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'u'
      and c.conkey = array[v_team_aliases_normalized_alias_attnum]::smallint[]
  ) <> 1 then
    raise exception 'postflight_global_normalized_alias_unique_unexpected'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
  ) <> 1 or (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.confrelid = v_teams_oid
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and c.confkey = array[v_teams_id_attnum]::smallint[]
      and c.confdeltype = 'r'
  ) <> 1 then
    raise exception 'postflight_team_aliases_fk_not_restrict'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.confrelid = v_team_aliases_oid
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and c.confkey = array[v_team_aliases_id_attnum]::smallint[]
      and c.confdeltype = 'r'
  ) <> 1 then
    raise exception 'postflight_audit_fk_not_restrict'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (values
      ('team_aliases_alias_not_blank_check'),
      ('team_aliases_normalized_alias_not_blank_check'),
      ('team_aliases_normalized_alias_format_check'),
      ('team_aliases_normalized_alias_v1_check'),
      ('team_aliases_status_check'),
      ('team_aliases_source_not_blank_check'),
      ('team_aliases_created_by_not_blank_check'),
      ('team_aliases_updated_by_not_blank_check')
    ) expected(conname)
    left join pg_catalog.pg_constraint c
      on c.conrelid = v_team_aliases_oid
     and c.conname = expected.conname
     and c.contype = 'c'
     and c.convalidated
    where c.oid is null
  ) then
    raise exception 'postflight_team_aliases_check_constraint_missing_or_unvalidated'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (values
      ('team_alias_audit_events_action_check'),
      ('team_alias_audit_events_actor_type_not_blank_check'),
      ('team_alias_audit_events_actor_reference_not_blank_check'),
      ('team_alias_audit_events_source_not_blank_check')
    ) expected(conname)
    left join pg_catalog.pg_constraint c
      on c.conrelid = v_audit_oid
     and c.conname = expected.conname
     and c.contype = 'c'
     and c.convalidated
    where c.oid is null
  ) then
    raise exception 'postflight_audit_check_constraint_missing_or_unvalidated'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (values
      ('team_aliases_team_id_idx', v_team_aliases_oid),
      ('team_aliases_team_status_normalized_idx', v_team_aliases_oid),
      ('team_alias_audit_events_team_alias_created_at_idx', v_audit_oid),
      ('team_alias_audit_events_created_at_idx', v_audit_oid)
    ) expected(index_name, table_oid)
    left join pg_catalog.pg_namespace n
      on n.nspname = 'public'
    left join pg_catalog.pg_class i
      on i.relnamespace = n.oid
     and i.relname = expected.index_name
    left join pg_catalog.pg_index x
      on x.indexrelid = i.oid
     and x.indrelid = expected.table_oid
     and x.indisvalid
     and x.indisready
    where i.oid is null or x.indexrelid is null
  ) then
    raise exception 'postflight_required_index_missing_or_invalid'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_normalize_oid
      and p.provolatile = 'i'
      and p.proisstrict
      and p.proparallel = 's'
      and not p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'postflight_normalizer_properties_unexpected'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_manage_oid
      and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'postflight_manage_rpc_security_unexpected'
      using errcode = '55000';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_team_aliases_oid
  ) or not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_audit_oid
  ) then
    raise exception 'postflight_rls_not_enabled' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid in (v_team_aliases_oid, v_audit_oid)
  ) then
    raise exception 'postflight_unexpected_rls_policy_found'
      using errcode = '55000';
  end if;

  if not has_table_privilege('service_role', v_team_aliases_oid, 'SELECT')
     or has_table_privilege('service_role', v_team_aliases_oid, 'INSERT')
     or has_table_privilege('service_role', v_team_aliases_oid, 'UPDATE')
     or has_table_privilege('service_role', v_team_aliases_oid, 'DELETE')
     or not has_table_privilege('service_role', v_audit_oid, 'SELECT')
     or has_table_privilege('service_role', v_audit_oid, 'INSERT')
     or has_table_privilege('service_role', v_audit_oid, 'UPDATE')
     or has_table_privilege('service_role', v_audit_oid, 'DELETE') then
    raise exception 'postflight_service_role_table_privileges_unexpected'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from (values ('anon'), ('authenticated')) client_role(role_name)
    cross join (values (v_team_aliases_oid), (v_audit_oid)) protected_table(table_oid)
    where has_table_privilege(client_role.role_name, protected_table.table_oid, 'SELECT')
       or has_table_privilege(client_role.role_name, protected_table.table_oid, 'INSERT')
       or has_table_privilege(client_role.role_name, protected_table.table_oid, 'UPDATE')
       or has_table_privilege(client_role.role_name, protected_table.table_oid, 'DELETE')
  ) then
    raise exception 'postflight_client_table_privileges_unexpected'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid in (v_team_aliases_oid, v_audit_oid)
      and acl.grantee = 0
  ) then
    raise exception 'postflight_public_table_privilege_found'
      using errcode = '42501';
  end if;

  if not has_function_privilege('service_role', v_manage_oid, 'EXECUTE')
     or has_function_privilege('anon', v_manage_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_manage_oid, 'EXECUTE')
     or has_function_privilege('service_role', v_normalize_oid, 'EXECUTE')
     or has_function_privilege('anon', v_normalize_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_normalize_oid, 'EXECUTE') then
    raise exception 'postflight_function_privileges_unexpected'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid in (v_normalize_oid, v_manage_oid)
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'postflight_public_function_execute_found'
      using errcode = '42501';
  end if;

  if exists (select 1 from public.team_alias_audit_events) then
    raise exception 'postflight_audit_table_expected_empty'
      using errcode = '55000';
  end if;

  raise notice 'postflight_ok: 8 aliases preserved, schema, FK, constraints, indexes, RLS, grants and RPC verified';
end
$postflight$;

commit;
