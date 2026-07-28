-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-UX-1
-- SQL 4/4 — SMOKE TEST TRANSACIONAL COM ROLLBACK
-- Valida criação, edição, prontidão, exclusão, cancelamento, reativação e limite.

begin;

do $$
declare
  v_snapshot_one record;
  v_snapshot_two record;
  v_dossier_id uuid;
  v_source_one uuid;
  v_source_two uuid;
  v_plan_one uuid;
  v_plan_two uuid;
  v_plan_three uuid;
  v_plan_four uuid;
  v_assignment_count integer;
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
    'Smoke UX dos artigos planeados',
    'multiple',
    2,
    'standard',
    'news'
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
    'complementary',
    20,
    true
  )
  returning id into v_source_two;

  select saved.article_plan_id
  into v_plan_one
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    null,
    'Primeiro artigo planeado',
    'planned',
    10,
    'news',
    'standard',
    '',
    array[v_source_one, v_source_two]
  ) saved;

  if v_plan_one is null then
    raise exception 'smoke_article_plan_create_failed'
      using errcode = '55000';
  end if;

  select count(*)
  into v_assignment_count
  from public.newsroom_editorial_dossier_article_plan_sources assignment
  where assignment.article_plan_id = v_plan_one;

  if v_assignment_count <> 2 then
    raise exception 'smoke_article_plan_assignments_missing'
      using errcode = '55000';
  end if;

  perform saved.article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    v_plan_one,
    'Primeiro artigo pronto',
    'ready',
    20,
    'analysis',
    'developed',
    'Confirmar os factos principais e separar contexto de análise.',
    array[v_source_two, v_source_one]
  ) saved;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.id = v_plan_one
      and plan.status = 'ready'
      and plan.sort_order = 20
      and plan.article_kind = 'analysis'
      and plan.length_mode = 'developed'
  ) then
    raise exception 'smoke_article_plan_update_failed'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_sources assignment
    where assignment.article_plan_id = v_plan_one
      and assignment.dossier_source_id = v_source_two
      and assignment.sort_order = 10
  ) then
    raise exception 'smoke_article_plan_source_reorder_failed'
      using errcode = '55000';
  end if;

  update public.newsroom_editorial_dossier_sources
  set included = false
  where id = v_source_two;

  perform saved.article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    v_plan_one,
    'Primeiro artigo mantém fonte excluída',
    'planned',
    10,
    'news',
    'standard',
    '',
    array[v_source_two]
  ) saved;

  begin
    perform saved.article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
      v_dossier_id,
      null,
      'Novo artigo não pode adotar fonte excluída',
      'planned',
      20,
      'news',
      'standard',
      '',
      array[v_source_two]
    ) saved;

    raise exception 'smoke_excluded_source_was_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  begin
    perform saved.article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
      v_dossier_id,
      null,
      'Artigo pronto incompleto',
      'ready',
      20,
      'news',
      'standard',
      '',
      '{}'::uuid[]
    ) saved;

    raise exception 'smoke_incomplete_ready_plan_was_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  perform saved.article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    v_plan_one,
    'Primeiro artigo cancelado',
    'cancelled',
    10,
    'news',
    'standard',
    '',
    '{}'::uuid[]
  ) saved;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_sources assignment
    where assignment.article_plan_id = v_plan_one
      and assignment.dossier_source_id = v_source_two
  ) then
    raise exception 'smoke_cancelled_plan_did_not_preserve_assignments'
      using errcode = '55000';
  end if;

  perform saved.article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    v_plan_one,
    'Primeiro artigo reativado',
    'planned',
    10,
    'news',
    'standard',
    '',
    array[v_source_two]
  ) saved;

  select saved.article_plan_id
  into v_plan_two
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id, null, 'Segundo artigo', 'planned', 20, 'news', 'brief', '', array[v_source_one]
  ) saved;

  select saved.article_plan_id
  into v_plan_three
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id, null, 'Terceiro artigo', 'planned', 30, 'preview', 'standard', '', array[v_source_one]
  ) saved;

  select saved.article_plan_id
  into v_plan_four
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id, null, 'Quarto artigo', 'planned', 40, 'summary', 'developed', '', array[v_source_one]
  ) saved;

  if v_plan_two is null or v_plan_three is null or v_plan_four is null then
    raise exception 'smoke_active_plan_setup_failed'
      using errcode = '55000';
  end if;

  begin
    perform saved.article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
      v_dossier_id, null, 'Quinto artigo', 'planned', 50, 'news', 'standard', '', array[v_source_one]
    ) saved;

    raise exception 'smoke_active_plan_limit_was_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-UX-1',
  'smoke_ok', true,
  'atomic_save', true,
  'cancel_preserves_assignments', true,
  'excluded_source_rule_enforced', true,
  'active_plan_limit', 4,
  'persistent_writes', false
) as smoke_result;

rollback;
