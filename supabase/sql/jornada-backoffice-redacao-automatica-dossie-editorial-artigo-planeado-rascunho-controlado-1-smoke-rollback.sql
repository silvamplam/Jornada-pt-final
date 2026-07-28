-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGO-PLANEADO-RASCUNHO-CONTROLADO-1
-- SQL 4/4 — SMOKE TEST TRANSACIONAL COM ROLLBACK
-- Valida criação, reutilização, rascunho vazio, proveniência, imutabilidade e FK.

begin;

do $$
declare
  v_snapshot_one record;
  v_snapshot_two record;
  v_dossier_id uuid;
  v_source_one uuid;
  v_source_two uuid;
  v_plan_id uuid;
  v_planned_plan_id uuid;
  v_article_id uuid;
  v_reused_article_id uuid;
  v_action text;
  v_reused_action text;
  v_assignment_count integer;
  v_article_count integer;
begin
  select candidate.id, candidate.article_id
  into v_snapshot_one
  from (
    select distinct on (snapshot.article_id)
      snapshot.id,
      snapshot.article_id,
      snapshot.extracted_at,
      snapshot.created_at
    from public.newsroom_article_snapshots snapshot
    order by snapshot.article_id, snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
  ) candidate
  order by candidate.extracted_at desc, candidate.created_at desc, candidate.id desc
  limit 1;

  select candidate.id, candidate.article_id
  into v_snapshot_two
  from (
    select distinct on (snapshot.article_id)
      snapshot.id,
      snapshot.article_id,
      snapshot.extracted_at,
      snapshot.created_at
    from public.newsroom_article_snapshots snapshot
    order by snapshot.article_id, snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
  ) candidate
  where candidate.article_id <> v_snapshot_one.article_id
  order by candidate.extracted_at desc, candidate.created_at desc, candidate.id desc
  limit 1;

  if v_snapshot_one.id is null or v_snapshot_two.id is null then
    raise exception 'smoke_requires_two_distinct_newsroom_articles'
      using errcode = '55000';
  end if;

  insert into public.newsroom_editorial_dossiers (
    title,
    output_mode,
    output_count,
    length_mode,
    article_kind
  ) values (
    'Smoke rascunho controlado',
    'multiple',
    2,
    'developed',
    'analysis'
  )
  returning id into v_dossier_id;

  insert into public.newsroom_editorial_dossier_sources (
    dossier_id,
    newsroom_article_id,
    newsroom_snapshot_id,
    source_role,
    sort_order,
    included
  ) values (
    v_dossier_id,
    v_snapshot_one.article_id,
    v_snapshot_one.id,
    'primary',
    10,
    true
  )
  returning id into v_source_one;

  insert into public.newsroom_editorial_dossier_sources (
    dossier_id,
    newsroom_article_id,
    newsroom_snapshot_id,
    source_role,
    sort_order,
    included
  ) values (
    v_dossier_id,
    v_snapshot_two.article_id,
    v_snapshot_two.id,
    'context',
    20,
    true
  )
  returning id into v_source_two;

  select saved.article_plan_id
  into v_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    null,
    'Título humano do artigo planeado',
    'ready',
    10,
    'analysis',
    'developed',
    'Usar apenas os factos das duas fontes congeladas e distinguir os contextos.',
    array[v_source_two, v_source_one]
  ) saved;

  select created.editorial_article_id, created.draft_action
  into v_article_id, v_action
  from public.newsroom_create_editorial_dossier_article_plan_draft(
    v_dossier_id,
    v_plan_id
  ) created;

  if v_article_id is null or v_action <> 'created' then
    raise exception 'smoke_draft_creation_failed'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.editorial_articles article
    where article.id = v_article_id
      and article.newsroom_article_id is null
      and article.title = 'Título humano do artigo planeado'
      and article.slug = 'dossier-plan-' || replace(v_plan_id::text, '-', '')
      and article.status = 'draft'
      and article.scope = 'general'
      and article.subtitle is null
      and article.body = ''
      and article.image_url is null
      and article.published_at is null
      and article.competition_id is null
      and article.season_id is null
      and article.matchday_id is null
  ) then
    raise exception 'smoke_created_editorial_article_invalid'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.id = v_plan_id
      and plan.dossier_id = v_dossier_id
      and plan.status = 'ready'
      and plan.editorial_article_id = v_article_id
  ) then
    raise exception 'smoke_plan_link_missing'
      using errcode = '55000';
  end if;

  select count(*)
  into v_assignment_count
  from public.newsroom_editorial_dossier_article_plan_sources assignment
  where assignment.article_plan_id = v_plan_id
    and assignment.dossier_id = v_dossier_id;

  if v_assignment_count <> 2 then
    raise exception 'smoke_plan_sources_not_preserved'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_sources assignment
    where assignment.article_plan_id = v_plan_id
      and assignment.dossier_source_id = v_source_two
      and assignment.sort_order = 10
  ) or not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_sources assignment
    where assignment.article_plan_id = v_plan_id
      and assignment.dossier_source_id = v_source_one
      and assignment.sort_order = 20
  ) then
    raise exception 'smoke_plan_source_order_not_preserved'
      using errcode = '55000';
  end if;

  select reused.editorial_article_id, reused.draft_action
  into v_reused_article_id, v_reused_action
  from public.newsroom_create_editorial_dossier_article_plan_draft(
    v_dossier_id,
    v_plan_id
  ) reused;

  if v_reused_article_id <> v_article_id or v_reused_action <> 'reused' then
    raise exception 'smoke_draft_reuse_failed'
      using errcode = '55000';
  end if;

  select count(*)
  into v_article_count
  from public.editorial_articles article
  where article.id = v_article_id
     or article.slug = 'dossier-plan-' || replace(v_plan_id::text, '-', '');

  if v_article_count <> 1 then
    raise exception 'smoke_duplicate_editorial_article_created'
      using errcode = '55000';
  end if;

  begin
    perform saved.article_plan_id
    from public.newsroom_save_editorial_dossier_article_plan(
      v_dossier_id,
      v_plan_id,
      'Título que não pode substituir o plano congelado',
      'ready',
      20,
      'news',
      'brief',
      'Alteração indevida.',
      array[v_source_one]
    ) saved;

    raise exception 'smoke_converted_plan_was_not_frozen'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.id = v_plan_id
      and plan.working_title = 'Título humano do artigo planeado'
      and plan.status = 'ready'
      and plan.article_kind = 'analysis'
      and plan.length_mode = 'developed'
      and plan.editorial_article_id = v_article_id
  ) then
    raise exception 'smoke_converted_plan_changed'
      using errcode = '55000';
  end if;

  begin
    delete from public.editorial_articles article
    where article.id = v_article_id;

    raise exception 'smoke_linked_editorial_article_delete_was_not_blocked'
      using errcode = '55000';
  exception
    when foreign_key_violation then
      null;
  end;

  select saved.article_plan_id
  into v_planned_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    null,
    'Plano ainda em preparação',
    'planned',
    20,
    'news',
    'standard',
    '',
    array[v_source_one]
  ) saved;

  begin
    perform created.editorial_article_id
    from public.newsroom_create_editorial_dossier_article_plan_draft(
      v_dossier_id,
      v_planned_plan_id
    ) created;

    raise exception 'smoke_planned_article_was_converted'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGO-PLANEADO-RASCUNHO-CONTROLADO-1',
  'smoke_ok', true,
  'draft_created', true,
  'draft_reused', true,
  'draft_body_empty', true,
  'plan_status_after_conversion', 'ready',
  'plan_and_sources_frozen', true,
  'linked_article_delete_restricted', true,
  'persistent_writes', false
) as smoke_result;

rollback;
