\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after the historical v19 republication correction.
-- Everything is rolled back; no fixture state can escape this session.
begin;

create function pg_temp.assert_true(p_condition boolean, p_message text)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion-failed: %', p_message;
  end if;
end;
$function$;

create function pg_temp.target_live_state_v19(
  p_target_matchday_id uuid,
  p_profile_key text
)
returns jsonb
language sql
stable
set search_path = ''
as $function$
  select pg_catalog.jsonb_build_object(
    'transition', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.source_matchday_id
      )
      from public.matchday_editorial_continuity_transitions as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'topology', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from jornada_private.matchday_live_layout_physical_topology_transitions
        as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'zone_maps', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.source_zone_id
      )
      from jornada_private.matchday_live_layout_physical_zone_maps
        as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'target_zone_identities', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.target_zone_id
      )
      from jornada_private
        .matchday_live_layout_physical_target_zone_identities as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'carryover', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from jornada_private.matchday_live_layout_physical_carryovers
        as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'bank_maps', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.source_bank_item_id
      )
      from jornada_private.matchday_live_layout_physical_bank_maps
        as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'handoff', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from jornada_private.matchday_live_layout_physical_handoffs
        as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'desk', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.matchday_id
      )
      from public.matchday_editorial_desk_control as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'settings', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.matchday_id
      )
      from public.matchday_live_layout_workspace_settings as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'zones', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from public.matchday_live_layout_zones as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'blocks', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from public.matchday_live_layout_blocks as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'bank', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from public.matchday_editorial_bank_items as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'placements', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from public.matchday_live_layout_placements as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'overrides', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from public.matchday_editorial_profile_manual_overrides as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'displaced_memory', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.bank_item_id
      )
      from public.matchday_live_layout_bank_item_state_memory as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'latest_companion', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.matchday_id
      )
      from public.matchday_live_layout_latest_companion as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'archive_certificate', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from jornada_private
        .matchday_historical_physical_archive_certificates_v20 as row_value
      where row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'latest', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value)
        order by row_value.id
      )
      from public.matchday_latest_news as row_value
      where row_value.matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'state_token', (
      select workspace_row.state_token
      from public.read_matchday_live_layout_workspace_v13(
        p_target_matchday_id,
        p_profile_key
      ) as workspace_row
    )
  );
$function$;

create function pg_temp.inject_v19_failure()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'v19-injected-failure';
end;
$function$;

create function pg_temp.physical_transition_history_v20(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid
)
returns jsonb
language sql
stable
as $function$
  select pg_catalog.jsonb_build_object(
    'topology', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.id
      )
      from jornada_private
        .matchday_live_layout_physical_topology_transitions as row_value
      where row_value.source_matchday_id = p_source_matchday_id
        and row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'zone_maps', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.source_zone_id
      )
      from jornada_private.matchday_live_layout_physical_zone_maps as row_value
      where row_value.source_matchday_id = p_source_matchday_id
        and row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'target_identities', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.target_zone_id
      )
      from jornada_private
        .matchday_live_layout_physical_target_zone_identities as row_value
      where row_value.source_matchday_id = p_source_matchday_id
        and row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'carryover', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.id
      )
      from jornada_private.matchday_live_layout_physical_carryovers as row_value
      where row_value.source_matchday_id = p_source_matchday_id
        and row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'handoff', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.id
      )
      from jornada_private.matchday_live_layout_physical_handoffs as row_value
      where row_value.source_matchday_id = p_source_matchday_id
        and row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb),
    'certificate', coalesce((
      select pg_catalog.jsonb_agg(
        pg_catalog.to_jsonb(row_value) order by row_value.id
      )
      from jornada_private
        .matchday_historical_physical_archive_certificates_v20 as row_value
      where row_value.source_matchday_id = p_source_matchday_id
        and row_value.target_matchday_id = p_target_matchday_id
    ), '[]'::jsonb)
  );
$function$;

create function pg_temp.apply_target_without_zone_v29(
  p_matchday_id uuid,
  p_zone_id uuid,
  p_latest_companion_zone_id uuid default null
)
returns void
language plpgsql
as $function$
declare
  v_zones jsonb;
  v_blocks jsonb;
  v_placements jsonb;
  v_explicit jsonb;
  v_displaced jsonb;
  v_worked jsonb;
  v_displaced_arrivals jsonb;
  v_state_token text;
  v_faixa_slot_count integer;
  v_presentation jsonb;
begin
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', zone_row.id,
      'public_title', zone_row.public_title,
      'visual_family', zone_row.visual_family
    ) order by zone_row.id
  ), '[]'::jsonb)
  into v_zones
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = p_matchday_id
    and zone_row.id <> p_zone_id;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', block_row.id,
      'block_type', block_row.block_type,
      'zone_id', block_row.zone_id,
      'sort_order', block_row.final_sort_order
    ) order by block_row.final_sort_order
  ), '[]'::jsonb)
  into v_blocks
  from (
    select
      current_block.id,
      current_block.block_type,
      current_block.zone_id,
      pg_catalog.row_number() over (
        order by current_block.sort_order, current_block.id
      )::integer as final_sort_order
    from public.matchday_live_layout_blocks as current_block
    where current_block.matchday_id = p_matchday_id
      and current_block.zone_id is distinct from p_zone_id
  ) as block_row;

  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'bank_item_id', placement_row.bank_item_id,
      'placement_type', placement_row.placement_type,
      'zone_id', placement_row.zone_id,
      'slot_position', placement_row.slot_position
    ) order by
      placement_row.placement_type,
      placement_row.zone_id nulls first,
      placement_row.slot_position,
      placement_row.bank_item_id
  ), '[]'::jsonb)
  into v_placements
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.zone_id is distinct from p_zone_id;

  select coalesce(pg_catalog.jsonb_agg(
    bank_row.id order by bank_row.id
  ), '[]'::jsonb)
  into v_explicit
  from public.matchday_editorial_profile_manual_overrides as override_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.matchday_id = override_row.matchday_id
   and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(override_row.source_type))
   and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(override_row.source_id))
  where override_row.matchday_id = p_matchday_id
    and override_row.placement_target = 'bank';

  select coalesce(pg_catalog.jsonb_agg(
    state_row.bank_item_id order by state_row.bank_item_id
  ), '[]'::jsonb)
  into v_displaced
  from (
    select memory_row.bank_item_id
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id = p_matchday_id
      and memory_row.memory_kind = 'displaced'
    union
    select placement_row.bank_item_id
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'zone'
      and placement_row.zone_id = p_zone_id
  ) as state_row;

  select coalesce(pg_catalog.jsonb_agg(
    bank_row.id order by bank_row.id
  ), '[]'::jsonb)
  into v_worked
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id
    and bank_row.editorially_worked_at is not null;

  select coalesce(pg_catalog.jsonb_agg(
    placement_row.bank_item_id order by placement_row.bank_item_id
  ), '[]'::jsonb)
  into v_displaced_arrivals
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'zone'
    and placement_row.zone_id = p_zone_id
    and not exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id = placement_row.matchday_id
        and memory_row.bank_item_id = placement_row.bank_item_id
        and memory_row.memory_kind = 'displaced'
    );

  select
    jornada_private.matchday_live_layout_workspace_token_v22(
      p_matchday_id,
      settings_row.profile_key
    ),
    settings_row.faixa_slot_count,
    pg_catalog.jsonb_build_object(
      'headline_title_color', settings_row.headline_title_color,
      'latest_zone_placement', case
        when p_latest_companion_zone_id is null then 'top'
        else 'four_news'
      end,
      'latest_zone_title', settings_row.latest_zone_title,
      'video_module_active', settings_row.video_module_active
    )
  into v_state_token, v_faixa_slot_count, v_presentation
  from (
    select
      workspace_row.faixa_slot_count,
      workspace_row.headline_title_color,
      workspace_row.latest_zone_title,
      workspace_row.video_module_active,
      assignment_row.profile_key
    from public.matchday_live_layout_workspace_settings as workspace_row
    join public.matchday_editorial_profile_assignments as assignment_row
      on assignment_row.matchday_id = workspace_row.matchday_id
    where workspace_row.matchday_id = p_matchday_id
  ) as settings_row;

  perform 1
  from public.apply_matchday_live_layout_physical_v29(
    p_matchday_id,
    'liga_portugal_v1',
    v_state_token,
    p_latest_companion_zone_id,
    v_zones,
    v_blocks,
    v_placements,
    v_faixa_slot_count,
    v_explicit,
    v_displaced,
    v_worked,
    '[]'::jsonb,
    v_displaced_arrivals,
    v_presentation
  );
end;
$function$;

create function pg_temp.assert_normal_rollback(
  p_source uuid,
  p_target uuid,
  p_composition uuid,
  p_source_hash text,
  p_message text
)
returns void
language plpgsql
as $function$
begin
  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
    where source_matchday_id = p_source or target_matchday_id = p_target
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryovers
    where source_matchday_id = p_source or target_matchday_id = p_target
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_handoffs
    where source_matchday_id = p_source or target_matchday_id = p_target
  ) or exists (
    select 1
    from public.matchday_editorial_continuity_transitions
    where source_matchday_id = p_source or target_matchday_id = p_target
  ) or exists (
    select 1 from public.matchday_live_layout_zones
    where matchday_id = p_target
  ) or exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = p_target
  ) or exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = p_target
  ) or exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = p_target and is_managed
  ) or not exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = p_source and is_managed
  ) or not exists (
    select 1 from public.matchday_reference_compositions
    where id = p_composition and status = 'draft' and not is_current
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
      and matchday_id in (p_source, p_target)
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_downstream_context
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
      and matchday_id in (p_source, p_target)
  ) or exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryover_context
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
      and target_matchday_id = p_target
  ) or exists (
    select 1
    from jornada_private.matchday_editorial_bank_classification_authorizations
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
  ) or jornada_private.matchday_live_layout_physical_archive_hash_v19(
       p_source
     ) is distinct from p_source_hash
  then
    raise exception 'assertion-failed: %', p_message;
  end if;
end;
$function$;

create temp table handoff_v19_results (
  test_number integer primary key,
  test_name text unique not null,
  status text not null check (status = 'PASS')
);

insert into jornada_private.matchday_live_layout_cutover_control (
  scope,
  authority_mode
)
values ('live_layout', 'authoritative')
on conflict (scope) do update set authority_mode = excluded.authority_mode;

insert into public.countries (id, name, slug)
values (
  '9d000000-0000-4000-8000-000000000010',
  'Handoff V19 Country',
  'handoff-v19-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  '9d000000-0000-4000-8000-000000000020',
  'Handoff V19 Competition',
  'liga-portugal',
  'Handoff V19 Country',
  '9d000000-0000-4000-8000-000000000010'
);

insert into public.seasons (id, competition_id, label)
select
  ('9d000000-0000-4000-8000-' ||
    pg_catalog.lpad((30 + item_no)::text, 12, '0'))::uuid,
  '9d000000-0000-4000-8000-000000000020',
  'Handoff V19 season ' || item_no
from pg_catalog.generate_series(0, 8) as item_row(item_no);

-- Seven independent pairs: normal, legacy, two corruption cases, atomic
-- failure/retry, topology-only recovery and carryover-complete recovery.
insert into public.matchdays (id, season_id, number, label)
values
  ('9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000030',1,'v19 normal source'),
  ('9d000000-0000-4000-8000-000000000002','9d000000-0000-4000-8000-000000000030',2,'v19 normal target'),
  ('9d000000-0000-4000-8000-000000000003','9d000000-0000-4000-8000-000000000031',1,'v19 legacy source'),
  ('9d000000-0000-4000-8000-000000000004','9d000000-0000-4000-8000-000000000031',2,'v19 legacy target'),
  ('9d000000-0000-4000-8000-000000000005','9d000000-0000-4000-8000-000000000032',1,'v19 corrupt marker source'),
  ('9d000000-0000-4000-8000-000000000006','9d000000-0000-4000-8000-000000000032',2,'v19 corrupt marker target'),
  ('9d000000-0000-4000-8000-000000000007','9d000000-0000-4000-8000-000000000033',1,'v19 corrupt settings source'),
  ('9d000000-0000-4000-8000-000000000008','9d000000-0000-4000-8000-000000000033',2,'v19 corrupt settings target'),
  ('9d000000-0000-4000-8000-000000000009','9d000000-0000-4000-8000-000000000034',1,'v19 failure source'),
  ('9d000000-0000-4000-8000-00000000000a','9d000000-0000-4000-8000-000000000034',2,'v19 failure target'),
  ('9d000000-0000-4000-8000-00000000000b','9d000000-0000-4000-8000-000000000035',1,'v19 topology recovery source'),
  ('9d000000-0000-4000-8000-00000000000c','9d000000-0000-4000-8000-000000000035',2,'v19 topology recovery target'),
  ('9d000000-0000-4000-8000-00000000000d','9d000000-0000-4000-8000-000000000036',1,'v19 carryover recovery source'),
  ('9d000000-0000-4000-8000-00000000000e','9d000000-0000-4000-8000-000000000036',2,'v19 carryover recovery target'),
  ('9d000000-0000-4000-8000-00000000000f','9d000000-0000-4000-8000-000000000037',1,'v19 invalid projection source'),
  ('9d000000-0000-4000-8000-000000000010','9d000000-0000-4000-8000-000000000037',2,'v19 invalid projection target'),
  ('9d000000-0000-4000-8000-000000000011','9d000000-0000-4000-8000-000000000038',1,'v19 partial topology source'),
  ('9d000000-0000-4000-8000-000000000012','9d000000-0000-4000-8000-000000000038',2,'v19 partial topology target');

-- Every source begins as a legitimate five-key shadow. The explicit marker
-- below, never accidental data presence, determines the physical boundary.
insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
select source_id, 'liga_portugal_v1'
from pg_catalog.unnest(array[
  '9d000000-0000-4000-8000-000000000001'::uuid,
  '9d000000-0000-4000-8000-000000000003'::uuid,
  '9d000000-0000-4000-8000-000000000005'::uuid,
  '9d000000-0000-4000-8000-000000000007'::uuid,
  '9d000000-0000-4000-8000-000000000009'::uuid,
  '9d000000-0000-4000-8000-00000000000b'::uuid,
  '9d000000-0000-4000-8000-00000000000d'::uuid,
  '9d000000-0000-4000-8000-00000000000f'::uuid,
  '9d000000-0000-4000-8000-000000000011'::uuid
]) as source_row(source_id);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
select
  source_id,
  'liga_portugal_v1',
  pg_catalog.jsonb_build_object(
    'benfica', 'Benfica V19',
    'sporting', 'Sporting V19',
    'fc_porto', 'FC Porto V19',
    'other_liga_clubs', 'Liga V19',
    'outside_liga_other', 'Exterior V19'
  )
from pg_catalog.unnest(array[
  '9d000000-0000-4000-8000-000000000001'::uuid,
  '9d000000-0000-4000-8000-000000000003'::uuid,
  '9d000000-0000-4000-8000-000000000005'::uuid,
  '9d000000-0000-4000-8000-000000000007'::uuid,
  '9d000000-0000-4000-8000-000000000009'::uuid,
  '9d000000-0000-4000-8000-00000000000b'::uuid,
  '9d000000-0000-4000-8000-00000000000d'::uuid,
  '9d000000-0000-4000-8000-00000000000f'::uuid,
  '9d000000-0000-4000-8000-000000000011'::uuid
]) as source_row(source_id);

select jornada_private.sync_matchday_live_layout_shadow(array[
  '9d000000-0000-4000-8000-000000000001'::uuid,
  '9d000000-0000-4000-8000-000000000003'::uuid,
  '9d000000-0000-4000-8000-000000000005'::uuid,
  '9d000000-0000-4000-8000-000000000007'::uuid,
  '9d000000-0000-4000-8000-000000000009'::uuid,
  '9d000000-0000-4000-8000-00000000000b'::uuid,
  '9d000000-0000-4000-8000-00000000000d'::uuid,
  '9d000000-0000-4000-8000-00000000000f'::uuid,
  '9d000000-0000-4000-8000-000000000011'::uuid
]);

set constraints all immediate;
set constraints all deferred;

-- The normal source has two physical-only zones and therefore seven zones
-- while compatibility remains exactly the projected five-key subset.
insert into public.matchday_live_layout_zones (
  id, matchday_id, public_title, visual_family
)
values
  ('9d000000-0000-4000-8000-000000000061','9d000000-0000-4000-8000-000000000001','Zona Física Seis','six_news'),
  ('9d000000-0000-4000-8000-000000000062','9d000000-0000-4000-8000-000000000001','Zona Física Sete','five_news_secondary');

insert into public.matchday_live_layout_blocks (
  id, matchday_id, block_type, zone_id, sort_order
)
values
  ('9d000000-0000-4000-8000-000000000071','9d000000-0000-4000-8000-000000000001','zone','9d000000-0000-4000-8000-000000000061',20),
  ('9d000000-0000-4000-8000-000000000072','9d000000-0000-4000-8000-000000000001','zone','9d000000-0000-4000-8000-000000000062',30);

-- Physical evidence without a marker is a partial/corrupt topology, never a
-- legacy source. It is intentionally left without a block as well.
insert into public.matchday_live_layout_zones (
  id, matchday_id, public_title, visual_family
)
values (
  '9d000000-0000-4000-8000-000000000063',
  '9d000000-0000-4000-8000-000000000011',
  'Unprojected partial zone',
  'six_news'
);

-- Non-default settings on each coherent physical source. Corrupt-settings is
-- deliberately omitted from the marker list; corrupt-marker gets no row.
insert into public.matchday_live_layout_workspace_settings (
  matchday_id,
  faixa_slot_count,
  headline_title_color,
  latest_zone_placement,
  latest_zone_title,
  video_module_active,
  latest_zone_mode,
  latest_zone_title_color
)
values
  ('9d000000-0000-4000-8000-000000000001',8,'#123456','four_news','Últimas V19',true,'editorial_line','#ABCDEF'),
  ('9d000000-0000-4000-8000-000000000007',4,null,'hidden','Corrupt settings',false,'latest_news',null),
  ('9d000000-0000-4000-8000-000000000009',5,null,'top','Failure',true,'latest_news',null),
  ('9d000000-0000-4000-8000-00000000000b',6,null,'top','Topology recovery',true,'latest_news',null),
  ('9d000000-0000-4000-8000-00000000000d',7,null,'top','Carryover recovery',true,'latest_news',null),
  ('9d000000-0000-4000-8000-00000000000f',5,null,'top','Invalid projection',true,'latest_news',null);

insert into jornada_private.matchday_live_layout_physical_cutovers (
  matchday_id,
  profile_key
)
values
  ('9d000000-0000-4000-8000-000000000001','liga_portugal_v1'),
  ('9d000000-0000-4000-8000-000000000005','liga_portugal_v1'),
  ('9d000000-0000-4000-8000-000000000009','liga_portugal_v1'),
  ('9d000000-0000-4000-8000-00000000000b','liga_portugal_v1'),
  ('9d000000-0000-4000-8000-00000000000d','liga_portugal_v1'),
  ('9d000000-0000-4000-8000-00000000000f','liga_portugal_v1');

-- Corrupt the marker-backed source after setup: only four of the required
-- compatibility projections remain.
select jornada_private.begin_matchday_live_layout_downstream_v14(
  '9d000000-0000-4000-8000-00000000000f'
);

delete from jornada_private.matchday_live_layout_zone_legacy_projection
where matchday_id = '9d000000-0000-4000-8000-00000000000f'
  and legacy_zone_key = 'benfica';

select jornada_private.end_matchday_live_layout_downstream_v14(
  '9d000000-0000-4000-8000-00000000000f'
);

insert into public.matchday_editorial_desk_control (
  matchday_id,
  is_managed
)
select source_id, true
from pg_catalog.unnest(array[
  '9d000000-0000-4000-8000-000000000001'::uuid,
  '9d000000-0000-4000-8000-000000000003'::uuid,
  '9d000000-0000-4000-8000-000000000005'::uuid,
  '9d000000-0000-4000-8000-000000000007'::uuid,
  '9d000000-0000-4000-8000-000000000009'::uuid,
  '9d000000-0000-4000-8000-00000000000b'::uuid,
  '9d000000-0000-4000-8000-00000000000d'::uuid,
  '9d000000-0000-4000-8000-00000000000f'::uuid,
  '9d000000-0000-4000-8000-000000000011'::uuid
]) as source_row(source_id);

update public.matchday_editorial_desk_control
set faixa_visible = false,
    revision = 7,
    last_applied_at = '2026-09-05 10:30:00+00',
    live_public_zone_order = array[
      'six_news',
      'video',
      'four_news',
      'five_news_secondary',
      'five_news_balanced'
    ]::text[]
where matchday_id = '9d000000-0000-4000-8000-000000000001';

-- Rich active/archived state on the seven-zone normal source.
select jornada_private.begin_matchday_live_layout_downstream_v14(
  '9d000000-0000-4000-8000-000000000001'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  pg_catalog.array_agg(
    ('9d000000-0000-4000-8000-' ||
      pg_catalog.lpad((200 + item_no)::text, 12, '0'))::uuid
    order by item_no
  )
)
from pg_catalog.generate_series(1, 13) as item_row(item_no);

insert into public.matchday_editorial_bank_items (
  id, matchday_id, label, title, subtitle, image_url, link_url,
  source_type, source_id, source_slug, origin_slot_type, sort_order,
  status, automatic_eligible, editorially_worked_at,
  classification_key, classification_source, classified_at
)
select
  ('9d000000-0000-4000-8000-' ||
    pg_catalog.lpad((200 + item_no)::text, 12, '0'))::uuid,
  '9d000000-0000-4000-8000-000000000001'::uuid,
  'V19 ' || item_no,
  'Handoff article ' || item_no,
  'Subtitle ' || item_no,
  'https://example.test/v19-' || item_no || '.jpg',
  '/externo/v19-' || item_no,
  'editorial_article',
  'v19-source-' || item_no,
  'v19-source-' || item_no,
  'fixture',
  item_no,
  case when item_no = 13 then 'archived' else 'active' end,
  false,
  case when item_no = 9 then null
       else '2026-09-05 12:00:00+00'::timestamptz + item_no * interval '1 minute'
  end,
  case when item_no in (1, 2, 3) then
    (array['sporting','benfica','outside_liga_other'])[item_no]
    else null end,
  case when item_no in (1, 2, 3) then 'manual' else null end,
  case when item_no in (1, 2, 3) then
    '2026-09-05 11:00:00+00'::timestamptz + item_no * interval '1 minute'
    else null end
from pg_catalog.generate_series(1, 13) as item_row(item_no);

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  pg_catalog.array_agg(
    ('9d000000-0000-4000-8000-' ||
      pg_catalog.lpad((200 + item_no)::text, 12, '0'))::uuid
    order by item_no
  )
)
from pg_catalog.generate_series(1, 13) as item_row(item_no);

insert into public.matchday_live_layout_placements (
  id, matchday_id, bank_item_id, placement_type, zone_id, slot_position
)
select
  '9d000000-0000-4000-8000-000000000301',
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000201',
  'zone', projection_row.zone_id, 2
from jornada_private.matchday_live_layout_zone_legacy_projection
  as projection_row
where projection_row.matchday_id =
      '9d000000-0000-4000-8000-000000000001'
  and projection_row.legacy_zone_key = 'benfica';

insert into public.matchday_live_layout_placements (
  id, matchday_id, bank_item_id, placement_type, zone_id, slot_position
)
values
  ('9d000000-0000-4000-8000-000000000302','9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000202','zone','9d000000-0000-4000-8000-000000000061',5),
  ('9d000000-0000-4000-8000-000000000303','9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000203','zone','9d000000-0000-4000-8000-000000000062',4),
  ('9d000000-0000-4000-8000-000000000304','9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000204','opening',null,1),
  ('9d000000-0000-4000-8000-000000000305','9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000205','faixa',null,1),
  ('9d000000-0000-4000-8000-000000000306','9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000206','faixa',null,4),
  ('9d000000-0000-4000-8000-000000000307','9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000207','selection',null,3),
  ('9d000000-0000-4000-8000-000000000308','9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000208','video_highlight',null,1);

insert into public.matchday_editorial_profile_manual_overrides (
  matchday_id, profile_key, source_type, source_id,
  placement_target, zone_key, sort_order
)
values (
  '9d000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  'editorial_article',
  'v19-source-10',
  'bank',
  null,
  null
);

insert into public.matchday_live_layout_bank_item_state_memory (
  matchday_id, bank_item_id, memory_kind, recorded_at
)
values
  ('9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000211','displaced','2026-09-04 10:00:00+00'),
  ('9d000000-0000-4000-8000-000000000001','9d000000-0000-4000-8000-000000000212','legacy_unknown','2026-09-01 09:00:00+00');

insert into public.matchday_latest_news (
  id, matchday_id, time_label, time_label_color, title, subtitle,
  link_url, image_url, sort_order, status
)
values
  ('9d000000-0000-4000-8000-000000000401','9d000000-0000-4000-8000-000000000001','12:01','#111111','Latest one','Latest subtitle one','/externo/latest-one','https://example.test/l1.jpg',2,'published'),
  ('9d000000-0000-4000-8000-000000000402','9d000000-0000-4000-8000-000000000001','12:09','#222222','Latest two','Latest subtitle two','/externo/latest-two','https://example.test/l2.jpg',7,'published');

insert into public.matchday_roundup_items (
  id, matchday_id, label, title, subtitle, image_url, video_url,
  duration, type, sort_order, status, youtube_video_id,
  youtube_channel_id, is_embeddable
)
values
  ('9d000000-0000-4000-8000-000000000501','9d000000-0000-4000-8000-000000000001','Resumo','Roundup one','Roundup subtitle','https://example.test/r1.jpg','https://example.test/r1.mp4','02:30','resumo',1,'published','v19-video-1','v19-channel',true),
  ('9d000000-0000-4000-8000-000000000502','9d000000-0000-4000-8000-000000000001','Golos','Roundup two','Roundup subtitle','https://example.test/r2.jpg','https://example.test/r2.mp4','03:10','golos',3,'draft','v19-video-2','v19-channel',false);

insert into public.matchday_live_layout_items (
  id, matchday_id, slot_type, label, title, subtitle,
  image_url, link_url, source_type, source_id
)
values (
  '9d000000-0000-4000-8000-000000000601',
  '9d000000-0000-4000-8000-000000000001',
  'headline',
  'V19',
  'Functional headline',
  'Functional subtitle',
  'https://example.test/h.jpg',
  '/externo/headline',
  'editorial_article',
  'v19-source-4'
);

select jornada_private.project_matchday_live_layout_placements_downstream_v14(
  '9d000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

select jornada_private.assert_matchday_live_layout_downstream_v14(
  '9d000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

select jornada_private.end_matchday_live_layout_downstream_v14(
  '9d000000-0000-4000-8000-000000000001'
);

-- A non-empty genuine legacy source proves rollout compatibility, not merely
-- that the dispatcher can produce a v6 marker for an empty workspace.
insert into public.matchday_editorial_bank_items (
  id, matchday_id, label, title, subtitle, image_url, link_url,
  source_type, source_id, source_slug, origin_slot_type, sort_order,
  status, automatic_eligible
)
values (
  '9d000000-0000-4000-8000-000000000801',
  '9d000000-0000-4000-8000-000000000003',
  'LEGACY',
  'Legacy active participation',
  'Legacy subtitle',
  'https://example.test/legacy.jpg',
  '/externo/legacy',
  'editorial_article',
  '9d000000-0000-4000-8000-000000000805',
  'legacy-v19-1',
  'fixture',
  1,
  'active',
  false
);

insert into public.matchday_live_layout_placements (
  id, matchday_id, bank_item_id, placement_type, zone_id, slot_position
)
select
  '9d000000-0000-4000-8000-000000000802',
  '9d000000-0000-4000-8000-000000000003',
  '9d000000-0000-4000-8000-000000000801',
  'zone',
  projection_row.zone_id,
  1
from jornada_private.matchday_live_layout_zone_legacy_projection
  as projection_row
where projection_row.matchday_id =
      '9d000000-0000-4000-8000-000000000003'
  and projection_row.legacy_zone_key = 'benfica';

insert into public.matchday_latest_news (
  id, matchday_id, time_label, title, subtitle, link_url,
  image_url, sort_order, status
)
values (
  '9d000000-0000-4000-8000-000000000803',
  '9d000000-0000-4000-8000-000000000003',
  '11:00',
  'Legacy Latest',
  'Legacy Latest subtitle',
  '/externo/legacy-latest',
  'https://example.test/legacy-latest.jpg',
  1,
  'published'
);

insert into public.matchday_roundup_items (
  id, matchday_id, label, title, subtitle, image_url, video_url,
  duration, type, sort_order, status
)
values (
  '9d000000-0000-4000-8000-000000000804',
  '9d000000-0000-4000-8000-000000000003',
  'LEGACY',
  'Legacy Roundup',
  'Legacy Roundup subtitle',
  'https://example.test/legacy-roundup.jpg',
  'https://example.test/legacy-roundup.mp4',
  '01:00',
  'resumo',
  1,
  'published'
);

select jornada_private.project_matchday_live_layout_placements_downstream_v14(
  '9d000000-0000-4000-8000-000000000003',
  'liga_portugal_v1'
);

insert into public.matchday_reference_compositions (
  id, matchday_id, status, is_current, internal_name, published_at
)
values
  ('9d000000-0000-4000-8000-000000000701','9d000000-0000-4000-8000-000000000001','draft',false,'v19 normal composition',null),
  ('9d000000-0000-4000-8000-000000000703','9d000000-0000-4000-8000-000000000003','draft',false,'v19 legacy composition',null),
  ('9d000000-0000-4000-8000-000000000705','9d000000-0000-4000-8000-000000000005','draft',false,'v19 corrupt marker composition',null),
  ('9d000000-0000-4000-8000-000000000707','9d000000-0000-4000-8000-000000000007','draft',false,'v19 corrupt settings composition',null),
  ('9d000000-0000-4000-8000-000000000709','9d000000-0000-4000-8000-000000000009','draft',false,'v19 failure composition',null),
  ('9d000000-0000-4000-8000-00000000070b','9d000000-0000-4000-8000-00000000000b','published',true,'v19 topology recovery composition','2026-09-05 14:00:00+00'),
  ('9d000000-0000-4000-8000-00000000070d','9d000000-0000-4000-8000-00000000000d','published',true,'v19 carryover recovery composition','2026-09-05 14:10:00+00'),
  ('9d000000-0000-4000-8000-00000000070f','9d000000-0000-4000-8000-00000000000f','draft',false,'v19 invalid projection composition',null),
  ('9d000000-0000-4000-8000-000000000711','9d000000-0000-4000-8000-000000000011','draft',false,'v19 partial topology composition',null);


-- ============================================================
-- A. REAL NORMAL PUBLICATION: SEVEN-ZONE PHYSICAL HANDOFF
-- ============================================================

create temp table normal_before as
select jornada_private.matchday_live_layout_physical_archive_hash_v19(
  '9d000000-0000-4000-8000-000000000001'
) as source_hash;

create temp table normal_result as
select public.publish_matchday_reference_composition(
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000701'
) as result;

select pg_temp.assert_true(
  (select result ->> 'publicationKind' = 'first_publication'
     and (result ->> 'materialized')::boolean
     and (result ->> 'sourceRetired')::boolean
     and (result ->> 'targetActivated')::boolean
   from normal_result)
  and exists (
    select 1 from public.matchday_editorial_continuity_transitions
    where source_matchday_id = '9d000000-0000-4000-8000-000000000001'
      and target_matchday_id = '9d000000-0000-4000-8000-000000000002'
      and continuity_version = 19
  ),
  'real publication did not choose physical v19'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 7
   from public.matchday_live_layout_zones
   where matchday_id = '9d000000-0000-4000-8000-000000000002')
  and (select pg_catalog.count(*) = 7
       from jornada_private.matchday_live_layout_physical_zone_maps
       where target_matchday_id = '9d000000-0000-4000-8000-000000000002')
  and (select pg_catalog.count(*) = 5
       from jornada_private.matchday_live_layout_zone_legacy_projection
       where matchday_id = '9d000000-0000-4000-8000-000000000002'),
  'seven-zone target topology was not preserved'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements as target_placement
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.target_bank_item_id = target_placement.bank_item_id
    join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.target_zone_id = target_placement.zone_id
    where bank_map.source_bank_item_id =
          '9d000000-0000-4000-8000-000000000202'
      and zone_map.source_zone_id =
          '9d000000-0000-4000-8000-000000000061'
      and target_placement.slot_position = 5
  ),
  'zone six placement was not remapped by the physical map'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements as target_placement
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.target_bank_item_id = target_placement.bank_item_id
    join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.target_zone_id = target_placement.zone_id
    where bank_map.source_bank_item_id =
          '9d000000-0000-4000-8000-000000000203'
      and zone_map.source_zone_id =
          '9d000000-0000-4000-8000-000000000062'
      and target_placement.slot_position = 4
  ),
  'zone seven placement was not remapped by the physical map'
);

select pg_temp.assert_true(
  jornada_private.matchday_live_layout_physical_archive_hash_v19(
    '9d000000-0000-4000-8000-000000000001'
  ) = (select source_hash from normal_before)
  and (select pg_catalog.count(*) = 13
       from public.matchday_editorial_bank_items
       where matchday_id = '9d000000-0000-4000-8000-000000000001')
  and (select pg_catalog.count(*) = 8
       from public.matchday_live_layout_placements
       where matchday_id = '9d000000-0000-4000-8000-000000000001')
  and exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '9d000000-0000-4000-8000-000000000001'
      and not faixa_visible
      and revision = 7
      and last_applied_at = '2026-09-05 10:30:00+00'
      and live_public_zone_order = array[
        'six_news',
        'video',
        'four_news',
        'five_news_secondary',
        'five_news_balanced'
      ]::text[]
  ),
  'physical retirement changed the source archive'
);

select pg_temp.assert_true(
  not exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '9d000000-0000-4000-8000-000000000001'
      and is_managed
  ) and exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '9d000000-0000-4000-8000-000000000002'
      and is_managed
      and carryover_source_composition_id is null
      and carryover_snapshot is null
  ) and exists (
    select 1
    from jornada_private.matchday_live_layout_physical_handoffs
    where source_matchday_id = '9d000000-0000-4000-8000-000000000001'
      and target_matchday_id = '9d000000-0000-4000-8000-000000000002'
  ) and exists (
    select 1
    from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
    join public.read_matchday_live_layout_workspace_v13(
      '9d000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as workspace_row on true
    where handoff_row.source_matchday_id =
          '9d000000-0000-4000-8000-000000000001'
      and handoff_row.target_state_token = workspace_row.state_token
  ) and exists (
    select 1
    from public.matchday_live_layout_workspace_settings as target_settings
    join jornada_private.matchday_live_layout_physical_cutovers as target_marker
      on target_marker.matchday_id = target_settings.matchday_id
     and target_marker.profile_key = 'liga_portugal_v1'
    join public.matchday_editorial_profile_assignments as target_assignment
      on target_assignment.matchday_id = target_settings.matchday_id
     and target_assignment.profile_key = target_marker.profile_key
    where target_settings.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and target_settings.faixa_slot_count = 8
      and target_settings.latest_zone_title = 'Últimas V19'
  ),
  'physical desk ownership or final certificate is invalid'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 12
   from public.matchday_editorial_bank_items
   where matchday_id = '9d000000-0000-4000-8000-000000000002')
  and not exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = '9d000000-0000-4000-8000-000000000002'
      and source_id = 'v19-source-13'
  )
  and exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = '9d000000-0000-4000-8000-000000000002'
      and source_id = 'v19-source-9'
      and editorially_worked_at is null
      and automatic_eligible = false
  )
  and exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = '9d000000-0000-4000-8000-000000000002'
      and source_id = 'v19-source-1'
      and classification_key = 'sporting'
      and classification_source = 'continuity_assisted'
  )
  and exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as target_memory
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.target_bank_item_id = target_memory.bank_item_id
    where bank_map.source_bank_item_id =
          '9d000000-0000-4000-8000-000000000211'
      and target_memory.memory_kind = 'displaced'
      and target_memory.recorded_at = '2026-09-04 10:00:00+00'
  )
  and exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as target_override
    where target_override.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and target_override.placement_target = 'bank'
      and target_override.source_id = 'v19-source-10'
  ),
  'Bank active/archive classification or NOVA state changed'
);

select pg_temp.assert_true(
  (select pg_catalog.array_agg(slot_position order by slot_position) =
          array[1,4]
   from public.matchday_live_layout_placements
   where matchday_id = '9d000000-0000-4000-8000-000000000002'
     and placement_type = 'faixa')
  and (select pg_catalog.count(*) = 2
       from public.matchday_latest_news
       where matchday_id = '9d000000-0000-4000-8000-000000000002')
  and (select pg_catalog.count(*) = 2
       from public.matchday_roundup_items
       where matchday_id = '9d000000-0000-4000-8000-000000000002')
  and not exists (
    select 1 from public.matchday_editorial_profile_state_items
    where matchday_id = '9d000000-0000-4000-8000-000000000002'
  ),
  'physical carryover compacted slots or changed functional/state semantics'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
      and matchday_id in (
        '9d000000-0000-4000-8000-000000000001',
        '9d000000-0000-4000-8000-000000000002'
      )
  ) and not exists (
    select 1
    from jornada_private.matchday_live_layout_downstream_context
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
      and matchday_id in (
        '9d000000-0000-4000-8000-000000000001',
        '9d000000-0000-4000-8000-000000000002'
      )
  ) and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryover_context
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
      and target_matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ),
  'normal handoff leaked context or reverse sync'
);

insert into handoff_v19_results values
  (1, 'normal physical handoff with seven zones', 'PASS');

select pg_temp.assert_true(
  exists (
    select 1
    from jornada_private
      .matchday_historical_physical_archive_certificates_v20
      as certificate_row
    join jornada_private.matchday_live_layout_physical_handoffs as handoff_row
      on handoff_row.id = certificate_row.handoff_id
    where certificate_row.source_matchday_id =
          '9d000000-0000-4000-8000-000000000001'
      and certificate_row.target_matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and certificate_row.certification_basis = 'atomic_handoff'
      and certificate_row.v19_source_archive_hash =
          handoff_row.source_archive_hash
      and certificate_row.physical_core_hash = jornada_private
            .matchday_historical_physical_archive_hash_v20(
              '9d000000-0000-4000-8000-000000000001'
            )
  ),
  'completed handoff did not receive its atomic v20 certificate'
);

do $test$
begin
  begin
    perform public.publish_matchday_reference_composition_with_continuity(
      '9d000000-0000-4000-8000-000000000001',
      '9d000000-0000-4000-8000-000000000701'
    );
    raise exception 'assertion-failed: duplicate physical handoff succeeded';
  exception when others then
    if position('already-complete' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end;
$test$;


-- ============================================================
-- B. HISTORICAL REPUBLICATION DOES NOT REPLAY HANDOFF
-- ============================================================

create temp table source_archive_before_editorial_evolution as
select
  handoff_row.source_archive_hash as certified_v19_hash,
  jornada_private.matchday_live_layout_physical_archive_hash_v19(
    handoff_row.source_matchday_id
  ) as current_v19_hash,
  jornada_private.matchday_historical_physical_archive_hash_v20(
    handoff_row.source_matchday_id
  ) as current_v20_hash
from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
where handoff_row.source_matchday_id =
      '9d000000-0000-4000-8000-000000000001';

-- These are matchday-owned editorial/catalog projections. Their ordinary
-- writers remain valid after retirement and must not redefine physical shape.
update public.matchday_editorial_bank_items as bank_row
set title = bank_row.title || ' - editorial evolution',
    updated_at = pg_catalog.statement_timestamp()
where bank_row.id = '9d000000-0000-4000-8000-000000000201';

update public.matchday_latest_news as latest_row
set title = latest_row.title || ' - editorial evolution',
    updated_at = pg_catalog.statement_timestamp()
where latest_row.id = '9d000000-0000-4000-8000-000000000401';

update public.matchday_highlights as highlight_row
set title = highlight_row.title || ' - editorial evolution',
    updated_at = pg_catalog.statement_timestamp()
where highlight_row.matchday_id =
      '9d000000-0000-4000-8000-000000000001'
  and highlight_row.sort_order = 1;

update public.matchday_roundup_items as roundup_row
set title = roundup_row.title || ' - editorial evolution',
    updated_at = pg_catalog.statement_timestamp()
where roundup_row.id = '9d000000-0000-4000-8000-000000000501';

select pg_temp.assert_true(
  jornada_private.matchday_live_layout_physical_archive_hash_v19(
    '9d000000-0000-4000-8000-000000000001'
  ) is distinct from (
    select certified_v19_hash
    from source_archive_before_editorial_evolution
  )
  and jornada_private.matchday_historical_physical_archive_hash_v20(
        '9d000000-0000-4000-8000-000000000001'
      ) = (
        select current_v20_hash
        from source_archive_before_editorial_evolution
      ),
  'editorial evolution did not diverge v19 while preserving physical v20'
);

select jornada_private
  .assert_matchday_live_layout_historical_physical_archive_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002',
    '9d000000-0000-4000-8000-000000000701'
  );

insert into public.matchday_reference_compositions (
  id,
  matchday_id,
  status,
  is_current,
  internal_name,
  presentation_mode,
  hierarchical_editorial_title,
  hierarchical_editorial_excerpt,
  hierarchical_editorial_text,
  hierarchical_editorial_author,
  hierarchical_headline_title_color,
  hierarchical_zone_1_title,
  hierarchical_zone_2_title,
  hierarchical_block_order,
  hierarchical_video_position
)
values (
  '9d000000-0000-4000-8000-000000000702',
  '9d000000-0000-4000-8000-000000000001',
  'draft',
  false,
  'v19 historical republication',
  'hierarchical',
  'Historical editorial',
  'Historical editorial excerpt',
  'Historical editorial text',
  'Historical author',
  '#123456',
  'Historical zone 1',
  'Historical zone 2',
  '["opening","zone_1","zone_2","video","beyond"]'::jsonb,
  1
);

insert into public.matchday_reference_composition_items (
  id,
  composition_id,
  slot_type,
  source_type,
  source_id,
  sort_order,
  title_snapshot,
  subtitle_snapshot,
  image_url_snapshot,
  link_url_snapshot,
  label_snapshot,
  status,
  label_color_snapshot,
  media_kind_snapshot,
  media_embed_url_snapshot,
  media_video_url_snapshot
)
values (
  '9d000000-0000-4000-8000-000000000720',
  '9d000000-0000-4000-8000-000000000702',
  'headline',
  'manual_link',
  '9d000000-0000-4000-8000-000000000719',
  1,
  'Historical reference item',
  'Historical reference subtitle',
  'https://example.test/historical-reference.jpg',
  'https://example.test/historical-reference',
  'REFERENCE',
  'published',
  '#654321',
  'embed',
  'https://example.test/historical-reference-embed',
  null
);

insert into public.matchday_hierarchical_composition_slots (
  id,
  composition_id,
  slot_key,
  bank_item_id,
  source_identity,
  label_snapshot,
  title_snapshot,
  subtitle_snapshot,
  image_url_snapshot,
  link_url_snapshot,
  media_kind_snapshot,
  media_embed_url_snapshot,
  media_video_url_snapshot
)
select
  ('9d000000-0000-4000-8000-' ||
    pg_catalog.lpad((720 + value)::text, 12, '0'))::uuid,
  '9d000000-0000-4000-8000-000000000702'::uuid,
  (array[
    'dominant_main',
    'other_chronicle_1',
    'other_chronicle_2',
    'other_chronicle_3'
  ])[value],
  ('9d000000-0000-4000-8000-' ||
    pg_catalog.lpad((200 + value)::text, 12, '0'))::uuid,
  'historical-slot-' || value::text,
  'HS' || value::text,
  'Historical slot ' || value::text,
  'Historical slot subtitle ' || value::text,
  'https://example.test/historical-slot-' || value::text || '.jpg',
  'https://example.test/historical-slot-' || value::text,
  case when value = 1 then 'direct_video' else null end,
  null,
  case when value = 1
    then 'https://example.test/historical-slot-video.mp4'
    else null
  end
from pg_catalog.generate_series(1, 4) as slot_value(value);

insert into public.matchday_historical_composition_zones (
  id,
  composition_id,
  sort_order,
  public_title,
  visual_family
)
values (
  '9d000000-0000-4000-8000-000000000730',
  '9d000000-0000-4000-8000-000000000702',
  1,
  'Historical dynamic zone',
  'five_news_balanced'
);

insert into public.matchday_historical_composition_zone_items (
  id,
  composition_id,
  zone_id,
  position,
  bank_item_id,
  source_identity,
  label_snapshot,
  title_snapshot,
  subtitle_snapshot,
  image_url_snapshot,
  link_url_snapshot
)
select
  ('9d000000-0000-4000-8000-' ||
    pg_catalog.lpad((730 + value)::text, 12, '0'))::uuid,
  '9d000000-0000-4000-8000-000000000702'::uuid,
  '9d000000-0000-4000-8000-000000000730'::uuid,
  value,
  ('9d000000-0000-4000-8000-' ||
    pg_catalog.lpad((204 + value)::text, 12, '0'))::uuid,
  'historical-zone-item-' || value::text,
  'HZ' || value::text,
  'Historical zone item ' || value::text,
  'Historical zone subtitle ' || value::text,
  'https://example.test/historical-zone-' || value::text || '.jpg',
  'https://example.test/historical-zone-' || value::text
from pg_catalog.generate_series(1, 5) as zone_item_value(value);

create temp table republish_handoff_token as
select handoff_row.target_state_token
from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
where handoff_row.source_matchday_id =
      '9d000000-0000-4000-8000-000000000001';

-- J06 evolves legitimately after the one-time handoff. The historical J05
-- republication must not require this current workspace to equal the frozen
-- handoff token.
update public.matchday_live_layout_workspace_settings as target_settings
set latest_zone_title = 'Últimas J06 depois do handoff',
    updated_at = pg_catalog.statement_timestamp()
where target_settings.matchday_id =
      '9d000000-0000-4000-8000-000000000002';

select pg_temp.assert_true(
  exists (
    select 1
    from public.read_matchday_live_layout_workspace_v13(
      '9d000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as workspace_row
    cross join republish_handoff_token as handoff_row
    where workspace_row.state_token is distinct from
          handoff_row.target_state_token
  ) and exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and settings_row.latest_zone_title =
          'Últimas J06 depois do handoff'
  ),
  'target did not evolve after the completed handoff'
);

create temp table republish_before as
select
  jornada_private.matchday_live_layout_physical_archive_hash_v19(
    '9d000000-0000-4000-8000-000000000001'
  ) as source_hash,
  jornada_private.matchday_historical_physical_archive_hash_v20(
    '9d000000-0000-4000-8000-000000000001'
  ) as physical_source_hash,
  pg_temp.target_live_state_v19(
    '9d000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) as target_state,
  (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_topology_transitions) as topology_count,
  (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_carryovers) as carryover_count,
  (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_handoffs) as handoff_count;

create temp table republish_result as
select public.publish_matchday_reference_composition(
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000702'
) as result;

select pg_temp.assert_true(
  (select result ->> 'publicationKind' = 'historical_republish'
     and (result ->> 'continuityVersion')::integer = 19
   from republish_result)
  and jornada_private.matchday_live_layout_physical_archive_hash_v19(
        '9d000000-0000-4000-8000-000000000001'
      ) = (select source_hash from republish_before)
  and jornada_private.matchday_historical_physical_archive_hash_v20(
        '9d000000-0000-4000-8000-000000000001'
      ) = (select physical_source_hash from republish_before)
  and pg_temp.target_live_state_v19(
        '9d000000-0000-4000-8000-000000000002',
        'liga_portugal_v1'
      ) = (select target_state from republish_before)
  and (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_topology_transitions) =
      (select topology_count from republish_before)
  and (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_carryovers) =
      (select carryover_count from republish_before)
  and (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_handoffs) =
      (select handoff_count from republish_before),
  'historical republication changed the evolved target or durable handoff'
);

insert into handoff_v19_results values
  (2, 'historical republication accepts evolved target without writes', 'PASS');

insert into handoff_v19_results values
  (7, 'v20 accepts evolved Bank Latest Highlights and Roundup', 'PASS');

-- The current public composition is now a later hierarchical republication,
-- not the original source_composition_id certified by the handoff. Archived
-- source placements and memory remain present and are not retirement guards.
create temp table historical_reopen_before as
select
  pg_catalog.to_jsonb(handoff_row) as handoff_payload,
  pg_catalog.to_jsonb(transition_row) as transition_payload,
  jornada_private.matchday_historical_physical_archive_hash_v20(
    handoff_row.source_matchday_id
  ) as physical_source_hash,
  pg_temp.target_live_state_v19(
    handoff_row.target_matchday_id,
    handoff_row.profile_key
  ) as target_state
from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
join public.matchday_editorial_continuity_transitions as transition_row
  on transition_row.source_matchday_id = handoff_row.source_matchday_id
 and transition_row.target_matchday_id = handoff_row.target_matchday_id
 and transition_row.source_composition_id = handoff_row.source_composition_id
where handoff_row.source_matchday_id =
      '9d000000-0000-4000-8000-000000000001';

do $test$
declare
  v_draft_id uuid;
  v_idempotent_draft_id uuid;
  v_error text;
begin
  perform pg_temp.assert_true(
    exists (
      select 1
      from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
      join public.matchday_reference_compositions as current_composition
        on current_composition.matchday_id = handoff_row.source_matchday_id
       and current_composition.status = 'published'
       and current_composition.is_current
      where handoff_row.source_matchday_id =
            '9d000000-0000-4000-8000-000000000001'
        and handoff_row.source_composition_id =
            '9d000000-0000-4000-8000-000000000701'
        and current_composition.id =
            '9d000000-0000-4000-8000-000000000702'
        and current_composition.id <> handoff_row.source_composition_id
    ) and exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id =
            '9d000000-0000-4000-8000-000000000001'
    ) and exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id =
            '9d000000-0000-4000-8000-000000000001'
    ),
    'historical reopen fixture lacks republished current or archived state'
  );

  v_draft_id := public.reopen_matchday_reference_composition(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000702'
  );

  v_idempotent_draft_id := public.reopen_matchday_reference_composition(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000702'
  );

  perform pg_temp.assert_true(
    v_idempotent_draft_id = v_draft_id
      and (select status = 'draft'
                    and not is_current
                    and presentation_mode = 'hierarchical'
             from public.matchday_reference_compositions
             where id = v_draft_id)
      and (select status = 'published' and is_current
             from public.matchday_reference_compositions
             where id = '9d000000-0000-4000-8000-000000000702'),
    'historical reopen was not independent and idempotent'
  );

  perform pg_temp.assert_true(
    (select pg_catalog.jsonb_build_array(
              internal_name,
              use_roundup_items,
              presentation_mode,
              hierarchical_editorial_title,
              hierarchical_editorial_excerpt,
              hierarchical_editorial_text,
              hierarchical_editorial_author,
              hierarchical_headline_title_color,
              hierarchical_zone_1_title,
              hierarchical_zone_2_title,
              hierarchical_block_order,
              hierarchical_video_position
            )
       from public.matchday_reference_compositions
       where id = v_draft_id) =
    (select pg_catalog.jsonb_build_array(
              internal_name,
              use_roundup_items,
              presentation_mode,
              hierarchical_editorial_title,
              hierarchical_editorial_excerpt,
              hierarchical_editorial_text,
              hierarchical_editorial_author,
              hierarchical_headline_title_color,
              hierarchical_zone_1_title,
              hierarchical_zone_2_title,
              hierarchical_block_order,
              hierarchical_video_position
            )
       from public.matchday_reference_compositions
       where id = '9d000000-0000-4000-8000-000000000702'),
    'historical reopen did not copy composition properties'
  );

  perform pg_temp.assert_true(
    (select pg_catalog.count(*) = 1
       from public.matchday_reference_composition_items
       where composition_id = v_draft_id)
      and (select pg_catalog.count(*) = 4
             from public.matchday_hierarchical_composition_slots
             where composition_id = v_draft_id)
      and (select pg_catalog.count(*) = 1
             from public.matchday_historical_composition_zones
             where composition_id = v_draft_id)
      and (select pg_catalog.count(*) = 5
             from public.matchday_historical_composition_zone_items
             where composition_id = v_draft_id)
      and exists (
        select 1
        from public.matchday_reference_composition_items as item_row
        where item_row.composition_id = v_draft_id
          and item_row.media_kind_snapshot = 'embed'
          and item_row.media_embed_url_snapshot =
              'https://example.test/historical-reference-embed'
      ) and exists (
        select 1
        from public.matchday_hierarchical_composition_slots as slot_row
        where slot_row.composition_id = v_draft_id
          and slot_row.slot_key = 'dominant_main'
          and slot_row.media_kind_snapshot = 'direct_video'
          and slot_row.media_video_url_snapshot =
              'https://example.test/historical-slot-video.mp4'
      ),
    'historical reopen did not copy children and media snapshots'
  );

  perform pg_temp.assert_true(
    not exists (
      select
        slot_key,
        bank_item_id,
        source_identity,
        label_snapshot,
        title_snapshot,
        subtitle_snapshot,
        image_url_snapshot,
        link_url_snapshot,
        media_kind_snapshot,
        media_embed_url_snapshot,
        media_video_url_snapshot
      from public.matchday_hierarchical_composition_slots
      where composition_id =
            '9d000000-0000-4000-8000-000000000702'
      except
      select
        slot_key,
        bank_item_id,
        source_identity,
        label_snapshot,
        title_snapshot,
        subtitle_snapshot,
        image_url_snapshot,
        link_url_snapshot,
        media_kind_snapshot,
        media_embed_url_snapshot,
        media_video_url_snapshot
      from public.matchday_hierarchical_composition_slots
      where composition_id = v_draft_id
    ) and not exists (
      select
        zone_row.sort_order,
        zone_row.public_title,
        zone_row.visual_family,
        item_row.position,
        item_row.bank_item_id,
        item_row.source_identity,
        item_row.label_snapshot,
        item_row.title_snapshot,
        item_row.subtitle_snapshot,
        item_row.image_url_snapshot,
        item_row.link_url_snapshot
      from public.matchday_historical_composition_zones as zone_row
      join public.matchday_historical_composition_zone_items as item_row
        on item_row.zone_id = zone_row.id
       and item_row.composition_id = zone_row.composition_id
      where zone_row.composition_id =
            '9d000000-0000-4000-8000-000000000702'
      except
      select
        zone_row.sort_order,
        zone_row.public_title,
        zone_row.visual_family,
        item_row.position,
        item_row.bank_item_id,
        item_row.source_identity,
        item_row.label_snapshot,
        item_row.title_snapshot,
        item_row.subtitle_snapshot,
        item_row.image_url_snapshot,
        item_row.link_url_snapshot
      from public.matchday_historical_composition_zones as zone_row
      join public.matchday_historical_composition_zone_items as item_row
        on item_row.zone_id = zone_row.id
       and item_row.composition_id = zone_row.composition_id
      where zone_row.composition_id = v_draft_id
    ),
    'historical reopen changed slot or remapped zone-item snapshots'
  );

  begin
    perform public.reopen_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000001',
      '9d000000-0000-4000-8000-000000000701'
    );
    raise exception 'assertion-failed: non-current composition reopened';
  exception when others then
    v_error := sqlerrm;
    if pg_catalog.position('composition_current_published_not_found' in v_error)
       = 0 then
      raise;
    end if;
  end;

  begin
    perform public.reopen_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000001',
      v_draft_id
    );
    raise exception 'assertion-failed: draft composition reopened';
  exception when others then
    v_error := sqlerrm;
    if pg_catalog.position('composition_current_published_not_found' in v_error)
       = 0 then
      raise;
    end if;
  end;

  begin
    perform public.reopen_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000001',
      '9d000000-0000-4000-8000-000000000703'
    );
    raise exception 'assertion-failed: incoherent matchday/composition reopened';
  exception when others then
    v_error := sqlerrm;
    if pg_catalog.position('composition_current_published_not_found' in v_error)
       = 0 then
      raise;
    end if;
  end;

  update public.matchday_reference_compositions
  set status = 'published',
      is_current = true,
      published_at = pg_catalog.statement_timestamp()
  where id = '9d000000-0000-4000-8000-000000000703';

  begin
    perform public.reopen_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000003',
      '9d000000-0000-4000-8000-000000000703'
    );
    raise exception 'assertion-failed: managed source reopened';
  exception when others then
    v_error := sqlerrm;
    if pg_catalog.position('composition_historical_source_not_retired' in v_error)
       = 0 then
      raise;
    end if;
  end;

  update public.matchday_editorial_desk_control
  set is_managed = false,
      carryover_source_composition_id = null,
      carryover_snapshot = null
  where matchday_id = '9d000000-0000-4000-8000-000000000003';

  begin
    perform public.reopen_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000003',
      '9d000000-0000-4000-8000-000000000703'
    );
    raise exception 'assertion-failed: source without handoff reopened';
  exception when others then
    v_error := sqlerrm;
    if pg_catalog.position(
         'composition_historical_physical_handoff_not_found' in v_error
       ) = 0 then
      raise;
    end if;
  end;

  update public.matchday_editorial_desk_control
  set is_managed = true
  where matchday_id = '9d000000-0000-4000-8000-000000000003';

  update public.matchday_reference_compositions
  set status = 'draft',
      is_current = false,
      published_at = null
  where id = '9d000000-0000-4000-8000-000000000703';

  perform pg_temp.assert_true(
    (select pg_catalog.to_jsonb(handoff_row) = before_row.handoff_payload
       from jornada_private.matchday_live_layout_physical_handoffs
         as handoff_row
       cross join historical_reopen_before as before_row
       where handoff_row.source_matchday_id =
             '9d000000-0000-4000-8000-000000000001')
      and (select pg_catalog.to_jsonb(transition_row) =
                  before_row.transition_payload
             from public.matchday_editorial_continuity_transitions
               as transition_row
             cross join historical_reopen_before as before_row
             where transition_row.source_matchday_id =
                   '9d000000-0000-4000-8000-000000000001')
      and jornada_private.matchday_historical_physical_archive_hash_v20(
            '9d000000-0000-4000-8000-000000000001'
          ) = (select physical_source_hash from historical_reopen_before)
      and pg_temp.target_live_state_v19(
            '9d000000-0000-4000-8000-000000000002',
            'liga_portugal_v1'
          ) = (select target_state from historical_reopen_before),
    'historical reopen changed physical archive, handoff, transition or target'
  );
end;
$test$;

insert into handoff_v19_results values
  (10, 'historical reopen uses durable handoff authority', 'PASS');

-- Each corruption attempt is rolled back by its exception subtransaction.
-- The validator names the first physical component that diverged.
do $test$
begin
  begin
    update public.matchday_live_layout_zones as zone_row
    set public_title = zone_row.public_title || ' changed'
    where zone_row.id = '9d000000-0000-4000-8000-000000000061';

    perform jornada_private
      .assert_matchday_live_layout_historical_physical_archive_v20(
        '9d000000-0000-4000-8000-000000000001',
        '9d000000-0000-4000-8000-000000000002',
        '9d000000-0000-4000-8000-000000000701'
      );
    raise exception 'assertion-failed: topology mutation passed v20';
  exception when others then
    if pg_catalog.position(
         'matchday-live-layout-historical-v20-zones-changed' in sqlerrm
       ) = 0
    then
      raise;
    end if;
  end;

  begin
    update public.matchday_live_layout_workspace_settings as settings_row
    set headline_title_color = '#123456'
    where settings_row.matchday_id =
          '9d000000-0000-4000-8000-000000000001';

    perform jornada_private
      .assert_matchday_live_layout_historical_physical_archive_v20(
        '9d000000-0000-4000-8000-000000000001',
        '9d000000-0000-4000-8000-000000000002',
        '9d000000-0000-4000-8000-000000000701'
      );
    raise exception 'assertion-failed: settings mutation passed v20';
  exception when others then
    if pg_catalog.position(
         'matchday-live-layout-historical-v20-settings-changed' in sqlerrm
       ) = 0
    then
      raise;
    end if;
  end;

  begin
    update public.matchday_live_layout_placements as placement_row
    set slot_position = 3
    where placement_row.id = '9d000000-0000-4000-8000-000000000301';

    perform jornada_private
      .assert_matchday_live_layout_historical_physical_archive_v20(
        '9d000000-0000-4000-8000-000000000001',
        '9d000000-0000-4000-8000-000000000002',
        '9d000000-0000-4000-8000-000000000701'
      );
    raise exception 'assertion-failed: placement mutation passed v20';
  exception when others then
    if pg_catalog.position(
         'matchday-live-layout-historical-v20-placements-changed' in sqlerrm
       ) = 0
    then
      raise;
    end if;
  end;
end;
$test$;

select pg_temp.assert_true(
  jornada_private.matchday_historical_physical_archive_hash_v20(
    '9d000000-0000-4000-8000-000000000001'
  ) = (select physical_source_hash from republish_before),
  'physical corruption probes escaped their rollback subtransactions'
);

insert into handoff_v19_results values
  (8, 'v20 rejects topology settings and placement mutations', 'PASS');

do $test$
declare
  v_certificate_count_before bigint;
begin
  select pg_catalog.count(*)
  into v_certificate_count_before
  from jornada_private
    .matchday_historical_physical_archive_certificates_v20;

  begin
    perform jornada_private
      .assert_matchday_live_layout_historical_physical_archive_v20(
        '9d000000-0000-4000-8000-000000000003',
        '9d000000-0000-4000-8000-000000000004',
        '9d000000-0000-4000-8000-000000000703'
      );
    raise exception 'assertion-failed: source without v20 certificate passed';
  exception when others then
    if pg_catalog.position(
         'matchday-live-layout-historical-v20-certificate-missing' in sqlerrm
       ) = 0
    then
      raise;
    end if;
  end;

  begin
    update public.matchday_editorial_desk_control as source_desk
    set is_managed = false
    where source_desk.matchday_id =
          '9d000000-0000-4000-8000-000000000003';

    perform jornada_private
      .assert_matchday_live_layout_historical_physical_archive_v20(
        '9d000000-0000-4000-8000-000000000003',
        '9d000000-0000-4000-8000-000000000004',
        '9d000000-0000-4000-8000-000000000703'
      );
    raise exception
      'assertion-failed: retired source without handoff passed v20';
  exception when others then
    if pg_catalog.position(
         'matchday-live-layout-historical-v20-certificate-missing' in sqlerrm
       ) = 0
    then
      raise;
    end if;
  end;

  perform pg_temp.assert_true(
    (
      select pg_catalog.count(*)
      from jornada_private
        .matchday_historical_physical_archive_certificates_v20
    ) = v_certificate_count_before,
    'strict v20 validation fabricated a runtime certificate'
  );
end;
$test$;

insert into handoff_v19_results values
  (9, 'v20 never fabricates historical authority at runtime', 'PASS');


-- ============================================================
-- C. GENUINE LEGACY FALLBACK AND PHYSICAL CORRUPTION
-- ============================================================

select public.publish_matchday_reference_composition(
  '9d000000-0000-4000-8000-000000000003',
  '9d000000-0000-4000-8000-000000000703'
);

select pg_temp.assert_true(
  exists (
    select 1 from public.matchday_editorial_continuity_transitions
    where source_matchday_id = '9d000000-0000-4000-8000-000000000003'
      and target_matchday_id = '9d000000-0000-4000-8000-000000000004'
      and continuity_version = 6
  ) and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
    where source_matchday_id = '9d000000-0000-4000-8000-000000000003'
       or target_matchday_id = '9d000000-0000-4000-8000-000000000004'
  ) and exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = '9d000000-0000-4000-8000-000000000004'
      and source_id = '9d000000-0000-4000-8000-000000000805'
  ) and exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = '9d000000-0000-4000-8000-000000000004'
      and placement_type = 'zone'
      and slot_position = 1
  ) and exists (
    select 1 from public.matchday_latest_news
    where matchday_id = '9d000000-0000-4000-8000-000000000004'
      and title = 'Legacy Latest'
  ) and exists (
    select 1 from public.matchday_roundup_items
    where matchday_id = '9d000000-0000-4000-8000-000000000004'
      and title = 'Legacy Roundup'
  ),
  'legacy source did not use continuity v6'
);

do $test$
begin
  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000005',
      '9d000000-0000-4000-8000-000000000705'
    );
    raise exception 'assertion-failed: corrupt marker unexpectedly succeeded';
  exception when others then
    if position('source-authority-incoherent' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000007',
      '9d000000-0000-4000-8000-000000000707'
    );
    raise exception 'assertion-failed: corrupt settings unexpectedly succeeded';
  exception when others then
    if position('source-physical-incoherent' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-00000000000f',
      '9d000000-0000-4000-8000-00000000070f'
    );
    raise exception 'assertion-failed: invalid projection unexpectedly succeeded';
  exception when others then
    if position('legacy-projection-invalid' in sqlerrm) = 0 then
      raise;
    end if;
  end;

  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000011',
      '9d000000-0000-4000-8000-000000000711'
    );
    raise exception 'assertion-failed: partial topology unexpectedly succeeded';
  exception when others then
    if position('source-physical-incoherent' in sqlerrm) = 0 then
      raise;
    end if;
  end;
end;
$test$;

select pg_temp.assert_true(
  not exists (
    select 1 from public.matchday_editorial_continuity_transitions
    where source_matchday_id in (
      '9d000000-0000-4000-8000-000000000005',
      '9d000000-0000-4000-8000-000000000007',
      '9d000000-0000-4000-8000-00000000000f',
      '9d000000-0000-4000-8000-000000000011'
    )
  ) and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
    where source_matchday_id in (
      '9d000000-0000-4000-8000-000000000005',
      '9d000000-0000-4000-8000-000000000007',
      '9d000000-0000-4000-8000-00000000000f',
      '9d000000-0000-4000-8000-000000000011'
    )
  ),
  'physical corruption fell back to legacy'
);

insert into handoff_v19_results values
  (3, 'legacy dispatch and physical corruption fail closed', 'PASS');


-- ============================================================
-- D. NORMAL HANDOFF FAILURE INJECTION AND COMPLETE RETRY
-- ============================================================

create temp table failure_before as
select jornada_private.matchday_live_layout_physical_archive_hash_v19(
  '9d000000-0000-4000-8000-000000000009'
) as source_hash;

create trigger fail_v19_after_topology
after insert on jornada_private.matchday_live_layout_physical_topology_transitions
for each row execute function pg_temp.inject_v19_failure();

do $test$
begin
  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000009',
      '9d000000-0000-4000-8000-000000000709'
    );
  exception when others then
    if sqlerrm <> 'v19-injected-failure' then raise; end if;
  end;
end;
$test$;

drop trigger fail_v19_after_topology
on jornada_private.matchday_live_layout_physical_topology_transitions;

select pg_temp.assert_normal_rollback(
  '9d000000-0000-4000-8000-000000000009',
  '9d000000-0000-4000-8000-00000000000a',
  '9d000000-0000-4000-8000-000000000709',
  (select source_hash from failure_before),
  'failure after v17 did not roll back the normal handoff'
);

create trigger fail_v19_after_carryover
after insert on jornada_private.matchday_live_layout_physical_carryovers
for each row execute function pg_temp.inject_v19_failure();

do $test$
begin
  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000009',
      '9d000000-0000-4000-8000-000000000709'
    );
  exception when others then
    if sqlerrm <> 'v19-injected-failure' then raise; end if;
  end;
end;
$test$;

drop trigger fail_v19_after_carryover
on jornada_private.matchday_live_layout_physical_carryovers;

select pg_temp.assert_normal_rollback(
  '9d000000-0000-4000-8000-000000000009',
  '9d000000-0000-4000-8000-00000000000a',
  '9d000000-0000-4000-8000-000000000709',
  (select source_hash from failure_before),
  'failure after v18 did not roll back the normal handoff'
);

create trigger fail_v19_before_retirement
before update on public.matchday_editorial_desk_control
for each row
when (
  old.matchday_id = '9d000000-0000-4000-8000-000000000009'::uuid
  and old.is_managed and not new.is_managed
)
execute function pg_temp.inject_v19_failure();

do $test$
begin
  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000009',
      '9d000000-0000-4000-8000-000000000709'
    );
  exception when others then
    if sqlerrm <> 'v19-injected-failure' then raise; end if;
  end;
end;
$test$;

drop trigger fail_v19_before_retirement
on public.matchday_editorial_desk_control;

select pg_temp.assert_normal_rollback(
  '9d000000-0000-4000-8000-000000000009',
  '9d000000-0000-4000-8000-00000000000a',
  '9d000000-0000-4000-8000-000000000709',
  (select source_hash from failure_before),
  'failure before source retirement did not roll back the normal handoff'
);

create trigger fail_v19_after_retirement
after update on public.matchday_editorial_desk_control
for each row
when (
  old.matchday_id = '9d000000-0000-4000-8000-000000000009'::uuid
  and old.is_managed and not new.is_managed
)
execute function pg_temp.inject_v19_failure();

do $test$
begin
  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000009',
      '9d000000-0000-4000-8000-000000000709'
    );
  exception when others then
    if sqlerrm <> 'v19-injected-failure' then raise; end if;
  end;
end;
$test$;

drop trigger fail_v19_after_retirement
on public.matchday_editorial_desk_control;

select pg_temp.assert_normal_rollback(
  '9d000000-0000-4000-8000-000000000009',
  '9d000000-0000-4000-8000-00000000000a',
  '9d000000-0000-4000-8000-000000000709',
  (select source_hash from failure_before),
  'failure after source retirement did not roll back the normal handoff'
);

create trigger fail_v19_after_target_activation
after insert or update on public.matchday_editorial_desk_control
for each row
when (
  new.matchday_id = '9d000000-0000-4000-8000-00000000000a'::uuid
  and new.is_managed
)
execute function pg_temp.inject_v19_failure();

do $test$
begin
  begin
    perform public.publish_matchday_reference_composition(
      '9d000000-0000-4000-8000-000000000009',
      '9d000000-0000-4000-8000-000000000709'
    );
  exception when others then
    if sqlerrm <> 'v19-injected-failure' then raise; end if;
  end;
end;
$test$;

drop trigger fail_v19_after_target_activation
on public.matchday_editorial_desk_control;

select pg_temp.assert_normal_rollback(
  '9d000000-0000-4000-8000-000000000009',
  '9d000000-0000-4000-8000-00000000000a',
  '9d000000-0000-4000-8000-000000000709',
  (select source_hash from failure_before),
  'failure after target activation did not roll back the normal handoff'
);

select public.publish_matchday_reference_composition(
  '9d000000-0000-4000-8000-000000000009',
  '9d000000-0000-4000-8000-000000000709'
);

select pg_temp.assert_true(
  exists (
    select 1 from jornada_private.matchday_live_layout_physical_handoffs
    where source_matchday_id = '9d000000-0000-4000-8000-000000000009'
      and target_matchday_id = '9d000000-0000-4000-8000-00000000000a'
  ),
  'retry after rollback did not complete exactly once'
);

insert into handoff_v19_results values
  (4, 'normal handoff rollback and retry', 'PASS');


-- ============================================================
-- E. RECOVERY FROM THE TWO STATES ACTUALLY PRODUCED BY V17/V18
-- ============================================================

create temp table recovery_topology as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  '9d000000-0000-4000-8000-00000000000b',
  '9d000000-0000-4000-8000-00000000000c'
);

create trigger fail_v19_topology_recovery_activation
after insert or update on public.matchday_editorial_desk_control
for each row
when (
  new.matchday_id = '9d000000-0000-4000-8000-00000000000c'::uuid
  and new.is_managed
)
execute function pg_temp.inject_v19_failure();

do $test$
begin
  begin
    perform public.recover_matchday_live_layout_continuity(
      '9d000000-0000-4000-8000-00000000000b',
      '9d000000-0000-4000-8000-00000000000c',
      '9d000000-0000-4000-8000-00000000070b'
    );
  exception when others then
    if sqlerrm <> 'v19-injected-failure' then raise; end if;
  end;
end;
$test$;

drop trigger fail_v19_topology_recovery_activation
on public.matchday_editorial_desk_control;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from jornada_private.matchday_live_layout_physical_topology_transitions
   where source_matchday_id = '9d000000-0000-4000-8000-00000000000b')
  and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_carryovers
    where source_matchday_id = '9d000000-0000-4000-8000-00000000000b'
  ) and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_handoffs
    where source_matchday_id = '9d000000-0000-4000-8000-00000000000b'
  ) and exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '9d000000-0000-4000-8000-00000000000b'
      and is_managed
  ) and not exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '9d000000-0000-4000-8000-00000000000c'
      and is_managed
  ),
  'failed topology-only recovery did not preserve its exact initial state'
);

select public.recover_matchday_live_layout_continuity(
  '9d000000-0000-4000-8000-00000000000b',
  '9d000000-0000-4000-8000-00000000000c',
  '9d000000-0000-4000-8000-00000000070b'
);

select pg_temp.assert_true(
  exists (
    select 1 from jornada_private.matchday_live_layout_physical_handoffs
    where source_matchday_id = '9d000000-0000-4000-8000-00000000000b'
      and target_matchday_id = '9d000000-0000-4000-8000-00000000000c'
  ),
  'topology-only recovery did not converge'
);

create temp table recovery_carryover_topology as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  '9d000000-0000-4000-8000-00000000000d',
  '9d000000-0000-4000-8000-00000000000e'
);

create temp table recovery_carryover as
select *
from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
  '9d000000-0000-4000-8000-00000000000d',
  '9d000000-0000-4000-8000-00000000000e',
  '9d000000-0000-4000-8000-00000000070d',
  (select topology_transition_id from recovery_carryover_topology)
);

create trigger fail_v19_carryover_recovery_activation
after insert or update on public.matchday_editorial_desk_control
for each row
when (
  new.matchday_id = '9d000000-0000-4000-8000-00000000000e'::uuid
  and new.is_managed
)
execute function pg_temp.inject_v19_failure();

do $test$
begin
  begin
    perform public.recover_matchday_live_layout_continuity(
      '9d000000-0000-4000-8000-00000000000d',
      '9d000000-0000-4000-8000-00000000000e',
      '9d000000-0000-4000-8000-00000000070d'
    );
  exception when others then
    if sqlerrm <> 'v19-injected-failure' then raise; end if;
  end;
end;
$test$;

drop trigger fail_v19_carryover_recovery_activation
on public.matchday_editorial_desk_control;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from jornada_private.matchday_live_layout_physical_topology_transitions
   where source_matchday_id = '9d000000-0000-4000-8000-00000000000d')
  and (select pg_catalog.count(*) = 1
       from jornada_private.matchday_live_layout_physical_carryovers
       where source_matchday_id = '9d000000-0000-4000-8000-00000000000d')
  and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_handoffs
    where source_matchday_id = '9d000000-0000-4000-8000-00000000000d'
  ) and exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '9d000000-0000-4000-8000-00000000000d'
      and is_managed
  ) and not exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '9d000000-0000-4000-8000-00000000000e'
      and is_managed
  ),
  'failed carryover-complete recovery did not preserve its exact initial state'
);

create temp table recovery_result as
select public.recover_matchday_live_layout_continuity(
  '9d000000-0000-4000-8000-00000000000d',
  '9d000000-0000-4000-8000-00000000000e',
  '9d000000-0000-4000-8000-00000000070d'
) as result;

select pg_temp.assert_true(
  (select result ->> 'outcome' = 'resumed_after_carryover'
   from recovery_result)
  and exists (
    select 1 from jornada_private.matchday_live_layout_physical_handoffs
    where source_matchday_id = '9d000000-0000-4000-8000-00000000000d'
      and target_matchday_id = '9d000000-0000-4000-8000-00000000000e'
  ),
  'carryover-complete recovery did not converge'
);

create temp table recovery_idempotent as
select public.recover_matchday_live_layout_continuity(
  '9d000000-0000-4000-8000-00000000000d',
  '9d000000-0000-4000-8000-00000000000e',
  '9d000000-0000-4000-8000-00000000070d'
) as result;

select pg_temp.assert_true(
  (select result ->> 'outcome' = 'already_complete'
   from recovery_idempotent)
  and (select pg_catalog.count(*) = 1
       from jornada_private.matchday_live_layout_physical_handoffs
       where source_matchday_id =
             '9d000000-0000-4000-8000-00000000000d'),
  'complete recovery was not idempotent'
);

insert into handoff_v19_results values
  (5, 'physical recovery states converge on v19', 'PASS');


-- ============================================================
-- F. TARGET ZONE DELETION PRESERVES PERSISTENT CONTINUITY
-- ============================================================

-- Exercise the real public v29 -> v22 -> v20 -> core route. Source zone six
-- has a carried article, while a separate four-news companion proves that an
-- unrelated Latest endpoint is not changed by the Apply.
create temp table populated_target_zone as
select
  map_row.topology_transition_id,
  map_row.source_zone_id,
  map_row.target_zone_id
from jornada_private.matchday_live_layout_physical_zone_maps as map_row
join public.matchday_live_layout_zones as zone_row
  on zone_row.matchday_id = map_row.target_matchday_id
 and zone_row.id = map_row.target_zone_id
where map_row.source_matchday_id =
      '9d000000-0000-4000-8000-000000000001'
  and map_row.target_matchday_id =
      '9d000000-0000-4000-8000-000000000002'
  and map_row.source_zone_id =
      '9d000000-0000-4000-8000-000000000061'
order by map_row.target_zone_id
limit 1;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1 from populated_target_zone),
  'target deletion fixture has no populated mapped zone'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join populated_target_zone as target_row
      on target_row.target_zone_id = placement_row.zone_id
    where placement_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and placement_row.placement_type = 'zone'
  ),
  'target deletion fixture could not place an article in the mapped zone'
);

create temp table retained_companion_zone as
select zone_row.id as zone_id
from public.matchday_live_layout_zones as zone_row
where zone_row.matchday_id =
      '9d000000-0000-4000-8000-000000000002'
  and zone_row.visual_family = 'four_news'
order by zone_row.id
limit 1;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1 from retained_companion_zone),
  'target deletion fixture has no four-news companion zone'
);

insert into public.matchday_live_layout_latest_companion (
  matchday_id,
  zone_id
)
select
  '9d000000-0000-4000-8000-000000000002'::uuid,
  companion_row.zone_id
from retained_companion_zone as companion_row
on conflict (matchday_id)
do update
set zone_id = excluded.zone_id,
    updated_at = pg_catalog.statement_timestamp();

create temp table populated_delete_before as
select
  pg_temp.physical_transition_history_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002'
  ) as history,
  jornada_private.matchday_historical_physical_archive_hash_v20(
    '9d000000-0000-4000-8000-000000000001'
  ) as source_physical_hash,
  (
    select pg_catalog.to_jsonb(companion_row)
    from public.matchday_live_layout_latest_companion as companion_row
    where companion_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) as companion,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row) order by bank_row.id
    )
    from public.matchday_editorial_bank_items as bank_row
    join public.matchday_live_layout_placements as placement_row
      on placement_row.matchday_id = bank_row.matchday_id
     and placement_row.bank_item_id = bank_row.id
    join populated_target_zone as target_row
      on target_row.target_zone_id = placement_row.zone_id
    where bank_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) as removed_bank_items,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', zone_row.id,
        'public_title', zone_row.public_title,
        'visual_family', zone_row.visual_family
      ) order by zone_row.id
    )
    from public.matchday_live_layout_zones as zone_row
    cross join populated_target_zone as target_row
    where zone_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and zone_row.id <> target_row.target_zone_id
  ) as remaining_zones,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', expected_row.id,
        'block_type', expected_row.block_type,
        'zone_id', expected_row.zone_id,
        'sort_order', expected_row.sort_order
      ) order by expected_row.sort_order
    )
    from (
      select
        block_row.id,
        block_row.block_type,
        block_row.zone_id,
        pg_catalog.row_number() over (
          order by block_row.sort_order, block_row.id
        )::integer as sort_order
      from public.matchday_live_layout_blocks as block_row
      cross join populated_target_zone as target_row
      where block_row.matchday_id =
            '9d000000-0000-4000-8000-000000000002'
        and block_row.zone_id is distinct from target_row.target_zone_id
    ) as expected_row
  ) as remaining_blocks,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bank_item_id', placement_row.bank_item_id,
        'placement_type', placement_row.placement_type,
        'zone_id', placement_row.zone_id,
        'slot_position', placement_row.slot_position
      ) order by placement_row.bank_item_id
    )
    from public.matchday_live_layout_placements as placement_row
    cross join populated_target_zone as target_row
    where placement_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and placement_row.zone_id is distinct from target_row.target_zone_id
  ) as remaining_placements;

create temp table populated_removed_bank_ids as
select placement_row.bank_item_id
from public.matchday_live_layout_placements as placement_row
join populated_target_zone as target_row
  on target_row.target_zone_id = placement_row.zone_id
where placement_row.matchday_id =
      '9d000000-0000-4000-8000-000000000002';

select pg_temp.apply_target_without_zone_v29(
  '9d000000-0000-4000-8000-000000000002',
  (select target_zone_id from populated_target_zone),
  (select zone_id from retained_companion_zone)
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    join populated_target_zone as target_row
      on target_row.target_zone_id = zone_row.id
    where zone_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    join populated_target_zone as target_row
      on target_row.target_zone_id = block_row.zone_id
    where block_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  )
  and (
    select pg_catalog.to_jsonb(companion_row)
    from public.matchday_live_layout_latest_companion as companion_row
    where companion_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select companion from populated_delete_before),
  'populated target zone/block survived or unrelated companion changed'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) > 0 from populated_removed_bank_ids)
  and not exists (
    select 1
    from populated_removed_bank_ids as removed_row
    where not exists (
      select 1
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.matchday_id =
            '9d000000-0000-4000-8000-000000000002'
        and bank_row.id = removed_row.bank_item_id
    )
  )
  and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join populated_removed_bank_ids as removed_row
      on removed_row.bank_item_id = placement_row.bank_item_id
    where placement_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from populated_removed_bank_ids as removed_row
    where not exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id =
            '9d000000-0000-4000-8000-000000000002'
        and memory_row.bank_item_id = removed_row.bank_item_id
        and memory_row.memory_kind = 'displaced'
    )
  )
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row) order by bank_row.id
    )
    from public.matchday_editorial_bank_items as bank_row
    join populated_removed_bank_ids as removed_row
      on removed_row.bank_item_id = bank_row.id
    where bank_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select removed_bank_items from populated_delete_before),
  'removed-zone articles did not retain identity in Desalojadas'
);

select pg_temp.assert_true(
  pg_temp.physical_transition_history_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002'
  ) = (select history from populated_delete_before)
  and jornada_private.matchday_historical_physical_archive_hash_v20(
        '9d000000-0000-4000-8000-000000000001'
      ) = (select source_physical_hash from populated_delete_before)
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', zone_row.id,
        'public_title', zone_row.public_title,
        'visual_family', zone_row.visual_family
      ) order by zone_row.id
    )
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select remaining_zones from populated_delete_before)
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', block_row.id,
        'block_type', block_row.block_type,
        'zone_id', block_row.zone_id,
        'sort_order', block_row.sort_order
      ) order by block_row.sort_order
    )
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select remaining_blocks from populated_delete_before)
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bank_item_id', placement_row.bank_item_id,
        'placement_type', placement_row.placement_type,
        'zone_id', placement_row.zone_id,
        'slot_position', placement_row.slot_position
      ) order by placement_row.bank_item_id
    )
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select remaining_placements from populated_delete_before),
  'zone deletion rewrote history or changed remaining physical identity/order'
);

select jornada_private
  .assert_matchday_live_layout_historical_physical_archive_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002',
    '9d000000-0000-4000-8000-000000000701'
  );

insert into handoff_v19_results values
  (11, 'populated mapped target deletion preserves history', 'PASS');


-- An empty mapped zone is used first for a failure injected after its DELETE.
-- The PL/pgSQL exception subtransaction must restore every live and historical
-- component, including Latest, identities and the v22 state token.
create temp table empty_target_zone as
select
  map_row.topology_transition_id,
  map_row.source_zone_id,
  map_row.target_zone_id
from jornada_private.matchday_live_layout_physical_zone_maps as map_row
join public.matchday_live_layout_zones as zone_row
  on zone_row.matchday_id = map_row.target_matchday_id
 and zone_row.id = map_row.target_zone_id
where map_row.source_matchday_id =
      '9d000000-0000-4000-8000-000000000001'
  and map_row.target_matchday_id =
      '9d000000-0000-4000-8000-000000000002'
  and zone_row.visual_family <> 'four_news'
  and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = map_row.target_matchday_id
      and placement_row.zone_id = map_row.target_zone_id
  )
order by map_row.target_zone_id
limit 1;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1 from empty_target_zone),
  'target deletion fixture has no empty mapped non-companion zone'
);

create temp table empty_delete_rollback_before as
select pg_temp.target_live_state_v19(
  '9d000000-0000-4000-8000-000000000002',
  'liga_portugal_v1'
) as target_state;

create function pg_temp.inject_target_zone_delete_failure()
returns trigger
language plpgsql
as $function$
begin
  if old.id = (select target_zone_id from empty_target_zone) then
    raise exception 'zone-target-identity-injected-after-delete-failure';
  end if;
  return old;
end;
$function$;

create trigger inject_target_zone_delete_failure
after delete on public.matchday_live_layout_zones
for each row execute function pg_temp.inject_target_zone_delete_failure();

do $test$
begin
  begin
    perform pg_temp.apply_target_without_zone_v29(
      '9d000000-0000-4000-8000-000000000002',
      (select target_zone_id from empty_target_zone),
      null
    );
    raise exception 'assertion-failed: injected target-zone Apply succeeded';
  exception when others then
    if sqlerrm <> 'zone-target-identity-injected-after-delete-failure' then
      raise;
    end if;
  end;
end;
$test$;

drop trigger inject_target_zone_delete_failure
on public.matchday_live_layout_zones;

select pg_temp.assert_true(
  pg_temp.target_live_state_v19(
    '9d000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) = (select target_state from empty_delete_rollback_before),
  'failure after target-zone DELETE did not roll back the full Apply'
);

insert into handoff_v19_results values
  (12, 'target deletion failure rolls back all physical state', 'PASS');


-- Keep the existing four-news companion while removing the empty zone. The
-- unchanged relation must retain its UUID and timestamps.
create temp table empty_delete_before as
select
  pg_temp.physical_transition_history_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002'
  ) as history,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row) order by bank_row.id
    )
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) as bank_items,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(placement_row)
      order by placement_row.bank_item_id
    )
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) as placements,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(memory_row) order by memory_row.bank_item_id
    )
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) as memory,
  (
    select pg_catalog.to_jsonb(companion_row)
    from public.matchday_live_layout_latest_companion as companion_row
    where companion_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) as companion;

select pg_temp.apply_target_without_zone_v29(
  '9d000000-0000-4000-8000-000000000002',
  (select target_zone_id from empty_target_zone),
  (select zone_id from retained_companion_zone)
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    join empty_target_zone as target_row
      on target_row.target_zone_id = zone_row.id
    where zone_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  )
  and pg_temp.physical_transition_history_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002'
  ) = (select history from empty_delete_before)
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row) order by bank_row.id
    )
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select bank_items from empty_delete_before)
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(placement_row)
      order by placement_row.bank_item_id
    )
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select placements from empty_delete_before)
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(memory_row) order by memory_row.bank_item_id
    )
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) is not distinct from (select memory from empty_delete_before)
  and (
    select pg_catalog.to_jsonb(companion_row)
    from public.matchday_live_layout_latest_companion as companion_row
    where companion_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select companion from empty_delete_before),
  'empty mapped zone deletion changed content, history or retained companion'
);

insert into handoff_v19_results values
  (13, 'empty mapped target deletion has no side effects', 'PASS');


-- Removing the current companion is the inverse v22 contract: the relation
-- is cleared before the core deletes its host, while the incoming transition
-- remains immutable. If the host has content, it follows the same displaced
-- contract as any other deleted zone.
create temp table companion_delete_before as
select
  pg_temp.physical_transition_history_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002'
  ) as history,
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row) order by bank_row.id
    )
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) as bank_items;

create temp table companion_removed_bank_ids as
select placement_row.bank_item_id
from public.matchday_live_layout_placements as placement_row
join retained_companion_zone as companion_row
  on companion_row.zone_id = placement_row.zone_id
where placement_row.matchday_id =
      '9d000000-0000-4000-8000-000000000002';

select pg_temp.apply_target_without_zone_v29(
  '9d000000-0000-4000-8000-000000000002',
  (select zone_id from retained_companion_zone),
  null
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    join retained_companion_zone as companion_row
      on companion_row.zone_id = zone_row.id
    where zone_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_latest_companion as companion_row
    where companion_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  )
  and pg_temp.physical_transition_history_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002'
  ) = (select history from companion_delete_before)
  and (
    select pg_catalog.jsonb_agg(
      pg_catalog.to_jsonb(bank_row) order by bank_row.id
    )
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  ) = (select bank_items from companion_delete_before)
  and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join companion_removed_bank_ids as removed_row
      on removed_row.bank_item_id = placement_row.bank_item_id
    where placement_row.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from companion_removed_bank_ids as removed_row
    where not exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id =
            '9d000000-0000-4000-8000-000000000002'
        and memory_row.bank_item_id = removed_row.bank_item_id
        and memory_row.memory_kind = 'displaced'
    )
  ),
  'removed Latest companion host changed content or incoming history'
);

insert into handoff_v19_results values
  (14, 'removed companion is cleared before target deletion', 'PASS');


-- A later J06 -> J07 topology must materialize only the zones still alive.
-- The persistent J05 -> J06 evidence must remain byte-for-byte unchanged.
create temp table incoming_history_before_future as
select pg_temp.physical_transition_history_v20(
  '9d000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000002'
) as history;

insert into public.matchdays (id, season_id, number, label)
values (
  '9d000000-0000-4000-8000-000000000013',
  '9d000000-0000-4000-8000-000000000030',
  3,
  'v19 post-delete future target'
);

create temp table future_topology_result as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  '9d000000-0000-4000-8000-000000000002',
  '9d000000-0000-4000-8000-000000000013'
);

select pg_temp.assert_true(
  pg_temp.physical_transition_history_v20(
    '9d000000-0000-4000-8000-000000000001',
    '9d000000-0000-4000-8000-000000000002'
  ) = (select history from incoming_history_before_future)
  and not exists (
    select 1
    from public.matchday_live_layout_zones as source_zone
    where source_zone.matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and not exists (
        select 1
        from jornada_private.matchday_live_layout_physical_zone_maps as map_row
        where map_row.source_matchday_id = source_zone.matchday_id
          and map_row.target_matchday_id =
              '9d000000-0000-4000-8000-000000000013'
          and map_row.source_zone_id = source_zone.id
      )
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.source_matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and map_row.target_matchday_id =
          '9d000000-0000-4000-8000-000000000013'
      and not exists (
        select 1
        from public.matchday_live_layout_zones as source_zone
        where source_zone.matchday_id = map_row.source_matchday_id
          and source_zone.id = map_row.source_zone_id
      )
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    where map_row.source_matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and map_row.target_matchday_id =
          '9d000000-0000-4000-8000-000000000013'
      and map_row.source_zone_id in (
        (select target_zone_id from populated_target_zone),
        (select target_zone_id from empty_target_zone),
        (select zone_id from retained_companion_zone)
      )
  )
  and not exists (
    select 1
    from public.matchday_live_layout_zones as target_zone
    where target_zone.matchday_id =
          '9d000000-0000-4000-8000-000000000013'
      and not exists (
        select 1
        from jornada_private.matchday_live_layout_physical_zone_maps as map_row
        where map_row.source_matchday_id =
              '9d000000-0000-4000-8000-000000000002'
          and map_row.target_matchday_id = target_zone.matchday_id
          and map_row.target_zone_id = target_zone.id
      )
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as map_row
    left join jornada_private
      .matchday_live_layout_physical_target_zone_identities as identity_row
      on identity_row.topology_transition_id = map_row.topology_transition_id
     and identity_row.source_matchday_id = map_row.source_matchday_id
     and identity_row.target_matchday_id = map_row.target_matchday_id
     and identity_row.target_zone_id = map_row.target_zone_id
    where map_row.source_matchday_id =
          '9d000000-0000-4000-8000-000000000002'
      and map_row.target_matchday_id =
          '9d000000-0000-4000-8000-000000000013'
      and identity_row.target_zone_id is null
  ),
  'future topology included a deleted zone or lacked target identities'
);

insert into handoff_v19_results values
  (15, 'future topology materializes only surviving zones', 'PASS');


-- Once J06 is itself a source, deleting one of its mapped source zones must
-- fail with the domain error before the core implementation performs DML.
create temp table outgoing_locked_zone as
select map_row.source_zone_id as zone_id
from jornada_private.matchday_live_layout_physical_zone_maps as map_row
where map_row.source_matchday_id =
      '9d000000-0000-4000-8000-000000000002'
  and map_row.target_matchday_id =
      '9d000000-0000-4000-8000-000000000013'
order by map_row.source_zone_id
limit 1;

create temp table source_lock_before as
select
  pg_temp.target_live_state_v19(
    '9d000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) as source_state,
  pg_temp.target_live_state_v19(
    '9d000000-0000-4000-8000-000000000013',
    'liga_portugal_v1'
  ) as target_state;

do $test$
declare
  v_zones jsonb;
  v_token text;
  v_error text;
begin
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', zone_row.id,
      'public_title', zone_row.public_title,
      'visual_family', zone_row.visual_family
    ) order by zone_row.id
  ), '[]'::jsonb)
  into v_zones
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id =
        '9d000000-0000-4000-8000-000000000002'
    and zone_row.id <> (select zone_id from outgoing_locked_zone);

  select token_row.state_token
  into v_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '9d000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) as token_row;

  begin
    perform 1
    from jornada_private
      .apply_matchday_live_layout_physical_workspace_v20_core(
        '9d000000-0000-4000-8000-000000000002',
        'liga_portugal_v1',
        v_token,
        v_zones,
        '[]'::jsonb,
        '[]'::jsonb,
        0,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb,
        pg_catalog.jsonb_build_object(
          'headline_title_color', null,
          'latest_zone_placement', 'top',
          'latest_zone_title', 'guard proof',
          'video_module_active', true
        )
      );
    raise exception 'assertion-failed: outgoing source zone deletion succeeded';
  exception when others then
    v_error := sqlerrm;
    if v_error <>
       'matchday-live-layout-physical-v20-zone-source-topology-locked'
    then
      raise;
    end if;
  end;
end;
$test$;

select pg_temp.assert_true(
  pg_temp.target_live_state_v19(
    '9d000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) = (select source_state from source_lock_before)
  and pg_temp.target_live_state_v19(
    '9d000000-0000-4000-8000-000000000013',
    'liga_portugal_v1'
  ) = (select target_state from source_lock_before),
  'source topology lock error changed source or future target state'
);

insert into handoff_v19_results values
  (16, 'outgoing source zones fail before core DML', 'PASS');


-- Structural lock proof: the core calls the existing helper and that helper
-- remains the exclusive transaction lock (6026,2).
select pg_temp.assert_true(
  pg_catalog.pg_get_functiondef(
    'jornada_private.materialize_matchday_live_layout_physical_handoff_v19(uuid,uuid,uuid,text)'::regprocedure
  ) like '%acquire_matchday_live_desk_handoff_lock()%'
  and pg_catalog.pg_get_functiondef(
    'jornada_private.acquire_matchday_live_desk_handoff_lock()'::regprocedure
  ) like '%pg_advisory_xact_lock(6026, 2)%',
  'v19 does not use the existing exclusive handoff barrier (6026,2)'
);

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.materialize_matchday_live_layout_physical_handoff_v19(uuid,uuid,uuid,text)',
    'EXECUTE'
  ) and not pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_handoffs',
    'SELECT'
  ),
  'private v19 authority is exposed to service_role'
);

insert into handoff_v19_results values
  (6, 'barrier and least privilege', 'PASS');

table handoff_v19_results order by test_number;

rollback;
