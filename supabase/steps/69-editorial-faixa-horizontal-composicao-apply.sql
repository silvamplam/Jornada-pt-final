alter table public.site_editorial_horizontal_news
  add column if not exists label_color text;

alter table public.matchday_horizontal_news
  add column if not exists label_color text;

alter table public.matchday_editorial_bank_items
  add column if not exists label_color text;

alter table public.matchday_reference_composition_items
  add column if not exists label_color_snapshot text;

alter table public.site_editorial_horizontal_news
  drop constraint if exists site_editorial_horizontal_news_sort_order_check;

alter table public.site_editorial_horizontal_news
  add constraint site_editorial_horizontal_news_sort_order_check
  check (sort_order > 0);

alter table public.matchday_horizontal_news
  drop constraint if exists matchday_horizontal_news_sort_order_check;

alter table public.matchday_horizontal_news
  add constraint matchday_horizontal_news_sort_order_check
  check (sort_order > 0);

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    join pg_class table_row on table_row.oid = constraint_row.conrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'matchday_reference_composition_items'
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%source_type%'
  loop
    execute format(
      'alter table public.matchday_reference_composition_items drop constraint %I',
      constraint_name
    );
  end loop;

  alter table public.matchday_reference_composition_items
    add constraint matchday_reference_composition_items_source_type_check
    check (
      source_type in (
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
      )
    );
end
$$;

comment on table public.site_editorial_horizontal_news is
  'Notícias sem limite fixo da faixa horizontal publicada no fundo da Home.';

comment on table public.matchday_horizontal_news is
  'Notícias sem limite fixo da faixa horizontal publicada antes da classificação de cada jornada.';

comment on column public.site_editorial_horizontal_news.label_color is
  'Cor hexadecimal opcional do antetítulo; nulo mantém a cor normal do CSS.';

comment on column public.matchday_horizontal_news.label_color is
  'Cor hexadecimal opcional do antetítulo; nulo mantém a cor normal do CSS.';

comment on column public.matchday_editorial_bank_items.label_color is
  'Cor opcional do antetítulo preservada no banco editorial da jornada.';

comment on column public.matchday_reference_composition_items.label_color_snapshot is
  'Fotografia opcional da cor do antetítulo na composição editorial.';

notify pgrst, 'reload schema';
