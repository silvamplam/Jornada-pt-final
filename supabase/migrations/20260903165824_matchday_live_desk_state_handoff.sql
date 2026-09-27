begin;

-- ============================================================
-- LOTE 7B - CONTINUIDADE DO ESTADO COMPLETO DA MESA VIVA
--
-- A composicao historica certifica o instante do handoff. O universo de
-- conteudo vem exclusivamente das participacoes ativas e do estado live
-- autoritativo da Jornada source.
-- ============================================================

create function jornada_private.acquire_matchday_live_desk_handoff_lock()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  -- Writers de operação normal usam lock partilhado (6026,2). O handoff
  -- usa lock exclusivo na mesma chave para a barreira atômica (6026,2).
  perform pg_catalog.pg_advisory_xact_lock(6026, 2);
end;
$function$;

revoke all on function
  jornada_private.acquire_matchday_live_desk_handoff_lock()
from public, anon, authenticated, service_role;

comment on function
  jornada_private.acquire_matchday_live_desk_handoff_lock()
is
  'Hand-off barrier lock: normal operation uses advisory shared lock on (6026,2), while handoff acquires an exclusive advisory xact lock on the same key.';
create or replace function jornada_private.materialize_matchday_live_layout_continuity(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns table (
  materialized boolean,
  source_matchday_id uuid,
  target_matchday_id uuid,
  source_composition_id uuid,
  inherited_bank_count integer,
  inherited_zone_count integer,
  inherited_placement_count integer,
  inherited_latest_count integer,
  inherited_roundup_count integer
)
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
  v_plan jsonb := '[]'::jsonb;
  v_roundup_map jsonb := '{}'::jsonb;
  v_bank_count integer := 0;
  v_zone_count integer := 0;
  v_placement_count integer := 0;
  v_latest_count integer := 0;
  v_roundup_count integer := 0;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-continuity-invalid-envelope';
  end if;

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();

  -- Lock order is deterministic for normal publication and approved recovery.
  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id in (
    p_source_matchday_id,
    p_target_matchday_id
  )
  order by matchday_row.id
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

  if not found then
    raise exception 'matchday-live-continuity-matchday-not-found';
  end if;

  if v_source_season_id is distinct from v_target_season_id then
    raise exception 'matchday-live-continuity-season-mismatch';
  end if;

  if v_target_number <> v_source_number + 1 then
    raise exception 'matchday-live-continuity-target-not-consecutive';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = p_source_composition_id
      and composition_row.matchday_id = p_source_matchday_id
      and composition_row.status = 'published'
      and composition_row.is_current = true
  ) then
    raise exception 'matchday-live-continuity-composition-not-published';
  end if;

  -- A via normal observa a source ainda viva. A via de recovery exige que o
  -- target vivo aponte explicitamente para esta composicao carryover. Assim,
  -- uma Jornada historica como J03 nao pode ser reaberta por residuos live.
  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_source_matchday_id
      and desk_row.is_managed = true
  ) and not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_target_matchday_id
      and desk_row.is_managed = true
      and desk_row.carryover_source_composition_id = p_source_composition_id
  ) then
    raise exception 'matchday-live-continuity-source-not-live';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
       or transition_row.target_matchday_id = p_target_matchday_id
  ) then
    return query
    select
      false,
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      0,
      0,
      0,
      0,
      0;
    return;
  end if;

  -- Bank rows podem ser reutilizadas por identidade forte. Qualquer estrutura
  -- publica/compatibility target ja materializada torna o target incompativel.
  if exists (
    select 1
    from public.matchday_live_layout_placements as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_zones as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_blocks as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorials as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_highlights as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_horizontal_news as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_zone_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_latest_news as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_roundup_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-continuity-target-incompatible';
  end if;

  -- Matchday rows remain source-of-truth for source-target checks.
  perform 1
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_source_matchday_id
  order by bank_row.id
  for share;

  perform 1
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_source_matchday_id
  order by placement_row.id
  for share;

  perform 1
  from public.matchday_editorial_profile_manual_overrides as override_row
  where override_row.matchday_id = p_source_matchday_id
  order by override_row.id
  for share;

  perform 1
  from public.matchday_live_layout_bank_item_state_memory as memory_row
  where memory_row.matchday_id = p_source_matchday_id
  order by memory_row.bank_item_id
  for share;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_source_matchday_id
    group by placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-continuity-source-transversal-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
      and (
        nullif(pg_catalog.btrim(bank_row.source_type), '') is null
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) then
    raise exception 'matchday-live-continuity-source-identity-required';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.status, ''))
          ) <> 'active'
  ) then
    raise exception 'matchday-live-continuity-source-placement-inactive';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_live_layout_bank_item_state_memory as memory_row
      on memory_row.matchday_id = placement_row.matchday_id
     and memory_row.bank_item_id = placement_row.bank_item_id
    where placement_row.matchday_id = p_source_matchday_id
  ) then
    raise exception 'matchday-live-continuity-source-placement-memory-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    join public.matchday_editorial_profile_manual_overrides as override_row
      on override_row.matchday_id = bank_row.matchday_id
     and override_row.profile_key = 'liga_portugal_v1'
     and override_row.placement_target = 'bank'
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
    where bank_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
      and (
        exists (
          select 1
          from public.matchday_live_layout_placements as placement_row
          where placement_row.matchday_id = bank_row.matchday_id
            and placement_row.bank_item_id = bank_row.id
        )
        or exists (
          select 1
          from public.matchday_live_layout_bank_item_state_memory as memory_row
          where memory_row.matchday_id = bank_row.matchday_id
            and memory_row.bank_item_id = bank_row.id
        )
      )
  ) then
    raise exception 'matchday-live-continuity-source-explicit-bank-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = placement_row.matchday_id
     and projection_row.zone_id = placement_row.zone_id
    where placement_row.matchday_id = p_source_matchday_id
      and placement_row.placement_type = 'zone'
      and projection_row.zone_id is null
  ) then
    raise exception 'matchday-live-continuity-source-zone-unresolved';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as source_bank
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    where source_bank.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
      and (
        target_bank.continuity_source_matchday_id is not null
        and target_bank.continuity_source_matchday_id <>
          p_source_matchday_id
        or target_bank.continuity_source_composition_id is not null
        and target_bank.continuity_source_composition_id <>
          p_source_composition_id
      )
  ) then
    raise exception 'matchday-live-continuity-bank-provenance-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as source_bank
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and nullif(pg_catalog.btrim(target_bank.link_url), '') is not null
     and pg_catalog.lower(pg_catalog.btrim(target_bank.link_url)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.link_url))
    where source_bank.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
      and (
        pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
          is distinct from
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
        or pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
          is distinct from
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
      )
  ) then
    raise exception 'matchday-live-continuity-bank-link-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_source_matchday_id
      and editorial_row.complementary_roundup_item_id is not null
      and not exists (
        select 1
        from public.matchday_roundup_items as roundup_row
        where roundup_row.id = editorial_row.complementary_roundup_item_id
          and roundup_row.matchday_id = p_source_matchday_id
      )
  ) then
    raise exception 'matchday-live-continuity-roundup-reference-invalid';
  end if;

  insert into public.matchday_editorial_continuity_transitions (
    source_matchday_id,
    target_matchday_id,
    source_composition_id,
    continuity_version
  ) values (
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    6
  );

  perform pg_catalog.set_config(
    'jornada.thematic_continuity_initialize',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_faixa_reconcile',
    'on',
    true
  );

  insert into public.matchday_editorial_desk_control (
    matchday_id,
    is_managed,
    updated_at
  ) values (
    p_target_matchday_id,
    false,
    pg_catalog.now()
  )
  on conflict (matchday_id) do nothing;

  insert into public.matchday_editorial_profile_assignments (
    matchday_id,
    profile_key,
    created_at,
    updated_at
  ) values (
    p_target_matchday_id,
    'liga_portugal_v1',
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (matchday_id) do nothing;

  insert into public.matchday_editorial_profile_reconcile_control (
    matchday_id,
    profile_key,
    revision,
    last_applied_at,
    thematic_zone_order,
    thematic_zone_layouts,
    thematic_block_order,
    thematic_zone_titles,
    updated_at
  )
  select
    p_target_matchday_id,
    'liga_portugal_v1',
    0,
    null,
    coalesce(
      source_row.thematic_zone_order,
      array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ),
    coalesce(
      source_row.thematic_zone_layouts,
      '{"benfica":"six_news","sporting":"five_news_balanced","fc_porto":"five_news_balanced","other_liga_clubs":"six_news","outside_liga_other":"five_news_secondary"}'::jsonb
    ),
    coalesce(
      source_row.thematic_block_order,
      array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other',
        'latest',
        'video'
      ]::text[]
    ),
    coalesce(
      source_row.thematic_zone_titles,
      '{"benfica":"","sporting":"","fc_porto":"","other_liga_clubs":"","outside_liga_other":""}'::jsonb
    ),
    pg_catalog.now()
  from (values (1)) as singleton_row(dummy)
  left join public.matchday_editorial_profile_reconcile_control as source_row
    on source_row.matchday_id = p_source_matchday_id
   and source_row.profile_key = 'liga_portugal_v1';

  -- O Lote 3 ja e o construtor set-based das zonas/blocks e da ponte privada.
  perform jornada_private.sync_matchday_live_layout_shadow(
    array[p_target_matchday_id]::uuid[]
  );

  select pg_catalog.count(*)::integer
  into v_zone_count
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = p_target_matchday_id;

  with source_bank as materialized (
    select distinct
      bank_row.label,
      bank_row.label_color,
      bank_row.title,
      bank_row.subtitle,
      bank_row.image_url,
      bank_row.link_url,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
      bank_row.source_slug,
      bank_row.origin_slot_type,
      bank_row.sort_order,
      bank_row.status
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
  )
  insert into public.matchday_editorial_bank_items (
    matchday_id,
    label,
    label_color,
    title,
    subtitle,
    image_url,
    link_url,
    source_type,
    source_id,
    source_slug,
    origin_slot_type,
    sort_order,
    status,
    automatic_eligible,
    continuity_source_matchday_id,
    continuity_source_composition_id,
    created_at,
    updated_at
  )
  select
    p_target_matchday_id,
    source_row.label,
    source_row.label_color,
    source_row.title,
    source_row.subtitle,
    source_row.image_url,
    source_row.link_url,
    source_row.source_type,
    source_row.source_id,
    source_row.source_slug,
    source_row.origin_slot_type,
    source_row.sort_order,
    source_row.status,
    false,
    p_source_matchday_id,
    p_source_composition_id,
    pg_catalog.now(),
    pg_catalog.now()
  from source_bank as source_row
  where not exists (
    select 1
    from public.matchday_editorial_bank_items as target_bank
    where target_bank.matchday_id = p_target_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
        source_row.source_type
      and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
        source_row.source_id
  );

  with source_bank as materialized (
    select distinct
      bank_row.label,
      bank_row.label_color,
      bank_row.title,
      bank_row.subtitle,
      bank_row.image_url,
      bank_row.link_url,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
      bank_row.source_slug,
      bank_row.origin_slot_type,
      bank_row.sort_order,
      bank_row.status
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
  )
  update public.matchday_editorial_bank_items as target_bank
  set label = source_row.label,
      label_color = source_row.label_color,
      title = source_row.title,
      subtitle = source_row.subtitle,
      image_url = source_row.image_url,
      link_url = source_row.link_url,
      source_slug = source_row.source_slug,
      origin_slot_type = source_row.origin_slot_type,
      sort_order = source_row.sort_order,
      status = source_row.status,
      automatic_eligible = false,
      continuity_source_matchday_id = p_source_matchday_id,
      continuity_source_composition_id = p_source_composition_id,
      updated_at = pg_catalog.now()
  from source_bank as source_row
  where target_bank.matchday_id = p_target_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
      source_row.source_type
    and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
      source_row.source_id;

  select pg_catalog.count(*)::integer
  into v_bank_count
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_source_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active';

  -- Banco is an explicit editorial destination, not a tracking state. Only
  -- that authoritative intent is carried; zone/Faixa overrides remain
  -- compatibility projections of placements and are rebuilt below.
  insert into public.matchday_editorial_profile_manual_overrides (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    placement_target,
    zone_key,
    sort_order,
    created_at,
    updated_at
  )
  select
    p_target_matchday_id,
    'liga_portugal_v1',
    pg_catalog.lower(pg_catalog.btrim(source_bank.source_type)),
    pg_catalog.lower(pg_catalog.btrim(source_bank.source_id)),
    'bank',
    null,
    null,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_editorial_bank_items as source_bank
  join public.matchday_editorial_profile_manual_overrides as source_override
    on source_override.matchday_id = source_bank.matchday_id
   and source_override.profile_key = 'liga_portugal_v1'
   and source_override.placement_target = 'bank'
   and pg_catalog.lower(pg_catalog.btrim(source_override.source_type)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
   and pg_catalog.lower(pg_catalog.btrim(source_override.source_id)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
  where source_bank.matchday_id = p_source_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
  order by source_bank.id
  on conflict (matchday_id, profile_key, source_type, source_id)
  do update
  set placement_target = 'bank',
      zone_key = null,
      sort_order = null,
      updated_at = excluded.updated_at;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'action', 'place',
        'bank_item_id', target_bank.id,
        'placement_type', placement_row.placement_type,
        'zone_id', target_projection.zone_id,
        'slot_position', placement_row.slot_position
      )
      order by
        placement_row.placement_type,
        target_projection.zone_id nulls first,
        placement_row.slot_position,
        target_bank.id
    ),
    '[]'::jsonb
  )
  into v_plan
  from public.matchday_live_layout_placements as placement_row
  join public.matchday_editorial_bank_items as source_bank
    on source_bank.id = placement_row.bank_item_id
   and source_bank.matchday_id = placement_row.matchday_id
   and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
  join public.matchday_editorial_bank_items as target_bank
    on target_bank.matchday_id = p_target_matchday_id
   and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
   and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
  left join jornada_private.matchday_live_layout_zone_legacy_projection
    as source_projection
    on source_projection.matchday_id = p_source_matchday_id
   and source_projection.zone_id = placement_row.zone_id
  left join jornada_private.matchday_live_layout_zone_legacy_projection
    as target_projection
    on target_projection.matchday_id = p_target_matchday_id
   and target_projection.legacy_zone_key =
     source_projection.legacy_zone_key
  where placement_row.matchday_id = p_source_matchday_id;

  v_placement_count := pg_catalog.jsonb_array_length(v_plan);

  if v_placement_count > 0 then
    perform jornada_private.apply_matchday_live_layout_placement_plan(
      p_target_matchday_id,
      v_plan,
      false
    );
  end if;

  -- Memory is contextual, so remap it to the target Bank identity. NOVA has
  -- no row to copy. Explicit Banco has already been copied as an override and
  -- is deliberately excluded from memory.
  insert into public.matchday_live_layout_bank_item_state_memory (
    matchday_id,
    bank_item_id,
    memory_kind,
    recorded_at
  )
  select
    p_target_matchday_id,
    target_bank.id,
    source_memory.memory_kind,
    source_memory.recorded_at
  from public.matchday_live_layout_bank_item_state_memory as source_memory
  join public.matchday_editorial_bank_items as source_bank
    on source_bank.matchday_id = source_memory.matchday_id
   and source_bank.id = source_memory.bank_item_id
   and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
  join public.matchday_editorial_bank_items as target_bank
    on target_bank.matchday_id = p_target_matchday_id
   and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
   and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
   and target_bank.continuity_source_matchday_id = p_source_matchday_id
   and target_bank.continuity_source_composition_id = p_source_composition_id
  where source_memory.matchday_id = p_source_matchday_id
    and not exists (
      select 1
      from public.matchday_live_layout_placements as source_placement
      where source_placement.matchday_id = source_memory.matchday_id
        and source_placement.bank_item_id = source_memory.bank_item_id
    )
    and not exists (
      select 1
      from public.matchday_editorial_profile_manual_overrides
        as source_override
      where source_override.matchday_id = source_bank.matchday_id
        and source_override.profile_key = 'liga_portugal_v1'
        and source_override.placement_target = 'bank'
        and pg_catalog.lower(pg_catalog.btrim(source_override.source_type)) =
          pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
        and pg_catalog.lower(pg_catalog.btrim(source_override.source_id)) =
          pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    )
  order by target_bank.id
  on conflict (matchday_id, bank_item_id)
  do update
  set memory_kind = excluded.memory_kind,
      recorded_at = excluded.recorded_at;

  insert into public.matchday_latest_news (
    id,
    matchday_id,
    time_label,
    time_label_color,
    title,
    subtitle,
    link_url,
    image_url,
    article_id,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    p_target_matchday_id,
    source_row.time_label,
    source_row.time_label_color,
    source_row.title,
    source_row.subtitle,
    source_row.link_url,
    source_row.image_url,
    source_row.article_id,
    source_row.sort_order,
    source_row.status,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_latest_news as source_row
  where source_row.matchday_id = p_source_matchday_id
  order by source_row.sort_order, source_row.id;

  get diagnostics v_latest_count = row_count;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      source_row.id::text,
      gen_random_uuid()
    ),
    '{}'::jsonb
  )
  into v_roundup_map
  from public.matchday_roundup_items as source_row
  where source_row.matchday_id = p_source_matchday_id;

  insert into public.matchday_roundup_items (
    id,
    matchday_id,
    label,
    title,
    subtitle,
    image_url,
    video_url,
    duration,
    type,
    sort_order,
    status,
    match_id,
    youtube_video_id,
    youtube_channel_id,
    is_embeddable,
    source_candidate_id,
    created_at,
    updated_at
  )
  select
    (v_roundup_map ->> source_row.id::text)::uuid,
    p_target_matchday_id,
    source_row.label,
    source_row.title,
    source_row.subtitle,
    source_row.image_url,
    source_row.video_url,
    source_row.duration,
    source_row.type,
    source_row.sort_order,
    source_row.status,
    source_row.match_id,
    source_row.youtube_video_id,
    source_row.youtube_channel_id,
    source_row.is_embeddable,
    source_row.source_candidate_id,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_roundup_items as source_row
  where source_row.matchday_id = p_source_matchday_id
  order by source_row.sort_order, source_row.id;

  get diagnostics v_roundup_count = row_count;

  -- Estruturas compatibility que nao sao placements continuam materializadas
  -- para os readers atuais. live_four e sempre projetado a partir de placements.
  insert into public.matchday_live_layout_items (
    id,
    matchday_id,
    slot_type,
    article_id,
    label,
    title,
    subtitle,
    image_url,
    link_url,
    source_type,
    source_id,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    p_target_matchday_id,
    source_row.slot_type,
    source_row.article_id,
    source_row.label,
    source_row.title,
    source_row.subtitle,
    source_row.image_url,
    source_row.link_url,
    source_row.source_type,
    source_row.source_id,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_live_layout_items as source_row
  where source_row.matchday_id = p_source_matchday_id
    and source_row.slot_type not in (
      'live_four_news:1',
      'live_four_news:2',
      'live_four_news:3',
      'live_four_news:4'
    )
  order by source_row.slot_type, source_row.id;

  perform
    jornada_private.project_matchday_live_layout_placements_to_legacy(
      array[p_target_matchday_id]::uuid[]
    );

  -- Apenas apresentacao/estrutura funcional vem da editorial source. A
  -- identidade e os snapshots de ocupacao ja vieram do Bank/placements.
  update public.matchday_editorials as target_row
  set title_color = source_row.title_color,
      below_headline_mode = source_row.below_headline_mode,
      complementary_roundup_item_id = case
        when source_row.complementary_roundup_item_id is null then null
        else (
          v_roundup_map ->> source_row.complementary_roundup_item_id::text
        )::uuid
      end,
      complementary_text_color = source_row.complementary_text_color,
      roundup_video_heading = source_row.roundup_video_heading,
      roundup_video_heading_color = source_row.roundup_video_heading_color,
      below_headline_heading = source_row.below_headline_heading,
      below_headline_heading_color = source_row.below_headline_heading_color,
      latest_zone_mode = source_row.latest_zone_mode,
      latest_zone_title = source_row.latest_zone_title,
      below_headline_subtitle = source_row.below_headline_subtitle,
      latest_zone_title_color = source_row.latest_zone_title_color,
      latest_zone_placement = source_row.latest_zone_placement,
      side_block_type = case
        when target_row.side_block_status = 'published'
          then source_row.side_block_type
        else target_row.side_block_type
      end,
      side_block_title_color = source_row.side_block_title_color,
      side_block_author = source_row.side_block_author,
      updated_at = pg_catalog.now()
  from public.matchday_editorials as source_row
  where source_row.matchday_id = p_source_matchday_id
    and target_row.matchday_id = p_target_matchday_id;

  -- Completeness is proved before the caller can retire the source. The
  -- target identity is contextual and distinct, while canonical source
  -- identity and persisted classification key remain stable.
  if exists (
    select 1
    from public.matchday_editorial_bank_items as source_bank
    left join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    where source_bank.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
      and (
        target_bank.id is null
        or target_bank.id = source_bank.id
        or pg_catalog.lower(pg_catalog.btrim(target_bank.status)) <> 'active'
        or target_bank.automatic_eligible
        or target_bank.continuity_source_matchday_id is distinct from
          p_source_matchday_id
        or target_bank.continuity_source_composition_id is distinct from
          p_source_composition_id
        or target_bank.classification_key is distinct from
          source_bank.classification_key
      )
  ) then
    raise exception 'matchday-live-continuity-active-bank-incomplete';
  end if;

  if exists (
    with source_state as materialized (
      select
        source_bank.id as source_bank_item_id,
        pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
          as source_type,
        pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
          as source_id,
        placement_row.placement_type,
        placement_row.slot_position,
        case
          when placement_row.placement_type = 'zone'
            then source_zone.legacy_zone_key
          else null
        end as zone_key
      from public.matchday_live_layout_placements as placement_row
      join public.matchday_editorial_bank_items as source_bank
        on source_bank.matchday_id = placement_row.matchday_id
       and source_bank.id = placement_row.bank_item_id
      left join jornada_private.matchday_live_layout_zone_legacy_projection
        as source_zone
        on source_zone.matchday_id = placement_row.matchday_id
       and source_zone.zone_id = placement_row.zone_id
      where placement_row.matchday_id = p_source_matchday_id
    ),
    target_state as materialized (
      select
        pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
          as source_type,
        pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
          as source_id,
        placement_row.placement_type,
        placement_row.slot_position,
        case
          when placement_row.placement_type = 'zone'
            then target_zone.legacy_zone_key
          else null
        end as zone_key
      from public.matchday_live_layout_placements as placement_row
      join public.matchday_editorial_bank_items as target_bank
        on target_bank.matchday_id = placement_row.matchday_id
       and target_bank.id = placement_row.bank_item_id
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
    from source_state as source_row
    where not exists (
      select 1
      from target_state as target_row
      where target_row.source_type = source_row.source_type
        and target_row.source_id = source_row.source_id
        and target_row.placement_type = source_row.placement_type
        and target_row.slot_position = source_row.slot_position
        and target_row.zone_key is not distinct from source_row.zone_key
    )
  ) then
    raise exception 'matchday-live-continuity-placement-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as source_bank
    join public.matchday_editorial_profile_manual_overrides as source_override
      on source_override.matchday_id = source_bank.matchday_id
     and source_override.profile_key = 'liga_portugal_v1'
     and source_override.placement_target = 'bank'
     and pg_catalog.lower(pg_catalog.btrim(source_override.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(source_override.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    left join public.matchday_editorial_profile_manual_overrides
      as target_override
      on target_override.matchday_id = p_target_matchday_id
     and target_override.profile_key = 'liga_portugal_v1'
     and target_override.placement_target = 'bank'
     and pg_catalog.lower(pg_catalog.btrim(target_override.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_override.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
    where source_bank.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
      and (
        target_override.id is null
        or exists (
          select 1
          from public.matchday_live_layout_placements as target_placement
          where target_placement.matchday_id = p_target_matchday_id
            and target_placement.bank_item_id = target_bank.id
        )
        or exists (
          select 1
          from public.matchday_live_layout_bank_item_state_memory
            as target_memory
          where target_memory.matchday_id = p_target_matchday_id
            and target_memory.bank_item_id = target_bank.id
        )
      )
  ) then
    raise exception 'matchday-live-continuity-explicit-bank-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as source_memory
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.matchday_id = source_memory.matchday_id
     and source_bank.id = source_memory.bank_item_id
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    left join public.matchday_live_layout_bank_item_state_memory
      as target_memory
      on target_memory.matchday_id = p_target_matchday_id
     and target_memory.bank_item_id = target_bank.id
    where source_memory.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
      and not exists (
        select 1
        from public.matchday_editorial_profile_manual_overrides
          as source_override
        where source_override.matchday_id = source_bank.matchday_id
          and source_override.profile_key = 'liga_portugal_v1'
          and source_override.placement_target = 'bank'
          and pg_catalog.lower(pg_catalog.btrim(source_override.source_type)) =
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
          and pg_catalog.lower(pg_catalog.btrim(source_override.source_id)) =
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
      )
      and (
        target_memory.memory_kind is distinct from source_memory.memory_kind
        or exists (
          select 1
          from public.matchday_live_layout_placements as target_placement
          where target_placement.matchday_id = p_target_matchday_id
            and target_placement.bank_item_id = target_bank.id
        )
      )
  ) then
    raise exception 'matchday-live-continuity-memory-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as source_bank
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    where source_bank.matchday_id = p_source_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(source_bank.status)) = 'active'
      and not exists (
        select 1
        from public.matchday_live_layout_placements as source_placement
        where source_placement.matchday_id = source_bank.matchday_id
          and source_placement.bank_item_id = source_bank.id
      )
      and not exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as source_memory
        where source_memory.matchday_id = source_bank.matchday_id
          and source_memory.bank_item_id = source_bank.id
      )
      and not exists (
        select 1
        from public.matchday_editorial_profile_manual_overrides
          as source_override
        where source_override.matchday_id = source_bank.matchday_id
          and source_override.profile_key = 'liga_portugal_v1'
          and source_override.placement_target = 'bank'
          and pg_catalog.lower(pg_catalog.btrim(source_override.source_type)) =
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
          and pg_catalog.lower(pg_catalog.btrim(source_override.source_id)) =
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
      )
      and (
        exists (
          select 1
          from public.matchday_live_layout_placements as target_placement
          where target_placement.matchday_id = p_target_matchday_id
            and target_placement.bank_item_id = target_bank.id
        )
        or exists (
          select 1
          from public.matchday_live_layout_bank_item_state_memory as target_memory
          where target_memory.matchday_id = p_target_matchday_id
            and target_memory.bank_item_id = target_bank.id
        )
        or exists (
          select 1
          from public.matchday_editorial_profile_manual_overrides
            as target_override
          where target_override.matchday_id = p_target_matchday_id
            and target_override.profile_key = 'liga_portugal_v1'
            and target_override.placement_target = 'bank'
            and pg_catalog.lower(pg_catalog.btrim(target_override.source_type)) =
              pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
            and pg_catalog.lower(pg_catalog.btrim(target_override.source_id)) =
              pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
        )
      )
  ) then
    raise exception 'matchday-live-continuity-new-state-incomplete';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as target_bank
    where target_bank.matchday_id = p_target_matchday_id
      and target_bank.continuity_source_matchday_id = p_source_matchday_id
      and target_bank.continuity_source_composition_id =
        p_source_composition_id
      and (
        (
          exists (
            select 1
            from public.matchday_live_layout_placements as target_placement
            where target_placement.matchday_id = target_bank.matchday_id
              and target_placement.bank_item_id = target_bank.id
          )
          and exists (
            select 1
            from public.matchday_live_layout_bank_item_state_memory
              as target_memory
            where target_memory.matchday_id = target_bank.matchday_id
              and target_memory.bank_item_id = target_bank.id
          )
        )
        or (
          exists (
            select 1
            from public.matchday_editorial_profile_manual_overrides
              as target_override
            where target_override.matchday_id = target_bank.matchday_id
              and target_override.profile_key = 'liga_portugal_v1'
              and target_override.placement_target = 'bank'
              and pg_catalog.lower(
                    pg_catalog.btrim(target_override.source_type)
                  ) = pg_catalog.lower(
                    pg_catalog.btrim(target_bank.source_type)
                  )
              and pg_catalog.lower(
                    pg_catalog.btrim(target_override.source_id)
                  ) = pg_catalog.lower(
                    pg_catalog.btrim(target_bank.source_id)
                  )
          )
          and (
            exists (
              select 1
              from public.matchday_live_layout_placements as target_placement
              where target_placement.matchday_id = target_bank.matchday_id
                and target_placement.bank_item_id = target_bank.id
            )
            or exists (
              select 1
              from public.matchday_live_layout_bank_item_state_memory
                as target_memory
              where target_memory.matchday_id = target_bank.matchday_id
                and target_memory.bank_item_id = target_bank.id
            )
          )
        )
      )
  ) then
    raise exception 'matchday-live-continuity-target-state-conflict';
  end if;

  return query
  select
    true,
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    v_bank_count,
    v_zone_count,
    v_placement_count,
    v_latest_count,
    v_roundup_count;
end;
$function$;


revoke all on function
  jornada_private.materialize_matchday_live_layout_continuity(
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.materialize_matchday_live_layout_continuity(uuid, uuid, uuid)
is
  'Atomically hands off every active contextual Bank participation plus placements, explicit Banco and state memory. The historical composition is transition provenance only.';

-- ============================================================
-- FENCES FOR LIVE-DESK SURFACES WITHOUT CORE WRITER LOCKS
-- ============================================================

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_editorial_bank_items;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_live_layout_placements;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_editorial_profile_manual_overrides;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_live_layout_bank_item_state_memory;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_latest_news;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_roundup_items;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_editorial_desk_control;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_editorial_profile_reconcile_control;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_editorial_profile_assignments;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_live_layout_zones;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.matchday_live_layout_blocks;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.editorial_articles;

drop trigger if exists
  matchday_live_desk_handoff_writer_fence
on public.editorial_contents;

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_editorial_bank_items
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_live_layout_placements
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_editorial_profile_manual_overrides
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_live_layout_bank_item_state_memory
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_latest_news
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_roundup_items
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_editorial_desk_control
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_editorial_profile_reconcile_control
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_editorial_profile_assignments
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_live_layout_zones
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.matchday_live_layout_blocks
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.editorial_articles
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_desk_handoff_writer_fence
before insert or update or delete
on public.editorial_contents
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

-- ============================================================
-- ACTIVE THEMATIC APPLY: WRITER LOCK BEFORE ANY LIVE-DESK READ
-- ============================================================

alter function public.apply_matchday_editorial_profile_workspace_v11(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
rename to apply_matchday_editorial_profile_workspace_v11_pre_handoff;

alter function
  public.apply_matchday_editorial_profile_workspace_v11_pre_handoff(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
set schema jornada_private;

revoke all on function
  jornada_private.apply_matchday_editorial_profile_workspace_v11_pre_handoff(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
from public, anon, authenticated, service_role;

create function public.apply_matchday_editorial_profile_workspace_v11(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb,
  p_worked_source_ids jsonb,
  p_authoritative_zone_items jsonb,
  p_authoritative_faixa_items jsonb,
  p_displaced_bank_item_ids jsonb
)
returns table (
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  return query
  select *
  from jornada_private.apply_matchday_editorial_profile_workspace_v11_pre_handoff(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls,
    p_selection_bank_item_ids,
    p_video_module,
    p_worked_source_ids,
    p_authoritative_zone_items,
    p_authoritative_faixa_items,
    p_displaced_bank_item_ids
  );
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_profile_workspace_v11(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v11(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
to service_role;

comment on function
  public.apply_matchday_editorial_profile_workspace_v11(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
is
  'Serializes the active v11 thematic Apply against the exclusive live-desk handoff before any live-state read or row lock.';

-- ============================================================
-- ACTIVE LEGACY DESK APPLY: WRITER LOCK BEFORE LIVE-DESK GUARD
-- ============================================================

alter function public.apply_matchday_editorial_desk_state_v2(
  uuid,
  bigint,
  text,
  boolean,
  jsonb
)
rename to apply_matchday_editorial_desk_state_v2_pre_handoff;

alter function public.apply_matchday_editorial_desk_state_v2_pre_handoff(
  uuid,
  bigint,
  text,
  boolean,
  jsonb
)
set schema jornada_private;

revoke all on function
  jornada_private.apply_matchday_editorial_desk_state_v2_pre_handoff(
    uuid,
    bigint,
    text,
    boolean,
    jsonb
  )
from public, anon, authenticated, service_role;

create function public.apply_matchday_editorial_desk_state_v2(
  p_matchday_id uuid,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_faixa_visible boolean,
  p_articles jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  return jornada_private.apply_matchday_editorial_desk_state_v2_pre_handoff(
    p_matchday_id,
    p_expected_revision,
    p_expected_state_token,
    p_faixa_visible,
    p_articles
  );
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_desk_state_v2(
    uuid,
    bigint,
    text,
    boolean,
    jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_editorial_desk_state_v2(
    uuid,
    bigint,
    text,
    boolean,
    jsonb
  )
to service_role;

comment on function
  public.apply_matchday_editorial_desk_state_v2(
    uuid,
    bigint,
    text,
    boolean,
    jsonb
  )
is
  'Serializes the active legacy desk Apply against the exclusive live-desk handoff before any live-state guard or row lock.';

-- ============================================================
-- ACTIVE PROFILE ASSIGNMENT: WRITER LOCK BEFORE MATCHDAY ROW LOCK
-- ============================================================

alter function public.set_matchday_editorial_profile_assignment(
  uuid,
  text
)
rename to set_matchday_editorial_profile_assignment_pre_handoff;

alter function public.set_matchday_editorial_profile_assignment_pre_handoff(
  uuid,
  text
)
set schema jornada_private;

revoke all on function
  jornada_private.set_matchday_editorial_profile_assignment_pre_handoff(
    uuid,
    text
  )
from public, anon, authenticated, service_role;

create function public.set_matchday_editorial_profile_assignment(
  p_matchday_id uuid,
  p_profile_key text
)
returns text
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  return jornada_private.set_matchday_editorial_profile_assignment_pre_handoff(
    p_matchday_id,
    p_profile_key
  );
end;
$function$;

revoke all on function
  public.set_matchday_editorial_profile_assignment(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.set_matchday_editorial_profile_assignment(uuid, text)
to service_role;

comment on function
  public.set_matchday_editorial_profile_assignment(uuid, text)
is
  'Serializes profile assignment changes against the exclusive live-desk handoff before the Matchday row is locked.';

-- ============================================================
-- LEGACY RPC BYPASSES CLOSED AFTER WRITER BOUNDARIES
--
-- Os entry points ativos permanecem:
--   apply_matchday_editorial_profile_workspace_v11
--   apply_matchday_editorial_desk_state_v2
--   set_matchday_editorial_profile_assignment
--
-- As funções abaixo continuam acessíveis ao owner e aos wrappers
-- SECURITY DEFINER, mas deixam de ser portas RPC do service_role.
-- ============================================================

revoke all on function public.apply_matchday_editorial_desk_state(
  uuid,
  bigint,
  text,
  boolean,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all on function public.apply_matchday_editorial_profile_reconcile(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all on function public.apply_matchday_editorial_profile_reconcile_v2(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all on function public.apply_matchday_editorial_profile_workspace(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all on function public.apply_matchday_editorial_profile_workspace_v9(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all on function public.apply_matchday_editorial_profile_workspace_v10(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

revoke all on function public.refresh_matchday_editorial_profile_distribution(
  uuid
)
from public, anon, authenticated, service_role;

-- ============================================================
-- ENTRYPOINTS COM ORDEM DE LOCK REVISADA
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

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
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
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null then
    raise exception 'matchday-live-continuity-recovery-invalid-envelope';
  end if;

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
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

create or replace function public.publish_matchday_reference_composition(
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
  v_source_is_managed boolean;
  v_transition public.matchday_editorial_continuity_transitions%rowtype;
  v_has_transition boolean := false;
  v_transition_before jsonb;
  v_transition_after jsonb;
  v_published_id uuid;
  v_first_publication jsonb;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
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

  perform 1
  from public.matchdays as lock_row
  where lock_row.id = p_matchday_id
     or lock_row.id = v_next_matchday_id
  order by lock_row.id
  for update;

  select transition_row.*
  into v_transition
  from public.matchday_editorial_continuity_transitions as transition_row
  where transition_row.source_matchday_id = p_matchday_id
  for key share;

  v_has_transition := found;

  select source_desk.is_managed
  into v_source_is_managed
  from public.matchday_editorial_desk_control as source_desk
  where source_desk.matchday_id = p_matchday_id
  for update;

  if not found then
    raise exception 'composition_source_matchday_control_missing';
  end if;

  if v_has_transition then
    if v_transition.continuity_version <> 6
      or v_next_matchday_id is null
      or v_transition.target_matchday_id <> v_next_matchday_id
    then
      raise exception 'composition_historical_transition_v6_invalid';
    end if;

    if v_source_is_managed then
      raise exception 'composition_historical_source_still_live';
    end if;

    if not exists (
      select 1
      from jornada_private.matchday_live_layout_cutover_control as control_row
      where control_row.scope = 'live_layout'
        and control_row.authority_mode = 'authoritative'
    ) then
      raise exception 'composition_historical_authority_not_active';
    end if;

    if exists (
      select 1
      from public.matchday_live_layout_placements as source_placement
      where source_placement.matchday_id = p_matchday_id
    ) or exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as source_memory
      where source_memory.matchday_id = p_matchday_id
    ) then
      raise exception 'composition_historical_source_not_retired';
    end if;

    v_transition_before := pg_catalog.to_jsonb(v_transition);

    v_published_id := public.activate_matchday_reference_composition(
      p_matchday_id,
      p_composition_id,
      true
    );

    select pg_catalog.to_jsonb(transition_row)
    into v_transition_after
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_matchday_id;

    if v_transition_after is distinct from v_transition_before then
      raise exception 'composition_historical_transition_changed';
    end if;

    if exists (
      select 1
      from public.matchday_editorial_desk_control as source_desk
      where source_desk.matchday_id = p_matchday_id
        and source_desk.is_managed = true
    ) or exists (
      select 1
      from public.matchday_live_layout_placements as source_placement
      where source_placement.matchday_id = p_matchday_id
    ) or exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as source_memory
      where source_memory.matchday_id = p_matchday_id
    ) then
      raise exception 'composition_historical_republish_postcondition_failed';
    end if;

    return pg_catalog.jsonb_build_object(
      'publicationKind', 'historical_republish',
      'publishedCompositionId', v_published_id,
      'sourceMatchdayId', p_matchday_id,
      'nextMatchdayId', v_transition.target_matchday_id,
      'carryoverApplied', false,
      'materialized', false,
      'sourceRetired', true,
      'transitionPreserved', true
    );
  end if;

  if not v_source_is_managed then
    raise exception 'composition_first_publication_source_not_live';
  end if;

  v_first_publication :=
    public.publish_matchday_reference_composition_with_continuity(
      p_matchday_id,
      p_composition_id
    );

  return v_first_publication || pg_catalog.jsonb_build_object(
    'publicationKind', 'first_publication'
  );
end;
$function$;

revoke all on function
  public.publish_matchday_reference_composition(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_matchday_reference_composition(uuid, uuid)
to service_role;
commit;
