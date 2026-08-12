do $$
declare
  v_indexdef text;
  v_legacy_articles integer;
  v_legacy_contents integer;
begin
  select pg_get_indexdef(indexrelid) into v_indexdef
  from pg_index
  where indexrelid = 'public.matchday_editorial_bank_items_automatic_source_unique_idx'::regclass;

  if v_indexdef is null or position('matchday_id' in v_indexdef) = 0 then
    raise exception 'canonical bank unique index is not scoped by matchday';
  end if;

  if to_regprocedure('public.sync_matchday_zone_publication_to_bank(uuid,text)') is null then
    raise exception 'missing sync_matchday_zone_publication_to_bank';
  end if;
  if to_regprocedure('public.sync_matchday_zone_row_to_bank()') is null then
    raise exception 'missing sync_matchday_zone_row_to_bank';
  end if;

  if not exists (select 1 from pg_trigger where tgname = 'sync_matchday_latest_news_to_bank' and not tgisinternal) then raise exception 'missing latest trigger'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'sync_matchday_highlights_to_bank' and not tgisinternal) then raise exception 'missing highlights trigger'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'sync_matchday_horizontal_news_to_bank' and not tgisinternal) then raise exception 'missing horizontal trigger'; end if;
  if not exists (select 1 from pg_trigger where tgname = 'sync_matchday_editorials_to_bank' and not tgisinternal) then raise exception 'missing editorial trigger'; end if;

  select count(*) into v_legacy_articles
  from public.matchday_editorial_bank_items bank
  join public.editorial_articles article
    on lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = lower('/noticias/' || article.slug)
   and article.status = 'published'
   and (article.matchday_id is null or article.matchday_id = bank.matchday_id)
  where lower(btrim(coalesce(bank.source_type, ''))) <> 'editorial_article';

  if v_legacy_articles <> 0 then
    raise exception 'legacy article bank identities remain: %', v_legacy_articles;
  end if;

  select count(*) into v_legacy_contents
  from public.matchday_editorial_bank_items bank
  join public.editorial_contents content
    on lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = lower('/conteudos/' || content.slug)
   and content.status = 'published'
   and (content.matchday_id is null or content.matchday_id = bank.matchday_id)
  where lower(btrim(coalesce(bank.source_type, ''))) <> 'editorial_content';

  if v_legacy_contents <> 0 then
    raise exception 'legacy content bank identities remain: %', v_legacy_contents;
  end if;
end
$$;
