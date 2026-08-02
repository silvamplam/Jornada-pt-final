alter table public.site_editorial_highlights
  add column if not exists label_color text;

alter table public.matchday_highlights
  add column if not exists label_color text;

comment on column public.site_editorial_highlights.label_color is
  'Cor hexadecimal opcional do antetítulo de cada destaque da Home.';

comment on column public.matchday_highlights.label_color is
  'Cor hexadecimal opcional do antetítulo de cada destaque editorial da jornada.';
