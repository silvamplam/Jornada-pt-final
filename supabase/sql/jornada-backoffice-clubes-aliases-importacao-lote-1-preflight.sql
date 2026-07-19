-- JORNADA-BACKOFFICE-CLUBES-ALIASES-IMPORTACAO-LOTE-RPC-1
-- SQL 1/4 - PREFLIGHT (read-only)

begin transaction read only;

do $preflight$
declare
  v_manage_oid oid := to_regprocedure(
    'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
  );
  v_normalize_oid oid := to_regprocedure('public.normalize_team_identity_v1(text)');
  v_team_aliases_oid oid := to_regclass('public.team_aliases');
  v_audit_oid oid := to_regclass('public.team_alias_audit_events');
  v_teams_oid oid := to_regclass('public.teams');
  v_countries_oid oid := to_regclass('public.countries');
  v_columns text[];
  v_teams_id_attnum smallint;
  v_teams_country_id_attnum smallint;
  v_countries_id_attnum smallint;
  v_team_aliases_id_attnum smallint;
  v_team_aliases_team_id_attnum smallint;
  v_audit_team_alias_id_attnum smallint;
  v_normalized_alias_attnum smallint;
begin
  if v_manage_oid is null then
    raise exception 'preflight_manage_team_alias_signature_missing'
      using errcode = '42883';
  end if;

  if v_normalize_oid is null then
    raise exception 'preflight_normalize_team_identity_v1_missing'
      using errcode = '42883';
  end if;

  if v_team_aliases_oid is null or v_audit_oid is null then
    raise exception 'preflight_required_alias_table_missing'
      using errcode = '42P01';
  end if;

  if v_teams_oid is null or v_countries_oid is null then
    raise exception 'preflight_team_or_country_table_missing'
      using errcode = '42P01';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_alias_batch'
  ) then
    raise exception 'preflight_manage_team_alias_batch_already_exists'
      using errcode = '42723';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception 'preflight_expected_supabase_role_missing'
      using errcode = '42704';
  end if;

  if exists (
    select 1
    from (values
      ('teams'::text, 'id'::text, 'uuid'::text, 'NO'::text),
      ('teams', 'country_id', 'uuid', 'YES'),
      ('teams', 'name', 'text', 'NO'),
      ('teams', 'short_name', 'text', 'NO'),
      ('teams', 'slug', 'text', 'NO'),
      ('teams', 'code', 'text', 'YES'),
      ('countries', 'id', 'uuid', 'NO')
    ) expected(table_name, column_name, data_type, is_nullable)
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = expected.table_name
     and c.column_name = expected.column_name
     and c.data_type = expected.data_type
     and c.is_nullable = expected.is_nullable
    where c.column_name is null
  ) then
    raise exception 'preflight_team_or_country_columns_unexpected'
      using errcode = '55000';
  end if;

  select a.attnum::smallint
  into v_teams_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_teams_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint
  into v_teams_country_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_teams_oid
    and a.attname = 'country_id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint
  into v_countries_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_countries_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_teams_oid
      and c.contype = 'p'
      and c.conkey = array[v_teams_id_attnum]::smallint[]
  ) <> 1 or (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_countries_oid
      and c.contype = 'p'
      and c.conkey = array[v_countries_id_attnum]::smallint[]
  ) <> 1 then
    raise exception 'preflight_team_or_country_primary_key_unexpected'
      using errcode = '55000';
  end if;

  if (
    select team_country.atttypid = country_id.atttypid
    from pg_catalog.pg_attribute team_country
    cross join pg_catalog.pg_attribute country_id
    where team_country.attrelid = v_teams_oid
      and team_country.attnum = v_teams_country_id_attnum
      and country_id.attrelid = v_countries_oid
      and country_id.attnum = v_countries_id_attnum
  ) is distinct from true then
    raise exception 'preflight_team_country_id_type_mismatch'
      using errcode = '42804';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_teams_oid
      and c.contype = 'f'
      and c.conkey = array[v_teams_country_id_attnum]::smallint[]
  ) <> 1 or (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_teams_oid
      and c.contype = 'f'
      and c.conkey = array[v_teams_country_id_attnum]::smallint[]
      and c.confrelid = v_countries_oid
      and c.confkey = array[v_countries_id_attnum]::smallint[]
      and c.confdeltype = 'n'
      and c.confupdtype = 'a'
      and c.confmatchtype = 's'
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) <> 1 then
    raise exception 'preflight_team_country_foreign_key_unexpected'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_manage_oid
      and p.prokind = 'f'
      and p.proretset
      and p.prorettype = 'record'::regtype::oid
      and p.prosecdef
      and p.pronargs = 8
      and p.pronargdefaults = 4
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and pg_catalog.oidvectortypes(p.proargtypes) =
        'text, text, text, text, uuid, uuid, text, text'
      and p.proallargtypes is not distinct from array[
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'uuid'::regtype::oid,
        'uuid'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'uuid'::regtype::oid,
        'uuid'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'boolean'::regtype::oid,
        'text'::regtype::oid
      ]::oid[]
      and p.proargmodes is not distinct from array[
        'i','i','i','i','i','i','i','i',
        't','t','t','t','t','t','t'
      ]::"char"[]
      and p.proargnames is not distinct from array[
        'p_action',
        'p_actor_type',
        'p_actor_reference',
        'p_source',
        'p_team_alias_id',
        'p_team_id',
        'p_alias',
        'p_request_reference',
        'result_team_alias_id',
        'result_team_id',
        'result_alias',
        'result_normalized_alias',
        'result_status',
        'result_changed',
        'result_code'
      ]::text[]
  ) then
    raise exception 'preflight_manage_team_alias_contract_unexpected'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_normalize_oid
      and p.prokind = 'f'
      and not p.proretset
      and not p.prosecdef
      and p.provolatile = 'i'
      and p.proisstrict
      and p.proparallel = 's'
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and p.prorettype = 'text'::regtype::oid
  ) then
    raise exception 'preflight_normalize_team_identity_v1_contract_unexpected'
      using errcode = '55000';
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
    raise exception 'preflight_team_aliases_columns_unexpected: %', v_columns
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
    raise exception 'preflight_team_alias_audit_events_columns_unexpected: %', v_columns
      using errcode = '55000';
  end if;

  if not (
    select c.relrowsecurity and not c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_team_aliases_oid
  ) or not (
    select c.relrowsecurity and not c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_audit_oid
  ) then
    raise exception 'preflight_alias_tables_rls_state_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid in (v_team_aliases_oid, v_audit_oid)
  ) then
    raise exception 'preflight_alias_table_policy_unexpected'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.conname = 'team_aliases_status_check'
      and c.contype = 'c'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.conname = 'team_alias_audit_events_action_check'
      and c.contype = 'c'
  ) then
    raise exception 'preflight_alias_state_or_action_constraint_missing'
      using errcode = '55000';
  end if;

  select a.attnum::smallint
  into v_team_aliases_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint
  into v_team_aliases_team_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'team_id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint
  into v_audit_team_alias_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_audit_oid
    and a.attname = 'team_alias_id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint
  into v_normalized_alias_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'normalized_alias'
    and a.attnum > 0
    and not a.attisdropped;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'u'
  ) <> 1 or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'u'
      and c.conkey = array[v_normalized_alias_attnum]::smallint[]
  ) then
    raise exception 'preflight_global_normalized_alias_unique_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_local_column_unexpected'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
  ) <> 1 then
    raise exception 'preflight_team_aliases_team_id_fk_multiplicity_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and c.confrelid <> v_teams_oid
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_referenced_table_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and c.confkey is distinct from array[v_teams_id_attnum]::smallint[]
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_referenced_column_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and c.confdeltype <> 'r'
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_on_delete_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and c.confupdtype <> 'a'
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_on_update_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and c.confmatchtype <> 's'
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_match_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and (c.condeferrable or c.condeferred)
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_deferrability_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
      and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
      and not c.convalidated
  ) then
    raise exception 'preflight_team_aliases_team_id_fk_not_validated'
      using errcode = '55000';
  end if;

  if (
    select local_column.atttypid = referenced_column.atttypid
    from pg_catalog.pg_attribute local_column
    cross join pg_catalog.pg_attribute referenced_column
    where local_column.attrelid = v_team_aliases_oid
      and local_column.attnum = v_team_aliases_team_id_attnum
      and referenced_column.attrelid = v_teams_oid
      and referenced_column.attnum = v_teams_id_attnum
  ) is distinct from true then
    raise exception 'preflight_team_aliases_team_id_fk_type_incompatible'
      using errcode = '42804';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_local_column_unexpected'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
  ) <> 1 then
    raise exception 'preflight_audit_team_alias_id_fk_multiplicity_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and c.confrelid <> v_team_aliases_oid
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_referenced_table_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and c.confkey is distinct from array[v_team_aliases_id_attnum]::smallint[]
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_referenced_column_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and c.confdeltype <> 'r'
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_on_delete_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and c.confupdtype <> 'a'
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_on_update_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and c.confmatchtype <> 's'
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_match_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and (c.condeferrable or c.condeferred)
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_deferrability_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and not c.convalidated
  ) then
    raise exception 'preflight_audit_team_alias_id_fk_not_validated'
      using errcode = '55000';
  end if;

  if (
    select local_column.atttypid = referenced_column.atttypid
    from pg_catalog.pg_attribute local_column
    cross join pg_catalog.pg_attribute referenced_column
    where local_column.attrelid = v_audit_oid
      and local_column.attnum = v_audit_team_alias_id_attnum
      and referenced_column.attrelid = v_team_aliases_oid
      and referenced_column.attnum = v_team_aliases_id_attnum
  ) is distinct from true then
    raise exception 'preflight_audit_team_alias_id_fk_type_incompatible'
      using errcode = '42804';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role', v_manage_oid, 'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon', v_manage_oid, 'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated', v_manage_oid, 'EXECUTE'
  ) or exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_manage_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'preflight_manage_team_alias_execute_privileges_unexpected'
      using errcode = '42501';
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role', v_team_aliases_oid, 'SELECT'
  ) or not pg_catalog.has_table_privilege(
    'service_role', v_audit_oid, 'SELECT'
  ) or pg_catalog.has_table_privilege(
    'service_role', v_team_aliases_oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) or pg_catalog.has_table_privilege(
    'service_role', v_audit_oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
  ) then
    raise exception 'preflight_service_role_alias_table_privileges_unexpected'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid in (v_team_aliases_oid, v_audit_oid)
      and acl.grantee in (
        0,
        (select oid from pg_catalog.pg_roles where rolname = 'anon'),
        (select oid from pg_catalog.pg_roles where rolname = 'authenticated')
      )
  ) then
    raise exception 'preflight_browser_alias_table_privilege_unexpected'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    left join public.teams t on t.id = a.team_id
    where t.id is null
  ) then
    raise exception 'preflight_orphan_team_alias_found'
      using errcode = '23503';
  end if;

  if exists (
    select a.normalized_alias
    from public.team_aliases a
    group by a.normalized_alias
    having count(*) > 1
  ) then
    raise exception 'preflight_duplicate_normalized_alias_found'
      using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    where a.status not in ('active', 'inactive')
       or a.normalized_alias is distinct from public.normalize_team_identity_v1(a.alias)
  ) then
    raise exception 'preflight_team_alias_state_or_normalization_unexpected'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.team_alias_audit_events e
    where e.action not in ('create', 'update', 'deactivate', 'reactivate')
  ) then
    raise exception 'preflight_team_alias_audit_action_unexpected'
      using errcode = '23514';
  end if;
end
$preflight$;

-- Guardar o output desta query para comparar diretamente com o postflight.
select
  fingerprint.object_name,
  fingerprint.row_count,
  fingerprint.content_md5
from (
  select
    'team_aliases'::text as object_name,
    count(*)::bigint as row_count,
    md5(coalesce(jsonb_agg(to_jsonb(a) order by a.id)::text, '[]')) as content_md5
  from public.team_aliases a

  union all

  select
    'team_alias_audit_events'::text,
    count(*)::bigint,
    md5(coalesce(jsonb_agg(to_jsonb(e) order by e.id)::text, '[]'))
  from public.team_alias_audit_events e
) fingerprint
order by fingerprint.object_name;

rollback;
