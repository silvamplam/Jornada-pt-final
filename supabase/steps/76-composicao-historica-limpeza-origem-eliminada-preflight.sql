do $$
declare
  missing_columns text[] := array[]::text[];
  required_column record;
begin
  if to_regclass('public.editorial_articles') is null then
    raise exception 'Preflight falhou: tabela public.editorial_articles ausente';
  end if;

  if to_regclass('public.editorial_contents') is null then
    raise exception 'Preflight falhou: tabela public.editorial_contents ausente';
  end if;

  if to_regclass('public.matchday_editorial_bank_items') is null then
    raise exception 'Preflight falhou: tabela public.matchday_editorial_bank_items ausente';
  end if;

  if to_regclass('public.matchday_reference_composition_items') is null then
    raise exception 'Preflight falhou: tabela public.matchday_reference_composition_items ausente';
  end if;

  for required_column in
    select *
    from (values
      ('editorial_articles', 'id'),
      ('editorial_contents', 'id'),
      ('matchday_editorial_bank_items', 'id'),
      ('matchday_editorial_bank_items', 'source_type'),
      ('matchday_editorial_bank_items', 'source_id'),
      ('matchday_editorial_bank_items', 'status'),
      ('matchday_reference_composition_items', 'source_type'),
      ('matchday_reference_composition_items', 'source_id')
    ) as required(table_name, column_name)
  loop
    if not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = required_column.table_name
        and column_name = required_column.column_name
    ) then
      missing_columns := array_append(
        missing_columns,
        required_column.table_name || '.' || required_column.column_name
      );
    end if;
  end loop;

  if cardinality(missing_columns) > 0 then
    raise exception 'Preflight falhou: colunas em falta: %', array_to_string(missing_columns, ', ');
  end if;

  if to_regprocedure('public.upsert_matchday_editorial_bank_publication(uuid,text,text,text,text,text,text,text,text)') is null then
    raise exception 'Preflight falhou: automatismo do banco histórico ainda não foi aplicado';
  end if;
end
$$;

select 'Preflight concluído: eliminação de origens pode limpar itens livres ou arquivados do banco sem tocar em itens usados na composição' as resultado;
