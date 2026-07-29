-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-RASCUNHO-GERACAO-CONTROLADA-1
-- SQL 2/4 — APLICAÇÃO PERSISTENTE MANUAL
-- Regista uma única primeira geração auditável e aplica-a apenas a um rascunho vazio.

begin;

create table public.newsroom_editorial_dossier_article_plan_generations (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  article_plan_id uuid not null,
  editorial_article_id uuid not null,
  provider text not null,
  model text not null,
  prompt_version text not null,
  provider_response_id text,
  input_hash text not null,
  input_snapshot jsonb not null,
  generated_body text not null,
  input_tokens integer,
  output_tokens integer,
  total_tokens integer,
  created_at timestamptz not null default now(),
  constraint newsroom_editorial_dossier_article_plan_generations_plan_identity_fkey
    foreign key (dossier_id, article_plan_id)
    references public.newsroom_editorial_dossier_article_plans(dossier_id, id)
    on delete cascade,
  constraint newsroom_editorial_dossier_article_plan_generations_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete restrict,
  constraint newsroom_editorial_dossier_article_plan_generations_plan_key
    unique (article_plan_id),
  constraint newsroom_editorial_dossier_article_plan_generations_article_key
    unique (editorial_article_id),
  constraint newsroom_editorial_dossier_article_plan_generations_provider_not_blank
    check (btrim(provider) <> '' and char_length(provider) <= 80),
  constraint newsroom_editorial_dossier_article_plan_generations_model_not_blank
    check (btrim(model) <> '' and char_length(model) <= 160),
  constraint newsroom_editorial_dossier_article_plan_generations_prompt_not_blank
    check (btrim(prompt_version) <> '' and char_length(prompt_version) <= 120),
  constraint newsroom_editorial_dossier_article_plan_generations_response_not_blank
    check (
      provider_response_id is null
      or (btrim(provider_response_id) <> '' and char_length(provider_response_id) <= 240)
    ),
  constraint newsroom_editorial_dossier_article_plan_generations_input_hash_check
    check (input_hash ~ '^[0-9a-f]{64}$'),
  constraint newsroom_editorial_dossier_article_plan_generations_input_snapshot_check
    check (
      jsonb_typeof(input_snapshot) = 'object'
      and input_snapshot ->> 'version' = '1'
      and jsonb_typeof(input_snapshot -> 'sources') = 'array'
    ),
  constraint newsroom_editorial_dossier_article_plan_generations_body_check
    check (
      btrim(generated_body) <> ''
      and char_length(generated_body) between 80 and 30000
    ),
  constraint newsroom_editorial_dossier_article_plan_generations_tokens_check
    check (
      (input_tokens is null or input_tokens >= 0)
      and (output_tokens is null or output_tokens >= 0)
      and (total_tokens is null or total_tokens >= 0)
    )
);

create index newsroom_editorial_dossier_article_plan_generations_dossier_created_idx
  on public.newsroom_editorial_dossier_article_plan_generations (
    dossier_id,
    created_at desc,
    id desc
  );

alter table public.newsroom_editorial_dossier_article_plan_generations
  enable row level security;
alter table public.newsroom_editorial_dossier_article_plan_generations
  force row level security;

revoke all privileges
  on table public.newsroom_editorial_dossier_article_plan_generations
  from public, anon, authenticated;

grant select, insert
  on table public.newsroom_editorial_dossier_article_plan_generations
  to service_role;

create function public.newsroom_apply_editorial_dossier_article_plan_generation(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_editorial_article_id uuid,
  p_expected_article_updated_at timestamptz,
  p_generated_body text,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_provider_response_id text,
  p_input_hash text,
  p_input_snapshot jsonb,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer
)
returns table(
  generation_id uuid,
  editorial_article_id uuid,
  generation_action text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_plan record;
  v_article record;
  v_dossier record;
  v_existing_generation record;
  v_input_snapshot jsonb;
  v_generation_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := now();
begin
  if p_dossier_id is null
     or p_article_plan_id is null
     or p_editorial_article_id is null
     or p_expected_article_updated_at is null then
    raise exception 'editorial_dossier_generation_input_invalid'
      using errcode = '23514';
  end if;

  if btrim(coalesce(p_generated_body, '')) = ''
     or char_length(btrim(p_generated_body)) not between 80 and 30000 then
    raise exception 'editorial_dossier_generation_body_invalid'
      using errcode = '23514';
  end if;

  if btrim(coalesce(p_provider, '')) = ''
     or char_length(btrim(p_provider)) > 80
     or btrim(coalesce(p_model, '')) = ''
     or char_length(btrim(p_model)) > 160
     or btrim(coalesce(p_prompt_version, '')) = ''
     or char_length(btrim(p_prompt_version)) > 120
     or (
       p_provider_response_id is not null
       and (
         btrim(p_provider_response_id) = ''
         or char_length(btrim(p_provider_response_id)) > 240
       )
     )
     or coalesce(p_input_hash, '') !~ '^[0-9a-f]{64}$'
     or jsonb_typeof(p_input_snapshot) <> 'object' then
    raise exception 'editorial_dossier_generation_metadata_invalid'
      using errcode = '23514';
  end if;

  if (p_input_tokens is not null and p_input_tokens < 0)
     or (p_output_tokens is not null and p_output_tokens < 0)
     or (p_total_tokens is not null and p_total_tokens < 0) then
    raise exception 'editorial_dossier_generation_usage_invalid'
      using errcode = '23514';
  end if;

  select
    plan.id,
    plan.dossier_id,
    plan.status,
    plan.working_title,
    plan.article_kind,
    plan.length_mode,
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

  if v_plan.status <> 'ready'
     or v_plan.editorial_article_id is distinct from p_editorial_article_id then
    raise exception 'editorial_dossier_generation_plan_invalid'
      using errcode = '23514';
  end if;

  select
    generation.id,
    generation.editorial_article_id
  into v_existing_generation
  from public.newsroom_editorial_dossier_article_plan_generations generation
  where generation.dossier_id = p_dossier_id
    and generation.article_plan_id = p_article_plan_id
  limit 1;

  if found then
    if v_existing_generation.editorial_article_id is distinct from p_editorial_article_id then
      raise exception 'editorial_dossier_generation_link_conflict'
        using errcode = '55000';
    end if;

    return query
    select
      v_existing_generation.id,
      v_existing_generation.editorial_article_id,
      'reused'::text;
    return;
  end if;

  select
    article.id,
    article.status,
    article.body,
    article.updated_at
  into v_article
  from public.editorial_articles article
  where article.id = p_editorial_article_id
  for update;

  if not found
     or v_article.status <> 'draft'
     or btrim(coalesce(v_article.body, '')) <> ''
     or v_article.updated_at is distinct from p_expected_article_updated_at then
    raise exception 'editorial_dossier_generation_article_conflict'
      using errcode = '55000';
  end if;

  select
    dossier.id,
    dossier.title,
    dossier.editorial_instructions,
    dossier.context_instructions,
    dossier.output_language
  into v_dossier
  from public.newsroom_editorial_dossiers dossier
  where dossier.id = p_dossier_id;

  if not found then
    raise exception 'editorial_dossier_not_found'
      using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'version', 1,
    'dossier', jsonb_build_object(
      'id', v_dossier.id,
      'title', btrim(v_dossier.title),
      'editorial_instructions', btrim(v_dossier.editorial_instructions),
      'context_instructions', btrim(v_dossier.context_instructions),
      'output_language', btrim(v_dossier.output_language)
    ),
    'plan', jsonb_build_object(
      'id', v_plan.id,
      'working_title', btrim(v_plan.working_title),
      'article_kind', v_plan.article_kind,
      'length_mode', v_plan.length_mode,
      'editorial_instructions', btrim(v_plan.editorial_instructions)
    ),
    'sources', coalesce(
      (
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
        where assignment.dossier_id = p_dossier_id
          and assignment.article_plan_id = p_article_plan_id
      ),
      '[]'::jsonb
    )
  )
  into v_input_snapshot;

  if jsonb_array_length(v_input_snapshot -> 'sources') < 1
     or p_input_snapshot is distinct from v_input_snapshot then
    raise exception 'editorial_dossier_generation_snapshot_conflict'
      using errcode = '55000';
  end if;

  insert into public.newsroom_editorial_dossier_article_plan_generations (
    id,
    dossier_id,
    article_plan_id,
    editorial_article_id,
    provider,
    model,
    prompt_version,
    provider_response_id,
    input_hash,
    input_snapshot,
    generated_body,
    input_tokens,
    output_tokens,
    total_tokens,
    created_at
  ) values (
    v_generation_id,
    p_dossier_id,
    p_article_plan_id,
    p_editorial_article_id,
    btrim(p_provider),
    btrim(p_model),
    btrim(p_prompt_version),
    nullif(btrim(coalesce(p_provider_response_id, '')), ''),
    p_input_hash,
    v_input_snapshot,
    btrim(p_generated_body),
    p_input_tokens,
    p_output_tokens,
    p_total_tokens,
    v_now
  );

  update public.editorial_articles article
  set body = btrim(p_generated_body),
      updated_at = v_now
  where article.id = p_editorial_article_id
    and article.status = 'draft'
    and btrim(coalesce(article.body, '')) = ''
    and article.updated_at = p_expected_article_updated_at;

  if not found then
    raise exception 'editorial_dossier_generation_article_conflict'
      using errcode = '55000';
  end if;

  update public.newsroom_editorial_dossiers dossier
  set updated_at = v_now
  where dossier.id = p_dossier_id;

  return query
  select
    v_generation_id,
    p_editorial_article_id,
    'applied'::text;
end;
$$;

revoke all on function public.newsroom_apply_editorial_dossier_article_plan_generation(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer
) from public, anon, authenticated;

grant execute on function public.newsroom_apply_editorial_dossier_article_plan_generation(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer
) to service_role;

comment on table public.newsroom_editorial_dossier_article_plan_generations is
  'Audit record of the single first generated body applied to a dossier article-plan draft.';

comment on column public.newsroom_editorial_dossier_article_plan_generations.input_snapshot is
  'Canonical snapshot of dossier, plan and frozen-source provenance used by the generation.';

comment on column public.newsroom_editorial_dossier_article_plan_generations.generated_body is
  'Original generated body preserved even if the human editor later changes the editorial article.';

comment on function public.newsroom_apply_editorial_dossier_article_plan_generation(
  uuid,
  uuid,
  uuid,
  timestamptz,
  text,
  text,
  text,
  text,
  text,
  text,
  jsonb,
  integer,
  integer,
  integer
) is
  'Atomically records and applies one first generation only when the linked editorial draft remains empty and unchanged.';

commit;
