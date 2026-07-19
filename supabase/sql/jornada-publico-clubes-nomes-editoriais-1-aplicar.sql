-- JORNADA-PUBLICO-CLUBES-NOMES-EDITORIAIS-1
-- SQL 2/4 - APLICAR
--
-- Adiciona public_name sem backfill e cria uma mutacao individual auditavel.
-- A migration e estrita: uma reaplicacao ou um objeto incompatível aborta.

begin;

do $apply_guard$
declare
  v_teams_oid oid := to_regclass('public.teams');
  v_count bigint;
begin
  if v_teams_oid is null then
    raise exception 'apply_teams_table_missing' using errcode = '42P01';
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
    raise exception 'apply_teams_contract_unexpected' using errcode = '55000';
  end if;

  if exists (
    select 1
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'teams'
      and c.column_name = 'public_name'
  ) or to_regclass('public.team_public_name_audit_events') is not null then
    raise exception 'apply_already_applied_or_public_name_object_exists' using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_public_name'
  ) then
    raise exception 'apply_manage_team_public_name_function_conflict' using errcode = '55000';
  end if;

  if to_regclass('public.team_public_name_audit_events_team_created_at_idx') is not null
     or to_regclass('public.team_public_name_audit_events_created_at_idx') is not null
     or exists (
       select 1
       from pg_catalog.pg_constraint c
       where c.conname like 'teams_public_name_%'
          or c.conname like 'team_public_name_audit_events_%'
     ) then
    raise exception 'apply_public_name_object_name_conflict' using errcode = '55000';
  end if;

  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'postgres')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'service_role')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'anon')
     or not exists (select 1 from pg_catalog.pg_roles where rolname = 'authenticated') then
    raise exception 'apply_expected_role_missing' using errcode = '42704';
  end if;

  select count(*) into v_count from public.teams;
  if v_count = 0 then
    raise exception 'apply_requires_existing_team_for_smoke' using errcode = '55000';
  end if;
end
$apply_guard$;

create temporary table team_public_name_1_before
on commit drop
as
select t.id, to_jsonb(t) as row_state
from public.teams t;

alter table public.teams
  add column public_name text,
  add constraint teams_public_name_valid_check
    check (
      public_name is null
      or (
        public_name = btrim(public_name)
        and char_length(public_name) between 1 and 80
        and public_name !~ '[[:cntrl:]]'
      )
    );

comment on column public.teams.public_name is
  'Nome editorial usado na apresentação pública do clube. Não é uma sigla nem um alias e não deve ser usado para resolução canónica.';

create table public.team_public_name_audit_events (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null,
  action text not null,
  actor_type text not null,
  actor_reference text not null,
  source text not null,
  before_state jsonb not null,
  after_state jsonb not null,
  request_reference text not null,
  created_at timestamptz not null default now(),
  constraint team_public_name_audit_events_team_id_fkey
    foreign key (team_id)
    references public.teams(id)
    on delete restrict,
  constraint team_public_name_audit_events_action_check
    check (action in ('set', 'update', 'clear')),
  constraint team_public_name_audit_events_actor_type_not_blank_check
    check (btrim(actor_type) <> ''),
  constraint team_public_name_audit_events_actor_reference_not_blank_check
    check (btrim(actor_reference) <> ''),
  constraint team_public_name_audit_events_source_not_blank_check
    check (btrim(source) <> ''),
  constraint team_public_name_audit_events_request_reference_not_blank_check
    check (btrim(request_reference) <> ''),
  constraint team_public_name_audit_events_before_state_object_check
    check (jsonb_typeof(before_state) = 'object'),
  constraint team_public_name_audit_events_after_state_object_check
    check (jsonb_typeof(after_state) = 'object')
);

create index team_public_name_audit_events_team_created_at_idx
  on public.team_public_name_audit_events (team_id, created_at desc);

create index team_public_name_audit_events_created_at_idx
  on public.team_public_name_audit_events (created_at desc);

create function public.manage_team_public_name(
  p_team_id uuid,
  p_public_name text,
  p_actor_type text,
  p_actor_reference text,
  p_source text,
  p_request_reference text
)
returns table (
  result_team_id uuid,
  result_public_name text,
  result_changed boolean,
  result_audit_event_id uuid
)
language plpgsql
security definer
set search_path = pg_catalog
as $manage$
declare
  v_public_name text := nullif(btrim(p_public_name), '');
  v_actor_type text := btrim(p_actor_type);
  v_actor_reference text := btrim(p_actor_reference);
  v_source text := btrim(p_source);
  v_request_reference text := btrim(p_request_reference);
  v_before public.teams%rowtype;
  v_after public.teams%rowtype;
  v_action text;
  v_audit_event_id uuid;
begin
  if p_team_id is null then
    raise exception 'team_public_name_team_id_required' using errcode = '22023';
  end if;

  if v_actor_type is null or v_actor_type = '' then
    raise exception 'team_public_name_actor_type_required' using errcode = '22023';
  end if;

  if v_actor_reference is null or v_actor_reference = '' then
    raise exception 'team_public_name_actor_reference_required' using errcode = '22023';
  end if;

  if v_source is null or v_source = '' then
    raise exception 'team_public_name_source_required' using errcode = '22023';
  end if;

  if v_request_reference is null or v_request_reference = '' then
    raise exception 'team_public_name_request_reference_required' using errcode = '22023';
  end if;

  if v_public_name is not null
     and (char_length(v_public_name) > 80 or v_public_name ~ '[[:cntrl:]]') then
    raise exception 'team_public_name_value_invalid' using errcode = '22023';
  end if;

  select t.*
  into v_before
  from public.teams t
  where t.id = p_team_id
  for update;

  if not found then
    raise exception 'team_public_name_team_not_found' using errcode = 'P0002';
  end if;

  if v_before.public_name is not distinct from v_public_name then
    return query
    select v_before.id, v_before.public_name, false, null::uuid;
    return;
  end if;

  v_action := case
    when v_before.public_name is null then 'set'
    when v_public_name is null then 'clear'
    else 'update'
  end;

  update public.teams t
  set public_name = v_public_name
  where t.id = v_before.id
  returning t.* into v_after;

  insert into public.team_public_name_audit_events (
    team_id,
    action,
    actor_type,
    actor_reference,
    source,
    before_state,
    after_state,
    request_reference
  ) values (
    v_after.id,
    v_action,
    v_actor_type,
    v_actor_reference,
    v_source,
    jsonb_build_object(
      'team_id', v_before.id,
      'name', v_before.name,
      'public_name', v_before.public_name
    ),
    jsonb_build_object(
      'team_id', v_after.id,
      'name', v_after.name,
      'public_name', v_after.public_name
    ),
    v_request_reference
  )
  returning id into v_audit_event_id;

  return query
  select v_after.id, v_after.public_name, true, v_audit_event_id;
end
$manage$;

alter function public.manage_team_public_name(uuid,text,text,text,text,text) owner to postgres;
revoke all on function public.manage_team_public_name(uuid,text,text,text,text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.manage_team_public_name(uuid,text,text,text,text,text)
  to service_role;

alter table public.team_public_name_audit_events enable row level security;
revoke all on table public.team_public_name_audit_events
  from public, anon, authenticated, service_role;
grant select on table public.team_public_name_audit_events to service_role;

do $preservation_assertions$
declare
  v_before_count bigint;
  v_after_count bigint;
  v_before_checksum text;
  v_after_checksum text;
begin
  if exists (
    select 1
    from team_public_name_1_before b
    full join public.teams t on t.id = b.id
    where b.id is null
       or t.id is null
       or b.row_state is distinct from (to_jsonb(t) - 'public_name')
  ) then
    raise exception 'apply_teams_preservation_assertion_failed' using errcode = '55000';
  end if;

  select
    count(*),
    md5(coalesce(string_agg(md5(b.row_state::text), '' order by b.id::text), ''))
  into v_before_count, v_before_checksum
  from team_public_name_1_before b;

  select
    count(*),
    md5(coalesce(string_agg(md5((to_jsonb(t) - 'public_name')::text), '' order by t.id::text), ''))
  into v_after_count, v_after_checksum
  from public.teams t;

  if v_before_count <> v_after_count or v_before_checksum is distinct from v_after_checksum then
    raise exception 'apply_teams_count_or_checksum_changed' using errcode = '55000';
  end if;

  if exists (select 1 from public.teams t where t.public_name is not null) then
    raise exception 'apply_unexpected_public_name_backfill' using errcode = '55000';
  end if;

  if exists (select 1 from public.team_public_name_audit_events) then
    raise exception 'apply_unexpected_audit_event' using errcode = '55000';
  end if;

  raise notice 'apply_preserved_team_count=%', v_after_count;
  raise notice 'apply_preserved_team_checksum=%', v_after_checksum;
end
$preservation_assertions$;

commit;
