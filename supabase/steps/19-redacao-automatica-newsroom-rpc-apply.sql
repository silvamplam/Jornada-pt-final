-- Redação Automática — persistência transacional de artigo e snapshot.
-- SQL 2/4 — APLICAÇÃO MANUAL. Cria apenas a RPC e os respetivos grants.

begin;

do $$
begin
  if to_regclass('public.newsroom_articles') is null
     or to_regclass('public.newsroom_article_snapshots') is null then
    raise exception 'apply_required_newsroom_table_missing'
      using errcode = '42P01';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_articles')
      and conname = 'newsroom_articles_source_url_key'
      and contype = 'u'
  ) or not exists (
    select 1
    from pg_catalog.pg_constraint
    where conrelid = to_regclass('public.newsroom_article_snapshots')
      and conname = 'newsroom_article_snapshots_article_hash_key'
      and contype = 'u'
  ) then
    raise exception 'apply_required_newsroom_identity_constraint_missing'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n
      on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'newsroom_persist_article_snapshot'
  ) then
    raise exception 'apply_newsroom_persist_article_snapshot_name_conflict'
      using errcode = '42723';
  end if;
end;
$$;

create function public.newsroom_persist_article_snapshot(
  p_source_code text,
  p_original_url text,
  p_normalized_url text,
  p_external_id text,
  p_title text,
  p_subtitle text,
  p_summary text,
  p_author text,
  p_published_at timestamptz,
  p_modified_at timestamptz,
  p_detected_at timestamptz,
  p_image_url text,
  p_processing_status text,
  p_content_hash text,
  p_body jsonb,
  p_source_metadata jsonb,
  p_extracted_at timestamptz
)
returns table (
  article_id uuid,
  snapshot_id uuid,
  article_action text,
  snapshot_action text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_article public.newsroom_articles%rowtype;
  v_snapshot public.newsroom_article_snapshots%rowtype;
  v_article_action text;
  v_snapshot_action text;
  v_external_id_changes boolean;
  v_apply_mutable_metadata boolean;
  v_mutable_metadata_changes boolean;
begin
  if p_source_code is null
     or btrim(p_source_code) = ''
     or p_original_url is null
     or btrim(p_original_url) = ''
     or p_normalized_url is null
     or btrim(p_normalized_url) = ''
     or p_title is null
     or btrim(p_title) = ''
     or p_detected_at is null
     or p_processing_status is null
     or btrim(p_processing_status) = ''
     or p_content_hash is null
     or btrim(p_content_hash) = ''
     or p_extracted_at is null
     or (p_external_id is not null and btrim(p_external_id) = '')
     or (p_subtitle is not null and btrim(p_subtitle) = '')
     or (p_summary is not null and btrim(p_summary) = '')
     or (p_author is not null and btrim(p_author) = '')
     or (p_image_url is not null and btrim(p_image_url) = '') then
    raise exception 'input_invalid'
      using detail = 'validation', errcode = 'P0001';
  end if;

  if p_original_url !~ '^https?://[^[:space:]]+$'
     or p_normalized_url !~ '^https?://[^[:space:]]+$'
     or (
       p_image_url is not null
       and p_image_url !~ '^https?://[^[:space:]]+$'
     )
     or p_processing_status not in (
       'detected',
       'normalized',
       'duplicate',
       'rejected',
       'ready_for_review',
       'failed'
     )
     or p_body is null
     or jsonb_typeof(p_body) <> 'array'
     or p_source_metadata is null
     or jsonb_typeof(p_source_metadata) <> 'object' then
    raise exception 'input_invalid'
      using detail = 'validation', errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_body) as body_item(value)
    where jsonb_typeof(body_item.value) <> 'object'
  ) then
    raise exception 'input_invalid'
      using detail = 'validation', errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_body) as body_item(value)
    where not (body_item.value ? 'type')
       or not (body_item.value ? 'text')
       or (
         select count(*)
         from jsonb_object_keys(body_item.value)
       ) <> 2
       or jsonb_typeof(body_item.value -> 'type') <> 'string'
       or body_item.value ->> 'type' not in ('heading', 'paragraph')
       or jsonb_typeof(body_item.value -> 'text') <> 'string'
       or btrim(body_item.value ->> 'text') = ''
  ) then
    raise exception 'input_invalid'
      using detail = 'validation', errcode = 'P0001';
  end if;

  insert into public.newsroom_articles (
    source_code,
    original_url,
    normalized_url,
    external_id,
    title,
    subtitle,
    summary,
    author,
    published_at,
    modified_at,
    detected_at,
    image_url,
    processing_status,
    first_detected_at,
    last_detected_at
  ) values (
    p_source_code,
    p_original_url,
    p_normalized_url,
    p_external_id,
    p_title,
    p_subtitle,
    p_summary,
    p_author,
    p_published_at,
    p_modified_at,
    p_detected_at,
    p_image_url,
    p_processing_status,
    p_detected_at,
    p_detected_at
  )
  on conflict on constraint newsroom_articles_source_url_key do nothing
  returning * into v_article;

  if found then
    v_article_action := 'created';
  else
    select article.*
    into v_article
    from public.newsroom_articles article
    where article.source_code = p_source_code
      and article.normalized_url = p_normalized_url
    for update;

    if not found then
      raise exception 'persistence_conflict'
        using detail = 'article', errcode = 'P0001';
    end if;

    if v_article.original_url is distinct from p_original_url
       or (
         v_article.external_id is not null
         and p_external_id is not null
         and v_article.external_id is distinct from p_external_id
       ) then
      raise exception 'persistence_conflict'
        using detail = 'article', errcode = 'P0001';
    end if;

    v_external_id_changes :=
      v_article.external_id is null and p_external_id is not null;
    v_apply_mutable_metadata := p_detected_at >= v_article.last_detected_at;
    v_mutable_metadata_changes :=
      v_apply_mutable_metadata
      and (
        v_article.title is distinct from p_title
        or v_article.subtitle is distinct from p_subtitle
        or v_article.summary is distinct from p_summary
        or v_article.author is distinct from p_author
        or v_article.published_at is distinct from p_published_at
        or v_article.modified_at is distinct from p_modified_at
        or v_article.detected_at is distinct from p_detected_at
        or v_article.image_url is distinct from p_image_url
        or v_article.processing_status is distinct from p_processing_status
        or v_article.last_detected_at is distinct from p_detected_at
      );

    if v_external_id_changes or v_mutable_metadata_changes then
      update public.newsroom_articles article
      set
        external_id = case
          when v_external_id_changes then p_external_id
          else article.external_id
        end,
        title = case
          when v_apply_mutable_metadata then p_title
          else article.title
        end,
        subtitle = case
          when v_apply_mutable_metadata then p_subtitle
          else article.subtitle
        end,
        summary = case
          when v_apply_mutable_metadata then p_summary
          else article.summary
        end,
        author = case
          when v_apply_mutable_metadata then p_author
          else article.author
        end,
        published_at = case
          when v_apply_mutable_metadata then p_published_at
          else article.published_at
        end,
        modified_at = case
          when v_apply_mutable_metadata then p_modified_at
          else article.modified_at
        end,
        detected_at = case
          when v_apply_mutable_metadata then p_detected_at
          else article.detected_at
        end,
        image_url = case
          when v_apply_mutable_metadata then p_image_url
          else article.image_url
        end,
        processing_status = case
          when v_apply_mutable_metadata then p_processing_status
          else article.processing_status
        end,
        last_detected_at = case
          when v_apply_mutable_metadata then p_detected_at
          else article.last_detected_at
        end
      where article.id = v_article.id
      returning article.* into v_article;

      v_article_action := 'updated';
    else
      v_article_action := 'reused';
    end if;
  end if;

  insert into public.newsroom_article_snapshots (
    article_id,
    content_hash,
    body,
    source_metadata,
    extracted_at
  ) values (
    v_article.id,
    p_content_hash,
    p_body,
    p_source_metadata,
    p_extracted_at
  )
  on conflict on constraint newsroom_article_snapshots_article_hash_key
    do nothing
  returning * into v_snapshot;

  if found then
    v_snapshot_action := 'created';
  else
    select snapshot.*
    into v_snapshot
    from public.newsroom_article_snapshots snapshot
    where snapshot.article_id = v_article.id
      and snapshot.content_hash = p_content_hash
    for share;

    if not found then
      raise exception 'persistence_conflict'
        using detail = 'snapshot', errcode = 'P0001';
    end if;

    if v_snapshot.body is distinct from p_body
       or v_snapshot.source_metadata is distinct from p_source_metadata
       or v_snapshot.extracted_at is distinct from p_extracted_at then
      raise exception 'persistence_conflict'
        using detail = 'snapshot', errcode = 'P0001';
    end if;

    v_snapshot_action := 'reused';
  end if;

  return query
  select
    v_article.id,
    v_snapshot.id,
    v_article_action,
    v_snapshot_action;
end;
$$;

alter function public.newsroom_persist_article_snapshot(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz
) owner to postgres;

revoke execute on function public.newsroom_persist_article_snapshot(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz
) from public, anon, authenticated;

grant execute on function public.newsroom_persist_article_snapshot(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz
) to service_role;

comment on function public.newsroom_persist_article_snapshot(
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  text,
  timestamptz,
  timestamptz,
  timestamptz,
  text,
  text,
  text,
  jsonb,
  jsonb,
  timestamptz
) is
  'Atomically persists one newsroom article and one immutable extraction snapshot; service_role only.';

commit;
