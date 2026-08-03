do $$
begin
  if to_regprocedure('public.remove_deleted_editorial_source_from_matchday_bank()') is null then
    raise exception 'Postflight falhou: função de limpeza ausente';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'editorial_articles'
      and trigger_row.tgname = 'remove_deleted_editorial_article_from_matchday_bank'
      and not trigger_row.tgisinternal
      and pg_get_triggerdef(trigger_row.oid) ilike '%AFTER DELETE%'
  ) then
    raise exception 'Postflight falhou: trigger DELETE de artigos ausente';
  end if;

  if not exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'editorial_contents'
      and trigger_row.tgname = 'remove_deleted_editorial_content_from_matchday_bank'
      and not trigger_row.tgisinternal
      and pg_get_triggerdef(trigger_row.oid) ilike '%AFTER DELETE%'
  ) then
    raise exception 'Postflight falhou: trigger DELETE de conteúdos ausente';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
      and bank.status = 'archived'
      and not exists (
        select 1
        from public.editorial_articles article
        where lower(article.id::text) = lower(btrim(coalesce(bank.source_id, '')))
      )
      and not exists (
        select 1
        from public.matchday_reference_composition_items composition_item
        where composition_item.source_id = bank.id
          and lower(btrim(coalesce(composition_item.source_type, ''))) in (
            'manual_link',
            'matchday_editorial_bank_item'
          )
      )
  ) then
    raise exception 'Postflight falhou: persistem artigos apagados livres ou arquivados no banco';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
      and bank.status = 'archived'
      and not exists (
        select 1
        from public.editorial_contents content
        where lower(content.id::text) = lower(btrim(coalesce(bank.source_id, '')))
      )
      and not exists (
        select 1
        from public.matchday_reference_composition_items composition_item
        where composition_item.source_id = bank.id
          and lower(btrim(coalesce(composition_item.source_type, ''))) in (
            'manual_link',
            'matchday_editorial_bank_item'
          )
      )
  ) then
    raise exception 'Postflight falhou: persistem conteúdos apagados livres ou arquivados no banco';
  end if;
end
$$;

select 'Postflight concluído: eliminar a origem limpa o banco livre ou arquivado e preserva itens usados em composições' as resultado;
