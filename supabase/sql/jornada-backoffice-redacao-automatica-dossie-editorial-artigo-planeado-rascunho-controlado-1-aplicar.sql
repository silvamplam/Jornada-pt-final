-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGO-PLANEADO-RASCUNHO-CONTROLADO-1
-- SQL 2/4 — APLICAÇÃO PERSISTENTE MANUAL
-- Liga cada plano a um único artigo editorial e cria o rascunho numa transação.

begin;

alter table public.newsroom_editorial_dossier_article_plans
  add column editorial_article_id uuid,
  add constraint newsroom_editorial_dossier_article_plans_editorial_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete restrict;

create unique index newsroom_editorial_dossier_article_plans_editorial_article_id_uidx
  on public.newsroom_editorial_dossier_article_plans (editorial_article_id)
  where editorial_article_id is not null;

create or replace function public.newsroom_save_editorial_dossier_article_plan(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_working_title text,
  p_status text,
  p_sort_order integer,
  p_article_kind text,
  p_length_mode text,
  p_editorial_instructions text,
  p_dossier_source_ids uuid[]
)
returns table(article_plan_id uuid)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan_id uuid := coalesce(p_article_plan_id, pg_catalog.gen_random_uuid());
  v_is_create boolean := p_article_plan_id is null;
  v_existing_status text;
  v_editorial_article_id uuid;
  v_source_count integer := coalesce(cardinality(p_dossier_source_ids), 0);
  v_distinct_source_count integer;
  v_source_id uuid;
begin
  if p_dossier_id is null then
    raise exception 'editorial_dossier_article_plan_dossier_required'
      using errcode = '23514';
  end if;

  if btrim(coalesce(p_working_title, '')) = '' then
    raise exception 'editorial_dossier_article_plan_title_required'
      using errcode = '23514';
  end if;

  if p_status not in ('planned', 'ready', 'cancelled') then
    raise exception 'editorial_dossier_article_plan_status_invalid'
      using errcode = '23514';
  end if;

  if p_article_kind not in ('news', 'analysis', 'preview', 'summary') then
    raise exception 'editorial_dossier_article_plan_kind_invalid'
      using errcode = '23514';
  end if;

  if p_length_mode not in ('brief', 'standard', 'developed') then
    raise exception 'editorial_dossier_article_plan_length_invalid'
      using errcode = '23514';
  end if;

  if p_sort_order is null or p_sort_order < 0 then
    raise exception 'editorial_dossier_article_plan_order_invalid'
      using errcode = '23514';
  end if;

  perform 1
  from public.newsroom_editorial_dossiers dossier
  where dossier.id = p_dossier_id
  for update;

  if not found then
    raise exception 'editorial_dossier_not_found'
      using errcode = 'P0002';
  end if;

  if v_is_create then
    if p_status = 'cancelled' then
      raise exception 'editorial_dossier_article_plan_new_cancelled_invalid'
        using errcode = '23514';
    end if;
  else
    select
      plan.status,
      plan.editorial_article_id
    into
      v_existing_status,
      v_editorial_article_id
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.id = p_article_plan_id
      and plan.dossier_id = p_dossier_id
    for update;

    if not found then
      raise exception 'editorial_dossier_article_plan_not_found'
        using errcode = 'P0002';
    end if;

    if v_editorial_article_id is not null then
      raise exception 'editorial_dossier_article_plan_already_converted'
        using errcode = '23514';
    end if;
  end if;

  select count(distinct source_row.source_id)
  into v_distinct_source_count
  from unnest(coalesce(p_dossier_source_ids, '{}'::uuid[]))
    as source_row(source_id);

  if v_distinct_source_count <> v_source_count then
    raise exception 'editorial_dossier_article_plan_source_duplicate'
      using errcode = '23514';
  end if;

  if p_status = 'ready'
     and (
       btrim(coalesce(p_editorial_instructions, '')) = ''
       or v_source_count < 1
     ) then
    raise exception 'editorial_dossier_article_plan_ready_incomplete'
      using errcode = '23514';
  end if;

  if p_status <> 'cancelled' then
    for v_source_id in
      select source_row.source_id
      from unnest(coalesce(p_dossier_source_ids, '{}'::uuid[]))
        as source_row(source_id)
    loop
      if not exists (
        select 1
        from public.newsroom_editorial_dossier_sources dossier_source
        where dossier_source.id = v_source_id
          and dossier_source.dossier_id = p_dossier_id
          and (
            dossier_source.included
            or exists (
              select 1
              from public.newsroom_editorial_dossier_article_plan_sources existing_assignment
              where existing_assignment.article_plan_id = v_plan_id
                and existing_assignment.dossier_source_id = v_source_id
                and existing_assignment.dossier_id = p_dossier_id
            )
          )
      ) then
        raise exception 'editorial_dossier_article_plan_source_unavailable'
          using errcode = '23514';
      end if;
    end loop;
  end if;

  if v_is_create then
    insert into public.newsroom_editorial_dossier_article_plans (
      id,
      dossier_id,
      working_title,
      status,
      sort_order,
      article_kind,
      length_mode,
      editorial_instructions
    ) values (
      v_plan_id,
      p_dossier_id,
      btrim(p_working_title),
      p_status,
      p_sort_order,
      p_article_kind,
      p_length_mode,
      btrim(coalesce(p_editorial_instructions, ''))
    );
  else
    update public.newsroom_editorial_dossier_article_plans plan
    set working_title = btrim(p_working_title),
        status = p_status,
        sort_order = p_sort_order,
        article_kind = p_article_kind,
        length_mode = p_length_mode,
        editorial_instructions = btrim(coalesce(p_editorial_instructions, ''))
    where plan.id = v_plan_id
      and plan.dossier_id = p_dossier_id;
  end if;

  if p_status <> 'cancelled' then
    delete from public.newsroom_editorial_dossier_article_plan_sources assignment
    where assignment.article_plan_id = v_plan_id
      and assignment.dossier_id = p_dossier_id
      and not (
        assignment.dossier_source_id = any(coalesce(p_dossier_source_ids, '{}'::uuid[]))
      );

    insert into public.newsroom_editorial_dossier_article_plan_sources (
      id,
      dossier_id,
      article_plan_id,
      dossier_source_id,
      sort_order
    )
    select
      pg_catalog.gen_random_uuid(),
      p_dossier_id,
      v_plan_id,
      ordered_source.source_id,
      ordered_source.ordinality::integer * 10
    from unnest(coalesce(p_dossier_source_ids, '{}'::uuid[]))
      with ordinality as ordered_source(source_id, ordinality)
    on conflict on constraint newsroom_editorial_dossier_article_plan_sources_plan_source_key
    do update
    set sort_order = excluded.sort_order;
  end if;

  update public.newsroom_editorial_dossiers dossier
  set updated_at = now()
  where dossier.id = p_dossier_id;

  return query select v_plan_id;
end;
$$;

create function public.newsroom_create_editorial_dossier_article_plan_draft(
  p_dossier_id uuid,
  p_article_plan_id uuid
)
returns table(
  editorial_article_id uuid,
  draft_action text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan record;
  v_article_id uuid;
  v_article_status text;
  v_slug text;
  v_now timestamptz := now();
begin
  if p_dossier_id is null or p_article_plan_id is null then
    raise exception 'editorial_dossier_article_plan_draft_input_invalid'
      using errcode = '23514';
  end if;

  select
    plan.id,
    plan.dossier_id,
    plan.working_title,
    plan.status,
    plan.editorial_instructions,
    plan.editorial_article_id
  into v_plan
  from public.newsroom_editorial_dossier_article_plans plan
  where plan.id = p_article_plan_id
    and plan.dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'editorial_dossier_article_plan_not_found'
      using errcode = 'P0002';
  end if;

  if v_plan.editorial_article_id is not null then
    select article.status
    into v_article_status
    from public.editorial_articles article
    where article.id = v_plan.editorial_article_id;

    if not found or v_article_status not in ('draft', 'published') then
      raise exception 'editorial_dossier_article_plan_draft_link_invalid'
        using errcode = '55000';
    end if;

    return query
    select v_plan.editorial_article_id, 'reused'::text;
    return;
  end if;

  if v_plan.status <> 'ready' then
    raise exception 'editorial_dossier_article_plan_not_ready'
      using errcode = '23514';
  end if;

  if btrim(coalesce(v_plan.working_title, '')) = ''
     or btrim(coalesce(v_plan.editorial_instructions, '')) = ''
     or not exists (
       select 1
       from public.newsroom_editorial_dossier_article_plan_sources assignment
       where assignment.article_plan_id = p_article_plan_id
         and assignment.dossier_id = p_dossier_id
     ) then
    raise exception 'editorial_dossier_article_plan_incomplete'
      using errcode = '23514';
  end if;

  v_article_id := pg_catalog.gen_random_uuid();
  v_slug := 'dossier-plan-' || replace(p_article_plan_id::text, '-', '');

  insert into public.editorial_articles (
    id,
    newsroom_article_id,
    title,
    slug,
    status,
    scope,
    subtitle,
    body,
    image_url,
    published_at,
    competition_id,
    season_id,
    matchday_id,
    created_at,
    updated_at
  ) values (
    v_article_id,
    null,
    btrim(v_plan.working_title),
    v_slug,
    'draft',
    'general',
    null,
    '',
    null,
    null,
    null,
    null,
    null,
    v_now,
    v_now
  );

  update public.newsroom_editorial_dossier_article_plans plan
  set editorial_article_id = v_article_id,
      updated_at = v_now
  where plan.id = p_article_plan_id
    and plan.dossier_id = p_dossier_id
    and plan.editorial_article_id is null;

  if not found then
    raise exception 'editorial_dossier_article_plan_draft_link_failed'
      using errcode = '55000';
  end if;

  update public.newsroom_editorial_dossiers dossier
  set updated_at = v_now
  where dossier.id = p_dossier_id;

  return query
  select v_article_id, 'created'::text;
end;
$$;

revoke all on function public.newsroom_create_editorial_dossier_article_plan_draft(
  uuid,
  uuid
) from public, anon, authenticated;

grant execute on function public.newsroom_create_editorial_dossier_article_plan_draft(
  uuid,
  uuid
) to service_role;

comment on column public.newsroom_editorial_dossier_article_plans.editorial_article_id is
  'Unique editorial article created from this ready plan. A non-null value freezes the plan and its source assignments.';

comment on column public.newsroom_editorial_dossier_article_plans.status is
  'Planning lifecycle: planned, ready or cancelled. Converted plans remain ready and are identified by editorial_article_id.';

comment on function public.newsroom_create_editorial_dossier_article_plan_draft(
  uuid,
  uuid
) is
  'Atomically creates or reuses one empty human-written editorial draft from one ready dossier article plan.';

commit;
