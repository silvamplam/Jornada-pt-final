create or replace function public.sync_matchday_zone_publication_to_bank(
  p_matchday_id uuid,
  p_link_url text
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $function$
declare
  v_path text := regexp_replace(split_part(split_part(coalesce(btrim(p_link_url), ''), '?', 1), '#', 1), '/$', '');
  v_slug text;
  v_article public.editorial_articles%rowtype;
  v_content public.editorial_contents%rowtype;
  v_existing_bank_id uuid;
  v_candidate_count integer;
  v_exact_count integer;
begin
  if p_matchday_id is null or v_path = '' then
    return null;
  end if;

  if v_path like '/noticias/%' then
    v_slug := nullif(substring(v_path from char_length('/noticias/') + 1), '');
    if v_slug is null then return null; end if;

    select * into v_article
    from public.editorial_articles article
    where article.slug = v_slug
      and article.status = 'published'
      and (article.matchday_id is null or article.matchday_id = p_matchday_id)
    order by case when article.matchday_id = p_matchday_id then 0 else 1 end,
             article.published_at desc nulls last,
             article.updated_at desc nulls last,
             article.id
    limit 1;

    if v_article.id is null then return null; end if;

    select
      (min(bank.id::text) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_article.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_article.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from nullif(btrim(v_article.label), '')
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_article.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from nullif(btrim(v_article.subtitle), '')
          and nullif(btrim(bank.image_url), '') is not distinct from nullif(btrim(v_article.image_url), '')
          and nullif(btrim(bank.link_url), '') is not distinct from '/noticias/' || btrim(v_article.slug)
      ))::uuid,
      count(*)::integer,
      count(*) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_article.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_article.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from nullif(btrim(v_article.label), '')
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_article.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from nullif(btrim(v_article.subtitle), '')
          and nullif(btrim(bank.image_url), '') is not distinct from nullif(btrim(v_article.image_url), '')
          and nullif(btrim(bank.link_url), '') is not distinct from '/noticias/' || btrim(v_article.slug)
      )::integer
    into v_existing_bank_id, v_candidate_count, v_exact_count
    from public.matchday_editorial_bank_items as bank
    where bank.matchday_id = p_matchday_id
      and (
        (
          lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_article.id::text)
        )
        or lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', ''))
          = lower('/noticias/' || btrim(v_article.slug))
      );

    if v_candidate_count = 1 and v_exact_count = 1 then
      return v_existing_bank_id;
    end if;

    return public.upsert_matchday_editorial_bank_publication(
      p_matchday_id,
      'editorial_article',
      v_article.id::text,
      v_article.slug,
      v_article.label,
      v_article.title,
      v_article.subtitle,
      v_article.image_url,
      '/noticias/' || v_article.slug
    );
  end if;

  if v_path like '/conteudos/%' then
    v_slug := nullif(substring(v_path from char_length('/conteudos/') + 1), '');
    if v_slug is null then return null; end if;

    select * into v_content
    from public.editorial_contents content
    where content.slug = v_slug
      and content.status = 'published'
      and (content.matchday_id is null or content.matchday_id = p_matchday_id)
    order by case when content.matchday_id = p_matchday_id then 0 else 1 end,
             content.published_at desc nulls last,
             content.updated_at desc nulls last,
             content.id
    limit 1;

    if v_content.id is null then return null; end if;

    select
      (min(bank.id::text) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_content.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_content.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from coalesce(nullif(btrim(v_content.label), ''), nullif(btrim(v_content.content_type), ''))
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_content.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from coalesce(nullif(btrim(v_content.summary), ''), nullif(btrim(v_content.subtitle), ''))
          and nullif(btrim(bank.image_url), '') is not distinct from coalesce(nullif(btrim(v_content.thumbnail_url), ''), nullif(btrim(v_content.image_url), ''))
          and nullif(btrim(bank.link_url), '') is not distinct from '/conteudos/' || btrim(v_content.slug)
      ))::uuid,
      count(*)::integer,
      count(*) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_content.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_content.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from coalesce(nullif(btrim(v_content.label), ''), nullif(btrim(v_content.content_type), ''))
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_content.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from coalesce(nullif(btrim(v_content.summary), ''), nullif(btrim(v_content.subtitle), ''))
          and nullif(btrim(bank.image_url), '') is not distinct from coalesce(nullif(btrim(v_content.thumbnail_url), ''), nullif(btrim(v_content.image_url), ''))
          and nullif(btrim(bank.link_url), '') is not distinct from '/conteudos/' || btrim(v_content.slug)
      )::integer
    into v_existing_bank_id, v_candidate_count, v_exact_count
    from public.matchday_editorial_bank_items as bank
    where bank.matchday_id = p_matchday_id
      and (
        (
          lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_content.id::text)
        )
        or lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', ''))
          = lower('/conteudos/' || btrim(v_content.slug))
      );

    if v_candidate_count = 1 and v_exact_count = 1 then
      return v_existing_bank_id;
    end if;

    return public.upsert_matchday_editorial_bank_publication(
      p_matchday_id,
      'editorial_content',
      v_content.id::text,
      v_content.slug,
      coalesce(nullif(btrim(v_content.label), ''), nullif(btrim(v_content.content_type), '')),
      v_content.title,
      coalesce(nullif(btrim(v_content.summary), ''), nullif(btrim(v_content.subtitle), '')),
      coalesce(nullif(btrim(v_content.thumbnail_url), ''), nullif(btrim(v_content.image_url), '')),
      '/conteudos/' || v_content.slug
    );
  end if;

  return null;
end
$function$;