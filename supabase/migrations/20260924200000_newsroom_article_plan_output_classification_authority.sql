begin;

alter table public.newsroom_editorial_dossier_article_plans
  add column if not exists classification_key text;

alter table public.newsroom_editorial_dossier_article_plans
  drop constraint if exists newsroom_editorial_dossier_article_plans_classification_key_check;

alter table public.newsroom_editorial_dossier_article_plans
  add constraint newsroom_editorial_dossier_article_plans_classification_key_check
  check (
    classification_key is null
    or classification_key in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
  );

comment on column public.newsroom_editorial_dossier_article_plans.classification_key is
  'Optional pre-publication classification suggestion. Final authority is frozen on newsroom_mesa_output_publications when the editor publishes the output.';

alter table public.newsroom_mesa_output_publications
  add column if not exists classification_key text,
  add column if not exists classification_fingerprint text;

alter table public.newsroom_mesa_output_publications
  drop constraint if exists newsroom_mesa_output_publications_classification_check;

alter table public.newsroom_mesa_output_publications
  add constraint newsroom_mesa_output_publications_classification_check
  check (
    (classification_key is null and classification_fingerprint is null)
    or (
      classification_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
      and classification_fingerprint ~ '^[0-9a-f]{64}$'
    )
  );

comment on column public.newsroom_mesa_output_publications.classification_key is
  'Classification frozen at the successful output publication boundary. Legacy rows remain null.';
comment on column public.newsroom_mesa_output_publications.classification_fingerprint is
  'SHA-256 authority fingerprint over the existing publication provenance fingerprint and the final editorial classification. Legacy rows remain null.';

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
  set classification_key = p_classification_key
  where plan_row.dossier_id = p_dossier_id
    and plan_row.id = p_article_plan_id
    and plan_row.classification_key is distinct from p_classification_key;

  return query
  select
    v_state.article_plan_id,
    v_state.destination,
    v_state.update_target_editorial_article_id,
    v_state.published_context_count,
    v_state.image_choice,
    v_state.dossier_image_id,
    p_classification_key;
end;
$function$;

revoke all on function public.newsroom_save_dossier_article_plan_state_v2(
  uuid, uuid, text, uuid, uuid[], text, uuid, text
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_save_dossier_article_plan_state_v2(
  uuid, uuid, text, uuid, uuid[], text, uuid, text
) to service_role;

create or replace function public.newsroom_guard_published_article_plan_classification_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.classification_key is distinct from old.classification_key
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
before update of classification_key
on public.newsroom_editorial_dossier_article_plans
for each row
execute function public.newsroom_guard_published_article_plan_classification_v1();

revoke all on function public.newsroom_guard_published_article_plan_classification_v1()
from public, anon, authenticated, service_role;

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
  set classification_key = v_classification_key
  where plan_row.dossier_id = new.dossier_id
    and plan_row.id = new.article_plan_id
    and plan_row.classification_key is distinct from v_classification_key;

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

drop trigger if exists newsroom_output_classification_freeze_v1
  on public.newsroom_mesa_output_publications;
create trigger newsroom_output_classification_freeze_v1
before insert
on public.newsroom_mesa_output_publications
for each row
execute function public.newsroom_freeze_output_classification_v1();

revoke all on function public.newsroom_freeze_output_classification_v1()
from public, anon, authenticated, service_role;

create or replace function public.newsroom_guard_frozen_output_classification_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.classification_key is distinct from old.classification_key
    or new.classification_fingerprint is distinct from old.classification_fingerprint
  then
    raise exception 'mesa-publication-classification-already-frozen'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

drop trigger if exists newsroom_guard_frozen_output_classification_v1
  on public.newsroom_mesa_output_publications;
create trigger newsroom_guard_frozen_output_classification_v1
before update of classification_key, classification_fingerprint
on public.newsroom_mesa_output_publications
for each row
execute function public.newsroom_guard_frozen_output_classification_v1();

revoke all on function public.newsroom_guard_frozen_output_classification_v1()
from public, anon, authenticated, service_role;

create or replace function public.newsroom_publish_mesa_output_v3(
  p_dossier_id uuid,
  p_output_id uuid,
  p_package_id uuid,
  p_dossier_source_ids uuid[],
  p_article jsonb,
  p_classification_key text
)
returns table(
  editorial_article_id uuid,
  article_slug text,
  publication_action text,
  consolidated boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result record;
  v_frozen_classification_key text;
begin
  if p_classification_key is null
    or p_classification_key not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
    or p_article ->> 'classificationKey'
      is distinct from p_classification_key
  then
    raise exception 'mesa-publication-classification-required'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'jornada.output_classification_key',
    p_classification_key,
    true
  );

  select *
  into strict v_result
  from public.newsroom_publish_mesa_output_v2(
    p_dossier_id,
    p_output_id,
    p_package_id,
    p_dossier_source_ids,
    p_article
  );

  perform pg_catalog.set_config(
    'jornada.output_classification_key',
    '',
    true
  );

  select publication.classification_key
  into v_frozen_classification_key
  from public.newsroom_mesa_output_publications as publication
  where publication.dossier_id = p_dossier_id
    and publication.article_plan_id = p_output_id
  for share;

  if not found
    or v_frozen_classification_key is distinct from p_classification_key
  then
    raise exception 'mesa-publication-provenance-conflict'
      using errcode = '23514';
  end if;

  return query
  select
    v_result.editorial_article_id,
    v_result.article_slug,
    v_result.publication_action,
    v_result.consolidated;
end;
$function$;

revoke all on function public.newsroom_publish_mesa_output_v3(
  uuid, uuid, uuid, uuid[], jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_publish_mesa_output_v3(
  uuid, uuid, uuid, uuid[], jsonb, text
) to service_role;
revoke execute on function public.newsroom_publish_mesa_output_v2(
  uuid, uuid, uuid, uuid[], jsonb
) from service_role;

create or replace function public.newsroom_publish_mesa_intent_output_v2(
  p_dossier_id uuid,
  p_output_id uuid,
  p_package_id uuid,
  p_dossier_source_ids uuid[],
  p_article jsonb,
  p_classification_key text
)
returns table(
  editorial_article_id uuid,
  article_slug text,
  publication_action text,
  consolidated boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result record;
  v_frozen_classification_key text;
begin
  if p_classification_key is null
    or p_classification_key not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
    or p_article ->> 'classificationKey'
      is distinct from p_classification_key
  then
    raise exception 'mesa-publication-classification-required'
      using errcode = '22023';
  end if;

  perform pg_catalog.set_config(
    'jornada.output_classification_key',
    p_classification_key,
    true
  );

  select *
  into strict v_result
  from public.newsroom_publish_mesa_intent_output_v1(
    p_dossier_id,
    p_output_id,
    p_package_id,
    p_dossier_source_ids,
    p_article
  );

  perform pg_catalog.set_config(
    'jornada.output_classification_key',
    '',
    true
  );

  select publication.classification_key
  into v_frozen_classification_key
  from public.newsroom_mesa_output_publications as publication
  where publication.dossier_id = p_dossier_id
    and publication.article_plan_id = p_output_id
  for share;

  if not found
    or v_frozen_classification_key is distinct from p_classification_key
  then
    raise exception 'mesa-publication-provenance-conflict'
      using errcode = '23514';
  end if;

  return query
  select
    v_result.editorial_article_id,
    v_result.article_slug,
    v_result.publication_action,
    v_result.consolidated;
end;
$function$;

revoke all on function public.newsroom_publish_mesa_intent_output_v2(
  uuid, uuid, uuid, uuid[], jsonb, text
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_publish_mesa_intent_output_v2(
  uuid, uuid, uuid, uuid[], jsonb, text
) to service_role;
revoke execute on function public.newsroom_publish_mesa_intent_output_v1(
  uuid, uuid, uuid, uuid[], jsonb
) from service_role;

create or replace function public.newsroom_apply_output_classification_to_bank_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matchday_id uuid;
  v_bank_item_id uuid;
begin
  select article_row.matchday_id
  into v_matchday_id
  from public.editorial_articles as article_row
  where article_row.id = new.editorial_article_id
  for share;

  if v_matchday_id is null then
    return new;
  end if;

  select bank_row.id
  into v_bank_item_id
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = v_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
      = 'editorial_article'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
      = new.editorial_article_id::text
  order by bank_row.created_at, bank_row.id
  limit 1
  for update;

  if v_bank_item_id is null then
    raise exception 'article_plan_classification_bank_item_missing'
      using errcode = '23514';
  end if;

  perform jornada_private.authorize_matchday_editorial_bank_classification_writes(
    array[v_bank_item_id]
  );
  begin
    update public.matchday_editorial_bank_items as bank_row
    set classification_key = new.classification_key,
        classification_source = 'manual',
        classified_at = pg_catalog.statement_timestamp(),
        automatic_eligible = false
    where bank_row.id = v_bank_item_id;

    perform jornada_private.revoke_matchday_editorial_bank_classification_writes(
      array[v_bank_item_id]
    );
  exception when others then
    perform jornada_private.revoke_matchday_editorial_bank_classification_writes(
      array[v_bank_item_id]
    );
    raise;
  end;

  return new;
end;
$function$;

drop trigger if exists newsroom_output_classification_to_bank_v1
  on public.newsroom_mesa_output_publications;
create trigger newsroom_output_classification_to_bank_v1
after insert
on public.newsroom_mesa_output_publications
for each row
execute function public.newsroom_apply_output_classification_to_bank_v1();

revoke all on function public.newsroom_apply_output_classification_to_bank_v1()
from public, anon, authenticated, service_role;

create or replace function public.newsroom_mesa_intent_source_v1(
  p_source_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select
    pg_catalog.jsonb_build_object(
      'newsroomArticleId', article_row.id,
      'newsroomSnapshotId', snapshot_row.id,
      'capturedAt', pg_catalog.to_char(
        snapshot_row.extracted_at at time zone 'UTC',
        'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
      ),
      'contentFingerprint', pg_catalog.encode(
        pg_catalog.sha256(
          pg_catalog.convert_to(
            pg_catalog.jsonb_build_object(
              'article', pg_catalog.to_jsonb(article_row),
              'snapshot', pg_catalog.to_jsonb(snapshot_row)
            )::text,
            'UTF8'
          )
        ),
        'hex'
      ),
      'usable',
        pg_catalog.jsonb_typeof(snapshot_row.body) = 'array'
        and exists (
          select 1
          from pg_catalog.jsonb_array_elements(
            case
              when pg_catalog.jsonb_typeof(snapshot_row.body) = 'array'
                then snapshot_row.body
              else '[]'::jsonb
            end
          ) as block_row(value)
          where block_row.value ->> 'type' in ('paragraph', 'heading')
            and nullif(pg_catalog.btrim(block_row.value ->> 'text'), '')
              is not null
        )
    )
    || case
      when classification_row.classification_key is null then '{}'::jsonb
      else pg_catalog.jsonb_build_object(
        'classificationKey',
        classification_row.classification_key
      )
    end
  from public.newsroom_articles as article_row
  left join lateral (
    select snapshot.*
    from public.newsroom_article_snapshots as snapshot
    where snapshot.article_id = article_row.id
    order by snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
    limit 1
  ) as snapshot_row on true
  left join public.newsroom_editorial_article_classifications
    as classification_row
    on classification_row.newsroom_article_id = article_row.id
  where article_row.id = p_source_id;
$function$;

revoke all on function public.newsroom_mesa_intent_source_v1(uuid)
from public, anon, authenticated, service_role;

comment on function public.newsroom_mesa_intent_source_v1(uuid) is
  'Captures source identity and immutable article/snapshot content. Manual source classification is optional triage metadata and is excluded from the content fingerprint.';

create or replace function public.newsroom_mesa_preview_intents_v1(p_request jsonb)
returns table(plan jsonb)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_request jsonb := public.newsroom_mesa_normalize_intent_v1(p_request);
  v_intent jsonb;
  v_theme public.newsroom_editorial_themes%rowtype;
  v_id uuid;
  v_key text;
  v_source jsonb;
  v_sources jsonb;
  v_history jsonb;
  v_candidates jsonb;
  v_contexts jsonb := '[]';
  v_outputs jsonb := '[]';
  v_incorporations jsonb := '[]';
  v_context jsonb;
  v_article jsonb;
  v_review_count integer := 0;
  v_new_count integer := 0;
  v_source_count integer;
  v_i integer;
  v_material jsonb;
begin
  for v_intent in
    select item
    from pg_catalog.jsonb_array_elements(v_request -> 'themes') as row_value(item)
    where item ->> 'action' = 'prepare'
  loop
    select *
    into v_theme
    from public.newsroom_editorial_themes as theme_row
    where theme_row.id = (v_intent ->> 'themeId')::uuid
      and theme_row.status = 'open';
    if not found then
      raise exception 'mesa-intent-theme-unavailable'
        using detail = v_intent ->> 'themeId';
    end if;
    v_key := 'theme:' || v_theme.id::text;
    v_sources := '[]';
    for v_id in
      select membership.newsroom_article_id
      from public.newsroom_editorial_theme_sources as membership
      where membership.theme_id = v_theme.id
      union
      select (source_item ->> 'sourceId')::uuid
      from pg_catalog.jsonb_array_elements(v_request -> 'sources')
        as source_row(source_item)
      where source_item ->> 'destination' = 'theme'
        and source_item ->> 'themeId' = v_theme.id::text
      order by 1
    loop
      v_source := public.newsroom_mesa_intent_source_v1(v_id);
      if v_source is null
        or v_source ->> 'newsroomSnapshotId' is null
        or v_source -> 'usable' is distinct from 'true'::jsonb
      then
        raise exception 'mesa-intent-source-snapshot-unavailable'
          using detail = v_key || ':' || v_id::text;
      end if;
      v_sources := v_sources || pg_catalog.jsonb_build_array(v_source);
      if not exists (
        select 1
        from public.newsroom_editorial_theme_sources as membership
        where membership.theme_id = v_theme.id
          and membership.newsroom_article_id = v_id
      ) then
        v_incorporations := v_incorporations
          || pg_catalog.jsonb_build_array(
            pg_catalog.jsonb_build_object(
              'themeId', v_theme.id,
              'sourceId', v_id
            )
          );
      end if;
    end loop;
    if pg_catalog.jsonb_array_length(v_sources) = 0 then
      raise exception 'mesa-intent-theme-sources-missing' using detail = v_key;
    end if;
    select coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'editorialArticleId', article_row.id,
          'slug', article_row.slug,
          'title', article_row.title,
          'matchdayId', article_row.matchday_id,
          'contentFingerprint', pg_catalog.encode(
            pg_catalog.sha256(
              pg_catalog.convert_to(
                pg_catalog.to_jsonb(article_row)::text,
                'UTF8'
              )
            ),
            'hex'
          ),
          'article', pg_catalog.to_jsonb(article_row)
        )
        order by article_row.id
      ),
      '[]'
    )
    into v_history
    from public.newsroom_editorial_theme_articles as membership
    join public.editorial_articles as article_row
      on article_row.id = membership.editorial_article_id
    where membership.theme_id = v_theme.id
      and article_row.status = 'published';
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_history) as history_row(item)
      where nullif(pg_catalog.btrim(item ->> 'slug'), '') is null
        or nullif(pg_catalog.btrim(item ->> 'title'), '') is null
    ) then
      raise exception 'mesa-intent-published-history-invalid' using detail = v_key;
    end if;
    if (v_intent ->> 'reviewPublished')::boolean
      and pg_catalog.jsonb_array_length(v_history) = 0
    then
      raise exception 'mesa-intent-nothing-to-review' using detail = v_key;
    end if;
    if not (v_intent ->> 'reviewPublished')::boolean
      and (v_intent ->> 'newArticleCount')::integer = 0
    then
      raise exception 'mesa-intent-theme-work-missing' using detail = v_key;
    end if;
    v_contexts := v_contexts || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', v_key,
        'kind', 'theme',
        'themeId', v_theme.id,
        'sourceId', null,
        'title', v_theme.title,
        'theme', pg_catalog.to_jsonb(v_theme),
        'reviewPublished', v_intent -> 'reviewPublished',
        'newArticleCount', v_intent -> 'newArticleCount',
        'sources', v_sources,
        'publishedArticles', v_history
      )
    );
  end loop;

  for v_intent in
    select item
    from pg_catalog.jsonb_array_elements(v_request -> 'sources') as row_value(item)
    where item ->> 'destination' = 'independent'
  loop
    v_id := (v_intent ->> 'sourceId')::uuid;
    v_key := 'source:' || v_id::text;
    if exists (
      select 1
      from public.newsroom_editorial_theme_sources as membership
      where membership.newsroom_article_id = v_id
    ) then
      raise exception 'mesa-intent-independent-source-not-loose' using detail = v_key;
    end if;
    v_source := public.newsroom_mesa_intent_source_v1(v_id);
    if v_source is null
      or v_source ->> 'newsroomSnapshotId' is null
      or v_source -> 'usable' is distinct from 'true'::jsonb
    then
      raise exception 'mesa-intent-source-snapshot-unavailable' using detail = v_key;
    end if;
    v_contexts := v_contexts || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', v_key,
        'kind', 'source',
        'themeId', null,
        'sourceId', v_id,
        'title', 'Fonte independente',
        'reviewPublished', false,
        'newArticleCount', v_intent -> 'newArticleCount',
        'sources', pg_catalog.jsonb_build_array(v_source),
        'publishedArticles', '[]'::jsonb
      )
    );
  end loop;

  if v_request ? 'selection' then
    v_key := 'selection:' || (v_request ->> 'preparationKey');
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        coalesce(v_request -> 'selection' -> 'themeIds', '[]'::jsonb)
      ) as selected(value)
      where not exists (
        select 1
        from public.newsroom_editorial_themes as theme_row
        where theme_row.id = (selected.value #>> '{}')::uuid
          and theme_row.status = 'open'
      )
    ) then
      raise exception 'mesa-intent-theme-unavailable' using detail = v_key;
    end if;
    v_sources := '[]'::jsonb;
    for v_id in
      select (value #>> '{}')::uuid
      from pg_catalog.jsonb_array_elements(
        v_request -> 'selection' -> 'sourceIds'
      )
      union
      select membership.newsroom_article_id
      from public.newsroom_editorial_theme_sources as membership
      where membership.theme_id in (
        select (value #>> '{}')::uuid
        from pg_catalog.jsonb_array_elements(
          coalesce(v_request -> 'selection' -> 'themeIds', '[]'::jsonb)
        )
      )
      order by 1
    loop
      v_source := public.newsroom_mesa_intent_source_v1(v_id);
      if v_source is null
        or v_source ->> 'newsroomSnapshotId' is null
        or v_source -> 'usable' is distinct from 'true'::jsonb
      then
        raise exception 'mesa-intent-source-snapshot-unavailable'
          using detail = v_key || ':' || v_id::text;
      end if;
      v_sources := v_sources || pg_catalog.jsonb_build_array(v_source);
    end loop;
    if pg_catalog.jsonb_array_length(v_sources) = 0 then
      raise exception 'mesa-intent-selection-sources-missing' using detail = v_key;
    end if;
    select candidates
    into strict v_candidates
    from public.newsroom_mesa_global_article_candidates_v1(
      array(
        select (value #>> '{}')::uuid
        from pg_catalog.jsonb_array_elements(
          v_request -> 'selection' -> 'sourceIds'
        )
      ),
      array(
        select (value #>> '{}')::uuid
        from pg_catalog.jsonb_array_elements(
          coalesce(v_request -> 'selection' -> 'themeIds', '[]'::jsonb)
        )
      )
    );
    select coalesce(
      pg_catalog.jsonb_agg(candidate order by candidate ->> 'editorialArticleId'),
      '[]'::jsonb
    )
    into v_candidates
    from pg_catalog.jsonb_array_elements(v_candidates) as row_value(candidate);
    if v_request -> 'selection' ? 'candidateArticleIds'
      and (
        select coalesce(
          pg_catalog.jsonb_agg(
            candidate -> 'editorialArticleId'
            order by candidate ->> 'editorialArticleId'
          ),
          '[]'::jsonb
        )
        from pg_catalog.jsonb_array_elements(v_candidates) as row_value(candidate)
      ) is distinct from v_request -> 'selection' -> 'candidateArticleIds'
    then
      raise exception 'mesa-intent-selection-candidates-stale' using detail = v_key;
    end if;
    if exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        v_request -> 'selection' -> 'reviewArticleIds'
      ) as requested(value)
      where not exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_candidates) as candidate(value)
        where candidate.value ->> 'editorialArticleId' = requested.value #>> '{}'
      )
    ) then
      raise exception 'mesa-intent-selection-target-unavailable' using detail = v_key;
    end if;
    select coalesce(
      pg_catalog.jsonb_agg(candidate order by candidate ->> 'editorialArticleId'),
      '[]'::jsonb
    )
    into v_history
    from pg_catalog.jsonb_array_elements(v_candidates) as row_value(candidate)
    where exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        v_request -> 'selection' -> 'reviewArticleIds'
      ) as requested(value)
      where requested.value #>> '{}' = candidate ->> 'editorialArticleId'
    );
    v_contexts := v_contexts || pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'key', v_key,
        'kind', 'selection',
        'themeId', null,
        'sourceId', null,
        'title', v_request ->> 'title',
        'reviewPublished',
          pg_catalog.jsonb_array_length(
            v_request -> 'selection' -> 'reviewArticleIds'
          ) > 0,
        'newArticleCount', v_request -> 'selection' -> 'newArticleCount',
        'sources', v_sources,
        'publishedArticles', v_history,
        'candidateArticles', v_candidates
      )
    );
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(context_item order by context_item ->> 'key'),
    '[]'
  )
  into v_contexts
  from pg_catalog.jsonb_array_elements(v_contexts) as row_value(context_item);
  for v_context in
    select context_item
    from pg_catalog.jsonb_array_elements(v_contexts) as row_value(context_item)
    where (context_item ->> 'reviewPublished')::boolean
  loop
    for v_article in
      select article_item
      from pg_catalog.jsonb_array_elements(v_context -> 'publishedArticles')
        as row_value(article_item)
    loop
      if exists (
        select 1
        from pg_catalog.jsonb_array_elements(v_outputs) as output_row(item)
        where output_row.item -> 'target' ->> 'editorialArticleId'
          = v_article ->> 'editorialArticleId'
      ) then
        raise exception 'mesa-intent-review-target-conflict';
      end if;
      v_review_count := v_review_count + 1;
      v_outputs := v_outputs || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'slot', 'EXISTING_' || pg_catalog.lpad(v_review_count::text, 2, '0'),
          'contextKey', v_context ->> 'key',
          'kind', 'existing',
          'target', v_article
        )
      );
    end loop;
  end loop;
  for v_context in
    select value
    from pg_catalog.jsonb_array_elements(v_contexts)
  loop
    for v_i in 1..(v_context ->> 'newArticleCount')::integer loop
      v_new_count := v_new_count + 1;
      v_outputs := v_outputs || pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'slot', 'NEW_' || pg_catalog.lpad(v_new_count::text, 2, '0'),
          'contextKey', v_context ->> 'key',
          'kind', 'new',
          'target', null
        )
      );
    end loop;
  end loop;
  select pg_catalog.count(distinct source_item ->> 'newsroomArticleId')::integer
  into v_source_count
  from pg_catalog.jsonb_array_elements(v_contexts) as context_row(context_item)
  cross join lateral pg_catalog.jsonb_array_elements(
    context_row.context_item -> 'sources'
  ) as source_row(source_item);
  if pg_catalog.jsonb_array_length(v_contexts) > 20 then
    raise exception 'mesa-intent-context-limit';
  end if;
  if v_source_count > 20 then raise exception 'mesa-intent-source-limit'; end if;
  if v_review_count + v_new_count = 0 then
    raise exception 'mesa-intent-no-work-requested';
  end if;
  if v_review_count + v_new_count > 30 then
    raise exception 'mesa-intent-output-limit';
  end if;
  v_material := pg_catalog.jsonb_build_object(
    'contractVersion', 1,
    'request', v_request,
    'preparationKey', v_request ->> 'preparationKey',
    'title', v_request ->> 'title',
    'contexts', v_contexts,
    'outputs', v_outputs,
    'incorporations', v_incorporations,
    'deferred', pg_catalog.jsonb_build_object(
      'themeIds', (
        select coalesce(pg_catalog.jsonb_agg(item -> 'themeId'), '[]')
        from pg_catalog.jsonb_array_elements(v_request -> 'themes')
          as row_value(item)
        where item ->> 'action' = 'defer'
      ),
      'sourceIds', (
        select coalesce(pg_catalog.jsonb_agg(item -> 'sourceId'), '[]')
        from pg_catalog.jsonb_array_elements(v_request -> 'sources')
          as row_value(item)
        where item ->> 'destination' = 'defer'
      )
    ),
    'totals', pg_catalog.jsonb_build_object(
      'contexts', pg_catalog.jsonb_array_length(v_contexts),
      'sources', v_source_count,
      'reviews', v_review_count,
      'newArticles', v_new_count
    )
  );
  return query
  select v_material || pg_catalog.jsonb_build_object(
    'capturedAt', pg_catalog.to_char(
      pg_catalog.statement_timestamp() at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'authorityFingerprint', pg_catalog.encode(
      pg_catalog.sha256(
        pg_catalog.convert_to(v_material::text, 'UTF8')
      ),
      'hex'
    )
  );
end;
$function$;

comment on function public.newsroom_mesa_preview_intents_v1(jsonb) is
  'Builds Mesa intents from usable frozen sources without requiring source classification. Final output classification is chosen at publication.';

notify pgrst, 'reload schema';

commit;
