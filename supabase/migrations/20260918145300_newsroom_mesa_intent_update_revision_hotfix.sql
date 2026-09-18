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

commit;
