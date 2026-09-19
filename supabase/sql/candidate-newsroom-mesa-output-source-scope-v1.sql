-- Candidate only: per-Article-Plan source scope for Mesa production intents.
-- Load after the current 20260919 intent migrations in disposable PostgreSQL.
begin;

do $preflight$
begin
  if to_regprocedure('public.newsroom_prepare_mesa_intents_v1(jsonb,text)') is null
    or to_regprocedure('public.newsroom_prepare_mesa_intents_v1_context_v1(jsonb,text)') is not null
    or to_regprocedure('public.newsroom_mesa_plan_context_sources_valid_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.newsroom_mesa_output_source_in_context_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.newsroom_acknowledge_theme_source_v1(uuid,uuid,uuid)') is null
    or to_regclass('public.newsroom_mesa_intent_preparations') is null
    or to_regclass('public.newsroom_mesa_intent_article_receipts') is null
  then
    raise exception 'mesa-output-source-scope-v1-preflight-missing';
  end if;
end;
$preflight$;

-- An Article Plan belongs to one frozen context, but its factual source set may
-- be any non-empty subset of that context. Different plans may overlap.
create or replace function public.newsroom_mesa_plan_context_sources_valid_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_production_context_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_dossier_id is not null
    and p_article_plan_id is not null
    and p_production_context_id is not null
    and exists (
      select 1
      from public.newsroom_editorial_dossier_article_plan_sources plan_source
      where plan_source.dossier_id = p_dossier_id
        and plan_source.article_plan_id = p_article_plan_id
    )
    and not exists (
      select plan_source.dossier_source_id
      from public.newsroom_editorial_dossier_article_plan_sources plan_source
      where plan_source.dossier_id = p_dossier_id
        and plan_source.article_plan_id = p_article_plan_id
      except
      select context_source.dossier_source_id
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = p_dossier_id
        and context_source.production_context_id = p_production_context_id
    );
$function$;

revoke all on function public.newsroom_mesa_plan_context_sources_valid_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

-- For context-scoped publications the Article Plan assignment is the factual
-- authorization boundary. The wider context stays available as technical memory.
create or replace function public.newsroom_mesa_output_source_in_context_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_dossier_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when publication.source_scope is distinct from 'context' then true
    else exists (
      select 1
      from public.newsroom_editorial_dossier_article_plan_sources plan_source
      where plan_source.dossier_id = publication.dossier_id
        and plan_source.article_plan_id = publication.article_plan_id
        and plan_source.dossier_source_id = p_dossier_source_id
    )
  end
  from public.newsroom_mesa_output_publications publication
  where publication.dossier_id = p_dossier_id
    and publication.article_plan_id = p_article_plan_id;
$function$;

revoke all on function public.newsroom_mesa_output_source_in_context_v1(uuid,uuid,uuid)
  from public,anon,authenticated,service_role;

create function public.newsroom_mesa_intent_output_source_ids_v1(
  p_context jsonb,
  p_request jsonb,
  p_output jsonb,
  p_outputs jsonb
)
returns uuid[]
language plpgsql
immutable
set search_path = ''
as $function$
declare
  v_all uuid[];
  v_explicit uuid[];
  v_theme_sources uuid[];
  v_selected_themes uuid[];
  v_evidence_sources uuid[];
  v_evidence_themes uuid[];
  v_selected uuid[];
  v_reviewed uuid[] := '{}'::uuid[];
  v_remaining uuid[];
  v_existing jsonb;
  v_touches_theme boolean := false;
begin
  select coalesce(array_agg(distinct lower(source ->> 'newsroomArticleId')::uuid
    order by lower(source ->> 'newsroomArticleId')::uuid),'{}'::uuid[])
  into v_all
  from jsonb_array_elements(coalesce(p_context -> 'sources','[]'::jsonb)) source
  where source ->> 'newsroomArticleId'
    ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  if cardinality(v_all) < 1 then
    raise exception 'mesa-intent-output-sources-missing';
  end if;

  if p_context ->> 'kind' <> 'selection'
    or jsonb_typeof(p_request -> 'selection') is distinct from 'object'
  then
    return v_all;
  end if;

  select coalesce(array_agg(distinct lower(value #>> '{}')::uuid order by lower(value #>> '{}')::uuid),'{}'::uuid[])
  into v_explicit
  from jsonb_array_elements(coalesce(p_request -> 'selection' -> 'sourceIds','[]'::jsonb))
  where value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  select coalesce(array_agg(distinct lower(value #>> '{}')::uuid order by lower(value #>> '{}')::uuid),'{}'::uuid[])
  into v_selected_themes
  from jsonb_array_elements(coalesce(p_request -> 'selection' -> 'themeIds','[]'::jsonb))
  where value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

  select coalesce(array_agg(id order by id),'{}'::uuid[])
  into v_theme_sources
  from (
    select id from unnest(v_all) source(id)
    where not (source.id = any(v_explicit))
  ) theme_source;

  if p_output ->> 'kind' = 'existing' then
    if jsonb_typeof(p_output -> 'target' -> 'evidence') is distinct from 'object' then
      return v_all;
    end if;

    select coalesce(array_agg(distinct id order by id),'{}'::uuid[])
    into v_evidence_sources
    from (
      select lower(value #>> '{}')::uuid id
      from jsonb_array_elements(coalesce(p_output -> 'target' -> 'evidence' -> 'sourceIds','[]'::jsonb))
      where value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    ) evidence
    where evidence.id = any(v_all);

    select coalesce(array_agg(distinct lower(value #>> '{}')::uuid order by lower(value #>> '{}')::uuid),'{}'::uuid[])
    into v_evidence_themes
    from jsonb_array_elements(coalesce(p_output -> 'target' -> 'evidence' -> 'themeIds','[]'::jsonb))
    where value #>> '{}' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';

    v_touches_theme :=
      exists(select 1 from unnest(v_evidence_themes) e(id) where e.id = any(v_selected_themes))
      or exists(select 1 from unnest(v_evidence_sources) e(id) where e.id = any(v_theme_sources));

    select coalesce(array_agg(distinct id order by id),'{}'::uuid[])
    into v_selected
    from (
      select id from unnest(v_evidence_sources) source(id)
      union
      select id from unnest(case when v_touches_theme then v_theme_sources else '{}'::uuid[] end) source(id)
    ) selected;

    return case when cardinality(v_selected) > 0 then v_selected else v_all end;
  end if;

  if p_output ->> 'kind' = 'new' then
    for v_existing in
      select value
      from jsonb_array_elements(coalesce(p_outputs,'[]'::jsonb))
      where value ->> 'kind' = 'existing'
        and value ->> 'contextKey' = p_output ->> 'contextKey'
    loop
      v_reviewed := v_reviewed || public.newsroom_mesa_intent_output_source_ids_v1(
        p_context,p_request,v_existing,'[]'::jsonb
      );
    end loop;

    select coalesce(array_agg(distinct id order by id),'{}'::uuid[])
    into v_reviewed
    from unnest(v_reviewed) reviewed(id);

    select coalesce(array_agg(id order by id),'{}'::uuid[])
    into v_remaining
    from unnest(v_explicit) source(id)
    where source.id = any(v_all)
      and not (source.id = any(v_reviewed));

    return case when cardinality(v_remaining) > 0 then v_remaining else v_all end;
  end if;

  return v_all;
end;
$function$;

revoke all on function public.newsroom_mesa_intent_output_source_ids_v1(jsonb,jsonb,jsonb,jsonb)
  from public,anon,authenticated,service_role;

-- Preserve the current preparation implementation behind the public wrapper.
alter function public.newsroom_prepare_mesa_intents_v1(jsonb,text)
  rename to newsroom_prepare_mesa_intents_v1_context_v1;

revoke all on function public.newsroom_prepare_mesa_intents_v1_context_v1(jsonb,text)
  from public,anon,authenticated,service_role;

create function public.newsroom_prepare_mesa_intents_v1(
  p_request jsonb,
  p_expected_authority_fingerprint text
)
returns table(result jsonb)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
  v_plan jsonb;
  v_outputs jsonb := '[]'::jsonb;
  v_output jsonb;
  v_context jsonb;
  v_source_ids uuid[];
  v_dossier_id uuid;
begin
  select original.result into strict v_result
  from public.newsroom_prepare_mesa_intents_v1_context_v1(
    p_request,p_expected_authority_fingerprint
  ) original;

  v_plan := v_result -> 'plan';
  v_dossier_id := (v_plan ->> 'dossierId')::uuid;

  for v_output in
    select value from jsonb_array_elements(v_plan -> 'outputs')
  loop
    select value into strict v_context
    from jsonb_array_elements(v_plan -> 'contexts')
    where value ->> 'key' = v_output ->> 'contextKey';

    if jsonb_typeof(v_output -> 'sourceIds') = 'array'
      and jsonb_array_length(v_output -> 'sourceIds') > 0
    then
      select array_agg(distinct lower(value #>> '{}')::uuid order by lower(value #>> '{}')::uuid)
      into v_source_ids
      from jsonb_array_elements(v_output -> 'sourceIds');
    else
      v_source_ids := public.newsroom_mesa_intent_output_source_ids_v1(
        v_context,v_plan -> 'request',v_output,v_plan -> 'outputs'
      );
      v_output := v_output || jsonb_build_object('sourceIds',to_jsonb(v_source_ids));
    end if;

    if cardinality(v_source_ids) < 1
      or exists (
        select 1 from unnest(v_source_ids) wanted(id)
        where not exists (
          select 1
          from jsonb_array_elements(v_context -> 'sources') source
          where lower(source ->> 'newsroomArticleId')::uuid = wanted.id
        )
      )
    then
      raise exception 'mesa-intent-output-sources-invalid';
    end if;

    delete from public.newsroom_editorial_dossier_article_plan_sources assignment
    using public.newsroom_editorial_dossier_sources dossier_source
    where assignment.dossier_id = v_dossier_id
      and assignment.article_plan_id = (v_output ->> 'outputId')::uuid
      and dossier_source.dossier_id = assignment.dossier_id
      and dossier_source.id = assignment.dossier_source_id
      and not (dossier_source.newsroom_article_id = any(v_source_ids));

    if (
      select count(*)
      from public.newsroom_editorial_dossier_article_plan_sources assignment
      join public.newsroom_editorial_dossier_sources dossier_source
        on dossier_source.dossier_id=assignment.dossier_id
       and dossier_source.id=assignment.dossier_source_id
      where assignment.dossier_id=v_dossier_id
        and assignment.article_plan_id=(v_output ->> 'outputId')::uuid
        and dossier_source.newsroom_article_id=any(v_source_ids)
    ) <> cardinality(v_source_ids)
    then
      raise exception 'mesa-intent-output-sources-invalid';
    end if;

    v_outputs := v_outputs || jsonb_build_array(v_output);
  end loop;

  v_plan := jsonb_set(v_plan,'{outputs}',v_outputs);
  v_result := jsonb_set(v_result,'{plan}',v_plan);

  update public.newsroom_mesa_intent_preparations preparation
  set frozen_plan=v_plan
  where preparation.dossier_id=v_dossier_id;

  update public.newsroom_mesa_production_contexts context
  set selection_payload=jsonb_set(context.selection_payload,'{productionIntents}',v_plan,true)
  where context.dossier_id=v_dossier_id;

  return query select v_result;
end;
$function$;

revoke all on function public.newsroom_prepare_mesa_intents_v1(jsonb,text)
  from public,anon,authenticated,service_role;
grant execute on function public.newsroom_prepare_mesa_intents_v1(jsonb,text)
  to service_role;

-- Receipts remember the factual scope of the output, not every source that was
-- technically available in its parent context.
create function public.newsroom_mesa_scope_intent_receipt_sources_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan jsonb;
  v_output jsonb;
  v_allowed uuid[];
  v_scoped jsonb;
begin
  select preparation.frozen_plan into v_plan
  from public.newsroom_mesa_intent_preparations preparation
  where preparation.dossier_id=new.dossier_id;

  if not found then return new; end if;

  select value into v_output
  from jsonb_array_elements(v_plan -> 'outputs')
  where value ->> 'outputId'=new.output_id::text;

  if not found or jsonb_typeof(v_output -> 'sourceIds') is distinct from 'array' then
    return new;
  end if;

  select array_agg(distinct lower(value #>> '{}')::uuid order by lower(value #>> '{}')::uuid)
  into v_allowed
  from jsonb_array_elements(v_output -> 'sourceIds');

  select coalesce(jsonb_agg(source.value order by source.ordinality),'[]'::jsonb)
  into v_scoped
  from jsonb_array_elements(new.sources) with ordinality source(value,ordinality)
  where (source.value ->> 'newsroomArticleId')::uuid=any(v_allowed);

  if jsonb_array_length(v_scoped) < 1 then
    raise exception 'mesa-intent-receipt-sources-invalid';
  end if;

  new.sources := v_scoped;
  return new;
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
commit;
