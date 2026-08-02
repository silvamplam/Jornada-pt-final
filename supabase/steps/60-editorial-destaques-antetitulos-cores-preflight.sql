do $$
declare
  missing_tables integer;
  existing_columns integer;
begin
  select count(*)
    into missing_tables
  from (
    values
      ('site_editorial_highlights'),
      ('matchday_highlights')
  ) as expected(table_name)
  where not exists (
    select 1
    from information_schema.tables
    where table_schema = 'public'
      and information_schema.tables.table_name = expected.table_name
  );

  if missing_tables <> 0 then
    raise exception 'Preflight falhou: faltam tabelas editoriais de destaques';
  end if;

  select count(*)
    into existing_columns
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'site_editorial_highlights' and column_name = 'label_color')
      or (table_name = 'matchday_highlights' and column_name = 'label_color')
    );

  if existing_columns <> 0 then
    raise exception 'Preflight falhou: uma ou mais colunas label_color ja existem';
  end if;
end
$$;

select 'Preflight concluído: duas tabelas disponíveis e colunas ainda ausentes' as resultado;
