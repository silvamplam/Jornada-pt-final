begin;

-- ============================================================
-- LOTE 6 / FECHO - RETIREMENT DA MESA VIVA SOURCE
--
-- Uma Jornada historica conserva a composicao publicada, mas deixa de
-- conservar qualquer representacao live. O mesmo helper serve publicacao,
-- recovery e a reparacao transacional da transicao v6 ja materializada.
-- ============================================================

create function jornada_private.retire_matchday_live_layout_source(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_target_season_id uuid;
  v_source_number integer;
  v_target_number integer;
  v_deleted_placement_count integer := 0;
  v_deleted_memory_count integer := 0;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-layout-retirement-invalid-envelope';
  end if;

  -- Mantem a mesma ordem global dos writers do cutover: superficies legacy,
  -- advisory fence partilhada e, depois, rows de Jornada em ordem UUID.
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id in (
    p_source_matchday_id,
    p_target_matchday_id
  )
  order by matchday_row.id
  for update;

  if (
    select pg_catalog.count(*)
    from public.matchdays as matchday_row
    where matchday_row.id in (
      p_source_matchday_id,
      p_target_matchday_id
    )
  ) <> 2 then
    raise exception 'matchday-live-layout-retirement-matchday-not-found';
  end if;

  perform 1
  from public.matchday_editorial_desk_control as desk_row
  where desk_row.matchday_id in (
    p_source_matchday_id,
    p_target_matchday_id
  )
  order by desk_row.matchday_id
  for update;

  select
    source_row.season_id,
    target_row.season_id,
    source_row.number,
    target_row.number
  into
    v_source_season_id,
    v_target_season_id,
    v_source_number,
    v_target_number
  from public.matchdays as source_row
  cross join public.matchdays as target_row
  where source_row.id = p_source_matchday_id
    and target_row.id = p_target_matchday_id;

  if v_source_season_id is distinct from v_target_season_id then
    raise exception 'matchday-live-layout-retirement-season-mismatch';
  end if;

  if v_target_number <> v_source_number + 1 then
    raise exception 'matchday-live-layout-retirement-target-not-consecutive';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_cutover_control as control_row
    where control_row.scope = 'live_layout'
      and control_row.authority_mode = 'authoritative'
  ) then
    raise exception 'matchday-live-layout-retirement-authority-not-active';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    join public.matchday_editorial_desk_control as target_desk
      on target_desk.matchday_id = p_target_matchday_id
    where source_desk.matchday_id = p_source_matchday_id
      and source_desk.is_managed = false
      and target_desk.is_managed = true
  ) then
    raise exception 'matchday-live-layout-retirement-live-state-mismatch';
  end if;

  perform 1
  from public.matchday_reference_compositions as composition_row
  where composition_row.id = p_source_composition_id
    and composition_row.matchday_id = p_source_matchday_id
    and composition_row.status = 'published'
    and composition_row.is_current = true
  for key share;

  if not found then
    raise exception 'matchday-live-layout-retirement-composition-invalid';
  end if;

  perform 1
  from public.matchday_editorial_continuity_transitions as transition_row
  where transition_row.source_matchday_id = p_source_matchday_id
    and transition_row.target_matchday_id = p_target_matchday_id
    and transition_row.source_composition_id = p_source_composition_id
    and transition_row.continuity_version = 6
  for key share;

  if not found then
    raise exception 'matchday-live-layout-retirement-transition-invalid';
  end if;

  -- A transition v6 so pode ficar committed se o materializador inteiro
  -- terminou. Como prova adicional antes de destruir a source live, cada
  -- placement source tem de existir no target com identidade Bank contextual,
  -- provenance da mesma transicao, tipo/slot iguais e zona contextual mapeada.
  if exists (
    with source_state as materialized (
      select
        placement_row.placement_type,
        placement_row.slot_position,
        case
          when placement_row.placement_type = 'zone'
            then source_zone.legacy_zone_key
          else null
        end as legacy_zone_key,
        pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
          as source_type,
        pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
          as source_id
      from public.matchday_live_layout_placements as placement_row
      join public.matchday_editorial_bank_items as source_bank
        on source_bank.id = placement_row.bank_item_id
       and source_bank.matchday_id = placement_row.matchday_id
      left join jornada_private.matchday_live_layout_zone_legacy_projection
        as source_zone
        on source_zone.matchday_id = placement_row.matchday_id
       and source_zone.zone_id = placement_row.zone_id
      where placement_row.matchday_id = p_source_matchday_id
    ),
    target_state as materialized (
      select
        placement_row.placement_type,
        placement_row.slot_position,
        case
          when placement_row.placement_type = 'zone'
            then target_zone.legacy_zone_key
          else null
        end as legacy_zone_key,
        pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
          as source_type,
        pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
          as source_id
      from public.matchday_live_layout_placements as placement_row
      join public.matchday_editorial_bank_items as target_bank
        on target_bank.id = placement_row.bank_item_id
       and target_bank.matchday_id = placement_row.matchday_id
      left join jornada_private.matchday_live_layout_zone_legacy_projection
        as target_zone
        on target_zone.matchday_id = placement_row.matchday_id
       and target_zone.zone_id = placement_row.zone_id
      where placement_row.matchday_id = p_target_matchday_id
        and target_bank.continuity_source_matchday_id = p_source_matchday_id
        and target_bank.continuity_source_composition_id =
          p_source_composition_id
    )
    select 1
    from (
      select
        source_row.placement_type,
        source_row.slot_position,
        source_row.legacy_zone_key,
        source_row.source_type,
        source_row.source_id
      from source_state as source_row

      except

      select
        target_row.placement_type,
        target_row.slot_position,
        target_row.legacy_zone_key,
        target_row.source_type,
        target_row.source_id
      from target_state as target_row
    ) as missing_target_row
  ) then
    raise exception 'matchday-live-layout-retirement-target-not-materialized';
  end if;

  delete from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_source_matchday_id;

  get diagnostics v_deleted_placement_count = row_count;

  -- O reconciler do Lote 5 pode criar markers transitorios pelo DELETE acima.
  -- Retirement estrutural apaga toda a memoria source na mesma transacao.
  delete from public.matchday_live_layout_bank_item_state_memory as memory_row
  where memory_row.matchday_id = p_source_matchday_id;

  get diagnostics v_deleted_memory_count = row_count;

  perform jornada_private.project_matchday_live_layout_placements_to_legacy(
    array[p_source_matchday_id]::uuid[]
  );

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_source_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_source_matchday_id
  ) then
    raise exception 'matchday-live-layout-retirement-postcondition-failed';
  end if;

  return pg_catalog.jsonb_build_object(
    'retired', true,
    'sourceMatchdayId', p_source_matchday_id,
    'targetMatchdayId', p_target_matchday_id,
    'sourceCompositionId', p_source_composition_id,
    'deletedPlacementCount', v_deleted_placement_count,
    'deletedMemoryCount', v_deleted_memory_count
  );
end;
$function$;

revoke all on function
  jornada_private.retire_matchday_live_layout_source(uuid, uuid, uuid)
from public, anon, authenticated, service_role;

comment on function
  jornada_private.retire_matchday_live_layout_source(uuid, uuid, uuid)
is
  'Atomically retires historical source live state only after a validated continuity v6 materialization. It never deletes historical composition or contextual Bank data.';

-- ============================================================
-- PUBLICACAO NORMAL: MATERIALIZA, MUDA A JORNADA VIVA E APOSENTA N
-- ============================================================

create or replace function
  public.publish_matchday_reference_composition_with_continuity(
    p_matchday_id uuid,
    p_composition_id uuid
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_source_number integer;
  v_next_matchday_id uuid;
  v_published_id uuid;
  v_materialized record;
  v_retired jsonb;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  select matchday_row.season_id, matchday_row.number
  into v_source_season_id, v_source_number
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id;

  if not found then
    raise exception 'composition_matchday_not_found';
  end if;

  select target_row.id
  into v_next_matchday_id
  from public.matchdays as target_row
  where target_row.season_id = v_source_season_id
    and target_row.number = v_source_number + 1;

  if not found then
    raise exception 'composition_next_matchday_not_found';
  end if;

  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_matchday_id, v_next_matchday_id)
  order by lock_row.id
  for update;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'composition_source_matchday_not_live';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions as target_composition
    where target_composition.matchday_id = v_next_matchday_id
      and target_composition.status = 'published'
      and target_composition.is_current = true
  ) then
    raise exception 'composition_next_matchday_already_published';
  end if;

  v_published_id := public.activate_matchday_reference_composition(
    p_matchday_id,
    p_composition_id,
    true
  );

  select *
  into v_materialized
  from jornada_private.materialize_matchday_live_layout_continuity(
    p_matchday_id,
    v_next_matchday_id,
    v_published_id
  );

  if not coalesce(v_materialized.materialized, false) then
    raise exception 'composition_continuity_not_materialized';
  end if;

  update public.matchday_editorial_desk_control as source_desk
  set is_managed = false,
      carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = pg_catalog.now()
  where source_desk.matchday_id = p_matchday_id;

  update public.matchday_editorial_desk_control as target_desk
  set is_managed = true,
      carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = pg_catalog.now()
  where target_desk.matchday_id = v_next_matchday_id;

  if not found then
    raise exception 'composition_next_matchday_control_missing';
  end if;

  v_retired := jornada_private.retire_matchday_live_layout_source(
    p_matchday_id,
    v_next_matchday_id,
    v_published_id
  );

  if not coalesce((v_retired ->> 'retired')::boolean, false) then
    raise exception 'composition_source_live_state_not_retired';
  end if;

  return pg_catalog.jsonb_build_object(
    'publishedCompositionId', v_published_id,
    'sourceMatchdayId', p_matchday_id,
    'nextMatchdayId', v_next_matchday_id,
    'carryoverApplied', true,
    'materialized', true,
    'sourceRetired', true,
    'inheritedBankCount', v_materialized.inherited_bank_count,
    'inheritedZoneCount', v_materialized.inherited_zone_count,
    'inheritedPlacementCount', v_materialized.inherited_placement_count,
    'inheritedLatestCount', v_materialized.inherited_latest_count,
    'inheritedRoundupCount', v_materialized.inherited_roundup_count
  );
end;
$function$;

revoke all on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
to service_role;

-- ============================================================
-- RECOVERY: MATERIALIZA, LIMPA CARRYOVER E APOSENTA A SOURCE
-- ============================================================

create or replace function public.recover_matchday_live_layout_continuity(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_materialized record;
  v_retired jsonb;
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_source_matchday_id, p_target_matchday_id)
  order by lock_row.id
  for update;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as target_desk
    where target_desk.matchday_id = p_target_matchday_id
      and target_desk.is_managed = true
      and target_desk.carryover_source_composition_id =
        p_source_composition_id
  ) then
    raise exception 'matchday-live-continuity-recovery-manifest-mismatch';
  end if;

  select *
  into v_materialized
  from jornada_private.materialize_matchday_live_layout_continuity(
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id
  );

  if not coalesce(v_materialized.materialized, false) then
    raise exception 'matchday-live-continuity-recovery-not-materialized';
  end if;

  update public.matchday_editorial_desk_control as target_desk
  set carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = pg_catalog.now()
  where target_desk.matchday_id = p_target_matchday_id
    and target_desk.is_managed = true;

  v_retired := jornada_private.retire_matchday_live_layout_source(
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id
  );

  if not coalesce((v_retired ->> 'retired')::boolean, false) then
    raise exception 'matchday-live-continuity-recovery-source-not-retired';
  end if;

  return pg_catalog.jsonb_build_object(
    'recovered', true,
    'sourceRetired', true,
    'sourceMatchdayId', p_source_matchday_id,
    'targetMatchdayId', p_target_matchday_id,
    'sourceCompositionId', p_source_composition_id,
    'inheritedBankCount', v_materialized.inherited_bank_count,
    'inheritedZoneCount', v_materialized.inherited_zone_count,
    'inheritedPlacementCount', v_materialized.inherited_placement_count,
    'inheritedLatestCount', v_materialized.inherited_latest_count,
    'inheritedRoundupCount', v_materialized.inherited_roundup_count
  );
end;
$function$;

revoke all on function public.recover_matchday_live_layout_continuity(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.recover_matchday_live_layout_continuity(
  uuid, uuid, uuid
) to service_role;

-- ============================================================
-- REPAIR TRANSACIONAL DA UNICA SOURCE V6 HISTORICA AINDA LIVE
-- ============================================================

create temporary table matchday_live_layout_source_retirement_repair (
  source_matchday_id uuid primary key,
  target_matchday_id uuid not null unique,
  source_composition_id uuid not null,
  source_composition_hash text not null,
  source_items_hash text not null,
  source_bank_hash text not null,
  source_zones_hash text not null,
  source_blocks_hash text not null,
  target_placements_hash text not null,
  target_bank_hash text not null,
  target_zones_hash text not null,
  target_blocks_hash text not null,
  target_latest_hash text not null,
  target_roundup_hash text not null,
  target_memory_hash text not null
) on commit drop;

insert into matchday_live_layout_source_retirement_repair (
  source_matchday_id,
  target_matchday_id,
  source_composition_id,
  source_composition_hash,
  source_items_hash,
  source_bank_hash,
  source_zones_hash,
  source_blocks_hash,
  target_placements_hash,
  target_bank_hash,
  target_zones_hash,
  target_blocks_hash,
  target_latest_hash,
  target_roundup_hash,
  target_memory_hash
)
select
  transition_row.source_matchday_id,
  transition_row.target_matchday_id,
  transition_row.source_composition_id,
  pg_catalog.md5(pg_catalog.to_jsonb(composition_row)::text),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(item_row)
      order by item_row.id
    )::text
    from public.matchday_reference_composition_items as item_row
    where item_row.composition_id = transition_row.source_composition_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row)
      order by bank_row.id
    )::text
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = transition_row.source_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(zone_row)
      order by zone_row.id
    )::text
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = transition_row.source_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(block_row)
      order by block_row.id
    )::text
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = transition_row.source_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(placement_row)
      order by placement_row.id
    )::text
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = transition_row.target_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row)
      order by bank_row.id
    )::text
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = transition_row.target_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(zone_row)
      order by zone_row.id
    )::text
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = transition_row.target_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(block_row)
      order by block_row.id
    )::text
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = transition_row.target_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(latest_row)
      order by latest_row.id
    )::text
    from public.matchday_latest_news as latest_row
    where latest_row.matchday_id = transition_row.target_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(roundup_row)
      order by roundup_row.id
    )::text
    from public.matchday_roundup_items as roundup_row
    where roundup_row.matchday_id = transition_row.target_matchday_id
  ), '[]')),
  pg_catalog.md5(coalesce((
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(memory_row)
      order by memory_row.matchday_id, memory_row.bank_item_id
    )::text
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = transition_row.target_matchday_id
  ), '[]'))
from public.matchday_editorial_continuity_transitions as transition_row
join public.matchdays as source_matchday
  on source_matchday.id = transition_row.source_matchday_id
join public.matchdays as target_matchday
  on target_matchday.id = transition_row.target_matchday_id
join public.matchday_editorial_desk_control as source_desk
  on source_desk.matchday_id = transition_row.source_matchday_id
join public.matchday_editorial_desk_control as target_desk
  on target_desk.matchday_id = transition_row.target_matchday_id
join public.matchday_reference_compositions as composition_row
  on composition_row.id = transition_row.source_composition_id
 and composition_row.matchday_id = transition_row.source_matchday_id
where transition_row.continuity_version = 6
  and source_matchday.season_id = target_matchday.season_id
  and target_matchday.number = source_matchday.number + 1
  and source_desk.is_managed = false
  and target_desk.is_managed = true
  and composition_row.status = 'published'
  and composition_row.is_current = true
  and exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = transition_row.source_matchday_id
  );

do $repair_cardinality$
declare
  v_candidate_count integer;
begin
  select pg_catalog.count(*)::integer
  into v_candidate_count
  from matchday_live_layout_source_retirement_repair;

  if v_candidate_count <> 1 then
    raise exception
      'matchday-live-layout-retirement-repair-candidate-count:%',
      v_candidate_count;
  end if;
end;
$repair_cardinality$;

select jornada_private.retire_matchday_live_layout_source(
  repair_row.source_matchday_id,
  repair_row.target_matchday_id,
  repair_row.source_composition_id
)
from matchday_live_layout_source_retirement_repair as repair_row;

-- Executa o drift guard deferido ainda dentro da migration. Assim queue=0 e
-- qualquer divergencia faz rollback do repair e das redefinicoes de funcao.
set constraints all immediate;

do $repair_postconditions$
begin
  if exists (
    select 1
    from matchday_live_layout_source_retirement_repair as repair_row
    where exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = repair_row.source_matchday_id
    )
       or exists (
         select 1
         from public.matchday_live_layout_bank_item_state_memory as memory_row
         where memory_row.matchday_id = repair_row.source_matchday_id
       )
       or not exists (
         select 1
         from public.matchday_editorial_desk_control as source_desk
         where source_desk.matchday_id = repair_row.source_matchday_id
           and source_desk.is_managed = false
       )
       or not exists (
         select 1
         from public.matchday_editorial_desk_control as target_desk
         where target_desk.matchday_id = repair_row.target_matchday_id
           and target_desk.is_managed = true
       )
  ) then
    raise exception 'matchday-live-layout-retirement-repair-state-failed';
  end if;

  if exists (
    select 1
    from matchday_live_layout_source_retirement_repair as repair_row
    join public.matchday_reference_compositions as composition_row
      on composition_row.id = repair_row.source_composition_id
    where repair_row.source_composition_hash <>
        pg_catalog.md5(pg_catalog.to_jsonb(composition_row)::text)
      or repair_row.source_items_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(item_row)
          order by item_row.id
        )::text
        from public.matchday_reference_composition_items as item_row
        where item_row.composition_id = repair_row.source_composition_id
      ), '[]'))
      or repair_row.source_bank_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(bank_row)
          order by bank_row.id
        )::text
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.matchday_id = repair_row.source_matchday_id
      ), '[]'))
      or repair_row.source_zones_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(zone_row)
          order by zone_row.id
        )::text
        from public.matchday_live_layout_zones as zone_row
        where zone_row.matchday_id = repair_row.source_matchday_id
      ), '[]'))
      or repair_row.source_blocks_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(block_row)
          order by block_row.id
        )::text
        from public.matchday_live_layout_blocks as block_row
        where block_row.matchday_id = repair_row.source_matchday_id
      ), '[]'))
  ) then
    raise exception 'matchday-live-layout-retirement-repair-history-mutated';
  end if;

  if exists (
    select 1
    from matchday_live_layout_source_retirement_repair as repair_row
    where repair_row.target_placements_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(placement_row)
          order by placement_row.id
        )::text
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = repair_row.target_matchday_id
      ), '[]'))
      or repair_row.target_bank_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(bank_row)
          order by bank_row.id
        )::text
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.matchday_id = repair_row.target_matchday_id
      ), '[]'))
      or repair_row.target_zones_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(zone_row)
          order by zone_row.id
        )::text
        from public.matchday_live_layout_zones as zone_row
        where zone_row.matchday_id = repair_row.target_matchday_id
      ), '[]'))
      or repair_row.target_blocks_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(block_row)
          order by block_row.id
        )::text
        from public.matchday_live_layout_blocks as block_row
        where block_row.matchday_id = repair_row.target_matchday_id
      ), '[]'))
      or repair_row.target_latest_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(latest_row)
          order by latest_row.id
        )::text
        from public.matchday_latest_news as latest_row
        where latest_row.matchday_id = repair_row.target_matchday_id
      ), '[]'))
      or repair_row.target_roundup_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(roundup_row)
          order by roundup_row.id
        )::text
        from public.matchday_roundup_items as roundup_row
        where roundup_row.matchday_id = repair_row.target_matchday_id
      ), '[]'))
      or repair_row.target_memory_hash <> pg_catalog.md5(coalesce((
        select pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(memory_row)
          order by memory_row.matchday_id, memory_row.bank_item_id
        )::text
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = repair_row.target_matchday_id
      ), '[]'))
  ) then
    raise exception 'matchday-live-layout-retirement-repair-target-mutated';
  end if;

  if exists (
    select 1
    from matchday_live_layout_source_retirement_repair as repair_row
    where not exists (
      select 1
      from public.matchday_editorial_continuity_transitions as transition_row
      where transition_row.source_matchday_id = repair_row.source_matchday_id
        and transition_row.target_matchday_id = repair_row.target_matchday_id
        and transition_row.source_composition_id =
          repair_row.source_composition_id
        and transition_row.continuity_version = 6
    )
  ) then
    raise exception 'matchday-live-layout-retirement-repair-transition-lost';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    group by placement_row.matchday_id, placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-retirement-repair-duplicate';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
        'public.matchday_live_layout_placements'::regclass
      and constraint_row.conname =
        'matchday_live_layout_placements_matchday_bank_key'
      and constraint_row.contype = 'u'
      and constraint_row.condeferrable = true
      and constraint_row.condeferred = true
  ) then
    raise exception 'matchday-live-layout-retirement-repair-unique-lost';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_cutover_control as control_row
    where control_row.scope = 'live_layout'
      and control_row.authority_mode = 'authoritative'
  ) then
    raise exception 'matchday-live-layout-retirement-repair-authority-lost';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
  ) then
    raise exception 'matchday-live-layout-retirement-repair-queue-not-empty';
  end if;
end;
$repair_postconditions$;

notify pgrst, 'reload schema';

commit;
