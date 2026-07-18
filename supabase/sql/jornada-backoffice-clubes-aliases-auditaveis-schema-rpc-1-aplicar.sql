-- JORNADA-BACKOFFICE-CLUBES-ALIASES-AUDITAVEIS-SCHEMA-RPC-1
-- SQL 2/4 - APLICAR
--
-- Migration transacional e deliberadamente estrita. Se o schema base ja nao
-- for o esperado, aborta em vez de tentar adaptar ou reaplicar parcialmente.
-- Nao elimina aliases, nao reatribui team_id e nao altera public.teams.

begin;

do $apply_guard$
declare
  v_columns text[];
  v_count bigint;
  v_team_aliases_oid oid := to_regclass('public.team_aliases');
  v_teams_oid oid := to_regclass('public.teams');
  v_team_aliases_id_attnum smallint;
  v_team_aliases_team_id_attnum smallint;
  v_team_aliases_normalized_alias_attnum smallint;
  v_teams_id_attnum smallint;
begin
  if v_team_aliases_oid is null or v_teams_oid is null then
    raise exception 'apply_required_base_table_missing' using errcode = '42P01';
  end if;

  if (
    select c.relrowsecurity
    from pg_catalog.pg_class c
    where c.oid = v_team_aliases_oid
  ) or exists (
    select 1
    from pg_catalog.pg_policy p
    where p.polrelid = v_team_aliases_oid
  ) then
    raise exception 'apply_team_aliases_rls_state_or_policies_unexpected'
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
    raise exception 'apply_already_applied_or_team_aliases_schema_unexpected: %', v_columns
      using errcode = '55000';
  end if;

  if to_regclass('public.team_alias_audit_events') is not null
     or to_regprocedure('public.normalize_team_identity_v1(text)') is not null
     or to_regprocedure('public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)') is not null then
    raise exception 'apply_already_applied_or_new_object_exists'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname in ('normalize_team_identity_v1', 'manage_team_alias')
  ) then
    raise exception 'apply_alias_function_name_already_exists'
      using errcode = '55000';
  end if;

  select count(*) into v_count from public.team_aliases;
  if v_count <> 8 then
    raise exception 'apply_team_alias_count_expected_8_observed_%', v_count
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    left join public.teams t on t.id = a.team_id
    where t.id is null
  ) then
    raise exception 'apply_orphan_team_alias_found' using errcode = '23503';
  end if;

  if exists (
    select a.normalized_alias
    from public.team_aliases a
    group by a.normalized_alias
    having count(*) > 1
  ) then
    raise exception 'apply_duplicate_normalized_alias_found' using errcode = '23505';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    where btrim(a.alias) = ''
       or btrim(a.normalized_alias) = ''
  ) then
    raise exception 'apply_blank_alias_or_normalized_alias_found'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    where a.normalized_alias is distinct from btrim(
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
    raise exception 'apply_alias_normalization_v1_divergence_found'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.team_aliases a
    join public.teams t on t.id <> a.team_id
    cross join lateral (
      values (t.name), (t.short_name), (t.slug), (t.code)
    ) identity_value(field_value)
    where btrim(
      regexp_replace(
        lower(
          regexp_replace(
            normalize(btrim(identity_value.field_value), NFD),
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
    ) = a.normalized_alias
  ) then
    raise exception 'apply_alias_collision_with_other_team_identity_found'
      using errcode = '23505';
  end if;

  select a.attnum
  into v_team_aliases_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'id'
    and not a.attisdropped;

  select a.attnum
  into v_team_aliases_team_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'team_id'
    and not a.attisdropped;

  select a.attnum
  into v_team_aliases_normalized_alias_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_team_aliases_oid
    and a.attname = 'normalized_alias'
    and not a.attisdropped;

  select a.attnum
  into v_teams_id_attnum
  from pg_catalog.pg_attribute a
  where a.attrelid = v_teams_oid
    and a.attname = 'id'
    and not a.attisdropped;

  select count(*)
  into v_count
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'p'
    and c.conkey = array[v_team_aliases_id_attnum]::smallint[];

  if v_count <> 1 then
    raise exception 'apply_expected_id_primary_key_not_found'
      using errcode = '55000';
  end if;

  select count(*)
  into v_count
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'u'
    and c.conkey = array[v_team_aliases_normalized_alias_attnum]::smallint[];

  if v_count <> 1 then
    raise exception 'apply_expected_global_normalized_alias_unique_not_found'
      using errcode = '55000';
  end if;

  select count(*)
  into v_count
  from pg_catalog.pg_constraint c
  where c.conrelid = v_team_aliases_oid
    and c.contype = 'f'
    and c.confrelid = v_teams_oid
    and c.confdeltype = 'c'
    and c.conkey = array[v_team_aliases_team_id_attnum]::smallint[]
    and c.confkey = array[v_teams_id_attnum]::smallint[];

  if v_count <> 1 or (
    select count(*)
    from pg_catalog.pg_constraint c
    where c.conrelid = v_team_aliases_oid
      and c.contype = 'f'
  ) <> 1 then
    raise exception 'apply_expected_single_cascade_fk_not_found'
      using errcode = '55000';
  end if;
end
$apply_guard$;

-- Snapshot transacional dos cinco campos que esta fase tem de preservar.
create temporary table team_aliases_schema_rpc_1_before
on commit drop
as
select a.id, a.team_id, a.alias, a.normalized_alias, a.created_at
from public.team_aliases a;

create function public.normalize_team_identity_v1(p_value text)
returns text
language sql
immutable
strict
parallel safe
set search_path = pg_catalog
as $normalize$
  select btrim(
    regexp_replace(
      lower(
        regexp_replace(
          normalize(btrim(p_value), NFD),
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
$normalize$;

alter function public.normalize_team_identity_v1(text) owner to postgres;
revoke all on function public.normalize_team_identity_v1(text) from public, anon, authenticated, service_role;

alter table public.team_aliases
  add column source text,
  add column status text,
  add column updated_at timestamptz,
  add column created_by text,
  add column updated_by text;

update public.team_aliases
set source = 'legacy_seed',
    status = 'active',
    updated_at = created_at,
    created_by = 'migration_legacy',
    updated_by = 'migration_legacy';

alter table public.team_aliases
  alter column source set not null,
  alter column status set not null,
  alter column updated_at set not null,
  alter column created_by set not null,
  alter column updated_by set not null,
  add constraint team_aliases_alias_not_blank_check
    check (btrim(alias) <> ''),
  add constraint team_aliases_normalized_alias_not_blank_check
    check (btrim(normalized_alias) <> ''),
  add constraint team_aliases_normalized_alias_format_check
    check (normalized_alias ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  add constraint team_aliases_normalized_alias_v1_check
    check (normalized_alias = public.normalize_team_identity_v1(alias)),
  add constraint team_aliases_status_check
    check (status in ('active', 'inactive')),
  add constraint team_aliases_source_not_blank_check
    check (btrim(source) <> ''),
  add constraint team_aliases_created_by_not_blank_check
    check (btrim(created_by) <> ''),
  add constraint team_aliases_updated_by_not_blank_check
    check (btrim(updated_by) <> '');

do $replace_fk$
declare
  v_constraint_name text;
begin
  select c.conname
  into v_constraint_name
  from pg_catalog.pg_constraint c
  where c.conrelid = 'public.team_aliases'::regclass
    and c.contype = 'f'
    and c.confrelid = 'public.teams'::regclass
    and c.confdeltype = 'c';

  if v_constraint_name is null then
    raise exception 'apply_cascade_fk_not_found_for_replacement'
      using errcode = '55000';
  end if;

  execute format(
    'alter table public.team_aliases drop constraint %I',
    v_constraint_name
  );
end
$replace_fk$;

alter table public.team_aliases
  add constraint team_aliases_team_id_fkey
  foreign key (team_id)
  references public.teams(id)
  on delete restrict;

create index team_aliases_team_status_normalized_idx
  on public.team_aliases (team_id, status, normalized_alias);

create table public.team_alias_audit_events (
  id uuid primary key default gen_random_uuid(),
  team_alias_id uuid not null,
  action text not null,
  actor_type text not null,
  actor_reference text not null,
  source text not null,
  before_state jsonb,
  after_state jsonb,
  request_reference text,
  created_at timestamptz not null default now(),
  constraint team_alias_audit_events_team_alias_id_fkey
    foreign key (team_alias_id)
    references public.team_aliases(id)
    on delete restrict,
  constraint team_alias_audit_events_action_check
    check (action in ('create', 'update', 'deactivate', 'reactivate')),
  constraint team_alias_audit_events_actor_type_not_blank_check
    check (btrim(actor_type) <> ''),
  constraint team_alias_audit_events_actor_reference_not_blank_check
    check (btrim(actor_reference) <> ''),
  constraint team_alias_audit_events_source_not_blank_check
    check (btrim(source) <> '')
);

create index team_alias_audit_events_team_alias_created_at_idx
  on public.team_alias_audit_events (team_alias_id, created_at);

create index team_alias_audit_events_created_at_idx
  on public.team_alias_audit_events (created_at);

create function public.manage_team_alias(
  p_action text,
  p_actor_type text,
  p_actor_reference text,
  p_source text,
  p_team_alias_id uuid default null,
  p_team_id uuid default null,
  p_alias text default null,
  p_request_reference text default null
)
returns table (
  result_team_alias_id uuid,
  result_team_id uuid,
  result_alias text,
  result_normalized_alias text,
  result_status text,
  result_changed boolean,
  result_code text
)
language plpgsql
security definer
set search_path = pg_catalog
as $manage$
declare
  v_action text := lower(btrim(p_action));
  v_actor_type text := btrim(p_actor_type);
  v_actor_reference text := btrim(p_actor_reference);
  v_source text := btrim(p_source);
  v_request_reference text := nullif(btrim(p_request_reference), '');
  v_alias_text text;
  v_normalized_alias text;
  v_conflict_team_id uuid;
  v_conflict_field text;
  v_before public.team_aliases%rowtype;
  v_after public.team_aliases%rowtype;
  v_existing public.team_aliases%rowtype;
  v_now timestamptz;
begin
  if v_action is null
     or v_action not in ('create', 'update', 'deactivate', 'reactivate') then
    raise exception 'team_alias_action_invalid' using errcode = '22023';
  end if;

  if v_actor_type is null or v_actor_type = '' then
    raise exception 'team_alias_actor_type_required' using errcode = '22023';
  end if;

  if v_actor_reference is null or v_actor_reference = '' then
    raise exception 'team_alias_actor_reference_required' using errcode = '22023';
  end if;

  if v_source is null or v_source = '' then
    raise exception 'team_alias_source_required' using errcode = '22023';
  end if;

  -- SHARE estabiliza identidades canonicas; SHARE ROW EXCLUSIVE serializa as
  -- mutacoes de aliases. O advisory lock por chave documenta e reforca a
  -- exclusao da normalized_alias concreta.
  lock table public.teams in share mode;
  lock table public.team_aliases in share row exclusive mode;

  if v_action = 'create' then
    if p_team_alias_id is not null then
      raise exception 'team_alias_id_not_allowed_on_create' using errcode = '22023';
    end if;

    if p_team_id is null then
      raise exception 'team_alias_team_id_required' using errcode = '22023';
    end if;

    if p_alias is null or btrim(p_alias) = '' then
      raise exception 'team_alias_alias_required' using errcode = '22023';
    end if;

    if not exists (select 1 from public.teams t where t.id = p_team_id) then
      raise exception 'team_alias_team_not_found' using errcode = '23503';
    end if;

    v_alias_text := btrim(p_alias);
    v_normalized_alias := public.normalize_team_identity_v1(v_alias_text);

    if v_normalized_alias is null or v_normalized_alias = '' then
      raise exception 'team_alias_normalized_alias_empty' using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('team_alias:v1:' || v_normalized_alias, 0)
    );

    select a.*
    into v_existing
    from public.team_aliases a
    where a.normalized_alias = v_normalized_alias
    for update;

    if found then
      if v_existing.team_id <> p_team_id then
        raise exception 'team_alias_conflict_alias_other_team'
          using errcode = '23505';
      end if;

      return query
      select
        v_existing.id,
        v_existing.team_id,
        v_existing.alias,
        v_existing.normalized_alias,
        v_existing.status,
        false,
        case
          when v_existing.status = 'active' then 'noop_existing_active'
          else 'noop_existing_inactive'
        end;
      return;
    end if;

    select t.id, identity_value.field_name
    into v_conflict_team_id, v_conflict_field
    from public.teams t
    cross join lateral (
      values
        ('name'::text, t.name),
        ('short_name'::text, t.short_name),
        ('slug'::text, t.slug),
        ('code'::text, t.code)
    ) identity_value(field_name, field_value)
    where t.id <> p_team_id
      and public.normalize_team_identity_v1(identity_value.field_value) = v_normalized_alias
    order by t.id, identity_value.field_name
    limit 1;

    if found then
      raise exception 'team_alias_conflict_canonical_other_team:%:%',
        v_conflict_team_id,
        v_conflict_field
        using errcode = '23505';
    end if;

    select t.id, identity_value.field_name
    into v_conflict_team_id, v_conflict_field
    from public.teams t
    cross join lateral (
      values
        ('name'::text, t.name),
        ('short_name'::text, t.short_name),
        ('slug'::text, t.slug),
        ('code'::text, t.code)
    ) identity_value(field_name, field_value)
    where t.id = p_team_id
      and public.normalize_team_identity_v1(identity_value.field_value) = v_normalized_alias
    order by identity_value.field_name
    limit 1;

    if found then
      raise exception 'team_alias_redundant_canonical_identity:%', v_conflict_field
        using errcode = '23505';
    end if;

    v_now := clock_timestamp();

    insert into public.team_aliases (
      team_id,
      alias,
      normalized_alias,
      created_at,
      source,
      status,
      updated_at,
      created_by,
      updated_by
    ) values (
      p_team_id,
      v_alias_text,
      v_normalized_alias,
      v_now,
      v_source,
      'active',
      v_now,
      v_actor_reference,
      v_actor_reference
    )
    returning * into v_after;

    insert into public.team_alias_audit_events (
      team_alias_id,
      action,
      actor_type,
      actor_reference,
      source,
      before_state,
      after_state,
      request_reference
    ) values (
      v_after.id,
      'create',
      v_actor_type,
      v_actor_reference,
      v_source,
      null,
      to_jsonb(v_after),
      v_request_reference
    );

    return query
    select
      v_after.id,
      v_after.team_id,
      v_after.alias,
      v_after.normalized_alias,
      v_after.status,
      true,
      'created'::text;
    return;
  end if;

  if p_team_alias_id is null then
    raise exception 'team_alias_id_required' using errcode = '22023';
  end if;

  select a.*
  into v_before
  from public.team_aliases a
  where a.id = p_team_alias_id
  for update;

  if not found then
    raise exception 'team_alias_not_found' using errcode = 'P0002';
  end if;

  if p_team_id is not null and p_team_id <> v_before.team_id then
    raise exception 'team_alias_reassignment_forbidden' using errcode = '23001';
  end if;

  if not exists (select 1 from public.teams t where t.id = v_before.team_id) then
    raise exception 'team_alias_team_not_found' using errcode = '23503';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('team_alias:v1:' || v_before.normalized_alias, 0)
  );

  if v_action = 'update' then
    if p_alias is null or btrim(p_alias) = '' then
      raise exception 'team_alias_alias_required' using errcode = '22023';
    end if;

    v_alias_text := btrim(p_alias);
    v_normalized_alias := public.normalize_team_identity_v1(v_alias_text);

    if v_normalized_alias is null or v_normalized_alias = '' then
      raise exception 'team_alias_normalized_alias_empty' using errcode = '22023';
    end if;

    if v_normalized_alias <> v_before.normalized_alias then
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended('team_alias:v1:' || v_normalized_alias, 0)
      );
    end if;

    if v_alias_text = v_before.alias
       and v_normalized_alias = v_before.normalized_alias then
      return query
      select
        v_before.id,
        v_before.team_id,
        v_before.alias,
        v_before.normalized_alias,
        v_before.status,
        false,
        'noop_unchanged'::text;
      return;
    end if;

    select a.*
    into v_existing
    from public.team_aliases a
    where a.normalized_alias = v_normalized_alias
      and a.id <> v_before.id
    limit 1;

    if found then
      if v_existing.team_id <> v_before.team_id then
        raise exception 'team_alias_conflict_alias_other_team'
          using errcode = '23505';
      end if;

      raise exception 'team_alias_duplicate_same_team'
        using errcode = '23505';
    end if;

    select t.id, identity_value.field_name
    into v_conflict_team_id, v_conflict_field
    from public.teams t
    cross join lateral (
      values
        ('name'::text, t.name),
        ('short_name'::text, t.short_name),
        ('slug'::text, t.slug),
        ('code'::text, t.code)
    ) identity_value(field_name, field_value)
    where t.id <> v_before.team_id
      and public.normalize_team_identity_v1(identity_value.field_value) = v_normalized_alias
    order by t.id, identity_value.field_name
    limit 1;

    if found then
      raise exception 'team_alias_conflict_canonical_other_team:%:%',
        v_conflict_team_id,
        v_conflict_field
        using errcode = '23505';
    end if;

    select t.id, identity_value.field_name
    into v_conflict_team_id, v_conflict_field
    from public.teams t
    cross join lateral (
      values
        ('name'::text, t.name),
        ('short_name'::text, t.short_name),
        ('slug'::text, t.slug),
        ('code'::text, t.code)
    ) identity_value(field_name, field_value)
    where t.id = v_before.team_id
      and public.normalize_team_identity_v1(identity_value.field_value) = v_normalized_alias
    order by identity_value.field_name
    limit 1;

    if found then
      raise exception 'team_alias_redundant_canonical_identity:%', v_conflict_field
        using errcode = '23505';
    end if;

    v_now := clock_timestamp();

    update public.team_aliases a
    set alias = v_alias_text,
        normalized_alias = v_normalized_alias,
        updated_at = v_now,
        updated_by = v_actor_reference
    where a.id = v_before.id
    returning a.* into v_after;

    insert into public.team_alias_audit_events (
      team_alias_id,
      action,
      actor_type,
      actor_reference,
      source,
      before_state,
      after_state,
      request_reference
    ) values (
      v_after.id,
      'update',
      v_actor_type,
      v_actor_reference,
      v_source,
      to_jsonb(v_before),
      to_jsonb(v_after),
      v_request_reference
    );

    return query
    select
      v_after.id,
      v_after.team_id,
      v_after.alias,
      v_after.normalized_alias,
      v_after.status,
      true,
      'updated'::text;
    return;
  end if;

  if v_action = 'deactivate' then
    if v_before.status = 'inactive' then
      return query
      select
        v_before.id,
        v_before.team_id,
        v_before.alias,
        v_before.normalized_alias,
        v_before.status,
        false,
        'noop_already_inactive'::text;
      return;
    end if;

    v_now := clock_timestamp();

    update public.team_aliases a
    set status = 'inactive',
        updated_at = v_now,
        updated_by = v_actor_reference
    where a.id = v_before.id
    returning a.* into v_after;

    insert into public.team_alias_audit_events (
      team_alias_id,
      action,
      actor_type,
      actor_reference,
      source,
      before_state,
      after_state,
      request_reference
    ) values (
      v_after.id,
      'deactivate',
      v_actor_type,
      v_actor_reference,
      v_source,
      to_jsonb(v_before),
      to_jsonb(v_after),
      v_request_reference
    );

    return query
    select
      v_after.id,
      v_after.team_id,
      v_after.alias,
      v_after.normalized_alias,
      v_after.status,
      true,
      'deactivated'::text;
    return;
  end if;

  -- reactivate: a linha permanece a mesma e todas as colisoes sao novamente
  -- validadas antes da transicao de estado.
  if v_before.status = 'active' then
    return query
    select
      v_before.id,
      v_before.team_id,
      v_before.alias,
      v_before.normalized_alias,
      v_before.status,
      false,
      'noop_already_active'::text;
    return;
  end if;

  select a.*
  into v_existing
  from public.team_aliases a
  where a.normalized_alias = v_before.normalized_alias
    and a.id <> v_before.id
  limit 1;

  if found then
    if v_existing.team_id <> v_before.team_id then
      raise exception 'team_alias_conflict_alias_other_team'
        using errcode = '23505';
    end if;

    raise exception 'team_alias_duplicate_same_team'
      using errcode = '23505';
  end if;

  select t.id, identity_value.field_name
  into v_conflict_team_id, v_conflict_field
  from public.teams t
  cross join lateral (
    values
      ('name'::text, t.name),
      ('short_name'::text, t.short_name),
      ('slug'::text, t.slug),
      ('code'::text, t.code)
  ) identity_value(field_name, field_value)
  where t.id <> v_before.team_id
    and public.normalize_team_identity_v1(identity_value.field_value) = v_before.normalized_alias
  order by t.id, identity_value.field_name
  limit 1;

  if found then
    raise exception 'team_alias_conflict_canonical_other_team:%:%',
      v_conflict_team_id,
      v_conflict_field
      using errcode = '23505';
  end if;

  select t.id, identity_value.field_name
  into v_conflict_team_id, v_conflict_field
  from public.teams t
  cross join lateral (
    values
      ('name'::text, t.name),
      ('short_name'::text, t.short_name),
      ('slug'::text, t.slug),
      ('code'::text, t.code)
  ) identity_value(field_name, field_value)
  where t.id = v_before.team_id
    and public.normalize_team_identity_v1(identity_value.field_value) = v_before.normalized_alias
  order by identity_value.field_name
  limit 1;

  if found then
    raise exception 'team_alias_redundant_canonical_identity:%', v_conflict_field
      using errcode = '23505';
  end if;

  v_now := clock_timestamp();

  update public.team_aliases a
  set status = 'active',
      updated_at = v_now,
      updated_by = v_actor_reference
  where a.id = v_before.id
  returning a.* into v_after;

  insert into public.team_alias_audit_events (
    team_alias_id,
    action,
    actor_type,
    actor_reference,
    source,
    before_state,
    after_state,
    request_reference
  ) values (
    v_after.id,
    'reactivate',
    v_actor_type,
    v_actor_reference,
    v_source,
    to_jsonb(v_before),
    to_jsonb(v_after),
    v_request_reference
  );

  return query
  select
    v_after.id,
    v_after.team_id,
    v_after.alias,
    v_after.normalized_alias,
    v_after.status,
    true,
    'reactivated'::text;
end
$manage$;

alter function public.manage_team_alias(text,text,text,text,uuid,uuid,text,text) owner to postgres;
revoke all on function public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)
  to service_role;

alter table public.team_aliases enable row level security;
alter table public.team_alias_audit_events enable row level security;

revoke all on table public.team_aliases from public, anon, authenticated, service_role;
revoke all on table public.team_alias_audit_events from public, anon, authenticated, service_role;

grant select on table public.team_aliases to service_role;
grant select on table public.team_alias_audit_events to service_role;

do $preservation_assertions$
declare
  v_count bigint;
begin
  if exists (
    select 1
    from team_aliases_schema_rpc_1_before b
    full join public.team_aliases a on a.id = b.id
    where b.id is null
       or a.id is null
       or a.team_id is distinct from b.team_id
       or a.alias is distinct from b.alias
       or a.normalized_alias is distinct from b.normalized_alias
       or a.created_at is distinct from b.created_at
  ) then
    raise exception 'apply_preservation_assertion_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_count from public.team_aliases;
  if v_count <> 8 then
    raise exception 'apply_final_team_alias_count_expected_8_observed_%', v_count
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
    raise exception 'apply_backfill_assertion_failed'
      using errcode = '55000';
  end if;

  if exists (select 1 from public.team_alias_audit_events) then
    raise exception 'apply_audit_table_expected_empty'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint c
    where c.conrelid = 'public.team_aliases'::regclass
      and c.contype = 'f'
      and c.confrelid = 'public.teams'::regclass
      and c.confdeltype = 'r'
  ) then
    raise exception 'apply_restrict_fk_assertion_failed'
      using errcode = '55000';
  end if;
end
$preservation_assertions$;

commit;
