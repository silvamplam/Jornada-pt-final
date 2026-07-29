-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-RASCUNHO-GERACAO-CONTROLADA-1
-- SQL 4/4 — SMOKE TEST TRANSACIONAL COM ROLLBACK
-- Valida aplicação única, reutilização, auditoria, snapshot e proteção de texto humano.

begin;

do $$
declare
  v_snapshot_one record;
  v_snapshot_two record;
  v_dossier_id uuid;
  v_source_one uuid;
  v_source_two uuid;
  v_plan_id uuid;
  v_conflict_plan_id uuid;
  v_human_plan_id uuid;
  v_article_id uuid;
  v_conflict_article_id uuid;
  v_human_article_id uuid;
  v_article_updated_at timestamptz;
  v_conflict_updated_at timestamptz;
  v_human_updated_at timestamptz;
  v_input_snapshot jsonb;
  v_conflict_snapshot jsonb;
  v_human_snapshot jsonb;
  v_generation_id uuid;
  v_reused_generation_id uuid;
  v_generation_action text;
  v_reused_action text;
  v_generated_body text :=
    'O primeiro parágrafo reúne os factos principais presentes nas fontes congeladas e respeita a orientação editorial definida. '
    || 'O segundo parágrafo distingue os contextos sem acrescentar dados, declarações ou conclusões que não estejam sustentadas.';
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
    where jsonb_array_length(snapshot.body) > 0
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
    where jsonb_array_length(snapshot.body) > 0
    order by snapshot.article_id, snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
  ) candidate
  where candidate.article_id <> v_snapshot_one.article_id
  order by candidate.extracted_at desc, candidate.created_at desc, candidate.id desc
  limit 1;

  if v_snapshot_one.id is null or v_snapshot_two.id is null then
    raise exception 'smoke_requires_two_distinct_usable_newsroom_articles'
      using errcode = '55000';
  end if;

  insert into public.newsroom_editorial_dossiers (
    title,
    editorial_instructions,
    context_instructions,
    output_mode,
    output_count,
    length_mode,
    article_kind,
    output_language
  ) values (
    'Smoke geração controlada',
    'Hierarquizar a informação principal sem misturar os dois contextos.',
    'Introduzir apenas o enquadramento explicitamente fornecido.',
    'multiple',
    3,
    'developed',
    'analysis',
    'pt-PT'
  )
  returning id into v_dossier_id;

  insert into public.newsroom_editorial_dossier_sources (
    dossier_id,
    newsroom_article_id,
    newsroom_snapshot_id,
    source_role,
    sort_order,
    editorial_note,
    included
  ) values (
    v_dossier_id,
    v_snapshot_one.article_id,
    v_snapshot_one.id,
    'primary',
    10,
    'Fonte principal do smoke.',
    true
  )
  returning id into v_source_one;

  insert into public.newsroom_editorial_dossier_sources (
    dossier_id,
    newsroom_article_id,
    newsroom_snapshot_id,
    source_role,
    sort_order,
    editorial_note,
    included
  ) values (
    v_dossier_id,
    v_snapshot_two.article_id,
    v_snapshot_two.id,
    'context',
    20,
    'Fonte de contexto do smoke.',
    true
  )
  returning id into v_source_two;

  select saved.article_plan_id
  into v_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    null,
    'Título humano fixo do smoke',
    'ready',
    10,
    'analysis',
    'developed',
    'Usar apenas as duas fontes congeladas e distinguir claramente os contextos.',
    array[v_source_two, v_source_one]
  ) saved;

  select created.editorial_article_id
  into v_article_id
  from public.newsroom_create_editorial_dossier_article_plan_draft(
    v_dossier_id,
    v_plan_id
  ) created;

  select article.updated_at
  into v_article_updated_at
  from public.editorial_articles article
  where article.id = v_article_id;

  select jsonb_build_object(
    'version', 1,
    'dossier', jsonb_build_object(
      'id', dossier.id,
      'title', btrim(dossier.title),
      'editorial_instructions', btrim(dossier.editorial_instructions),
      'context_instructions', btrim(dossier.context_instructions),
      'output_language', btrim(dossier.output_language)
    ),
    'plan', jsonb_build_object(
      'id', plan.id,
      'working_title', btrim(plan.working_title),
      'article_kind', plan.article_kind,
      'length_mode', plan.length_mode,
      'editorial_instructions', btrim(plan.editorial_instructions)
    ),
    'sources', (
      select jsonb_agg(
        jsonb_build_object(
          'dossier_source_id', dossier_source.id,
          'newsroom_article_id', dossier_source.newsroom_article_id,
          'newsroom_snapshot_id', dossier_source.newsroom_snapshot_id,
          'source_code', newsroom_article.source_code,
          'article_title', btrim(newsroom_article.title),
          'source_role', dossier_source.source_role,
          'sort_order', assignment.sort_order,
          'editorial_note', nullif(btrim(coalesce(dossier_source.editorial_note, '')), ''),
          'content_hash', snapshot.content_hash
        )
        order by assignment.sort_order asc, assignment.id asc
      )
      from public.newsroom_editorial_dossier_article_plan_sources assignment
      join public.newsroom_editorial_dossier_sources dossier_source
        on dossier_source.id = assignment.dossier_source_id
       and dossier_source.dossier_id = assignment.dossier_id
      join public.newsroom_articles newsroom_article
        on newsroom_article.id = dossier_source.newsroom_article_id
      join public.newsroom_article_snapshots snapshot
        on snapshot.id = dossier_source.newsroom_snapshot_id
       and snapshot.article_id = dossier_source.newsroom_article_id
      where assignment.dossier_id = v_dossier_id
        and assignment.article_plan_id = v_plan_id
    )
  )
  into v_input_snapshot
  from public.newsroom_editorial_dossiers dossier
  join public.newsroom_editorial_dossier_article_plans plan
    on plan.dossier_id = dossier.id
  where dossier.id = v_dossier_id
    and plan.id = v_plan_id;

  select applied.generation_id, applied.generation_action
  into v_generation_id, v_generation_action
  from public.newsroom_apply_editorial_dossier_article_plan_generation(
    v_dossier_id,
    v_plan_id,
    v_article_id,
    v_article_updated_at,
    v_generated_body,
    'openai',
    'smoke-model',
    'dossier-article-plan-body-v1',
    'resp_smoke',
    repeat('a', 64),
    v_input_snapshot,
    100,
    80,
    180
  ) applied;

  if v_generation_id is null or v_generation_action <> 'applied' then
    raise exception 'smoke_generation_apply_failed'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.editorial_articles article
    where article.id = v_article_id
      and article.status = 'draft'
      and article.body = v_generated_body
      and article.published_at is null
  ) then
    raise exception 'smoke_generated_body_not_applied_to_draft'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_generations generation
    where generation.id = v_generation_id
      and generation.dossier_id = v_dossier_id
      and generation.article_plan_id = v_plan_id
      and generation.editorial_article_id = v_article_id
      and generation.provider = 'openai'
      and generation.model = 'smoke-model'
      and generation.prompt_version = 'dossier-article-plan-body-v1'
      and generation.provider_response_id = 'resp_smoke'
      and generation.input_hash = repeat('a', 64)
      and generation.input_snapshot = v_input_snapshot
      and generation.generated_body = v_generated_body
      and generation.input_tokens = 100
      and generation.output_tokens = 80
      and generation.total_tokens = 180
  ) then
    raise exception 'smoke_generation_audit_invalid'
      using errcode = '55000';
  end if;

  select reused.generation_id, reused.generation_action
  into v_reused_generation_id, v_reused_action
  from public.newsroom_apply_editorial_dossier_article_plan_generation(
    v_dossier_id,
    v_plan_id,
    v_article_id,
    v_article_updated_at,
    v_generated_body || ' Esta segunda resposta não pode substituir a primeira.',
    'openai',
    'another-model',
    'another-prompt',
    null,
    repeat('b', 64),
    v_input_snapshot,
    null,
    null,
    null
  ) reused;

  if v_reused_generation_id <> v_generation_id or v_reused_action <> 'reused' then
    raise exception 'smoke_generation_reuse_failed'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.newsroom_editorial_dossier_article_plan_generations generation
    where generation.article_plan_id = v_plan_id
  ) <> 1 then
    raise exception 'smoke_duplicate_generation_created'
      using errcode = '55000';
  end if;

  if (
    select article.body
    from public.editorial_articles article
    where article.id = v_article_id
  ) <> v_generated_body then
    raise exception 'smoke_reuse_replaced_generated_body'
      using errcode = '55000';
  end if;

  select saved.article_plan_id
  into v_conflict_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    null,
    'Plano para conflito de snapshot',
    'ready',
    20,
    'news',
    'standard',
    'Validar que a proveniência não pode ser alterada.',
    array[v_source_one]
  ) saved;

  select created.editorial_article_id
  into v_conflict_article_id
  from public.newsroom_create_editorial_dossier_article_plan_draft(
    v_dossier_id,
    v_conflict_plan_id
  ) created;

  select article.updated_at
  into v_conflict_updated_at
  from public.editorial_articles article
  where article.id = v_conflict_article_id;

  select jsonb_build_object(
    'version', 1,
    'dossier', jsonb_build_object(
      'id', dossier.id,
      'title', btrim(dossier.title),
      'editorial_instructions', btrim(dossier.editorial_instructions),
      'context_instructions', btrim(dossier.context_instructions),
      'output_language', btrim(dossier.output_language)
    ),
    'plan', jsonb_build_object(
      'id', plan.id,
      'working_title', btrim(plan.working_title),
      'article_kind', plan.article_kind,
      'length_mode', plan.length_mode,
      'editorial_instructions', btrim(plan.editorial_instructions)
    ),
    'sources', (
      select jsonb_agg(
        jsonb_build_object(
          'dossier_source_id', dossier_source.id,
          'newsroom_article_id', dossier_source.newsroom_article_id,
          'newsroom_snapshot_id', dossier_source.newsroom_snapshot_id,
          'source_code', newsroom_article.source_code,
          'article_title', btrim(newsroom_article.title),
          'source_role', dossier_source.source_role,
          'sort_order', assignment.sort_order,
          'editorial_note', nullif(btrim(coalesce(dossier_source.editorial_note, '')), ''),
          'content_hash', snapshot.content_hash
        )
        order by assignment.sort_order asc, assignment.id asc
      )
      from public.newsroom_editorial_dossier_article_plan_sources assignment
      join public.newsroom_editorial_dossier_sources dossier_source
        on dossier_source.id = assignment.dossier_source_id
       and dossier_source.dossier_id = assignment.dossier_id
      join public.newsroom_articles newsroom_article
        on newsroom_article.id = dossier_source.newsroom_article_id
      join public.newsroom_article_snapshots snapshot
        on snapshot.id = dossier_source.newsroom_snapshot_id
       and snapshot.article_id = dossier_source.newsroom_article_id
      where assignment.dossier_id = v_dossier_id
        and assignment.article_plan_id = v_conflict_plan_id
    )
  )
  into v_conflict_snapshot
  from public.newsroom_editorial_dossiers dossier
  join public.newsroom_editorial_dossier_article_plans plan
    on plan.dossier_id = dossier.id
  where dossier.id = v_dossier_id
    and plan.id = v_conflict_plan_id;

  begin
    perform applied.generation_id
    from public.newsroom_apply_editorial_dossier_article_plan_generation(
      v_dossier_id,
      v_conflict_plan_id,
      v_conflict_article_id,
      v_conflict_updated_at,
      v_generated_body,
      'openai',
      'smoke-model',
      'dossier-article-plan-body-v1',
      null,
      repeat('c', 64),
      jsonb_set(
        v_conflict_snapshot,
        '{plan,working_title}',
        to_jsonb('Título adulterado'::text)
      ),
      null,
      null,
      null
    ) applied;

    raise exception 'smoke_snapshot_conflict_was_not_blocked'
      using errcode = '55000';
  exception
    when object_not_in_prerequisite_state then
      null;
  end;

  if (
    select btrim(coalesce(article.body, ''))
    from public.editorial_articles article
    where article.id = v_conflict_article_id
  ) <> '' then
    raise exception 'smoke_snapshot_conflict_changed_draft'
      using errcode = '55000';
  end if;

  select saved.article_plan_id
  into v_human_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    v_dossier_id,
    null,
    'Plano com texto humano',
    'ready',
    30,
    'summary',
    'brief',
    'Não substituir texto escrito por uma pessoa.',
    array[v_source_two]
  ) saved;

  select created.editorial_article_id
  into v_human_article_id
  from public.newsroom_create_editorial_dossier_article_plan_draft(
    v_dossier_id,
    v_human_plan_id
  ) created;

  update public.editorial_articles article
  set body = 'Texto humano já existente no rascunho.',
      updated_at = now()
  where article.id = v_human_article_id
  returning article.updated_at into v_human_updated_at;

  select jsonb_build_object(
    'version', 1,
    'dossier', jsonb_build_object(
      'id', dossier.id,
      'title', btrim(dossier.title),
      'editorial_instructions', btrim(dossier.editorial_instructions),
      'context_instructions', btrim(dossier.context_instructions),
      'output_language', btrim(dossier.output_language)
    ),
    'plan', jsonb_build_object(
      'id', plan.id,
      'working_title', btrim(plan.working_title),
      'article_kind', plan.article_kind,
      'length_mode', plan.length_mode,
      'editorial_instructions', btrim(plan.editorial_instructions)
    ),
    'sources', (
      select jsonb_agg(
        jsonb_build_object(
          'dossier_source_id', dossier_source.id,
          'newsroom_article_id', dossier_source.newsroom_article_id,
          'newsroom_snapshot_id', dossier_source.newsroom_snapshot_id,
          'source_code', newsroom_article.source_code,
          'article_title', btrim(newsroom_article.title),
          'source_role', dossier_source.source_role,
          'sort_order', assignment.sort_order,
          'editorial_note', nullif(btrim(coalesce(dossier_source.editorial_note, '')), ''),
          'content_hash', snapshot.content_hash
        )
        order by assignment.sort_order asc, assignment.id asc
      )
      from public.newsroom_editorial_dossier_article_plan_sources assignment
      join public.newsroom_editorial_dossier_sources dossier_source
        on dossier_source.id = assignment.dossier_source_id
       and dossier_source.dossier_id = assignment.dossier_id
      join public.newsroom_articles newsroom_article
        on newsroom_article.id = dossier_source.newsroom_article_id
      join public.newsroom_article_snapshots snapshot
        on snapshot.id = dossier_source.newsroom_snapshot_id
       and snapshot.article_id = dossier_source.newsroom_article_id
      where assignment.dossier_id = v_dossier_id
        and assignment.article_plan_id = v_human_plan_id
    )
  )
  into v_human_snapshot
  from public.newsroom_editorial_dossiers dossier
  join public.newsroom_editorial_dossier_article_plans plan
    on plan.dossier_id = dossier.id
  where dossier.id = v_dossier_id
    and plan.id = v_human_plan_id;

  begin
    perform applied.generation_id
    from public.newsroom_apply_editorial_dossier_article_plan_generation(
      v_dossier_id,
      v_human_plan_id,
      v_human_article_id,
      v_human_updated_at,
      v_generated_body,
      'openai',
      'smoke-model',
      'dossier-article-plan-body-v1',
      null,
      repeat('d', 64),
      v_human_snapshot,
      null,
      null,
      null
    ) applied;

    raise exception 'smoke_human_body_was_not_protected'
      using errcode = '55000';
  exception
    when object_not_in_prerequisite_state then
      null;
  end;

  if (
    select article.body
    from public.editorial_articles article
    where article.id = v_human_article_id
  ) <> 'Texto humano já existente no rascunho.' then
    raise exception 'smoke_human_body_changed'
      using errcode = '55000';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-RASCUNHO-GERACAO-CONTROLADA-1',
  'smoke_ok', true,
  'first_generation_applied', true,
  'generation_reused', true,
  'single_generation_per_plan', true,
  'audit_preserved', true,
  'snapshot_conflict_blocked', true,
  'human_body_protected', true,
  'article_status_after_generation', 'draft',
  'persistent_writes', false
) as smoke_result;

rollback;
