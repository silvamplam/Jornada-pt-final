-- JORNADA-BACKOFFICE-CLUBES-ALIASES-AUDITAVEIS-SCHEMA-RPC-1
-- SQL 1/4 - PREFLIGHT READ-ONLY
--
-- Contrato estrito desta fase:
-- - public.team_aliases ainda tem exatamente o schema base de cinco colunas;
-- - existem exatamente 8 aliases;
-- - a FK team_id ainda usa ON DELETE CASCADE;
-- - a normalizacao v1 coincide com normalized_alias em todas as linhas;
-- - nenhum objeto novo desta migration existe.
--
-- Este ficheiro nao cria objetos nem altera dados. SET TRANSACTION READ ONLY
-- garante que uma alteracao acidental aborta.

begin;
set transaction read only;

do $preflight$
declare
  v_columns text[];
  v_count bigint;
  v_default text;
  v_team_aliases_oid oid := to_regclass('public.team_aliases');
  v_teams_oid oid := to_regclass('public.teams');
  v_team_aliases_team_id_attnum smallint;
  v_teams_id_attnum smallint;
begin
  if v_team_aliases_oid is null then
    raise exception 'preflight_team_aliases_table_missing' using errcode = '42P01';
  end if;

  if v_teams_oid is null then
    raise exception 'preflight_teams_table_missing' using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.oid = v_team_aliases_oid
      and n.nspname = 'public'
      and c.relname = 'team_aliases'
      and c.relkind in ('r', 'p')
  ) then
    raise exception 'preflight_team_aliases_not_a_table' using errcode = '42809';
  end if;

  if not (
    select c.relrowsecurity and not c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_team_aliases_oid
  ) or exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = v_team_aliases_oid
  ) then
    raise exception 'preflight_team_aliases_rls_baseline_unexpected'
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
    'created_at:timestamp with time zone:NO'
  ]::text[] then
    raise exception 'preflight_team_aliases_base_columns_unexpected: %', v_columns
      using errcode = '55000';
  end if;

  select c.column_default
  into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_aliases'
    and c.column_name = 'id';

  if v_default is null or position('gen_random_uuid()' in v_default) = 0 then
    raise exception 'preflight_team_aliases_id_default_unexpected: %', v_default
      using errcode = '55000';
  end if;

  select c.column_default
  into v_default
  from information_schema.columns c
  where c.table_schema = 'public'
    and c.table_name = 'team_aliases'
    and c.column_name = 'created_at';

  if v_default is null or position('now()' in v_default) = 0 then
    raise exception 'preflight_team_aliases_created_at_default_unexpected: %', v_default
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_aliases'
      and c.column_name in ('team_id', 'alias', 'normalized_alias')
      and c.column_default is not null
  ) then
    raise exception 'preflight_team_aliases_base_default_unexpected'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from (values
      ('id', 'uuid'),
      ('name', 'text'),
      ('short_name', 'text'),
      ('slug', 'text'),
      ('code', 'text')
    ) expected(column_name, data_type)
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'teams'
     and c.column_name = expected.column_name
     and c.data_type = expected.data_type
    where c.column_name is null
  ) then
    raise exception 'preflight_teams_identity_columns_unexpected'
      using errcode = '55000';
  end if;

  select a.attnum::smallint
  into v_team_aliases_team_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'team_id'
    and a.attnum > 0
    and not a.attisdropped;

  select a.attnum::smallint
  into v_teams_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_teams_oid
    and a.attname = 'id'
    and a.attnum > 0
    and not a.attisdropped;

  select count(*)
  into v_count
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'p'
    and c.conkey = array[
      (
        select a.attnum::smallint
        from pg_catalog.pg_attribute a
        where a.attrelid = v_team_aliases_oid
          and a.attname = 'id'
          and a.attnum > 0
          and not a.attisdropped
      )
    ]::smallint[];

  if v_count <> 1 then
    raise exception 'preflight_team_aliases_primary_key_unexpected: %', v_count
      using errcode = '55000';
  end if;

  select count(*)
  into v_count
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'u'
    and c.conkey = array[
      (
        select a.attnum::smallint
        from pg_catalog.pg_attribute a
        where a.attrelid = v_team_aliases_oid
          and a.attname = 'normalized_alias'
          and a.attnum > 0
          and not a.attisdropped
      )
    ]::smallint[];

  if v_count <> 1 then
    raise exception 'preflight_team_aliases_global_unique_unexpected: %', v_count
      using errcode = '55000';
  end if;

  select count(*)
  into v_count
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'f';

  if v_count <> 1 then
    raise exception 'preflight_team_aliases_foreign_key_count_unexpected: %', v_count
      using errcode = '55000';
  end if;

  select count(*)
  into v_count
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'f'
    and c.confrelid = v_teams_oid
    and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
    and c.confkey = array[v_teams_id_attnum]::smallint[]
    and c.confdeltype = 'c';

  if v_count <> 1 then
    raise exception 'preflight_team_aliases_fk_not_expected_cascade'
      using errcode = '55000';
  end if;

  if to_regclass('public.team_alias_audit_events') is not null then
    raise exception 'preflight_team_alias_audit_events_already_exists'
      using errcode = '42P07';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('normalize_team_identity_v1', 'manage_team_alias')
  ) then
    raise exception 'preflight_alias_function_name_already_exists'
      using errcode = '42723';
  end if;

  select count(*) into v_count from public.team_aliases;
  raise notice 'expected_team_alias_count=8 observed_team_alias_count=%', v_count;

  if v_count <> 8 then
    raise exception 'preflight_team_alias_count_expected_8_observed_%', v_count
      using errcode = '55000';
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
    where btrim(a.alias) = ''
       or btrim(a.normalized_alias) = ''
  ) then
    raise exception 'preflight_blank_alias_or_normalized_alias_found'
      using errcode = '23514';
  end if;

  -- Expressao v1 exatamente equivalente a normalize_team_identity_v1(text),
  -- criada apenas no APLICAR. O preflight permanece sem qualquer DDL.
  if exists (
    select 1
    from public.team_aliases a
    where a.normalized_alias is distinct from
      btrim(
        regexp_replace(
          lower(
            regexp_replace(
              normalize(btrim(a.alias), NFD),
              U&'[\0300-\036F]',
              '',
              'g'
            )
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-'
      )
  ) then
    raise exception 'preflight_alias_normalization_v1_divergence_found'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    join public.teams t
      on t.id <> a.team_id
    cross join lateral (
      values (t.name), (t.short_name), (t.slug), (t.code)
    ) identity_value(value)
    where a.normalized_alias =
      btrim(
        regexp_replace(
          lower(
            regexp_replace(
              normalize(btrim(identity_value.value), NFD),
              U&'[\0300-\036F]',
              '',
              'g'
            )
          ),
          '[^a-z0-9]+',
          '-',
          'g'
        ),
        '-'
      )
  ) then
    raise exception 'preflight_alias_collision_with_other_team_identity_found'
      using errcode = '23505';
  end if;

  raise notice 'preflight_ready: 8 aliases, zero orphans, duplicates, divergences and cross-team canonical collisions';
end
$preflight$;

commit;
