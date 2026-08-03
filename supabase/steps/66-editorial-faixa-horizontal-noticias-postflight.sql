do $$
declare
  valid_tables integer;
  valid_columns integer;
  valid_constraints integer;
  valid_indexes integer;
begin
  select count(*)
    into valid_tables
  from information_schema.tables
  where table_schema = 'public'
    and table_name in ('site_editorial_horizontal_news', 'matchday_horizontal_news');

  if valid_tables <> 2 then
    raise exception 'Postflight falhou: esperadas 2 tabelas, encontradas %', valid_tables;
  end if;

  select count(*)
    into valid_columns
  from information_schema.columns
  where table_schema = 'public'
    and table_name in ('site_editorial_horizontal_news', 'matchday_horizontal_news')
    and column_name in (
      'id', 'label', 'title', 'subtitle', 'image_url', 'link_url',
      'sort_order', 'status', 'created_at', 'updated_at'
    );

  if valid_columns <> 20 then
    raise exception 'Postflight falhou: esperadas 20 colunas comuns, encontradas %', valid_columns;
  end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'site_editorial_horizontal_news'
      and column_name = 'site_editorial_id'
      and is_nullable = 'NO'
  ) or not exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matchday_horizontal_news'
      and column_name = 'matchday_id'
      and is_nullable = 'NO'
  ) then
    raise exception 'Postflight falhou: chaves editoriais obrigatorias em falta';
  end if;

  select count(*)
    into valid_constraints
  from information_schema.table_constraints
  where table_schema = 'public'
    and constraint_name in (
      'site_editorial_horizontal_news_sort_order_check',
      'site_editorial_horizontal_news_status_check',
      'site_editorial_horizontal_news_editorial_sort_unique',
      'matchday_horizontal_news_sort_order_check',
      'matchday_horizontal_news_status_check',
      'matchday_horizontal_news_matchday_sort_unique'
    );

  if valid_constraints <> 6 then
    raise exception 'Postflight falhou: esperadas 6 constraints funcionais, encontradas %', valid_constraints;
  end if;

  select count(*)
    into valid_indexes
  from pg_indexes
  where schemaname = 'public'
    and indexname in (
      'site_editorial_horizontal_news_public_idx',
      'matchday_horizontal_news_public_idx'
    );

  if valid_indexes <> 2 then
    raise exception 'Postflight falhou: esperados 2 indices publicos, encontrados %', valid_indexes;
  end if;
end
$$;

select 'Postflight concluído: tabelas, colunas, constraints e índices validados' as resultado;
