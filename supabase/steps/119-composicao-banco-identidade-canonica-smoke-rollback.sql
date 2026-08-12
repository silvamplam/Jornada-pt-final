begin;

do $$
declare
  item record;
  v_bank_id uuid;
  v_source_type text;
  v_source_id text;
begin
  select article.id, article.matchday_id, article.slug
    into item
  from public.editorial_articles article
  where article.status = 'published'
    and article.matchday_id is not null
    and nullif(btrim(article.slug), '') is not null
  order by article.published_at desc nulls last, article.created_at desc
  limit 1;

  if item.id is null then
    raise notice 'smoke skipped: no published matchday article';
    return;
  end if;

  v_bank_id := public.sync_matchday_zone_publication_to_bank(item.matchday_id, '/noticias/' || item.slug);
  if v_bank_id is null then raise exception 'smoke canonical sync returned null'; end if;

  select source_type, source_id into v_source_type, v_source_id
  from public.matchday_editorial_bank_items
  where id = v_bank_id;

  if lower(btrim(coalesce(v_source_type, ''))) <> 'editorial_article' or v_source_id <> item.id::text then
    raise exception 'smoke canonical identity mismatch';
  end if;
end
$$;

rollback;
