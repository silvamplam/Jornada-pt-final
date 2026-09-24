begin;

-- A null key alone cannot distinguish no suggestion from an editor's explicit clear.
-- Keep this state on the plan; canonical articles and publication authority are unchanged.
alter table public.newsroom_editorial_dossier_article_plans
  add column classification_mode text;

-- Before this change every persisted non-null key came from the editor's control.
update public.newsroom_editorial_dossier_article_plans
set classification_mode = 'manual'
where classification_key is not null;

alter table public.newsroom_editorial_dossier_article_plans
  add constraint newsroom_article_plan_classification_decision_check
  check (coalesce(
    (classification_key is null and classification_mode is null)
    or (classification_key is null and classification_mode = 'cleared')
    or (classification_key is not null and classification_mode in ('suggested', 'manual')),
    false
  ));

comment on column public.newsroom_editorial_dossier_article_plans.classification_mode is
  'null: no decision; suggested: untouched manual-source unanimity; manual: editor choice; cleared: explicit empty choice. Suggestions may be recalculated; human decisions persist.';

create or replace function public.newsroom_save_dossier_article_plan_state_v3(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_destination text,
  p_update_target_editorial_article_id uuid,
  p_published_context_ids uuid[],
  p_image_choice text,
  p_dossier_image_id uuid,
  p_classification_key text,
  p_classification_mode text
)
returns table (
  article_plan_id uuid,
  destination text,
  update_target_editorial_article_id uuid,
  published_context_count integer,
  image_choice text,
  dossier_image_id uuid,
  classification_key text,
  classification_mode text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_state record;
begin
  if p_classification_key is not null
    and p_classification_key not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
  then
    raise exception 'production_workspace_article_plan_classification_invalid'
      using errcode = '22023';
  end if;

  if not coalesce(
    (p_classification_key is null and p_classification_mode is null)
    or (p_classification_key is null and p_classification_mode = 'cleared')
    or (p_classification_key is not null and p_classification_mode in ('suggested', 'manual')),
    false
  ) then
    raise exception 'production_workspace_article_plan_classification_invalid'
      using errcode = '22023';
  end if;

  select *
  into strict v_state
  from public.newsroom_save_dossier_article_plan_state_v1(
    p_dossier_id,
    p_article_plan_id,
    p_destination,
    p_update_target_editorial_article_id,
    p_published_context_ids,
    p_image_choice,
    p_dossier_image_id
  );

  update public.newsroom_editorial_dossier_article_plans as plan_row
  set classification_key = p_classification_key,
      classification_mode = p_classification_mode
  where plan_row.dossier_id = p_dossier_id
    and plan_row.id = p_article_plan_id
    and (plan_row.classification_key is distinct from p_classification_key
      or plan_row.classification_mode is distinct from p_classification_mode);

  return query
  select
    v_state.article_plan_id,
    v_state.destination,
    v_state.update_target_editorial_article_id,
    v_state.published_context_count,
    v_state.image_choice,
    v_state.dossier_image_id,
    p_classification_key,
    p_classification_mode;
end;
$function$;

revoke all on function public.newsroom_save_dossier_article_plan_state_v3(
  uuid, uuid, text, uuid, uuid[], text, uuid, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_save_dossier_article_plan_state_v3(
  uuid, uuid, text, uuid, uuid[], text, uuid, text, text
) to service_role;

-- Retain the old RPC signature for older clients; its explicit values are human choices.
create or replace function public.newsroom_save_dossier_article_plan_state_v2(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_destination text,
  p_update_target_editorial_article_id uuid,
  p_published_context_ids uuid[],
  p_image_choice text,
  p_dossier_image_id uuid,
  p_classification_key text
)
returns table (
  article_plan_id uuid,
  destination text,
  update_target_editorial_article_id uuid,
  published_context_count integer,
  image_choice text,
  dossier_image_id uuid,
  classification_key text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  return query
  select saved.article_plan_id, saved.destination, saved.update_target_editorial_article_id,
    saved.published_context_count, saved.image_choice, saved.dossier_image_id, saved.classification_key
  from public.newsroom_save_dossier_article_plan_state_v3(
    p_dossier_id, p_article_plan_id, p_destination, p_update_target_editorial_article_id,
    p_published_context_ids, p_image_choice, p_dossier_image_id, p_classification_key,
    case when p_classification_key is null then 'cleared' else 'manual' end
  ) as saved;
end;
$function$;

create or replace function public.newsroom_guard_published_article_plan_classification_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if (new.classification_key is distinct from old.classification_key
      or new.classification_mode is distinct from old.classification_mode)
    and (
      old.editorial_article_id is not null
      or exists (
        select 1
        from public.newsroom_mesa_output_publications as publication
        where publication.dossier_id = old.dossier_id
          and publication.article_plan_id = old.id
      )
    )
  then
    raise exception 'article_plan_classification_already_published'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists newsroom_guard_published_article_plan_classification_v1
  on public.newsroom_editorial_dossier_article_plans;
create trigger newsroom_guard_published_article_plan_classification_v1
before update of classification_key, classification_mode
on public.newsroom_editorial_dossier_article_plans
for each row execute function public.newsroom_guard_published_article_plan_classification_v1();

-- The existing publication transaction still freezes the final decision and applies it to Bank.
create or replace function public.newsroom_freeze_output_classification_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_plan public.newsroom_editorial_dossier_article_plans%rowtype;
  v_manifest jsonb;
  v_output jsonb;
  v_classification_key text := nullif(
    pg_catalog.lower(
      pg_catalog.btrim(
        pg_catalog.current_setting(
          'jornada.output_classification_key',
          true
        )
      )
    ),
    ''
  );
  v_fingerprint text;
begin
  select *
  into v_plan
  from public.newsroom_editorial_dossier_article_plans as plan_row
  where plan_row.dossier_id = new.dossier_id
    and plan_row.id = new.article_plan_id
  for update;

  if not found then
    raise exception 'mesa-publication-output-invalid'
      using errcode = '23514';
  end if;
  if v_classification_key is null
    or v_classification_key not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
  then
    raise exception 'mesa-publication-classification-required'
      using errcode = '23514';
  end if;

  select package_row.manifest
  into v_manifest
  from public.newsroom_editorial_source_packages as package_row
  where package_row.id = new.package_id
  for share;

  select output_row.value
  into v_output
  from pg_catalog.jsonb_array_elements(
    coalesce(v_manifest -> 'outputs', '[]'::jsonb)
  ) as output_row(value)
  where output_row.value ->> 'outputId' = new.article_plan_id::text;

  if not found then
    raise exception 'mesa-publication-package-invalid'
      using errcode = '23514';
  end if;

  v_fingerprint := pg_catalog.encode(
    pg_catalog.sha256(
      pg_catalog.convert_to(
        pg_catalog.jsonb_build_object(
          'dossierId', new.dossier_id,
          'articlePlanId', new.article_plan_id,
          'packageId', new.package_id,
          'publicationFingerprint', new.fingerprint,
          'classificationKey', v_classification_key
        )::text,
        'UTF8'
      )
    ),
    'hex'
  );

  update public.newsroom_editorial_dossier_article_plans as plan_row
  set classification_key = v_classification_key,
      classification_mode = 'manual'
  where plan_row.dossier_id = new.dossier_id
    and plan_row.id = new.article_plan_id
    and (plan_row.classification_key is distinct from v_classification_key
      or plan_row.classification_mode is distinct from 'manual');

  new.classification_key := v_classification_key;
  new.classification_fingerprint := v_fingerprint;
  new.payload := pg_catalog.jsonb_set(
    pg_catalog.jsonb_set(
      pg_catalog.jsonb_set(
        new.payload,
        '{article,classificationKey}',
        pg_catalog.to_jsonb(v_classification_key),
        true
      ),
      '{classificationKey}',
      pg_catalog.to_jsonb(v_classification_key),
      true
    ),
    '{classificationFingerprint}',
    pg_catalog.to_jsonb(v_fingerprint),
    true
  );
  return new;
end;
$function$;

commit;
