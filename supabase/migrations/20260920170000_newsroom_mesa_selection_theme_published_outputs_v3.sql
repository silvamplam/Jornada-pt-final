begin;

create or replace function public.newsroom_mesa_theme_summaries_v1(
  p_theme_ids uuid[] default null
)
returns table (
  id uuid,
  title text,
  classification_key text,
  status text,
  source_count bigint,
  article_count bigint,
  updated_source_count bigint,
  production_ready boolean,
  updated_at timestamptz
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with technical_dossiers as (
    select context.dossier_id
    from public.newsroom_mesa_production_contexts context
    where (
      context.workspace_role = 'technical'
      or context.workspace_contract_version = 2
      or not exists (
        select 1
        from public.newsroom_mesa_publication_events published
        where published.dossier_id = context.dossier_id
      )
    )
      and (
        p_theme_ids is null
        or exists (
          select 1
          from public.newsroom_editorial_theme_dossiers theme_dossier
          where theme_dossier.dossier_id = context.dossier_id
            and theme_dossier.theme_id = any(p_theme_ids)
        )
      )
  ),
  theme_sources as (
    select membership.theme_id, membership.newsroom_article_id
    from public.newsroom_editorial_theme_sources membership
    where p_theme_ids is null or membership.theme_id = any(p_theme_ids)
    union
    select link.theme_id, source.newsroom_article_id
    from public.newsroom_editorial_theme_dossiers link
    join public.newsroom_editorial_dossier_sources source
      on source.dossier_id = link.dossier_id and source.included
    where (p_theme_ids is null or link.theme_id = any(p_theme_ids))
      and not exists (
        select 1 from technical_dossiers technical
        where technical.dossier_id = link.dossier_id
      )
    union
    select material.theme_id, source.newsroom_article_id
    from public.newsroom_mesa_theme_materials material
    join public.newsroom_mesa_version_source_refs source
      on source.version_id = material.version_id
    where p_theme_ids is null or material.theme_id = any(p_theme_ids)
  ),
  theme_articles as (
    select link.theme_id, link.editorial_article_id
    from public.newsroom_editorial_theme_articles link
    join public.editorial_articles article
      on article.id = link.editorial_article_id and article.status = 'published'
    where p_theme_ids is null or link.theme_id = any(p_theme_ids)
    union
    select link.theme_id, plan.editorial_article_id
    from public.newsroom_editorial_theme_dossiers link
    join public.newsroom_editorial_dossier_article_plans plan
      on plan.dossier_id = link.dossier_id
    join public.editorial_articles article
      on article.id = plan.editorial_article_id and article.status = 'published'
    where (p_theme_ids is null or link.theme_id = any(p_theme_ids))
      and not exists (
        select 1 from technical_dossiers technical
        where technical.dossier_id = link.dossier_id
      )
    union
    select material.theme_id, article_ref.editorial_article_id
    from public.newsroom_mesa_theme_materials material
    join public.newsroom_mesa_version_article_refs article_ref
      on article_ref.version_id = material.version_id
    join public.editorial_articles article
      on article.id = article_ref.editorial_article_id and article.status = 'published'
    where p_theme_ids is null or material.theme_id = any(p_theme_ids)
    union
    select context_item.theme_id, publication.editorial_article_id
    from public.newsroom_mesa_production_context_items context_item
    join public.newsroom_mesa_output_publications publication
      on publication.dossier_id = context_item.dossier_id
     and publication.production_context_id = context_item.id
    join public.editorial_articles article
      on article.id = publication.editorial_article_id
     and article.status = 'published'
    where context_item.context_kind = 'theme'
      and context_item.theme_id is not null
      and (p_theme_ids is null or context_item.theme_id = any(p_theme_ids))
    union
    select membership.theme_id, publication.editorial_article_id
    from public.newsroom_mesa_intent_preparations preparation
    cross join lateral jsonb_array_elements(
      coalesce(preparation.request -> 'selection' -> 'themeIds', '[]'::jsonb)
    ) selected_theme(value)
    join public.newsroom_editorial_theme_sources membership
      on membership.theme_id::text = lower(selected_theme.value #>> '{}')
    join public.newsroom_mesa_output_source_usage usage
      on usage.dossier_id = preparation.dossier_id
     and usage.newsroom_article_id = membership.newsroom_article_id
    join public.newsroom_mesa_output_publications publication
      on publication.dossier_id = usage.dossier_id
     and publication.article_plan_id = usage.article_plan_id
     and publication.editorial_article_id = usage.editorial_article_id
    join public.newsroom_mesa_production_context_items context_item
      on context_item.dossier_id = publication.dossier_id
     and context_item.id = publication.production_context_id
     and context_item.context_kind = 'selection'
    join public.editorial_articles article
      on article.id = publication.editorial_article_id
     and article.status = 'published'
    where membership.theme_id::text = lower(selected_theme.value #>> '{}')
      and (p_theme_ids is null or membership.theme_id = any(p_theme_ids))
  )
  select
    theme.id,
    theme.title,
    theme.classification_key,
    theme.status,
    (select count(*) from theme_sources source where source.theme_id = theme.id),
    (select count(*) from theme_articles article where article.theme_id = theme.id),
    (
      select count(*)
      from public.newsroom_editorial_theme_sources membership
      join lateral (
        select snapshot.id
        from public.newsroom_article_snapshots snapshot
        where snapshot.article_id = membership.newsroom_article_id
        order by snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
        limit 1
      ) latest_snapshot on true
      left join lateral (
        select baseline.id
        from public.newsroom_article_snapshots baseline
        where baseline.article_id = membership.newsroom_article_id
          and (
            baseline.id = membership.reference_snapshot_id
            or baseline.id in (
              select (receipt_source.value ->> 'newsroomSnapshotId')::uuid
              from public.newsroom_mesa_intent_article_receipts receipt
              join public.newsroom_mesa_intent_preparations preparation
                on preparation.dossier_id = receipt.dossier_id
              cross join lateral jsonb_array_elements(receipt.sources) receipt_source(value)
              where receipt.slot like 'EXISTING\_%' escape '\'
                and receipt.decision in ('UPDATE','SEM_ALTERAÇÃO')
                and (receipt_source.value ->> 'newsroomArticleId')::uuid = membership.newsroom_article_id
                and (
                  receipt.theme_id = membership.theme_id
                  or (
                    receipt.theme_id is null
                    and receipt.context_key like 'selection:%'
                    and exists (
                      select 1
                      from jsonb_array_elements(coalesce(
                        preparation.frozen_plan -> 'request' -> 'selection' -> 'themeIds',
                        '[]'::jsonb
                      )) selected_theme(value)
                      where (selected_theme.value #>> '{}')::uuid = membership.theme_id
                    )
                  )
                )
            )
          )
        order by baseline.extracted_at desc, baseline.created_at desc, baseline.id desc
        limit 1
      ) reviewed_baseline on true
      where membership.theme_id = theme.id
        and reviewed_baseline.id is not null
        and reviewed_baseline.id <> latest_snapshot.id
    ),
    exists (
      select 1
      from public.newsroom_editorial_theme_sources membership
      where membership.theme_id = theme.id
    ) and not exists (
      select 1
      from public.newsroom_editorial_theme_sources membership
      where membership.theme_id = theme.id
        and not exists (
          select 1
          from public.newsroom_article_snapshots snapshot
          where snapshot.article_id = membership.newsroom_article_id
        )
    ),
    theme.updated_at
  from public.newsroom_editorial_themes theme
  where p_theme_ids is null or theme.id = any(p_theme_ids)
  order by theme.updated_at desc, theme.id asc;
$function$;

revoke all on function public.newsroom_mesa_theme_summaries_v1(uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_mesa_theme_summaries_v1(uuid[])
  to service_role;

create or replace function public.newsroom_mesa_theme_continuity_v1(p_theme_id uuid)
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
  ), published_refs as (
    select membership.editorial_article_id, membership.added_at
    from public.newsroom_editorial_theme_articles membership
    where membership.theme_id = p_theme_id
    union all
    select publication.editorial_article_id, publication.created_at
    from public.newsroom_mesa_production_context_items context_item
    join public.newsroom_mesa_output_publications publication
      on publication.dossier_id = context_item.dossier_id
     and publication.production_context_id = context_item.id
    where context_item.context_kind = 'theme'
      and context_item.theme_id = p_theme_id
    union all
    select publication.editorial_article_id, publication.created_at
    from public.newsroom_mesa_intent_preparations preparation
    cross join lateral jsonb_array_elements(
      coalesce(preparation.request -> 'selection' -> 'themeIds', '[]'::jsonb)
    ) selected_theme(value)
    join public.newsroom_editorial_theme_sources membership
      on membership.theme_id = p_theme_id
     and membership.theme_id::text = lower(selected_theme.value #>> '{}')
    join public.newsroom_mesa_output_source_usage usage
      on usage.dossier_id = preparation.dossier_id
     and usage.newsroom_article_id = membership.newsroom_article_id
    join public.newsroom_mesa_output_publications publication
      on publication.dossier_id = usage.dossier_id
     and publication.article_plan_id = usage.article_plan_id
     and publication.editorial_article_id = usage.editorial_article_id
    join public.newsroom_mesa_production_context_items context_item
      on context_item.dossier_id = publication.dossier_id
     and context_item.id = publication.production_context_id
     and context_item.context_kind = 'selection'
    where membership.theme_id = p_theme_id
  ), published_rows as (
    select article.id, article.slug, article.title, article.label,
      article.subtitle, article.image_url, article.published_at,
      article.matchday_id, min(ref.added_at) as added_at
    from published_refs ref
    join public.editorial_articles article
      on article.id = ref.editorial_article_id
     and article.status = 'published'
    group by article.id, article.slug, article.title, article.label,
      article.subtitle, article.image_url, article.published_at,
      article.matchday_id
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

notify pgrst, 'reload schema';

commit;
