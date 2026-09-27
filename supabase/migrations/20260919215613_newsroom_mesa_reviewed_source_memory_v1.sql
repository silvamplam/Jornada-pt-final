do $preflight$
begin
  if to_regclass('public.newsroom_mesa_intent_article_receipts') is null
    or to_regclass('public.newsroom_mesa_intent_preparations') is null
    or to_regprocedure('public.newsroom_mesa_theme_summaries_v1(uuid[])') is null
  then raise exception 'mesa-reviewed-source-memory-v1-preflight-missing'; end if;
end;
$preflight$;

-- Only EXISTING review receipts are narrowed to their inferred review focus.
-- NEW usage remains determined by FONTES_UTILIZADAS/output_source_usage.
create function public.newsroom_mesa_scope_intent_receipt_sources_v1()
returns trigger language plpgsql security definer set search_path=''
as $function$
declare v_plan jsonb;v_output jsonb;v_allowed uuid[];v_scoped jsonb;
begin
  if new.slot not like 'EXISTING\_%' escape '\' then return new; end if;
  select frozen_plan into v_plan from public.newsroom_mesa_intent_preparations
    where dossier_id=new.dossier_id;
  if not found then return new; end if;
  select value into v_output from jsonb_array_elements(v_plan->'outputs')
    where value->>'outputId'=new.output_id::text;
  if not found or jsonb_typeof(v_output->'focusSourceIds') is distinct from 'array' then return new; end if;
  select array_agg(distinct lower(value#>>'{}')::uuid order by lower(value#>>'{}')::uuid)
    into v_allowed from jsonb_array_elements(v_output->'focusSourceIds');
  select coalesce(jsonb_agg(source.value order by source.ordinality),'[]'::jsonb) into v_scoped
    from jsonb_array_elements(new.sources) with ordinality source(value,ordinality)
    where (source.value->>'newsroomArticleId')::uuid=any(v_allowed);
  if jsonb_array_length(v_scoped)<1 then raise exception 'mesa-intent-receipt-sources-invalid'; end if;
  new.sources:=v_scoped; return new;
end;
$function$;
revoke all on function public.newsroom_mesa_scope_intent_receipt_sources_v1()
  from public,anon,authenticated,service_role;
create trigger newsroom_mesa_scope_intent_receipt_sources_v1
before insert on public.newsroom_mesa_intent_article_receipts
for each row execute function public.newsroom_mesa_scope_intent_receipt_sources_v1();

-- Theme freshness treats a completed EXISTING review as a valid editorial
-- baseline without mutating Theme membership state inside publication locks.
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

revoke all on function public.newsroom_mesa_theme_summaries_v1(uuid[])
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_mesa_theme_summaries_v1(uuid[])
  to service_role;


notify pgrst,'reload schema';
