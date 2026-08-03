begin;
set local transaction_read_only = on;

do $$
declare
  v_function_definition text;
begin
  select pg_catalog.pg_get_functiondef(function_row.oid)
  into v_function_definition
  from pg_catalog.pg_proc function_row
  where function_row.oid = to_regprocedure('public.remove_deleted_editorial_source_from_matchday_bank()');

  if v_function_definition is null
     or v_function_definition not ilike '%delete from public.matchday_reference_composition_items%'
     or v_function_definition not ilike '%delete from public.matchday_editorial_bank_items%' then
    raise exception 'Postflight falhou: a função não limpa composições internas e banco';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = to_regclass('public.editorial_articles')
      and trigger_row.tgname = 'remove_deleted_editorial_article_from_matchday_bank'
      and not trigger_row.tgisinternal
      and pg_catalog.pg_get_triggerdef(trigger_row.oid) ilike '%AFTER DELETE%'
  ) then
    raise exception 'Postflight falhou: trigger DELETE de artigos ausente';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = to_regclass('public.editorial_contents')
      and trigger_row.tgname = 'remove_deleted_editorial_content_from_matchday_bank'
      and not trigger_row.tgisinternal
      and pg_catalog.pg_get_triggerdef(trigger_row.oid) ilike '%AFTER DELETE%'
  ) then
    raise exception 'Postflight falhou: trigger DELETE de conteúdos ausente';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
      and not exists (
        select 1
        from public.editorial_articles article
        where lower(article.id::text) = lower(btrim(coalesce(bank.source_id, '')))
      )
  ) then
    raise exception 'Postflight falhou: persistem entradas de artigos eliminados no banco';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
      and not exists (
        select 1
        from public.editorial_contents content
        where lower(content.id::text) = lower(btrim(coalesce(bank.source_id, '')))
      )
  ) then
    raise exception 'Postflight falhou: persistem entradas de conteúdos eliminados no banco';
  end if;

  if exists (
    select 1
    from public.matchday_reference_composition_items composition_item
    where lower(btrim(coalesce(composition_item.source_type, ''))) in (
        'manual_link',
        'matchday_editorial_bank_item'
      )
      and not exists (
        select 1
        from public.matchday_editorial_bank_items bank
        where bank.id = composition_item.source_id
      )
  ) then
    raise exception 'Postflight falhou: persistem itens de composição ligados a entradas inexistentes';
  end if;
end
$$;

select 'Postflight concluído: origens eliminadas já não permanecem nas composições internas nem no banco; notícias existentes continuam preservadas' as resultado;

rollback;
