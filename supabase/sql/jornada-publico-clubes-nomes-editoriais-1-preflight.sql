-- JORNADA-PUBLICO-CLUBES-NOMES-EDITORIAIS-1
-- SQL 1/4 - PREFLIGHT READ-ONLY
--
-- Confirma o contrato necessario antes de adicionar public.teams.public_name,
-- a auditoria dedicada e a RPC de gestao individual. Nao cria objetos nem
-- altera dados.

begin;
set transaction read only;

do $preflight$
declare
  v_teams_oid oid := to_regclass('public.teams');
  v_count bigint;
  v_checksum text;
begin
  if v_teams_oid is null then
    raise exception 'preflight_teams_table_missing' using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where c.oid = v_teams_oid
      and n.nspname = 'public'
      and c.relname = 'teams'
      and c.relkind in ('r', 'p')
  ) then
    raise exception 'preflight_teams_not_a_table' using errcode = '42809';
  end if;

  if exists (
    select 1
    from (values
      ('id'::text, 'uuid'::text, 'NO'::text),
      ('name', 'text', 'NO'),
      ('short_name', 'text', 'NO'),
      ('slug', 'text', 'NO'),
      ('code', 'text', 'YES')
    ) expected(column_name, data_type, is_nullable)
    left join information_schema.columns c
      on c.table_schema = 'public'
     and c.table_name = 'teams'
     and c.column_name = expected.column_name
     and c.data_type = expected.data_type
     and c.is_nullable = expected.is_nullable
    where c.column_name is null
  ) then
    raise exception 'preflight_teams_contract_unexpected' using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'teams'
      and c.column_name = 'public_name'
  ) then
    raise exception 'preflight_public_name_already_exists' using errcode = '42701';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_teams_oid
      and c.contype = 'p'
      and c.conkey = array[
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
    raise exception 'preflight_teams_primary_key_unexpected' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = v_teams_oid
      and c.contype = 'u'
      and c.conkey = array[
        (
          select a.attnum::smallint
          from pg_catalog.pg_attribute a
          where a.attrelid = v_teams_oid
            and a.attname = 'slug'
            and a.attnum > 0
            and not a.attisdropped
        )
      ]::smallint[]
  ) then
    raise exception 'preflight_teams_slug_unique_unexpected' using errcode = '55000';
  end if;

  if not (
    select c.relrowsecurity and not c.relforcerowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_teams_oid
  ) then
    raise exception 'preflight_teams_rls_unexpected' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = v_teams_oid
      and p.polcmd = 'r'
      and pg_catalog.pg_get_expr(p.polqual, p.polrelid) in ('true', '(true)')
  ) then
    raise exception 'preflight_teams_public_read_policy_missing' using errcode = '42501';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception 'preflight_expected_role_missing' using errcode = '42704';
  end if;

  if not has_table_privilege('service_role', v_teams_oid, 'SELECT')
     or not has_table_privilege('service_role', v_teams_oid, 'INSERT')
     or not has_table_privilege('service_role', v_teams_oid, 'UPDATE')
     or not has_table_privilege('service_role', v_teams_oid, 'DELETE')
     or not has_table_privilege('anon', v_teams_oid, 'SELECT')
     or not has_table_privilege('authenticated', v_teams_oid, 'SELECT')
     or has_table_privilege('anon', v_teams_oid, 'INSERT')
     or has_table_privilege('anon', v_teams_oid, 'UPDATE')
     or has_table_privilege('anon', v_teams_oid, 'DELETE')
     or has_table_privilege('authenticated', v_teams_oid, 'INSERT')
     or has_table_privilege('authenticated', v_teams_oid, 'UPDATE')
     or has_table_privilege('authenticated', v_teams_oid, 'DELETE') then
    raise exception 'preflight_teams_privileges_unexpected' using errcode = '42501';
  end if;

  if to_regclass('public.team_public_name_audit_events') is not null
     or to_regclass('public.team_public_name_audit_events_team_created_at_idx') is not null
     or to_regclass('public.team_public_name_audit_events_created_at_idx') is not null then
    raise exception 'preflight_public_name_object_already_exists' using errcode = '42P07';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conname like 'teams_public_name_%'
       or c.conname like 'team_public_name_audit_events_%'
  ) then
    raise exception 'preflight_public_name_constraint_name_conflict' using errcode = '42710';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_public_name'
  ) then
    raise exception 'preflight_manage_team_public_name_function_conflict' using errcode = '42723';
  end if;

  if to_regclass('public.team_alias_audit_events') is null then
    raise exception 'preflight_expected_team_alias_audit_events_missing' using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_alias_audit_events'
      and c.column_name = 'team_alias_id'
      and c.data_type = 'uuid'
      and c.is_nullable = 'NO'
  ) or exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'team_alias_audit_events'
      and c.column_name = 'public_name'
  ) then
    raise exception 'preflight_existing_alias_audit_contract_unexpected' using errcode = '55000';
  end if;

  select
    count(*),
    md5(coalesce(string_agg(md5(to_jsonb(t)::text), '' order by t.id::text), ''))
  into v_count, v_checksum
  from public.teams t;

  if v_count = 0 then
    raise exception 'preflight_requires_existing_team_for_smoke' using errcode = '55000';
  end if;

  raise notice 'preflight_team_count=%', v_count;
  raise notice 'preflight_team_checksum=%', v_checksum;
  raise notice 'preflight_ready: public_name and dedicated audit/RPC objects are absent';
end
$preflight$;

commit;
