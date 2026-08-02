do $$
declare
  missing_tables text[] := array[]::text[];
  existing_columns text[] := array[]::text[];
begin
  if to_regclass('public.site_editorials') is null then
    missing_tables := array_append(missing_tables, 'public.site_editorials');
  end if;

  if to_regclass('public.site_editorial_latest_news') is null then
    missing_tables := array_append(missing_tables, 'public.site_editorial_latest_news');
  end if;

  if to_regclass('public.matchday_editorials') is null then
    missing_tables := array_append(missing_tables, 'public.matchday_editorials');
  end if;

  if to_regclass('public.matchday_latest_news') is null then
    missing_tables := array_append(missing_tables, 'public.matchday_latest_news');
  end if;

  if cardinality(missing_tables) > 0 then
    raise exception 'Tabelas em falta: %', array_to_string(missing_tables, ', ');
  end if;

  select coalesce(array_agg(format('%I.%I', table_name, column_name) order by table_name, column_name), array[]::text[])
  into existing_columns
  from information_schema.columns
  where table_schema = 'public'
    and (
      (table_name = 'site_editorials' and column_name = 'side_block_label_color')
      or (table_name = 'site_editorial_latest_news' and column_name = 'time_label_color')
      or (table_name = 'matchday_editorials' and column_name = 'side_block_label_color')
      or (table_name = 'matchday_latest_news' and column_name = 'time_label_color')
    );

  if cardinality(existing_columns) > 0 then
    raise exception 'O preflight esperava as colunas ausentes, mas encontrou: %', array_to_string(existing_columns, ', ');
  end if;
end $$;

select 'Preflight concluído: quatro tabelas disponíveis e colunas ainda ausentes' as resultado;
