begin;

-- A receipt records the explicit article selection independently of production decisions.
alter table public.newsroom_mesa_organization_requests
  add column explicit_article_ids uuid[];

create function public.newsroom_organize_theme_selection_v3(
  p_request_id uuid, p_theme_id uuid, p_title text, p_classification_key text,
  p_source_ids uuid[], p_editorial_article_ids uuid[], p_material_refs jsonb default null
)
returns table(theme_id uuid, added_count integer, reused boolean)
language plpgsql security definer set search_path = '' as $function$
declare
  v_article_ids uuid[];
  v_previous public.newsroom_mesa_organization_requests%rowtype;
  v_result record;
  v_article_id uuid;
begin
  if p_editorial_article_ids is null or cardinality(p_editorial_article_ids) > 30
    or array_position(p_editorial_article_ids, null) is not null
    or cardinality(p_editorial_article_ids) <> (select count(distinct id) from unnest(p_editorial_article_ids) id)
  then raise exception 'mesa-organization-invalid-input'; end if;
  v_article_ids := array(select id from unnest(p_editorial_article_ids) id order by id);
  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-organization-v1',0));
  select * into v_previous from public.newsroom_mesa_organization_requests r where r.request_id=p_request_id;
  if found and v_previous.explicit_article_ids is distinct from v_article_ids then
    raise exception 'mesa-organization-request-conflict';
  end if;
  -- Validate only the identities explicitly selected in the UI; never infer membership from sources.
  foreach v_article_id in array v_article_ids loop
    perform 1 from public.editorial_articles a where a.id=v_article_id and a.status='published' for share;
    if not found then raise exception 'mesa-organization-article-unavailable'; end if;
  end loop;
  if p_material_refs is null then
    select * into v_result from public.newsroom_organize_theme_sources_v1(
      p_request_id,p_theme_id,p_title,p_classification_key,p_source_ids);
  else
    select * into v_result from public.newsroom_organize_theme_materials_v2(
      p_request_id,p_theme_id,p_title,p_classification_key,p_source_ids,p_material_refs);
  end if;
  foreach v_article_id in array v_article_ids loop
    perform public.newsroom_set_editorial_theme_article_membership_v1(v_result.theme_id,v_article_id,true);
  end loop;
  update public.newsroom_mesa_organization_requests r set explicit_article_ids=v_article_ids
    where r.request_id=p_request_id and r.explicit_article_ids is distinct from v_article_ids;
  return query select v_result.theme_id,v_result.added_count,v_result.reused;
end;
$function$;
-- Internal administrative command, same service-only boundary as v1/v2.
revoke all on function public.newsroom_organize_theme_selection_v3(uuid,uuid,text,text,uuid[],uuid[],jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_organize_theme_selection_v3(uuid,uuid,text,text,uuid[],uuid[],jsonb)
  to service_role;

-- Keep the public signature and eligibility rules. Expand legacy manifests once per read.
create or replace function public.newsroom_mesa_source_candidates_v1(
  p_cycle_started_at timestamptz, p_source_code text default null
)
returns table(newsroom_article_id uuid, lifecycle text, classification_key text,
  last_detected_at timestamptz, eligible_new boolean, eligible_published boolean)
language sql stable security invoker set search_path = '' as $function$

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
      on article.id = usage.editorial_article_id
     and article.status = 'published'

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
         select 1
         from published_dossiers published
         where published.dossier_id = context.dossier_id
       )
  ),
  legacy_publications as materialized (
          select distinct lower(entry.value ->> 'newsroomArticleId') as newsroom_article_id,
            package.created_at
          from public.newsroom_editorial_source_packages package
          cross join lateral pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(package.manifest -> 'entries') = 'array'
                then package.manifest -> 'entries'
              else '[]'::jsonb
            end
          ) entry(value)
          where package.created_at >= p_cycle_started_at
            and package.manifest @> pg_catalog.jsonb_build_object(
              'entries',
              pg_catalog.jsonb_build_array(
                pg_catalog.jsonb_build_object(
                  'newsroomArticleId',
                  lower(entry.value ->> 'newsroomArticleId')
                )
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
            and entry.value ->> 'newsroomSnapshotId'
              ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
            and pg_catalog.jsonb_typeof(entry.value -> 'articlePosition') = 'number'
            and case
              when pg_catalog.jsonb_typeof(entry.value -> 'articlePosition') = 'number'
                then (entry.value ->> 'articlePosition')::numeric between 1 and 30
                  and (entry.value ->> 'articlePosition')::numeric
                    = pg_catalog.trunc(
                      (entry.value ->> 'articlePosition')::numeric
                    )
              else false
            end
            and (
              (
                entry.value ->> 'publishedArticleId'
                  ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                and public.newsroom_mesa_timestamp_text_valid_v1(
                  entry.value ->> 'usedAt'
                )
                and exists (
                  select 1
                  from public.editorial_articles published_article
                  where published_article.id = case
                    when entry.value ->> 'publishedArticleId'
                      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                    then lower(entry.value ->> 'publishedArticleId')::uuid
                    else null::uuid
                  end
                    and published_article.status = 'published'
                )
              )
              or exists (
                select 1
                from pg_catalog.jsonb_array_elements(
                  case
                    when pg_catalog.jsonb_typeof(package.manifest -> 'outputs') = 'array'
                      then package.manifest -> 'outputs'
                    else '[]'::jsonb
                  end
                ) output(value)
                where pg_catalog.jsonb_typeof(
                  output.value -> 'sourceArticlePosition'
                ) = 'number'
                  and case
                    when pg_catalog.jsonb_typeof(
                      output.value -> 'sourceArticlePosition'
                    ) = 'number'
                      and pg_catalog.jsonb_typeof(
                        entry.value -> 'articlePosition'
                      ) = 'number'
                    then (
                      output.value ->> 'sourceArticlePosition'
                    )::numeric = (
                      entry.value ->> 'articlePosition'
                    )::numeric
                      and (
                        output.value ->> 'sourceArticlePosition'
                      )::numeric = pg_catalog.trunc(
                        (
                          output.value ->> 'sourceArticlePosition'
                        )::numeric
                      )
                    else false
                  end
                  and output.value ->> 'publishedArticleId'
                    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                  and public.newsroom_mesa_timestamp_text_valid_v1(
                    output.value ->> 'usedAt'
                  )
                  and exists (
                    select 1
                    from public.editorial_articles published_article
                    where published_article.id = case
                      when output.value ->> 'publishedArticleId'
                        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                      then lower(output.value ->> 'publishedArticleId')::uuid
                      else null::uuid
                    end
                      and published_article.status = 'published'
                  )
              )
            )
  ),
  candidates as materialized (
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
                pg_catalog.jsonb_build_object(
                  'newsroomArticleId',
                  article.id::text
                )
              )
          )
      ) as has_visible_theme,
      exists (
        select 1
        from public.newsroom_editorial_dossier_sources dossier_source
        where dossier_source.newsroom_article_id = article.id
          and dossier_source.included
          and not exists (
            select 1
            from technical_dossiers technical
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
              select 1
              from technical_dossiers technical
              where technical.dossier_id = dossier_source.dossier_id
            )
        )
        or exists (
          select 1 from legacy_publications legacy
          where legacy.newsroom_article_id = article.id::text
            and legacy.created_at >= article.first_detected_at
        )
      ) as is_published
    from public.newsroom_articles article
    left join public.newsroom_editorial_article_classifications classification
      on classification.newsroom_article_id = article.id
    left join lateral (
      select snapshot.id
      from public.newsroom_article_snapshots snapshot
      where snapshot.article_id = article.id
      order by
        snapshot.extracted_at desc,
        snapshot.created_at desc,
        snapshot.id desc
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
      and (
        candidate.has_visible_dossier
        or not candidate.dismissed_current
      ),
    candidate.is_published
      and not candidate.has_visible_theme
      and (
        candidate.has_visible_dossier
        or not candidate.dismissed_current
      )
  from candidates candidate;

$function$;

notify pgrst, 'reload schema';
commit;
