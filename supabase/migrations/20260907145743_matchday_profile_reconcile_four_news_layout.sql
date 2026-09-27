begin;

alter table public.matchday_editorial_profile_reconcile_control
  drop constraint
    matchday_editorial_profile_reconcile_control_zone_layouts_check;

alter table public.matchday_editorial_profile_reconcile_control
  add constraint
    matchday_editorial_profile_reconcile_control_zone_layouts_check
  check (
    pg_catalog.jsonb_typeof(thematic_zone_layouts) = 'object'
    and thematic_zone_layouts ?& array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    ]
    and (
      thematic_zone_layouts - array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ) = '{}'::jsonb
    and thematic_zone_layouts ->> 'benfica'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary',
        'four_news'
      )
    and thematic_zone_layouts ->> 'sporting'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary',
        'four_news'
      )
    and thematic_zone_layouts ->> 'fc_porto'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary',
        'four_news'
      )
    and thematic_zone_layouts ->> 'other_liga_clubs'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary',
        'four_news'
      )
    and thematic_zone_layouts ->> 'outside_liga_other'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary',
        'four_news'
      )
  );

commit;
