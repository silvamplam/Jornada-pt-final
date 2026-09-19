-- Technical selection context for existing Production Intents.
-- Candidate SQL only; receipts and UI remain unchanged.
begin;
do $preflight$
begin
  if to_regprocedure('public.newsroom_mesa_global_article_candidates_v1(uuid[],uuid[])') is null
    or to_regprocedure('public.newsroom_prepare_mesa_contexts_v3(uuid,text,jsonb,uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_mesa_preview_intents_v1(jsonb)') is null
    or to_regclass('public.newsroom_mesa_production_context_items') is null
  then raise exception 'mesa-selection-context-preflight-missing'; end if;
end;
$preflight$;

alter table public.newsroom_mesa_production_context_items drop constraint newsroom_mesa_context_items_kind_check;
alter table public.newsroom_mesa_production_context_items add constraint newsroom_mesa_context_items_kind_check check (
  (context_kind='source' and source_newsroom_article_id is not null and theme_id is null)
  or (context_kind='theme' and source_newsroom_article_id is null and theme_id is not null)
  or (context_kind='selection' and source_newsroom_article_id is null and theme_id is null)
);
create unique index newsroom_mesa_context_items_selection_uidx
  on public.newsroom_mesa_production_context_items(dossier_id) where context_kind='selection';

create or replace function public.newsroom_mesa_context_item_sources_valid_v1(
  p_dossier_id uuid,
  p_production_context_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case item.context_kind
    when 'source' then
      (
        select count(*) = 1
          and min(dossier_source.newsroom_article_id::text)
            = item.source_newsroom_article_id::text
        from public.newsroom_mesa_production_context_sources context_source
        join public.newsroom_editorial_dossier_sources dossier_source
          on dossier_source.dossier_id = context_source.dossier_id
          and dossier_source.id = context_source.dossier_source_id
        where context_source.dossier_id = item.dossier_id
          and context_source.production_context_id = item.id
      )
    when 'theme' then exists (
      select 1
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = item.dossier_id
        and context_source.production_context_id = item.id
    )
    when 'selection' then exists (
      select 1
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = item.dossier_id
        and context_source.production_context_id = item.id
    )
    else false
  end
  from public.newsroom_mesa_production_context_items item
  where item.dossier_id = p_dossier_id
    and item.id = p_production_context_id;
$function$;
create or replace function public.newsroom_prepare_mesa_contexts_v3(
  p_preparation_key uuid,
  p_title text,
  p_contexts jsonb,
  p_incorporate_theme_id uuid default null,
  p_incorporate_source_ids uuid[] default '{}'::uuid[]
)
returns table (
  dossier_id uuid,
  preparation_action text,
  source_count integer,
  published_context_count integer,
  image_count integer,
  context_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request_fingerprint text;
  v_existing public.newsroom_mesa_production_contexts%rowtype;
  v_result record;
  v_context jsonb;
  v_contexts jsonb := '[]'::jsonb;
  v_refs jsonb;
  v_union_refs jsonb := '[]'::jsonb;
  v_ref jsonb;
  v_kind text;
  v_source_id uuid;
  v_theme_id uuid;
  v_title_snapshot text;
  v_context_id uuid;
  v_snapshot_id uuid;
  v_ordinality bigint;
  v_ref_ordinality bigint;
  v_requested_theme_sources uuid[];
  v_current_theme_sources uuid[];
  v_incorporate_source_ids uuid[];
begin
  if p_preparation_key is null
    or nullif(btrim(p_title), '') is null
    or length(btrim(p_title)) > 180
    or p_contexts is null
    or jsonb_typeof(p_contexts) is distinct from 'array'
  then
    raise exception 'mesa-context-preparation-input-invalid';
  end if;

  if jsonb_array_length(p_contexts) not between 1 and 20
    or p_incorporate_source_ids is null
    or array_position(p_incorporate_source_ids, null) is not null
  then
    raise exception 'mesa-context-preparation-input-invalid';
  end if;

  select coalesce(array_agg(source_id order by source_id), '{}'::uuid[])
  into v_incorporate_source_ids
  from (
    select distinct source_id
    from unnest(p_incorporate_source_ids) source_rows(source_id)
  ) normalized;

  if cardinality(v_incorporate_source_ids) <> cardinality(p_incorporate_source_ids)
    or cardinality(v_incorporate_source_ids) > 20
    or (p_incorporate_theme_id is null and cardinality(v_incorporate_source_ids) <> 0)
    or (p_incorporate_theme_id is not null and cardinality(v_incorporate_source_ids) < 1)
  then
    raise exception 'mesa-context-incorporation-input-invalid';
  end if;

  v_request_fingerprint := md5(jsonb_build_object(
    'contractVersion', 3,
    'title', btrim(p_title),
    'contexts', p_contexts,
    'incorporateThemeId', p_incorporate_theme_id,
    'incorporateSourceIds', to_jsonb(v_incorporate_source_ids)
  )::text);

  perform pg_advisory_xact_lock(
    hashtextextended('newsroom-mesa-organization-v1', 0)
  );

  select context.*
  into v_existing
  from public.newsroom_mesa_production_contexts context
  where context.preparation_key = p_preparation_key;

  if found then
    if v_existing.selection_payload ->> 'contextRequestFingerprint'
        is distinct from v_request_fingerprint
      or v_existing.workspace_contract_version is distinct from 2::smallint
      or v_existing.workspace_state is distinct from 'active'
      or not exists (
        select 1
        from public.newsroom_mesa_production_context_items item
        where item.dossier_id = v_existing.dossier_id
      )
    then
      raise exception 'mesa-context-preparation-conflict';
    end if;

    return query
    select
      v_existing.dossier_id,
      'reused'::text,
      jsonb_array_length(v_existing.source_refs),
      (
        select count(*)::integer
        from public.newsroom_editorial_dossier_published_contexts published_context
        where published_context.dossier_id = v_existing.dossier_id
      ),
      (
        select count(*)::integer
        from public.newsroom_editorial_dossier_images image
        where image.dossier_id = v_existing.dossier_id
      ),
      (
        select count(*)::integer
        from public.newsroom_mesa_production_context_items item
        where item.dossier_id = v_existing.dossier_id
      );
    return;
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_dossiers dossier
    where dossier.preparation_key = p_preparation_key
  ) then
    raise exception 'mesa-context-prepared-before-v3';
  end if;

  for v_context, v_ordinality in
    select context.value, context.ordinality
    from jsonb_array_elements(p_contexts)
      with ordinality context(value, ordinality)
  loop
    if jsonb_typeof(v_context) is distinct from 'object'
      or jsonb_typeof(v_context -> 'sources') is distinct from 'array'
    then
      raise exception 'mesa-context-selection-invalid';
    end if;

    v_kind := lower(btrim(coalesce(v_context ->> 'kind', '')));
    v_source_id := null;
    v_theme_id := null;

    begin
      if v_kind = 'source' then
        v_source_id := (v_context ->> 'sourceId')::uuid;
      elsif v_kind = 'theme' then
        v_theme_id := (v_context ->> 'themeId')::uuid;
      elsif v_kind = 'selection' then
        if coalesce(v_context ->> 'sourceId','') <> ''
          or coalesce(v_context ->> 'themeId','') <> ''
        then raise exception 'mesa-context-selection-invalid'; end if;
      else
        raise exception 'mesa-context-selection-invalid';
      end if;
    exception
      when invalid_text_representation or not_null_violation then
        raise exception 'mesa-context-selection-invalid';
    end;

    v_refs := public.newsroom_mesa_normalize_refs_v2(v_context -> 'sources');
    if jsonb_array_length(v_refs) not between 1 and 20 then
      raise exception 'mesa-context-selection-invalid';
    end if;

    if v_kind = 'source' then
      if jsonb_array_length(v_refs) <> 1
        or lower(v_refs -> 0 ->> 'newsroomArticleId') <> v_source_id::text
      then
        raise exception 'mesa-context-source-selection-invalid';
      end if;
      select coalesce(nullif(btrim(article.title), ''), 'Fonte')
      into v_title_snapshot
      from public.newsroom_articles article
      where article.id = v_source_id;
      if not found then
        raise exception 'mesa-context-source-unavailable';
      end if;
      if exists (
        select 1
        from public.newsroom_editorial_theme_sources membership
        where membership.newsroom_article_id = v_source_id
      ) then
        raise exception 'mesa-context-source-not-loose';
      end if;
    elsif v_kind = 'theme' then
      select theme.title
      into v_title_snapshot
      from public.newsroom_editorial_themes theme
      where theme.id = v_theme_id
        and theme.status = 'open'
      for update;
      if not found then
        raise exception 'mesa-context-theme-unavailable';
      end if;
    else
      v_title_snapshot := btrim(p_title);
    end if;

    v_contexts := v_contexts || jsonb_build_array(jsonb_build_object(
      'kind', v_kind,
      'sourceId', v_source_id,
      'themeId', v_theme_id,
      'titleSnapshot', v_title_snapshot,
      'sortOrder', v_ordinality,
      'sources', v_refs
    ));
    v_union_refs := v_union_refs || v_refs;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(v_contexts) context(value)
    group by
      context.value ->> 'kind',
      coalesce(context.value ->> 'sourceId', context.value ->> 'themeId')
    having count(*) > 1
  ) then
    raise exception 'mesa-context-selection-duplicate';
  end if;

  v_union_refs := public.newsroom_mesa_normalize_refs_v2(v_union_refs);
  if jsonb_array_length(v_union_refs) not between 1 and 20 then
    raise exception 'mesa-context-selection-invalid';
  end if;

  if p_incorporate_theme_id is not null then
    if jsonb_array_length(v_contexts) <> 1
      or v_contexts -> 0 ->> 'kind' <> 'theme'
      or lower(v_contexts -> 0 ->> 'themeId') <> p_incorporate_theme_id::text
    then
      raise exception 'mesa-context-incorporation-ambiguous';
    end if;

    if exists (
      select 1
      from unnest(v_incorporate_source_ids) requested(source_id)
      where not exists (
        select 1
        from jsonb_array_elements(v_contexts -> 0 -> 'sources') ref(value)
        where lower(ref.value ->> 'newsroomArticleId') = requested.source_id::text
      )
        or exists (
          select 1
          from public.newsroom_editorial_theme_sources membership
          where membership.newsroom_article_id = requested.source_id
        )
    ) then
      raise exception 'mesa-context-incorporation-source-invalid';
    end if;

    foreach v_source_id in array v_incorporate_source_ids
    loop
      select (ref.value ->> 'newsroomSnapshotId')::uuid
      into strict v_snapshot_id
      from jsonb_array_elements(v_contexts -> 0 -> 'sources') ref(value)
      where lower(ref.value ->> 'newsroomArticleId') = v_source_id::text;

      perform public.newsroom_set_editorial_theme_source_membership_v1(
        p_incorporate_theme_id,
        v_source_id,
        true
      );
      perform public.newsroom_acknowledge_theme_source_v1(
        p_incorporate_theme_id,
        v_source_id,
        v_snapshot_id
      );
    end loop;
  end if;

  for v_context in
    select context.value
    from jsonb_array_elements(v_contexts) context(value)
    where context.value ->> 'kind' = 'theme'
  loop
    select array_agg(membership.newsroom_article_id order by membership.newsroom_article_id)
    into v_current_theme_sources
    from public.newsroom_editorial_theme_sources membership
    where membership.theme_id = (v_context ->> 'themeId')::uuid;

    select array_agg(
      distinct (ref.value ->> 'newsroomArticleId')::uuid
      order by (ref.value ->> 'newsroomArticleId')::uuid
    )
    into v_requested_theme_sources
    from jsonb_array_elements(v_context -> 'sources') ref(value);

    if coalesce(v_current_theme_sources, '{}'::uuid[])
      is distinct from coalesce(v_requested_theme_sources, '{}'::uuid[])
    then
      raise exception 'mesa-context-theme-membership-stale';
    end if;
  end loop;

  select *
  into v_result
  from public.newsroom_prepare_mesa_materials_v2(
    p_preparation_key,
    null,
    btrim(p_title),
    v_union_refs,
    '[]'::jsonb
  );

  update public.newsroom_mesa_production_contexts context
  set selection_payload = jsonb_build_object(
    'contractVersion', 3,
    'contextContractVersion', 1,
    'contextRequestFingerprint', v_request_fingerprint,
    'title', btrim(p_title),
    'sources', v_union_refs,
    'materials', '[]'::jsonb,
    'contexts', v_contexts,
    'incorporateThemeId', p_incorporate_theme_id,
    'incorporateSourceIds', to_jsonb(v_incorporate_source_ids)
  )
  where context.dossier_id = v_result.dossier_id;

  if not found then
    raise exception 'mesa-context-preparation-workspace-missing';
  end if;

  for v_context in
    select context.value
    from jsonb_array_elements(v_contexts) context(value)
    order by (context.value ->> 'sortOrder')::smallint
  loop
    insert into public.newsroom_mesa_production_context_items(
      dossier_id,
      context_kind,
      source_newsroom_article_id,
      theme_id,
      title_snapshot,
      sort_order
    ) values (
      v_result.dossier_id,
      v_context ->> 'kind',
      (v_context ->> 'sourceId')::uuid,
      (v_context ->> 'themeId')::uuid,
      v_context ->> 'titleSnapshot',
      (v_context ->> 'sortOrder')::smallint
    )
    returning id into v_context_id;

    for v_ref, v_ref_ordinality in
      select ref.value, ref.ordinality
      from jsonb_array_elements(v_context -> 'sources')
        with ordinality ref(value, ordinality)
    loop
      insert into public.newsroom_mesa_production_context_sources(
        dossier_id,
        production_context_id,
        dossier_source_id,
        sort_order
      )
      select
        v_result.dossier_id,
        v_context_id,
        dossier_source.id,
        v_ref_ordinality::smallint
      from public.newsroom_editorial_dossier_sources dossier_source
      where dossier_source.dossier_id = v_result.dossier_id
        and dossier_source.newsroom_article_id = (v_ref ->> 'newsroomArticleId')::uuid
        and dossier_source.newsroom_snapshot_id = (v_ref ->> 'newsroomSnapshotId')::uuid
        and dossier_source.included;

      if not found then
        raise exception 'mesa-context-frozen-source-missing';
      end if;
    end loop;
  end loop;

  return query
  select
    v_result.dossier_id,
    v_result.preparation_action,
    v_result.source_count,
    v_result.published_context_count,
    v_result.image_count,
    jsonb_array_length(v_contexts);
end;
$function$;
create or replace function public.newsroom_mesa_normalize_intent_v1(p_request jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_item jsonb; v_themes jsonb := '[]'; v_sources jsonb := '[]';
  v_selection jsonb := null; v_selection_sources jsonb := '[]'; v_selection_themes jsonb := '[]';
  v_selection_candidates jsonb := '[]'; v_selection_articles jsonb := '[]';
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(p_request) is distinct from 'object'
    or not (p_request ?& array['version','preparationKey','title','themes','sources'])
    or p_request - array['version','preparationKey','title','themes','sources','selection'] <> '{}'
    or p_request -> 'version' is distinct from '1'::jsonb
    or jsonb_typeof(p_request -> 'preparationKey') is distinct from 'string'
    or lower(p_request ->> 'preparationKey') !~ v_uuid
    or jsonb_typeof(p_request -> 'title') is distinct from 'string'
    or length(btrim(p_request ->> 'title')) not between 1 and 180
    or jsonb_typeof(p_request -> 'themes') is distinct from 'array'
    or jsonb_typeof(p_request -> 'sources') is distinct from 'array'
  then raise exception 'mesa-intent-input-invalid'; end if;
  if jsonb_array_length(p_request -> 'themes') > 20
    or jsonb_array_length(p_request -> 'sources') > 200
  then raise exception 'mesa-intent-input-invalid'; end if;
  for v_item in select value from jsonb_array_elements(p_request -> 'themes') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or not (v_item ?& array['themeId','action'])
      or jsonb_typeof(v_item -> 'themeId') is distinct from 'string'
      or lower(v_item ->> 'themeId') !~ v_uuid
      or coalesce(v_item ->> 'action','') not in ('defer','prepare')
    then raise exception 'mesa-intent-theme-invalid'; end if;
    if v_item ->> 'action' = 'defer' then
      if v_item - array['themeId','action'] <> '{}' then raise exception 'mesa-intent-theme-invalid'; end if;
    else
      if not (v_item ?& array['reviewPublished','newArticleCount'])
        or v_item - array['themeId','action','reviewPublished','newArticleCount'] <> '{}'
        or jsonb_typeof(v_item -> 'reviewPublished') is distinct from 'boolean'
        or jsonb_typeof(v_item -> 'newArticleCount') is distinct from 'number'
        or (v_item ->> 'newArticleCount') !~ '^[0-9]+$'
      then raise exception 'mesa-intent-theme-invalid'; end if;
      if (v_item ->> 'newArticleCount')::numeric not between 0 and 30 then raise exception 'mesa-intent-theme-invalid'; end if;
    end if;
    v_themes := v_themes || jsonb_build_array(v_item || jsonb_build_object('themeId',lower(v_item ->> 'themeId')));
  end loop;
  for v_item in select value from jsonb_array_elements(p_request -> 'sources') loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or not (v_item ?& array['sourceId','destination'])
      or jsonb_typeof(v_item -> 'sourceId') is distinct from 'string'
      or lower(v_item ->> 'sourceId') !~ v_uuid
      or coalesce(v_item ->> 'destination','') not in ('defer','independent','theme')
    then raise exception 'mesa-intent-source-invalid'; end if;
    case v_item ->> 'destination'
    when 'defer' then
      if v_item - array['sourceId','destination'] <> '{}' then raise exception 'mesa-intent-source-invalid'; end if;
    when 'theme' then
      if not (v_item ? 'themeId') or v_item - array['sourceId','destination','themeId'] <> '{}'
        or jsonb_typeof(v_item -> 'themeId') is distinct from 'string' or lower(v_item ->> 'themeId') !~ v_uuid
      then raise exception 'mesa-intent-source-invalid'; end if;
      v_item := v_item || jsonb_build_object('themeId',lower(v_item ->> 'themeId'));
      if not exists (select 1 from jsonb_array_elements(v_themes) t
        where t ->> 'themeId' = v_item ->> 'themeId' and t ->> 'action' = 'prepare')
      then raise exception 'mesa-intent-incorporation-target-invalid'; end if;
    else
      if not (v_item ? 'newArticleCount') or v_item - array['sourceId','destination','newArticleCount'] <> '{}'
        or jsonb_typeof(v_item -> 'newArticleCount') is distinct from 'number'
        or (v_item ->> 'newArticleCount') !~ '^[0-9]+$'
      then raise exception 'mesa-intent-source-invalid'; end if;
      if (v_item ->> 'newArticleCount')::numeric not between 1 and 30 then raise exception 'mesa-intent-source-invalid'; end if;
    end case;
    v_sources := v_sources || jsonb_build_array(v_item || jsonb_build_object('sourceId',lower(v_item ->> 'sourceId')));
  end loop;
  if exists (select 1 from jsonb_array_elements(v_themes) t group by t ->> 'themeId' having count(*) > 1)
    or exists (select 1 from jsonb_array_elements(v_sources) s group by s ->> 'sourceId' having count(*) > 1)
  then raise exception 'mesa-intent-selection-duplicate'; end if;
  if p_request ? 'selection' then
    v_selection := p_request -> 'selection';
    if jsonb_typeof(v_selection) is distinct from 'object'
      or not (v_selection ?& array['sourceIds','reviewArticleIds','newArticleCount'])
      or v_selection - array['sourceIds','themeIds','candidateArticleIds','reviewArticleIds','newArticleCount'] <> '{}'
      or jsonb_typeof(v_selection -> 'sourceIds') is distinct from 'array'
      or jsonb_array_length(v_selection -> 'sourceIds') > 20
      or jsonb_typeof(coalesce(v_selection -> 'themeIds','[]'::jsonb)) is distinct from 'array'
      or jsonb_array_length(coalesce(v_selection -> 'themeIds','[]'::jsonb)) > 20
      or jsonb_typeof(coalesce(v_selection -> 'candidateArticleIds','[]'::jsonb)) is distinct from 'array'
      or jsonb_array_length(coalesce(v_selection -> 'candidateArticleIds','[]'::jsonb)) > 200
      or jsonb_typeof(v_selection -> 'reviewArticleIds') is distinct from 'array'
      or jsonb_array_length(v_selection -> 'reviewArticleIds') > 30
      or jsonb_typeof(v_selection -> 'newArticleCount') is distinct from 'number'
      or (v_selection ->> 'newArticleCount') !~ '^[0-9]+$'
      or (v_selection ->> 'newArticleCount')::numeric not between 0 and 30
    then raise exception 'mesa-intent-selection-invalid'; end if;
    for v_item in select value from jsonb_array_elements(v_selection -> 'sourceIds') loop
      if jsonb_typeof(v_item) is distinct from 'string' or lower(v_item #>> '{}') !~ v_uuid then raise exception 'mesa-intent-selection-invalid'; end if;
      v_selection_sources := v_selection_sources || jsonb_build_array(lower(v_item #>> '{}'));
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(v_selection -> 'themeIds','[]'::jsonb)) loop
      if jsonb_typeof(v_item) is distinct from 'string' or lower(v_item #>> '{}') !~ v_uuid then raise exception 'mesa-intent-selection-invalid'; end if;
      v_selection_themes := v_selection_themes || jsonb_build_array(lower(v_item #>> '{}'));
    end loop;
    for v_item in select value from jsonb_array_elements(coalesce(v_selection -> 'candidateArticleIds','[]'::jsonb)) loop
      if jsonb_typeof(v_item) is distinct from 'string' or lower(v_item #>> '{}') !~ v_uuid then raise exception 'mesa-intent-selection-invalid'; end if;
      v_selection_candidates := v_selection_candidates || jsonb_build_array(lower(v_item #>> '{}'));
    end loop;
    for v_item in select value from jsonb_array_elements(v_selection -> 'reviewArticleIds') loop
      if jsonb_typeof(v_item) is distinct from 'string' or lower(v_item #>> '{}') !~ v_uuid then raise exception 'mesa-intent-selection-invalid'; end if;
      v_selection_articles := v_selection_articles || jsonb_build_array(lower(v_item #>> '{}'));
    end loop;
    if jsonb_array_length(v_selection_sources)+jsonb_array_length(v_selection_themes) < 1
      or (select count(distinct value #>> '{}') from jsonb_array_elements(v_selection_sources)) <> jsonb_array_length(v_selection_sources)
      or (select count(distinct value #>> '{}') from jsonb_array_elements(v_selection_themes)) <> jsonb_array_length(v_selection_themes)
      or (select count(distinct value #>> '{}') from jsonb_array_elements(v_selection_candidates)) <> jsonb_array_length(v_selection_candidates)
      or (select count(distinct value #>> '{}') from jsonb_array_elements(v_selection_articles)) <> jsonb_array_length(v_selection_articles)
      or exists (select 1 from jsonb_array_elements(v_selection_sources) selected join jsonb_array_elements(v_sources) source on source ->> 'sourceId'=selected #>> '{}')
      or exists (select 1 from jsonb_array_elements(v_selection_themes) selected join jsonb_array_elements(v_themes) theme on theme ->> 'themeId'=selected #>> '{}')
      or (v_selection ? 'candidateArticleIds' and exists (
        select 1 from jsonb_array_elements(v_selection_articles) reviewed
        where not exists (select 1 from jsonb_array_elements(v_selection_candidates) candidate where candidate #>> '{}'=reviewed #>> '{}')
      ))
      or jsonb_array_length(v_selection_articles)+(v_selection ->> 'newArticleCount')::integer < 1
    then raise exception 'mesa-intent-selection-invalid'; end if;
    select coalesce(jsonb_agg(value order by value #>> '{}'),'[]'::jsonb) into v_selection_sources from jsonb_array_elements(v_selection_sources);
    select coalesce(jsonb_agg(value order by value #>> '{}'),'[]'::jsonb) into v_selection_themes from jsonb_array_elements(v_selection_themes);
    select coalesce(jsonb_agg(value order by value #>> '{}'),'[]'::jsonb) into v_selection_candidates from jsonb_array_elements(v_selection_candidates);
    select coalesce(jsonb_agg(value order by value #>> '{}'),'[]'::jsonb) into v_selection_articles from jsonb_array_elements(v_selection_articles);
    v_selection := jsonb_build_object('sourceIds',v_selection_sources,'reviewArticleIds',v_selection_articles,
      'newArticleCount',(v_selection ->> 'newArticleCount')::integer)
      || case when p_request -> 'selection' ? 'themeIds' then jsonb_build_object('themeIds',v_selection_themes) else '{}'::jsonb end
      || case when p_request -> 'selection' ? 'candidateArticleIds' then jsonb_build_object('candidateArticleIds',v_selection_candidates) else '{}'::jsonb end;
  end if;
  return jsonb_build_object('version',1,'preparationKey',lower(p_request ->> 'preparationKey'),
    'title',btrim(p_request ->> 'title'),
    'themes',(select coalesce(jsonb_agg(t order by t ->> 'themeId'),'[]') from jsonb_array_elements(v_themes) t),
    'sources',(select coalesce(jsonb_agg(s order by s ->> 'sourceId'),'[]') from jsonb_array_elements(v_sources) s))
    || case when v_selection is null then '{}'::jsonb else jsonb_build_object('selection',v_selection) end;
end;
$function$;
create or replace function public.newsroom_mesa_preview_intents_v1(p_request jsonb)
returns table(plan jsonb) language plpgsql stable security definer set search_path = '' as $function$
declare
  v_request jsonb := public.newsroom_mesa_normalize_intent_v1(p_request);
  v_intent jsonb; v_theme public.newsroom_editorial_themes%rowtype;
  v_id uuid; v_key text; v_source jsonb; v_sources jsonb; v_history jsonb; v_candidates jsonb;
  v_contexts jsonb := '[]'; v_outputs jsonb := '[]'; v_incorporations jsonb := '[]';
  v_context jsonb; v_article jsonb; v_review_count integer := 0; v_new_count integer := 0;
  v_source_count integer; v_i integer; v_material jsonb;
begin
  for v_intent in select t from jsonb_array_elements(v_request -> 'themes') t where t ->> 'action' = 'prepare' loop
    select * into v_theme from public.newsroom_editorial_themes t where t.id = (v_intent ->> 'themeId')::uuid and t.status = 'open';
    if not found then raise exception 'mesa-intent-theme-unavailable' using detail = v_intent ->> 'themeId'; end if;
    v_key := 'theme:' || v_theme.id::text;
    v_sources := '[]';
    for v_id in
      select m.newsroom_article_id from public.newsroom_editorial_theme_sources m where m.theme_id = v_theme.id
      union select (s ->> 'sourceId')::uuid from jsonb_array_elements(v_request -> 'sources') s
        where s ->> 'destination' = 'theme' and s ->> 'themeId' = v_theme.id::text
      order by 1
    loop
      v_source := public.newsroom_mesa_intent_source_v1(v_id);
      if v_source is null or v_source ->> 'newsroomSnapshotId' is null or v_source -> 'usable' is distinct from 'true'::jsonb then
        raise exception 'mesa-intent-source-snapshot-unavailable' using detail = v_key || ':' || v_id::text;
      end if;
      if v_source ->> 'classificationKey' is null then raise exception 'mesa-intent-classification-required' using detail = v_id::text; end if;
      v_sources := v_sources || jsonb_build_array(v_source);
      if not exists (select 1 from public.newsroom_editorial_theme_sources m where m.theme_id = v_theme.id and m.newsroom_article_id = v_id) then
        v_incorporations := v_incorporations || jsonb_build_array(jsonb_build_object('themeId',v_theme.id,'sourceId',v_id));
      end if;
    end loop;
    if jsonb_array_length(v_sources) = 0 then raise exception 'mesa-intent-theme-sources-missing' using detail = v_key; end if;
    select coalesce(jsonb_agg(jsonb_build_object('editorialArticleId',a.id,'slug',a.slug,'title',a.title,
      'matchdayId',a.matchday_id,'contentFingerprint',encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex'),
      'article',to_jsonb(a)) order by a.id),'[]') into v_history
    from public.newsroom_editorial_theme_articles m join public.editorial_articles a on a.id = m.editorial_article_id
    where m.theme_id = v_theme.id and a.status = 'published';
    if exists (select 1 from jsonb_array_elements(v_history) a where nullif(btrim(a ->> 'slug'),'') is null or nullif(btrim(a ->> 'title'),'') is null) then
      raise exception 'mesa-intent-published-history-invalid' using detail = v_key;
    end if;
    if (v_intent ->> 'reviewPublished')::boolean and jsonb_array_length(v_history) = 0 then
      raise exception 'mesa-intent-nothing-to-review' using detail = v_key;
    end if;
    if not (v_intent ->> 'reviewPublished')::boolean and (v_intent ->> 'newArticleCount')::integer = 0 then
      raise exception 'mesa-intent-theme-work-missing' using detail = v_key;
    end if;
    v_contexts := v_contexts || jsonb_build_array(jsonb_build_object('key',v_key,'kind','theme',
      'themeId',v_theme.id,'sourceId',null,'title',v_theme.title,'theme',to_jsonb(v_theme),
      'reviewPublished',v_intent -> 'reviewPublished','newArticleCount',v_intent -> 'newArticleCount',
      'sources',v_sources,'publishedArticles',v_history));
  end loop;
  for v_intent in select s from jsonb_array_elements(v_request -> 'sources') s where s ->> 'destination' = 'independent' loop
    v_id := (v_intent ->> 'sourceId')::uuid; v_key := 'source:' || v_id::text;
    if exists (select 1 from public.newsroom_editorial_theme_sources m where m.newsroom_article_id = v_id) then
      raise exception 'mesa-intent-independent-source-not-loose' using detail = v_key;
    end if;
    v_source := public.newsroom_mesa_intent_source_v1(v_id);
    if v_source is null or v_source ->> 'newsroomSnapshotId' is null or v_source -> 'usable' is distinct from 'true'::jsonb then
      raise exception 'mesa-intent-source-snapshot-unavailable' using detail = v_key;
    end if;
    if v_source ->> 'classificationKey' is null then raise exception 'mesa-intent-classification-required' using detail = v_key; end if;
    v_contexts := v_contexts || jsonb_build_array(jsonb_build_object('key',v_key,'kind','source',
      'themeId',null,'sourceId',v_id,'title','Fonte independente','reviewPublished',false,
      'newArticleCount',v_intent -> 'newArticleCount','sources',jsonb_build_array(v_source),'publishedArticles','[]'::jsonb));
  end loop;
  if v_request ? 'selection' then
    v_key := 'selection:' || (v_request ->> 'preparationKey');
    if exists (
      select 1 from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'themeIds','[]'::jsonb)) selected
      where not exists (select 1 from public.newsroom_editorial_themes theme
        where theme.id=(selected #>> '{}')::uuid and theme.status='open')
    ) then raise exception 'mesa-intent-theme-unavailable' using detail=v_key; end if;
    v_sources := '[]'::jsonb;
    for v_id in
      select (value #>> '{}')::uuid from jsonb_array_elements(v_request -> 'selection' -> 'sourceIds')
      union
      select membership.newsroom_article_id from public.newsroom_editorial_theme_sources membership
      where membership.theme_id in (
        select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'themeIds','[]'::jsonb))
      )
      order by 1
    loop
      v_source := public.newsroom_mesa_intent_source_v1(v_id);
      if v_source is null or v_source ->> 'newsroomSnapshotId' is null or v_source -> 'usable' is distinct from 'true'::jsonb
      then raise exception 'mesa-intent-source-snapshot-unavailable' using detail=v_key||':'||v_id::text; end if;
      if v_source ->> 'classificationKey' is null then raise exception 'mesa-intent-classification-required' using detail=v_key||':'||v_id::text; end if;
      v_sources := v_sources || jsonb_build_array(v_source);
    end loop;
    if jsonb_array_length(v_sources)=0 then raise exception 'mesa-intent-selection-sources-missing' using detail=v_key; end if;
    select candidates into strict v_candidates from public.newsroom_mesa_global_article_candidates_v1(
      array(select (value #>> '{}')::uuid from jsonb_array_elements(v_request -> 'selection' -> 'sourceIds')),
      array(select (value #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'themeIds','[]'::jsonb)))
    );
    if v_request -> 'selection' ? 'candidateArticleIds' and
      (select coalesce(jsonb_agg(candidate -> 'editorialArticleId' order by candidate ->> 'editorialArticleId'),'[]'::jsonb)
       from jsonb_array_elements(v_candidates) candidate) is distinct from v_request -> 'selection' -> 'candidateArticleIds'
    then raise exception 'mesa-intent-selection-candidates-stale' using detail=v_key; end if;
    if exists (
      select 1 from jsonb_array_elements(v_request -> 'selection' -> 'reviewArticleIds') requested
      where not exists (select 1 from jsonb_array_elements(v_candidates) candidate where candidate ->> 'editorialArticleId'=requested #>> '{}')
    ) then raise exception 'mesa-intent-selection-target-unavailable' using detail=v_key; end if;
    select coalesce(jsonb_agg(candidate order by candidate ->> 'editorialArticleId'),'[]'::jsonb)
      into v_history from jsonb_array_elements(v_candidates) candidate
      where exists (select 1 from jsonb_array_elements(v_request -> 'selection' -> 'reviewArticleIds') requested
        where requested #>> '{}'=candidate ->> 'editorialArticleId');
    v_contexts := v_contexts || jsonb_build_array(jsonb_build_object(
      'key',v_key,'kind','selection','themeId',null,'sourceId',null,'title',v_request ->> 'title',
      'reviewPublished',jsonb_array_length(v_request -> 'selection' -> 'reviewArticleIds')>0,
      'newArticleCount',v_request -> 'selection' -> 'newArticleCount',
      'sources',v_sources,'publishedArticles',v_history,'candidateArticles',v_candidates));
  end if;
  select coalesce(jsonb_agg(c order by c ->> 'key'),'[]') into v_contexts from jsonb_array_elements(v_contexts) c;
  for v_context in select c from jsonb_array_elements(v_contexts) c where (c ->> 'reviewPublished')::boolean loop
    for v_article in select a from jsonb_array_elements(v_context -> 'publishedArticles') a loop
      if exists (select 1 from jsonb_array_elements(v_outputs) o where o -> 'target' ->> 'editorialArticleId' = v_article ->> 'editorialArticleId') then
        raise exception 'mesa-intent-review-target-conflict';
      end if;
      v_review_count := v_review_count + 1;
      v_outputs := v_outputs || jsonb_build_array(jsonb_build_object('slot','EXISTING_' || lpad(v_review_count::text,2,'0'),
        'contextKey',v_context ->> 'key','kind','existing','target',v_article));
    end loop;
  end loop;
  for v_context in select value from jsonb_array_elements(v_contexts) loop
    for v_i in 1..(v_context ->> 'newArticleCount')::integer loop
      v_new_count := v_new_count + 1;
      v_outputs := v_outputs || jsonb_build_array(jsonb_build_object('slot','NEW_' || lpad(v_new_count::text,2,'0'),
        'contextKey',v_context ->> 'key','kind','new','target',null));
    end loop;
  end loop;
  select count(distinct s ->> 'newsroomArticleId')::integer into v_source_count
    from jsonb_array_elements(v_contexts) c cross join lateral jsonb_array_elements(c -> 'sources') s;
  if jsonb_array_length(v_contexts) > 20 then raise exception 'mesa-intent-context-limit'; end if;
  if v_source_count > 20 then raise exception 'mesa-intent-source-limit'; end if;
  if v_review_count + v_new_count = 0 then raise exception 'mesa-intent-no-work-requested'; end if;
  if v_review_count + v_new_count > 30 then raise exception 'mesa-intent-output-limit'; end if;
  v_material := jsonb_build_object('contractVersion',1,'request',v_request,
    'preparationKey',v_request ->> 'preparationKey','title',v_request ->> 'title',
    'contexts',v_contexts,'outputs',v_outputs,'incorporations',v_incorporations,
    'deferred',jsonb_build_object(
      'themeIds',(select coalesce(jsonb_agg(t -> 'themeId'),'[]') from jsonb_array_elements(v_request -> 'themes') t where t ->> 'action' = 'defer'),
      'sourceIds',(select coalesce(jsonb_agg(s -> 'sourceId'),'[]') from jsonb_array_elements(v_request -> 'sources') s where s ->> 'destination' = 'defer')),
    'totals',jsonb_build_object('contexts',jsonb_array_length(v_contexts),'sources',v_source_count,'reviews',v_review_count,'newArticles',v_new_count));
  return query select v_material || jsonb_build_object('capturedAt',to_char(statement_timestamp() at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'authorityFingerprint',encode(sha256(convert_to(v_material::text,'UTF8')),'hex'));
end;
$function$;
create or replace function public.newsroom_prepare_mesa_intents_v1(p_request jsonb, p_expected_authority_fingerprint text)
returns table(result jsonb) language plpgsql volatile security definer set search_path = '' as $function$
declare
  v_request jsonb := public.newsroom_mesa_normalize_intent_v1(p_request);
  v_key uuid := (v_request ->> 'preparationKey')::uuid;
  v_existing public.newsroom_mesa_intent_preparations%rowtype;
  v_preview jsonb; v_contexts jsonb := '[]'; v_context jsonb; v_item jsonb;
  v_result record; v_context_id uuid; v_plan_id uuid; v_ids uuid[]; v_plan_ids uuid[] := '{}';
  v_frozen_contexts jsonb := '[]'; v_outputs jsonb := '[]'; v_frozen jsonb; v_i integer := 0;
begin
  if p_expected_authority_fingerprint is null or p_expected_authority_fingerprint !~ '^[0-9a-f]{64}$' then
    raise exception 'mesa-intent-fingerprint-invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1',0));
  -- Test idempotency before current-state reads: a retry must not be invalidated
  -- by memberships created by its own first successful call.
  select * into v_existing from public.newsroom_mesa_intent_preparations p where p.preparation_key = v_key;
  if found then
    if v_existing.request is distinct from v_request or v_existing.authority_fingerprint is distinct from p_expected_authority_fingerprint then
      raise exception 'mesa-intent-preparation-conflict';
    end if;
    return query select jsonb_build_object('dossierId',v_existing.dossier_id,'preparationAction','reused','plan',v_existing.frozen_plan);
    return;
  end if;
  if exists (select 1 from public.newsroom_mesa_production_contexts w where w.preparation_key = v_key)
    or exists (select 1 from public.newsroom_editorial_dossiers d where d.preparation_key = v_key)
  then raise exception 'mesa-intent-preparation-key-used'; end if;
  update public.newsroom_mesa_containment_guard set revision = not revision where singleton;
  if not found then raise exception 'mesa-organization-containment-guard-missing'; end if;
  perform 1 from public.newsroom_editorial_themes t where t.id in (
    select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare'
    union select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'themeIds','[]'::jsonb)) x
  ) order by t.id for update;
  -- Parent FOR UPDATE locks also block an ingest inserting a new snapshot through
  -- its FK while sources are frozen. Existing snapshot rows are locked as well.
  perform 1 from public.newsroom_articles a where a.id in (
    select (x ->> 'sourceId')::uuid from jsonb_array_elements(v_request -> 'sources') x where x ->> 'destination' <> 'defer'
    union select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'sourceIds','[]'::jsonb)) x
    union select m.newsroom_article_id from public.newsroom_editorial_theme_sources m
      where m.theme_id in (
        select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare'
        union select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'themeIds','[]'::jsonb)) x
      )
  ) order by a.id for update;
  perform 1 from public.newsroom_article_snapshots s where s.article_id in (
    select a.id from public.newsroom_articles a where a.id in (
      select (x ->> 'sourceId')::uuid from jsonb_array_elements(v_request -> 'sources') x where x ->> 'destination' <> 'defer'
    union select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'sourceIds','[]'::jsonb)) x
      union select m.newsroom_article_id from public.newsroom_editorial_theme_sources m where m.theme_id in (
        select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare'
        union select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'themeIds','[]'::jsonb)) x))
  ) order by s.id for share;
  perform 1 from public.newsroom_editorial_article_classifications c where c.newsroom_article_id in (
    select (x ->> 'sourceId')::uuid from jsonb_array_elements(v_request -> 'sources') x where x ->> 'destination' <> 'defer'
    union select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'sourceIds','[]'::jsonb)) x
    union select m.newsroom_article_id from public.newsroom_editorial_theme_sources m where m.theme_id in (
      select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare'
      union select (x #>> '{}')::uuid from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'themeIds','[]'::jsonb)) x)
  ) order by c.newsroom_article_id for share;
  perform 1 from public.editorial_articles a where a.id in (
    select m.editorial_article_id from public.newsroom_editorial_theme_articles m where m.theme_id in (
      select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare')
    union select (x #>> '{}')::uuid
      from jsonb_array_elements(coalesce(v_request -> 'selection' -> 'reviewArticleIds','[]'::jsonb)) x
  ) order by a.id for share;
  select p.plan into strict v_preview from public.newsroom_mesa_preview_intents_v1(v_request) p;
  if v_preview ->> 'authorityFingerprint' is distinct from p_expected_authority_fingerprint then
    raise exception 'mesa-intent-authority-stale';
  end if;
  -- Incorporations and all workspaces/plans share THIS transaction. Any later
  -- exception rolls everything back; previewing the request never associates.
  for v_item in select value from jsonb_array_elements(v_preview -> 'incorporations') loop
    perform public.newsroom_set_editorial_theme_source_membership_v1((v_item ->> 'themeId')::uuid,(v_item ->> 'sourceId')::uuid,true);
  end loop;
  for v_context in select value from jsonb_array_elements(v_preview -> 'contexts') loop
    v_contexts := v_contexts || jsonb_build_array(jsonb_build_object('kind',v_context -> 'kind',
      'themeId',v_context -> 'themeId','sourceId',v_context -> 'sourceId',
      'sources',(select jsonb_agg(jsonb_build_object('newsroomArticleId',s -> 'newsroomArticleId',
        'newsroomSnapshotId',s -> 'newsroomSnapshotId') order by s ->> 'newsroomArticleId') from jsonb_array_elements(v_context -> 'sources') s)));
  end loop;
  select * into strict v_result from public.newsroom_prepare_mesa_contexts_v3(v_key,v_request ->> 'title',v_contexts,null,'{}');
  for v_context in select value from jsonb_array_elements(v_preview -> 'contexts') loop
    select c.id into strict v_context_id from public.newsroom_mesa_production_context_items c
      where c.dossier_id = v_result.dossier_id and c.context_kind = v_context ->> 'kind'
        and c.theme_id is not distinct from (v_context ->> 'themeId')::uuid
        and c.source_newsroom_article_id is not distinct from (v_context ->> 'sourceId')::uuid;
    v_frozen_contexts := v_frozen_contexts || jsonb_build_array(v_context || jsonb_build_object('productionContextId',v_context_id));
  end loop;
  for v_item in select value from jsonb_array_elements(v_preview -> 'outputs') loop
    v_i := v_i + 1;
    select c into strict v_context from jsonb_array_elements(v_frozen_contexts) c where c ->> 'key' = v_item ->> 'contextKey';
    v_context_id := (v_context ->> 'productionContextId')::uuid;
    select array_agg(s.dossier_source_id order by s.sort_order) into v_ids
      from public.newsroom_mesa_production_context_sources s where s.dossier_id = v_result.dossier_id and s.production_context_id = v_context_id;
    select p.article_plan_id into strict v_plan_id from public.newsroom_save_mesa_context_article_plan_v1(
      v_result.dossier_id,null,left((v_item ->> 'slot') || ' — ' || coalesce(v_item -> 'target' ->> 'title','novo artigo'),180),
      'planned',v_i*10,'news','standard',case when v_item ->> 'kind' = 'existing' then 'Rever o artigo: UPDATE ou SEM ALTERAÇÃO.'
        else 'Produzir artigo novo apenas com as fontes deste contexto; não rever os artigos de referência.' end,v_ids,v_context_id) p;
    perform public.newsroom_save_dossier_article_plan_state_v1(v_result.dossier_id,v_plan_id,
      case when v_item ->> 'kind' = 'existing' then 'update' else 'new' end,
      (v_item -> 'target' ->> 'editorialArticleId')::uuid,'{}',
      case when v_item ->> 'kind' = 'existing' then 'preserve_published' else 'unselected' end,null);
    v_plan_ids := v_plan_ids || v_plan_id;
    v_outputs := v_outputs || jsonb_build_array(v_item || jsonb_build_object('outputId',v_plan_id,'productionContextId',v_context_id));
  end loop;
  perform public.newsroom_set_mesa_shared_outputs_v2(v_result.dossier_id,v_plan_ids);
  v_frozen := v_preview || jsonb_build_object('dossierId',v_result.dossier_id,'contexts',v_frozen_contexts,'outputs',v_outputs);
  insert into public.newsroom_mesa_intent_preparations(preparation_key,dossier_id,request,authority_fingerprint,captured_at,frozen_plan)
    values(v_key,v_result.dossier_id,v_request,p_expected_authority_fingerprint,(v_preview ->> 'capturedAt')::timestamptz,v_frozen);
  update public.newsroom_mesa_production_contexts set selection_payload = selection_payload || jsonb_build_object('productionIntents',v_frozen)
    where dossier_id = v_result.dossier_id;
  return query select jsonb_build_object('dossierId',v_result.dossier_id,'preparationAction','created','plan',v_frozen);
end;
$function$;
commit;
