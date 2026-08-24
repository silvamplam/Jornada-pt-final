begin;

alter table public.matchday_editorial_profile_manual_overrides
  drop constraint matchday_editorial_profile_manual_overrides_placement_check;

alter table public.matchday_editorial_profile_manual_overrides
  add constraint matchday_editorial_profile_manual_overrides_placement_check
  check (
    (placement_target = 'bank' and zone_key is null and sort_order is null)
    or (
      placement_target = 'zone'
      and zone_key is not null
      and sort_order is not null
      and sort_order > 0
    )
    or (
      placement_target = 'faixa'
      and zone_key is null
      and (sort_order is null or sort_order > 0)
    )
  );

drop index public.matchday_editorial_profile_manual_overrides_faixa_slot_key;

create unique index matchday_editorial_profile_manual_overrides_faixa_slot_key
  on public.matchday_editorial_profile_manual_overrides (
    matchday_id,
    profile_key,
    sort_order
  )
  where placement_target = 'faixa'
    and sort_order is not null;

do $do$
declare
  v_def text;
  v_old_validation constant text := $old$payload.value ->> 'placement_target' = 'faixa'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null'
          and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
          and (payload.value ->> 'sort_order') ~ '^[1-9][0-9]*$'
        )$old$;
  v_new_validation constant text := $new$payload.value ->> 'placement_target' = 'faixa'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null'
          and (
            pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'null'
            or (
              pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
              and (payload.value ->> 'sort_order') ~ '^[1-9][0-9]*$'
            )
          )
        )$new$;
  v_old_duplicate constant text := $old$where payload.value ->> 'placement_target' = 'faixa'
    group by (payload.value ->> 'sort_order')::integer$old$;
  v_new_duplicate constant text := $new$where payload.value ->> 'placement_target' = 'faixa'
      and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
    group by (payload.value ->> 'sort_order')::integer$new$;
begin
  v_def := pg_catalog.pg_get_functiondef(
    'public.apply_matchday_editorial_profile_reconcile(uuid,text,bigint,text,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
  );

  if (
    (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_old_validation, '')))
      / pg_catalog.length(v_old_validation)
  ) <> 1 then
    raise exception 'thematic-faixa-membership-unexpected-reconcile-validation';
  end if;

  if (
    (pg_catalog.length(v_def) - pg_catalog.length(pg_catalog.replace(v_def, v_old_duplicate, '')))
      / pg_catalog.length(v_old_duplicate)
  ) <> 1 then
    raise exception 'thematic-faixa-membership-unexpected-reconcile-duplicate-check';
  end if;

  v_def := pg_catalog.replace(v_def, v_old_validation, v_new_validation);
  v_def := pg_catalog.replace(v_def, v_old_duplicate, v_new_duplicate);
  execute v_def;
end
$do$;

comment on table public.matchday_editorial_profile_manual_overrides is
  'Manual placement state. Zone decisions always fix an exact slot. Faixa with null sort_order means manual Faixa membership ordered by actuality; a positive sort_order fixes the exact Faixa slot.';

notify pgrst, 'reload schema';

commit;
