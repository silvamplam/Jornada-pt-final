do $$
declare
  missing_tables text[] := array[]::text[];
  missing_columns text[] := array[]::text[];
  duplicate_sources integer := 0;
  eligible_articles integer := 0;
  eligible_contents integer := 0;
  item record;
begin
  for item in
    select required.table_name, required.column_name
    from (values
      ('editorial_articles', 'id'),
      ('editorial_articles', 'slug'),
      ('editorial_articles', 'status'),
      ('editorial_articles', 'label'),
      ('editorial_articles', 'title'),
      ('editorial_articles', 'subtitle'),
      ('editorial_articles', 'image_url'),
      ('editorial_articles', 'matchday_id'),
      ('editorial_contents', 'id'),
      ('editorial_contents', 'slug'),
      ('editorial_contents', 'status'),
      ('editorial_contents', 'content_type'),
      ('editorial_contents', 'label'),
      ('editorial_contents', 'title'),
      ('editorial_contents', 'subtitle'),
      ('editorial_contents', 'summary'),
      ('editorial_contents', 'image_url'),
      ('editorial_contents', 'thumbnail_url'),
      ('editorial_contents', 'matchday_id'),
      ('matchday_editorial_bank_items', 'id'),
      ('matchday_editorial_bank_items', 'matchday_id'),
      ('matchday_editorial_bank_items', 'label'),
      ('matchday_editorial_bank_items', 'label_color'),
      ('matchday_editorial_bank_items', 'title'),
      ('matchday_editorial_bank_items', 'subtitle'),
      ('matchday_editorial_bank_items', 'image_url'),
      ('matchday_editorial_bank_items', 'link_url'),
      ('matchday_editorial_bank_items', 'source_type'),
      ('matchday_editorial_bank_items', 'source_id'),
      ('matchday_editorial_bank_items', 'source_slug'),
      ('matchday_editorial_bank_items', 'status'),
      ('matchday_reference_composition_items', 'composition_id'),
      ('matchday_reference_composition_items', 'source_type'),
      ('matchday_reference_composition_items', 'source_id')
    ) as required(table_name, column_name)
  loop
    if to_regclass(format('public.%I', item.table_name)) is null then
      if not item.table_name = any(missing_tables) then
        missing_tables := array_append(missing_tables, item.table_name);
      end if;
    elsif not exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = item.table_name
        and column_name = item.column_name
    ) then
      missing_columns := array_append(missing_columns, item.table_name || '.' || item.column_name);
    end if;
  end loop;

  if array_length(missing_tables, 1) is not null then
    raise exception 'Preflight falhou: tabelas em falta: %', array_to_string(missing_tables, ', ');
  end if;

  if array_length(missing_columns, 1) is not null then
    raise exception 'Preflight falhou: colunas em falta: %', array_to_string(missing_columns, ', ');
  end if;

  select count(*)
    into eligible_articles
  from public.editorial_articles
  where status = 'published'
    and matchday_id is not null;

  select count(*)
    into eligible_contents
  from public.editorial_contents
  where status = 'published'
    and matchday_id is not null;

  select count(*)
    into duplicate_sources
  from (
    select lower(btrim(source_type)), lower(btrim(source_id))
    from public.matchday_editorial_bank_items
    where lower(btrim(coalesce(source_type, ''))) in ('editorial_article', 'editorial_content')
      and nullif(btrim(source_id), '') is not null
    group by lower(btrim(source_type)), lower(btrim(source_id))
    having count(*) > 1
  ) duplicates;

  raise notice 'Preflight: % artigos e % conteudos publicados com jornada; % identidades automaticas duplicadas a reconciliar',
    eligible_articles,
    eligible_contents,
    duplicate_sources;
end
$$;

select 'Preflight concluído: publicações, banco, composição e dependências disponíveis para sincronização automática' as resultado;
