do $$
declare
  valid_columns integer;
begin
  select count(*)
  into valid_columns
  from information_schema.columns
  where table_schema = 'public'
    and data_type = 'text'
    and is_nullable = 'YES'
    and (
      (table_name = 'site_editorials' and column_name = 'side_block_label_color')
      or (table_name = 'site_editorial_latest_news' and column_name = 'time_label_color')
      or (table_name = 'matchday_editorials' and column_name = 'side_block_label_color')
      or (table_name = 'matchday_latest_news' and column_name = 'time_label_color')
    );

  if valid_columns <> 4 then
    raise exception 'Postflight falhou: esperadas 4 colunas text nullable; encontradas %', valid_columns;
  end if;
end $$;

select 'Postflight concluído: quatro colunas de cor validadas' as resultado;
