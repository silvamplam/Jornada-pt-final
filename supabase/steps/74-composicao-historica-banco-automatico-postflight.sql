do $$
declare
  missing_articles integer;
  missing_contents integer;
  duplicate_sources integer;
  trigger_count integer;
  unique_index_valid boolean;
begin
  if to_regprocedure('public.upsert_matchday_editorial_bank_publication(uuid,text,text,text,text,text,text,text,text)') is null then
    raise exception 'Postflight falhou: função de upsert automático ausente';
  end if;

  if to_regprocedure('public.sync_published_editorial_source_to_matchday_bank()') is null then
    raise exception 'Postflight falhou: função de trigger automático ausente';
  end if;

  select count(*)
    into trigger_count
  from pg_trigger trigger_row
  join pg_class table_row on table_row.oid = trigger_row.tgrelid
  join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
  where schema_row.nspname = 'public'
    and not trigger_row.tgisinternal
    and (
      (table_row.relname = 'editorial_articles' and trigger_row.tgname = 'sync_published_editorial_article_to_matchday_bank')
      or
      (table_row.relname = 'editorial_contents' and trigger_row.tgname = 'sync_published_editorial_content_to_matchday_bank')
    );

  if trigger_count <> 2 then
    raise exception 'Postflight falhou: esperados 2 triggers automáticos, encontrados %', trigger_count;
  end if;

  select index_row.indisunique and index_row.indisvalid
    into unique_index_valid
  from pg_index index_row
  join pg_class index_class on index_class.oid = index_row.indexrelid
  join pg_namespace schema_row on schema_row.oid = index_class.relnamespace
  where schema_row.nspname = 'public'
    and index_class.relname = 'matchday_editorial_bank_items_automatic_source_unique_idx';

  if coalesce(unique_index_valid, false) is not true then
    raise exception 'Postflight falhou: índice único automático ausente ou inválido';
  end if;

  select count(*)
    into missing_articles
  from public.editorial_articles article
  where article.status = 'published'
    and article.matchday_id is not null
    and not exists (
      select 1
      from public.matchday_editorial_bank_items bank
      where bank.matchday_id = article.matchday_id
        and lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
        and lower(btrim(coalesce(bank.source_id, ''))) = lower(article.id::text)
    );

  select count(*)
    into missing_contents
  from public.editorial_contents content
  where content.status = 'published'
    and content.matchday_id is not null
    and not exists (
      select 1
      from public.matchday_editorial_bank_items bank
      where bank.matchday_id = content.matchday_id
        and lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
        and lower(btrim(coalesce(bank.source_id, ''))) = lower(content.id::text)
    );

  if missing_articles <> 0 or missing_contents <> 0 then
    raise exception 'Postflight falhou: % artigos e % conteúdos publicados continuam fora do banco', missing_articles, missing_contents;
  end if;

  select count(*)
    into duplicate_sources
  from (
    select lower(btrim(source_type)), lower(btrim(source_id))
    from public.matchday_editorial_bank_items
    where lower(btrim(coalesce(source_type, ''))) in ('editorial_article', 'editorial_content')
      and nullif(btrim(source_id), '') is not null
    group by lower(btrim(source_type)), lower(btrim(source_id))
    having count(*) > 1
  ) duplicates;

  if duplicate_sources <> 0 then
    raise exception 'Postflight falhou: permanecem % identidades automáticas duplicadas', duplicate_sources;
  end if;
end
$$;

select 'Postflight concluído: triggers, reconciliação, backfill e unicidade do banco automático validados' as resultado;
