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
      ('editorial_articles', 'slug'),
      ('editorial_contents', 'id'),
      ('editorial_contents', 'slug'),
      ('matchday_editorial_bank_items', 'id'),
      ('matchday_editorial_bank_items', 'source_type'),
      ('matchday_editorial_bank_items', 'source_id'),
      ('matchday_editorial_bank_items', 'source_slug'),
      ('matchday_editorial_bank_items', 'link_url'),
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
end
$$;

with normalized_bank as (
  select
    bank.*,
    lower(
      btrim(
        coalesce(
          nullif(bank.source_slug, ''),
          regexp_replace(
            regexp_replace(
              split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1),
              '/+$',
              ''
            ),
            '^.*/',
            ''
          )
        )
      )
    ) as normalized_slug
  from public.matchday_editorial_bank_items bank
  where lower(btrim(coalesce(bank.source_type, ''))) = 'matchday_horizontal_news'
    and coalesce(bank.link_url, '') like '/noticias/%'
),
orphan_rows as (
  select bank.id
  from normalized_bank bank
  where bank.normalized_slug <> ''
    and not exists (
      select 1
      from public.editorial_articles article
      where lower(article.id::text) = lower(btrim(coalesce(bank.source_id, '')))
         or lower(btrim(article.slug)) = bank.normalized_slug
    )
    and not exists (
      select 1
      from public.editorial_contents content
      where lower(content.id::text) = lower(btrim(coalesce(bank.source_id, '')))
         or lower(btrim(content.slug)) = bank.normalized_slug
    )
)
select
  'Preflight concluído: a limpeza idempotente do legado matchday_horizontal_news pode ser aplicada' as resultado,
  count(*) as candidatos_atuais
from orphan_rows;

rollback;
