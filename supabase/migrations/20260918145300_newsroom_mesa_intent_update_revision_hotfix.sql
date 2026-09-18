-- Hotfix: an UPDATE revises an existing canonical article. It must not
-- claim the globally unique editorial_article_id link already owned by the
-- Article Plan that originally created that article.
begin;

do $preflight$
declare
  v_definition text;
begin
  if to_regprocedure('public.newsroom_publish_mesa_intent_output_v1(uuid,uuid,uuid,uuid[],jsonb)') is null then
    raise exception 'mesa-intent-update-revision-hotfix-publisher-missing';
  end if;
  if to_regprocedure('public.newsroom_finalize_mesa_intents_v1(uuid,uuid,uuid[])') is null then
    raise exception 'mesa-intent-update-revision-hotfix-finalizer-missing';
  end if;
  select pg_get_functiondef('public.newsroom_publish_mesa_intent_output_v1(uuid,uuid,uuid,uuid[],jsonb)'::regprocedure)
    into v_definition;
  if strpos(v_definition, 'set editorial_article_id = v_article_id, updated_at = v_now') = 0 then
    raise exception 'mesa-intent-update-revision-hotfix-unexpected-publisher';
  end if;
  if to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or to_regclass('public.newsroom_mesa_output_publications') is null then
    raise exception 'mesa-intent-update-revision-hotfix-schema-missing';
  end if;
end;
$preflight$;

create or replace function public.newsroom_publish_mesa_intent_output_v1(
  p_dossier_id uuid,
  p_output_id uuid,
  p_package_id uuid,
  p_dossier_source_ids uuid[],
  p_article jsonb
)
returns table(
  editorial_article_id uuid,
  article_slug text,
  publication_action text,
  consolidated boolean
)
language plpgsql security definer set search_path = '' as $function$
declare
  v_intent jsonb; v_slot jsonb; v_expected jsonb; v_current jsonb;
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_plan public.newsroom_editorial_dossier_article_plans%rowtype;
  v_manifest jsonb; v_manifest_output jsonb;
  v_existing public.newsroom_mesa_output_publications%rowtype;
  v_article_id uuid; v_slug text; v_label text; v_title text; v_subtitle text; v_body text;
  v_image text; v_author text; v_published_at timestamptz; v_matchday uuid; v_mode text;
  v_previous_slug text; v_source_scope text := 'workspace'; v_production_context_id uuid;
  v_declared_context_source_ids uuid[]; v_frozen_context_source_ids uuid[];
  v_is_2c boolean;
  v_payload jsonb; v_fingerprint text; v_consolidated boolean; v_now timestamptz := now();
begin
  if p_dossier_id is null or p_output_id is null or p_package_id is null
    or p_dossier_source_ids is null or cardinality(p_dossier_source_ids) < 1
    or cardinality(p_dossier_source_ids) > 20 or array_position(p_dossier_source_ids, null) is not null
    or (select count(distinct source_id) from unnest(p_dossier_source_ids) source_id) <> cardinality(p_dossier_source_ids)
    or p_article is null or jsonb_typeof(p_article) <> 'object' then
    raise exception 'mesa-publication-input-invalid';
  end if;

  -- All intent writers/finalizers acquire the workspace first, then canonical
  -- articles in ID order. Publication never calls the generic consolidator.
  v_intent := public.newsroom_mesa_lock_intent_publication_v1(p_dossier_id,p_package_id);
  select o into v_slot from jsonb_array_elements(v_intent -> 'outputs') o
    where o ->> 'outputId' = p_output_id::text;
  if not found then raise exception 'mesa-intent-output-invalid'; end if;
  v_expected := v_slot -> 'target';
  select * into v_context from public.newsroom_mesa_production_contexts context
    where context.dossier_id = p_dossier_id for update;
  if not found or v_context.workspace_role <> 'technical' or v_context.workspace_contract_version <> 2
    or v_context.workspace_state not in ('active', 'consolidated') then
    raise exception 'mesa-publication-workspace-invalid';
  end if;

  v_is_2c := coalesce(
    v_context.selection_payload ->> 'contractVersion' = '3'
      and v_context.selection_payload ->> 'contextContractVersion' = '1',
    false
  );
  if coalesce(
    v_context.selection_payload ->> 'contractVersion' = '3'
      or v_context.selection_payload ? 'contextContractVersion',
    false
  ) and not v_is_2c then
    raise exception 'mesa-publication-workspace-invalid';
  end if;
  if v_is_2c is distinct from (exists (
      select 1 from public.newsroom_mesa_production_context_items context_item
      where context_item.dossier_id = p_dossier_id
    )) then
    raise exception 'mesa-publication-workspace-invalid';
  end if;

  select * into v_plan from public.newsroom_editorial_dossier_article_plans plan
    where plan.dossier_id = p_dossier_id and plan.id = p_output_id
      and plan.status <> 'cancelled' for update;
  if not found then raise exception 'mesa-publication-output-invalid'; end if;

  if v_is_2c then
    select assignment.production_context_id
    into v_production_context_id
    from public.newsroom_mesa_article_plan_contexts assignment
    where assignment.dossier_id = p_dossier_id
      and assignment.article_plan_id = p_output_id;
    if not found or not public.newsroom_mesa_plan_context_sources_valid_v1(
      p_dossier_id, p_output_id, v_production_context_id
    ) then
      raise exception 'mesa-publication-output-invalid';
    end if;
    v_source_scope := 'context';
  elsif exists (
    select 1 from public.newsroom_mesa_article_plan_contexts assignment
    where assignment.dossier_id = p_dossier_id
      and assignment.article_plan_id = p_output_id
  ) then
    raise exception 'mesa-publication-workspace-invalid';
  end if;

  select package.manifest into v_manifest from public.newsroom_editorial_source_packages package
    where package.id = p_package_id for update;
  if not found or (v_manifest ->> 'version')::integer <> 5
    or v_manifest ->> 'provenanceContract' <> 'mesa-v2' then
    raise exception 'mesa-publication-package-invalid';
  end if;

  select output.value into v_manifest_output
  from jsonb_array_elements(v_manifest -> 'outputs') output(value)
  where lower(output.value ->> 'outputId') = p_output_id::text
    and lower(output.value -> 'articlePlan' ->> 'articlePlanId') = p_output_id::text
    and lower(output.value -> 'articlePlan' ->> 'dossierId') = p_dossier_id::text;
  if not found
    or v_manifest_output -> 'articlePlan' ->> 'sourceScope' is distinct from v_source_scope
    or v_manifest_output -> 'articlePlan' ? 'origin' then
    raise exception 'mesa-publication-package-invalid';
  end if;

  if v_source_scope = 'context' then
    if lower(v_manifest_output -> 'articlePlan' ->> 'contextId')
      is distinct from v_production_context_id::text
      or jsonb_typeof(v_manifest_output -> 'contextSourceIds') is distinct from 'array'
    then
      raise exception 'mesa-publication-package-invalid';
    end if;
    begin
      select array_agg((source_id.value #>> '{}')::uuid order by (source_id.value #>> '{}')::uuid)
      into v_declared_context_source_ids
      from jsonb_array_elements(v_manifest_output -> 'contextSourceIds') source_id(value);
    exception when others then
      raise exception 'mesa-publication-package-invalid';
    end;
    select array_agg(context_source.dossier_source_id order by context_source.dossier_source_id)
    into v_frozen_context_source_ids
    from public.newsroom_mesa_production_context_sources context_source
    where context_source.dossier_id = p_dossier_id
      and context_source.production_context_id = v_production_context_id;
    if v_declared_context_source_ids is distinct from v_frozen_context_source_ids
      or exists (
        select 1 from unnest(p_dossier_source_ids) requested(id)
        where not (requested.id = any(v_frozen_context_source_ids))
      )
    then
      raise exception 'mesa-publication-source-invalid';
    end if;
  end if;

  if exists(select 1 from unnest(p_dossier_source_ids) requested(id)
    left join public.newsroom_editorial_dossier_sources dossier_source
      on dossier_source.id = requested.id
      and dossier_source.dossier_id = p_dossier_id
      and dossier_source.included
    where dossier_source.id is null
      or not exists(select 1 from jsonb_array_elements(v_context.source_refs) ref
        where lower(ref ->> 'newsroomArticleId') = dossier_source.newsroom_article_id::text
          and lower(ref ->> 'newsroomSnapshotId') = dossier_source.newsroom_snapshot_id::text)
      or not exists(select 1 from jsonb_array_elements(v_manifest -> 'entries') entry
        where entry ->> 'status' = 'prepared'
          and lower(entry ->> 'provenanceSourceId') = requested.id::text
          and lower(entry ->> 'newsroomArticleId') = dossier_source.newsroom_article_id::text
          and lower(entry ->> 'newsroomSnapshotId') = dossier_source.newsroom_snapshot_id::text)
  ) then raise exception 'mesa-publication-source-invalid'; end if;

  begin
    v_article_id := (p_article ->> 'id')::uuid;
  exception when others then
    raise exception 'mesa-publication-article-invalid';
  end;
  v_slug := btrim(coalesce(p_article ->> 'slug', ''));
  v_label := btrim(coalesce(p_article ->> 'label', ''));
  v_title := btrim(coalesce(p_article ->> 'title', ''));
  v_subtitle := btrim(coalesce(p_article ->> 'subtitle', ''));
  v_body := btrim(coalesce(p_article ->> 'body', ''));
  v_image := nullif(btrim(coalesce(p_article ->> 'imageUrl', '')), '');
  v_author := btrim(coalesce(p_article ->> 'author', ''));
  v_mode := lower(btrim(coalesce(p_article ->> 'mode', '')));
  begin
    v_published_at := (p_article ->> 'publishedAt')::timestamptz;
    v_matchday := (p_article ->> 'matchdayId')::uuid;
  exception when others then
    raise exception 'mesa-publication-article-invalid';
  end;
  if v_article_id is null or v_published_at is null
    or v_slug = '' or v_label = '' or v_title = '' or v_subtitle = '' or v_body = '' or v_author = ''
    or v_mode not in ('create', 'update') then
    raise exception 'mesa-publication-article-invalid';
  end if;

  v_payload := jsonb_build_object(
    'article', jsonb_build_object(
      'id', v_article_id, 'slug', v_slug, 'label', v_label, 'title', v_title,
      'subtitle', v_subtitle, 'body', v_body, 'imageUrl', v_image, 'author', v_author,
      'publishedAt', v_published_at, 'matchdayId', v_matchday, 'mode', v_mode
    ),
    'sources', (select to_jsonb(array_agg(source_id order by source_id)) from unnest(p_dossier_source_ids) source_id),
    'packageId', p_package_id,
    'outputId', p_output_id,
    'sourceScope', v_source_scope
  ) || case when v_source_scope = 'context'
    then jsonb_build_object('contextId', v_production_context_id)
    else '{}'::jsonb end;
  v_fingerprint := md5(v_payload::text);

  select * into v_existing from public.newsroom_mesa_output_publications publication
    where publication.dossier_id = p_dossier_id and publication.article_plan_id = p_output_id;
  if found then
    if v_existing.fingerprint <> v_fingerprint or v_existing.editorial_article_id <> v_article_id
      or v_existing.source_scope is distinct from v_source_scope
      or v_existing.production_context_id is distinct from v_production_context_id
      or not exists(select 1 from public.editorial_articles article
        where article.id = v_article_id and article.status = 'published') then
      raise exception 'mesa-publication-provenance-conflict';
    end if;
    -- Retry never overwrites a later manual edit, even after the first write.
    select to_jsonb(a) into v_current from public.editorial_articles a where a.id=v_article_id for update;
    if encode(sha256(convert_to(v_current::text,'UTF8')),'hex')
        is distinct from v_existing.payload ->> 'intentResultFingerprint' then
      raise exception 'mesa-intent-published-result-stale';
    end if;
    return query select v_article_id, v_slug, 'reused'::text,
      v_context.workspace_state = 'consolidated';
    return;
  end if;
  if v_context.workspace_state = 'consolidated' then
    raise exception 'mesa-publication-provenance-conflict';
  end if;

  if v_mode = 'create' then
    if v_slot ->> 'kind' <> 'new' or v_matchday is null
      or v_plan.destination <> 'new' or v_plan.update_target_editorial_article_id is not null
      or v_image is null
      or exists(select 1 from public.editorial_articles article
        where article.id = v_article_id or article.slug = v_slug) then
      raise exception 'mesa-publication-article-conflict';
    end if;
    insert into public.editorial_articles(
      id, status, scope, author, label, title, subtitle, body, slug, image_url,
      image_caption, published_at, competition_id, season_id, matchday_id, created_at, updated_at
    ) values (
      v_article_id, 'published', 'matchday', v_author, v_label, v_title, v_subtitle,
      v_body, v_slug, v_image, null, v_published_at, null, null, v_matchday, v_now, v_now
    );
  else
    if v_slot ->> 'kind' <> 'existing' or v_plan.destination <> 'update'
      or v_plan.update_target_editorial_article_id is distinct from v_article_id
      or v_expected ->> 'editorialArticleId' is distinct from v_article_id::text
      or v_expected ->> 'slug' is distinct from v_slug
      or (v_expected ->> 'matchdayId')::uuid is distinct from v_matchday then
      raise exception 'mesa-publication-update-target-invalid';
    end if;
    select to_jsonb(article), article.slug into v_current, v_previous_slug
      from public.editorial_articles article
      where article.id=v_article_id and article.status='published' for update;
    if not found or encode(sha256(convert_to(v_current::text,'UTF8')),'hex')
        is distinct from v_expected ->> 'contentFingerprint' then
      raise exception 'mesa-intent-update-target-stale';
    end if;
    -- Preserve scope, competition, season, matchday (including NULL), slug,
    -- publication date, caption and all other non-editorial identity fields.
    update public.editorial_articles article
      set label=v_label, title=v_title, subtitle=v_subtitle, body=v_body,
        author=v_author, image_url=coalesce(v_image,article.image_url), updated_at=v_now
      where article.id=v_article_id and article.status='published'
        and article.matchday_id is not distinct from v_matchday and article.slug=v_slug;
    if not found then raise exception 'mesa-publication-update-target-invalid'; end if;
  end if;

  insert into public.newsroom_mesa_output_publications(
    dossier_id, article_plan_id, package_id, editorial_article_id, source_scope,
    production_context_id, origin_kind, origin_dossier_source_id, material_key,
    material_version_id, fingerprint, payload
  ) values (
    p_dossier_id, p_output_id, p_package_id, v_article_id, v_source_scope,
    v_production_context_id, null, null, null, null, v_fingerprint,
    v_payload || jsonb_build_object('intentResultFingerprint',(
      select encode(sha256(convert_to(to_jsonb(a)::text,'UTF8')),'hex')
      from public.editorial_articles a where a.id=v_article_id
    ))
  );
  insert into public.newsroom_mesa_output_source_usage(
    dossier_id, article_plan_id, dossier_source_id, newsroom_article_id,
    newsroom_snapshot_id, editorial_article_id, package_id
  ) select p_dossier_id, p_output_id, dossier_source.id, dossier_source.newsroom_article_id,
      dossier_source.newsroom_snapshot_id, v_article_id, p_package_id
    from public.newsroom_editorial_dossier_sources dossier_source
    where dossier_source.dossier_id = p_dossier_id
      and dossier_source.id = any(p_dossier_source_ids);
  -- NEW materializes a new canonical article and therefore owns the
  -- one-to-one Article Plan -> editorial_article_id link. UPDATE is a revision
  -- of an article that may already be owned by its original creation plan; the
  -- revision is linked through newsroom_mesa_output_publications and receipts.
  if v_mode = 'create' then
    update public.newsroom_editorial_dossier_article_plans plan
      set editorial_article_id = v_article_id, updated_at = v_now
      where plan.dossier_id = p_dossier_id and plan.id = p_output_id
        and plan.editorial_article_id is null;
    if not found then raise exception 'mesa-publication-output-conflict'; end if;
  elsif exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.dossier_id = p_dossier_id
      and plan.id = p_output_id
      and plan.editorial_article_id is not null
      and plan.editorial_article_id is distinct from v_article_id
  ) then
    raise exception 'mesa-publication-output-conflict';
  end if;
  v_consolidated := false; -- only the explicit intent finalizer completes this cycle
  if v_mode = 'update' then
    perform * from public.sync_editorial_article_live_snapshots_v15(v_article_id, v_previous_slug);
  end if;
  return query select v_article_id, v_slug,
    case when v_mode = 'update' then 'updated' else 'created' end, v_consolidated;
end;
$function$;

revoke all on function public.newsroom_publish_mesa_intent_output_v1(uuid, uuid, uuid, uuid[], jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_publish_mesa_intent_output_v1(uuid, uuid, uuid, uuid[], jsonb)
  to service_role;


create or replace function public.newsroom_finalize_mesa_intents_v1(
  p_dossier_id uuid,p_package_id uuid,p_no_change_output_ids uuid[]
)
returns table(result jsonb) language plpgsql volatile security definer set search_path='' as $function$
declare
  v_plan jsonb; v_output jsonb; v_context jsonb; v_article jsonb; v_article_id uuid;
  v_written public.newsroom_mesa_output_publications%rowtype;
  v_final public.newsroom_mesa_intent_finalizations%rowtype;
  v_no_change uuid[]; v_receipts jsonb:='[]'; v_decisions jsonb:='[]';
  v_decision text; v_fingerprint text; v_event uuid; v_payload jsonb;
  v_updated integer:=0; v_new integer:=0; v_unchanged integer:=0;
  v_group record; v_version uuid; v_key text; v_completed timestamptz;
begin
  if p_dossier_id is null or p_package_id is null or p_no_change_output_ids is null
    or cardinality(p_no_change_output_ids)>30 or array_position(p_no_change_output_ids,null) is not null
    or (select count(distinct x) from unnest(p_no_change_output_ids) x)<>cardinality(p_no_change_output_ids) then
    raise exception 'mesa-intent-finalization-input-invalid';
  end if;
  select coalesce(array_agg(x order by x),'{}'::uuid[]) into v_no_change from unnest(p_no_change_output_ids) x;
  -- Completed replay is a historical fact, not a request to overwrite a later
  -- edit. Lock the same workspace as the writer before checking it.
  perform 1 from public.newsroom_mesa_production_contexts w where w.dossier_id=p_dossier_id for update;
  select * into v_final from public.newsroom_mesa_intent_finalizations f where f.dossier_id=p_dossier_id;
  if found then
    if v_final.package_id<>p_package_id or v_final.no_change_output_ids is distinct from v_no_change then
      raise exception 'mesa-intent-finalization-conflict';
    end if;
    return query select jsonb_build_object('action','reused','publicationEventId',v_final.publication_event_id,
      'updatedCount',v_final.updated_count,'newCount',v_final.new_count,'noChangeCount',v_final.no_change_count);
    return;
  end if;
  v_plan:=public.newsroom_mesa_lock_intent_publication_v1(p_dossier_id,p_package_id);
  if exists (select 1 from public.newsroom_mesa_production_contexts w
    where w.dossier_id=p_dossier_id and w.workspace_state<>'active') then
    raise exception 'mesa-intent-finalization-state-invalid';
  end if;
  if exists (select 1 from unnest(v_no_change) id where not exists (
      select 1 from jsonb_array_elements(v_plan -> 'outputs') o where o ->> 'outputId'=id::text and o ->> 'kind'='existing'))
    or exists (select 1 from public.newsroom_mesa_output_publications p where p.dossier_id=p_dossier_id and not exists (
      select 1 from jsonb_array_elements(v_plan -> 'outputs') o where o ->> 'outputId'=p.article_plan_id::text)) then
    raise exception 'mesa-intent-finalization-decision-invalid';
  end if;
  perform 1 from public.editorial_articles a where a.id in (
    select (o -> 'target' ->> 'editorialArticleId')::uuid from jsonb_array_elements(v_plan -> 'outputs') o where o ->> 'kind'='existing'
    union select p.editorial_article_id from public.newsroom_mesa_output_publications p where p.dossier_id=p_dossier_id
  ) order by a.id for update;
  for v_output in select value from jsonb_array_elements(v_plan -> 'outputs') loop
    select c into strict v_context from jsonb_array_elements(v_plan -> 'contexts') c where c ->> 'key'=v_output ->> 'contextKey';
    if (v_output ->> 'outputId')::uuid=any(v_no_change) then
      if exists (select 1 from public.newsroom_mesa_output_publications p where p.dossier_id=p_dossier_id and p.article_plan_id=(v_output ->> 'outputId')::uuid) then
        raise exception 'mesa-intent-no-change-already-published';
      end if;
      v_article_id:=(v_output -> 'target' ->> 'editorialArticleId')::uuid;
      select to_jsonb(a) into v_article from public.editorial_articles a where a.id=v_article_id and a.status='published';
      if not found or encode(sha256(convert_to(v_article::text,'UTF8')),'hex')
          is distinct from v_output -> 'target' ->> 'contentFingerprint' then
        raise exception 'mesa-intent-no-change-target-stale';
      end if;
      v_decision:='SEM_ALTERAÇÃO'; v_unchanged:=v_unchanged+1;
    else
      select * into v_written from public.newsroom_mesa_output_publications p
        where p.dossier_id=p_dossier_id and p.article_plan_id=(v_output ->> 'outputId')::uuid;
      if not found then raise exception 'mesa-intent-publication-incomplete'; end if;
      if v_written.package_id<>p_package_id or v_written.source_scope is distinct from 'context'
        or v_written.production_context_id is distinct from (v_context ->> 'productionContextId')::uuid
        or (v_output ->> 'kind'='existing' and v_written.editorial_article_id is distinct from (v_output -> 'target' ->> 'editorialArticleId')::uuid) then
        raise exception 'mesa-intent-publication-output-invalid';
      end if;
      v_article_id:=v_written.editorial_article_id;
      select to_jsonb(a) into v_article from public.editorial_articles a where a.id=v_article_id and a.status='published';
      if not found or encode(sha256(convert_to(v_article::text,'UTF8')),'hex') is distinct from v_written.payload ->> 'intentResultFingerprint' then
        raise exception 'mesa-intent-published-result-stale';
      end if;
      if not exists (
        select 1
        from public.newsroom_editorial_dossier_article_plans p
        where p.id=v_written.article_plan_id
          and p.dossier_id=p_dossier_id
          and (
            (
              v_output ->> 'kind'='existing'
              and p.destination='update'
              and p.update_target_editorial_article_id=v_article_id
              and (p.editorial_article_id is null or p.editorial_article_id=v_article_id)
            )
            or (
              v_output ->> 'kind'='new'
              and p.destination='new'
              and p.update_target_editorial_article_id is null
              and p.editorial_article_id=v_article_id
            )
          )
      ) then
        raise exception 'mesa-intent-publication-output-invalid';
      end if;
      v_decision:=case when v_output ->> 'kind'='existing' then 'UPDATE' else 'NEW' end;
      if v_decision='UPDATE' then v_updated:=v_updated+1; else v_new:=v_new+1; end if;
    end if;
    v_fingerprint:=encode(sha256(convert_to(v_article::text,'UTF8')),'hex');
    v_decisions:=v_decisions||jsonb_build_array(jsonb_build_object('slot',v_output -> 'slot',
      'outputId',v_output -> 'outputId','contextKey',v_output -> 'contextKey',
      'decision',v_decision,'articleId',v_article_id,'resultFingerprint',v_fingerprint));
    if v_context ->> 'themeId' is not null then
      v_receipts:=v_receipts||jsonb_build_array(jsonb_build_object('themeId',v_context -> 'themeId',
        'articleId',v_article_id,'outputId',v_output -> 'outputId','slot',v_output -> 'slot',
        'decision',v_decision,'sources',v_context -> 'sources','resultFingerprint',v_fingerprint));
    end if;
  end loop;
  v_payload:=jsonb_build_object('contractVersion',1,'kind','mesa_production_intents',
    'packageId',p_package_id,'authorityFingerprint',v_plan -> 'authorityFingerprint',
    'capturedAt',v_plan -> 'capturedAt','decisions',v_decisions);
  insert into public.newsroom_mesa_publication_events(dossier_id,fingerprint,payload)
    values(p_dossier_id,md5(v_payload::text),v_payload) returning id into v_event;
  v_completed:=clock_timestamp();
  insert into public.newsroom_mesa_intent_finalizations(dossier_id,package_id,publication_event_id,
    no_change_output_ids,updated_count,new_count,no_change_count,completed_at)
    values(p_dossier_id,p_package_id,v_event,v_no_change,v_updated,v_new,v_unchanged,v_completed);
  insert into public.newsroom_mesa_intent_article_receipts(dossier_id,output_id,theme_id,editorial_article_id,
    slot,decision,captured_at,completed_at,sources,result_fingerprint)
    select p_dossier_id,(r ->> 'outputId')::uuid,(r ->> 'themeId')::uuid,(r ->> 'articleId')::uuid,
      r ->> 'slot',r ->> 'decision',(v_plan ->> 'capturedAt')::timestamptz,v_completed,r -> 'sources',r ->> 'resultFingerprint'
    from jsonb_array_elements(v_receipts) r;
  -- Preserve technical material projection, but group by context as well as
  -- sources. Equal source sets in different Themes must never merge their work.
  for v_group in
    select x.production_context_id,x.source_refs,array_agg(x.article_id order by x.article_id) article_ids,
      min(x.article_plan_id::text)::uuid key_plan_id
    from (
      select p.production_context_id,u.article_plan_id,min(u.editorial_article_id::text)::uuid article_id,
        public.newsroom_mesa_normalize_refs_v2(jsonb_agg(jsonb_build_object(
          'newsroomArticleId',u.newsroom_article_id,'newsroomSnapshotId',u.newsroom_snapshot_id)
          order by u.newsroom_article_id,u.newsroom_snapshot_id)) source_refs
      from public.newsroom_mesa_output_source_usage u
      join public.newsroom_mesa_output_publications p on p.dossier_id=u.dossier_id and p.article_plan_id=u.article_plan_id
      where u.dossier_id=p_dossier_id group by p.production_context_id,u.article_plan_id having count(*)>=2
    ) x group by x.production_context_id,x.source_refs
  loop
    select c into strict v_context from jsonb_array_elements(v_plan -> 'contexts') c
      where c ->> 'productionContextId'=v_group.production_context_id::text;
    v_key:='output:'||v_group.key_plan_id::text;
    insert into public.newsroom_mesa_material_versions(material_key,title,source_refs,article_ids,production_dossier_id,publication_event_id)
      values(v_key,v_context ->> 'title',v_group.source_refs,v_group.article_ids,p_dossier_id,v_event) returning id into v_version;
    if v_context ->> 'themeId' is not null then
      insert into public.newsroom_mesa_theme_materials(theme_id,material_key,version_id)
        values((v_context ->> 'themeId')::uuid,v_key,v_version) on conflict do nothing;
    end if;
  end loop;
  insert into public.newsroom_editorial_theme_articles(theme_id,editorial_article_id)
    select (r ->> 'themeId')::uuid,(r ->> 'articleId')::uuid from jsonb_array_elements(v_receipts) r
    on conflict(theme_id,editorial_article_id) do nothing;
  update public.newsroom_mesa_production_contexts set workspace_state='consolidated',consolidated_at=v_completed where dossier_id=p_dossier_id;
  return query select jsonb_build_object('action','consolidated','publicationEventId',v_event,
    'updatedCount',v_updated,'newCount',v_new,'noChangeCount',v_unchanged);
end;
$function$;

revoke all on function public.newsroom_finalize_mesa_intents_v1(uuid, uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_finalize_mesa_intents_v1(uuid, uuid, uuid[])
  to service_role;

commit;
