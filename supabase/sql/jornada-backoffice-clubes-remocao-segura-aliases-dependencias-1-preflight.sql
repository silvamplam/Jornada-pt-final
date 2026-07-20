-- Jornada.pt - remocao segura de clubes: preflight exclusivamente read-only.
-- Executar antes do script aplicar. Qualquer divergencia interrompe a fase.

do $preflight$
declare
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
  v_missing text[];
  v_unknown text[];
  v_audit_function_issues jsonb;
begin
  if to_regclass('public.teams') is null
     or to_regclass('public.countries') is null
     or to_regclass('public.season_teams') is null
     or to_regclass('public.matches') is null
     or to_regclass('public.standing_rows') is null
     or to_regclass('public.goals') is null
     or to_regclass('public.players') is null
     or to_regclass('public.match_events') is null
     or to_regclass('public.team_aliases') is null
     or to_regclass('public.team_alias_audit_events') is null
     or to_regclass('public.team_public_name_audit_events') is null then
    raise exception 'schema_incompatible: required_table_missing'
      using errcode = '55000';
  end if;

  if to_regclass('public.team_deletion_audit_events') is not null
     or to_regprocedure(
       'public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text)'
     ) is not null
     or to_regprocedure('public.prevent_team_deletion_audit_event_mutation()') is not null then
    raise exception 'schema_incompatible: phase_object_already_exists'
      using errcode = '55000';
  end if;

  if to_regprocedure('pg_catalog.gen_random_uuid()') is null then
    raise exception 'schema_incompatible: gen_random_uuid_missing'
      using errcode = '42883';
  end if;

  if exists (
    select 1
    from (values
      ('teams', 'id', 'uuid', 'NO'),
      ('teams', 'name', 'text', 'NO'),
      ('teams', 'public_name', 'text', 'YES'),
      ('teams', 'short_name', 'text', 'NO'),
      ('teams', 'code', 'text', 'YES'),
      ('teams', 'slug', 'text', 'NO'),
      ('teams', 'country_id', 'uuid', 'YES'),
      ('teams', 'logo_url', 'text', 'YES'),
      ('teams', 'primary_color', 'text', 'YES'),
      ('countries', 'id', 'uuid', 'NO'),
      ('countries', 'name', 'text', 'NO'),
      ('countries', 'slug', 'text', 'NO'),
      ('countries', 'iso2', 'text', 'YES'),
      ('team_aliases', 'id', 'uuid', 'NO'),
      ('team_aliases', 'team_id', 'uuid', 'NO'),
      ('team_aliases', 'alias', 'text', 'NO'),
      ('team_aliases', 'normalized_alias', 'text', 'NO'),
      ('team_aliases', 'status', 'text', 'NO'),
      ('team_alias_audit_events', 'id', 'uuid', 'NO'),
      ('team_alias_audit_events', 'team_alias_id', 'uuid', 'NO'),
      ('team_alias_audit_events', 'before_state', 'jsonb', 'YES'),
      ('team_alias_audit_events', 'after_state', 'jsonb', 'YES'),
      ('team_public_name_audit_events', 'id', 'uuid', 'NO'),
      ('team_public_name_audit_events', 'team_id', 'uuid', 'NO'),
      ('team_public_name_audit_events', 'before_state', 'jsonb', 'NO'),
      ('team_public_name_audit_events', 'after_state', 'jsonb', 'NO')
    ) expected(table_name, column_name, udt_name, is_nullable)
    where not exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = expected.table_name
        and c.column_name = expected.column_name
        and c.udt_name = expected.udt_name
        and c.is_nullable = expected.is_nullable
    )
  ) then
    raise exception 'schema_incompatible: required_column_contract_mismatch'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'public.teams'::regclass
      and (
        pg_catalog.cardinality(c.conkey) <> 1
        or pg_catalog.cardinality(c.confkey) <> 1
      )
  ) then
    raise exception 'unknown_dependency: composite_team_foreign_key'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid = 'public.teams'::regclass
      and not t.tgisinternal
  ) then
    raise exception 'unknown_dependency: teams_trigger_requires_review'
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

  select coalesce(array_agg(expected.signature order by expected.signature), array[]::text[])
  into v_missing
  from unnest(v_expected_fks) expected(signature)
  where not (expected.signature = any(v_actual_fks));

  select coalesce(array_agg(actual.signature order by actual.signature), array[]::text[])
  into v_unknown
  from unnest(v_actual_fks) actual(signature)
  where not (actual.signature = any(v_expected_fks));

  if pg_catalog.cardinality(v_unknown) > 0 then
    raise exception 'unknown_dependency: %', array_to_string(v_unknown, ', ')
      using errcode = '55000';
  end if;

  if pg_catalog.cardinality(v_missing) > 0 then
    raise exception 'schema_incompatible: expected_team_foreign_key_missing: %',
      array_to_string(v_missing, ', ')
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
      ('public.team_aliases'::regclass, 'team_id', 'r', false),
      ('public.team_public_name_audit_events'::regclass, 'team_id', 'r', false)
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
        and not a.attisdropped
        and a.attnotnull = not expected.nullable
    )
  ) then
    raise exception 'schema_incompatible: team_foreign_key_action_or_nullability_mismatch'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = c.conkey[1]
    where c.conname = 'team_alias_audit_events_team_alias_id_fkey'
      and c.conrelid = 'public.team_alias_audit_events'::regclass
      and c.confrelid = 'public.team_aliases'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'r'
      and a.attname = 'team_alias_id'
      and a.attnotnull
  ) then
    raise exception 'schema_incompatible: alias_audit_foreign_key_mismatch'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.team_alias_audit_events'::regclass
      and c.conname = 'team_alias_audit_events_action_check'
      and c.contype = 'c'
  ) or exists (
    select expected.constraint_name
    from (values
      ('team_public_name_audit_events_action_check'),
      ('team_public_name_audit_events_before_state_object_check'),
      ('team_public_name_audit_events_after_state_object_check')
    ) expected(constraint_name)
    where not exists (
      select 1
      from pg_catalog.pg_constraint c
      where c.conrelid = 'public.team_public_name_audit_events'::regclass
        and c.conname = expected.constraint_name
        and c.contype = 'c'
    )
  ) then
    raise exception 'schema_incompatible: audit_constraint_missing'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_alias_audit_events e
    where coalesce(e.after_state, e.before_state) is null
       or pg_catalog.jsonb_typeof(coalesce(e.after_state, e.before_state)) <> 'object'
       or not (coalesce(e.after_state, e.before_state) ? 'id')
       or nullif(coalesce(e.after_state, e.before_state) ->> 'id', '') is null
       or not (coalesce(e.after_state, e.before_state) ? 'team_id')
       or nullif(coalesce(e.after_state, e.before_state) ->> 'team_id', '') is null
       or not (coalesce(e.after_state, e.before_state) ? 'alias')
       or nullif(coalesce(e.after_state, e.before_state) ->> 'alias', '') is null
  ) then
    raise exception 'schema_incompatible: alias_audit_snapshot_cannot_survive_detach'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_public_name_audit_events e
    where pg_catalog.jsonb_typeof(e.before_state) <> 'object'
       or pg_catalog.jsonb_typeof(e.after_state) <> 'object'
       or not (e.before_state ? 'team_id')
       or nullif(e.before_state ->> 'team_id', '') is null
       or not (e.before_state ? 'name')
       or nullif(e.before_state ->> 'name', '') is null
       or not (e.after_state ? 'team_id')
       or nullif(e.after_state ->> 'team_id', '') is null
       or not (e.after_state ? 'name')
       or nullif(e.after_state ->> 'name', '') is null
  ) then
    raise exception 'schema_incompatible: public_name_audit_snapshot_cannot_survive_detach'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class dependent
    join pg_catalog.pg_namespace dependent_ns on dependent_ns.oid = dependent.relnamespace
    join pg_catalog.pg_rewrite rewrite on rewrite.ev_class = dependent.oid
    join pg_catalog.pg_depend dependency on dependency.objid = rewrite.oid
    where dependent.relkind in ('v', 'm')
      and dependency.refobjid in (
        'public.team_alias_audit_events'::regclass,
        'public.team_public_name_audit_events'::regclass
      )
  ) then
    raise exception 'schema_incompatible: audit_view_consumer_requires_review'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid in (
      'public.team_alias_audit_events'::regclass,
      'public.team_public_name_audit_events'::regclass
    )
      and not t.tgisinternal
  ) then
    raise exception 'schema_incompatible: audit_trigger_consumer_requires_review'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid in (
      'public.team_alias_audit_events'::regclass,
      'public.team_public_name_audit_events'::regclass
    )
      and (
        coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ~* 'team_alias_id\s+is\s+not\s+null'
        or coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') ~* 'team_alias_id\s+is\s+not\s+null'
        or coalesce(pg_catalog.pg_get_expr(p.polqual, p.polrelid), '') ~* 'team_id\s+is\s+not\s+null'
        or coalesce(pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid), '') ~* 'team_id\s+is\s+not\s+null'
      )
  ) then
    raise exception 'schema_incompatible: audit_policy_requires_non_null_reference'
      using errcode = '55000';
  end if;

  with function_definitions as (
    select
      p.oid,
      n.nspname as function_schema,
      p.proname as function_name,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as identity_arguments,
      pg_catalog.pg_get_functiondef(p.oid) as function_definition,
      pg_catalog.lower(
        pg_catalog.regexp_replace(
          pg_catalog.pg_get_functiondef(p.oid),
          '\s+',
          ' ',
          'g'
        )
      ) as normalized_definition
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
  ),
  audit_rules as (
    select *
    from (
      values
        ('team_alias_audit_events'::text, 'team_alias_id'::text),
        ('team_public_name_audit_events'::text, 'team_id'::text)
    ) as rules(audit_table, audit_column)
  ),
  incompatible_functions as (
    select
      f.function_schema,
      f.function_name,
      f.identity_arguments,
      f.function_definition,
      f.normalized_definition,
      r.audit_table,
      r.audit_column,
      (
        pg_catalog.regexp_match(
          f.normalized_definition,
          pg_catalog.format(
            '(([a-z_][a-z0-9_]*\.)?\m%s\M)\s+is\s+not\s+null',
            r.audit_column
          )
        )
      )[1] as identifier_found
    from function_definitions f
    cross join audit_rules r
    where f.normalized_definition like '%' || r.audit_table || '%'
      and f.normalized_definition ~ pg_catalog.format(
        '\m%s\M\s+is\s+not\s+null',
        r.audit_column
      )
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'schema', i.function_schema,
        'function', i.function_name,
        'signature', pg_catalog.format(
          '%I.%I(%s)',
          i.function_schema,
          i.function_name,
          i.identity_arguments
        ),
        'table', i.audit_table,
        'column', i.audit_column,
        'identifier_found', i.identifier_found,
        'context_fragment', (
          pg_catalog.regexp_match(
            i.normalized_definition,
            pg_catalog.format(
              '(.{0,180}\m%s\M\s+is\s+not\s+null.{0,180})',
              i.audit_column
            )
          )
        )[1],
        'classification', 'real_non_null_audit_reference',
        'definition', i.function_definition
      )
      order by i.function_schema, i.function_name, i.identity_arguments,
        i.audit_table, i.audit_column
    ),
    '[]'::jsonb
  )
  into v_audit_function_issues
  from incompatible_functions i;

  if pg_catalog.jsonb_array_length(v_audit_function_issues) > 0 then
    raise exception 'schema_incompatible: audit_function_requires_non_null_reference'
      using
        errcode = '55000',
        detail = v_audit_function_issues::text;
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception 'schema_incompatible: required_role_missing'
      using errcode = '55000';
  end if;
end
$preflight$;

select
  'preflight_ok'::text as result,
  'v1'::text as contract_version,
  pg_catalog.to_jsonb(array[
    'removable',
    'removable_with_aliases',
    'blocked'
  ]::text[]) as statuses,
  pg_catalog.to_jsonb(array[
    'delete_team',
    'delete_team_and_aliases',
    'none'
  ]::text[]) as proposed_actions,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'constraint', c.conname,
        'table', child_ns.nspname || '.' || child.relname,
        'column', child_column.attname,
        'on_delete', case c.confdeltype
          when 'a' then 'NO ACTION'
          when 'r' then 'RESTRICT'
          when 'c' then 'CASCADE'
          when 'n' then 'SET NULL'
          when 'd' then 'SET DEFAULT'
        end,
        'nullable', not child_column.attnotnull
      ) order by child_ns.nspname, child.relname, child_column.attname
    )
    from pg_catalog.pg_constraint c
    join pg_catalog.pg_class child on child.oid = c.conrelid
    join pg_catalog.pg_namespace child_ns on child_ns.oid = child.relnamespace
    join pg_catalog.pg_attribute child_column
      on child_column.attrelid = c.conrelid
     and child_column.attnum = c.conkey[1]
    where c.contype = 'f'
      and c.confrelid = 'public.teams'::regclass
  ) as team_foreign_keys;
