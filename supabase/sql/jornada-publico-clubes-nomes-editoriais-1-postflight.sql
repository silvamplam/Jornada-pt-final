-- JORNADA-PUBLICO-CLUBES-NOMES-EDITORIAIS-1
-- SQL 3/4 - POSTFLIGHT READ-ONLY
--
-- Valida schema, seguranca, ausencia de backfill e preservacao logica. Os
-- valores de contagem/checksum emitidos devem coincidir com o PREFLIGHT.

begin;
set transaction read only;

do $postflight$
declare
  v_teams_oid oid := to_regclass('public.teams');
  v_audit_oid oid := to_regclass('public.team_public_name_audit_events');
  v_manage_oid oid := to_regprocedure('public.manage_team_public_name(uuid,text,text,text,text,text)');
  v_count bigint;
  v_checksum text;
  v_column_default text;
  v_created_at_default text;
  v_comment text;
  v_constraint_definition text;
  v_audit_columns text[];
begin
  if v_teams_oid is null or v_audit_oid is null or v_manage_oid is null then
    raise exception 'postflight_required_object_missing' using errcode = '55000';
  end if;

  if not has_table_privilege('service_role', v_teams_oid, 'SELECT')
     or not has_table_privilege('service_role', v_teams_oid, 'INSERT')
     or not has_table_privilege('service_role', v_teams_oid, 'UPDATE')
     or not has_table_privilege('service_role', v_teams_oid, 'DELETE')
     or not has_table_privilege('anon', v_teams_oid, 'SELECT')
     or has_table_privilege('anon', v_teams_oid, 'INSERT')
     or has_table_privilege('anon', v_teams_oid, 'UPDATE')
     or has_table_privilege('anon', v_teams_oid, 'DELETE')
     or has_table_privilege('authenticated', v_teams_oid, 'SELECT')
     or has_table_privilege('authenticated', v_teams_oid, 'INSERT')
     or has_table_privilege('authenticated', v_teams_oid, 'UPDATE')
     or has_table_privilege('authenticated', v_teams_oid, 'DELETE') then
    raise exception 'postflight_teams_privileges_unexpected' using errcode = '42501';
  end if;

  select c.column_default
  into v_column_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'teams'
    and c.column_name = 'public_name'
    and c.data_type = 'text'
    and c.is_nullable = 'YES';

  if not found or v_column_default is not null then
    raise exception 'postflight_public_name_column_unexpected' using errcode = '55000';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid, true)
  into v_constraint_definition
  from pg_catalog.pg_constraint c
  where c.conrelid = v_teams_oid
    and c.conname = 'teams_public_name_valid_check'
    and c.contype = 'c'
    and c.convalidated;

  if v_constraint_definition is null
     or position('public_name IS NULL' in v_constraint_definition) = 0
     or position('public_name = btrim(public_name)' in v_constraint_definition) = 0
     or position('char_length(public_name) >= 1' in v_constraint_definition) = 0
     or position('char_length(public_name) <= 80' in v_constraint_definition) = 0
     or position('[[:cntrl:]]' in v_constraint_definition) = 0 then
    raise exception 'postflight_public_name_constraint_unexpected: %', v_constraint_definition
      using errcode = '55000';
  end if;

  select pg_catalog.col_description(v_teams_oid, a.attnum)
  into v_comment
  from pg_catalog.pg_attribute a
  where a.attrelid = v_teams_oid
    and a.attname = 'public_name'
    and a.attnum > 0
    and not a.attisdropped;

  if v_comment is distinct from
    'Nome editorial usado na apresentação pública do clube. Não é uma sigla nem um alias e não deve ser usado para resolução canónica.' then
    raise exception 'postflight_public_name_comment_unexpected' using errcode = '55000';
  end if;

  select array_agg(
    c.column_name || ':' || c.data_type || ':' || c.is_nullable
    order by c.ordinal_position
  )
  into v_audit_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_public_name_audit_events';

  if v_audit_columns is distinct from array[
    'id:uuid:NO',
    'team_id:uuid:NO',
    'action:text:NO',
    'actor_type:text:NO',
    'actor_reference:text:NO',
    'source:text:NO',
    'before_state:jsonb:NO',
    'after_state:jsonb:NO',
    'request_reference:text:NO',
    'created_at:timestamp with time zone:NO'
  ]::text[] then
    raise exception 'postflight_audit_columns_unexpected: %', v_audit_columns
      using errcode = '55000';
  end if;

  select c.column_default
  into v_column_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_public_name_audit_events'
    and c.column_name = 'id';

  select c.column_default
  into v_created_at_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_public_name_audit_events'
    and c.column_name = 'created_at';

  if v_column_default is null
     or position('gen_random_uuid()' in v_column_default) = 0
     or v_created_at_default is null
     or position('now()' in v_created_at_default) = 0 then
    raise exception 'postflight_audit_defaults_unexpected' using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'p'
      and c.conkey = array[
        (
          select a.attnum::smallint
          from pg_catalog.pg_attribute a
          where a.attrelid = v_audit_oid
            and a.attname = 'id'
            and a.attnum > 0
            and not a.attisdropped
        )
      ]::smallint[]
  ) <> 1 then
    raise exception 'postflight_audit_primary_key_unexpected' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.contype = 'f'
      and c.confrelid = v_teams_oid
      and c.confdeltype = 'r'
      and c.conname = 'team_public_name_audit_events_team_id_fkey'
      and c.conkey = array[
        (
          select a.attnum::smallint
          from pg_catalog.pg_attribute a
          where a.attrelid = v_audit_oid
            and a.attname = 'team_id'
            and a.attnum > 0
            and not a.attisdropped
        )
      ]::smallint[]
      and c.confkey = array[
        (
          select a.attnum::smallint
          from pg_catalog.pg_attribute a
          where a.attrelid = v_teams_oid
            and a.attname = 'id'
            and a.attnum > 0
            and not a.attisdropped
        )
      ]::smallint[]
  ) then
    raise exception 'postflight_audit_fk_unexpected' using errcode = '55000';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_audit_oid
      and c.conname in (
        'team_public_name_audit_events_action_check',
        'team_public_name_audit_events_actor_type_not_blank_check',
        'team_public_name_audit_events_actor_reference_not_blank_check',
        'team_public_name_audit_events_source_not_blank_check',
        'team_public_name_audit_events_request_reference_not_blank_check',
        'team_public_name_audit_events_before_state_object_check',
        'team_public_name_audit_events_after_state_object_check'
      )
      and c.contype = 'c'
      and c.convalidated
  ) <> 7 then
    raise exception 'postflight_audit_constraints_unexpected' using errcode = '55000';
  end if;

  select pg_catalog.pg_get_constraintdef(c.oid, true)
  into v_constraint_definition
  from pg_catalog.pg_constraint c
  where c.conrelid = v_audit_oid
    and c.conname = 'team_public_name_audit_events_action_check';

  if v_constraint_definition is null
     or position('set' in v_constraint_definition) = 0
     or position('update' in v_constraint_definition) = 0
     or position('clear' in v_constraint_definition) = 0 then
    raise exception 'postflight_audit_action_constraint_unexpected: %', v_constraint_definition
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_indexes i
    where i.schemaname = 'public'
      and i.indexname = 'team_public_name_audit_events_team_created_at_idx'
      and i.indexdef like '%(team_id, created_at DESC)%'
  ) or not exists (
    select 1
    from pg_catalog.pg_indexes i
    where i.schemaname = 'public'
      and i.indexname = 'team_public_name_audit_events_created_at_idx'
      and i.indexdef like '%(created_at DESC)%'
  ) then
    raise exception 'postflight_audit_indexes_unexpected' using errcode = '55000';
  end if;

  if not (
    select c.relrowsecurity and not c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_audit_oid
  ) or exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = v_audit_oid
  ) then
    raise exception 'postflight_audit_rls_unexpected' using errcode = '55000';
  end if;

  if not has_table_privilege('service_role', v_audit_oid, 'SELECT')
     or has_table_privilege('service_role', v_audit_oid, 'INSERT')
     or has_table_privilege('service_role', v_audit_oid, 'UPDATE')
     or has_table_privilege('service_role', v_audit_oid, 'DELETE')
     or has_table_privilege('anon', v_audit_oid, 'SELECT')
     or has_table_privilege('anon', v_audit_oid, 'INSERT')
     or has_table_privilege('anon', v_audit_oid, 'UPDATE')
     or has_table_privilege('anon', v_audit_oid, 'DELETE')
     or has_table_privilege('authenticated', v_audit_oid, 'SELECT')
     or has_table_privilege('authenticated', v_audit_oid, 'INSERT')
     or has_table_privilege('authenticated', v_audit_oid, 'UPDATE')
     or has_table_privilege('authenticated', v_audit_oid, 'DELETE') then
    raise exception 'postflight_audit_privileges_unexpected' using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    cross join lateral pg_catalog.aclexplode(
      coalesce(c.relacl, pg_catalog.acldefault('r', c.relowner))
    ) acl
    where c.oid = v_audit_oid
      and acl.grantee = 0
  ) then
    raise exception 'postflight_public_audit_privilege_found' using errcode = '42501';
  end if;

  if (
    select count(*)
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_public_name'
  ) <> 1 then
    raise exception 'postflight_manage_rpc_overload_unexpected' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_manage_oid
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.prosecdef
      and p.proconfig @> array['search_path=pg_catalog']::text[]
      and pg_catalog.pg_get_function_result(p.oid) =
        'TABLE(result_team_id uuid, result_public_name text, result_changed boolean, result_audit_event_id uuid)'
  ) then
    raise exception 'postflight_manage_rpc_contract_unexpected' using errcode = '55000';
  end if;

  if not has_function_privilege('service_role', v_manage_oid, 'EXECUTE')
     or has_function_privilege('anon', v_manage_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_manage_oid, 'EXECUTE') then
    raise exception 'postflight_manage_rpc_privileges_unexpected' using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_manage_oid
      and acl.grantee = 0
      and acl.privilege_type = 'EXECUTE'
  ) then
    raise exception 'postflight_public_manage_rpc_execute_found' using errcode = '42501';
  end if;

  if exists (select 1 from public.teams t where t.public_name is not null) then
    raise exception 'postflight_unexpected_public_name_backfill' using errcode = '55000';
  end if;

  if exists (select 1 from public.team_public_name_audit_events) then
    raise exception 'postflight_unexpected_audit_event' using errcode = '55000';
  end if;

  select
    count(*),
    md5(coalesce(string_agg(md5((to_jsonb(t) - 'public_name')::text), '' order by t.id::text), ''))
  into v_count, v_checksum
  from public.teams t;

  if v_count = 0 then
    raise exception 'postflight_team_count_unexpected_zero' using errcode = '55000';
  end if;

  raise notice 'postflight_team_count=%', v_count;
  raise notice 'postflight_team_checksum=%', v_checksum;
  raise notice 'postflight_ready: compare count/checksum with PREFLIGHT notices';
end
$postflight$;

commit;
