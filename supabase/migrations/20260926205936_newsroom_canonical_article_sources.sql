begin;

-- Continuity is cumulative; factual usage and decision audit remain separate.
create table public.newsroom_editorial_article_sources (
  editorial_article_id uuid not null references public.editorial_articles(id) on delete restrict,
  newsroom_article_id uuid not null references public.newsroom_articles(id) on delete restrict,
  linked_at timestamptz not null default now(),
  primary key (editorial_article_id, newsroom_article_id)
);
create index newsroom_editorial_article_sources_source_idx
  on public.newsroom_editorial_article_sources(newsroom_article_id, editorial_article_id);
alter table public.newsroom_editorial_article_sources enable row level security;
alter table public.newsroom_editorial_article_sources force row level security;
revoke all on public.newsroom_editorial_article_sources from public,anon,authenticated,service_role;
grant select on public.newsroom_editorial_article_sources to service_role;
comment on table public.newsroom_editorial_article_sources is
  'Cumulative canonical article/source continuity, not factual output usage. Decisions and frozen snapshots remain in receipts/provenance.';

-- A receipt can contain the shared context (notably historical NEW receipts).
-- Intersect it with the exact frozen output focus and context; never cross outputs.
create function public.newsroom_mesa_receipt_continuity_sources_v1(
  p_dossier_id uuid, p_output_id uuid, p_sources jsonb
) returns table(newsroom_article_id uuid)
language sql stable security invoker set search_path='' as $function$
  select distinct source.id
  from public.newsroom_mesa_intent_preparations preparation
  join public.newsroom_mesa_intent_finalizations finalization on finalization.dossier_id=preparation.dossier_id
  cross join lateral jsonb_array_elements(preparation.frozen_plan->'outputs') output
  cross join lateral jsonb_array_elements(preparation.frozen_plan->'contexts') context
  cross join lateral jsonb_array_elements(p_sources) receipt_source
  join public.newsroom_articles source on source.id::text=receipt_source->>'newsroomArticleId'
  join public.newsroom_article_snapshots snapshot
    on snapshot.article_id=source.id and snapshot.id::text=receipt_source->>'newsroomSnapshotId'
  where preparation.dossier_id=p_dossier_id and output->>'outputId'=p_output_id::text
    and context->>'key'=output->>'contextKey'
    and exists (select 1 from jsonb_array_elements(context->'sources') frozen
      where frozen->>'newsroomArticleId'=source.id::text and frozen->>'newsroomSnapshotId'=snapshot.id::text)
    -- Old NEW receipts can describe a shared pool, not an article-specific group.
    -- With several outputs and no frozen focus, only exact factual provenance is demonstrable.
    and (output->>'kind'='existing' or output ? 'focusSourceIds'
      or (select count(*) from jsonb_array_elements(preparation.frozen_plan->'outputs') sibling
        where sibling->>'contextKey'=output->>'contextKey')=1
      or exists (select 1 from public.newsroom_mesa_output_source_usage usage
        where usage.dossier_id=p_dossier_id and usage.article_plan_id=p_output_id
          and usage.newsroom_article_id=source.id))
    and (not (output ? 'focusSourceIds') or exists (
      select 1 from jsonb_array_elements_text(output->'focusSourceIds') focus(id) where focus.id=source.id::text));
$function$;
revoke all on function public.newsroom_mesa_receipt_continuity_sources_v1(uuid,uuid,jsonb)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_mesa_receipt_continuity_sources_v1(uuid,uuid,jsonb) to service_role;

create function public.newsroom_link_receipt_article_sources_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  insert into public.newsroom_editorial_article_sources(editorial_article_id,newsroom_article_id,linked_at)
    select new.editorial_article_id, source.newsroom_article_id, new.completed_at
    from public.newsroom_mesa_receipt_continuity_sources_v1(new.dossier_id,new.output_id,new.sources) source
    on conflict (editorial_article_id,newsroom_article_id) do nothing;
  return new;
end;
$function$;
revoke all on function public.newsroom_link_receipt_article_sources_v1() from public,anon,authenticated,service_role;
-- Runs after the existing BEFORE trigger that narrows EXISTING receipt sources.
create trigger newsroom_link_receipt_article_sources_v1 after insert
  on public.newsroom_mesa_intent_article_receipts for each row
  execute function public.newsroom_link_receipt_article_sources_v1();

-- Preserve older writers while making the new relation the discovery authority.
-- Intent writers wait for finalization/receipts, including SEM_ALTERACAO.
create function public.newsroom_link_factual_article_sources_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  if not exists (select 1 from public.newsroom_mesa_intent_preparations p where p.dossier_id=new.dossier_id) then
    insert into public.newsroom_editorial_article_sources(editorial_article_id,newsroom_article_id,linked_at)
      values(new.editorial_article_id,new.newsroom_article_id,new.created_at) on conflict do nothing;
  end if;
  return new;
end;
$function$;
revoke all on function public.newsroom_link_factual_article_sources_v1() from public,anon,authenticated,service_role;
create trigger newsroom_link_factual_article_sources_v1 after insert
  on public.newsroom_mesa_output_source_usage for each row execute function public.newsroom_link_factual_article_sources_v1();

create function public.newsroom_link_legacy_article_source_v1()
returns trigger language plpgsql security definer set search_path='' as $function$
begin
  insert into public.newsroom_editorial_article_sources(editorial_article_id,newsroom_article_id,linked_at)
    select article.id,article.newsroom_article_id,coalesce(article.published_at,now())
    from public.editorial_articles article
    where article.id=new.id and article.status='published' and article.newsroom_article_id is not null
      and not exists (select 1 from public.newsroom_mesa_output_publications publication
        join public.newsroom_mesa_intent_preparations preparation on preparation.dossier_id=publication.dossier_id
        where publication.editorial_article_id=article.id)
    on conflict do nothing;
  return new;
end;
$function$;
revoke all on function public.newsroom_link_legacy_article_source_v1() from public,anon,authenticated,service_role;
create constraint trigger newsroom_link_legacy_article_source_v1 after insert or update
  on public.editorial_articles deferrable initially deferred for each row
  execute function public.newsroom_link_legacy_article_source_v1();

-- BACKFILL_BEGIN: same evidence query is used by the read-only audit.
with evidence as (
  select article.id as editorial_article_id, article.newsroom_article_id, coalesce(article.published_at,article.created_at) as linked_at,
    'legacy_origin'::text as evidence_kind
  from public.editorial_articles article
  join public.newsroom_articles source on source.id=article.newsroom_article_id
  where article.status='published'
  union all
  select usage.editorial_article_id, usage.newsroom_article_id,usage.created_at,'factual_usage'
  from public.newsroom_mesa_output_source_usage usage
  join public.editorial_articles article on article.id=usage.editorial_article_id and article.status='published'
  union all
  select receipt.editorial_article_id, source.newsroom_article_id,receipt.completed_at,'receipt_'||receipt.decision
  from public.newsroom_mesa_intent_article_receipts receipt
  join public.editorial_articles article on article.id=receipt.editorial_article_id and article.status='published'
  cross join lateral public.newsroom_mesa_receipt_continuity_sources_v1(receipt.dossier_id,receipt.output_id,receipt.sources) source
)
insert into public.newsroom_editorial_article_sources(editorial_article_id,newsroom_article_id,linked_at)
  select editorial_article_id,newsroom_article_id,min(linked_at) from evidence
  group by editorial_article_id,newsroom_article_id on conflict do nothing;
-- BACKFILL_END

create or replace function public.newsroom_mesa_global_article_candidates_v1(
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
  with requested_themes as (
    select id as theme_id from unnest(v_theme_ids) requested(id)
  ),
  requested_sources as (
    select id as source_id from unnest(v_source_ids) requested(id)
    union
    select membership.newsroom_article_id
    from public.newsroom_editorial_theme_sources membership
    join requested_themes requested on requested.theme_id=membership.theme_id
  ),
  canonical_sources as (
    select relation.editorial_article_id as article_id, 'article_continuity'::text as evidence_kind,
      relation.newsroom_article_id as source_id, null::uuid as theme_id
    from public.newsroom_editorial_article_sources relation
    join requested_sources requested on requested.source_id=relation.newsroom_article_id
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
    select * from canonical_sources
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

comment on function public.newsroom_mesa_global_article_candidates_v1(uuid[],uuid[]) is
  'Canonical article candidates from cumulative article/source continuity and explicit Theme relations; never selects an ambiguous winner.';

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
      exists (
        select 1 from public.newsroom_editorial_article_sources relation
        join public.editorial_articles published_article on published_article.id=relation.editorial_article_id
          and published_article.status='published'
        where relation.newsroom_article_id=article.id
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
    select source.theme_id, relation.editorial_article_id
    from theme_sources source
    join public.newsroom_editorial_article_sources relation on relation.newsroom_article_id=source.newsroom_article_id
    join public.editorial_articles article on article.id=relation.editorial_article_id and article.status='published'
    union

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
    select relation.editorial_article_id,relation.linked_at as added_at
    from public.newsroom_editorial_theme_sources source
    join public.newsroom_editorial_article_sources relation on relation.newsroom_article_id=source.newsroom_article_id
    where source.theme_id=p_theme_id
    union all

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


notify pgrst,'reload schema';
commit;

