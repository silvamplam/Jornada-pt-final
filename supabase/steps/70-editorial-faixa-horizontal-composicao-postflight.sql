do $$
declare
  valid_columns integer;
  valid_sort_constraints integer;
  source_constraint_definition text;
begin
  select count(*)
    into valid_columns
  from information_schema.columns
  where table_schema = 'public'
    and (table_name, column_name) in (
      ('site_editorial_horizontal_news', 'label_color'),
      ('matchday_horizontal_news', 'label_color'),
      ('matchday_editorial_bank_items', 'label_color'),
      ('matchday_reference_composition_items', 'label_color_snapshot')
    );

  if valid_columns <> 4 then
    raise exception 'Postflight falhou: esperadas 4 colunas incrementais, encontradas %', valid_columns;
  end if;

  select count(*)
    into valid_sort_constraints
  from pg_constraint constraint_row
  join pg_class table_row on table_row.oid = constraint_row.conrelid
  join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
  where schema_row.nspname = 'public'
    and constraint_row.conname in (
      'site_editorial_horizontal_news_sort_order_check',
      'matchday_horizontal_news_sort_order_check'
    )
    and pg_get_constraintdef(constraint_row.oid) ilike '%sort_order > 0%';

  if valid_sort_constraints <> 2 then
    raise exception 'Postflight falhou: as duas faixas ainda nao aceitam posicoes superiores a quatro';
  end if;

  select pg_get_constraintdef(constraint_row.oid)
    into source_constraint_definition
  from pg_constraint constraint_row
  join pg_class table_row on table_row.oid = constraint_row.conrelid
  join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
  where schema_row.nspname = 'public'
    and table_row.relname = 'matchday_reference_composition_items'
    and constraint_row.conname = 'matchday_reference_composition_items_source_type_check';

  if source_constraint_definition is null
    or source_constraint_definition not ilike '%matchday_horizontal_news%' then
    raise exception 'Postflight falhou: a composição não aceita a fonte matchday_horizontal_news';
  end if;
end
$$;

select 'Postflight concluído: cores, posições dinâmicas e snapshot da composição validados' as resultado;
