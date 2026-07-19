-- JORNADA-BACKOFFICE-CLUBES-ALIASES-IMPORTACAO-LOTE-RPC-1
-- SQL 2/4 - APLICAR
--
-- Cria apenas a RPC batch. A propria chamada PostgREST constitui uma unica
-- transacao: o plano completo e construido antes da primeira mutacao e uma
-- excecao inesperada propagada pela RPC unitaria reverte toda a chamada.

begin;

do $apply_guard$
declare
  v_manage_oid oid := to_regprocedure(
    'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
  );
begin
  if v_manage_oid is null
     or to_regprocedure('public.normalize_team_identity_v1(text)') is null
     or to_regclass('public.teams') is null
     or to_regclass('public.countries') is null
     or to_regclass('public.team_aliases') is null
     or to_regclass('public.team_alias_audit_events') is null then
    raise exception 'apply_required_alias_contract_missing'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_alias_batch'
  ) then
    raise exception 'apply_manage_team_alias_batch_already_exists'
      using errcode = '42723';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_proc p
    where p.oid = v_manage_oid
      and p.prosecdef
      and pg_catalog.pg_get_userbyid(p.proowner) = 'postgres'
      and p.proconfig is not distinct from array['search_path=pg_catalog']::text[]
  ) then
    raise exception 'apply_manage_team_alias_security_contract_unexpected'
      using errcode = '55000';
  end if;
end
$apply_guard$;

-- Estabilizar os objetos lidos e os snapshots durante esta curta migracao.
-- SHARE e compativel com leituras, mas impede DML/DDL concorrente de produzir
-- um falso positivo nas assercoes de preservacao.
lock table public.countries in share mode;
lock table public.teams in share mode;
lock table public.team_aliases in share mode;
lock table public.team_alias_audit_events in share mode;

-- Snapshots transacionais: as assercoes finais provam que este script nao
-- alterou dados nem estrutura das duas tabelas auditaveis.
create temporary table team_alias_batch_1_aliases_before
on commit drop
as table public.team_aliases;

create temporary table team_alias_batch_1_audits_before
on commit drop
as table public.team_alias_audit_events;

create temporary table team_alias_batch_1_structure_before
on commit drop
as
select snapshot.category, snapshot.definition
from (
  select
    'columns'::text as category,
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_oid', a.attrelid,
          'attnum', a.attnum,
          'name', a.attname,
          'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
          'not_null', a.attnotnull,
          'identity', a.attidentity,
          'generated', a.attgenerated,
          'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
        )
        order by a.attrelid, a.attnum
      ),
      '[]'::jsonb
    ) as definition
  from pg_catalog.pg_attribute a
  left join pg_catalog.pg_attrdef d
    on d.adrelid = a.attrelid
   and d.adnum = a.attnum
  where a.attrelid in (
      'public.team_aliases'::regclass,
      'public.team_alias_audit_events'::regclass
    )
    and a.attnum > 0
    and not a.attisdropped

  union all

  select
    'constraints',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_oid', c.conrelid,
          'name', c.conname,
          'type', c.contype,
          'definition', pg_catalog.pg_get_constraintdef(c.oid)
        )
        order by c.conrelid, c.conname
      ),
      '[]'::jsonb
    )
  from pg_catalog.pg_constraint c
  where c.conrelid in (
    'public.team_aliases'::regclass,
    'public.team_alias_audit_events'::regclass
  )

  union all

  select
    'indexes',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_oid', i.indrelid,
          'name', ci.relname,
          'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
        )
        order by i.indrelid, ci.relname
      ),
      '[]'::jsonb
    )
  from pg_catalog.pg_index i
  join pg_catalog.pg_class ci on ci.oid = i.indexrelid
  where i.indrelid in (
    'public.team_aliases'::regclass,
    'public.team_alias_audit_events'::regclass
  )

  union all

  select
    'security',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_oid', c.oid,
          'rls', c.relrowsecurity,
          'force_rls', c.relforcerowsecurity,
          'acl', c.relacl
        )
        order by c.oid
      ),
      '[]'::jsonb
    )
  from pg_catalog.pg_class c
  where c.oid in (
    'public.team_aliases'::regclass,
    'public.team_alias_audit_events'::regclass
  )

  union all

  select
    'policies',
    coalesce(
      jsonb_agg(
        jsonb_build_object(
          'table_oid', p.polrelid,
          'name', p.polname,
          'command', p.polcmd,
          'roles', p.polroles,
          'qual', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
          'with_check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
        )
        order by p.polrelid, p.polname
      ),
      '[]'::jsonb
    )
  from pg_catalog.pg_policy p
  where p.polrelid in (
    'public.team_aliases'::regclass,
    'public.team_alias_audit_events'::regclass
  )
) snapshot;

create function public.manage_team_alias_batch(
  p_country_id uuid,
  p_rows jsonb,
  p_apply boolean,
  p_actor_type text,
  p_actor_reference text,
  p_source text,
  p_request_reference text
)
returns table (
  line_number integer,
  canonical_club_input text,
  alias_input text,
  normalized_alias text,
  resolved_team_id uuid,
  resolved_team_name text,
  result_team_alias_id uuid,
  result_status text,
  result_code text,
  blocking boolean,
  changed boolean,
  batch_can_apply boolean,
  batch_requested_apply boolean,
  batch_create_count integer,
  batch_existing_active_count integer,
  batch_blocking_count integer,
  batch_created_count integer,
  batch_noop boolean
)
language plpgsql
security definer
set search_path = pg_catalog
as $manage_batch$
declare
  v_actor_type text := btrim(p_actor_type);
  v_actor_reference text := btrim(p_actor_reference);
  v_source text := btrim(p_source);
  v_request_reference text := btrim(p_request_reference);
  v_plan jsonb;
  v_blocking_count integer := 0;
  v_create_count integer := 0;
  v_existing_active_count integer := 0;
  v_created_count integer := 0;
  v_created_by_ordinal jsonb := '{}'::jsonb;
  v_row record;
  v_mutation record;
begin
  if p_country_id is null then
    raise exception 'team_alias_batch_country_id_required'
      using errcode = '22023';
  end if;

  if p_apply is null then
    raise exception 'team_alias_batch_apply_required'
      using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'team_alias_batch_rows_must_be_array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'team_alias_batch_rows_required'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'team_alias_batch_rows_limit_exceeded'
      using errcode = '22023';
  end if;

  if v_actor_type is null or v_actor_type = '' then
    raise exception 'team_alias_batch_actor_type_required'
      using errcode = '22023';
  end if;

  if v_actor_reference is null or v_actor_reference = '' then
    raise exception 'team_alias_batch_actor_reference_required'
      using errcode = '22023';
  end if;

  if v_source is null or v_source = '' then
    raise exception 'team_alias_batch_source_required'
      using errcode = '22023';
  end if;

  if v_request_reference is null or v_request_reference = '' then
    raise exception 'team_alias_batch_request_reference_required'
      using errcode = '22023';
  end if;

  if p_apply then
    -- Um lock batch global serializa importacoes; os locks de tabela repetem
    -- exatamente a ordem da RPC unitaria: teams antes de team_aliases.
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('team_alias_batch:v1', 0)
    );

    -- Estabilizar a existencia do pais antes dos locks de tabelas evita um
    -- ciclo com uma eventual eliminacao do pais que precise alterar teams.
    perform 1
    from public.countries c
    where c.id = p_country_id
    for key share;

    if not found then
      raise exception 'team_alias_batch_country_not_found'
        using errcode = '23503';
    end if;

    lock table public.teams in share mode;
    lock table public.team_aliases in share row exclusive mode;
  elsif not exists (
    select 1
    from public.countries c
    where c.id = p_country_id
  ) then
    raise exception 'team_alias_batch_country_not_found'
      using errcode = '23503';
  end if;

  with raw_rows as (
    select
      item.input_ordinal::integer as input_ordinal,
      item.row_value,
      jsonb_typeof(item.row_value) = 'object' as is_object,
      case
        when jsonb_typeof(item.row_value) = 'object' then
          item.row_value ?& array['lineNumber', 'canonicalClub', 'alias']::text[]
          and not exists (
            select 1
            from jsonb_object_keys(item.row_value) as row_key(key_name)
            where key_name not in ('lineNumber', 'canonicalClub', 'alias')
          )
        else false
      end as has_exact_fields,
      case
        when jsonb_typeof(item.row_value -> 'lineNumber') = 'number'
         and (item.row_value ->> 'lineNumber') ~ '^[0-9]+$'
         and length(item.row_value ->> 'lineNumber') <= 10
          then case
            when (item.row_value ->> 'lineNumber')::numeric between 1 and 2147483647
              then (item.row_value ->> 'lineNumber')::integer
            else null
          end
        else null
      end as parsed_line_number,
      case
        when jsonb_typeof(item.row_value -> 'canonicalClub') = 'string'
          then btrim(item.row_value ->> 'canonicalClub')
        else null
      end as parsed_canonical_club,
      case
        when jsonb_typeof(item.row_value -> 'alias') = 'string'
          then btrim(item.row_value ->> 'alias')
        else null
      end as parsed_alias
    from jsonb_array_elements(p_rows) with ordinality
      as item(row_value, input_ordinal)
  ),
  normalized_rows as (
    select
      r.*,
      case
        when r.parsed_canonical_club is not null
          then public.normalize_team_identity_v1(r.parsed_canonical_club)
        else null
      end as normalized_canonical_club,
      case
        when r.parsed_alias is not null
          then public.normalize_team_identity_v1(r.parsed_alias)
        else null
      end as parsed_normalized_alias
    from raw_rows r
  ),
  base_validation as (
    select
      n.*,
      case
        when not n.is_object then 'invalid_row_not_object'
        when not n.has_exact_fields then 'invalid_row_fields'
        when n.parsed_line_number is null then 'invalid_line_number'
        when n.parsed_canonical_club is null or n.parsed_canonical_club = ''
          then 'canonical_club_required'
        when n.normalized_canonical_club is null or n.normalized_canonical_club = ''
          then 'canonical_club_normalized_empty'
        when n.parsed_alias is null or n.parsed_alias = '' then 'alias_required'
        when char_length(n.parsed_alias) > 160 then 'alias_too_long'
        when n.parsed_normalized_alias is null or n.parsed_normalized_alias = ''
          then 'normalized_alias_empty'
        else null
      end as base_error
    from normalized_rows n
  ),
  line_number_validation as (
    select
      b.*,
      count(*) filter (where b.parsed_line_number is not null)
        over (partition by b.parsed_line_number) as line_number_count
    from base_validation b
  ),
  validatable_rows as (
    select
      l.*,
      case
        when l.base_error is not null then l.base_error
        when l.line_number_count > 1 then 'duplicate_line_number'
        else null
      end as row_error
    from line_number_validation l
  ),
  batch_alias_validation as (
    select
      v.*,
      count(*) filter (where v.row_error is null)
        over (partition by v.parsed_normalized_alias) as normalized_alias_count
    from validatable_rows v
  ),
  team_identities as materialized (
    select distinct
      identity_source.team_id,
      identity_source.team_name,
      identity_source.country_id,
      identity_source.identity_key
    from (
      select
        t.id as team_id,
        t.name as team_name,
        t.country_id,
        public.normalize_team_identity_v1(identity_value.field_value) as identity_key
      from public.teams t
      cross join lateral (
        values (t.name), (t.short_name), (t.slug), (t.code)
      ) identity_value(field_value)
      where identity_value.field_value is not null
    ) identity_source
    where identity_source.identity_key <> ''
  ),
  resolved_rows as (
    select
      b.*,
      coalesce(resolution.candidate_count, 0)::integer as candidate_count,
      case when resolution.candidate_count = 1 then resolution.team_id else null end
        as server_team_id,
      case when resolution.candidate_count = 1 then resolution.team_name else null end
        as server_team_name
    from batch_alias_validation b
    left join lateral (
      select
        count(*)::integer as candidate_count,
        (array_agg(i.team_id order by i.team_id))[1] as team_id,
        min(i.team_name) as team_name
      from team_identities i
      where i.country_id = p_country_id
        and i.identity_key = b.normalized_canonical_club
    ) resolution on b.row_error is null
  ),
  enriched_rows as (
    select
      r.*,
      existing.id as existing_alias_id,
      existing.team_id as existing_team_id,
      existing.status as existing_status,
      exists (
        select 1
        from team_identities i
        where i.identity_key = r.parsed_normalized_alias
          and i.team_id <> r.server_team_id
      ) as conflicts_other_canonical_identity,
      exists (
        select 1
        from team_identities i
        where i.identity_key = r.parsed_normalized_alias
          and i.team_id = r.server_team_id
      ) as repeats_same_canonical_identity
    from resolved_rows r
    left join public.team_aliases existing
      on existing.normalized_alias = r.parsed_normalized_alias
  ),
  statuses as (
    select
      e.*,
      case
        when e.row_error is not null then 'invalid_row'
        when e.normalized_alias_count > 1 then 'duplicate_alias_in_batch'
        when e.candidate_count = 0 then 'unknown_club'
        when e.candidate_count > 1 then 'ambiguous_club'
        when e.existing_alias_id is not null
         and e.existing_team_id <> e.server_team_id
          then 'alias_conflict_other_team'
        when e.existing_alias_id is not null
         and e.existing_team_id = e.server_team_id
         and e.existing_status = 'inactive'
          then 'existing_inactive_same_team'
        when e.existing_alias_id is not null
         and e.existing_team_id = e.server_team_id
         and e.existing_status = 'active'
          then 'existing_active_same_team'
        when e.conflicts_other_canonical_identity
          then 'canonical_identity_conflict_other_team'
        when e.repeats_same_canonical_identity
          then 'redundant_same_team_identity'
        else 'create'
      end as planned_status
    from enriched_rows e
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'input_ordinal', s.input_ordinal,
        'line_number', s.parsed_line_number,
        'canonical_club_input', s.parsed_canonical_club,
        'alias_input', s.parsed_alias,
        'normalized_alias', s.parsed_normalized_alias,
        'resolved_team_id', s.server_team_id,
        'resolved_team_name', s.server_team_name,
        'existing_alias_id', s.existing_alias_id,
        'result_status', s.planned_status,
        'result_code', case
          when s.planned_status = 'invalid_row' then s.row_error
          when s.planned_status = 'existing_active_same_team' then 'noop_existing_active'
          when s.planned_status = 'create' then 'create_ready'
          else s.planned_status
        end,
        'blocking', s.planned_status not in ('create', 'existing_active_same_team')
      )
      order by s.input_ordinal
    ),
    '[]'::jsonb
  )
  into v_plan
  from statuses s;

  select
    count(*) filter (where p.blocking)::integer,
    count(*) filter (where p.result_status = 'create')::integer,
    count(*) filter (where p.result_status = 'existing_active_same_team')::integer
  into v_blocking_count, v_create_count, v_existing_active_count
  from jsonb_to_recordset(v_plan) as p(
    blocking boolean,
    result_status text
  );

  if p_apply and v_blocking_count = 0 then
    -- A ordem lexical evita aquisicoes divergentes das mesmas chaves entre
    -- lotes. A RPC unitaria volta a adquirir o mesmo advisory lock, de forma
    -- reentrante, e repete as garantias de conflito antes de inserir.
    for v_row in
      select p.normalized_alias
      from jsonb_to_recordset(v_plan) as p(
        normalized_alias text,
        result_status text
      )
      where p.result_status = 'create'
      order by p.normalized_alias
    loop
      perform pg_catalog.pg_advisory_xact_lock(
        pg_catalog.hashtextextended(
          'team_alias:v1:' || v_row.normalized_alias,
          0
        )
      );
    end loop;

    for v_row in
      select
        p.input_ordinal,
        p.alias_input,
        p.normalized_alias,
        p.resolved_team_id
      from jsonb_to_recordset(v_plan) as p(
        input_ordinal integer,
        alias_input text,
        normalized_alias text,
        resolved_team_id uuid,
        result_status text
      )
      where p.result_status = 'create'
      order by p.normalized_alias, p.input_ordinal
    loop
      select mutation.*
      into v_mutation
      from public.manage_team_alias(
        'create'::text,
        v_actor_type,
        v_actor_reference,
        v_source,
        null::uuid,
        v_row.resolved_team_id,
        v_row.alias_input,
        v_request_reference
      ) mutation;

      if not found then
        raise exception 'team_alias_batch_create_returned_no_row'
          using errcode = '55000';
      end if;

      if v_mutation.result_changed is distinct from true
         or v_mutation.result_code is distinct from 'created'
         or v_mutation.result_team_id is distinct from v_row.resolved_team_id
         or v_mutation.result_normalized_alias is distinct from v_row.normalized_alias then
        raise exception 'team_alias_batch_unexpected_create_result'
          using errcode = '55000';
      end if;

      v_created_by_ordinal := v_created_by_ordinal || jsonb_build_object(
        v_row.input_ordinal::text,
        v_mutation.result_team_alias_id
      );
      v_created_count := v_created_count + 1;
    end loop;

    if v_created_count <> v_create_count then
      raise exception 'team_alias_batch_created_count_mismatch'
        using errcode = '55000';
    end if;
  end if;

  return query
  select
    p.line_number,
    p.canonical_club_input,
    p.alias_input,
    p.normalized_alias,
    p.resolved_team_id,
    p.resolved_team_name,
    coalesce(
      (v_created_by_ordinal ->> p.input_ordinal::text)::uuid,
      p.existing_alias_id
    ) as result_team_alias_id,
    p.result_status,
    case
      when v_created_by_ordinal ? p.input_ordinal::text then 'created'
      else p.result_code
    end as result_code,
    p.blocking,
    v_created_by_ordinal ? p.input_ordinal::text as changed,
    v_blocking_count = 0 as batch_can_apply,
    p_apply as batch_requested_apply,
    v_create_count as batch_create_count,
    v_existing_active_count as batch_existing_active_count,
    v_blocking_count as batch_blocking_count,
    v_created_count as batch_created_count,
    v_blocking_count = 0 and v_create_count = 0 as batch_noop
  from jsonb_to_recordset(v_plan) as p(
    input_ordinal integer,
    line_number integer,
    canonical_club_input text,
    alias_input text,
    normalized_alias text,
    resolved_team_id uuid,
    resolved_team_name text,
    existing_alias_id uuid,
    result_status text,
    result_code text,
    blocking boolean
  )
  order by p.input_ordinal;
end
$manage_batch$;

alter function public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)
  owner to postgres;

revoke all on function public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)
  from public, anon, authenticated, service_role;

grant execute on function public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)
  to service_role;

do $preservation_assertions$
declare
  v_structure_after jsonb;
begin
  if exists (
    select 1
    from team_alias_batch_1_aliases_before b
    full join public.team_aliases a on a.id = b.id
    where b.id is null
       or a.id is null
       or to_jsonb(a) is distinct from to_jsonb(b)
  ) then
    raise exception 'apply_team_aliases_data_changed'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from team_alias_batch_1_audits_before b
    full join public.team_alias_audit_events e on e.id = b.id
    where b.id is null
       or e.id is null
       or to_jsonb(e) is distinct from to_jsonb(b)
  ) then
    raise exception 'apply_team_alias_audit_events_data_changed'
      using errcode = '55000';
  end if;

  with structure_after as (
    select snapshot.category, snapshot.definition
    from (
      select
        'columns'::text as category,
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table_oid', a.attrelid,
              'attnum', a.attnum,
              'name', a.attname,
              'type', pg_catalog.format_type(a.atttypid, a.atttypmod),
              'not_null', a.attnotnull,
              'identity', a.attidentity,
              'generated', a.attgenerated,
              'default', pg_catalog.pg_get_expr(d.adbin, d.adrelid)
            )
            order by a.attrelid, a.attnum
          ),
          '[]'::jsonb
        ) as definition
      from pg_catalog.pg_attribute a
      left join pg_catalog.pg_attrdef d
        on d.adrelid = a.attrelid
       and d.adnum = a.attnum
      where a.attrelid in (
          'public.team_aliases'::regclass,
          'public.team_alias_audit_events'::regclass
        )
        and a.attnum > 0
        and not a.attisdropped

      union all

      select
        'constraints',
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table_oid', c.conrelid,
              'name', c.conname,
              'type', c.contype,
              'definition', pg_catalog.pg_get_constraintdef(c.oid)
            )
            order by c.conrelid, c.conname
          ),
          '[]'::jsonb
        )
      from pg_catalog.pg_constraint c
      where c.conrelid in (
        'public.team_aliases'::regclass,
        'public.team_alias_audit_events'::regclass
      )

      union all

      select
        'indexes',
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table_oid', i.indrelid,
              'name', ci.relname,
              'definition', pg_catalog.pg_get_indexdef(i.indexrelid)
            )
            order by i.indrelid, ci.relname
          ),
          '[]'::jsonb
        )
      from pg_catalog.pg_index i
      join pg_catalog.pg_class ci on ci.oid = i.indexrelid
      where i.indrelid in (
        'public.team_aliases'::regclass,
        'public.team_alias_audit_events'::regclass
      )

      union all

      select
        'security',
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table_oid', c.oid,
              'rls', c.relrowsecurity,
              'force_rls', c.relforcerowsecurity,
              'acl', c.relacl
            )
            order by c.oid
          ),
          '[]'::jsonb
        )
      from pg_catalog.pg_class c
      where c.oid in (
        'public.team_aliases'::regclass,
        'public.team_alias_audit_events'::regclass
      )

      union all

      select
        'policies',
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'table_oid', p.polrelid,
              'name', p.polname,
              'command', p.polcmd,
              'roles', p.polroles,
              'qual', pg_catalog.pg_get_expr(p.polqual, p.polrelid),
              'with_check', pg_catalog.pg_get_expr(p.polwithcheck, p.polrelid)
            )
            order by p.polrelid, p.polname
          ),
          '[]'::jsonb
        )
      from pg_catalog.pg_policy p
      where p.polrelid in (
        'public.team_aliases'::regclass,
        'public.team_alias_audit_events'::regclass
      )
    ) snapshot
  )
  select jsonb_agg(
    jsonb_build_object('category', s.category, 'definition', s.definition)
    order by s.category
  )
  into v_structure_after
  from structure_after s;

  if v_structure_after is distinct from (
    select jsonb_agg(
      jsonb_build_object('category', b.category, 'definition', b.definition)
      order by b.category
    )
    from team_alias_batch_1_structure_before b
  ) then
    raise exception 'apply_alias_table_structure_changed'
      using errcode = '55000';
  end if;

  if to_regprocedure(
    'public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)'
  ) is null then
    raise exception 'apply_manage_team_alias_batch_missing_after_create'
      using errcode = '55000';
  end if;
end
$preservation_assertions$;

commit;
