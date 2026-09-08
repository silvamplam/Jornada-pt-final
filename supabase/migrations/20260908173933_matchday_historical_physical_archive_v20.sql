begin;

-- ============================================================
-- HISTORICAL PHYSICAL ARCHIVE V20
--
-- V19 remains the immutable record of the original handoff. Its broad hash
-- also covered editorial/compatibility projections that legitimately evolve
-- after retirement. V20 adds a separate, componentized certificate for the
-- semantic physical core and never reads the target's current live state.
--
-- V19 IMMUTABLE_PHYSICAL components:
--   zones, blocks, settings, cutover, assignment, placements, overrides,
--   memory. For overrides, only placement_target = 'bank' is authoritative
--   physical state in v18/v20; legacy placement overrides are projections.
--
-- V19 EVOLVING_EDITORIAL/derived compatibility components:
--   projection, bank, latest, roundup, layout_items, editorials, highlights,
--   horizontal, zone_items, state_items.
-- ============================================================

create table
jornada_private.matchday_historical_physical_archive_certificates_v20 (
  id uuid primary key default gen_random_uuid(),
  handoff_id uuid not null,
  topology_transition_id uuid not null,
  carryover_id uuid not null,
  source_matchday_id uuid not null,
  target_matchday_id uuid not null,
  source_composition_id uuid not null,
  v19_source_archive_hash text not null,
  physical_core_hash text not null,
  zones_hash text not null,
  blocks_hash text not null,
  settings_hash text not null,
  cutover_hash text not null,
  assignment_hash text not null,
  placements_hash text not null,
  explicit_bank_hash text not null,
  memory_hash text not null,
  certification_basis text not null,
  certified_at timestamptz not null
    default pg_catalog.statement_timestamp(),

  constraint matchday_historical_physical_archive_v20_handoff_key
    unique (handoff_id),

  constraint matchday_historical_physical_archive_v20_source_key
    unique (source_matchday_id),

  constraint matchday_historical_physical_archive_v20_topology_key
    unique (topology_transition_id),

  constraint matchday_historical_physical_archive_v20_carryover_key
    unique (carryover_id),

  constraint matchday_historical_physical_archive_v20_handoff_fk
    foreign key (handoff_id, source_matchday_id, target_matchday_id)
    references
      jornada_private.matchday_live_layout_physical_handoffs (
        id,
        source_matchday_id,
        target_matchday_id
      )
    on delete restrict,

  constraint matchday_historical_physical_archive_v20_topology_fk
    foreign key (topology_transition_id)
    references
      jornada_private.matchday_live_layout_physical_topology_transitions(id)
    on delete restrict,

  constraint matchday_historical_physical_archive_v20_carryover_fk
    foreign key (carryover_id)
    references jornada_private.matchday_live_layout_physical_carryovers(id)
    on delete restrict,

  constraint matchday_historical_physical_archive_v20_composition_fk
    foreign key (source_composition_id)
    references public.matchday_reference_compositions(id)
    on delete restrict,

  constraint matchday_historical_physical_archive_v20_pair_check
    check (source_matchday_id <> target_matchday_id),

  constraint matchday_historical_physical_archive_v20_basis_check
    check (certification_basis in ('atomic_handoff', 'audited_backfill')),

  constraint matchday_historical_physical_archive_v20_hashes_check
    check (
      v19_source_archive_hash ~ '^[0-9a-f]{32}$'
      and physical_core_hash ~ '^[0-9a-f]{32}$'
      and zones_hash ~ '^[0-9a-f]{32}$'
      and blocks_hash ~ '^[0-9a-f]{32}$'
      and settings_hash ~ '^[0-9a-f]{32}$'
      and cutover_hash ~ '^[0-9a-f]{32}$'
      and assignment_hash ~ '^[0-9a-f]{32}$'
      and placements_hash ~ '^[0-9a-f]{32}$'
      and explicit_bank_hash ~ '^[0-9a-f]{32}$'
      and memory_hash ~ '^[0-9a-f]{32}$'
    )
);

create index matchday_historical_physical_archive_v20_target_idx
on jornada_private.matchday_historical_physical_archive_certificates_v20(
  target_matchday_id
);

create index matchday_historical_physical_archive_v20_composition_idx
on jornada_private.matchday_historical_physical_archive_certificates_v20(
  source_composition_id
);

alter table
  jornada_private.matchday_historical_physical_archive_certificates_v20
enable row level security;

revoke all on table
  jornada_private.matchday_historical_physical_archive_certificates_v20
from public, anon, authenticated, service_role;

comment on table
  jornada_private.matchday_historical_physical_archive_certificates_v20
is
  'Versioned certificate of the immutable semantic physical core of a completed v19 handoff. The original v19 certificate/hash remains untouched; evolving editorial and compatibility projections are deliberately excluded.';


-- ============================================================
-- 1. EXPLICIT, COMPONENTIZED PHYSICAL HASH
-- ============================================================

create function
jornada_private.matchday_historical_physical_archive_components_v20(
  p_matchday_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'zones', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', zone_row.id,
          'matchday_id', zone_row.matchday_id,
          'public_title', zone_row.public_title,
          'visual_family', zone_row.visual_family
        ) order by zone_row.id
      )
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)::text),
    'blocks', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', block_row.id,
          'matchday_id', block_row.matchday_id,
          'block_type', block_row.block_type,
          'zone_id', block_row.zone_id,
          'sort_order', block_row.sort_order
        ) order by block_row.id
      )
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)::text),
    'settings', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'matchday_id', settings_row.matchday_id,
          'faixa_slot_count', settings_row.faixa_slot_count,
          'headline_title_color', settings_row.headline_title_color,
          'latest_zone_placement', settings_row.latest_zone_placement,
          'latest_zone_title', settings_row.latest_zone_title,
          'video_module_active', settings_row.video_module_active,
          'latest_zone_mode', settings_row.latest_zone_mode,
          'latest_zone_title_color', settings_row.latest_zone_title_color
        ) order by settings_row.matchday_id
      )
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)::text),
    'cutover', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'matchday_id', cutover_row.matchday_id,
          'profile_key', cutover_row.profile_key,
          'cutover_at', cutover_row.cutover_at
        ) order by cutover_row.matchday_id
      )
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)::text),
    'assignment', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'matchday_id', assignment_row.matchday_id,
          'profile_key', assignment_row.profile_key
        ) order by assignment_row.matchday_id
      )
      from public.matchday_editorial_profile_assignments as assignment_row
      where assignment_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)::text),
    'placements', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', placement_row.id,
          'matchday_id', placement_row.matchday_id,
          'bank_item_id', placement_row.bank_item_id,
          'placement_type', placement_row.placement_type,
          'zone_id', placement_row.zone_id,
          'slot_position', placement_row.slot_position
        ) order by placement_row.id
      )
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)::text),
    'explicit_bank', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', override_row.id,
          'matchday_id', override_row.matchday_id,
          'profile_key', override_row.profile_key,
          'source_type', override_row.source_type,
          'source_id', override_row.source_id,
          'placement_target', override_row.placement_target,
          'zone_key', override_row.zone_key,
          'sort_order', override_row.sort_order
        ) order by override_row.id
      )
      from public.matchday_editorial_profile_manual_overrides as override_row
      where override_row.matchday_id = p_matchday_id
        and override_row.placement_target = 'bank'
    ), '[]'::jsonb)::text),
    'memory', pg_catalog.md5(coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'matchday_id', memory_row.matchday_id,
          'bank_item_id', memory_row.bank_item_id,
          'memory_kind', memory_row.memory_kind
        ) order by memory_row.bank_item_id
      )
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id = p_matchday_id
    ), '[]'::jsonb)::text)
  );
$function$;

revoke all on function
  jornada_private.matchday_historical_physical_archive_components_v20(uuid)
from public, anon, authenticated, service_role;

comment on function
  jornada_private.matchday_historical_physical_archive_components_v20(uuid)
is
  'Hashes only explicit semantic columns of the immutable physical source: zones, blocks, settings, cutover marker, profile assignment, placements, explicit Bank exclusions and displaced-state memory. Technical timestamps and evolving editorial/legacy projections are excluded.';


create function
jornada_private.matchday_historical_physical_archive_hash_v20(
  p_matchday_id uuid
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.md5(
    jornada_private.matchday_historical_physical_archive_components_v20(
      p_matchday_id
    )::text
  );
$function$;

revoke all on function
  jornada_private.matchday_historical_physical_archive_hash_v20(uuid)
from public, anon, authenticated, service_role;


-- ============================================================
-- 2. AUDITED ELIGIBILITY FOR PRE-V20 HANDOFFS
-- ============================================================

create function
jornada_private.matchday_historical_physical_archive_backfill_eligible_v20(
  p_handoff_id uuid
)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_handoff
    jornada_private.matchday_live_layout_physical_handoffs%rowtype;
  v_topology
    jornada_private.matchday_live_layout_physical_topology_transitions%rowtype;
  v_carryover
    jornada_private.matchday_live_layout_physical_carryovers%rowtype;
begin
  select handoff_row.*
  into v_handoff
  from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
  where handoff_row.id = p_handoff_id;

  if not found then
    return false;
  end if;

  select topology_row.*
  into v_topology
  from jornada_private.matchday_live_layout_physical_topology_transitions
    as topology_row
  where topology_row.id = v_handoff.topology_transition_id
    and topology_row.source_matchday_id = v_handoff.source_matchday_id
    and topology_row.target_matchday_id = v_handoff.target_matchday_id
    and topology_row.profile_key = v_handoff.profile_key;

  if not found then
    return false;
  end if;

  select carryover_row.*
  into v_carryover
  from jornada_private.matchday_live_layout_physical_carryovers
    as carryover_row
  where carryover_row.id = v_handoff.carryover_id
    and carryover_row.topology_transition_id =
        v_handoff.topology_transition_id
    and carryover_row.source_matchday_id = v_handoff.source_matchday_id
    and carryover_row.target_matchday_id = v_handoff.target_matchday_id
    and carryover_row.source_composition_id =
        v_handoff.source_composition_id
    and carryover_row.profile_key = v_handoff.profile_key
    and carryover_row.state_token_after = v_handoff.target_state_token;

  if not found
    or v_handoff.source_archive_hash !~ '^[0-9a-f]{32}$'
  then
    return false;
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = v_handoff.source_matchday_id
      and transition_row.target_matchday_id = v_handoff.target_matchday_id
      and transition_row.source_composition_id =
          v_handoff.source_composition_id
      and transition_row.continuity_version = 19
  ) or not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = v_handoff.source_composition_id
      and composition_row.matchday_id = v_handoff.source_matchday_id
      and composition_row.status = 'published'
  ) or not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = v_handoff.source_matchday_id
      and not source_desk.is_managed
      and source_desk.carryover_source_composition_id is null
      and source_desk.carryover_snapshot is null
  ) then
    return false;
  end if;

  -- V17 ran the same source validator before and after topology materializing.
  -- Re-running the effective validator plus the durable zone map proves that
  -- the current topology is still coherent and contains exactly the source
  -- zone identities certified by the handoff.
  begin
    perform
      jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
        v_handoff.source_matchday_id,
        v_handoff.profile_key
      );
  exception when others then
    return false;
  end;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = v_handoff.source_matchday_id
  ) <> (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.topology_transition_id = v_handoff.topology_transition_id
      and map_row.source_matchday_id = v_handoff.source_matchday_id
      and map_row.target_matchday_id = v_handoff.target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = v_handoff.source_matchday_id
      and not exists (
        select 1
        from jornada_private.matchday_live_layout_physical_zone_maps
          as map_row
        where map_row.topology_transition_id =
              v_handoff.topology_transition_id
          and map_row.source_matchday_id = v_handoff.source_matchday_id
          and map_row.target_matchday_id = v_handoff.target_matchday_id
          and map_row.source_zone_id = zone_row.id
      )
  ) then
    return false;
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = v_handoff.source_matchday_id
      and cutover_row.profile_key = v_handoff.profile_key
      and cutover_row.cutover_at = v_topology.source_cutover_at
      and cutover_row.cutover_at <= v_handoff.completed_at
  ) or not exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = v_handoff.source_matchday_id
      and assignment_row.profile_key = v_handoff.profile_key
      and assignment_row.created_at <= v_handoff.completed_at
      and assignment_row.updated_at <= v_handoff.completed_at
  ) or not exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = v_handoff.source_matchday_id
      and settings_row.created_at <= v_handoff.completed_at
      and settings_row.updated_at <= v_handoff.completed_at
  ) then
    return false;
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = v_handoff.source_matchday_id
      and (
        zone_row.created_at > v_handoff.completed_at
        or zone_row.updated_at > v_handoff.completed_at
      )
  ) or exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = v_handoff.source_matchday_id
      and (
        block_row.created_at > v_handoff.completed_at
        or block_row.updated_at > v_handoff.completed_at
      )
  ) or exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = v_handoff.source_matchday_id
      and (
        placement_row.created_at > v_handoff.completed_at
        or placement_row.updated_at > v_handoff.completed_at
      )
  ) or exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = v_handoff.source_matchday_id
      and override_row.placement_target = 'bank'
      and (
        override_row.created_at > v_handoff.completed_at
        or override_row.updated_at > v_handoff.completed_at
      )
  ) or exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = v_handoff.source_matchday_id
      and memory_row.recorded_at > v_handoff.completed_at
  ) then
    return false;
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = v_handoff.source_matchday_id
  ) <> v_carryover.inherited_placement_count or (
    select pg_catalog.count(*)
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = v_handoff.source_matchday_id
      and override_row.placement_target = 'bank'
  ) <> v_carryover.inherited_explicit_bank_count or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = v_handoff.source_matchday_id
  ) <> v_carryover.inherited_memory_count then
    return false;
  end if;

  return true;
end;
$function$;

revoke all on function
  jornada_private.matchday_historical_physical_archive_backfill_eligible_v20(
    uuid
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.matchday_historical_physical_archive_backfill_eligible_v20(
    uuid
  )
is
  'Conservative audit for pre-v20 handoffs. It requires the intact v17/v18/v19 certificate chain, retired source, durable source-zone identities, current structural validity, certified physical counts and no physical row timestamp after handoff. It never treats the current physical hash alone as proof.';


-- ============================================================
-- 3. CERTIFIER: ATOMIC FOR NEW HANDOFFS, AUDITED FOR EXISTING ONES
-- ============================================================

create function
jornada_private.certify_matchday_historical_physical_archive_v20(
  p_handoff_id uuid,
  p_certification_basis text
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_handoff
    jornada_private.matchday_live_layout_physical_handoffs%rowtype;
  v_components jsonb;
  v_core_hash text;
  v_certificate_id uuid;
begin
  if p_handoff_id is null
    or p_certification_basis is null
    or p_certification_basis not in ('atomic_handoff', 'audited_backfill')
  then
    raise exception 'matchday-historical-physical-archive-v20-invalid-input';
  end if;

  perform jornada_private.acquire_matchday_live_desk_handoff_lock();
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  select handoff_row.*
  into v_handoff
  from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
  where handoff_row.id = p_handoff_id
  for key share;

  if not found then
    raise exception 'matchday-historical-physical-archive-v20-handoff-missing';
  end if;

  if not jornada_private
      .matchday_historical_physical_archive_backfill_eligible_v20(
        p_handoff_id
      )
  then
    raise exception 'matchday-historical-physical-archive-v20-audit-failed';
  end if;

  if p_certification_basis = 'atomic_handoff'
    and jornada_private.matchday_live_layout_physical_archive_hash_v19(
          v_handoff.source_matchday_id
        ) is distinct from v_handoff.source_archive_hash
  then
    raise exception
      'matchday-historical-physical-archive-v20-atomic-v19-mismatch';
  end if;

  v_components := jornada_private
    .matchday_historical_physical_archive_components_v20(
      v_handoff.source_matchday_id
    );
  v_core_hash := pg_catalog.md5(v_components::text);

  insert into
    jornada_private.matchday_historical_physical_archive_certificates_v20 (
      handoff_id,
      topology_transition_id,
      carryover_id,
      source_matchday_id,
      target_matchday_id,
      source_composition_id,
      v19_source_archive_hash,
      physical_core_hash,
      zones_hash,
      blocks_hash,
      settings_hash,
      cutover_hash,
      assignment_hash,
      placements_hash,
      explicit_bank_hash,
      memory_hash,
      certification_basis
    ) values (
      v_handoff.id,
      v_handoff.topology_transition_id,
      v_handoff.carryover_id,
      v_handoff.source_matchday_id,
      v_handoff.target_matchday_id,
      v_handoff.source_composition_id,
      v_handoff.source_archive_hash,
      v_core_hash,
      v_components ->> 'zones',
      v_components ->> 'blocks',
      v_components ->> 'settings',
      v_components ->> 'cutover',
      v_components ->> 'assignment',
      v_components ->> 'placements',
      v_components ->> 'explicit_bank',
      v_components ->> 'memory',
      p_certification_basis
    )
  on conflict (handoff_id) do nothing
  returning id into v_certificate_id;

  if v_certificate_id is null then
    select certificate_row.id
    into v_certificate_id
    from jornada_private
      .matchday_historical_physical_archive_certificates_v20
      as certificate_row
    where certificate_row.handoff_id = v_handoff.id
      and certificate_row.topology_transition_id =
          v_handoff.topology_transition_id
      and certificate_row.carryover_id = v_handoff.carryover_id
      and certificate_row.source_matchday_id = v_handoff.source_matchday_id
      and certificate_row.target_matchday_id = v_handoff.target_matchday_id
      and certificate_row.source_composition_id =
          v_handoff.source_composition_id
      and certificate_row.v19_source_archive_hash =
          v_handoff.source_archive_hash
      and certificate_row.physical_core_hash = v_core_hash
      and certificate_row.zones_hash = v_components ->> 'zones'
      and certificate_row.blocks_hash = v_components ->> 'blocks'
      and certificate_row.settings_hash = v_components ->> 'settings'
      and certificate_row.cutover_hash = v_components ->> 'cutover'
      and certificate_row.assignment_hash = v_components ->> 'assignment'
      and certificate_row.placements_hash = v_components ->> 'placements'
      and certificate_row.explicit_bank_hash =
          v_components ->> 'explicit_bank'
      and certificate_row.memory_hash = v_components ->> 'memory';

    if not found then
      raise exception
        'matchday-historical-physical-archive-v20-certificate-conflict';
    end if;
  end if;

  return v_certificate_id;
end;
$function$;

revoke all on function
  jornada_private.certify_matchday_historical_physical_archive_v20(uuid, text)
from public, anon, authenticated, service_role;


create function
jornada_private.certify_matchday_historical_physical_archive_after_handoff_v20()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.certify_matchday_historical_physical_archive_v20(
    new.id,
    'atomic_handoff'
  );
  return new;
end;
$function$;

revoke all on function
  jornada_private.certify_matchday_historical_physical_archive_after_handoff_v20()
from public, anon, authenticated, service_role;

create trigger matchday_historical_physical_archive_after_handoff_v20
after insert on jornada_private.matchday_live_layout_physical_handoffs
for each row
execute function
  jornada_private.certify_matchday_historical_physical_archive_after_handoff_v20();


-- Certify only handoffs whose pre-v20 physical state is independently
-- supported by durable identities/counts, the retired lifecycle and timestamps.
-- An ineligible handoff remains on the preserved v19 validation path.
do $backfill$
declare
  v_handoff_id uuid;
begin
  for v_handoff_id in
    select handoff_row.id
    from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
    left join jornada_private
      .matchday_historical_physical_archive_certificates_v20
      as certificate_row
      on certificate_row.handoff_id = handoff_row.id
    where certificate_row.id is null
      and jornada_private
          .matchday_historical_physical_archive_backfill_eligible_v20(
            handoff_row.id
          )
    order by handoff_row.completed_at, handoff_row.id
  loop
    perform jornada_private.certify_matchday_historical_physical_archive_v20(
      v_handoff_id,
      'audited_backfill'
    );
  end loop;
end;
$backfill$;


-- ============================================================
-- 4. STRICT V20 VALIDATOR AND V19-COMPATIBLE DISPATCHER
-- ============================================================

create function
jornada_private.assert_matchday_live_layout_historical_physical_archive_v20(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_certificate
    jornada_private
      .matchday_historical_physical_archive_certificates_v20%rowtype;
  v_handoff
    jornada_private.matchday_live_layout_physical_handoffs%rowtype;
  v_carryover
    jornada_private.matchday_live_layout_physical_carryovers%rowtype;
  v_components jsonb;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-layout-historical-v20-invalid-envelope';
  end if;

  select certificate_row, handoff_row
  into v_certificate, v_handoff
  from jornada_private
    .matchday_historical_physical_archive_certificates_v20
    as certificate_row
  join jornada_private.matchday_live_layout_physical_handoffs as handoff_row
    on handoff_row.id = certificate_row.handoff_id
  where certificate_row.source_matchday_id = p_source_matchday_id
    and certificate_row.target_matchday_id = p_target_matchday_id
    and certificate_row.source_composition_id = p_source_composition_id
    and handoff_row.source_matchday_id = p_source_matchday_id
    and handoff_row.target_matchday_id = p_target_matchday_id
    and handoff_row.source_composition_id = p_source_composition_id;

  if not found then
    raise exception 'matchday-live-layout-historical-v20-certificate-missing';
  end if;

  if v_certificate.topology_transition_id is distinct from
       v_handoff.topology_transition_id
    or v_certificate.carryover_id is distinct from v_handoff.carryover_id
    or v_certificate.v19_source_archive_hash is distinct from
       v_handoff.source_archive_hash
  then
    raise exception
      'matchday-live-layout-historical-v20-handoff-certificate-invalid';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
      as topology_row
    join jornada_private.matchday_live_layout_physical_cutovers as cutover_row
      on cutover_row.matchday_id = topology_row.source_matchday_id
     and cutover_row.profile_key = topology_row.profile_key
     and cutover_row.cutover_at = topology_row.source_cutover_at
    where topology_row.id = v_handoff.topology_transition_id
      and topology_row.source_matchday_id = p_source_matchday_id
      and topology_row.target_matchday_id = p_target_matchday_id
      and topology_row.profile_key = v_handoff.profile_key
  ) then
    raise exception
      'matchday-live-layout-historical-v20-topology-certificate-invalid';
  end if;

  select carryover_row.*
  into v_carryover
  from jornada_private.matchday_live_layout_physical_carryovers
    as carryover_row
  where carryover_row.id = v_handoff.carryover_id
    and carryover_row.topology_transition_id =
        v_handoff.topology_transition_id
    and carryover_row.source_matchday_id = p_source_matchday_id
    and carryover_row.target_matchday_id = p_target_matchday_id
    and carryover_row.source_composition_id = p_source_composition_id
    and carryover_row.profile_key = v_handoff.profile_key
    and carryover_row.state_token_after = v_handoff.target_state_token;

  if not found then
    raise exception
      'matchday-live-layout-historical-v20-carryover-certificate-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
      and transition_row.target_matchday_id = p_target_matchday_id
      and transition_row.source_composition_id = p_source_composition_id
      and transition_row.continuity_version = 19
  ) or not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = p_source_composition_id
      and composition_row.matchday_id = p_source_matchday_id
      and composition_row.status = 'published'
  ) then
    raise exception
      'matchday-live-layout-historical-v20-public-transition-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = p_source_matchday_id
      and not source_desk.is_managed
      and source_desk.carryover_source_composition_id is null
      and source_desk.carryover_snapshot is null
  ) then
    raise exception 'matchday-live-layout-historical-v20-source-not-retired';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id = p_source_matchday_id
  ) <> (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.topology_transition_id = v_handoff.topology_transition_id
      and map_row.source_matchday_id = p_source_matchday_id
      and map_row.target_matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-layout-historical-v20-topology-changed';
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_source_matchday_id
  ) <> v_carryover.inherited_placement_count or (
    select pg_catalog.count(*)
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = p_source_matchday_id
      and override_row.placement_target = 'bank'
  ) <> v_carryover.inherited_explicit_bank_count or (
    select pg_catalog.count(*)
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_source_matchday_id
  ) <> v_carryover.inherited_memory_count then
    raise exception 'matchday-live-layout-historical-v20-physical-count-changed';
  end if;

  v_components := jornada_private
    .matchday_historical_physical_archive_components_v20(
      p_source_matchday_id
    );

  if v_components ->> 'zones' is distinct from v_certificate.zones_hash then
    raise exception 'matchday-live-layout-historical-v20-zones-changed';
  elsif v_components ->> 'blocks' is distinct from v_certificate.blocks_hash then
    raise exception 'matchday-live-layout-historical-v20-blocks-changed';
  elsif v_components ->> 'settings' is distinct from
        v_certificate.settings_hash then
    raise exception 'matchday-live-layout-historical-v20-settings-changed';
  elsif v_components ->> 'cutover' is distinct from
        v_certificate.cutover_hash then
    raise exception 'matchday-live-layout-historical-v20-cutover-changed';
  elsif v_components ->> 'assignment' is distinct from
        v_certificate.assignment_hash then
    raise exception 'matchday-live-layout-historical-v20-assignment-changed';
  elsif v_components ->> 'placements' is distinct from
        v_certificate.placements_hash then
    raise exception 'matchday-live-layout-historical-v20-placements-changed';
  elsif v_components ->> 'explicit_bank' is distinct from
        v_certificate.explicit_bank_hash then
    raise exception 'matchday-live-layout-historical-v20-explicit-bank-changed';
  elsif v_components ->> 'memory' is distinct from v_certificate.memory_hash then
    raise exception 'matchday-live-layout-historical-v20-memory-changed';
  elsif pg_catalog.md5(v_components::text) is distinct from
        v_certificate.physical_core_hash then
    raise exception 'matchday-live-layout-historical-v20-core-changed';
  end if;
end;
$function$;

revoke all on function
  jornada_private
    .assert_matchday_live_layout_historical_physical_archive_v20(
      uuid,
      uuid,
      uuid
    )
from public, anon, authenticated, service_role;


create function
jornada_private.assert_matchday_live_layout_historical_republish_v20(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from jornada_private
      .matchday_historical_physical_archive_certificates_v20
      as certificate_row
    where certificate_row.source_matchday_id = p_source_matchday_id
      and certificate_row.target_matchday_id = p_target_matchday_id
      and certificate_row.source_composition_id = p_source_composition_id
  ) then
    perform jornada_private
      .assert_matchday_live_layout_historical_physical_archive_v20(
        p_source_matchday_id,
        p_target_matchday_id,
        p_source_composition_id
      );
  else
    perform jornada_private.assert_matchday_live_layout_historical_republish_v19(
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id
    );
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_historical_republish_v20(
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.assert_matchday_live_layout_historical_republish_v20(
    uuid,
    uuid,
    uuid
  )
is
  'Historical republish dispatcher: strict componentized v20 validation when an audited v20 certificate exists, otherwise the preserved v19 validator. It never fabricates a certificate at runtime and never reads current target live state.';


-- ============================================================
-- 5. MINIMAL HISTORICAL-REPUBLISH INTEGRATION
-- ============================================================

do $patch$
declare
  v_definition text;
  v_fixed text;
  v_old_name constant text :=
    'jornada_private.assert_matchday_live_layout_historical_republish_v19';
  v_new_name constant text :=
    'jornada_private.assert_matchday_live_layout_historical_republish_v20';
  v_occurrences integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.publish_matchday_reference_composition(uuid,uuid)'
      ::pg_catalog.regprocedure
  )
  into v_definition;

  v_occurrences := (
    pg_catalog.char_length(v_definition)
    - pg_catalog.char_length(
        pg_catalog.replace(v_definition, v_old_name, '')
      )
  ) / pg_catalog.char_length(v_old_name);

  if v_occurrences <> 2 then
    raise exception
      'matchday-live-layout-historical-v20-publish-contract-unexpected:%',
      v_occurrences;
  end if;

  v_fixed := pg_catalog.replace(v_definition, v_old_name, v_new_name);

  if pg_catalog.strpos(v_fixed, v_old_name) <> 0 or (
    (
      pg_catalog.char_length(v_fixed)
      - pg_catalog.char_length(
          pg_catalog.replace(v_fixed, v_new_name, '')
        )
    ) / pg_catalog.char_length(v_new_name)
  ) <> 2 then
    raise exception 'matchday-live-layout-historical-v20-publish-patch-failed';
  end if;

  execute v_fixed;
end;
$patch$;

revoke all on function
  public.publish_matchday_reference_composition(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.publish_matchday_reference_composition(uuid, uuid)
to service_role;


do $postconditions$
declare
  v_publish_definition text;
  v_core_definition text;
  v_recovery_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.publish_matchday_reference_composition(uuid,uuid)'
      ::pg_catalog.regprocedure
  ) into v_publish_definition;

  select pg_catalog.pg_get_functiondef(
    'jornada_private.materialize_matchday_live_layout_physical_handoff_v19(uuid,uuid,uuid,text)'
      ::pg_catalog.regprocedure
  ) into v_core_definition;

  select pg_catalog.pg_get_functiondef(
    'public.recover_matchday_live_layout_continuity(uuid,uuid,uuid)'
      ::pg_catalog.regprocedure
  ) into v_recovery_definition;

  if pg_catalog.strpos(
       v_publish_definition,
       'assert_matchday_live_layout_historical_republish_v19'
     ) <> 0
    or pg_catalog.strpos(
         v_publish_definition,
         'assert_matchday_live_layout_historical_republish_v20'
       ) = 0
    or pg_catalog.strpos(
         v_core_definition,
         'assert_matchday_live_layout_physical_handoff_complete_v19'
       ) = 0
    or pg_catalog.strpos(
         v_core_definition,
         'assert_matchday_live_layout_historical_republish_v20'
       ) <> 0
    or pg_catalog.strpos(
         v_recovery_definition,
         'materialize_matchday_live_layout_physical_handoff_v19'
       ) = 0
    or pg_catalog.strpos(
         v_recovery_definition,
         'assert_matchday_live_layout_historical_republish_v20'
       ) <> 0
  then
    raise exception
      'matchday-live-layout-historical-v20-function-boundary-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
    where jornada_private
            .matchday_historical_physical_archive_backfill_eligible_v20(
              handoff_row.id
            )
      and not exists (
        select 1
        from jornada_private
          .matchday_historical_physical_archive_certificates_v20
          as certificate_row
        where certificate_row.handoff_id = handoff_row.id
      )
  ) then
    raise exception 'matchday-live-layout-historical-v20-backfill-incomplete';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.publish_matchday_reference_composition(uuid,uuid)',
       'EXECUTE'
     )
    or pg_catalog.has_function_privilege(
         'anon',
         'jornada_private.assert_matchday_live_layout_historical_republish_v20(uuid,uuid,uuid)',
         'EXECUTE'
       )
    or pg_catalog.has_function_privilege(
         'authenticated',
         'jornada_private.assert_matchday_live_layout_historical_republish_v20(uuid,uuid,uuid)',
         'EXECUTE'
       )
    or pg_catalog.has_function_privilege(
         'service_role',
         'jornada_private.assert_matchday_live_layout_historical_republish_v20(uuid,uuid,uuid)',
         'EXECUTE'
       )
    or pg_catalog.has_table_privilege(
         'service_role',
         'jornada_private.matchday_historical_physical_archive_certificates_v20',
         'INSERT,UPDATE,DELETE'
       )
  then
    raise exception 'matchday-live-layout-historical-v20-privileges-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
