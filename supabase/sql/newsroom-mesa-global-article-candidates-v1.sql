-- Read-only candidate resolver for canonical published articles.
-- CI-only in this branch until its contract is proven; it does not change
-- Production Intents, contexts, receipts or the production Supabase database.
begin;

do $preflight$
begin
  if to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is null
    or to_regclass('public.newsroom_editorial_source_packages') is null
    or to_regclass('public.newsroom_editorial_theme_articles') is null
    or to_regclass('public.editorial_articles') is null
    or to_regprocedure('public.newsroom_mesa_timestamp_text_valid_v1(text)') is null
  then
    raise exception 'mesa-global-candidates-preflight-missing';
  end if;
end;
$preflight$;

create function public.newsroom_mesa_global_article_candidates_v1(
  p_source_ids uuid[],
  p_theme_ids uuid[] default '{}'::uuid[]
)
returns table(candidates jsonb)
language plpgsql
stable
security definer
set search_path=''
as $function$
declare
  v_source_ids uuid[];
  v_theme_ids uuid[];
begin
  if p_source_ids is null or p_theme_ids is null
    or cardinality(p_source_ids) > 20
    or cardinality(p_theme_ids) > 20
    or array_position(p_source_ids,null) is not null
    or array_position(p_theme_ids,null) is not null
  then
    raise exception 'mesa-global-candidates-input-invalid';
  end if;

  select coalesce(array_agg(id order by id),'{}'::uuid[])
  into v_source_ids
  from (select distinct id from unnest(p_source_ids) requested(id)) normalized;

  select coalesce(array_agg(id order by id),'{}'::uuid[])
  into v_theme_ids
  from (select distinct id from unnest(p_theme_ids) requested(id)) normalized;

  if cardinality(v_source_ids)=0 and cardinality(v_theme_ids)=0 then
    return query select '[]'::jsonb;
    return;
  end if;

  return query
  with requested_sources as (
    select id as source_id from unnest(v_source_ids) requested(id)
  ),
  requested_themes as (
    select id as theme_id from unnest(v_theme_ids) requested(id)
  ),
  technical_dossiers as (
    select workspace.dossier_id
    from public.newsroom_mesa_production_contexts workspace
    where workspace.workspace_role='technical'
       or workspace.workspace_contract_version=2
  ),
  final_usage as (
    select
      usage.editorial_article_id as article_id,
      'source_usage'::text as evidence_kind,
      usage.newsroom_article_id as source_id,
      null::uuid as theme_id
    from public.newsroom_mesa_output_source_usage usage
    join requested_sources requested
      on requested.source_id=usage.newsroom_article_id
  ),
  historical_dossier_usage as (
    select
      plan.editorial_article_id as article_id,
      'dossier_plan'::text as evidence_kind,
      dossier_source.newsroom_article_id as source_id,
      null::uuid as theme_id
    from public.newsroom_editorial_dossier_article_plan_sources assignment
    join public.newsroom_editorial_dossier_sources dossier_source
      on dossier_source.dossier_id=assignment.dossier_id
     and dossier_source.id=assignment.dossier_source_id
    join requested_sources requested
      on requested.source_id=dossier_source.newsroom_article_id
    join public.newsroom_editorial_dossier_article_plans plan
      on plan.dossier_id=assignment.dossier_id
     and plan.id=assignment.article_plan_id
    where plan.editorial_article_id is not null
      and not exists (
        select 1 from technical_dossiers technical
        where technical.dossier_id=assignment.dossier_id
      )
  ),
  legacy_entries as (
    select package.manifest,entry.value
    from public.newsroom_editorial_source_packages package
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(package.manifest->'entries')='array'
        then package.manifest->'entries' else '[]'::jsonb end
    ) entry(value)
    join requested_sources requested
      on requested.source_id=case
        when entry.value->>'newsroomArticleId'
          ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then lower(entry.value->>'newsroomArticleId')::uuid
        else null::uuid
      end
    where not (
      package.manifest->'version'='5'::jsonb
      and package.manifest->>'provenanceContract'='mesa-v2'
    )
      and entry.value->>'status'='prepared'
      and entry.value->>'newsroomSnapshotId'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and pg_catalog.jsonb_typeof(entry.value->'articlePosition')='number'
      and (entry.value->>'articlePosition')::numeric between 1 and 30
      and (entry.value->>'articlePosition')::numeric
        = pg_catalog.trunc((entry.value->>'articlePosition')::numeric)
  ),
  legacy_direct as (
    select
      lower(entry.value->>'publishedArticleId')::uuid as article_id,
      'legacy_package'::text as evidence_kind,
      lower(entry.value->>'newsroomArticleId')::uuid as source_id,
      null::uuid as theme_id
    from legacy_entries entry
    where entry.value->>'publishedArticleId'
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.newsroom_mesa_timestamp_text_valid_v1(entry.value->>'usedAt')
  ),
  legacy_outputs as (
    select
      lower(output.value->>'publishedArticleId')::uuid as article_id,
      'legacy_package'::text as evidence_kind,
      lower(entry.value->>'newsroomArticleId')::uuid as source_id,
      null::uuid as theme_id
    from legacy_entries entry
    cross join lateral pg_catalog.jsonb_array_elements(
      case when pg_catalog.jsonb_typeof(entry.manifest->'outputs')='array'
        then entry.manifest->'outputs' else '[]'::jsonb end
    ) output(value)
    where pg_catalog.jsonb_typeof(output.value->'sourceArticlePosition')='number'
      and (output.value->>'sourceArticlePosition')::numeric
        = (entry.value->>'articlePosition')::numeric
      and (output.value->>'sourceArticlePosition')::numeric
        = pg_catalog.trunc((output.value->>'sourceArticlePosition')::numeric)
      and output.value->>'publishedArticleId'
        ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      and public.newsroom_mesa_timestamp_text_valid_v1(output.value->>'usedAt')
  ),
  theme_relations as (
    select
      relation.editorial_article_id as article_id,
      'theme_relation'::text as evidence_kind,
      null::uuid as source_id,
      relation.theme_id
    from public.newsroom_editorial_theme_articles relation
    join requested_themes requested
      on requested.theme_id=relation.theme_id
  ),
  evidence as (
    select * from final_usage
    union all select * from historical_dossier_usage
    union all select * from legacy_direct
    union all select * from legacy_outputs
    union all select * from theme_relations
  ),
  valid as (
    select distinct
      evidence.article_id,
      evidence.evidence_kind,
      evidence.source_id,
      evidence.theme_id
    from evidence
    join public.editorial_articles article
      on article.id=evidence.article_id
     and article.status='published'
  ),
  grouped as (
    select
      article.id,
      article.slug,
      article.title,
      article.matchday_id,
      article.published_at,
      to_jsonb(article) as raw_article,
      array_agg(distinct valid.evidence_kind order by valid.evidence_kind) as evidence_kinds,
      array_agg(distinct valid.source_id order by valid.source_id)
        filter(where valid.source_id is not null) as source_ids,
      array_agg(distinct valid.theme_id order by valid.theme_id)
        filter(where valid.theme_id is not null) as theme_ids
    from valid
    join public.editorial_articles article on article.id=valid.article_id
    group by
      article.id,article.slug,article.title,article.matchday_id,
      article.published_at,to_jsonb(article)
  )
  select coalesce(jsonb_agg(
    jsonb_build_object(
      'editorialArticleId',id,
      'slug',slug,
      'title',title,
      'matchdayId',matchday_id,
      'contentFingerprint',encode(sha256(convert_to(raw_article::text,'UTF8')),'hex'),
      'article',raw_article,
      'evidence',jsonb_build_object(
        'kinds',to_jsonb(evidence_kinds),
        'sourceIds',to_jsonb(coalesce(source_ids,'{}'::uuid[])),
        'themeIds',to_jsonb(coalesce(theme_ids,'{}'::uuid[]))
      )
    )
    order by published_at desc nulls last,id
  ),'[]'::jsonb)
  from grouped;
end;
$function$;

revoke all on function public.newsroom_mesa_global_article_candidates_v1(uuid[],uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_mesa_global_article_candidates_v1(uuid[],uuid[])
  to service_role;

comment on function public.newsroom_mesa_global_article_candidates_v1(uuid[],uuid[]) is
  'Read-only canonical article candidates from proven source usage, historical dossier plans, legacy packages and optional Theme relations. Returns ambiguity; never selects a winner.';

commit;
