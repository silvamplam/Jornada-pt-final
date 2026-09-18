-- Opt-in preparation for per-context editorial intent. Existing RPCs and rows
-- remain unchanged. Do not enable the UI until package/publication integration.
begin;

do $preflight$
begin
  if to_regprocedure('public.newsroom_prepare_mesa_contexts_v3(uuid,text,jsonb,uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_save_mesa_context_article_plan_v1(uuid,uuid,text,text,integer,text,text,text,uuid[],uuid)') is null
    or to_regprocedure('public.newsroom_save_dossier_article_plan_state_v1(uuid,uuid,text,uuid,uuid[],text,uuid)') is null
    or to_regclass('public.newsroom_mesa_containment_guard') is null
  then raise exception 'mesa-intent-preflight-authority-missing'; end if;
  if to_regclass('public.newsroom_mesa_intent_preparations') is not null then
    raise exception 'mesa-intent-preflight-target-present';
  end if;
end;
$preflight$;

create table public.newsroom_mesa_intent_preparations (
  preparation_key uuid primary key,
  dossier_id uuid not null unique references public.newsroom_mesa_production_contexts(dossier_id) on delete restrict,
  request jsonb not null check (jsonb_typeof(request) = 'object'),
  authority_fingerprint text not null check (authority_fingerprint ~ '^[0-9a-f]{64}$'),
  captured_at timestamptz not null,
  frozen_plan jsonb not null check (
    jsonb_typeof(frozen_plan) = 'object'
    and frozen_plan ->> 'contractVersion' = '1'
    and frozen_plan ->> 'preparationKey' = preparation_key::text
    and frozen_plan ->> 'dossierId' = dossier_id::text
  ),
  created_at timestamptz not null default clock_timestamp()
);
alter table public.newsroom_mesa_intent_preparations enable row level security;
alter table public.newsroom_mesa_intent_preparations force row level security;
revoke all on public.newsroom_mesa_intent_preparations from public, anon, authenticated, service_role;
grant select on public.newsroom_mesa_intent_preparations to service_role;

-- Normalize before idempotency checks; this also makes array order irrelevant.
-- No identifiers or UPDATE targets supplied in a plan are trusted by the writer.
create function public.newsroom_mesa_normalize_intent_v1(p_request jsonb)
returns jsonb language plpgsql immutable set search_path = '' as $function$
declare
  v_item jsonb; v_themes jsonb := '[]'; v_sources jsonb := '[]';
  v_uuid constant text := '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(p_request) is distinct from 'object'
    or not (p_request ?& array['version','preparationKey','title','themes','sources'])
    or p_request - array['version','preparationKey','title','themes','sources'] <> '{}'
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
  return jsonb_build_object('version',1,'preparationKey',lower(p_request ->> 'preparationKey'),
    'title',btrim(p_request ->> 'title'),
    'themes',(select coalesce(jsonb_agg(t order by t ->> 'themeId'),'[]') from jsonb_array_elements(v_themes) t),
    'sources',(select coalesce(jsonb_agg(s order by s ->> 'sourceId'),'[]') from jsonb_array_elements(v_sources) s));
end;
$function$;
revoke all on function public.newsroom_mesa_normalize_intent_v1(jsonb) from public, anon, authenticated, service_role;

-- Private helper: capture identity plus a hash of metadata AND body, so changes
-- under the same snapshot ID cannot evade the final transaction comparison.
create function public.newsroom_mesa_intent_source_v1(p_source_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $function$
  select jsonb_build_object('newsroomArticleId',a.id,'newsroomSnapshotId',s.id,
    'capturedAt',to_char(s.extracted_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'contentFingerprint',encode(sha256(convert_to(jsonb_build_object('article',to_jsonb(a),
      'snapshot',to_jsonb(s),'classification',to_jsonb(c))::text,'UTF8')),'hex'),
    'usable',jsonb_typeof(s.body) = 'array' and exists (
      select 1 from jsonb_array_elements(case when jsonb_typeof(s.body) = 'array' then s.body else '[]' end) b
      where b ->> 'type' in ('paragraph','heading') and nullif(btrim(b ->> 'text'),'') is not null),
    'classificationKey',c.classification_key)
  from public.newsroom_articles a
  left join lateral (select * from public.newsroom_article_snapshots x where x.article_id = a.id
    order by x.extracted_at desc, x.created_at desc, x.id desc limit 1) s on true
  left join public.newsroom_editorial_article_classifications c on c.newsroom_article_id = a.id
  where a.id = p_source_id;
$function$;
revoke all on function public.newsroom_mesa_intent_source_v1(uuid) from public, anon, authenticated, service_role;

create function public.newsroom_mesa_preview_intents_v1(p_request jsonb)
returns table(plan jsonb) language plpgsql stable security definer set search_path = '' as $function$
declare
  v_request jsonb := public.newsroom_mesa_normalize_intent_v1(p_request);
  v_intent jsonb; v_theme public.newsroom_editorial_themes%rowtype;
  v_id uuid; v_key text; v_source jsonb; v_sources jsonb; v_history jsonb;
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
revoke all on function public.newsroom_mesa_preview_intents_v1(jsonb) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_mesa_preview_intents_v1(jsonb) to service_role;

create function public.newsroom_prepare_mesa_intents_v1(p_request jsonb, p_expected_authority_fingerprint text)
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
  ) order by t.id for update;
  -- Parent FOR UPDATE locks also block an ingest inserting a new snapshot through
  -- its FK while sources are frozen. Existing snapshot rows are locked as well.
  perform 1 from public.newsroom_articles a where a.id in (
    select (x ->> 'sourceId')::uuid from jsonb_array_elements(v_request -> 'sources') x where x ->> 'destination' <> 'defer'
    union select m.newsroom_article_id from public.newsroom_editorial_theme_sources m
      where m.theme_id in (select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare')
  ) order by a.id for update;
  perform 1 from public.newsroom_article_snapshots s where s.article_id in (
    select a.id from public.newsroom_articles a where a.id in (
      select (x ->> 'sourceId')::uuid from jsonb_array_elements(v_request -> 'sources') x where x ->> 'destination' <> 'defer'
      union select m.newsroom_article_id from public.newsroom_editorial_theme_sources m where m.theme_id in (
        select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare'))
  ) order by s.id for share;
  perform 1 from public.newsroom_editorial_article_classifications c where c.newsroom_article_id in (
    select (x ->> 'sourceId')::uuid from jsonb_array_elements(v_request -> 'sources') x where x ->> 'destination' <> 'defer'
    union select m.newsroom_article_id from public.newsroom_editorial_theme_sources m where m.theme_id in (
      select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare')
  ) order by c.newsroom_article_id for share;
  perform 1 from public.editorial_articles a where a.id in (
    select m.editorial_article_id from public.newsroom_editorial_theme_articles m where m.theme_id in (
      select (x ->> 'themeId')::uuid from jsonb_array_elements(v_request -> 'themes') x where x ->> 'action' = 'prepare')
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
revoke all on function public.newsroom_prepare_mesa_intents_v1(jsonb,text) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_prepare_mesa_intents_v1(jsonb,text) to service_role;

-- Receipts are intentionally not written here. Preparing or publishing NEW must
-- never mean that the old articles were reviewed. Completion needs its own gate.
commit;
