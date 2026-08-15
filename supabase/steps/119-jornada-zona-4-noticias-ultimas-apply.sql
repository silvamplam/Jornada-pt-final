begin;

alter table public.matchday_live_layout_items
  drop constraint if exists matchday_live_layout_items_slot_type_check;

alter table public.matchday_live_layout_items
  add constraint matchday_live_layout_items_slot_type_check check (
    slot_type in (
      'live_hierarchical:secondary_strong_1',
      'live_hierarchical:secondary_strong_2',
      'live_hierarchical:secondary_1',
      'live_hierarchical:secondary_2',
      'live_hierarchical:dominant_side_top',
      'live_hierarchical:dominant_side_bottom',
      'live_hierarchical:secondary_3',
      'live_hierarchical:secondary_4',
      'live_hierarchical:closing_1',
      'live_hierarchical:closing_2',
      'live_hierarchical:closing_3',
      'live_beyond_matchday:1',
      'live_beyond_matchday:2',
      'live_beyond_matchday:3',
      'live_beyond_matchday:4',
      'live_beyond_matchday:5',
      'live_four_news:1',
      'live_four_news:2',
      'live_four_news:3',
      'live_four_news:4'
    )
  );

alter table public.matchday_editorials
  drop constraint if exists matchday_editorials_latest_zone_placement_check;

alter table public.matchday_editorials
  add constraint matchday_editorials_latest_zone_placement_check
  check (latest_zone_placement in ('top', 'hidden', 'four_news'));

comment on column public.matchday_editorials.latest_zone_placement is
  'Presentation placement of Latest: top, hidden, or beside the four-news live layout.';

notify pgrst, 'reload schema';

commit;
