do $$
declare
  valid_columns integer;
begin
  select count(*)
    into valid_columns
  from information_schema.columns
  where table_schema = 'public'
    and data_type = 'text'
    and (
      (table_name = 'site_editorial_highlights' and column_name = 'label_color')
      or (table_name = 'matchday_highlights' and column_name = 'label_color')
    );

  if valid_columns <> 2 then
    raise exception 'Postflight falhou: esperadas 2 colunas text, encontradas %', valid_columns;
  end if;
end
$$;

select 'Postflight concluído: duas colunas de cor validadas' as resultado;
