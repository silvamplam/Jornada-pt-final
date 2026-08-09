-- Step 93 - entrada manual canónica completa.
-- Acrescenta uma nova RPC versionada sem alterar o contrato legacy do step 39.

begin;

create function public.newsroom_create_complete_manual_entry(
  p_submission_id uuid,
  p_request_fingerprint text,
  p_ante_title text,
  p_title text,
  p_post_title text,
  p_author text,
  p_body jsonb,
  p_published_date text,
  p_published_time text,
  p_image_url text,
  p_content_hash text
)
returns table (
  submission_id uuid,
  request_fingerprint text,
  newsroom_article_id uuid,
  newsroom_snapshot_id uuid,
  entry_action text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.newsroom_manual_entry_requests%rowtype;
  v_article_id uuid;
  v_snapshot_id uuid;
  v_published_date date;
  v_published_time time without time zone;
  v_published_at timestamptz;
  v_now timestamptz := pg_catalog.now();
  v_body_length integer;
  v_source_metadata jsonb;
begin
  if p_submission_id is null
     or p_request_fingerprint is null
     or p_request_fingerprint !~ '^[0-9a-f]{64}$'
     or p_ante_title is null
     or btrim(p_ante_title) = ''
     or length(btrim(p_ante_title)) > 240
     or p_title is null
     or btrim(p_title) = ''
     or length(btrim(p_title)) > 180
     or p_post_title is null
     or btrim(p_post_title) = ''
     or length(btrim(p_post_title)) > 600
     or p_author is null
     or btrim(p_author) = ''
     or length(btrim(p_author)) > 200
     or p_body is null
     or jsonb_typeof(p_body) <> 'array'
     or jsonb_array_length(p_body) = 0
     or p_published_date is null
     or p_published_date !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
     or p_published_time is null
     or p_published_time !~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'
     or p_image_url is null
     or btrim(p_image_url) = ''
     or length(p_image_url) > 2048
     or p_image_url !~ '^https?://'
     or p_content_hash is null
     or p_content_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'manual_entry_input_invalid' using errcode = '22023';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_body) body_item(value)
    where jsonb_typeof(body_item.value) is distinct from 'object'
      or jsonb_typeof(body_item.value -> 'type') is distinct from 'string'
      or (body_item.value ->> 'type') is distinct from 'paragraph'
      or jsonb_typeof(body_item.value -> 'text') is distinct from 'string'
      or nullif(btrim(coalesce(body_item.value ->> 'text', '')), '') is null
      or exists (
        select 1
        from jsonb_object_keys(
          case when jsonb_typeof(body_item.value) = 'object'
            then body_item.value else '{}'::jsonb end
        ) body_key(key)
        where body_key.key not in ('type', 'text')
      )
  ) then
    raise exception 'manual_entry_body_invalid' using errcode = '22023';
  end if;

  select coalesce(sum(length(body_item.value ->> 'text')), 0)::integer
  into v_body_length
  from jsonb_array_elements(p_body) body_item(value);

  if v_body_length < 1 or v_body_length > 50000 then
    raise exception 'manual_entry_body_invalid' using errcode = '22023';
  end if;

  begin
    v_published_date := p_published_date::date;
    v_published_time := p_published_time::time;
  exception
    when invalid_datetime_format or datetime_field_overflow then
      raise exception 'manual_entry_published_at_invalid' using errcode = '22007';
  end;

  if to_char(v_published_date, 'YYYY-MM-DD') <> p_published_date
     or to_char(v_published_time, 'HH24:MI') <> p_published_time then
    raise exception 'manual_entry_published_at_invalid' using errcode = '22007';
  end if;

  v_published_at := (
    p_published_date || ' ' || p_published_time
  )::timestamp without time zone at time zone 'Europe/Lisbon';

  if to_char(
       v_published_at at time zone 'Europe/Lisbon',
       'YYYY-MM-DD HH24:MI'
     ) <> (p_published_date || ' ' || p_published_time) then
    raise exception 'manual_entry_published_at_invalid' using errcode = '22007';
  end if;

  if v_published_at > v_now then
    raise exception 'manual_entry_published_at_future' using errcode = '22007';
  end if;

  insert into public.newsroom_manual_entry_requests (
    submission_id,
    request_fingerprint
  ) values (
    p_submission_id,
    p_request_fingerprint
  )
  on conflict on constraint newsroom_manual_entry_requests_pkey do nothing;

  select request_row.*
  into v_request
  from public.newsroom_manual_entry_requests request_row
  where request_row.submission_id = p_submission_id
  for update;

  if not found then
    raise exception 'manual_entry_request_unavailable' using errcode = '55000';
  end if;
  if v_request.request_fingerprint <> p_request_fingerprint then
    raise exception 'manual_entry_payload_conflict' using errcode = 'P0001';
  end if;

  if v_request.newsroom_article_id is not null
     and v_request.newsroom_snapshot_id is not null then
    if not exists (
      select 1
      from public.newsroom_articles article
      join public.newsroom_article_snapshots snapshot
        on snapshot.id = v_request.newsroom_snapshot_id
       and snapshot.article_id = article.id
      where article.id = v_request.newsroom_article_id
        and article.source_code = 'manual_entry'
        and article.title = btrim(p_title)
        and article.subtitle = btrim(p_post_title)
        and article.author = btrim(p_author)
        and article.published_at = v_published_at
        and article.image_url = btrim(p_image_url)
        and snapshot.content_hash = p_content_hash
        and snapshot.source_metadata ->> 'origin' = 'manual'
        and snapshot.source_metadata ->> 'manualSubmissionId' = p_submission_id::text
        and snapshot.source_metadata ->> 'anteTitle' = btrim(p_ante_title)
        and snapshot.source_metadata ->> 'publishedAtPrecision' = 'instant'
    ) then
      raise exception 'manual_entry_request_inconsistent' using errcode = '55000';
    end if;

    return query
    select p_submission_id, p_request_fingerprint,
      v_request.newsroom_article_id, v_request.newsroom_snapshot_id,
      'reused'::text;
    return;
  end if;

  if v_request.newsroom_article_id is not null
     or v_request.newsroom_snapshot_id is not null then
    raise exception 'manual_entry_request_incomplete' using errcode = '55000';
  end if;

  v_article_id := pg_catalog.gen_random_uuid();
  v_snapshot_id := pg_catalog.gen_random_uuid();
  v_source_metadata := jsonb_strip_nulls(jsonb_build_object(
    'origin', 'manual',
    'sourceCode', 'manual_entry',
    'sourceName', 'Entrada manual',
    'manualSubmissionId', p_submission_id::text,
    'anteTitle', btrim(p_ante_title),
    'title', btrim(p_title),
    'postTitle', btrim(p_post_title),
    'author', btrim(p_author),
    'publishedAt', to_char(
      v_published_at at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    ),
    'publishedAtPrecision', 'instant',
    'imageUrl', btrim(p_image_url),
    'introducedAt', to_char(
      v_now at time zone 'UTC',
      'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'
    )
  ));

  insert into public.newsroom_articles (
    id, source_code, original_url, normalized_url, external_id,
    title, subtitle, summary, author, published_at, modified_at,
    detected_at, image_url, processing_status, first_detected_at,
    last_detected_at, created_at, updated_at
  ) values (
    v_article_id, 'manual_entry', null, null, null,
    btrim(p_title), btrim(p_post_title), null, btrim(p_author),
    v_published_at, null, v_now, btrim(p_image_url), 'ready_for_review',
    v_now, v_now, v_now, v_now
  );

  insert into public.newsroom_article_snapshots (
    id, article_id, content_hash, body, source_metadata, extracted_at, created_at
  ) values (
    v_snapshot_id, v_article_id, p_content_hash, p_body,
    v_source_metadata, v_now, v_now
  );

  update public.newsroom_manual_entry_requests request_row
  set newsroom_article_id = v_article_id,
      newsroom_snapshot_id = v_snapshot_id
  where request_row.submission_id = p_submission_id;

  return query
  select p_submission_id, p_request_fingerprint,
    v_article_id, v_snapshot_id, 'created'::text;
end;
$$;

revoke all on function public.newsroom_create_complete_manual_entry(
  uuid, text, text, text, text, text, jsonb, text, text, text, text
) from public, anon, authenticated, service_role;

grant execute on function public.newsroom_create_complete_manual_entry(
  uuid, text, text, text, text, text, jsonb, text, text, text, text
) to service_role;

comment on function public.newsroom_create_complete_manual_entry(
  uuid, text, text, text, text, text, jsonb, text, text, text, text
) is
  'Creates or reuses one complete manual newsroom article with ante-title metadata, post-title, author, exact source date/time, image and immutable body snapshot.';

commit;
