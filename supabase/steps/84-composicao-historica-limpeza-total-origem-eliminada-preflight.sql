begin;
set local transaction_read_only = on;

do $$
declare
  v_required record;
  v_missing text[] := array[]::text[];
begin
  for v_required in
    select *
    from (values
      ('editorial_articles', 'id'),
      ('editorial_contents', 'id'),
      ('matchday_editorial_bank_items', 'id'),
      ('matchday_editorial_bank_items', 'source_type'),
      ('matchday_editorial_bank_items', 'source_id'),
      ('matchday_reference_composition_items', 'source_type'),
      ('matchday_reference_composition_items', 'source_id')
    ) as required(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns column_row
      where column_row.table_schema = 'public'
        and column_row.table_name = v_required.table_name
        and column_row.column_name = v_required.column_name
    ) then
      v_missing := array_append(v_missing, v_required.table_name || '.' || v_required.column_name);
    end if;
  end loop;

  if cardinality(v_missing) > 0 then
    raise exception 'Preflight falhou: colunas em falta: %', array_to_string(v_missing, ', ');
  end if;

  if to_regprocedure('public.remove_deleted_editorial_source_from_matchday_bank()') is null then
    raise exception 'Preflight falhou: função de limpeza de origens eliminadas ausente';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = to_regclass('public.editorial_articles')
      and trigger_row.tgname = 'remove_deleted_editorial_article_from_matchday_bank'
      and not trigger_row.tgisinternal
      and pg_catalog.pg_get_triggerdef(trigger_row.oid) ilike '%AFTER DELETE%'
  ) then
    raise exception 'Preflight falhou: trigger DELETE de artigos ausente';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = to_regclass('public.editorial_contents')
      and trigger_row.tgname = 'remove_deleted_editorial_content_from_matchday_bank'
      and not trigger_row.tgisinternal
      and pg_catalog.pg_get_triggerdef(trigger_row.oid) ilike '%AFTER DELETE%'
  ) then
    raise exception 'Preflight falhou: trigger DELETE de conteúdos ausente';
  end if;
end
$$;

select 'Preflight concluído: a proteção pública permanece na aplicação e a limpeza pós-eliminação pode remover composições internas e entradas órfãs do banco' as resultado;

rollback;
