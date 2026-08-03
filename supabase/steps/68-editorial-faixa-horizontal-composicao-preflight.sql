do $$
declare
  missing_tables text[] := array[]::text[];
  existing_new_columns integer;
  limited_sort_constraints integer;
  unexpected_source_types text[];
begin
  if to_regclass('public.site_editorial_horizontal_news') is null then
    missing_tables := array_append(missing_tables, 'public.site_editorial_horizontal_news');
  end if;
  if to_regclass('public.matchday_horizontal_news') is null then
    missing_tables := array_append(missing_tables, 'public.matchday_horizontal_news');
  end if;
  if to_regclass('public.matchday_editorial_bank_items') is null then
    missing_tables := array_append(missing_tables, 'public.matchday_editorial_bank_items');
  end if;
  if to_regclass('public.matchday_reference_composition_items') is null then
    missing_tables := array_append(missing_tables, 'public.matchday_reference_composition_items');
  end if;

  if array_length(missing_tables, 1) is not null then
    raise exception 'Preflight falhou: tabelas em falta: %', array_to_string(missing_tables, ', ');
  end if;

  select count(*)
    into existing_new_columns
  from information_schema.columns
  where table_schema = 'public'
    and (table_name, column_name) in (
      ('site_editorial_horizontal_news', 'label_color'),
      ('matchday_horizontal_news', 'label_color'),
      ('matchday_editorial_bank_items', 'label_color'),
      ('matchday_reference_composition_items', 'label_color_snapshot')
    );

  select array_agg(distinct source_type order by source_type)
    into unexpected_source_types
  from public.matchday_reference_composition_items
  where source_type is not null
    and source_type not in (
      'matchday_editorial',
      'matchday_editorial_headline',
      'matchday_editorial_complement',
      'matchday_editorial_side_block',
      'matchday_highlight',
      'matchday_latest_news',
      'matchday_roundup_item',
      'matchday_horizontal_news',
      'matchday_reference_composition_item',
      'matchday_editorial_bank_item',
      'article',
      'editorial_content',
      'manual_link'
    );

  if array_length(unexpected_source_types, 1) is not null then
    raise exception 'Preflight falhou: source_type inesperado na composicao: %',
      array_to_string(unexpected_source_types, ', ');
  end if;

  select count(*)
    into limited_sort_constraints
  from pg_constraint constraint_row
  join pg_class table_row on table_row.oid = constraint_row.conrelid
  join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
  where schema_row.nspname = 'public'
    and table_row.relname in ('site_editorial_horizontal_news', 'matchday_horizontal_news')
    and constraint_row.contype = 'c'
    and pg_get_constraintdef(constraint_row.oid) ilike '%between 1 and 4%';

  raise notice 'Preflight: % de 4 colunas incrementais ja existem; % constraints ainda limitam a quatro posicoes',
    existing_new_columns,
    limited_sort_constraints;
end
$$;

select 'Preflight concluído: dependências disponíveis para cor, quantidade dinâmica e integração na composição' as resultado;
