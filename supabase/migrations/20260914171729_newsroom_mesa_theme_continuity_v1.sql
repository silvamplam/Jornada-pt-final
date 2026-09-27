-- Tema vivo / continuidade v1.
-- Forward-only: adds scoped authorities without changing physical schema or
-- replacing any existing read/write authority.
begin;

do $preflight$
begin
  if to_regclass('public.newsroom_editorial_themes') is null
    or to_regclass('public.newsroom_editorial_theme_sources') is null
    or to_regclass('public.newsroom_editorial_theme_articles') is null
    or to_regclass('public.newsroom_mesa_production_contexts') is null
    or to_regclass('public.newsroom_mesa_production_context_items') is null
    or to_regclass('public.newsroom_mesa_production_context_sources') is null
    or to_regclass('public.newsroom_mesa_article_plan_contexts') is null
    or to_regclass('public.newsroom_mesa_output_publications') is null
    or to_regclass('public.newsroom_editorial_dossier_sources') is null
    or to_regclass('public.newsroom_articles') is null
    or to_regclass('public.newsroom_article_snapshots') is null
    or to_regclass('public.editorial_articles') is null
    or to_regclass('public.newsroom_mesa_containment_guard') is null
    or to_regclass('public.newsroom_editorial_source_packages') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regclass('public.newsroom_mesa_publication_events') is null
    or to_regclass('public.newsroom_editorial_dossiers') is null
    or to_regclass('public.newsroom_mesa_material_versions') is null
    or to_regclass('public.newsroom_mesa_theme_materials') is null
    or to_regprocedure('public.newsroom_prepare_mesa_contexts_v3(uuid,text,jsonb,uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_save_mesa_context_article_plan_v1(uuid,uuid,text,text,integer,text,text,text,uuid[],uuid)') is null
    or to_regprocedure('public.newsroom_save_dossier_article_plan_state_v1(uuid,uuid,text,uuid,uuid[],text,uuid)') is null
    or to_regprocedure('public.newsroom_set_mesa_shared_outputs_v2(uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_mesa_normalize_refs_v2(jsonb)') is null
    or to_regprocedure('public.newsroom_mesa_plan_context_sources_valid_v1(uuid,uuid,uuid)') is null
  then
    raise exception 'theme-continuity-preflight-authority-missing';
  end if;

  if to_regprocedure('public.newsroom_mesa_theme_continuity_v1(uuid)') is not null
    or to_regprocedure('public.newsroom_prepare_theme_continuity_v1(uuid,uuid,integer,text)') is not null
    or to_regprocedure('public.newsroom_finalize_theme_continuity_v1(uuid,uuid,uuid[])') is not null
  then
    raise exception 'theme-continuity-already-installed-do-not-replay';
  end if;
end;
$preflight$;

create function public.newsroom_mesa_theme_continuity_v1(p_theme_id uuid)
returns table (
  theme jsonb,
  sources jsonb,
  baseline jsonb,
  published_articles jsonb,
  source_count integer,
  published_article_count integer,
  authority_fingerprint text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with theme_row as (
    select t.id, t.title, t.classification_key, t.status, t.context_text,
      t.competition_id, t.season_id, t.matchday_id, t.match_id
    from public.newsroom_editorial_themes t
    where t.id = p_theme_id
  ), baseline_row as (
    select workspace.dossier_id, workspace.consolidated_at
    from public.newsroom_mesa_production_contexts workspace
    where workspace.workspace_state = 'consolidated'
      and (
        workspace.theme_id = p_theme_id
        or exists (
          select 1
          from public.newsroom_mesa_production_context_items context_item
          where context_item.dossier_id = workspace.dossier_id
            and context_item.context_kind = 'theme'
            and context_item.theme_id = p_theme_id
        )
      )
    order by workspace.consolidated_at desc, workspace.created_at desc,
      workspace.dossier_id desc
    limit 1
  ), baseline_source_rows as (
    select distinct on (source_row.newsroom_article_id)
      source_row.newsroom_article_id, source_row.newsroom_snapshot_id
    from baseline_row baseline
    join public.newsroom_editorial_dossier_sources source_row
      on source_row.dossier_id = baseline.dossier_id
      and source_row.included
    where (
      exists (
        select 1
        from public.newsroom_mesa_production_context_items context_item
        join public.newsroom_mesa_production_context_sources context_source
          on context_source.dossier_id = context_item.dossier_id
          and context_source.production_context_id = context_item.id
          and context_source.dossier_source_id = source_row.id
        where context_item.dossier_id = baseline.dossier_id
          and context_item.context_kind = 'theme'
          and context_item.theme_id = p_theme_id
      )
      or (
        not exists (
          select 1
          from public.newsroom_mesa_production_context_items context_item
          where context_item.dossier_id = baseline.dossier_id
        )
        and exists (
          select 1
          from public.newsroom_mesa_production_contexts workspace
          where workspace.dossier_id = baseline.dossier_id
            and workspace.theme_id = p_theme_id
        )
      )
    )
    order by source_row.newsroom_article_id, source_row.sort_order, source_row.id
  ), current_source_rows as (
    select membership.newsroom_article_id,
      latest.id as latest_snapshot_id,
      article.source_code, article.title, article.published_at,
      article.last_detected_at, membership.added_at,
      case
        when baseline_source.newsroom_article_id is null then 'NEW_SOURCE'
        when baseline_source.newsroom_snapshot_id is distinct from latest.id then 'UPDATED_SOURCE'
        else 'UNCHANGED_SOURCE'
      end as change_kind
    from public.newsroom_editorial_theme_sources membership
    join public.newsroom_articles article on article.id = membership.newsroom_article_id
    left join lateral (
      select snapshot.id
      from public.newsroom_article_snapshots snapshot
      where snapshot.article_id = membership.newsroom_article_id
      order by snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
      limit 1
    ) latest on true
    left join baseline_source_rows baseline_source
      on baseline_source.newsroom_article_id = membership.newsroom_article_id
    where membership.theme_id = p_theme_id
  ), published_rows as (
    select article.id, article.slug, article.title, article.label,
      article.subtitle, article.image_url, article.published_at,
      article.matchday_id, membership.added_at
    from public.newsroom_editorial_theme_articles membership
    join public.editorial_articles article
      on article.id = membership.editorial_article_id
      and article.status = 'published'
    where membership.theme_id = p_theme_id
  ), assembled as (
    select
      (select jsonb_build_object(
        'id', row.id,
        'title', row.title,
        'classificationKey', row.classification_key,
        'status', row.status,
        'contextText', row.context_text,
        'competitionId', row.competition_id,
        'seasonId', row.season_id,
        'matchdayId', row.matchday_id,
        'matchId', row.match_id
      ) from theme_row row) as theme,
      coalesce((select jsonb_agg(jsonb_build_object(
        'newsroomArticleId', row.newsroom_article_id,
        'latestSnapshotId', row.latest_snapshot_id,
        'sourceCode', row.source_code,
        'title', row.title,
        'publishedAt', row.published_at,
        'lastDetectedAt', row.last_detected_at,
        'addedAt', row.added_at,
        'change', row.change_kind
      ) order by row.added_at, row.newsroom_article_id) from current_source_rows row), '[]'::jsonb) as sources,
      coalesce((select jsonb_build_object(
        'dossierId', row.dossier_id,
        'consolidatedAt', row.consolidated_at,
        'sources', coalesce((select jsonb_agg(jsonb_build_object(
          'newsroomArticleId', source_row.newsroom_article_id,
          'newsroomSnapshotId', source_row.newsroom_snapshot_id
        ) order by source_row.newsroom_article_id) from baseline_source_rows source_row), '[]'::jsonb)
      ) from baseline_row row), 'null'::jsonb) as baseline,
      coalesce((select jsonb_agg(jsonb_build_object(
        'editorialArticleId', row.id,
        'slug', row.slug,
        'title', row.title,
        'label', row.label,
        'subtitle', row.subtitle,
        'imageUrl', row.image_url,
        'publishedAt', row.published_at,
        'matchdayId', row.matchday_id,
        'addedAt', row.added_at
      ) order by row.published_at nulls last, row.added_at, row.id) from published_rows row), '[]'::jsonb)
        as published_articles
  )
  select assembled.theme, assembled.sources, assembled.baseline,
    assembled.published_articles,
    jsonb_array_length(assembled.sources),
    jsonb_array_length(assembled.published_articles),
    md5(jsonb_build_object(
      'contractVersion', 1,
      'theme', assembled.theme,
      'sources', assembled.sources,
      'baseline', assembled.baseline,
      'publishedArticles', assembled.published_articles
    )::text)
  from assembled
  where assembled.theme is not null;
$function$;

revoke all on function public.newsroom_mesa_theme_continuity_v1(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_mesa_theme_continuity_v1(uuid)
  to service_role;

create function public.newsroom_prepare_theme_continuity_v1(
  p_preparation_key uuid,
  p_theme_id uuid,
  p_new_article_count integer,
  p_expected_authority_fingerprint text
)
returns table (
  dossier_id uuid,
  production_context_id uuid,
  preparation_action text,
  source_count integer,
  published_article_count integer,
  new_article_count integer,
  output_count integer,
  authority_fingerprint text,
  slots jsonb
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_read record;
  v_result record;
  v_theme_title text;
  v_contexts jsonb;
  v_context_id uuid;
  v_dossier_source_ids uuid[];
  v_plan_ids uuid[] := '{}'::uuid[];
  v_plan_id uuid;
  v_slots jsonb := '[]'::jsonb;
  v_slot jsonb;
  v_item jsonb;
  v_ordinality bigint;
  v_output_count integer;
  v_existing_payload jsonb;
begin
  if p_preparation_key is null or p_theme_id is null
    or p_new_article_count is null or p_new_article_count < 0
    or p_new_article_count > 30
    or nullif(btrim(coalesce(p_expected_authority_fingerprint, '')), '') is null
  then
    raise exception 'theme-continuity-preparation-input-invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1', 0));
  update public.newsroom_mesa_containment_guard
    set revision = not revision
    where singleton;
  if not found then
    raise exception 'mesa-organization-containment-guard-missing';
  end if;

  select t.title into v_theme_title
  from public.newsroom_editorial_themes t
  where t.id = p_theme_id and t.status = 'open'
  for update;
  if not found then
    raise exception 'theme-continuity-theme-unavailable';
  end if;

  select * into v_read
  from public.newsroom_mesa_theme_continuity_v1(p_theme_id);
  if not found or v_read.authority_fingerprint is distinct from p_expected_authority_fingerprint then
    raise exception 'theme-continuity-authority-stale';
  end if;
  if v_read.source_count not between 1 and 20 then
    raise exception 'theme-continuity-source-limit';
  end if;
  v_output_count := v_read.published_article_count + p_new_article_count;
  if v_output_count not between 1 and 30 then
    raise exception 'theme-continuity-output-limit';
  end if;
  -- These locks keep source metadata, frozen snapshot bodies and published
  -- targets stable until the workspace has been created.
  perform 1
  from public.newsroom_articles article
  where article.id in (
    select (source.value ->> 'newsroomArticleId')::uuid
    from jsonb_array_elements(v_read.sources) source(value)
  )
  for share;
  perform 1
  from public.newsroom_article_snapshots snapshot
  where snapshot.id in (
    select (source.value ->> 'latestSnapshotId')::uuid
    from jsonb_array_elements(v_read.sources) source(value)
    where source.value ->> 'latestSnapshotId' is not null
  )
  for share;
  perform 1
  from public.editorial_articles article
  where article.id in (
    select (published.value ->> 'editorialArticleId')::uuid
    from jsonb_array_elements(v_read.published_articles) published(value)
  )
  for share;

  select * into v_read
  from public.newsroom_mesa_theme_continuity_v1(p_theme_id);
  if not found or v_read.authority_fingerprint is distinct from p_expected_authority_fingerprint then
    raise exception 'theme-continuity-authority-stale';
  end if;
  if exists (
    select 1 from jsonb_array_elements(v_read.sources) source(value)
    where source.value ->> 'latestSnapshotId' is null
  ) then
    raise exception 'theme-continuity-source-snapshot-unavailable';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_read.sources) source(value)
    join public.newsroom_article_snapshots snapshot
      on snapshot.id = (source.value ->> 'latestSnapshotId')::uuid
    where jsonb_typeof(snapshot.body) is distinct from 'array'
      or not exists (
        select 1
        from jsonb_array_elements(
          case when jsonb_typeof(snapshot.body) = 'array'
            then snapshot.body else '[]'::jsonb end
        ) block(value)
        where block.value ->> 'type' in ('paragraph', 'heading')
          and nullif(btrim(block.value ->> 'text'), '') is not null
      )
  ) then
    raise exception 'theme-continuity-source-snapshot-unusable';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(v_read.published_articles) published(value)
    where nullif(btrim(published.value ->> 'editorialArticleId'), '') is null
      or nullif(btrim(published.value ->> 'slug'), '') is null
      or nullif(btrim(published.value ->> 'title'), '') is null
      or nullif(btrim(published.value ->> 'matchdayId'), '') is null
  ) then
    raise exception 'theme-continuity-published-target-unavailable';
  end if;

  v_contexts := jsonb_build_array(jsonb_build_object(
    'kind', 'theme',
    'themeId', p_theme_id,
    'sources', (
      select jsonb_agg(jsonb_build_object(
        'newsroomArticleId', source.value ->> 'newsroomArticleId',
        'newsroomSnapshotId', source.value ->> 'latestSnapshotId'
      ) order by source.ordinality)
      from jsonb_array_elements(v_read.sources) with ordinality source(value, ordinality)
    )
  ));

  select * into v_result
  from public.newsroom_prepare_mesa_contexts_v3(
    p_preparation_key,
    left(v_theme_title || ' — continuidade', 180),
    v_contexts,
    null,
    '{}'::uuid[]
  );

  select context_item.id into strict v_context_id
  from public.newsroom_mesa_production_context_items context_item
  where context_item.dossier_id = v_result.dossier_id
    and context_item.context_kind = 'theme'
    and context_item.theme_id = p_theme_id;

  select workspace.selection_payload into strict v_existing_payload
  from public.newsroom_mesa_production_contexts workspace
  where workspace.dossier_id = v_result.dossier_id
  for update;

  if v_existing_payload ? 'themeContinuity' then
    if v_existing_payload -> 'themeContinuity' ->> 'authorityFingerprint'
        is distinct from v_read.authority_fingerprint
      or (v_existing_payload -> 'themeContinuity' ->> 'newArticleCount')::integer
        is distinct from p_new_article_count
      or jsonb_array_length(v_existing_payload -> 'themeContinuity' -> 'slots')
        is distinct from v_output_count
    then
      raise exception 'theme-continuity-preparation-conflict';
    end if;
    return query select v_result.dossier_id, v_context_id, 'reused'::text,
      v_read.source_count, v_read.published_article_count, p_new_article_count,
      v_output_count, v_read.authority_fingerprint,
      v_existing_payload -> 'themeContinuity' -> 'slots';
    return;
  end if;

  select array_agg(source.id order by context_source.sort_order)
  into v_dossier_source_ids
  from public.newsroom_mesa_production_context_sources context_source
  join public.newsroom_editorial_dossier_sources source
    on source.dossier_id = context_source.dossier_id
    and source.id = context_source.dossier_source_id
  where context_source.dossier_id = v_result.dossier_id
    and context_source.production_context_id = v_context_id;

  for v_item, v_ordinality in
    select published.value, published.ordinality
    from jsonb_array_elements(v_read.published_articles)
      with ordinality published(value, ordinality)
  loop
    select saved.article_plan_id into strict v_plan_id
    from public.newsroom_save_mesa_context_article_plan_v1(
      v_result.dossier_id,
      null,
      left('EXISTING_' || lpad(v_ordinality::text, 2, '0') || ' — '
        || (v_item ->> 'title'), 180),
      'planned',
      v_ordinality::integer * 10,
      'news',
      'standard',
      'Rever o artigo publicado e decidir UPDATE ou SEM_ALTERAÇÃO.',
      v_dossier_source_ids,
      v_context_id
    ) saved;
    perform public.newsroom_save_dossier_article_plan_state_v1(
      v_result.dossier_id,
      v_plan_id,
      'update',
      (v_item ->> 'editorialArticleId')::uuid,
      '{}'::uuid[],
      'preserve_published',
      null
    );
    v_plan_ids := v_plan_ids || v_plan_id;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'slot', 'EXISTING_' || lpad(v_ordinality::text, 2, '0'),
      'kind', 'existing',
      'outputId', v_plan_id,
      'productionContextId', v_context_id,
      'targetEditorialArticleId', v_item ->> 'editorialArticleId',
      'targetSlug', v_item ->> 'slug',
      'targetTitle', v_item ->> 'title',
      'targetMatchdayId', v_item ->> 'matchdayId'
    ));
  end loop;

  for v_ordinality in 1..p_new_article_count
  loop
    select saved.article_plan_id into strict v_plan_id
    from public.newsroom_save_mesa_context_article_plan_v1(
      v_result.dossier_id,
      null,
      'NEW_' || lpad(v_ordinality::text, 2, '0') || ' — novo artigo',
      'planned',
      (v_read.published_article_count + v_ordinality)::integer * 10,
      'news',
      'standard',
      'Produzir um novo artigo distinto dos artigos existentes em revisão.',
      v_dossier_source_ids,
      v_context_id
    ) saved;
    perform public.newsroom_save_dossier_article_plan_state_v1(
      v_result.dossier_id,
      v_plan_id,
      'new',
      null,
      '{}'::uuid[],
      'unselected',
      null
    );
    v_plan_ids := v_plan_ids || v_plan_id;
    v_slots := v_slots || jsonb_build_array(jsonb_build_object(
      'slot', 'NEW_' || lpad(v_ordinality::text, 2, '0'),
      'kind', 'new',
      'outputId', v_plan_id,
      'productionContextId', v_context_id,
      'targetEditorialArticleId', null
    ));
  end loop;

  perform public.newsroom_set_mesa_shared_outputs_v2(v_result.dossier_id, v_plan_ids);

  update public.newsroom_mesa_production_contexts workspace
  set selection_payload = jsonb_set(
    workspace.selection_payload,
    '{themeContinuity}',
    jsonb_build_object(
      'contractVersion', 1,
      'themeId', p_theme_id,
      'authorityFingerprint', v_read.authority_fingerprint,
      'baselineDossierId', v_read.baseline ->> 'dossierId',
      'baselineConsolidatedAt', v_read.baseline ->> 'consolidatedAt',
      'sourceDiff', (
        select jsonb_agg(jsonb_build_object(
          'newsroomArticleId', source.value ->> 'newsroomArticleId',
          'newsroomSnapshotId', source.value ->> 'latestSnapshotId',
          'change', source.value ->> 'change'
        ) order by source.ordinality)
        from jsonb_array_elements(v_read.sources) with ordinality source(value, ordinality)
      ),
      'publishedArticleCount', v_read.published_article_count,
      'newArticleCount', p_new_article_count,
      'slots', v_slots
    ),
    true
  )
  where workspace.dossier_id = v_result.dossier_id;

  return query select v_result.dossier_id, v_context_id,
    v_result.preparation_action, v_read.source_count,
    v_read.published_article_count, p_new_article_count, v_output_count,
    v_read.authority_fingerprint, v_slots;
end;
$function$;

revoke all on function public.newsroom_prepare_theme_continuity_v1(
  uuid, uuid, integer, text
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_prepare_theme_continuity_v1(
  uuid, uuid, integer, text
) to service_role;

create function public.newsroom_finalize_theme_continuity_v1(
  p_dossier_id uuid,
  p_package_id uuid,
  p_no_change_output_ids uuid[]
)
returns table (
  finalization_action text,
  publication_event_id uuid,
  updated_count integer,
  new_count integer,
  no_change_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_contract jsonb;
  v_manifest jsonb;
  v_slots jsonb;
  v_slot jsonb;
  v_theme_id uuid;
  v_context_id uuid;
  v_no_change_ids uuid[];
  v_payload jsonb;
  v_fingerprint text;
  v_event uuid;
  v_title text;
  v_group record;
  v_version uuid;
  v_key text;
  v_was_consolidated boolean;
  v_updated_count integer;
  v_new_count integer;
  v_no_change_count integer;
begin
  if p_dossier_id is null or p_package_id is null or p_no_change_output_ids is null
    or cardinality(p_no_change_output_ids) > 30
    or array_position(p_no_change_output_ids, null) is not null
    or (select count(distinct id) from unnest(p_no_change_output_ids) id)
      <> cardinality(p_no_change_output_ids)
  then
    raise exception 'theme-continuity-finalization-input-invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('newsroom-mesa-theme-continuity:' || p_dossier_id::text, 0)
  );
  select workspace.* into v_context
  from public.newsroom_mesa_production_contexts workspace
  where workspace.dossier_id = p_dossier_id
  for update;
  if not found or v_context.workspace_role <> 'technical'
    or v_context.workspace_contract_version <> 2
    or v_context.workspace_state not in ('active', 'consolidated')
    or v_context.selection_payload ->> 'contractVersion' <> '3'
    or v_context.selection_payload ->> 'contextContractVersion' <> '1'
    or jsonb_typeof(v_context.selection_payload -> 'themeContinuity') <> 'object'
  then
    raise exception 'theme-continuity-finalization-workspace-invalid';
  end if;

  v_was_consolidated := v_context.workspace_state = 'consolidated';
  v_contract := v_context.selection_payload -> 'themeContinuity';
  v_slots := v_contract -> 'slots';
  if v_contract ->> 'contractVersion' <> '1'
    or jsonb_typeof(v_slots) <> 'array'
    or jsonb_array_length(v_slots) not between 1 and 30
  then
    raise exception 'theme-continuity-finalization-contract-invalid';
  end if;
  begin
    v_theme_id := (v_contract ->> 'themeId')::uuid;
  exception when others then
    raise exception 'theme-continuity-finalization-contract-invalid';
  end;

  select context_item.id into strict v_context_id
  from public.newsroom_mesa_production_context_items context_item
  where context_item.dossier_id = p_dossier_id
    and context_item.context_kind = 'theme'
    and context_item.theme_id = v_theme_id;

  select package.manifest into v_manifest
  from public.newsroom_editorial_source_packages package
  where package.id = p_package_id
  for share;
  if not found or v_manifest ->> 'version' <> '5'
    or v_manifest ->> 'provenanceContract' <> 'mesa-v2'
    or jsonb_typeof(v_manifest -> 'themeContinuity') <> 'object'
    or v_manifest -> 'themeContinuity' ->> 'contractVersion' <> '1'
    or v_manifest -> 'themeContinuity' ->> 'themeId' <> v_theme_id::text
    or v_manifest -> 'themeContinuity' ->> 'authorityFingerprint'
      is distinct from v_contract ->> 'authorityFingerprint'
    or jsonb_array_length(v_manifest -> 'outputs') <> jsonb_array_length(v_slots)
  then
    raise exception 'theme-continuity-finalization-package-invalid';
  end if;

  select coalesce(array_agg(id order by id), '{}'::uuid[])
  into v_no_change_ids
  from unnest(p_no_change_output_ids) id;

  if exists (
    select 1
    from jsonb_array_elements(v_slots) slot(value)
    full join jsonb_array_elements(v_manifest -> 'outputs') output(value)
      on lower(output.value ->> 'outputId') = lower(slot.value ->> 'outputId')
    where slot.value is null or output.value is null
      or lower(output.value -> 'articlePlan' ->> 'articlePlanId')
        <> lower(slot.value ->> 'outputId')
      or lower(output.value -> 'articlePlan' ->> 'dossierId') <> p_dossier_id::text
      or output.value -> 'articlePlan' ->> 'sourceScope' <> 'context'
      or lower(output.value -> 'articlePlan' ->> 'contextId') <> v_context_id::text
  ) then
    raise exception 'theme-continuity-finalization-package-invalid';
  end if;

  for v_slot in select slot.value from jsonb_array_elements(v_slots) slot(value)
  loop
    if coalesce(v_slot ->> 'slot', '') !~ '^(EXISTING|NEW)_[0-9]{2}$'
      or coalesce(v_slot ->> 'outputId', '') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or v_slot ->> 'kind' not in ('existing', 'new')
      or not exists (
        select 1
        from public.newsroom_editorial_dossier_article_plans plan
        join public.newsroom_mesa_article_plan_contexts assignment
          on assignment.dossier_id = plan.dossier_id
          and assignment.article_plan_id = plan.id
          and assignment.production_context_id = v_context_id
        where plan.dossier_id = p_dossier_id
          and plan.id = (v_slot ->> 'outputId')::uuid
          and plan.status <> 'cancelled'
          and public.newsroom_mesa_plan_context_sources_valid_v1(
            plan.dossier_id, plan.id, v_context_id
          )
          and (
            (v_slot ->> 'kind' = 'new' and plan.destination = 'new'
              and plan.update_target_editorial_article_id is null)
            or
            (v_slot ->> 'kind' = 'existing' and plan.destination = 'update'
              and plan.update_target_editorial_article_id =
                (v_slot ->> 'targetEditorialArticleId')::uuid)
          )
      )
    then
      raise exception 'theme-continuity-finalization-slot-invalid';
    end if;

    if (v_slot ->> 'outputId')::uuid = any(v_no_change_ids) then
      if v_slot ->> 'kind' <> 'existing'
        or exists (
          select 1 from public.newsroom_mesa_output_publications publication
          where publication.dossier_id = p_dossier_id
            and publication.article_plan_id = (v_slot ->> 'outputId')::uuid
        )
        or not exists (
          select 1 from public.editorial_articles article
          where article.id = (v_slot ->> 'targetEditorialArticleId')::uuid
            and article.status = 'published'
        )
      then
        raise exception 'theme-continuity-finalization-no-change-invalid';
      end if;
    elsif not exists (
      select 1
      from public.newsroom_mesa_output_publications publication
      join public.editorial_articles article
        on article.id = publication.editorial_article_id
        and article.status = 'published'
      where publication.dossier_id = p_dossier_id
        and publication.article_plan_id = (v_slot ->> 'outputId')::uuid
        and publication.package_id = p_package_id
        and publication.production_context_id = v_context_id
        and (
          v_slot ->> 'kind' = 'new'
          or publication.editorial_article_id =
            (v_slot ->> 'targetEditorialArticleId')::uuid
        )
    ) then
      raise exception 'theme-continuity-finalization-output-missing';
    end if;
  end loop;

  if exists (
    select 1 from unnest(v_no_change_ids) requested(id)
    where not exists (
      select 1 from jsonb_array_elements(v_slots) slot(value)
      where slot.value ->> 'kind' = 'existing'
        and lower(slot.value ->> 'outputId') = requested.id::text
    )
  ) or exists (
    select 1 from public.newsroom_mesa_output_publications publication
    where publication.dossier_id = p_dossier_id
      and not exists (
        select 1 from jsonb_array_elements(v_slots) slot(value)
        where lower(slot.value ->> 'outputId') = publication.article_plan_id::text
      )
  ) then
    raise exception 'theme-continuity-finalization-output-invalid';
  end if;

  select count(*) filter (where slot.value ->> 'kind' = 'existing'
      and not ((slot.value ->> 'outputId')::uuid = any(v_no_change_ids)))::integer,
    count(*) filter (where slot.value ->> 'kind' = 'new')::integer,
    cardinality(v_no_change_ids)
  into v_updated_count, v_new_count, v_no_change_count
  from jsonb_array_elements(v_slots) slot(value);

  select jsonb_build_object(
    'contractVersion', 1,
    'kind', 'theme_continuity',
    'themeId', v_theme_id,
    'authorityFingerprint', v_contract ->> 'authorityFingerprint',
    'baselineDossierId', v_contract ->> 'baselineDossierId',
    'packageId', p_package_id,
    'decisions', jsonb_agg(jsonb_build_object(
      'slot', slot.value ->> 'slot',
      'outputId', slot.value ->> 'outputId',
      'decision', case
        when (slot.value ->> 'outputId')::uuid = any(v_no_change_ids)
          then 'SEM_ALTERAÇÃO'
        when slot.value ->> 'kind' = 'existing' then 'UPDATE'
        else 'NEW'
      end,
      'targetEditorialArticleId', slot.value ->> 'targetEditorialArticleId',
      'publishedArticleId', publication.editorial_article_id,
      'sources', coalesce((
        select jsonb_agg(jsonb_build_object(
          'dossierSourceId', usage.dossier_source_id,
          'newsroomArticleId', usage.newsroom_article_id,
          'newsroomSnapshotId', usage.newsroom_snapshot_id
        ) order by usage.dossier_source_id)
        from public.newsroom_mesa_output_source_usage usage
        where usage.dossier_id = p_dossier_id
          and usage.article_plan_id = (slot.value ->> 'outputId')::uuid
      ), '[]'::jsonb)
    ) order by slot.ordinality)
  ) into v_payload
  from jsonb_array_elements(v_slots) with ordinality slot(value, ordinality)
  left join public.newsroom_mesa_output_publications publication
    on publication.dossier_id = p_dossier_id
    and publication.article_plan_id = (slot.value ->> 'outputId')::uuid;

  v_fingerprint := md5(v_payload::text);
  select event.id into v_event
  from public.newsroom_mesa_publication_events event
  where event.dossier_id = p_dossier_id and event.fingerprint = v_fingerprint;
  if found then
    return query select 'reused'::text, v_event, v_updated_count,
      v_new_count, v_no_change_count;
    return;
  end if;

  insert into public.newsroom_mesa_publication_events(dossier_id, fingerprint, payload)
    values(p_dossier_id, v_fingerprint, v_payload)
    returning id into v_event;

  if not v_was_consolidated then
    select dossier.title into strict v_title
    from public.newsroom_editorial_dossiers dossier
    where dossier.id = p_dossier_id;

    -- Preserve the existing material/provenance projection for materialized
    -- outputs; SEM_ALTERAÇÃO has no output usage and intentionally adds none.
    for v_group in
      select standalone.source_ids, standalone.source_refs,
        array_agg(distinct standalone.article_id order by standalone.article_id) article_ids,
        min(standalone.article_plan_id::text)::uuid key_plan_id
      from (
        select usage.article_plan_id,
          min(usage.editorial_article_id::text)::uuid article_id,
          array_agg(usage.dossier_source_id order by usage.dossier_source_id) source_ids,
          public.newsroom_mesa_normalize_refs_v2(jsonb_agg(jsonb_build_object(
            'newsroomArticleId', usage.newsroom_article_id,
            'newsroomSnapshotId', usage.newsroom_snapshot_id
          ) order by usage.newsroom_article_id, usage.newsroom_snapshot_id)) source_refs
        from public.newsroom_mesa_output_source_usage usage
        where usage.dossier_id = p_dossier_id
        group by usage.article_plan_id
        having count(*) >= 2
      ) standalone
      group by standalone.source_ids, standalone.source_refs
    loop
      v_key := 'output:' || v_group.key_plan_id::text;
      insert into public.newsroom_mesa_material_versions(
        material_key, title, source_refs, article_ids,
        production_dossier_id, publication_event_id
      ) values (
        v_key, v_title, v_group.source_refs, v_group.article_ids,
        p_dossier_id, v_event
      ) returning id into v_version;
      insert into public.newsroom_mesa_theme_materials(theme_id, material_key, version_id)
        values(v_theme_id, v_key, v_version)
        on conflict do nothing;
    end loop;

    insert into public.newsroom_editorial_theme_articles(theme_id, editorial_article_id)
      select v_theme_id, publication.editorial_article_id
      from public.newsroom_mesa_output_publications publication
      where publication.dossier_id = p_dossier_id
      on conflict(theme_id, editorial_article_id) do nothing;

    update public.newsroom_mesa_production_contexts workspace
    set workspace_state = 'consolidated', consolidated_at = now()
    where workspace.dossier_id = p_dossier_id
      and workspace.workspace_state = 'active';
    if not found then
      raise exception 'theme-continuity-finalization-state-conflict';
    end if;
  end if;

  return query select case when v_was_consolidated then 'recorded' else 'consolidated' end,
    v_event, v_updated_count, v_new_count, v_no_change_count;
end;
$function$;

revoke all on function public.newsroom_finalize_theme_continuity_v1(
  uuid, uuid, uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_finalize_theme_continuity_v1(
  uuid, uuid, uuid[]
) to service_role;

comment on function public.newsroom_mesa_theme_continuity_v1(uuid) is
  'Scoped Theme continuity read model. Cost is proportional to one Theme.';
comment on function public.newsroom_prepare_theme_continuity_v1(uuid,uuid,integer,text) is
  'Freezes current Theme sources, review targets and NEW slots using existing writers.';
comment on function public.newsroom_finalize_theme_continuity_v1(uuid,uuid,uuid[]) is
  'Validates materialized outputs and auditable SEM_ALTERAÇÃO decisions, then consolidates.';

notify pgrst, 'reload schema';
commit;
