alter table public.site_editorials
  add column if not exists side_block_label_color text;

alter table public.site_editorial_latest_news
  add column if not exists time_label_color text;

alter table public.matchday_editorials
  add column if not exists side_block_label_color text;

alter table public.matchday_latest_news
  add column if not exists time_label_color text;

comment on column public.site_editorials.side_block_label_color is
  'Cor hexadecimal opcional do antetítulo do bloco lateral da Home.';

comment on column public.site_editorial_latest_news.time_label_color is
  'Cor hexadecimal opcional do antetítulo de cada item da zona final da Home.';

comment on column public.matchday_editorials.side_block_label_color is
  'Cor hexadecimal opcional do antetítulo do bloco lateral da jornada.';

comment on column public.matchday_latest_news.time_label_color is
  'Cor hexadecimal opcional do antetítulo de cada item da zona final da jornada.';

notify pgrst, 'reload schema';
