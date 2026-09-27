begin;

alter table public.matchday_editorial_desk_control
  add column if not exists live_public_zone_order text[] not null
  default array[
    'video',
    'four_news',
    'six_news',
    'five_news_balanced',
    'five_news_secondary'
  ]::text[];

alter table public.matchday_editorial_desk_control
  drop constraint if exists matchday_editorial_desk_control_live_public_zone_order_check;

alter table public.matchday_editorial_desk_control
  add constraint matchday_editorial_desk_control_live_public_zone_order_check
  check (
    cardinality(live_public_zone_order) = 5
    and live_public_zone_order <@ array[
      'video',
      'four_news',
      'six_news',
      'five_news_balanced',
      'five_news_secondary'
    ]::text[]
    and array[
      'video',
      'four_news',
      'six_news',
      'five_news_balanced',
      'five_news_secondary'
    ]::text[] <@ live_public_zone_order
  );

comment on column public.matchday_editorial_desk_control.live_public_zone_order is
  'Ordem direta das zonas editoriais móveis na página pública viva da Jornada. Abertura e Faixa permanecem fixas.';

notify pgrst, 'reload schema';

commit;
