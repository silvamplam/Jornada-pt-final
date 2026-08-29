begin;

alter table public.matchday_editorial_profile_manual_overrides
  drop constraint matchday_editorial_profile_manual_overrides_placement_check;

alter table public.matchday_editorial_profile_manual_overrides
  add constraint matchday_editorial_profile_manual_overrides_placement_check
  check (
    (
      placement_target = 'bank'
      and zone_key is null
      and sort_order is null
    )
    or (
      placement_target = 'zone'
      and zone_key is not null
      and (
        sort_order is null
        or sort_order > 0
      )
    )
    or (
      placement_target = 'faixa'
      and zone_key is null
      and (
        sort_order is null
        or sort_order > 0
      )
    )
  );

comment on table public.matchday_editorial_profile_manual_overrides is
  'Manual placement state. Zone with null sort_order means manual zone membership ordered by actuality; a positive sort_order fixes the exact zone slot. Faixa with null sort_order means manual Faixa membership ordered by actuality; a positive sort_order fixes the exact Faixa slot.';

notify pgrst, 'reload schema';

commit;