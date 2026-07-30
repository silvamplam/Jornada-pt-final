-- Step 35 - minimal hotfix for the compose submission_id ambiguity.
-- CREATE OR REPLACE preserves the existing function owner and object identity.

begin;

create or replace function public.newsroom_prepare_editorial_compose(
  p_submission_id uuid,
  p_request_fingerprint text,
  p_working_title text,
  p_editorial_instructions text,
  p_context_instructions text,
  p_article_kind text,
  p_length_mode text,
  p_output_language text,
  p_newsroom_article_ids uuid[],
  p_newsroom_snapshot_ids uuid[],
  p_source_roles text[],
  p_source_priorities integer[],
  p_source_notes text[]
)
returns table (
  submission_id uuid,
  request_fingerprint text,
  dossier_id uuid,
  article_plan_id uuid,
  editorial_article_id uuid,
  composition_action text,
  generation_status text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.newsroom_editorial_compose_requests%rowtype;
  v_created_count integer;
  v_source_count integer;
  v_index integer;
  v_dossier_id uuid;
  v_plan_id uuid;
  v_article_id uuid;
  v_dossier_source_id uuid;
  v_slug text;
  v_source record;
  v_source_ids uuid[] := array[]::uuid[];
  v_now timestamptz := now();
begin
  if p_submission_id is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or btrim(coalesce(p_working_title, '')) = ''
     or char_length(btrim(p_working_title)) > 180
     or btrim(coalesce(p_editorial_instructions, '')) = ''
     or char_length(p_editorial_instructions) > 12000
     or char_length(coalesce(p_context_instructions, '')) > 8000
     or p_article_kind not in ('news', 'analysis', 'preview', 'summary')
     or p_length_mode not in ('brief', 'standard', 'developed')
     or btrim(coalesce(p_output_language, '')) = ''
     or p_newsroom_article_ids is null
     or p_newsroom_snapshot_ids is null
     or p_source_roles is null
     or p_source_priorities is null
     or p_source_notes is null then
    raise exception 'compose_input_invalid'
      using errcode = '23514';
  end if;

  v_source_count := cardinality(p_newsroom_article_ids);
  if v_source_count < 1
     or v_source_count > 20
     or cardinality(p_newsroom_snapshot_ids) <> v_source_count
     or cardinality(p_source_roles) <> v_source_count
     or cardinality(p_source_priorities) <> v_source_count
     or cardinality(p_source_notes) <> v_source_count
     or exists (
       select 1
       from unnest(p_source_roles) role_value
       where role_value not in ('primary', 'corroboration', 'context', 'complementary')
     )
     or exists (
       select 1
       from unnest(p_source_priorities) priority_value
       where priority_value not between 1 and 99
     )
     or exists (
       select 1
       from unnest(p_source_notes) note_value
       where note_value is not null
         and (btrim(note_value) = '' or char_length(note_value) > 3000)
     )
     or (
       select count(distinct article_id)
       from unnest(p_newsroom_article_ids) article_id
     ) <> v_source_count then
    raise exception 'compose_sources_invalid'
      using errcode = '23514';
  end if;

  insert into public.newsroom_editorial_compose_requests (
    submission_id,
    request_fingerprint,
    generation_status
  ) values (
    p_submission_id,
    p_request_fingerprint,
    'ready'
  )
  on conflict on constraint newsroom_editorial_compose_requests_pkey do nothing;
  get diagnostics v_created_count = row_count;

  select request_row.*
  into v_request
  from public.newsroom_editorial_compose_requests request_row
  where request_row.submission_id = p_submission_id
  for update;

  if v_request.request_fingerprint <> p_request_fingerprint then
    raise exception 'compose_payload_conflict'
      using errcode = '23505';
  end if;

  if v_request.dossier_id is not null then
    if not exists (
      select 1
      from public.newsroom_editorial_dossiers dossier
      join public.newsroom_editorial_dossier_article_plans plan
        on plan.dossier_id = dossier.id
       and plan.id = v_request.article_plan_id
       and plan.editorial_article_id = v_request.editorial_article_id
      join public.editorial_articles article
        on article.id = v_request.editorial_article_id
      where dossier.id = v_request.dossier_id
    ) then
      raise exception 'compose_persisted_state_invalid'
        using errcode = '55000';
    end if;

    return query
    select
      v_request.submission_id,
      v_request.request_fingerprint,
      v_request.dossier_id,
      v_request.article_plan_id,
      v_request.editorial_article_id,
      'reused'::text,
      v_request.generation_status;
    return;
  end if;

  if v_created_count <> 1 then
    raise exception 'compose_request_incomplete'
      using errcode = '55000';
  end if;

  for v_index in 1..v_source_count loop
    select
      article.id,
      article.source_code,
      article.title,
      article.published_at,
      article.processing_status,
      snapshot.id as snapshot_id,
      snapshot.article_id as snapshot_article_id,
      snapshot.body,
      snapshot.source_metadata
    into v_source
    from public.newsroom_articles article
    join public.newsroom_article_snapshots snapshot
      on snapshot.id = p_newsroom_snapshot_ids[v_index]
     and snapshot.article_id = article.id
    where article.id = p_newsroom_article_ids[v_index];

    if not found then
      raise exception 'compose_source_snapshot_not_found'
        using errcode = 'P0002';
    end if;
    if v_source.processing_status not in ('detected', 'normalized', 'ready_for_review')
       or jsonb_typeof(v_source.body) <> 'array'
       or not exists (
         select 1
         from jsonb_array_elements(v_source.body) body_item(value)
         where jsonb_typeof(body_item.value) = 'object'
           and body_item.value ->> 'type' in ('heading', 'paragraph')
           and btrim(coalesce(body_item.value ->> 'text', '')) <> ''
       ) then
      raise exception 'compose_source_not_eligible'
        using errcode = '23514';
    end if;
  end loop;

  v_dossier_id := pg_catalog.gen_random_uuid();
  v_plan_id := pg_catalog.gen_random_uuid();
  v_article_id := pg_catalog.gen_random_uuid();
  v_slug := 'dossier-plan-' || replace(v_plan_id::text, '-', '');

  insert into public.newsroom_editorial_dossiers (
    id,
    title,
    status,
    editorial_instructions,
    context_instructions,
    output_mode,
    output_count,
    length_mode,
    article_kind,
    output_language,
    created_at,
    updated_at
  ) values (
    v_dossier_id,
    btrim(p_working_title),
    'draft',
    btrim(p_editorial_instructions),
    btrim(coalesce(p_context_instructions, '')),
    'single',
    1,
    p_length_mode,
    p_article_kind,
    btrim(p_output_language),
    v_now,
    v_now
  );

  for v_index in 1..v_source_count loop
    select article.title, article.published_at
    into v_source
    from public.newsroom_articles article
    where article.id = p_newsroom_article_ids[v_index];

    v_dossier_source_id := pg_catalog.gen_random_uuid();
    v_source_ids := array_append(v_source_ids, v_dossier_source_id);
    insert into public.newsroom_editorial_dossier_sources (
      id,
      dossier_id,
      newsroom_article_id,
      newsroom_snapshot_id,
      title_snapshot,
      published_at_snapshot,
      source_role,
      sort_order,
      editorial_note,
      included,
      created_at,
      updated_at
    ) values (
      v_dossier_source_id,
      v_dossier_id,
      p_newsroom_article_ids[v_index],
      p_newsroom_snapshot_ids[v_index],
      v_source.title,
      v_source.published_at,
      p_source_roles[v_index],
      p_source_priorities[v_index],
      nullif(btrim(coalesce(p_source_notes[v_index], '')), ''),
      true,
      v_now,
      v_now
    );
  end loop;

  insert into public.newsroom_editorial_dossier_article_plans (
    id,
    dossier_id,
    working_title,
    status,
    sort_order,
    article_kind,
    length_mode,
    editorial_instructions,
    created_at,
    updated_at
  ) values (
    v_plan_id,
    v_dossier_id,
    btrim(p_working_title),
    'ready',
    1,
    p_article_kind,
    p_length_mode,
    btrim(p_editorial_instructions),
    v_now,
    v_now
  );

  for v_index in 1..v_source_count loop
    insert into public.newsroom_editorial_dossier_article_plan_sources (
      id,
      dossier_id,
      article_plan_id,
      dossier_source_id,
      sort_order,
      created_at,
      updated_at
    ) values (
      pg_catalog.gen_random_uuid(),
      v_dossier_id,
      v_plan_id,
      v_source_ids[v_index],
      p_source_priorities[v_index],
      v_now,
      v_now
    );
  end loop;

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
    btrim(p_working_title),
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
  where plan.id = v_plan_id
    and plan.dossier_id = v_dossier_id
    and plan.editorial_article_id is null;

  if not found then
    raise exception 'compose_article_link_failed'
      using errcode = '55000';
  end if;

  update public.newsroom_editorial_compose_requests request_row
  set dossier_id = v_dossier_id,
      article_plan_id = v_plan_id,
      editorial_article_id = v_article_id,
      generation_status = 'ready',
      generation_claim_token = null,
      generation_claimed_at = null,
      last_error_code = null,
      updated_at = v_now
  where request_row.submission_id = p_submission_id
    and request_row.request_fingerprint = p_request_fingerprint;

  if not found then
    raise exception 'compose_request_link_failed'
      using errcode = '55000';
  end if;

  return query
  select
    p_submission_id,
    p_request_fingerprint,
    v_dossier_id,
    v_plan_id,
    v_article_id,
    'created'::text,
    'ready'::text;
end;
$$;

revoke all on function public.newsroom_prepare_editorial_compose(
  uuid, text, text, text, text, text, text, text, uuid[], uuid[], text[], integer[], text[]
) from public, anon, authenticated;
grant execute on function public.newsroom_prepare_editorial_compose(
  uuid, text, text, text, text, text, text, text, uuid[], uuid[], text[], integer[], text[]
) to service_role;

commit;
