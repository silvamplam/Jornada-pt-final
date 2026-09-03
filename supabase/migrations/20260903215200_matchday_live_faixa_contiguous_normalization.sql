begin;

-- LOTE 7C2.1
-- One-time forward-only normalization before the v12 production cutover.
-- Only the currently managed live Matchday(s) with a sparse Faixa are touched.
-- Identity, relative editorial order, created_at and updated_at are preserved.

select jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

create temporary table matchday_live_faixa_normalization_7c2 (
  placement_id uuid primary key,
  matchday_id uuid not null,
  bank_item_id uuid not null,
  old_position integer not null,
  final_position integer not null,
  temporary_position integer not null,
  created_at timestamptz,
  updated_at timestamptz
)
on commit drop;

insert into matchday_live_faixa_normalization_7c2 (
  placement_id,
  matchday_id,
  bank_item_id,
  old_position,
  final_position,
  temporary_position,
  created_at,
  updated_at
)
with live_matchdays as materialized (
  select desk_row.matchday_id
  from public.matchday_editorial_desk_control as desk_row
  where desk_row.is_managed = true
),
live_faixa as materialized (
  select
    placement_row.id as placement_id,
    placement_row.matchday_id,
    placement_row.bank_item_id,
    placement_row.slot_position as old_position,
    pg_catalog.row_number() over (
      partition by placement_row.matchday_id
      order by
        placement_row.slot_position,
        placement_row.created_at,
        placement_row.id
    )::integer as final_position,
    pg_catalog.max(placement_row.slot_position) over (
      partition by placement_row.matchday_id
    ) as max_position,
    placement_row.created_at,
    placement_row.updated_at
  from public.matchday_live_layout_placements as placement_row
  join live_matchdays as live_row
    on live_row.matchday_id = placement_row.matchday_id
  where placement_row.placement_type = 'faixa'
),
gap_matchdays as materialized (
  select faixa_row.matchday_id
  from live_faixa as faixa_row
  group by faixa_row.matchday_id
  having pg_catalog.min(faixa_row.old_position) <> 1
     or pg_catalog.max(faixa_row.old_position) <> pg_catalog.count(*)
     or pg_catalog.count(distinct faixa_row.old_position) <> pg_catalog.count(*)
)
select
  faixa_row.placement_id,
  faixa_row.matchday_id,
  faixa_row.bank_item_id,
  faixa_row.old_position,
  faixa_row.final_position,
  faixa_row.max_position + faixa_row.final_position as temporary_position,
  faixa_row.created_at,
  faixa_row.updated_at
from live_faixa as faixa_row
join gap_matchdays as gap_row
  on gap_row.matchday_id = faixa_row.matchday_id
order by
  faixa_row.matchday_id,
  faixa_row.final_position;

do $locks$
begin
  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id in (
    select distinct normalization_row.matchday_id
    from matchday_live_faixa_normalization_7c2 as normalization_row
  )
  order by matchday_row.id
  for update;
end;
$locks$;

-- Phase 1 moves every affected Faixa row above its previous maximum.
-- This avoids the non-deferrable non-zone slot unique index while keeping
-- every placement row, bank identity and event timestamp intact.
update public.matchday_live_layout_placements as placement_row
set slot_position = normalization_row.temporary_position
from matchday_live_faixa_normalization_7c2 as normalization_row
where placement_row.id = normalization_row.placement_id;

-- Phase 2 writes the dense editorial order 1..N.
update public.matchday_live_layout_placements as placement_row
set slot_position = normalization_row.final_position
from matchday_live_faixa_normalization_7c2 as normalization_row
where placement_row.id = normalization_row.placement_id;

do $projection_and_postconditions$
declare
  v_matchday_ids uuid[];
begin
  select pg_catalog.array_agg(
    distinct normalization_row.matchday_id
    order by normalization_row.matchday_id
  )
  into v_matchday_ids
  from matchday_live_faixa_normalization_7c2 as normalization_row;

  if v_matchday_ids is null
    or pg_catalog.cardinality(v_matchday_ids) = 0
  then
    return;
  end if;

  perform jornada_private.project_matchday_live_layout_placements_to_legacy(
    v_matchday_ids
  );

  if exists (
    select 1
    from matchday_live_faixa_normalization_7c2 as normalization_row
    left join public.matchday_live_layout_placements as placement_row
      on placement_row.id = normalization_row.placement_id
    where placement_row.id is null
      or placement_row.matchday_id is distinct from
         normalization_row.matchday_id
      or placement_row.bank_item_id is distinct from
         normalization_row.bank_item_id
      or placement_row.placement_type is distinct from 'faixa'
      or placement_row.zone_id is not null
      or placement_row.slot_position is distinct from
         normalization_row.final_position
      or placement_row.created_at is distinct from
         normalization_row.created_at
      or placement_row.updated_at is distinct from
         normalization_row.updated_at
  ) then
    raise exception
      'matchday-live-faixa-normalization-identity-or-clock-changed';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = any(v_matchday_ids)
      and placement_row.placement_type = 'faixa'
    group by placement_row.matchday_id
    having pg_catalog.min(placement_row.slot_position) <> 1
       or pg_catalog.max(placement_row.slot_position) <> pg_catalog.count(*)
       or pg_catalog.count(distinct placement_row.slot_position)
          <> pg_catalog.count(*)
  ) then
    raise exception
      'matchday-live-faixa-normalization-still-sparse';
  end if;

  if exists (
    select target_row.matchday_id
    from pg_catalog.unnest(v_matchday_ids)
      as target_row(matchday_id)
    left join lateral (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.min(placement_row.slot_position) as min_position,
        pg_catalog.max(placement_row.slot_position) as max_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = target_row.matchday_id
        and placement_row.placement_type = 'faixa'
    ) as placement_state on true
    left join lateral (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.min(faixa_row.sort_order) as min_position,
        pg_catalog.max(faixa_row.sort_order) as max_position
      from public.matchday_horizontal_news as faixa_row
      where faixa_row.matchday_id = target_row.matchday_id
    ) as legacy_state on true
    where placement_state.item_count <> legacy_state.item_count
      or placement_state.min_position is distinct from
         legacy_state.min_position
      or placement_state.max_position is distinct from
         legacy_state.max_position
  ) then
    raise exception
      'matchday-live-faixa-normalization-legacy-mismatch';
  end if;
end;
$projection_and_postconditions$;

commit;