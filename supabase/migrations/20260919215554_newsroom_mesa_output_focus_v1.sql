do $preflight$
begin
  if to_regprocedure('public.newsroom_prepare_mesa_intents_v1(jsonb,text)') is null
    or to_regprocedure('public.newsroom_prepare_mesa_intents_v1_context_v1(jsonb,text)') is not null
    or to_regclass('public.newsroom_mesa_intent_preparations') is null
  then
    raise exception 'mesa-output-focus-v1-preflight-missing';
  end if;
end;
$preflight$;

create function public.newsroom_mesa_intent_output_focus_source_ids_v1(
  p_context jsonb,
  p_request jsonb,
  p_output jsonb,
  p_outputs jsonb
)
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_all uuid[];
  v_explicit uuid[];
  v_theme_sources uuid[];
  v_selected_themes uuid[];
  v_evidence_sources uuid[];
  v_evidence_themes uuid[];
  v_selected uuid[];
  v_reviewed uuid[] := '{}'::uuid[];
  v_remaining uuid[];
  v_existing jsonb;
  v_existing_focus uuid[];
  v_touches_theme boolean := false;
  v_has_existing boolean := false;
begin
  select coalesce(
    array_agg(
      distinct lower(source ->> 'newsroomArticleId')::uuid
      order by lower(source ->> 'newsroomArticleId')::uuid
    ),
    '{}'::uuid[]
  )
  into v_all
  from jsonb_array_elements(coalesce(p_context -> 'sources', '[]'::jsonb)) source
  where source ->> 'newsroomArticleId'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  if cardinality(v_all) < 1
    or p_context ->> 'kind' <> 'selection'
    or jsonb_typeof(p_request -> 'selection') is distinct from 'object'
  then
    return null;
  end if;

  select coalesce(
    array_agg(
      distinct lower(value #>> '{}')::uuid
      order by lower(value #>> '{}')::uuid
    ),
    '{}'::uuid[]
  )
  into v_explicit
  from jsonb_array_elements(
    coalesce(p_request -> 'selection' -> 'sourceIds', '[]'::jsonb)
  )
  where value #>> '{}'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  select coalesce(
    array_agg(
      distinct lower(value #>> '{}')::uuid
      order by lower(value #>> '{}')::uuid
    ),
    '{}'::uuid[]
  )
  into v_selected_themes
  from jsonb_array_elements(
    coalesce(p_request -> 'selection' -> 'themeIds', '[]'::jsonb)
  )
  where value #>> '{}'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_theme_sources
  from unnest(v_all) source(id)
  where not (source.id = any(v_explicit));

  if p_output ->> 'kind' = 'existing' then
    if jsonb_typeof(p_output -> 'target' -> 'evidence') is distinct from 'object' then
      return null;
    end if;

    select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
    into v_evidence_sources
    from (
      select lower(value #>> '{}')::uuid as id
      from jsonb_array_elements(
        coalesce(p_output -> 'target' -> 'evidence' -> 'sourceIds', '[]'::jsonb)
      )
      where value #>> '{}'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) evidence
    where evidence.id = any(v_all);

    if cardinality(v_selected_themes) = 1 then
      select coalesce(
        array_agg(
          distinct lower(value #>> '{}')::uuid
          order by lower(value #>> '{}')::uuid
        ),
        '{}'::uuid[]
      )
      into v_evidence_themes
      from jsonb_array_elements(
        coalesce(p_output -> 'target' -> 'evidence' -> 'themeIds', '[]'::jsonb)
      )
      where value #>> '{}'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

      v_touches_theme :=
        v_selected_themes[1] = any(v_evidence_themes)
        or exists (
          select 1
          from unnest(v_evidence_sources) evidence_source(id)
          where evidence_source.id = any(v_theme_sources)
        );

      if v_touches_theme and cardinality(v_theme_sources) > 0 then
        select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
        into v_selected
        from (
          select id from unnest(v_evidence_sources) source(id)
          union
          select id from unnest(v_theme_sources) source(id)
        ) selected;
        return v_selected;
      end if;
    end if;

    return case
      when cardinality(v_evidence_sources) > 0 then v_evidence_sources
      else null
    end;
  end if;

  if p_output ->> 'kind' = 'new' then
    if coalesce((p_context ->> 'newArticleCount')::integer, 0) <> 1 then
      return null;
    end if;

    for v_existing in
      select value
      from jsonb_array_elements(coalesce(p_outputs, '[]'::jsonb))
      where value ->> 'kind' = 'existing'
        and value ->> 'contextKey' = p_output ->> 'contextKey'
    loop
      v_has_existing := true;
      v_existing_focus := public.newsroom_mesa_intent_output_focus_source_ids_v1(
        p_context,
        p_request,
        v_existing,
        '[]'::jsonb
      );
      if v_existing_focus is null or cardinality(v_existing_focus) < 1 then
        return null;
      end if;
      v_reviewed := v_reviewed || v_existing_focus;
    end loop;

    if not v_has_existing then
      return null;
    end if;

    select coalesce(array_agg(distinct id order by id), '{}'::uuid[])
    into v_reviewed
    from unnest(v_reviewed) reviewed(id);

    select coalesce(array_agg(id order by id), '{}'::uuid[])
    into v_remaining
    from unnest(v_explicit) source(id)
    where source.id = any(v_all)
      and not (source.id = any(v_reviewed));

    return case
      when cardinality(v_remaining) > 0 then v_remaining
      else null
    end;
  end if;

  return null;
end;
$function$;

revoke all on function public.newsroom_mesa_intent_output_focus_source_ids_v1(jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;

-- Preserve the #339 preparation implementation. This wrapper only annotates
-- each frozen output with a deterministic focus when the evidence is sufficient.
alter function public.newsroom_prepare_mesa_intents_v1(jsonb,text)
  rename to newsroom_prepare_mesa_intents_v1_context_v1;

revoke all on function public.newsroom_prepare_mesa_intents_v1_context_v1(jsonb,text)
  from public,anon,authenticated,service_role;

create function public.newsroom_prepare_mesa_intents_v1(
  p_request jsonb,
  p_expected_authority_fingerprint text
)
returns table(result jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_plan jsonb;
  v_outputs jsonb := '[]'::jsonb;
  v_output jsonb;
  v_context jsonb;
  v_focus_source_ids uuid[];
  v_dossier_id uuid;
begin
  select original.result
  into strict v_result
  from public.newsroom_prepare_mesa_intents_v1_context_v1(
    p_request,
    p_expected_authority_fingerprint
  ) original;

  v_plan := v_result -> 'plan';
  v_dossier_id := (v_plan ->> 'dossierId')::uuid;

  for v_output in
    select value
    from jsonb_array_elements(v_plan -> 'outputs')
  loop
    select value
    into strict v_context
    from jsonb_array_elements(v_plan -> 'contexts')
    where value ->> 'key' = v_output ->> 'contextKey';

    v_focus_source_ids := public.newsroom_mesa_intent_output_focus_source_ids_v1(
      v_context,
      v_plan -> 'request',
      v_output,
      v_plan -> 'outputs'
    );

    if v_focus_source_ids is not null and cardinality(v_focus_source_ids) > 0 then
      v_output := v_output || jsonb_build_object(
        'focusSourceIds',
        to_jsonb(v_focus_source_ids)
      );
    end if;

    v_outputs := v_outputs || jsonb_build_array(v_output);
  end loop;

  v_plan := jsonb_set(v_plan, '{outputs}', v_outputs);
  v_result := jsonb_set(v_result, '{plan}', v_plan);

  update public.newsroom_mesa_intent_preparations
  set frozen_plan = v_plan
  where dossier_id = v_dossier_id;

  update public.newsroom_mesa_production_contexts
  set selection_payload = jsonb_set(
    selection_payload,
    '{productionIntents}',
    v_plan,
    true
  )
  where dossier_id = v_dossier_id;

  return query select v_result;
end;
$function$;

revoke all on function public.newsroom_prepare_mesa_intents_v1(jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_prepare_mesa_intents_v1(jsonb,text)
  to service_role;
