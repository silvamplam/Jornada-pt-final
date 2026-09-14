begin;

do $preflight$
begin
  if to_regclass('public.newsroom_articles') is null
    or to_regclass('public.newsroom_article_snapshots') is null
    or to_regclass('public.newsroom_editorial_review_states') is null
    or to_regclass('public.newsroom_editorial_article_classifications') is null
    or to_regclass('public.newsroom_editorial_theme_sources') is null
    or to_regclass('public.newsroom_editorial_dossier_sources') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regclass('public.newsroom_mesa_production_contexts') is null
    or to_regclass('public.newsroom_editorial_source_packages') is null
    or to_regclass('public.editorial_articles') is null
    or to_regclass('public.newsroom_editorial_themes') is null
    or to_regclass('public.newsroom_editorial_theme_dossiers') is null
    or to_regclass('public.newsroom_editorial_theme_articles') is null
    or to_regclass('public.newsroom_mesa_theme_materials') is null
    or to_regclass('public.newsroom_mesa_publication_events') is null
    or to_regclass('public.newsroom_mesa_version_source_refs') is null
    or to_regclass('public.newsroom_mesa_version_article_refs') is null
  then
    raise exception 'newsroom-mesa-scoped-read-preflight-authority-missing';
  end if;
  if to_regprocedure('public.newsroom_mesa_timestamp_text_valid_v1(text)') is not null
    or to_regprocedure('public.newsroom_mesa_source_candidates_v1(timestamptz,text)') is not null
    or to_regprocedure('public.newsroom_mesa_page_identities_v1(timestamptz,text,text,text,integer,integer)') is not null
    or to_regprocedure('public.newsroom_mesa_source_counts_v1(timestamptz,text)') is not null
    or to_regprocedure('public.newsroom_mesa_theme_summaries_v1(uuid[])') is not null
    or to_regclass('public.newsroom_articles_cycle_page_v1') is not null
    or to_regclass('public.newsroom_articles_source_cycle_page_v1') is not null
    or to_regclass('public.newsroom_editorial_source_packages_manifest_gin_v1') is not null
    or to_regclass('public.newsroom_mesa_production_contexts_source_refs_gin_v1') is not null
  then
    raise exception 'newsroom-mesa-scoped-read-preflight-target-conflict';
  end if;
end;
$preflight$;

create index newsroom_articles_cycle_page_v1
  on public.newsroom_articles (last_detected_at desc, id desc)
  include (first_detected_at, source_code);

create index newsroom_articles_source_cycle_page_v1
  on public.newsroom_articles (source_code, last_detected_at desc, id desc)
  include (first_detected_at);

create index newsroom_editorial_source_packages_manifest_gin_v1
  on public.newsroom_editorial_source_packages using gin (manifest jsonb_path_ops);

create index newsroom_mesa_production_contexts_source_refs_gin_v1
  on public.newsroom_mesa_production_contexts using gin (source_refs jsonb_path_ops);

create function public.newsroom_mesa_timestamp_text_valid_v1(p_value text)
returns boolean
language plpgsql
immutable
strict
parallel safe
security invoker
set search_path = ''
as $function$
begin
  perform p_value::timestamptz;
  return true;
exception when others then
  return false;
end;
$function$;

create function public.newsroom_mesa_source_candidates_v1(
  p_cycle_started_at timestamptz,
  p_source_code text default null
)
returns table (
  newsroom_article_id uuid,
  lifecycle text,
  classification_key text,
  last_detected_at timestamptz,
  eligible_new boolean,
  eligible_published boolean
)
language sql
stable
security invoker
set search_path = ''
as $function$
  with published_dossiers as (
    select distinct usage.dossier_id
    from public.newsroom_mesa_output_source_usage usage
    join public.newsroom_editorial_dossier_sources source
      on source.id = usage.dossier_source_id
     and source.dossier_id = usage.dossier_id
     and source.newsroom_article_id = usage.newsroom_article_id
    join public.newsroom_articles newsroom_article
      on newsroom_article.id = source.newsroom_article_id
     and newsroom_article.first_detected_at >= p_cycle_started_at
     and (p_source_code is null or newsroom_article.source_code = p_source_code)
    join public.editorial_articles article
      on article.id = usage.editorial_article_id and article.status = 'published'
    union
    select distinct plan.dossier_id
    from public.newsroom_editorial_dossier_article_plans plan
    join public.newsroom_editorial_dossier_article_plan_sources assignment
      on assignment.dossier_id = plan.dossier_id
     and assignment.article_plan_id = plan.id
    join public.newsroom_editorial_dossier_sources source
      on source.id = assignment.dossier_source_id
     and source.dossier_id = assignment.dossier_id
    join public.newsroom_articles newsroom_article
      on newsroom_article.id = source.newsroom_article_id
     and newsroom_article.first_detected_at >= p_cycle_started_at
     and (p_source_code is null or newsroom_article.source_code = p_source_code)
    join public.editorial_articles article
      on article.id = plan.editorial_article_id
     and article.status = 'published'
  ),
  technical_dossiers as (
    select context.dossier_id
    from public.newsroom_mesa_production_contexts context
    where context.workspace_role = 'technical'
       or context.workspace_contract_version = 2
       or not exists (
         select 1 from published_dossiers published
         where published.dossier_id = context.dossier_id
       )
  ),
  candidates as (
    select
      article.id as newsroom_article_id,
      article.last_detected_at,
      classification.classification_key,
      latest_snapshot.id as latest_snapshot_id,
      exists (
        select 1
        from public.newsroom_editorial_theme_sources membership
        where membership.newsroom_article_id = article.id
          and not exists (
            select 1
            from public.newsroom_mesa_production_contexts context
            where context.theme_id = membership.theme_id
              and context.workspace_state is distinct from 'abandoned'
              and context.created_at = membership.added_at
              and exists (
                select 1
                from public.newsroom_editorial_dossier_sources context_source
                where context_source.dossier_id = context.dossier_id
                  and context_source.newsroom_article_id = article.id
              )
              and context.source_refs @> pg_catalog.jsonb_build_array(
                pg_catalog.jsonb_build_object('newsroomArticleId', article.id::text)
              )
          )
      ) as has_visible_theme,
      exists (
        select 1
        from public.newsroom_editorial_dossier_sources dossier_source
        where dossier_source.newsroom_article_id = article.id
          and dossier_source.included
          and not exists (
            select 1 from technical_dossiers technical
            where technical.dossier_id = dossier_source.dossier_id
          )
      ) as has_visible_dossier,
      exists (
        select 1
        from public.newsroom_editorial_review_states review
        where review.newsroom_article_id = article.id
          and review.decision = 'dismissed'
          and review.reviewed_snapshot_id = latest_snapshot.id
      ) as dismissed_current,
      (
        exists (
          select 1
          from public.newsroom_mesa_output_source_usage usage
          join public.editorial_articles published_article
            on published_article.id = usage.editorial_article_id
           and published_article.status = 'published'
          where usage.newsroom_article_id = article.id
        )
        or exists (
          select 1
          from public.newsroom_editorial_dossier_sources dossier_source
          join public.newsroom_editorial_dossier_article_plan_sources assignment
            on assignment.dossier_id = dossier_source.dossier_id
           and assignment.dossier_source_id = dossier_source.id
          join public.newsroom_editorial_dossier_article_plans plan
            on plan.dossier_id = assignment.dossier_id
           and plan.id = assignment.article_plan_id
          join public.editorial_articles published_article
            on published_article.id = plan.editorial_article_id
           and published_article.status = 'published'
          where dossier_source.newsroom_article_id = article.id
            and not exists (
              select 1 from technical_dossiers technical
              where technical.dossier_id = dossier_source.dossier_id
            )
        )
        or exists (
          select 1
          from public.newsroom_editorial_source_packages package
          cross join lateral pg_catalog.jsonb_array_elements(
            case when pg_catalog.jsonb_typeof(package.manifest -> 'entries') = 'array'
              then package.manifest -> 'entries' else '[]'::jsonb end
          ) entry(value)
          where package.manifest @> pg_catalog.jsonb_build_object(
            'entries', pg_catalog.jsonb_build_array(
              pg_catalog.jsonb_build_object('newsroomArticleId', article.id::text)
            )
          )
            and not (
              package.manifest -> 'version' = '5'::jsonb
              and package.manifest ->> 'provenanceContract' = 'mesa-v2'
            )
            and package.manifest ->> 'packageId'
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and package.manifest ->> 'year' ~ '^\d{4}$'
            and package.manifest ->> 'month' ~ '^(0[1-9]|1[0-2])$'
            and entry.value ->> 'status' = 'prepared'
            and lower(entry.value ->> 'newsroomArticleId') = article.id::text
            and entry.value ->> 'newsroomSnapshotId'
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and pg_catalog.jsonb_typeof(entry.value -> 'articlePosition') = 'number'
            and case
              when pg_catalog.jsonb_typeof(entry.value -> 'articlePosition') = 'number'
                then (entry.value ->> 'articlePosition')::numeric between 1 and 30
                  and (entry.value ->> 'articlePosition')::numeric
                    = pg_catalog.trunc((entry.value ->> 'articlePosition')::numeric)
              else false
            end
            and (
              (
                entry.value ->> 'publishedArticleId'
                  ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                and public.newsroom_mesa_timestamp_text_valid_v1(entry.value ->> 'usedAt')
                and exists (
                  select 1 from public.editorial_articles published_article
                  where published_article.id::text = lower(entry.value ->> 'publishedArticleId')
                    and published_article.status = 'published'
                )
              )
              or exists (
                select 1
                from pg_catalog.jsonb_array_elements(
                  case when pg_catalog.jsonb_typeof(package.manifest -> 'outputs') = 'array'
                    then package.manifest -> 'outputs' else '[]'::jsonb end
                ) output(value)
                where pg_catalog.jsonb_typeof(output.value -> 'sourceArticlePosition') = 'number'
                  and case
                    when pg_catalog.jsonb_typeof(output.value -> 'sourceArticlePosition') = 'number'
                      and pg_catalog.jsonb_typeof(entry.value -> 'articlePosition') = 'number'
                    then (output.value ->> 'sourceArticlePosition')::numeric
                      = (entry.value ->> 'articlePosition')::numeric
                      and (output.value ->> 'sourceArticlePosition')::numeric
                        = pg_catalog.trunc((output.value ->> 'sourceArticlePosition')::numeric)
                    else false
                  end
                  and output.value ->> 'publishedArticleId'
                    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                  and public.newsroom_mesa_timestamp_text_valid_v1(output.value ->> 'usedAt')
                  and exists (
                    select 1 from public.editorial_articles published_article
                    where published_article.id::text = lower(output.value ->> 'publishedArticleId')
                      and published_article.status = 'published'
                  )
              )
            )
        )
      ) as is_published
    from public.newsroom_articles article
    left join public.newsroom_editorial_article_classifications classification
      on classification.newsroom_article_id = article.id
    left join lateral (
      select snapshot.id
      from public.newsroom_article_snapshots snapshot
      where snapshot.article_id = article.id
      order by snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
      limit 1
    ) latest_snapshot on true
    where p_cycle_started_at is not null
      and article.first_detected_at >= p_cycle_started_at
      and (p_source_code is null or article.source_code = p_source_code)
  )
  select
    candidate.newsroom_article_id,
    case when candidate.is_published then 'published' else 'new' end,
    candidate.classification_key,
    candidate.last_detected_at,
    not candidate.is_published
      and not candidate.has_visible_theme
      and (candidate.has_visible_dossier or not candidate.dismissed_current),
    candidate.is_published
      and not candidate.has_visible_theme
      and (candidate.has_visible_dossier or not candidate.dismissed_current)
  from candidates candidate;
$function$;

create function public.newsroom_mesa_source_counts_v1(
  p_cycle_started_at timestamptz,
  p_source_code text default null
)
returns table (
  novas_total bigint,
  novas_benfica bigint,
  novas_sporting bigint,
  novas_fc_porto bigint,
  novas_other_liga_clubs bigint,
  novas_outside_liga_other bigint,
  novas_unclassified bigint,
  publicadas_total bigint,
  publicadas_benfica bigint,
  publicadas_sporting bigint,
  publicadas_fc_porto bigint,
  publicadas_other_liga_clubs bigint,
  publicadas_outside_liga_other bigint,
  publicadas_unclassified bigint
)
language sql
stable
security invoker
set search_path = ''
as $function$
  select
    count(*) filter (where candidate.eligible_new),
    count(*) filter (where candidate.eligible_new and candidate.classification_key = 'benfica'),
    count(*) filter (where candidate.eligible_new and candidate.classification_key = 'sporting'),
    count(*) filter (where candidate.eligible_new and candidate.classification_key = 'fc_porto'),
    count(*) filter (where candidate.eligible_new and candidate.classification_key = 'other_liga_clubs'),
    count(*) filter (where candidate.eligible_new and candidate.classification_key = 'outside_liga_other'),
    count(*) filter (where candidate.eligible_new and candidate.classification_key is null),
    count(*) filter (where candidate.eligible_published),
    count(*) filter (where candidate.eligible_published and candidate.classification_key = 'benfica'),
    count(*) filter (where candidate.eligible_published and candidate.classification_key = 'sporting'),
    count(*) filter (where candidate.eligible_published and candidate.classification_key = 'fc_porto'),
    count(*) filter (where candidate.eligible_published and candidate.classification_key = 'other_liga_clubs'),
    count(*) filter (where candidate.eligible_published and candidate.classification_key = 'outside_liga_other'),
    count(*) filter (where candidate.eligible_published and candidate.classification_key is null)
  from public.newsroom_mesa_source_candidates_v1(p_cycle_started_at, p_source_code) candidate;
$function$;

create function public.newsroom_mesa_page_identities_v1(
  p_cycle_started_at timestamptz,
  p_lifecycle text,
  p_classification_filter text,
  p_source_code text default null,
  p_limit integer default 24,
  p_offset integer default 0
)
returns table (
  newsroom_article_id uuid,
  lifecycle text,
  classification_key text,
  last_detected_at timestamptz
)
language plpgsql
stable
security invoker
set search_path = ''
as $function$
begin
  if p_cycle_started_at is null
    or p_lifecycle not in ('new', 'published')
    or p_classification_filter not in (
      'all', 'unclassified', 'benfica', 'sporting', 'fc_porto',
      'other_liga_clubs', 'outside_liga_other'
    )
    or p_limit < 1 or p_limit > 200
    or p_offset < 0
  then
    raise exception 'newsroom-mesa-page-invalid-input' using errcode = '22023';
  end if;

  return query
  select
    candidate.newsroom_article_id,
    candidate.lifecycle,
    candidate.classification_key,
    candidate.last_detected_at
  from public.newsroom_mesa_source_candidates_v1(p_cycle_started_at, p_source_code) candidate
  where case p_lifecycle
      when 'new' then candidate.eligible_new
      else candidate.eligible_published
    end
    and (
      p_classification_filter = 'all'
      or (p_classification_filter = 'unclassified' and candidate.classification_key is null)
      or candidate.classification_key = p_classification_filter
    )
  order by candidate.last_detected_at desc, candidate.newsroom_article_id desc
  limit (p_limit + 1)
  offset p_offset;
end;
$function$;

create function public.newsroom_mesa_theme_summaries_v1(
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
        select 1 from public.newsroom_mesa_publication_events published
        where published.dossier_id = context.dossier_id
      )
    )
      and (
        p_theme_ids is null
        or exists (
          select 1 from public.newsroom_editorial_theme_dossiers theme_dossier
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
      where membership.theme_id = theme.id
        and membership.reference_snapshot_id is not null
        and membership.reference_snapshot_id <> latest_snapshot.id
    ),
    exists (
      select 1 from public.newsroom_editorial_theme_sources membership
      where membership.theme_id = theme.id
    ) and not exists (
      select 1
      from public.newsroom_editorial_theme_sources membership
      where membership.theme_id = theme.id
        and not exists (
          select 1 from public.newsroom_article_snapshots snapshot
          where snapshot.article_id = membership.newsroom_article_id
        )
    ),
    theme.updated_at
  from public.newsroom_editorial_themes theme
  where p_theme_ids is null or theme.id = any(p_theme_ids)
  order by theme.updated_at desc, theme.id asc;
$function$;

revoke all on function public.newsroom_mesa_timestamp_text_valid_v1(text)
  from public, anon, authenticated, service_role;
revoke all on function public.newsroom_mesa_source_candidates_v1(timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.newsroom_mesa_source_counts_v1(timestamptz, text)
  from public, anon, authenticated, service_role;
revoke all on function public.newsroom_mesa_page_identities_v1(timestamptz, text, text, text, integer, integer)
  from public, anon, authenticated, service_role;
revoke all on function public.newsroom_mesa_theme_summaries_v1(uuid[])
  from public, anon, authenticated, service_role;

grant execute on function public.newsroom_mesa_timestamp_text_valid_v1(text) to service_role;
grant execute on function public.newsroom_mesa_source_candidates_v1(timestamptz, text) to service_role;
grant execute on function public.newsroom_mesa_source_counts_v1(timestamptz, text) to service_role;
grant execute on function public.newsroom_mesa_page_identities_v1(timestamptz, text, text, text, integer, integer) to service_role;
grant execute on function public.newsroom_mesa_theme_summaries_v1(uuid[]) to service_role;

comment on function public.newsroom_mesa_source_counts_v1(timestamptz, text) is
  'Authoritative aggregate counts for the loose NEW and PUBLISHED Mesa universes; returns one row and no card payload.';
comment on function public.newsroom_mesa_page_identities_v1(timestamptz, text, text, text, integer, integer) is
  'Returns at most page size plus one ordered identity so filtering and pagination precede card hydration.';
comment on function public.newsroom_mesa_theme_summaries_v1(uuid[]) is
  'Theme card summaries assembled from normalized relations without source-package manifests or article hydration.';

do $postflight$
begin
  if to_regprocedure('public.newsroom_mesa_timestamp_text_valid_v1(text)') is null
    or to_regprocedure('public.newsroom_mesa_source_candidates_v1(timestamptz,text)') is null
    or to_regprocedure('public.newsroom_mesa_source_counts_v1(timestamptz,text)') is null
    or to_regprocedure('public.newsroom_mesa_page_identities_v1(timestamptz,text,text,text,integer,integer)') is null
    or to_regprocedure('public.newsroom_mesa_theme_summaries_v1(uuid[])') is null
    or to_regclass('public.newsroom_articles_cycle_page_v1') is null
    or to_regclass('public.newsroom_articles_source_cycle_page_v1') is null
    or to_regclass('public.newsroom_editorial_source_packages_manifest_gin_v1') is null
    or to_regclass('public.newsroom_mesa_production_contexts_source_refs_gin_v1') is null
  then
    raise exception 'newsroom-mesa-scoped-read-postflight-invalid';
  end if;
end;
$postflight$;

notify pgrst, 'reload schema';

commit;
