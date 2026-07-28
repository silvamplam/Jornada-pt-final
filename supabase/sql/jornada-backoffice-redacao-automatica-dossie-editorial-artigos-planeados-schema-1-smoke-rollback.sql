-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-SCHEMA-1
-- SQL 4/4 — SMOKE TEST TRANSACIONAL COM ROLLBACK
-- Valida planos, atribuições, isolamento entre Dossiês, limite e cascata sem deixar dados permanentes.

begin;

do $$
declare
  v_snapshot record;
  v_dossier_one uuid;
  v_dossier_two uuid;
  v_source_one uuid;
  v_source_two uuid;
  v_plan_one uuid;
  v_plan_two uuid;
  v_plan_three uuid;
  v_plan_four uuid;
  v_cancelled_plan uuid;
  v_assignment_id uuid;
begin
  select snapshot.id, snapshot.article_id
  into v_snapshot
  from public.newsroom_article_snapshots snapshot
  order by snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
  limit 1;

  if not found then
    raise exception 'smoke_requires_existing_newsroom_snapshot'
      using errcode = '55000';
  end if;

  insert into public.newsroom_editorial_dossiers (
    title,
    output_mode,
    output_count,
    length_mode,
    article_kind
  ) values (
    'Smoke Dossiê com planos',
    'multiple',
    2,
    'standard',
    'news'
  )
  returning id into v_dossier_one;

  insert into public.newsroom_editorial_dossiers (
    title,
    output_mode,
    output_count,
    length_mode,
    article_kind
  ) values (
    'Smoke Dossiê isolado',
    'single',
    1,
    'brief',
    'summary'
  )
  returning id into v_dossier_two;

  insert into public.newsroom_editorial_dossier_sources (
    dossier_id,
    newsroom_article_id,
    newsroom_snapshot_id,
    source_role,
    sort_order,
    included
  ) values (
    v_dossier_one,
    v_snapshot.article_id,
    v_snapshot.id,
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
    v_dossier_two,
    v_snapshot.article_id,
    v_snapshot.id,
    'primary',
    10,
    true
  )
  returning id into v_source_two;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id,
    working_title,
    status,
    sort_order,
    article_kind,
    length_mode,
    editorial_instructions
  ) values (
    v_dossier_one,
    'Primeiro artigo planeado',
    'planned',
    10,
    'news',
    'standard',
    'Usar a fonte principal e separar factos de contexto.'
  )
  returning id into v_plan_one;

  insert into public.newsroom_editorial_dossier_article_plan_sources (
    dossier_id,
    article_plan_id,
    dossier_source_id,
    sort_order
  ) values (
    v_dossier_one,
    v_plan_one,
    v_source_one,
    10
  )
  returning id into v_assignment_id;

  if v_assignment_id is null then
    raise exception 'smoke_plan_source_insert_failed'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_sources assignment
    join public.newsroom_editorial_dossier_sources dossier_source
      on dossier_source.id = assignment.dossier_source_id
     and dossier_source.dossier_id = assignment.dossier_id
    where assignment.id = v_assignment_id
      and assignment.article_plan_id = v_plan_one
      and dossier_source.newsroom_snapshot_id = v_snapshot.id
  ) then
    raise exception 'smoke_frozen_source_readback_failed'
      using errcode = '55000';
  end if;

  begin
    insert into public.newsroom_editorial_dossier_article_plan_sources (
      dossier_id,
      article_plan_id,
      dossier_source_id,
      sort_order
    ) values (
      v_dossier_one,
      v_plan_one,
      v_source_one,
      20
    );

    raise exception 'smoke_duplicate_plan_source_was_not_blocked'
      using errcode = '55000';
  exception
    when unique_violation then
      null;
  end;

  begin
    insert into public.newsroom_editorial_dossier_article_plan_sources (
      dossier_id,
      article_plan_id,
      dossier_source_id,
      sort_order
    ) values (
      v_dossier_one,
      v_plan_one,
      v_source_two,
      20
    );

    raise exception 'smoke_cross_dossier_source_was_not_blocked'
      using errcode = '55000';
  exception
    when foreign_key_violation then
      null;
  end;

  begin
    insert into public.newsroom_editorial_dossier_article_plans (
      dossier_id,
      working_title,
      status
    ) values (
      v_dossier_one,
      'Plano com estado inválido',
      'drafted'
    );

    raise exception 'smoke_invalid_plan_status_was_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id, working_title, status, sort_order
  ) values (
    v_dossier_one, 'Segundo artigo planeado', 'planned', 20
  )
  returning id into v_plan_two;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id, working_title, status, sort_order
  ) values (
    v_dossier_one, 'Terceiro artigo planeado', 'ready', 30
  )
  returning id into v_plan_three;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id, working_title, status, sort_order
  ) values (
    v_dossier_one, 'Quarto artigo planeado', 'planned', 40
  )
  returning id into v_plan_four;

  begin
    insert into public.newsroom_editorial_dossier_article_plans (
      dossier_id, working_title, status, sort_order
    ) values (
      v_dossier_one, 'Quinto artigo ativo', 'planned', 50
    );

    raise exception 'smoke_active_plan_limit_was_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  insert into public.newsroom_editorial_dossier_article_plans (
    dossier_id, working_title, status, sort_order
  ) values (
    v_dossier_one, 'Plano cancelado fora do limite ativo', 'cancelled', 50
  )
  returning id into v_cancelled_plan;

  if v_plan_two is null
     or v_plan_three is null
     or v_plan_four is null
     or v_cancelled_plan is null then
    raise exception 'smoke_plan_insert_readback_failed'
      using errcode = '55000';
  end if;

  delete from public.newsroom_editorial_dossiers
  where id = v_dossier_one;

  if exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.dossier_id = v_dossier_one
  ) or exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_sources assignment
    where assignment.dossier_id = v_dossier_one
  ) then
    raise exception 'smoke_dossier_plan_cascade_failed'
      using errcode = '55000';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-SCHEMA-1',
  'smoke_ok', true,
  'active_plan_limit', 4,
  'same_dossier_assignment_enforced', true,
  'persistent_writes', false
) as smoke_result;

rollback;
