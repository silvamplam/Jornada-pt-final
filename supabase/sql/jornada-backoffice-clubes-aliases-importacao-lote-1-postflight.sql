-- JORNADA-BACKOFFICE-CLUBES-ALIASES-IMPORTACAO-LOTE-RPC-1
-- SQL 3/4 - POSTFLIGHT (read-only)

begin transaction read only;

set local search_path = pg_catalog;

do $postflight$
declare
  v_batch_oid oid := to_regprocedure(
    'public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)'
  );
  v_unit_oid oid := to_regprocedure(
    'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
  );
  v_team_aliases_oid oid := to_regclass('public.team_aliases');
  v_audit_oid oid := to_regclass('public.team_alias_audit_events');
  v_teams_oid oid := to_regclass('public.teams');
  v_normalize_oid oid := to_regprocedure('public.normalize_team_identity_v1(text)');
  v_gen_random_uuid_oid oid := to_regprocedure('pg_catalog.gen_random_uuid()');
  v_now_oid oid := to_regprocedure('pg_catalog.now()');
  v_btrim_text_oid oid := to_regprocedure('pg_catalog.btrim(text)');
  v_text_equal_oid oid := to_regoperator('pg_catalog.=(text,text)');
  v_text_not_equal_oid oid := to_regoperator('pg_catalog.<>(text,text)');
  v_text_regex_oid oid := to_regoperator('pg_catalog.~(text,text)');
  v_service_role_oid oid;
  v_columns text[];
  v_column_definitions text[];
  v_check_names text[];
  v_constraint_names text[];
  v_check_definitions text[];
  v_default_definitions text[];
  v_default text;
  v_team_aliases_id_attnum smallint;
  v_team_aliases_team_id_attnum smallint;
  v_team_aliases_normalized_alias_attnum smallint;
  v_team_aliases_status_attnum smallint;
  v_teams_id_attnum smallint;
  v_audit_id_attnum smallint;
  v_audit_team_alias_id_attnum smallint;
  v_audit_created_at_attnum smallint;
begin
  if v_batch_oid is null then
    raise exception 'postflight_manage_team_alias_batch_missing'
      using errcode = '42883';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_alias_batch'
  ) <> 1 then
    raise exception 'postflight_manage_team_alias_batch_overload_unexpected'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_language l on l.oid = p.prolang
    where p.oid = v_batch_oid
      and p.prokind = 'f'
      and p.proretset
      and p.prorettype = 'record'::regtype::oid
      and p.prosecdef
      and p.pronargs = 7
      and p.pronargdefaults = 0
      and p.provolatile = 'v'
      and l.lanname = 'plpgsql'
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig is not distinct from array['search_path=pg_catalog']::text[]
      and pg_catalog.oidvectortypes(p.proargtypes) =
        'uuid, jsonb, boolean, text, text, text, text'
      and p.proallargtypes is not distinct from array[
        'uuid'::regtype::oid,
        'jsonb'::regtype::oid,
        'boolean'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'integer'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'uuid'::regtype::oid,
        'text'::regtype::oid,
        'uuid'::regtype::oid,
        'text'::regtype::oid,
        'text'::regtype::oid,
        'boolean'::regtype::oid,
        'boolean'::regtype::oid,
        'boolean'::regtype::oid,
        'boolean'::regtype::oid,
        'integer'::regtype::oid,
        'integer'::regtype::oid,
        'integer'::regtype::oid,
        'integer'::regtype::oid,
        'boolean'::regtype::oid
      ]::oid[]
      and p.proargmodes is not distinct from array[
        'i','i','i','i','i','i','i',
        't','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t','t'
      ]::"char"[]
      and p.proargnames is not distinct from array[
        'p_country_id',
        'p_rows',
        'p_apply',
        'p_actor_type',
        'p_actor_reference',
        'p_source',
        'p_request_reference',
        'line_number',
        'canonical_club_input',
        'alias_input',
        'normalized_alias',
        'resolved_team_id',
        'resolved_team_name',
        'result_team_alias_id',
        'result_status',
        'result_code',
        'blocking',
        'changed',
        'batch_can_apply',
        'batch_requested_apply',
        'batch_create_count',
        'batch_existing_active_count',
        'batch_blocking_count',
        'batch_created_count',
        'batch_noop'
      ]::text[]
  ) then
    raise exception 'postflight_manage_team_alias_batch_contract_unexpected'
      using errcode = '55000';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role', v_batch_oid, 'EXECUTE'
  ) or not exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_batch_oid
      and acl.grantee = (
        select r.oid
        from pg_catalog.pg_roles r
        where r.rolname = 'service_role'
      )
      and acl.privilege_type = 'EXECUTE'
      and not acl.is_grantable
  ) or pg_catalog.has_function_privilege(
    'anon', v_batch_oid, 'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated', v_batch_oid, 'EXECUTE'
  ) or exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_batch_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) or exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_batch_oid
      and (
        acl.privilege_type <> 'EXECUTE'
        or acl.is_grantable
        or acl.grantee not in (
          p.proowner,
          (
            select r.oid
            from pg_catalog.pg_roles r
            where r.rolname = 'service_role'
          )
        )
      )
  ) then
    raise exception 'postflight_manage_team_alias_batch_privileges_unexpected'
      using errcode = '42501';
  end if;

  if v_unit_oid is null
     or not pg_catalog.has_function_privilege('service_role', v_unit_oid, 'EXECUTE')
     or not exists (
       select 1
       from pg_catalog.pg_proc p
       where p.oid = v_unit_oid
         and p.prosecdef
         and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
         and p.proconfig is not distinct from array['search_path=pg_catalog']::text[]
     ) then
    raise exception 'postflight_manage_team_alias_unit_contract_changed'
      using errcode = '55000';
  end if;

  if v_team_aliases_oid is null or v_audit_oid is null or v_teams_oid is null then
    raise exception 'postflight_alias_table_missing'
      using errcode = '42P01';
  end if;

  if v_normalize_oid is null
     or v_gen_random_uuid_oid is null
     or v_now_oid is null
     or v_btrim_text_oid is null
     or v_text_equal_oid is null
     or v_text_not_equal_oid is null
     or v_text_regex_oid is null then
    raise exception 'postflight_alias_expression_dependency_missing'
      using errcode = '42883';
  end if;

  select r.oid
  into v_service_role_oid
  from pg_catalog.pg_roles r
  where r.rolname = 'service_role';

  if v_service_role_oid is null then
    raise exception 'postflight_service_role_missing'
      using errcode = '42704';
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
    raise exception 'postflight_team_aliases_structure_changed'
      using errcode = '55000';
  end if;

  select array_agg(
    format(
      '%s:%s:%s:%s',
      a.attnum,
      a.attname,
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      case when a.attnotnull then 'not_null' else 'nullable' end
    )
    order by a.attnum
  )
  into v_column_definitions
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attnum > 0
    and not a.attisdropped;

  if v_column_definitions is distinct from array[
    '1:id:uuid:not_null',
    '2:team_id:uuid:not_null',
    '3:alias:text:not_null',
    '4:normalized_alias:text:not_null',
    '5:created_at:timestamp with time zone:not_null',
    '6:source:text:not_null',
    '7:status:text:not_null',
    '8:updated_at:timestamp with time zone:not_null',
    '9:created_by:text:not_null',
    '10:updated_by:text:not_null'
  ]::text[] then
    raise exception 'postflight_team_aliases_column_catalog_changed: %',
      v_column_definitions
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
    raise exception 'postflight_team_alias_audit_events_structure_changed'
      using errcode = '55000';
  end if;

  select array_agg(
    format(
      '%s:%s:%s:%s',
      a.attnum,
      a.attname,
      pg_catalog.format_type(a.atttypid, a.atttypmod),
      case when a.attnotnull then 'not_null' else 'nullable' end
    )
    order by a.attnum
  )
  into v_column_definitions
  from pg_catalog.pg_attribute a
  where a.attrelid = v_audit_oid
    and a.attnum > 0
    and not a.attisdropped;

  if v_column_definitions is distinct from array[
    '1:id:uuid:not_null',
    '2:team_alias_id:uuid:not_null',
    '3:action:text:not_null',
    '4:actor_type:text:not_null',
    '5:actor_reference:text:not_null',
    '6:source:text:not_null',
    '7:before_state:jsonb:nullable',
    '8:after_state:jsonb:nullable',
    '9:request_reference:text:nullable',
    '10:created_at:timestamp with time zone:not_null'
  ]::text[] then
    raise exception 'postflight_audit_column_catalog_changed: %',
      v_column_definitions
      using errcode = '55000';
  end if;

  select c.column_default
  into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_aliases'
    and c.column_name = 'id';

  if v_default is null or position('gen_random_uuid()' in v_default) = 0 then
    raise exception 'postflight_team_aliases_id_default_changed: %', v_default
      using errcode = '55000';
  end if;

  select c.column_default
  into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_aliases'
    and c.column_name = 'created_at';

  if v_default is null or position('now()' in v_default) = 0 then
    raise exception 'postflight_team_aliases_created_at_default_changed: %', v_default
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_aliases'
      and c.column_name not in ('id', 'created_at')
      and c.column_default is not null
  ) then
    raise exception 'postflight_team_aliases_unexpected_default_found'
      using errcode = '55000';
  end if;

  select c.column_default
  into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_alias_audit_events'
    and c.column_name = 'id';

  if v_default is null or position('gen_random_uuid()' in v_default) = 0 then
    raise exception 'postflight_audit_id_default_changed: %', v_default
      using errcode = '55000';
  end if;

  select c.column_default
  into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_alias_audit_events'
    and c.column_name = 'created_at';

  if v_default is null or position('now()' in v_default) = 0 then
    raise exception 'postflight_audit_created_at_default_changed: %', v_default
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_alias_audit_events'
      and c.column_name not in ('id', 'created_at')
      and c.column_default is not null
  ) then
    raise exception 'postflight_audit_unexpected_default_found'
      using errcode = '55000';
  end if;

  select array_agg(
    table_class.relname || ':' || column_attribute.attname || ':' ||
    regexp_replace(
      pg_catalog.pg_get_expr(column_default.adbin, column_default.adrelid, true),
      '[[:space:]]+',
      '',
      'g'
    )
    order by table_class.relname, column_attribute.attname
  )
  into v_default_definitions
  from pg_catalog.pg_attrdef column_default
  join pg_catalog.pg_class table_class
    on table_class.oid = column_default.adrelid
  join pg_catalog.pg_attribute column_attribute
    on column_attribute.attrelid = column_default.adrelid
   and column_attribute.attnum = column_default.adnum
  where column_default.adrelid in (v_team_aliases_oid, v_audit_oid);

  if v_default_definitions is distinct from array[
    'team_alias_audit_events:created_at:now()',
    'team_alias_audit_events:id:gen_random_uuid()',
    'team_aliases:created_at:now()',
    'team_aliases:id:gen_random_uuid()'
  ]::text[] then
    raise exception 'postflight_alias_column_defaults_changed: %',
      v_default_definitions
      using errcode = '55000';
  end if;

  -- pg_get_expr preserva a expressao canonica; pg_depend impede que uma
  -- funcao homonima noutro schema seja aceite como geradora de UUID/tempo.
  if exists (
    select 1
    from pg_catalog.pg_attrdef column_default
    join pg_catalog.pg_class table_class
      on table_class.oid = column_default.adrelid
    join pg_catalog.pg_attribute column_attribute
      on column_attribute.attrelid = column_default.adrelid
     and column_attribute.attnum = column_default.adnum
    join pg_catalog.pg_depend dependency
      on dependency.classid = 'pg_catalog.pg_attrdef'::regclass
     and dependency.objid = column_default.oid
     and dependency.objsubid = 0
     and dependency.refclassid = 'pg_catalog.pg_proc'::regclass
    where column_default.adrelid in (v_team_aliases_oid, v_audit_oid)
      and dependency.refobjid is distinct from case column_attribute.attname
        when 'id' then v_gen_random_uuid_oid
        when 'created_at' then v_now_oid
        else null::oid
      end
  ) then
    raise exception 'postflight_alias_column_default_function_dependency_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute a
    where a.attrelid in (v_team_aliases_oid, v_audit_oid)
      and a.attnum > 0
      and (
        a.attisdropped
        or a.attidentity <> ''
        or a.attgenerated <> ''
      )
  ) then
    raise exception 'postflight_alias_column_identity_or_generated_changed'
      using errcode = '55000';
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

  select a.attnum::smallint into v_team_aliases_status_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'status'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_teams_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_teams_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_audit_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_audit_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_audit_team_alias_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_audit_oid
    and a.attname = 'team_alias_id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint into v_audit_created_at_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_audit_oid
    and a.attname = 'created_at'
    and a.attnum > 0
    and not a.attisdropped;

  select array_agg(c.conname || ':' || c.contype::text order by c.conname)
  into v_constraint_names
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid;

  if v_constraint_names is distinct from array[
    'team_aliases_alias_not_blank_check:c',
    'team_aliases_created_by_not_blank_check:c',
    'team_aliases_normalized_alias_format_check:c',
    'team_aliases_normalized_alias_key:u',
    'team_aliases_normalized_alias_not_blank_check:c',
    'team_aliases_normalized_alias_v1_check:c',
    'team_aliases_pkey:p',
    'team_aliases_source_not_blank_check:c',
    'team_aliases_status_check:c',
    'team_aliases_team_id_fkey:f',
    'team_aliases_updated_by_not_blank_check:c'
  ]::text[] then
    raise exception 'postflight_team_aliases_constraint_set_changed: %',
      v_constraint_names
      using errcode = '55000';
  end if;

  select array_agg(c.conname || ':' || c.contype::text order by c.conname)
  into v_constraint_names
  from pg_catalog.pg_constraint c
  where c.conrelid = v_audit_oid;

  if v_constraint_names is distinct from array[
    'team_alias_audit_events_action_check:c',
    'team_alias_audit_events_actor_reference_not_blank_check:c',
    'team_alias_audit_events_actor_type_not_blank_check:c',
    'team_alias_audit_events_pkey:p',
    'team_alias_audit_events_source_not_blank_check:c',
    'team_alias_audit_events_team_alias_id_fkey:f'
  ]::text[] then
    raise exception 'postflight_audit_constraint_set_changed: %',
      v_constraint_names
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.conname = 'team_aliases_pkey'
      and c.contype = 'p'
      and c.conkey = array[v_team_aliases_id_attnum]::smallint[]
      and c.conindid = to_regclass('public.team_aliases_pkey')
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) <> 1 or (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.conname = 'team_alias_audit_events_pkey'
      and c.contype = 'p'
      and c.conkey = array[v_audit_id_attnum]::smallint[]
      and c.conindid = to_regclass('public.team_alias_audit_events_pkey')
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) <> 1 then
    raise exception 'postflight_alias_primary_key_changed'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.conname = 'team_aliases_normalized_alias_key'
      and c.contype = 'u'
      and c.conkey = array[v_team_aliases_normalized_alias_attnum]::smallint[]
      and c.conindid = to_regclass('public.team_aliases_normalized_alias_key')
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) <> 1 then
    raise exception 'postflight_normalized_alias_unique_changed'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.conname = 'team_aliases_team_id_fkey'
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
      and c.confupdtype = 'a'
      and c.confmatchtype = 's'
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) <> 1 or (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.conname = 'team_alias_audit_events_team_alias_id_fkey'
      and c.contype = 'f'
  ) <> 1 or (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.confrelid = v_team_aliases_oid
      and c.conkey = array[v_audit_team_alias_id_attnum]::smallint[]
      and c.confkey = array[v_team_aliases_id_attnum]::smallint[]
      and c.confdeltype = 'r'
      and c.confupdtype = 'a'
      and c.confmatchtype = 's'
      and not c.condeferrable
      and not c.condeferred
      and c.convalidated
  ) <> 1 then
    raise exception 'postflight_alias_foreign_key_changed'
      using errcode = '55000';
  end if;

  select array_agg(c.conname order by c.conname)
  into v_check_names
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'c';

  if v_check_names is distinct from array[
    'team_aliases_alias_not_blank_check',
    'team_aliases_created_by_not_blank_check',
    'team_aliases_normalized_alias_format_check',
    'team_aliases_normalized_alias_not_blank_check',
    'team_aliases_normalized_alias_v1_check',
    'team_aliases_source_not_blank_check',
    'team_aliases_status_check',
    'team_aliases_updated_by_not_blank_check'
  ]::text[] then
    raise exception 'postflight_team_aliases_check_constraints_changed: %', v_check_names
      using errcode = '55000';
  end if;

  select array_agg(c.conname order by c.conname)
  into v_check_names
  from pg_catalog.pg_constraint c
  where c.conrelid = v_audit_oid
    and c.contype = 'c';

  if v_check_names is distinct from array[
    'team_alias_audit_events_action_check',
    'team_alias_audit_events_actor_reference_not_blank_check',
    'team_alias_audit_events_actor_type_not_blank_check',
    'team_alias_audit_events_source_not_blank_check'
  ]::text[] then
    raise exception 'postflight_audit_check_constraints_changed: %', v_check_names
      using errcode = '55000';
  end if;

  with normalized_checks as (
    select
      c.conrelid,
      c.conname,
      regexp_replace(
        replace(
          regexp_replace(
            pg_catalog.pg_get_expr(c.conbin, c.conrelid, true),
            '[[:space:]]+',
            '',
            'g'
          ),
          'public.normalize_team_identity_v1(',
          'normalize_team_identity_v1('
        ),
        '^\((.*)\)$',
        '\1'
      ) as normalized_definition
    from pg_catalog.pg_constraint c
    where c.conrelid in (v_team_aliases_oid, v_audit_oid)
      and c.contype = 'c'
  )
  select array_agg(
    n.conname || ':' || n.normalized_definition
    order by n.conname
  )
  into v_check_definitions
  from normalized_checks n
  where n.conrelid = v_team_aliases_oid;

  if v_check_definitions is distinct from array[
    $definition$team_aliases_alias_not_blank_check:btrim(alias)<>''::text$definition$,
    $definition$team_aliases_created_by_not_blank_check:btrim(created_by)<>''::text$definition$,
    $definition$team_aliases_normalized_alias_format_check:normalized_alias~'^[a-z0-9]+(-[a-z0-9]+)*$'::text$definition$,
    $definition$team_aliases_normalized_alias_not_blank_check:btrim(normalized_alias)<>''::text$definition$,
    $definition$team_aliases_normalized_alias_v1_check:normalized_alias=normalize_team_identity_v1(alias)$definition$,
    $definition$team_aliases_source_not_blank_check:btrim(source)<>''::text$definition$,
    $definition$team_aliases_status_check:status=ANY(ARRAY['active'::text,'inactive'::text])$definition$,
    $definition$team_aliases_updated_by_not_blank_check:btrim(updated_by)<>''::text$definition$
  ]::text[] then
    raise exception 'postflight_team_aliases_check_definitions_changed: %',
      v_check_definitions
      using errcode = '55000';
  end if;

  with normalized_checks as (
    select
      c.conname,
      regexp_replace(
        replace(
          regexp_replace(
            pg_catalog.pg_get_expr(c.conbin, c.conrelid, true),
            '[[:space:]]+',
            '',
            'g'
          ),
          'public.normalize_team_identity_v1(',
          'normalize_team_identity_v1('
        ),
        '^\((.*)\)$',
        '\1'
      ) as normalized_definition
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'c'
  )
  select array_agg(
    n.conname || ':' || n.normalized_definition
    order by n.conname
  )
  into v_check_definitions
  from normalized_checks n;

  if v_check_definitions is distinct from array[
    $definition$team_alias_audit_events_action_check:action=ANY(ARRAY['create'::text,'update'::text,'deactivate'::text,'reactivate'::text])$definition$,
    $definition$team_alias_audit_events_actor_reference_not_blank_check:btrim(actor_reference)<>''::text$definition$,
    $definition$team_alias_audit_events_actor_type_not_blank_check:btrim(actor_type)<>''::text$definition$,
    $definition$team_alias_audit_events_source_not_blank_check:btrim(source)<>''::text$definition$
  ]::text[] then
    raise exception 'postflight_audit_check_definitions_changed: %',
      v_check_definitions
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_depend dependency
      on dependency.classid = 'pg_catalog.pg_constraint'::regclass
     and dependency.objid = c.oid
     and dependency.objsubid = 0
     and dependency.refclassid = 'pg_catalog.pg_proc'::regclass
     and dependency.refobjid = v_normalize_oid
     and dependency.deptype = 'n'
    where c.conrelid = v_team_aliases_oid
      and c.conname = 'team_aliases_normalized_alias_v1_check'
      and c.contype = 'c'
  ) then
    raise exception 'postflight_normalized_alias_check_function_dependency_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_depend dependency
      on dependency.classid = 'pg_catalog.pg_constraint'::regclass
     and dependency.objid = c.oid
     and dependency.objsubid = 0
     and dependency.refclassid = 'pg_catalog.pg_proc'::regclass
    where c.conrelid in (v_team_aliases_oid, v_audit_oid)
      and c.contype = 'c'
      and (
        dependency.deptype <> 'n'
        or not (
          (
            c.conname in (
              'team_aliases_alias_not_blank_check',
              'team_aliases_created_by_not_blank_check',
              'team_aliases_normalized_alias_not_blank_check',
              'team_aliases_source_not_blank_check',
              'team_aliases_updated_by_not_blank_check',
              'team_alias_audit_events_actor_reference_not_blank_check',
              'team_alias_audit_events_actor_type_not_blank_check',
              'team_alias_audit_events_source_not_blank_check'
            )
            and dependency.refobjid = v_btrim_text_oid
          )
          or (
            c.conname = 'team_aliases_normalized_alias_v1_check'
            and dependency.refobjid = v_normalize_oid
          )
        )
      )
  ) then
    raise exception 'postflight_alias_check_function_dependency_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_depend dependency
      on dependency.classid = 'pg_catalog.pg_constraint'::regclass
     and dependency.objid = c.oid
     and dependency.objsubid = 0
     and dependency.refclassid = 'pg_catalog.pg_operator'::regclass
    where c.conrelid in (v_team_aliases_oid, v_audit_oid)
      and c.contype = 'c'
      and (
        dependency.deptype <> 'n'
        or not (
          (
            c.conname in (
              'team_aliases_alias_not_blank_check',
              'team_aliases_created_by_not_blank_check',
              'team_aliases_normalized_alias_not_blank_check',
              'team_aliases_source_not_blank_check',
              'team_aliases_updated_by_not_blank_check',
              'team_alias_audit_events_actor_reference_not_blank_check',
              'team_alias_audit_events_actor_type_not_blank_check',
              'team_alias_audit_events_source_not_blank_check'
            )
            and dependency.refobjid = v_text_not_equal_oid
          )
          or (
            c.conname = 'team_aliases_normalized_alias_format_check'
            and dependency.refobjid = v_text_regex_oid
          )
          or (
            c.conname in (
              'team_aliases_normalized_alias_v1_check',
              'team_aliases_status_check',
              'team_alias_audit_events_action_check'
            )
            and dependency.refobjid = v_text_equal_oid
          )
        )
      )
  ) then
    raise exception 'postflight_alias_check_operator_dependency_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid in (v_team_aliases_oid, v_audit_oid)
      and c.contype in ('c', 'f')
      and (
        not c.convalidated
        or c.connoinherit
        or c.condeferrable
        or c.condeferred
      )
  ) then
    raise exception 'postflight_alias_constraint_not_validated'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_index i
    where i.indrelid = v_team_aliases_oid
  ) <> 4 or (
    select count(*)
    from pg_catalog.pg_index i
    where i.indrelid = v_audit_oid
  ) <> 3 then
    raise exception 'postflight_alias_index_count_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_index i
    join pg_catalog.pg_class index_class on index_class.oid = i.indexrelid
    join pg_catalog.pg_am am on am.oid = index_class.relam
    where i.indrelid in (v_team_aliases_oid, v_audit_oid)
      and (not i.indisvalid or not i.indisready or am.amname <> 'btree')
  ) then
    raise exception 'postflight_alias_index_state_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (values
      (
        'team_aliases_pkey'::text,
        v_team_aliases_oid,
        v_team_aliases_id_attnum::text,
        '0'::text,
        1,
        true,
        true,
        false,
        null::text[]
      ),
      (
        'team_aliases_normalized_alias_key'::text,
        v_team_aliases_oid,
        v_team_aliases_normalized_alias_attnum::text,
        '0'::text,
        1,
        true,
        false,
        false,
        null::text[]
      ),
      (
        'team_aliases_team_id_idx'::text,
        v_team_aliases_oid,
        v_team_aliases_team_id_attnum::text,
        '0'::text,
        1,
        false,
        false,
        false,
        null::text[]
      ),
      (
        'team_aliases_team_status_normalized_idx'::text,
        v_team_aliases_oid,
        format(
          '%s %s %s',
          v_team_aliases_team_id_attnum,
          v_team_aliases_status_attnum,
          v_team_aliases_normalized_alias_attnum
        ),
        '0 0 0'::text,
        3,
        false,
        false,
        false,
        null::text[]
      ),
      (
        'team_alias_audit_events_pkey'::text,
        v_audit_oid,
        v_audit_id_attnum::text,
        '0'::text,
        1,
        true,
        true,
        false,
        null::text[]
      ),
      (
        'team_alias_audit_events_team_alias_created_at_idx'::text,
        v_audit_oid,
        format('%s %s', v_audit_team_alias_id_attnum, v_audit_created_at_attnum),
        '0 0'::text,
        2,
        false,
        false,
        false,
        null::text[]
      ),
      (
        'team_alias_audit_events_created_at_idx'::text,
        v_audit_oid,
        v_audit_created_at_attnum::text,
        '0'::text,
        1,
        false,
        false,
        false,
        null::text[]
      )
    ) expected(
      index_name,
      table_oid,
      indkey_text,
      indoption_text,
      key_count,
      is_unique,
      is_primary,
      nulls_not_distinct,
      relation_options
    )
    left join pg_catalog.pg_namespace n on n.nspname = 'public'
    left join pg_catalog.pg_class index_class
      on index_class.relnamespace = n.oid
     and index_class.relname = expected.index_name
    left join pg_catalog.pg_index i
      on i.indexrelid = index_class.oid
     and i.indrelid = expected.table_oid
     and index_class.relkind = 'i'
     and index_class.relpersistence = 'p'
     and pg_catalog.pg_get_userbyid(index_class.relowner) = 'postgres'
     and index_class.relam = (
       select am.oid from pg_catalog.pg_am am where am.amname = 'btree'
     )
     and i.indisvalid
     and i.indisready
     and i.indislive
     and not i.indcheckxmin
     and i.indimmediate
     and not i.indisclustered
     and not i.indisreplident
     and not i.indisexclusion
     and i.indisunique = expected.is_unique
     and i.indisprimary = expected.is_primary
     and i.indnullsnotdistinct = expected.nulls_not_distinct
     and index_class.reloptions is not distinct from expected.relation_options
     and i.indnkeyatts = expected.key_count
     and i.indnatts = expected.key_count
     and i.indpred is null
     and i.indexprs is null
     and i.indkey::text = expected.indkey_text
     and i.indoption::text = expected.indoption_text
     and not exists (
       select 1
       from unnest(
         i.indkey::smallint[],
         i.indclass::oid[],
         i.indcollation::oid[],
         i.indoption::smallint[]
       ) with ordinality as key_part(
         attnum,
         opclass_oid,
         collation_oid,
         option_bits,
         ordinal_position
       )
       left join pg_catalog.pg_attribute table_attribute
         on table_attribute.attrelid = i.indrelid
        and table_attribute.attnum = key_part.attnum
        and not table_attribute.attisdropped
       left join pg_catalog.pg_opclass operator_class
         on operator_class.oid = key_part.opclass_oid
       where table_attribute.attnum is null
          or operator_class.oid is null
          or not operator_class.opcdefault
          or operator_class.opcmethod <> index_class.relam
          or operator_class.opcintype <> table_attribute.atttypid
          or key_part.collation_oid <> table_attribute.attcollation
          or key_part.option_bits <> 0
     )
    where i.indexrelid is null
  ) then
    raise exception 'postflight_alias_index_definition_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid in (v_team_aliases_oid, v_audit_oid)
      and not t.tgisinternal
  ) then
    raise exception 'postflight_unexpected_alias_table_trigger_found'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_trigger t
    join pg_catalog.pg_constraint c on c.oid = t.tgconstraint
    where c.conrelid in (v_team_aliases_oid, v_audit_oid)
      and c.contype = 'f'
  ) <> 8 or exists (
    select 1
    from (values
      (
        v_team_aliases_oid,
        'team_aliases_team_id_fkey'::text,
        'RI_FKey_check_ins'::text,
        true,
        5::smallint
      ),
      (
        v_team_aliases_oid,
        'team_aliases_team_id_fkey',
        'RI_FKey_check_upd',
        true,
        17::smallint
      ),
      (
        v_team_aliases_oid,
        'team_aliases_team_id_fkey',
        'RI_FKey_restrict_del',
        false,
        9::smallint
      ),
      (
        v_team_aliases_oid,
        'team_aliases_team_id_fkey',
        'RI_FKey_noaction_upd',
        false,
        17::smallint
      ),
      (
        v_audit_oid,
        'team_alias_audit_events_team_alias_id_fkey',
        'RI_FKey_check_ins',
        true,
        5::smallint
      ),
      (
        v_audit_oid,
        'team_alias_audit_events_team_alias_id_fkey',
        'RI_FKey_check_upd',
        true,
        17::smallint
      ),
      (
        v_audit_oid,
        'team_alias_audit_events_team_alias_id_fkey',
        'RI_FKey_restrict_del',
        false,
        9::smallint
      ),
      (
        v_audit_oid,
        'team_alias_audit_events_team_alias_id_fkey',
        'RI_FKey_noaction_upd',
        false,
        17::smallint
      )
    ) expected(
      constraint_table_oid,
      constraint_name,
      function_name,
      on_child_table,
      trigger_type
    )
    left join pg_catalog.pg_constraint c
      on c.conrelid = expected.constraint_table_oid
     and c.conname = expected.constraint_name
     and c.contype = 'f'
    left join pg_catalog.pg_trigger t
      on t.tgconstraint = c.oid
     and t.tgrelid = case
       when expected.on_child_table then c.conrelid
       else c.confrelid
     end
     and t.tgtype = expected.trigger_type
     and t.tgisinternal
     and t.tgenabled = 'O'
      and t.tgparentid = 0
      and t.tgnargs = 0
      and t.tgconstrrelid = case
        when expected.on_child_table then c.confrelid
        else c.conrelid
      end
      and t.tgconstrindid = c.conindid
      and pg_catalog.cardinality(t.tgattr::smallint[]) = 0
      and pg_catalog.octet_length(t.tgargs) = 0
      and t.tgqual is null
      and t.tgdeferrable = c.condeferrable
     and t.tginitdeferred = c.condeferred
     and t.tgoldtable is null
     and t.tgnewtable is null
    left join pg_catalog.pg_proc trigger_function
      on trigger_function.oid = t.tgfoid
     and trigger_function.proname = expected.function_name
     and trigger_function.pronamespace = 'pg_catalog'::regnamespace
    where trigger_function.oid is null
  ) or exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid in (v_team_aliases_oid, v_audit_oid)
      and t.tgisinternal
      and not exists (
        select 1
        from pg_catalog.pg_constraint c
        where c.oid = t.tgconstraint
          and c.conrelid in (v_team_aliases_oid, v_audit_oid)
          and c.contype = 'f'
      )
  ) then
    raise exception 'postflight_alias_internal_fk_triggers_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid in (v_team_aliases_oid, v_audit_oid)
      and (
        acl.grantee not in (c.relowner, v_service_role_oid)
        or (
          acl.grantee = v_service_role_oid
          and (acl.privilege_type <> 'SELECT' or acl.is_grantable)
        )
      )
  ) or exists (
    select 1
    from pg_catalog.pg_class c
    where c.oid in (v_team_aliases_oid, v_audit_oid)
      and pg_catalog.pg_get_userbyid(c.relowner) <> 'postgres'
  ) or exists (
    select 1
    from (values (v_team_aliases_oid), (v_audit_oid)) protected_table(table_oid)
    where not exists (
      select 1
      from pg_catalog.pg_class c
      cross join lateral pg_catalog.aclexplode(
        coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
      ) acl
      where c.oid = protected_table.table_oid
        and acl.grantee = v_service_role_oid
        and acl.privilege_type = 'SELECT'
        and not acl.is_grantable
    )
  ) then
    raise exception 'postflight_alias_table_acl_changed'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_attribute column_attribute
    where column_attribute.attrelid in (v_team_aliases_oid, v_audit_oid)
      and column_attribute.attnum > 0
      and not column_attribute.attisdropped
      and column_attribute.attacl is not null
  ) then
    raise exception 'postflight_alias_column_acl_changed'
      using errcode = '42501';
  end if;

  if not (
    select c.relrowsecurity and not c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_team_aliases_oid
  ) or not (
    select c.relrowsecurity and not c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_audit_oid
  ) or exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid in (v_team_aliases_oid, v_audit_oid)
  ) then
    raise exception 'postflight_alias_table_security_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    left join public.teams t on t.id = a.team_id
    where t.id is null
  ) or exists (
    select 1
    from public.team_aliases a
    where a.status not in ('active', 'inactive')
       or a.normalized_alias is distinct from public.normalize_team_identity_v1(a.alias)
  ) or exists (
    select 1
    from public.team_alias_audit_events e
    where e.action not in ('create', 'update', 'deactivate', 'reactivate')
  ) then
    raise exception 'postflight_alias_data_integrity_changed'
      using errcode = '55000';
  end if;
end
$postflight$;

-- Fingerprint estrutural deterministico das duas tabelas protegidas. As
-- assercoes acima fixam o baseline; este valor facilita a evidencia operacional.
select
  'alias_tables_structure'::text as object_name,
  md5(
    jsonb_build_object(
      'columns', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', c.table_name,
              'ordinal', c.ordinal_position,
              'name', c.column_name,
              'type', c.data_type,
              'nullable', c.is_nullable,
              'default', c.column_default
            )
            order by c.table_name, c.ordinal_position
          ),
          '[]'::jsonb
        )
        from information_schema.columns c
        where c.table_schema = 'public'
          and c.table_name in ('team_aliases', 'team_alias_audit_events')
      ),
      'constraints', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', table_class.relname,
              'name', c.conname,
              'type', c.contype,
              'columns', c.conkey,
              'referenced_table', referenced_class.relname,
              'referenced_columns', c.confkey,
              'on_update', c.confupdtype,
              'on_delete', c.confdeltype,
              'match_type', c.confmatchtype,
              'deferrable', c.condeferrable,
              'initially_deferred', c.condeferred,
              'validated', c.convalidated,
              'no_inherit', c.connoinherit,
              'definition', pg_catalog.pg_get_constraintdef(c.oid, true)
            )
            order by table_class.relname, c.conname
          ),
          '[]'::jsonb
        )
        from pg_catalog.pg_constraint c
        join pg_catalog.pg_class table_class on table_class.oid = c.conrelid
        left join pg_catalog.pg_class referenced_class on referenced_class.oid = c.confrelid
        where c.conrelid in (
          'public.team_aliases'::regclass,
          'public.team_alias_audit_events'::regclass
        )
      ),
      'indexes', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', table_class.relname,
              'name', index_class.relname,
              'method', access_method.amname,
              'unique', i.indisunique,
              'primary', i.indisprimary,
              'nulls_not_distinct', i.indnullsnotdistinct,
              'key_count', i.indnkeyatts,
              'attribute_count', i.indnatts,
              'keys', i.indkey::text,
              'options', i.indoption::text,
              'relation_options', index_class.reloptions,
              'valid', i.indisvalid,
              'ready', i.indisready,
              'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
            )
            order by table_class.relname, index_class.relname
          ),
          '[]'::jsonb
        )
        from pg_catalog.pg_index i
        join pg_catalog.pg_class index_class on index_class.oid = i.indexrelid
        join pg_catalog.pg_class table_class on table_class.oid = i.indrelid
        join pg_catalog.pg_am access_method on access_method.oid = index_class.relam
        where i.indrelid in (
          'public.team_aliases'::regclass,
          'public.team_alias_audit_events'::regclass
        )
      ),
      'security', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', c.relname,
              'owner', pg_catalog.pg_get_userbyid(c.relowner),
              'rls', c.relrowsecurity,
              'force_rls', c.relforcerowsecurity,
              'acl', c.relacl
            )
            order by c.relname
          ),
          '[]'::jsonb
        )
        from pg_catalog.pg_class c
        where c.oid in (
          'public.team_aliases'::regclass,
          'public.team_alias_audit_events'::regclass
        )
      ),
      'column_acls', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', table_class.relname,
              'column', column_attribute.attname,
              'acl', column_attribute.attacl
            )
            order by table_class.relname, column_attribute.attnum
          ),
          '[]'::jsonb
        )
        from pg_catalog.pg_attribute column_attribute
        join pg_catalog.pg_class table_class
          on table_class.oid = column_attribute.attrelid
        where column_attribute.attrelid in (
          'public.team_aliases'::regclass,
          'public.team_alias_audit_events'::regclass
        )
          and column_attribute.attnum > 0
          and not column_attribute.attisdropped
      ),
      'policies', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', table_class.relname,
              'name', p.polname,
              'command', p.polcmd,
              'permissive', p.polpermissive,
              'roles', p.polroles,
              'qual', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
              'with_check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
            )
            order by table_class.relname, p.polname
          ),
          '[]'::jsonb
        )
        from pg_catalog.pg_policy p
        join pg_catalog.pg_class table_class on table_class.oid = p.polrelid
        where p.polrelid in (
          'public.team_aliases'::regclass,
          'public.team_alias_audit_events'::regclass
        )
      ),
      'triggers', (
        select coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table', table_class.relname,
              'constraint', c.conname,
              'function', trigger_function.proname,
              'type', t.tgtype,
              'internal', t.tgisinternal,
              'enabled', t.tgenabled,
              'related_table', related_table.relname,
              'constraint_index', constraint_index.relname,
              'deferrable', t.tgdeferrable,
              'initially_deferred', t.tginitdeferred,
              'attributes', t.tgattr::text,
              'arguments', pg_catalog.encode(t.tgargs, 'hex'),
              'qualifier', t.tgqual::text
            )
            order by table_class.relname, c.conname, trigger_function.proname, t.tgtype
          ),
          '[]'::jsonb
        )
        from pg_catalog.pg_trigger t
        join pg_catalog.pg_class table_class on table_class.oid = t.tgrelid
        join pg_catalog.pg_constraint c on c.oid = t.tgconstraint
        join pg_catalog.pg_proc trigger_function on trigger_function.oid = t.tgfoid
        left join pg_catalog.pg_class related_table on related_table.oid = t.tgconstrrelid
        left join pg_catalog.pg_class constraint_index on constraint_index.oid = t.tgconstrindid
        where c.conrelid in (
          'public.team_aliases'::regclass,
          'public.team_alias_audit_events'::regclass
        )
          and c.contype = 'f'
      )
    )::text
  ) as structure_md5;

-- Estes fingerprints devem coincidir byte a byte com o output do preflight.
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
