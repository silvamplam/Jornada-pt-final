-- Jornada.pt - criacao transacional de clubes em lote.
-- Preflight exclusivamente read-only. Executar antes do script aplicar.

do $preflight$
declare
  v_expected_signature constant text :=
    'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)';
  v_batch_oid oid := to_regprocedure(v_expected_signature);
  v_columns jsonb;
begin
  if current_setting('server_version_num')::integer < 140000 then
    raise exception 'preflight_postgresql_14_or_newer_required'
      using errcode = '55000';
  end if;

  if not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'service_role'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'anon'
  ) or not exists (
    select 1 from pg_catalog.pg_roles where rolname = 'authenticated'
  ) then
    raise exception 'preflight_expected_supabase_roles_missing'
      using errcode = '42704';
  end if;

  if to_regclass('public.teams') is null
     or to_regclass('public.countries') is null
     or to_regclass('public.team_aliases') is null
     or to_regclass('public.team_alias_audit_events') is null
     or to_regclass('public.team_public_name_audit_events') is null
     or to_regclass('public.season_teams') is null then
    raise exception 'preflight_required_table_missing'
      using errcode = '42P01';
  end if;

  select jsonb_agg(
    jsonb_build_object(
      'column', c.column_name,
      'type', c.data_type,
      'udt', c.udt_name,
      'nullable', c.is_nullable,
      'default', c.column_default
    ) order by c.ordinal_position
  )
  into v_columns
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'teams'
    and c.column_name in (
      'id', 'name', 'public_name', 'short_name', 'code', 'slug',
      'country_id', 'logo_url', 'primary_color', 'data_source',
      'sync_status', 'created_at'
    );

  if exists (
    with expected_columns(
      column_name,
      data_type,
      udt_name,
      is_nullable,
      default_policy
    ) as (
      values
        ('id', 'uuid', 'uuid', 'NO', 'generated_uuid'),
        ('name', 'text', 'text', 'NO', 'no_default'),
        ('public_name', 'text', 'text', 'YES', 'no_default'),
        ('short_name', 'text', 'text', 'NO', 'no_default'),
        ('code', 'text', 'text', 'YES', 'no_default'),
        ('slug', 'text', 'text', 'NO', 'no_default'),
        ('country_id', 'uuid', 'uuid', 'YES', 'no_default'),
        ('logo_url', 'text', 'text', 'YES', 'no_default'),
        ('primary_color', 'text', 'text', 'YES', 'no_default'),
        ('data_source', 'text', 'text', 'NO', 'manual_text'),
        ('sync_status', 'text', 'text', 'NO', 'manual_text'),
        ('created_at', 'timestamp with time zone', 'timestamptz', 'NO', 'current_time')
    )
    select 1
    from expected_columns e
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'teams'
     and c.column_name = e.column_name
    where c.column_name is null
       or c.data_type is distinct from e.data_type
       or c.udt_name is distinct from e.udt_name
       or c.is_nullable is distinct from e.is_nullable
       or case e.default_policy
         when 'generated_uuid' then
           coalesce(
             regexp_replace(
               lower(c.column_default),
               '[[:space:]]',
               '',
               'g'
             ),
             ''
           ) !~ '^(public\.|extensions\.)?gen_random_uuid\(\)$'
         when 'manual_text' then
           coalesce(
             regexp_replace(
               lower(c.column_default),
               '[()[:space:]]',
               '',
               'g'
             ),
             ''
           ) <> '''manual''::text'
         when 'current_time' then
           coalesce(
             regexp_replace(
               lower(c.column_default),
               '[[:space:]]',
               '',
               'g'
             ),
             ''
           ) not in ('now()', 'current_timestamp')
         when 'no_default' then c.column_default is not null
         else false
       end
  ) then
    raise exception 'preflight_teams_contract_incompatible: %', v_columns
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.teams'::regclass
      and c.contype in ('p', 'u')
      and c.conkey = array[
        (select a.attnum from pg_catalog.pg_attribute a
         where a.attrelid = 'public.teams'::regclass and a.attname = 'slug')
      ]::smallint[]
  ) then
    raise exception 'preflight_teams_slug_global_unique_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.teams'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.countries'::regclass
      and c.conkey = array[
        (select a.attnum from pg_catalog.pg_attribute a
         where a.attrelid = 'public.teams'::regclass and a.attname = 'country_id')
      ]::smallint[]
  ) then
    raise exception 'preflight_teams_country_id_fk_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.teams'::regclass
      and c.conname = 'teams_public_name_valid_check'
      and c.contype = 'c'
  ) then
    raise exception 'preflight_teams_public_name_policy_missing'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'countries'
      and c.column_name = 'id'
      and c.udt_name = 'uuid'
      and c.is_nullable = 'NO'
  ) or not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'countries'
      and c.column_name = 'is_active'
      and c.udt_name = 'bool'
      and c.is_nullable = 'NO'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.countries'::regclass
      and c.contype = 'p'
  ) then
    raise exception 'preflight_countries_identity_contract_incompatible'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_aliases'
      and c.column_name in (
        'id', 'team_id', 'alias', 'normalized_alias', 'source', 'status',
        'created_by', 'updated_by', 'created_at', 'updated_at'
      )
    group by c.table_schema, c.table_name
    having count(*) <> 10
  ) or (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_aliases'
      and c.column_name in (
        'id', 'team_id', 'alias', 'normalized_alias', 'source', 'status',
        'created_by', 'updated_by', 'created_at', 'updated_at'
      )
  ) <> 10 then
    raise exception 'preflight_team_aliases_columns_incompatible'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.team_aliases'::regclass
      and c.contype = 'u'
      and c.conkey = array[
        (select a.attnum from pg_catalog.pg_attribute a
         where a.attrelid = 'public.team_aliases'::regclass
           and a.attname = 'normalized_alias')
      ]::smallint[]
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.team_aliases'::regclass
      and c.conname = 'team_aliases_status_check'
      and c.contype = 'c'
  ) then
    raise exception 'preflight_team_aliases_constraints_incompatible'
      using errcode = '55000';
  end if;

  if to_regclass('public.team_aliases_team_status_normalized_idx') is null
     or not exists (
       select 1
       from pg_catalog.pg_index i
       where i.indexrelid = 'public.team_aliases_team_status_normalized_idx'::regclass
         and i.indrelid = 'public.team_aliases'::regclass
         and i.indisvalid
     ) then
    raise exception 'preflight_team_aliases_resolution_index_missing'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_alias_audit_events'
      and c.column_name in (
        'id', 'team_alias_id', 'action', 'actor_type', 'actor_reference',
        'source', 'before_state', 'after_state', 'request_reference', 'created_at'
      )
  ) <> 10 or (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_public_name_audit_events'
      and c.column_name in (
        'id', 'team_id', 'action', 'actor_type', 'actor_reference', 'source',
        'before_state', 'after_state', 'request_reference', 'created_at'
      )
  ) <> 10 then
    raise exception 'preflight_audit_table_contract_incompatible'
      using errcode = '55000';
  end if;

  if to_regprocedure('public.normalize_team_identity_v1(text)') is null
     or to_regprocedure(
       'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
     ) is null
     or to_regprocedure(
       'public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)'
     ) is null
     or to_regprocedure(
       'public.manage_team_public_name(uuid,text,text,text,text,text)'
     ) is null then
    raise exception 'preflight_required_rpc_missing'
      using errcode = '42883';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = to_regprocedure('public.normalize_team_identity_v1(text)')
      and p.provolatile = 'i'
      and p.proisstrict
      and p.proparallel = 's'
      and coalesce(p.proconfig, array[]::text[]) @>
        array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'preflight_normalize_team_identity_v1_contract_incompatible'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(array[
      to_regprocedure('public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)')::oid,
      to_regprocedure('public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)')::oid,
      to_regprocedure('public.manage_team_public_name(uuid,text,text,text,text,text)')::oid
    ]) as required(function_oid)
    join pg_catalog.pg_proc p on p.oid = required.function_oid
    where not p.prosecdef
       or not (
         coalesce(p.proconfig, array[]::text[]) @>
           array['search_path=pg_catalog']::text[]
       )
       or p.proowner <> (select oid from pg_catalog.pg_roles where rolname = 'postgres')
  ) then
    raise exception 'preflight_reused_rpc_security_contract_incompatible'
      using errcode = '55000';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)',
       'EXECUTE'
     )
     or not pg_catalog.has_function_privilege(
       'service_role',
       'public.manage_team_public_name(uuid,text,text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.manage_team_public_name(uuid,text,text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.manage_team_public_name(uuid,text,text,text,text,text)',
       'EXECUTE'
     ) then
    raise exception 'preflight_reused_rpc_privileges_incompatible'
      using errcode = '42501';
  end if;

  if not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.teams'::regclass
  ) or not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.countries'::regclass
  ) or not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.team_aliases'::regclass
  ) or not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.team_alias_audit_events'::regclass
  ) or not (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = 'public.team_public_name_audit_events'::regclass
  ) then
    raise exception 'preflight_expected_rls_missing'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_creation_batch'
      and p.oid <> coalesce(v_batch_oid, 0::oid)
  ) then
    raise exception 'preflight_manage_team_creation_batch_conflicting_signature'
      using errcode = '42723';
  end if;

  if v_batch_oid is not null and exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_batch_oid
      and (
        not p.prosecdef
        or not (
          coalesce(p.proconfig, array[]::text[]) @>
            array['search_path=pg_catalog']::text[]
        )
        or p.proowner <> (select oid from pg_catalog.pg_roles where rolname = 'postgres')
        or pg_catalog.pg_get_function_result(p.oid) not like 'TABLE(%preview_fingerprint text%'
      )
  ) then
    raise exception 'preflight_manage_team_creation_batch_existing_contract_incompatible'
      using errcode = '55000';
  end if;
end
$preflight$;

select
  'preflight_ok'::text as result,
  to_regclass('public.teams') as teams,
  to_regclass('public.countries') as countries,
  to_regclass('public.team_aliases') as team_aliases,
  to_regclass('public.team_alias_audit_events') as team_alias_audit_events,
  to_regclass('public.team_public_name_audit_events') as team_public_name_audit_events,
  to_regclass('public.season_teams') as season_teams,
  to_regprocedure('public.normalize_team_identity_v1(text)') as normalizer,
  to_regprocedure(
    'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
  ) as alias_rpc,
  to_regprocedure(
    'public.manage_team_public_name(uuid,text,text,text,text,text)'
  ) as public_name_rpc,
  to_regprocedure(
    'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)'
  ) as existing_batch_rpc;
