-- Jornada.pt - criacao transacional de clubes em lote.
-- Cria apenas o RPC desta fase. Nao cria tabelas nem altera constraints.

begin;

do $apply_guard$
begin
  if to_regclass('public.teams') is null
     or to_regclass('public.countries') is null
     or to_regclass('public.team_aliases') is null
     or to_regclass('public.team_alias_audit_events') is null
     or to_regclass('public.team_public_name_audit_events') is null then
    raise exception 'apply_required_table_missing'
      using errcode = '42P01';
  end if;

  if to_regprocedure('public.normalize_team_identity_v1(text)') is null
     or to_regprocedure(
       'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
     ) is null
     or to_regprocedure(
       'public.manage_team_public_name(uuid,text,text,text,text,text)'
     ) is null then
    raise exception 'apply_required_rpc_missing'
      using errcode = '42883';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_creation_batch'
      and p.oid <> coalesce(
        to_regprocedure(
          'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)'
        ),
        0::oid
      )
  ) then
    raise exception 'apply_manage_team_creation_batch_conflicting_signature'
      using errcode = '42723';
  end if;
end
$apply_guard$;

create or replace function public.manage_team_creation_batch(
  p_country_id uuid,
  p_rows jsonb,
  p_apply boolean,
  p_confirmed_preview_fingerprint text,
  p_confirmed_complete_existing_lines jsonb,
  p_actor_type text,
  p_actor_reference text,
  p_source text,
  p_request_reference text
)
returns table (
  line_number integer,
  result_status text,
  reason_code text,
  reason_message text,
  proposed_identity jsonb,
  resolved_team_id uuid,
  existing_identity jsonb,
  conflicts jsonb,
  normalized_aliases jsonb,
  proposed_action text,
  final_team_id uuid,
  changed boolean,
  batch_applied boolean,
  batch_total_count integer,
  batch_create_count integer,
  batch_existing_count integer,
  batch_complete_existing_count integer,
  batch_probable_count integer,
  batch_ambiguous_count integer,
  batch_conflict_count integer,
  batch_invalid_count integer,
  batch_blocking_count integer,
  batch_can_apply boolean,
  batch_created_count integer,
  batch_completed_existing_count integer,
  batch_existing_result_count integer,
  batch_aliases_created_count integer,
  batch_aliases_unchanged_count integer,
  batch_public_names_changed_count integer,
  batch_integrally_applied boolean,
  preview_fingerprint text
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
  v_country_active boolean;
  v_input record;
  v_row jsonb;
  v_input_ordinal integer;
  v_line_number integer;
  v_name text;
  v_public_name text;
  v_short_name text;
  v_code text;
  v_slug text;
  v_logo_url text;
  v_primary_color text;
  v_normalized_name text;
  v_normalized_short_name text;
  v_normalized_code text;
  v_identity_keys text[];
  v_aliases jsonb;
  v_alias_keys text[];
  v_valid boolean;
  v_status text;
  v_reason_code text;
  v_reason_message text;
  v_conflicts jsonb;
  v_proposed_action text;
  v_candidate_ids uuid[];
  v_exact_ids uuid[];
  v_candidate_count integer;
  v_exact_count integer;
  v_ambiguous_key_count integer;
  v_resolved_team_id uuid;
  v_conflict_team_id uuid;
  v_slug_team_id uuid;
  v_existing public.teams%rowtype;
  v_existing_identity jsonb;
  v_structural_compatible boolean;
  v_optional_compatible boolean;
  v_aliases_all_active boolean;
  v_plan jsonb := '[]'::jsonb;
  v_preview_fingerprint text;
  v_confirmed_lines integer[] := array[]::integer[];
  v_total_count integer := 0;
  v_create_count integer := 0;
  v_existing_count integer := 0;
  v_complete_existing_count integer := 0;
  v_probable_count integer := 0;
  v_ambiguous_count integer := 0;
  v_conflict_count integer := 0;
  v_invalid_count integer := 0;
  v_blocking_count integer := 0;
  v_created_count integer := 0;
  v_completed_existing_count integer := 0;
  v_aliases_created_count integer := 0;
  v_aliases_unchanged_count integer := 0;
  v_public_names_changed_count integer := 0;
  v_final_ids jsonb := '{}'::jsonb;
  v_changed_rows jsonb := '{}'::jsonb;
  v_plan_row record;
  v_alias_row record;
  v_alias_result record;
  v_public_name_result record;
  v_final_id uuid;
begin
  if p_country_id is null then
    raise exception 'team_creation_batch_country_id_required'
      using errcode = '22023';
  end if;

  if p_apply is null then
    raise exception 'team_creation_batch_apply_required'
      using errcode = '22023';
  end if;

  if p_rows is null or jsonb_typeof(p_rows) <> 'array' then
    raise exception 'team_creation_batch_rows_must_be_array'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) = 0 then
    raise exception 'team_creation_batch_rows_required'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_rows) > 500 then
    raise exception 'team_creation_batch_rows_limit_exceeded'
      using errcode = '22023';
  end if;

  if v_actor_type is null or v_actor_type = '' then
    raise exception 'team_creation_batch_actor_type_required'
      using errcode = '22023';
  end if;

  if v_actor_reference is null or v_actor_reference = '' then
    raise exception 'team_creation_batch_actor_reference_required'
      using errcode = '22023';
  end if;

  if v_source is null or v_source = '' then
    raise exception 'team_creation_batch_source_required'
      using errcode = '22023';
  end if;

  if v_request_reference is null or v_request_reference = '' then
    raise exception 'team_creation_batch_request_reference_required'
      using errcode = '22023';
  end if;

  if p_confirmed_complete_existing_lines is not null
     and jsonb_typeof(p_confirmed_complete_existing_lines) <> 'array' then
    raise exception 'team_creation_batch_confirmed_lines_must_be_array'
      using errcode = '22023';
  end if;

  if p_confirmed_complete_existing_lines is not null and exists (
    select 1
      from jsonb_array_elements(p_confirmed_complete_existing_lines) e(value)
      where case
        when jsonb_typeof(e.value) = 'number'
         and (e.value #>> '{}') ~ '^[1-9][0-9]*$'
        then (e.value #>> '{}')::numeric <= 2147483647
        else false
      end is not true
  ) then
    raise exception 'team_creation_batch_confirmed_line_invalid'
      using errcode = '22023';
  end if;

  if p_confirmed_complete_existing_lines is not null then
    select coalesce(array_agg((e.value #>> '{}')::integer), array[]::integer[])
    into v_confirmed_lines
    from jsonb_array_elements(p_confirmed_complete_existing_lines) e(value);

    if cardinality(v_confirmed_lines) <>
       cardinality(array(select distinct unnest(v_confirmed_lines))) then
      raise exception 'team_creation_batch_confirmed_lines_duplicated'
        using errcode = '22023';
    end if;
  end if;

  if p_apply then
    if nullif(btrim(p_confirmed_preview_fingerprint), '') is null then
      raise exception 'team_creation_batch_preview_fingerprint_required'
        using errcode = '22023';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('team_creation_batch:v1', 0)
    );

    select c.is_active
    into v_country_active
    from public.countries c
    where c.id = p_country_id
    for key share;

    if not found then
      raise exception 'team_creation_batch_country_not_found'
        using errcode = '23503';
    end if;

    if not v_country_active then
      raise exception 'team_creation_batch_country_inactive'
        using errcode = '22023';
    end if;

    -- A ordem coincide com manage_team_alias: teams antes de team_aliases.
    lock table public.teams in share row exclusive mode;
    lock table public.team_aliases in share row exclusive mode;
  else
    select c.is_active
    into v_country_active
    from public.countries c
    where c.id = p_country_id;

    if not found then
      raise exception 'team_creation_batch_country_not_found'
        using errcode = '23503';
    end if;

    if not v_country_active then
      raise exception 'team_creation_batch_country_inactive'
        using errcode = '22023';
    end if;
  end if;

  for v_input in
    select e.value as row_value, e.ordinality::integer as input_ordinal
    from jsonb_array_elements(p_rows) with ordinality e(value, ordinality)
    order by e.ordinality
  loop
    v_row := v_input.row_value;
    v_input_ordinal := v_input.input_ordinal;
    v_line_number := v_input_ordinal;
    v_name := null;
    v_public_name := null;
    v_short_name := null;
    v_code := null;
    v_slug := null;
    v_logo_url := null;
    v_primary_color := null;
    v_normalized_name := null;
    v_normalized_short_name := null;
    v_normalized_code := null;
    v_identity_keys := array[]::text[];
    v_aliases := '[]'::jsonb;
    v_alias_keys := array[]::text[];
    v_valid := true;
    v_status := 'invalid';
    v_reason_code := 'invalid_row';
    v_reason_message := 'A linha nao respeita o contrato estruturado.';
    v_conflicts := '[]'::jsonb;
    v_proposed_action := 'block';
    v_candidate_ids := array[]::uuid[];
    v_exact_ids := array[]::uuid[];
    v_candidate_count := 0;
    v_exact_count := 0;
    v_ambiguous_key_count := 0;
    v_resolved_team_id := null;
    v_conflict_team_id := null;
    v_slug_team_id := null;
    v_existing := null;
    v_existing_identity := null;

    if jsonb_typeof(v_row) <> 'object' then
      v_valid := false;
      v_reason_code := 'invalid_object_shape';
      v_reason_message := 'A linha deve conter exatamente os nove campos suportados.';
    elsif not (v_row ?& array[
      'lineNumber', 'canonicalName', 'publicName', 'shortName', 'code',
      'slug', 'aliases', 'logoUrl', 'primaryColor'
    ]::text[]) or exists (
      select 1
      from jsonb_object_keys(v_row) k(key_name)
      where k.key_name not in (
        'lineNumber', 'canonicalName', 'publicName', 'shortName', 'code',
        'slug', 'aliases', 'logoUrl', 'primaryColor'
      )
    ) then
      v_valid := false;
      v_reason_code := 'invalid_object_shape';
      v_reason_message := 'A linha deve conter exatamente os nove campos suportados.';
    end if;

    if v_valid then
      if jsonb_typeof(v_row -> 'lineNumber') <> 'number'
         or (v_row ->> 'lineNumber') !~ '^[1-9][0-9]*$' then
        v_valid := false;
        v_reason_code := 'invalid_line_number';
        v_reason_message := 'lineNumber deve ser um inteiro positivo unico.';
      elsif (v_row ->> 'lineNumber')::numeric > 2147483647 then
        v_valid := false;
        v_reason_code := 'invalid_line_number';
        v_reason_message := 'lineNumber deve ser um inteiro positivo unico.';
      else
        v_line_number := (v_row ->> 'lineNumber')::integer;
      end if;
    end if;

    if v_valid and (
      jsonb_typeof(v_row -> 'canonicalName') <> 'string'
      or jsonb_typeof(v_row -> 'shortName') <> 'string'
      or jsonb_typeof(v_row -> 'slug') <> 'string'
      or jsonb_typeof(v_row -> 'aliases') <> 'array'
      or jsonb_typeof(v_row -> 'publicName') not in ('string', 'null')
      or jsonb_typeof(v_row -> 'code') not in ('string', 'null')
      or jsonb_typeof(v_row -> 'logoUrl') not in ('string', 'null')
      or jsonb_typeof(v_row -> 'primaryColor') not in ('string', 'null')
    ) then
      v_valid := false;
      v_reason_code := 'invalid_field_type';
      v_reason_message := 'Um ou mais campos tem um tipo JSON invalido.';
    end if;

    if v_valid then
      v_name := btrim(v_row ->> 'canonicalName');
      v_public_name := nullif(btrim(v_row ->> 'publicName'), '');
      v_short_name := btrim(v_row ->> 'shortName');
      v_code := case
        when jsonb_typeof(v_row -> 'code') = 'null' then null
        else btrim(v_row ->> 'code')
      end;
      v_slug := btrim(v_row ->> 'slug');
      v_logo_url := nullif(btrim(v_row ->> 'logoUrl'), '');
      v_primary_color := nullif(upper(btrim(v_row ->> 'primaryColor')), '');

      if v_name = '' or v_name ~ '[[:cntrl:]]' then
        v_valid := false;
        v_reason_code := 'canonical_name_invalid';
        v_reason_message := 'canonicalName e obrigatorio e nao pode conter controlos.';
      elsif v_short_name = '' or char_length(v_short_name) > 6
            or v_short_name ~ '[[:cntrl:]]' then
        v_valid := false;
        v_reason_code := 'short_name_invalid';
        v_reason_message := 'shortName e obrigatorio, sem controlos, com no maximo seis caracteres.';
      elsif v_public_name is not null and (
        char_length(v_public_name) > 80 or v_public_name ~ '[[:cntrl:]]'
      ) then
        v_valid := false;
        v_reason_code := 'public_name_invalid';
        v_reason_message := 'publicName viola a policy auditavel existente.';
      elsif jsonb_typeof(v_row -> 'code') = 'string'
            and (v_code = '' or v_code ~ '[[:cntrl:]]') then
        v_valid := false;
        v_reason_code := 'code_invalid';
        v_reason_message := 'code deve ser nulo ou texto normalizavel nao vazio.';
      elsif v_slug = ''
            or v_slug is distinct from public.normalize_team_identity_v1(v_slug) then
        v_valid := false;
        v_reason_code := 'slug_invalid';
        v_reason_message := 'slug e obrigatorio e deve estar na forma normalizada oficial.';
      elsif v_logo_url is not null
            and v_logo_url !~* '^https?://[^[:space:]]+$' then
        v_valid := false;
        v_reason_code := 'logo_url_invalid';
        v_reason_message := 'logoUrl deve ser nulo ou um URL HTTP/HTTPS sem espacos.';
      elsif v_primary_color is not null
            and v_primary_color !~ '^#[0-9A-F]{6}$' then
        v_valid := false;
        v_reason_code := 'primary_color_invalid';
        v_reason_message := 'primaryColor deve ser nula ou usar #RRGGBB.';
      end if;
    end if;

    if v_valid and exists (
      select 1
      from jsonb_array_elements(v_row -> 'aliases') a(value)
      where jsonb_typeof(a.value) <> 'string'
    ) then
      v_valid := false;
      v_reason_code := 'aliases_invalid_type';
      v_reason_message := 'aliases deve conter apenas strings.';
    end if;

    if v_valid then
      select
        coalesce(
          jsonb_agg(
            jsonb_build_object(
              'alias', parsed.alias_text,
              'normalized_alias', parsed.normalized_alias
            ) order by parsed.ordinality
          ),
          '[]'::jsonb
        ),
        coalesce(
          array_agg(parsed.normalized_alias order by parsed.ordinality),
          array[]::text[]
        )
      into v_aliases, v_alias_keys
      from (
        select
          a.ordinality,
          btrim(a.value #>> '{}') as alias_text,
          public.normalize_team_identity_v1(btrim(a.value #>> '{}')) as normalized_alias
        from jsonb_array_elements(v_row -> 'aliases')
          with ordinality a(value, ordinality)
      ) parsed;

      if exists (
        select 1
        from jsonb_array_elements(v_aliases) a(value)
        where a.value ->> 'alias' = ''
           or char_length(a.value ->> 'alias') > 160
           or a.value ->> 'alias' ~ '[[:cntrl:]]'
           or coalesce(a.value ->> 'normalized_alias', '') = ''
      ) then
        v_valid := false;
        v_reason_code := 'alias_invalid';
        v_reason_message := 'Cada alias deve ser nao vazio, normalizavel e ter no maximo 160 caracteres.';
      elsif cardinality(v_alias_keys) <>
            cardinality(array(select distinct unnest(v_alias_keys))) then
        v_valid := false;
        v_reason_code := 'duplicate_alias_in_row';
        v_reason_message := 'A linha contem aliases duplicados pela normalizacao oficial.';
      end if;
    end if;

    if v_valid then
      v_normalized_name := public.normalize_team_identity_v1(v_name);
      v_normalized_short_name := public.normalize_team_identity_v1(v_short_name);
      v_normalized_code := case
        when v_code is null then null
        else public.normalize_team_identity_v1(v_code)
      end;

      if v_normalized_name = '' or v_normalized_short_name = ''
         or (v_code is not null and coalesce(v_normalized_code, '') = '') then
        v_valid := false;
        v_reason_code := 'identity_not_normalizable';
        v_reason_message := 'Um identificador nao produz uma identidade normalizada valida.';
      else
        select array_agg(identity_key order by identity_key)
        into v_identity_keys
        from (
          select distinct identity_key
          from unnest(array[
            v_normalized_name,
            v_normalized_short_name,
            v_slug,
            v_normalized_code
          ]) identity(identity_key)
          where identity_key is not null and identity_key <> ''
        ) requested;
      end if;
    end if;

    if v_valid and v_alias_keys && v_identity_keys then
      v_valid := false;
      v_reason_code := 'alias_redundant_with_proposed_identity';
      v_reason_message := 'Um alias repete uma identidade proposta na mesma linha.';
    end if;

    if v_valid then
      with requested as (
        select unnest(v_identity_keys) as identity_key
      ), candidate_scores as (
        select
          t.id,
          t.code,
          count(*) filter (
            where exists (
              select 1
              from (values (t.name), (t.short_name), (t.slug), (t.code))
                identity(field_value)
              where identity.field_value is not null
                and public.normalize_team_identity_v1(identity.field_value) =
                  requested.identity_key
            ) or exists (
              select 1
              from public.team_aliases ta
              where ta.team_id = t.id
                and ta.status = 'active'
                and ta.normalized_alias = requested.identity_key
            )
          )::integer as matched_key_count
        from public.teams t
        cross join requested
        where t.country_id = p_country_id or t.country_id is null
        group by t.id, t.code
      ), classified_candidates as (
        select
          cs.id,
          cs.matched_key_count,
          cs.matched_key_count = cardinality(v_identity_keys)
          or (
            v_code is not null
            and cs.code is null
            and v_normalized_code <> all(array[
              v_normalized_name,
              v_normalized_short_name,
              v_slug
            ])
            and cs.matched_key_count = cardinality(v_identity_keys) - 1
          ) as is_exact
        from candidate_scores cs
      )
      select
        coalesce(
          array_agg(cs.id order by cs.id) filter (where cs.matched_key_count > 0),
          array[]::uuid[]
        ),
        coalesce(
          array_agg(cs.id order by cs.id) filter (where cs.is_exact),
          array[]::uuid[]
        )
      into v_candidate_ids, v_exact_ids
      from classified_candidates cs;

      v_candidate_count := cardinality(v_candidate_ids);
      v_exact_count := cardinality(v_exact_ids);

      with requested as (
        select unnest(v_identity_keys) as identity_key
      )
      select count(*)::integer
      into v_ambiguous_key_count
      from requested r
      where (
        select count(distinct t.id)
        from public.teams t
        where (t.country_id = p_country_id or t.country_id is null)
          and (
            exists (
              select 1
              from (values (t.name), (t.short_name), (t.slug), (t.code))
                identity(field_value)
              where identity.field_value is not null
                and public.normalize_team_identity_v1(identity.field_value) = r.identity_key
            ) or exists (
              select 1
              from public.team_aliases ta
              where ta.team_id = t.id
                and ta.status = 'active'
                and ta.normalized_alias = r.identity_key
            )
          )
      ) > 1;

      if v_exact_count = 1 then
        v_resolved_team_id := v_exact_ids[1];
        v_status := 'candidate';
      end if;

      select t.id
      into v_slug_team_id
      from public.teams t
      where t.slug = v_slug;

      select ta.team_id
      into v_conflict_team_id
      from public.team_aliases ta
      where ta.normalized_alias = any(v_identity_keys)
        and (v_resolved_team_id is null or ta.team_id <> v_resolved_team_id)
      order by ta.team_id
      limit 1;

      if v_slug_team_id is not null
         and (v_resolved_team_id is null or v_slug_team_id <> v_resolved_team_id) then
        v_status := 'conflict';
        v_reason_code := 'slug_conflict';
        v_reason_message := 'O slug global ja pertence a outro clube.';
        v_conflicts := jsonb_build_array(jsonb_build_object(
          'type', 'slug', 'team_id', v_slug_team_id, 'value', v_slug
        ));
      elsif v_conflict_team_id is not null then
        v_status := 'conflict';
        v_reason_code := 'canonical_identity_conflicts_with_alias';
        v_reason_message := 'Uma identidade proposta esta reservada como alias de outro clube.';
        v_conflicts := jsonb_build_array(jsonb_build_object(
          'type', 'identity_alias', 'team_id', v_conflict_team_id
        ));
      elsif v_exact_count = 1 and v_candidate_count > 1 then
        v_status := 'conflict';
        v_reason_code := 'identifiers_point_to_different_teams';
        v_reason_message := 'Apesar de existir um candidato integral, outro identificador aponta para outro clube.';
        v_conflicts := to_jsonb(v_candidate_ids);
      elsif v_exact_count > 1 then
        v_status := 'ambiguous';
        v_reason_code := 'multiple_exact_candidates';
        v_reason_message := 'Mais de um clube satisfaz integralmente a identidade proposta.';
        v_conflicts := to_jsonb(v_exact_ids);
      elsif v_exact_count = 0 and v_candidate_count > 1 then
        if v_ambiguous_key_count > 0 then
          v_status := 'ambiguous';
          v_reason_code := 'identity_ambiguous';
          v_reason_message := 'Pelo menos um identificador corresponde a varios clubes.';
        else
          v_status := 'conflict';
          v_reason_code := 'identifiers_point_to_different_teams';
          v_reason_message := 'Os identificadores propostos apontam para clubes diferentes.';
        end if;
        v_conflicts := to_jsonb(v_candidate_ids);
      elsif v_exact_count = 0 and v_candidate_count = 1 then
        v_resolved_team_id := v_candidate_ids[1];
        v_status := 'probable';
        v_reason_code := 'partial_identity_match';
        v_reason_message := 'Existe uma correspondencia parcial forte que exige decisao humana.';
      elsif v_exact_count = 0 then
        v_status := 'create';
        v_reason_code := 'new_team';
        v_reason_message := 'Nao foi encontrada identidade existente compativel.';
        v_proposed_action := 'create';
      end if;

      if v_resolved_team_id is not null then
        select t.*
        into v_existing
        from public.teams t
        where t.id = v_resolved_team_id;

        v_existing_identity := jsonb_build_object(
          'team_id', v_existing.id,
          'country_id', v_existing.country_id,
          'canonical_name', v_existing.name,
          'public_name', v_existing.public_name,
          'short_name', v_existing.short_name,
          'code', v_existing.code,
          'slug', v_existing.slug,
          'logo_url', v_existing.logo_url,
          'primary_color', v_existing.primary_color
        );
      end if;

      if v_status not in ('conflict', 'ambiguous') then
        select ta.team_id
        into v_conflict_team_id
        from public.team_aliases ta
        where ta.normalized_alias = any(v_alias_keys)
          and (
            v_resolved_team_id is null
            or ta.team_id <> v_resolved_team_id
            or ta.status <> 'active'
          )
        order by ta.team_id
        limit 1;

        if v_conflict_team_id is null then
          select t.id
          into v_conflict_team_id
          from public.teams t
          cross join lateral (values (t.name), (t.short_name), (t.slug), (t.code))
            identity(field_value)
          where identity.field_value is not null
            and public.normalize_team_identity_v1(identity.field_value) = any(v_alias_keys)
          order by t.id
          limit 1;
        end if;

        if v_conflict_team_id is not null then
          v_status := 'conflict';
          v_reason_code := 'alias_conflict';
          v_reason_message := 'Um alias proposto colide com uma identidade ja reservada.';
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'type', 'alias', 'team_id', v_conflict_team_id
          ));
        end if;
      end if;

      if v_status not in ('conflict', 'ambiguous', 'probable', 'create')
         and v_resolved_team_id is not null then
        v_structural_compatible :=
          public.normalize_team_identity_v1(v_existing.name) = v_normalized_name
          and public.normalize_team_identity_v1(v_existing.short_name) =
            v_normalized_short_name
          and v_existing.slug = v_slug
          and (
            v_code is null
            or (
              v_existing.code is not null
              and public.normalize_team_identity_v1(v_existing.code) = v_normalized_code
            )
          );

        v_optional_compatible :=
          (v_public_name is null or v_existing.public_name is not distinct from v_public_name)
          and (v_logo_url is null or v_existing.logo_url is not distinct from v_logo_url)
          and (
            v_primary_color is null
            or upper(v_existing.primary_color) is not distinct from v_primary_color
          );

        select not exists (
          select 1
          from unnest(v_alias_keys) requested_alias(normalized_alias)
          where not exists (
            select 1
            from public.team_aliases ta
            where ta.team_id = v_resolved_team_id
              and ta.status = 'active'
              and ta.normalized_alias = requested_alias.normalized_alias
          )
        )
        into v_aliases_all_active;

        if v_existing.country_id = p_country_id then
          if not v_optional_compatible then
            v_status := 'conflict';
            v_reason_code := 'existing_fields_conflict';
            v_reason_message := 'O clube existente tem campos opcionais diferentes; o lote nao os altera.';
          elsif not v_structural_compatible or not v_aliases_all_active then
            v_status := 'probable';
            v_reason_code := 'existing_requires_human_decision';
            v_reason_message := 'O candidato existe, mas a identidade ou os aliases nao permitem um no-op exato.';
          else
            v_status := 'existing';
            v_reason_code := 'existing_compatible';
            v_reason_message := 'O clube ja existe com identidade compativel; o apply sera no-op.';
            v_proposed_action := 'noop';
          end if;
        elsif v_existing.country_id is null then
          v_structural_compatible :=
            public.normalize_team_identity_v1(v_existing.name) = v_normalized_name
            and public.normalize_team_identity_v1(v_existing.short_name) =
              v_normalized_short_name
            and v_existing.slug = v_slug;

          v_optional_compatible :=
            (v_existing.code is null or v_code is null
              or public.normalize_team_identity_v1(v_existing.code) = v_normalized_code)
            and (v_existing.public_name is null or v_public_name is null
              or v_existing.public_name = v_public_name)
            and (v_existing.logo_url is null or v_logo_url is null
              or v_existing.logo_url = v_logo_url)
            and (v_existing.primary_color is null or v_primary_color is null
              or upper(v_existing.primary_color) = v_primary_color);

          if not v_optional_compatible then
            v_status := 'conflict';
            v_reason_code := 'legacy_fields_conflict';
            v_reason_message := 'O clube legacy tem campos preenchidos incompatíveis com a proposta.';
          elsif not v_structural_compatible then
            v_status := 'probable';
            v_reason_code := 'legacy_identity_requires_human_decision';
            v_reason_message := 'O candidato legacy e parcial e nao pode ser completado automaticamente.';
          else
            v_status := 'complete_existing';
            v_reason_code := 'legacy_team_can_be_completed';
            v_reason_message := 'O clube legacy pode receber country_id e apenas campos nulos confirmados.';
            v_proposed_action := 'complete';
          end if;
        else
          v_status := 'conflict';
          v_reason_code := 'team_belongs_to_other_country';
          v_reason_message := 'O candidato resolvido pertence a outro pais.';
        end if;
      end if;
    end if;

    if not v_valid then
      v_status := 'invalid';
      v_proposed_action := 'block';
    elsif v_status in ('probable', 'ambiguous') then
      v_proposed_action := 'review';
    elsif v_status = 'conflict' then
      v_proposed_action := 'block';
    end if;

    v_plan := v_plan || jsonb_build_array(jsonb_build_object(
      'input_ordinal', v_input_ordinal,
      'line_number', v_line_number,
      'status', v_status,
      'reason_code', v_reason_code,
      'reason_message', v_reason_message,
      'proposed_identity', jsonb_build_object(
        'canonical_name', v_name,
        'normalized_canonical_name', v_normalized_name,
        'public_name', v_public_name,
        'short_name', v_short_name,
        'normalized_short_name', v_normalized_short_name,
        'code', v_code,
        'normalized_code', v_normalized_code,
        'slug', v_slug,
        'country_id', p_country_id,
        'logo_url', v_logo_url,
        'primary_color', v_primary_color
      ),
      'resolved_team_id', v_resolved_team_id,
      'existing_identity', v_existing_identity,
      'conflicts', v_conflicts,
      'aliases', v_aliases,
      'identity_keys', to_jsonb(v_identity_keys),
      'proposed_action', v_proposed_action
    ));
  end loop;

  -- Conflitos internos sao avaliados sem escolher arbitrariamente uma linha.
  with plan_rows as (
    select e.value as row_value, e.ordinality
    from jsonb_array_elements(v_plan) with ordinality e(value, ordinality)
  ), marked as (
    select
      p.ordinality,
      p.row_value,
      (
        select count(*) > 1
        from plan_rows q
        where q.row_value ->> 'line_number' = p.row_value ->> 'line_number'
      ) as duplicated_line,
      exists (
        select 1
        from plan_rows q
        where q.ordinality <> p.ordinality
          and (
            exists (
              select 1
              from jsonb_array_elements_text(p.row_value -> 'identity_keys') pi(value)
              join jsonb_array_elements_text(q.row_value -> 'identity_keys') qi(value)
                on qi.value = pi.value
            )
            or exists (
              select 1
              from jsonb_array_elements(p.row_value -> 'aliases') pa(value)
              join jsonb_array_elements(q.row_value -> 'aliases') qa(value)
                on qa.value ->> 'normalized_alias' = pa.value ->> 'normalized_alias'
            )
            or exists (
              select 1
              from jsonb_array_elements(p.row_value -> 'aliases') pa(value)
              join jsonb_array_elements_text(q.row_value -> 'identity_keys') qi(value)
                on qi.value = pa.value ->> 'normalized_alias'
            )
            or exists (
              select 1
              from jsonb_array_elements_text(p.row_value -> 'identity_keys') pi(value)
              join jsonb_array_elements(q.row_value -> 'aliases') qa(value)
                on qa.value ->> 'normalized_alias' = pi.value
            )
          )
      ) as cross_row_conflict
    from plan_rows p
  )
  select jsonb_agg(
    case
      when m.duplicated_line then
        m.row_value || jsonb_build_object(
          'status', 'invalid',
          'reason_code', 'duplicate_line_number',
          'reason_message', 'lineNumber repete-se dentro do lote.',
          'proposed_action', 'block',
          'conflicts', (m.row_value -> 'conflicts') ||
            jsonb_build_array(jsonb_build_object('type', 'line_number'))
        )
      when m.cross_row_conflict and m.row_value ->> 'status' <> 'invalid' then
        m.row_value || jsonb_build_object(
          'status', 'conflict',
          'reason_code', 'batch_identity_conflict',
          'reason_message', 'A identidade ou um alias colide com outra linha do lote.',
          'proposed_action', 'block',
          'conflicts', (m.row_value -> 'conflicts') ||
            jsonb_build_array(jsonb_build_object('type', 'batch_identity'))
        )
      else m.row_value
    end
    order by m.ordinality
  )
  into v_plan
  from marked m;

  v_preview_fingerprint := 'v1:' || pg_catalog.md5(v_plan::text);

  select
    count(*)::integer,
    count(*) filter (where p.value ->> 'status' = 'create')::integer,
    count(*) filter (where p.value ->> 'status' = 'existing')::integer,
    count(*) filter (where p.value ->> 'status' = 'complete_existing')::integer,
    count(*) filter (where p.value ->> 'status' = 'probable')::integer,
    count(*) filter (where p.value ->> 'status' = 'ambiguous')::integer,
    count(*) filter (where p.value ->> 'status' = 'conflict')::integer,
    count(*) filter (where p.value ->> 'status' = 'invalid')::integer
  into
    v_total_count,
    v_create_count,
    v_existing_count,
    v_complete_existing_count,
    v_probable_count,
    v_ambiguous_count,
    v_conflict_count,
    v_invalid_count
  from jsonb_array_elements(v_plan) p(value);

  if p_apply and p_confirmed_preview_fingerprint <> v_preview_fingerprint then
    raise exception 'team_creation_batch_preview_stale'
      using errcode = '40001',
            detail = format(
              'confirmed=%s recalculated=%s',
              p_confirmed_preview_fingerprint,
              v_preview_fingerprint
            );
  end if;

  if p_apply and exists (
    select 1
    from unnest(v_confirmed_lines) confirmed(line_number)
    where not exists (
      select 1
      from jsonb_array_elements(v_plan) p(value)
      where (p.value ->> 'line_number')::integer = confirmed.line_number
        and p.value ->> 'status' = 'complete_existing'
    )
  ) then
    raise exception 'team_creation_batch_complete_confirmation_invalid'
      using errcode = '22023';
  end if;

  select count(*)::integer
  into v_blocking_count
  from jsonb_array_elements(v_plan) p(value)
  where p.value ->> 'status' in ('probable', 'ambiguous', 'conflict', 'invalid')
     or (
       p.value ->> 'status' = 'complete_existing'
       and (
         not p_apply
         or not ((p.value ->> 'line_number')::integer = any(v_confirmed_lines))
       )
     );

  if p_apply and v_blocking_count > 0 then
    raise exception 'team_creation_batch_blocking_rows'
      using errcode = '22023',
            detail = format('blocking_count=%s', v_blocking_count);
  end if;

  if p_apply then
    for v_plan_row in
      select p.value as row_value
      from jsonb_array_elements(v_plan) p(value)
      order by (p.value ->> 'input_ordinal')::integer
    loop
      v_status := v_plan_row.row_value ->> 'status';
      v_line_number := (v_plan_row.row_value ->> 'line_number')::integer;
      v_name := v_plan_row.row_value #>> '{proposed_identity,canonical_name}';
      v_public_name := v_plan_row.row_value #>> '{proposed_identity,public_name}';
      v_short_name := v_plan_row.row_value #>> '{proposed_identity,short_name}';
      v_code := v_plan_row.row_value #>> '{proposed_identity,code}';
      v_slug := v_plan_row.row_value #>> '{proposed_identity,slug}';
      v_logo_url := v_plan_row.row_value #>> '{proposed_identity,logo_url}';
      v_primary_color := v_plan_row.row_value #>> '{proposed_identity,primary_color}';
      v_resolved_team_id := nullif(
        v_plan_row.row_value ->> 'resolved_team_id', ''
      )::uuid;
      v_final_id := v_resolved_team_id;

      if v_status = 'create' then
        insert into public.teams (
          name,
          short_name,
          code,
          slug,
          country_id,
          logo_url,
          primary_color
        ) values (
          v_name,
          v_short_name,
          v_code,
          v_slug,
          p_country_id,
          v_logo_url,
          v_primary_color
        )
        returning id into v_final_id;

        v_created_count := v_created_count + 1;
        v_changed_rows := v_changed_rows ||
          jsonb_build_object(
            (v_plan_row.row_value ->> 'input_ordinal'), true
          );
      elsif v_status = 'complete_existing' then
        update public.teams t
        set country_id = p_country_id,
            code = coalesce(t.code, v_code),
            logo_url = coalesce(t.logo_url, v_logo_url),
            primary_color = coalesce(t.primary_color, v_primary_color)
        where t.id = v_resolved_team_id
          and t.country_id is null
        returning t.id into v_final_id;

        if not found then
          raise exception 'team_creation_batch_legacy_state_changed'
            using errcode = '40001';
        end if;

        v_completed_existing_count := v_completed_existing_count + 1;
        v_changed_rows := v_changed_rows ||
          jsonb_build_object(
            (v_plan_row.row_value ->> 'input_ordinal'), true
          );
      else
        v_changed_rows := v_changed_rows ||
          jsonb_build_object(
            (v_plan_row.row_value ->> 'input_ordinal'), false
          );

        if v_status = 'existing' then
          v_aliases_unchanged_count := v_aliases_unchanged_count +
            jsonb_array_length(v_plan_row.row_value -> 'aliases');
        end if;
      end if;

      if v_status in ('create', 'complete_existing') then
        if v_public_name is not null then
          select *
          into v_public_name_result
          from public.manage_team_public_name(
            v_final_id,
            v_public_name,
            v_actor_type,
            v_actor_reference,
            v_source,
            v_request_reference || ':line:' || v_line_number::text
          );

          if v_public_name_result.result_changed then
            v_public_names_changed_count := v_public_names_changed_count + 1;
          end if;
        end if;

        for v_alias_row in
          select a.value ->> 'alias' as alias_text
          from jsonb_array_elements(v_plan_row.row_value -> 'aliases') a(value)
          order by a.value ->> 'normalized_alias'
        loop
          select *
          into v_alias_result
          from public.manage_team_alias(
            'create',
            v_actor_type,
            v_actor_reference,
            v_source,
            null,
            v_final_id,
            v_alias_row.alias_text,
            v_request_reference || ':line:' || v_line_number::text
          );

          if v_alias_result.result_code = 'created'
             and v_alias_result.result_status = 'active'
             and v_alias_result.result_changed then
            v_aliases_created_count := v_aliases_created_count + 1;
          elsif v_alias_result.result_code = 'noop_existing_active'
                and v_alias_result.result_status = 'active'
                and not v_alias_result.result_changed then
            v_aliases_unchanged_count := v_aliases_unchanged_count + 1;
          else
            raise exception 'team_creation_batch_alias_result_unexpected: %',
              v_alias_result.result_code
              using errcode = '55000';
          end if;
        end loop;
      end if;

      v_final_ids := v_final_ids ||
        jsonb_build_object(
          (v_plan_row.row_value ->> 'input_ordinal'), v_final_id
        );
    end loop;
  end if;

  return query
  select
    (p.value ->> 'line_number')::integer,
    p.value ->> 'status',
    p.value ->> 'reason_code',
    p.value ->> 'reason_message',
    p.value -> 'proposed_identity',
    nullif(p.value ->> 'resolved_team_id', '')::uuid,
    p.value -> 'existing_identity',
    p.value -> 'conflicts',
    coalesce((
      select jsonb_agg(a.value ->> 'normalized_alias' order by a.value ->> 'normalized_alias')
      from jsonb_array_elements(p.value -> 'aliases') a(value)
    ), '[]'::jsonb),
    p.value ->> 'proposed_action',
    coalesce(
      nullif(v_final_ids ->> (p.value ->> 'input_ordinal'), '')::uuid,
      nullif(p.value ->> 'resolved_team_id', '')::uuid
    ),
    coalesce(
      (v_changed_rows ->> (p.value ->> 'input_ordinal'))::boolean,
      false
    ),
    p_apply,
    v_total_count,
    v_create_count,
    v_existing_count,
    v_complete_existing_count,
    v_probable_count,
    v_ambiguous_count,
    v_conflict_count,
    v_invalid_count,
    v_blocking_count,
    v_blocking_count = 0,
    v_created_count,
    v_completed_existing_count,
    v_existing_count,
    v_aliases_created_count,
    v_aliases_unchanged_count,
    v_public_names_changed_count,
    p_apply and v_blocking_count = 0,
    v_preview_fingerprint
  from jsonb_array_elements(v_plan) p(value)
  order by (p.value ->> 'input_ordinal')::integer;
end
$manage_batch$;

alter function public.manage_team_creation_batch(
  uuid,jsonb,boolean,text,jsonb,text,text,text,text
) owner to postgres;

revoke all on function public.manage_team_creation_batch(
  uuid,jsonb,boolean,text,jsonb,text,text,text,text
) from public, anon, authenticated, service_role;

grant execute on function public.manage_team_creation_batch(
  uuid,jsonb,boolean,text,jsonb,text,text,text,text
) to service_role;

comment on function public.manage_team_creation_batch(
  uuid,jsonb,boolean,text,jsonb,text,text,text,text
) is
  'Preview/apply transacional da criacao de clubes em lote. Parametros: country_id; rows JSONB com lineNumber, canonicalName, publicName, shortName, code, slug, aliases, logoUrl e primaryColor; apply; fingerprint confirmada; linhas complete_existing confirmadas; actor_type; actor_reference; source; request_reference. O apply bloqueia, recalcula, compara a fingerprint e faz rollback integral perante qualquer erro.';

commit;
