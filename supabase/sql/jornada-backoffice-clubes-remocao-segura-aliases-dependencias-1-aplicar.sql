-- Jornada.pt - remocao segura, transacional e auditavel de um clube.
-- Este script apenas instala o contrato. Nao remove qualquer clube ao ser aplicado.

begin;

do $apply_guard$
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
begin
  if to_regclass('public.teams') is null
     or to_regclass('public.countries') is null
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

  if v_actual_fks <> v_expected_fks then
    if exists (
      select 1
      from unnest(v_actual_fks) actual(signature)
      where not (actual.signature = any(v_expected_fks))
    ) then
      raise exception 'unknown_dependency: %',
        pg_catalog.array_to_string(v_actual_fks, ', ')
        using errcode = '55000';
    end if;

    raise exception 'schema_incompatible: expected_team_foreign_key_missing: %',
      pg_catalog.array_to_string(v_actual_fks, ', ')
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class dependent
    join pg_catalog.pg_rewrite rewrite on rewrite.ev_class = dependent.oid
    join pg_catalog.pg_depend dependency on dependency.objid = rewrite.oid
    where dependent.relkind in ('v', 'm')
      and dependency.refobjid in (
        'public.team_alias_audit_events'::regclass,
        'public.team_public_name_audit_events'::regclass
      )
  ) or exists (
    select 1
    from pg_catalog.pg_trigger t
    where t.tgrelid in (
      'public.team_alias_audit_events'::regclass,
      'public.team_public_name_audit_events'::regclass
    )
      and not t.tgisinternal
  ) then
    raise exception 'schema_incompatible: audit_consumer_requires_review'
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
  ) or exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.prokind in ('f', 'p')
      and (
        (
          pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) like '%team_alias_audit_events%'
          and pg_catalog.regexp_replace(
            pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)),
            '\s+',
            ' ',
            'g'
          ) ~ '\mteam_alias_id\M\s+is\s+not\s+null'
        )
        or (
          pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)) like '%team_public_name_audit_events%'
          and pg_catalog.regexp_replace(
            pg_catalog.lower(pg_catalog.pg_get_functiondef(p.oid)),
            '\s+',
            ' ',
            'g'
          ) ~ '\mteam_id\M\s+is\s+not\s+null'
        )
      )
  ) then
    raise exception 'schema_incompatible: audit_consumer_requires_non_null_reference'
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
    join pg_catalog.pg_attribute a
      on a.attrelid = c.conrelid
     and a.attnum = c.conkey[1]
    where c.conname = 'team_public_name_audit_events_team_id_fkey'
      and c.conrelid = 'public.team_public_name_audit_events'::regclass
      and c.confrelid = 'public.teams'::regclass
      and c.contype = 'f'
      and c.confdeltype = 'r'
      and a.attname = 'team_id'
      and a.attnotnull
  ) then
    raise exception 'schema_incompatible: public_name_audit_foreign_key_mismatch'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_alias_audit_events e
    where coalesce(e.after_state, e.before_state) is null
       or pg_catalog.jsonb_typeof(coalesce(e.after_state, e.before_state)) <> 'object'
       or nullif(coalesce(e.after_state, e.before_state) ->> 'id', '') is null
       or nullif(coalesce(e.after_state, e.before_state) ->> 'team_id', '') is null
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
       or nullif(e.before_state ->> 'team_id', '') is null
       or nullif(e.before_state ->> 'name', '') is null
       or nullif(e.after_state ->> 'team_id', '') is null
       or nullif(e.after_state ->> 'name', '') is null
  ) then
    raise exception 'schema_incompatible: public_name_audit_snapshot_cannot_survive_detach'
      using errcode = '55000';
  end if;
end
$apply_guard$;

alter table public.team_alias_audit_events
  drop constraint team_alias_audit_events_team_alias_id_fkey;

alter table public.team_alias_audit_events
  alter column team_alias_id drop not null,
  add constraint team_alias_audit_events_team_alias_id_fkey
    foreign key (team_alias_id)
    references public.team_aliases(id)
    on delete set null;

alter table public.team_public_name_audit_events
  drop constraint team_public_name_audit_events_team_id_fkey;

alter table public.team_public_name_audit_events
  alter column team_id drop not null,
  add constraint team_public_name_audit_events_team_id_fkey
    foreign key (team_id)
    references public.teams(id)
    on delete set null;

create table public.team_deletion_audit_events (
  id uuid primary key default pg_catalog.gen_random_uuid(),
  deleted_team_id uuid not null,
  team_snapshot jsonb not null,
  aliases_snapshot jsonb not null,
  dependency_snapshot jsonb not null,
  confirmed_action text not null,
  confirmed_preview_fingerprint text not null,
  actor_type text not null,
  actor_reference text not null,
  source text not null,
  request_reference text not null,
  created_at timestamptz not null default pg_catalog.now(),
  contract_version text not null default 'v1',
  constraint team_deletion_audit_events_team_snapshot_object_check
    check (pg_catalog.jsonb_typeof(team_snapshot) = 'object'),
  constraint team_deletion_audit_events_team_snapshot_identity_check
    check (
      team_snapshot ? 'id'
      and team_snapshot ? 'name'
      and team_snapshot ? 'slug'
      and team_snapshot ? 'country_id'
      and team_snapshot ->> 'id' is not null
      and team_snapshot ->> 'id' = deleted_team_id::text
      and nullif(pg_catalog.btrim(team_snapshot ->> 'name'), '') is not null
      and nullif(pg_catalog.btrim(team_snapshot ->> 'slug'), '') is not null
    ),
  constraint team_deletion_audit_events_aliases_snapshot_array_check
    check (pg_catalog.jsonb_typeof(aliases_snapshot) = 'array'),
  constraint team_deletion_audit_events_dependency_snapshot_array_check
    check (pg_catalog.jsonb_typeof(dependency_snapshot) = 'array'),
  constraint team_deletion_audit_events_confirmed_action_check
    check (confirmed_action in ('delete_team', 'delete_team_and_aliases')),
  constraint team_deletion_audit_events_fingerprint_check
    check (confirmed_preview_fingerprint ~ '^v1:[0-9a-f]{32}$'),
  constraint team_deletion_audit_events_actor_type_not_blank_check
    check (pg_catalog.btrim(actor_type) <> ''),
  constraint team_deletion_audit_events_actor_reference_not_blank_check
    check (pg_catalog.btrim(actor_reference) <> ''),
  constraint team_deletion_audit_events_source_not_blank_check
    check (pg_catalog.btrim(source) <> ''),
  constraint team_deletion_audit_events_request_reference_not_blank_check
    check (pg_catalog.btrim(request_reference) <> ''),
  constraint team_deletion_audit_events_contract_version_check
    check (contract_version = 'v1')
);

create index team_deletion_audit_events_deleted_team_created_at_idx
  on public.team_deletion_audit_events (deleted_team_id, created_at desc);

create index team_deletion_audit_events_created_at_idx
  on public.team_deletion_audit_events (created_at desc);

create unique index team_deletion_audit_events_request_reference_uidx
  on public.team_deletion_audit_events (request_reference);

create function public.prevent_team_deletion_audit_event_mutation()
returns trigger
language plpgsql
set search_path = pg_catalog
as $immutable_audit$
begin
  raise exception 'team_deletion_audit_events_immutable'
    using errcode = '55000';
end
$immutable_audit$;

create trigger team_deletion_audit_events_prevent_mutation
before update or delete on public.team_deletion_audit_events
for each row
execute function public.prevent_team_deletion_audit_event_mutation();

create function public.manage_team_safe_deletion(
  p_team_id uuid,
  p_apply boolean,
  p_confirmed_preview_fingerprint text,
  p_confirmed_action text,
  p_actor_type text,
  p_actor_reference text,
  p_source text,
  p_request_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog
as $safe_deletion$
declare
  v_contract_version constant text := 'v1';
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
  v_actual_fks text[];
  v_team public.teams%rowtype;
  v_country jsonb;
  v_team_snapshot jsonb;
  v_active_aliases jsonb;
  v_inactive_aliases jsonb;
  v_aliases_snapshot jsonb;
  v_dependencies jsonb;
  v_plan jsonb;
  v_response jsonb;
  v_status text;
  v_proposed_action text;
  v_reason_code text;
  v_reason_message text;
  v_fingerprint text;
  v_actor_type text := nullif(pg_catalog.btrim(p_actor_type), '');
  v_actor_reference text := nullif(pg_catalog.btrim(p_actor_reference), '');
  v_source text := nullif(pg_catalog.btrim(p_source), '');
  v_request_reference text := nullif(pg_catalog.btrim(p_request_reference), '');
  v_confirmed_fingerprint text := nullif(pg_catalog.btrim(p_confirmed_preview_fingerprint), '');
  v_confirmed_action text := nullif(pg_catalog.btrim(p_confirmed_action), '');
  v_season_teams_count bigint;
  v_matches_home_count bigint;
  v_matches_away_count bigint;
  v_standing_rows_count bigint;
  v_goals_count bigint;
  v_players_count bigint;
  v_match_events_count bigint;
  v_active_alias_count bigint;
  v_inactive_alias_count bigint;
  v_alias_count bigint;
  v_alias_audit_count bigint;
  v_public_name_audit_count bigint;
  v_blocking_count bigint;
  v_rows_deleted integer;
  v_alias_audit_ids uuid[] := array[]::uuid[];
  v_public_name_audit_ids uuid[] := array[]::uuid[];
  v_deletion_audit_event_id uuid;
begin
  if p_team_id is null then
    raise exception 'invalid_confirmation: team_id_required'
      using errcode = '22023';
  end if;

  if p_apply is null then
    raise exception 'invalid_confirmation: apply_mode_required'
      using errcode = '22023';
  end if;

  if p_apply then
    if v_confirmed_fingerprint is null
       or v_confirmed_fingerprint !~ '^v1:[0-9a-f]{32}$' then
      raise exception 'invalid_confirmation: preview_fingerprint_required'
        using errcode = '22023';
    end if;

    if v_confirmed_action is null
       or v_confirmed_action not in ('delete_team', 'delete_team_and_aliases', 'none') then
      raise exception 'invalid_action'
        using errcode = '22023';
    end if;

    if v_actor_type is null
       or v_actor_reference is null
       or v_source is null
       or v_request_reference is null then
      raise exception 'invalid_confirmation: audit_metadata_required'
        using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended(
        'team_safe_deletion:v1:' || p_team_id::text,
        0
      )
    );
  elsif v_confirmed_fingerprint is not null or v_confirmed_action is not null then
    raise exception 'invalid_confirmation: preview_must_not_confirm_deletion'
      using errcode = '22023';
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

  if exists (
    select 1
    from unnest(v_actual_fks) actual(signature)
    where not (actual.signature = any(v_expected_fks))
  ) then
    raise exception 'unknown_dependency'
      using errcode = '55000',
            detail = pg_catalog.array_to_string(v_actual_fks, ', ');
  end if;

  if exists (
    select 1
    from unnest(v_expected_fks) expected(signature)
    where not (expected.signature = any(v_actual_fks))
  ) then
    raise exception 'schema_incompatible: expected_team_foreign_key_missing'
      using errcode = '55000',
            detail = pg_catalog.array_to_string(v_actual_fks, ', ');
  end if;

  if p_apply then
    select t.*
    into v_team
    from public.teams t
    where t.id = p_team_id
    for update;
  else
    select t.*
    into v_team
    from public.teams t
    where t.id = p_team_id;
  end if;

  if not found then
    raise exception 'team_not_found'
      using errcode = 'P0002';
  end if;

  if p_apply then
    perform a.id
    from public.team_aliases a
    where a.team_id = p_team_id
    order by a.id
    for update;
  end if;

  if exists (
    select 1
    from public.team_aliases a
    where a.team_id = p_team_id
      and a.status not in ('active', 'inactive')
  ) then
    raise exception 'schema_incompatible: unsupported_alias_status'
      using errcode = '55000';
  end if;

  select pg_catalog.jsonb_build_object(
    'id', c.id,
    'name', c.name,
    'slug', c.slug,
    'iso2', c.iso2
  )
  into v_country
  from public.countries c
  where c.id = v_team.country_id;

  v_team_snapshot := pg_catalog.jsonb_build_object(
    'id', v_team.id,
    'name', v_team.name,
    'public_name', v_team.public_name,
    'short_name', v_team.short_name,
    'code', v_team.code,
    'slug', v_team.slug,
    'country_id', v_team.country_id,
    'country', v_country,
    'logo_url', v_team.logo_url,
    'primary_color', v_team.primary_color
  );

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', a.id,
        'alias', a.alias,
        'normalized_alias', a.normalized_alias,
        'status', a.status
      ) order by a.normalized_alias, a.id
    ),
    '[]'::jsonb
  )
  into v_active_aliases
  from public.team_aliases a
  where a.team_id = p_team_id
    and a.status = 'active';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', a.id,
        'alias', a.alias,
        'normalized_alias', a.normalized_alias,
        'status', a.status
      ) order by a.normalized_alias, a.id
    ),
    '[]'::jsonb
  )
  into v_inactive_aliases
  from public.team_aliases a
  where a.team_id = p_team_id
    and a.status = 'inactive';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', a.id,
        'alias', a.alias,
        'normalized_alias', a.normalized_alias,
        'status', a.status
      ) order by a.status, a.normalized_alias, a.id
    ),
    '[]'::jsonb
  )
  into v_aliases_snapshot
  from public.team_aliases a
  where a.team_id = p_team_id;

  select count(*) into v_season_teams_count
  from public.season_teams st where st.team_id = p_team_id;
  select count(*) into v_matches_home_count
  from public.matches m where m.home_team_id = p_team_id;
  select count(*) into v_matches_away_count
  from public.matches m where m.away_team_id = p_team_id;
  select count(*) into v_standing_rows_count
  from public.standing_rows sr where sr.team_id = p_team_id;
  select count(*) into v_goals_count
  from public.goals g where g.team_id = p_team_id;
  select count(*) into v_players_count
  from public.players p where p.team_id = p_team_id;
  select count(*) into v_match_events_count
  from public.match_events me where me.team_id = p_team_id;
  select count(*) filter (where a.status = 'active'),
         count(*) filter (where a.status = 'inactive')
  into v_active_alias_count, v_inactive_alias_count
  from public.team_aliases a
  where a.team_id = p_team_id;

  v_active_alias_count := coalesce(v_active_alias_count, 0);
  v_inactive_alias_count := coalesce(v_inactive_alias_count, 0);
  v_alias_count := v_active_alias_count + v_inactive_alias_count;

  select count(*), coalesce(array_agg(e.id order by e.id), array[]::uuid[])
  into v_alias_audit_count, v_alias_audit_ids
  from public.team_alias_audit_events e
  join public.team_aliases a on a.id = e.team_alias_id
  where a.team_id = p_team_id;

  select count(*), coalesce(array_agg(e.id order by e.id), array[]::uuid[])
  into v_public_name_audit_count, v_public_name_audit_ids
  from public.team_public_name_audit_events e
  where e.team_id = p_team_id;

  v_blocking_count :=
    v_season_teams_count +
    v_matches_home_count +
    v_matches_away_count +
    v_standing_rows_count +
    v_goals_count +
    v_players_count +
    v_match_events_count;

  v_dependencies := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object('key', 'season_teams', 'table', 'season_teams', 'column', 'team_id', 'count', v_season_teams_count, 'blocking', true, 'reason', 'O clube participa em epocas.'),
    pg_catalog.jsonb_build_object('key', 'matches_home', 'table', 'matches', 'column', 'home_team_id', 'count', v_matches_home_count, 'blocking', true, 'reason', 'O clube participa em jogos como equipa da casa.'),
    pg_catalog.jsonb_build_object('key', 'matches_away', 'table', 'matches', 'column', 'away_team_id', 'count', v_matches_away_count, 'blocking', true, 'reason', 'O clube participa em jogos como equipa visitante.'),
    pg_catalog.jsonb_build_object('key', 'standing_rows', 'table', 'standing_rows', 'column', 'team_id', 'count', v_standing_rows_count, 'blocking', true, 'reason', 'O clube tem classificacoes.'),
    pg_catalog.jsonb_build_object('key', 'goals', 'table', 'goals', 'column', 'team_id', 'count', v_goals_count, 'blocking', true, 'reason', 'O clube tem golos registados.'),
    pg_catalog.jsonb_build_object('key', 'players', 'table', 'players', 'column', 'team_id', 'count', v_players_count, 'blocking', true, 'reason', 'O clube tem jogadores associados.'),
    pg_catalog.jsonb_build_object('key', 'match_events', 'table', 'match_events', 'column', 'team_id', 'count', v_match_events_count, 'blocking', true, 'reason', 'O clube tem eventos de jogo associados.'),
    pg_catalog.jsonb_build_object('key', 'aliases_active', 'table', 'team_aliases', 'column', 'team_id', 'count', v_active_alias_count, 'blocking', false, 'reason', 'Aliases ativos serao removidos na mesma transacao.'),
    pg_catalog.jsonb_build_object('key', 'aliases_inactive', 'table', 'team_aliases', 'column', 'team_id', 'count', v_inactive_alias_count, 'blocking', false, 'reason', 'Aliases inativos serao removidos na mesma transacao.'),
    pg_catalog.jsonb_build_object('key', 'alias_audit_events', 'table', 'team_alias_audit_events', 'column', 'team_alias_id', 'count', v_alias_audit_count, 'blocking', false, 'reason', 'A auditoria dos aliases sera preservada.'),
    pg_catalog.jsonb_build_object('key', 'public_name_audit_events', 'table', 'team_public_name_audit_events', 'column', 'team_id', 'count', v_public_name_audit_count, 'blocking', false, 'reason', 'A auditoria de nomes publicos sera preservada.')
  );

  if v_blocking_count > 0 then
    v_status := 'blocked';
    v_proposed_action := 'none';
    v_reason_code := 'blocking_dependencies_found';
    v_reason_message := 'O clube nao pode ser removido porque tem dependencias estruturais.';
  elsif v_alias_count > 0 then
    v_status := 'removable_with_aliases';
    v_proposed_action := 'delete_team_and_aliases';
    v_reason_code := 'aliases_will_be_deleted';
    v_reason_message := 'O clube pode ser removido juntamente com os aliases ativos e inativos.';
  else
    v_status := 'removable';
    v_proposed_action := 'delete_team';
    v_reason_code := 'no_blocking_dependencies';
    v_reason_message := 'O clube nao tem dependencias bloqueantes e pode ser removido.';
  end if;

  v_plan := pg_catalog.jsonb_build_object(
    'contract_version', v_contract_version,
    'team', v_team_snapshot,
    'aliases', v_aliases_snapshot,
    'dependencies', v_dependencies,
    'status', v_status,
    'proposed_action', v_proposed_action
  );
  v_fingerprint := 'v1:' || pg_catalog.md5(v_plan::text);

  v_response := pg_catalog.jsonb_build_object(
    'contract_version', v_contract_version,
    'mode', case when p_apply then 'apply' else 'preview' end,
    'applied', false,
    'team_id', v_team.id,
    'name', v_team.name,
    'public_name', v_team.public_name,
    'short_name', v_team.short_name,
    'code', v_team.code,
    'slug', v_team.slug,
    'country', v_country,
    'active_aliases', v_active_aliases,
    'inactive_aliases', v_inactive_aliases,
    'alias_count', v_alias_count,
    'alias_audit_count', v_alias_audit_count,
    'public_name_audit_count', v_public_name_audit_count,
    'dependencies', v_dependencies,
    'status', v_status,
    'can_delete', v_status <> 'blocked',
    'proposed_action', v_proposed_action,
    'reason_code', v_reason_code,
    'reason_message', v_reason_message,
    'preview_fingerprint', v_fingerprint,
    'deleted_team_id', null,
    'aliases_deleted_count', 0,
    'alias_audit_events_preserved_count', 0,
    'public_name_audit_events_preserved_count', 0,
    'deletion_audit_event_id', null
  );

  if not p_apply then
    return v_response;
  end if;

  if v_confirmed_fingerprint <> v_fingerprint then
    raise exception 'preview_stale'
      using errcode = '40001',
            detail = pg_catalog.format(
              'confirmed=%s recalculated=%s',
              v_confirmed_fingerprint,
              v_fingerprint
            );
  end if;

  if v_confirmed_action <> v_proposed_action then
    raise exception 'invalid_confirmation'
      using errcode = '22023',
            detail = pg_catalog.format(
              'confirmed=%s proposed=%s',
              v_confirmed_action,
              v_proposed_action
            );
  end if;

  if v_status = 'blocked' then
    return v_response;
  end if;

  insert into public.team_deletion_audit_events (
    deleted_team_id,
    team_snapshot,
    aliases_snapshot,
    dependency_snapshot,
    confirmed_action,
    confirmed_preview_fingerprint,
    actor_type,
    actor_reference,
    source,
    request_reference,
    contract_version
  ) values (
    v_team.id,
    v_team_snapshot,
    v_aliases_snapshot,
    v_dependencies,
    v_confirmed_action,
    v_fingerprint,
    v_actor_type,
    v_actor_reference,
    v_source,
    v_request_reference,
    v_contract_version
  )
  returning id into v_deletion_audit_event_id;

  if v_status = 'removable_with_aliases' then
    delete from public.team_aliases a
    where a.team_id = p_team_id;

    get diagnostics v_rows_deleted = row_count;
    if v_rows_deleted <> v_alias_count then
      raise exception 'schema_incompatible: alias_delete_count_mismatch'
        using errcode = '55000';
    end if;
  end if;

  delete from public.teams t
  where t.id = p_team_id;

  get diagnostics v_rows_deleted = row_count;
  if v_rows_deleted <> 1 then
    raise exception 'schema_incompatible: team_delete_count_mismatch'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(v_alias_audit_ids) expected(id)
    where not exists (
      select 1
      from public.team_alias_audit_events e
      where e.id = expected.id
        and e.team_alias_id is null
    )
  ) then
    raise exception 'schema_incompatible: alias_audit_not_preserved'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from unnest(v_public_name_audit_ids) expected(id)
    where not exists (
      select 1
      from public.team_public_name_audit_events e
      where e.id = expected.id
        and e.team_id is null
    )
  ) then
    raise exception 'schema_incompatible: public_name_audit_not_preserved'
      using errcode = '55000';
  end if;

  return v_response || pg_catalog.jsonb_build_object(
    'applied', true,
    'can_delete', false,
    'reason_code', 'team_deleted',
    'reason_message', 'O clube foi removido integralmente.',
    'deleted_team_id', v_team.id,
    'aliases_deleted_count', v_alias_count,
    'alias_audit_events_preserved_count', v_alias_audit_count,
    'public_name_audit_events_preserved_count', v_public_name_audit_count,
    'deletion_audit_event_id', v_deletion_audit_event_id
  );
end
$safe_deletion$;

comment on table public.team_deletion_audit_events is
  'Auditoria imutavel das remocoes transacionais de clubes; deleted_team_id e historico e nao tem foreign key.';
comment on function public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text) is
  'Faz preview ou aplica a remocao segura de um clube, preservando auditorias e bloqueando dependencias estruturais.';
comment on function public.prevent_team_deletion_audit_event_mutation() is
  'Impede UPDATE e DELETE na auditoria imutavel de remocao de clubes.';

alter table public.team_deletion_audit_events owner to postgres;
alter function public.prevent_team_deletion_audit_event_mutation() owner to postgres;
alter function public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text)
  owner to postgres;

alter table public.team_deletion_audit_events enable row level security;

revoke all on table public.team_deletion_audit_events
  from public, anon, authenticated, service_role;
grant select on table public.team_deletion_audit_events to service_role;

revoke all on function public.prevent_team_deletion_audit_event_mutation()
  from public, anon, authenticated, service_role;

revoke all on function public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text)
  to service_role;

commit;
