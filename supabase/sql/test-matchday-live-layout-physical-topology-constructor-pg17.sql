\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after applying migrations through
-- 20260905132044_matchday_live_layout_physical_topology_constructor_v17.sql.
-- All fixture data is transaction-local and rolled back.
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

create temp table topology_v17_results (
  test_number integer primary key,
  test_name text unique not null,
  status text not null check (status = 'PASS')
);

create function pg_temp.classification_hash(p_matchday_id uuid)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', bank_row.id,
      'classification_key', bank_row.classification_key,
      'classification_source', bank_row.classification_source,
      'classified_at', bank_row.classified_at
    ) order by bank_row.id
  ), '[]'::jsonb)::text)
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id;
$function$;

create function pg_temp.state_items_hash(p_matchday_id uuid)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(state_row)
    order by state_row.source_type, state_row.source_id
  ), '[]'::jsonb)::text)
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = p_matchday_id;
$function$;

create function pg_temp.placement_hash(p_matchday_id uuid)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(placement_row)
    order by placement_row.id
  ), '[]'::jsonb)::text)
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id;
$function$;

insert into jornada_private.matchday_live_layout_cutover_control (
  scope,
  authority_mode
)
values ('live_layout', 'authoritative')
on conflict (scope) do update
set authority_mode = excluded.authority_mode;

insert into public.countries (id, name, slug)
values (
  '7c000000-0000-4000-8000-000000000010',
  'Topology V17 Country',
  'topology-v17-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  '7c000000-0000-4000-8000-000000000020',
  'Topology V17 Competition',
  'liga-portugal',
  'Topology V17 Country',
  '7c000000-0000-4000-8000-000000000010'
);

insert into public.seasons (id, competition_id, label)
values (
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000020',
  'Topology V17 2026/27'
);

-- Pair 1 is the mandatory seven-zone source. Pair 2 proves the ordinary
-- five-zone shape and is also used for transactional failure/retry tests.
insert into public.matchdays (id, season_id, number, label)
values
  (
    '7c000000-0000-4000-8000-000000000001',
    '7c000000-0000-4000-8000-000000000030',
    1,
    'Topology V17 source seven'
  ),
  (
    '7c000000-0000-4000-8000-000000000002',
    '7c000000-0000-4000-8000-000000000030',
    2,
    'Topology V17 target seven'
  ),
  (
    '7c000000-0000-4000-8000-000000000003',
    '7c000000-0000-4000-8000-000000000030',
    3,
    'Topology V17 source five'
  ),
  (
    '7c000000-0000-4000-8000-000000000004',
    '7c000000-0000-4000-8000-000000000030',
    4,
    'Topology V17 target five'
  ),
  (
    '7c000000-0000-4000-8000-000000000005',
    '7c000000-0000-4000-8000-000000000030',
    5,
    'Topology V17 source legacy shadow'
  ),
  (
    '7c000000-0000-4000-8000-000000000006',
    '7c000000-0000-4000-8000-000000000030',
    6,
    'Topology V17 target for legacy refusal'
  );

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values
  (
    '7c000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ),
  (
    '7c000000-0000-4000-8000-000000000003',
    'liga_portugal_v1'
  ),
  (
    '7c000000-0000-4000-8000-000000000005',
    'liga_portugal_v1'
  ),
  -- A matching contextual assignment may legitimately precede construction.
  (
    '7c000000-0000-4000-8000-000000000004',
    'liga_portugal_v1'
  );

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
values
  (
    '7c000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    '{"benfica":"Benfica 7","sporting":"Sporting 7","fc_porto":"FC Porto 7","other_liga_clubs":"Liga 7","outside_liga_other":"Exterior 7"}'::jsonb
  ),
  (
    '7c000000-0000-4000-8000-000000000003',
    'liga_portugal_v1',
    '{"benfica":"Benfica 5","sporting":"Sporting 5","fc_porto":"FC Porto 5","other_liga_clubs":"Liga 5","outside_liga_other":"Exterior 5"}'::jsonb
  ),
  (
    '7c000000-0000-4000-8000-000000000005',
    'liga_portugal_v1',
    '{"benfica":"Benfica L","sporting":"Sporting L","fc_porto":"FC Porto L","other_liga_clubs":"Liga L","outside_liga_other":"Exterior L"}'::jsonb
  );

-- This call is fixture setup for the physical source only. The v17
-- constructor itself is asserted never to call the five-key shadow builder.
select jornada_private.sync_matchday_live_layout_shadow(array[
  '7c000000-0000-4000-8000-000000000001'::uuid,
  '7c000000-0000-4000-8000-000000000003'::uuid,
  '7c000000-0000-4000-8000-000000000005'::uuid
]);

set constraints all immediate;
set constraints all deferred;

insert into public.matchday_live_layout_zones (
  id,
  matchday_id,
  public_title,
  visual_family
)
values
  (
    '7c000000-0000-4000-8000-000000000061',
    '7c000000-0000-4000-8000-000000000001',
    'Zona Física Seis',
    'six_news'
  ),
  (
    '7c000000-0000-4000-8000-000000000062',
    '7c000000-0000-4000-8000-000000000001',
    'Zona Física Sete',
    'five_news_secondary'
  );

insert into public.matchday_live_layout_blocks (
  id,
  matchday_id,
  block_type,
  zone_id,
  sort_order
)
select
  '7c000000-0000-4000-8000-000000000071',
  '7c000000-0000-4000-8000-000000000001',
  'zone',
  '7c000000-0000-4000-8000-000000000061',
  pg_catalog.max(block_row.sort_order) + 1
from public.matchday_live_layout_blocks as block_row
where block_row.matchday_id =
      '7c000000-0000-4000-8000-000000000001';

insert into public.matchday_live_layout_blocks (
  id,
  matchday_id,
  block_type,
  zone_id,
  sort_order
)
select
  '7c000000-0000-4000-8000-000000000072',
  '7c000000-0000-4000-8000-000000000001',
  'zone',
  '7c000000-0000-4000-8000-000000000062',
  pg_catalog.max(block_row.sort_order) + 1
from public.matchday_live_layout_blocks as block_row
where block_row.matchday_id =
      '7c000000-0000-4000-8000-000000000001';

-- Preserve a deliberately sparse and non-semantic physical block order.
update public.matchday_live_layout_blocks
set sort_order = sort_order + 1000
where matchday_id = '7c000000-0000-4000-8000-000000000001';

update public.matchday_live_layout_blocks as block_row
set sort_order = case
  when block_row.block_type = 'latest' then 4
  when block_row.block_type = 'video' then 5
  when block_row.zone_id = '7c000000-0000-4000-8000-000000000061'
    then 1
  when block_row.zone_id = '7c000000-0000-4000-8000-000000000062'
    then 8
  when projection_row.legacy_zone_key = 'sporting' then 2
  when projection_row.legacy_zone_key = 'other_liga_clubs' then 6
  when projection_row.legacy_zone_key = 'benfica' then 9
  when projection_row.legacy_zone_key = 'fc_porto' then 12
  when projection_row.legacy_zone_key = 'outside_liga_other' then 15
end
from jornada_private.matchday_live_layout_zone_legacy_projection
  as projection_row
where block_row.matchday_id =
      '7c000000-0000-4000-8000-000000000001'
  and (
    block_row.block_type in ('latest', 'video')
    or block_row.zone_id in (
      '7c000000-0000-4000-8000-000000000061'::uuid,
      '7c000000-0000-4000-8000-000000000062'::uuid
    )
    or projection_row.matchday_id = block_row.matchday_id
  )
  and (
    projection_row.zone_id = block_row.zone_id
    or block_row.block_type in ('latest', 'video')
    or block_row.zone_id in (
      '7c000000-0000-4000-8000-000000000061'::uuid,
      '7c000000-0000-4000-8000-000000000062'::uuid
    )
  );

-- The UPDATE above joins five projection rows for non-zone blocks. Although
-- PostgreSQL updates each row once, set their two positions explicitly to
-- make the fixture independent from join winner selection.
update public.matchday_live_layout_blocks
set sort_order = case block_type when 'latest' then 4 else 5 end
where matchday_id = '7c000000-0000-4000-8000-000000000001'
  and block_type in ('latest', 'video');

insert into public.editorial_articles (
  id,
  title,
  slug,
  status,
  scope,
  label,
  subtitle,
  body,
  author,
  published_at,
  competition_id,
  season_id,
  matchday_id
)
values (
  '7c000000-0000-4000-8000-000000000101',
  'Conteúdo apenas na source física',
  'topology-v17-source-only',
  'published',
  'matchday',
  'TESTE',
  'Não transita no Lote 3',
  'Body',
  'Author',
  '2026-09-05 12:00:00+00',
  '7c000000-0000-4000-8000-000000000020',
  '7c000000-0000-4000-8000-000000000030',
  '7c000000-0000-4000-8000-000000000001'
);

select public.upsert_matchday_editorial_bank_publication(
  '7c000000-0000-4000-8000-000000000001',
  'editorial_article',
  '7c000000-0000-4000-8000-000000000101',
  'topology-v17-source-only',
  'TESTE',
  'Conteúdo apenas na source física',
  'Não transita no Lote 3',
  null,
  '/noticias/topology-v17-source-only'
);

insert into public.matchday_live_layout_placements (
  id,
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '7c000000-0000-4000-8000-000000000111',
  '7c000000-0000-4000-8000-000000000001',
  bank_row.id,
  'zone',
  '7c000000-0000-4000-8000-000000000061',
  5
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '7c000000-0000-4000-8000-000000000001'
  and bank_row.source_id = '7c000000-0000-4000-8000-000000000101';

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
  (
    '7c000000-0000-4000-8000-000000000001',
    11,
    '#123456',
    'four_news',
    'Últimas Sete',
    true,
    'editorial_line',
    '#ABCDEF'
  ),
  (
    '7c000000-0000-4000-8000-000000000003',
    3,
    null,
    'hidden',
    'Últimas Cinco',
    false,
    'latest_news',
    null
  );

insert into jornada_private.matchday_live_layout_physical_cutovers (
  matchday_id,
  profile_key
)
values
  (
    '7c000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ),
  (
    '7c000000-0000-4000-8000-000000000003',
    'liga_portugal_v1'
  );

-- ============================================================
-- A. SEVEN-ZONE PHYSICAL CONSTRUCTION
-- ============================================================

create temp table seven_authority_before as
select
  pg_temp.classification_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) as classification_hash,
  pg_temp.state_items_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) as state_items_hash,
  pg_temp.placement_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) as placement_hash;

create temp table seven_result as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  '7c000000-0000-4000-8000-000000000001',
  '7c000000-0000-4000-8000-000000000002'
);

select pg_temp.assert_true(
  (select zone_count = 7 from seven_result)
  and (
    select pg_catalog.count(*) = 7
    from public.matchday_live_layout_zones
    where matchday_id = '7c000000-0000-4000-8000-000000000002'
  ),
  'target does not have exactly seven target zones'
);

select pg_temp.assert_true(
  not exists (
    select source_zone.id
    from public.matchday_live_layout_zones as source_zone
    join public.matchday_live_layout_zones as target_zone
      on target_zone.id = source_zone.id
    where source_zone.matchday_id =
          '7c000000-0000-4000-8000-000000000001'
      and target_zone.matchday_id =
          '7c000000-0000-4000-8000-000000000002'
  ),
  'source and target zone UUID sets overlap'
);

select pg_temp.assert_true(
  not exists (
    select source_block.id
    from public.matchday_live_layout_blocks as source_block
    join public.matchday_live_layout_blocks as target_block
      on target_block.id = source_block.id
    where source_block.matchday_id =
          '7c000000-0000-4000-8000-000000000001'
      and target_block.matchday_id =
          '7c000000-0000-4000-8000-000000000002'
  ),
  'source and target block UUID sets overlap'
);

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 7
    from jornada_private.matchday_live_layout_physical_zone_maps as zone_map
    join seven_result as result_row
      on result_row.topology_transition_id = zone_map.topology_transition_id
  ),
  'physical zone map is not complete 7/7'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as zone_map
    join seven_result as result_row
      on result_row.topology_transition_id = zone_map.topology_transition_id
    join public.matchday_live_layout_zones as source_zone
      on source_zone.id = zone_map.source_zone_id
     and source_zone.matchday_id = zone_map.source_matchday_id
    join public.matchday_live_layout_zones as target_zone
      on target_zone.id = zone_map.target_zone_id
     and target_zone.matchday_id = zone_map.target_matchday_id
    where row(source_zone.public_title, source_zone.visual_family)
          is distinct from
          row(target_zone.public_title, target_zone.visual_family)
  ),
  'zone title or visual family was not preserved'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_blocks as source_block
    left join public.matchday_live_layout_blocks as target_block
      on target_block.matchday_id =
         '7c000000-0000-4000-8000-000000000002'
     and target_block.block_type = source_block.block_type
     and target_block.sort_order = source_block.sort_order
    left join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.source_matchday_id = source_block.matchday_id
     and zone_map.target_matchday_id =
        '7c000000-0000-4000-8000-000000000002'
     and zone_map.source_zone_id = source_block.zone_id
    where source_block.matchday_id =
          '7c000000-0000-4000-8000-000000000001'
      and (
        target_block.id is null
        or target_block.zone_id is distinct from case
          when source_block.block_type = 'zone' then zone_map.target_zone_id
          else null
        end
      )
  ),
  'block order/type or block to zone mapping was not preserved'
);

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 5
    from jornada_private.matchday_live_layout_zone_legacy_projection
    where matchday_id = '7c000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps as zone_map
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as target_projection
      on target_projection.matchday_id = zone_map.target_matchday_id
     and target_projection.zone_id = zone_map.target_zone_id
    where zone_map.source_zone_id in (
      '7c000000-0000-4000-8000-000000000061'::uuid,
      '7c000000-0000-4000-8000-000000000062'::uuid
    )
  ),
  'target did not keep only five compatibility projections'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as source_projection
    join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.source_matchday_id = source_projection.matchday_id
     and zone_map.source_zone_id = source_projection.zone_id
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as target_projection
      on target_projection.matchday_id = zone_map.target_matchday_id
     and target_projection.zone_id = zone_map.target_zone_id
     and target_projection.legacy_zone_key =
         source_projection.legacy_zone_key
    where source_projection.matchday_id =
          '7c000000-0000-4000-8000-000000000001'
      and target_projection.zone_id is null
  ),
  'compatibility projection was not resolved through the physical map'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_workspace_settings as source_settings
    join public.matchday_live_layout_workspace_settings as target_settings
      on target_settings.matchday_id =
         '7c000000-0000-4000-8000-000000000002'
    where source_settings.matchday_id =
          '7c000000-0000-4000-8000-000000000001'
      and row(
        source_settings.faixa_slot_count,
        source_settings.headline_title_color,
        source_settings.latest_zone_placement,
        source_settings.latest_zone_title,
        source_settings.video_module_active,
        source_settings.latest_zone_mode,
        source_settings.latest_zone_title_color
      ) is distinct from row(
        target_settings.faixa_slot_count,
        target_settings.headline_title_color,
        target_settings.latest_zone_placement,
        target_settings.latest_zone_title,
        target_settings.video_module_active,
        target_settings.latest_zone_mode,
        target_settings.latest_zone_title_color
      )
  ),
  'authoritative workspace settings were not preserved'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '7c000000-0000-4000-8000-000000000002'
  ),
  'target unexpectedly received placements'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_editorial_bank_items
    where matchday_id = '7c000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from public.matchday_editorial_profile_state_items
    where matchday_id = '7c000000-0000-4000-8000-000000000002'
  )
  and exists (
    select 1
    from public.matchday_editorial_profile_assignments
    where matchday_id = '7c000000-0000-4000-8000-000000000002'
      and profile_key = 'liga_portugal_v1'
  ),
  'target created content/state_items or failed to create contextual assignment'
);

select pg_temp.assert_true(
  exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers
    where matchday_id = '7c000000-0000-4000-8000-000000000002'
      and profile_key = 'liga_portugal_v1'
  )
  and (select state_token ~ '^[0-9a-f]{32}$' from seven_result)
  and exists (
    select 1
    from public.read_matchday_live_layout_workspace_v13(
      '7c000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as reader_row
    where pg_catalog.jsonb_array_length(reader_row.zones) = 7
      and pg_catalog.jsonb_array_length(reader_row.placements) = 0
      and reader_row.workspace_settings ->> 'latest_zone_mode' =
          'editorial_line'
      and reader_row.workspace_settings ->> 'latest_zone_title_color' =
          '#ABCDEF'
  ),
  'target marker, physical token or reader is invalid'
);

select pg_temp.assert_true(
  pg_temp.classification_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) = (select classification_hash from seven_authority_before)
  and pg_temp.state_items_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) = (select state_items_hash from seven_authority_before)
  and pg_temp.placement_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) = (select placement_hash from seven_authority_before)
  and exists (
    select 1
    from public.matchday_live_layout_placements
    where id = '7c000000-0000-4000-8000-000000000111'
      and matchday_id = '7c000000-0000-4000-8000-000000000001'
      and zone_id = '7c000000-0000-4000-8000-000000000061'
      and slot_position = 5
  ),
  'source classification or placement was changed'
);

insert into topology_v17_results values
  (1, 'seven-zone topology and persistent physical map', 'PASS');

-- A successful build is intentionally not re-executed. This is the explicit
-- fail-closed idempotency contract; rollback retries are tested below.
do $test$
begin
  begin
    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000001',
        '7c000000-0000-4000-8000-000000000002'
      );
    raise exception 'constructor retry did not fail closed';
  exception when others then
    if sqlerrm not like '%target-not-virgin%' then
      raise;
    end if;
  end;
end;
$test$;

insert into topology_v17_results values
  (2, 'successful retry is fail-closed', 'PASS');

-- ============================================================
-- B. STRICT TARGET, ROLLBACK AND FIVE-ZONE BUILD
-- ============================================================

do $test$
begin
  begin
    insert into public.matchday_live_layout_workspace_settings (
      matchday_id,
      faixa_slot_count,
      headline_title_color,
      latest_zone_placement,
      latest_zone_title,
      video_module_active,
      latest_zone_mode,
      latest_zone_title_color
    ) values (
      '7c000000-0000-4000-8000-000000000004',
      1,
      null,
      'hidden',
      'Parcial',
      false,
      'latest_news',
      null
    );

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000003',
        '7c000000-0000-4000-8000-000000000004'
      );
    raise exception 'partial target did not fail closed';
  exception when others then
    if sqlerrm not like '%target-not-virgin%' then
      raise;
    end if;
  end;
end;
$test$;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_workspace_settings
    where matchday_id = '7c000000-0000-4000-8000-000000000004'
  ),
  'partial-target failure did not roll back fixture mutation'
);

do $test$
declare
  v_cutover_at timestamptz;
begin
  select cutover_at into v_cutover_at
  from jornada_private.matchday_live_layout_physical_cutovers
  where matchday_id = '7c000000-0000-4000-8000-000000000003';

  begin
    insert into
      jornada_private.matchday_live_layout_physical_topology_transitions (
        source_matchday_id,
        target_matchday_id,
        profile_key,
        source_cutover_at
      ) values (
        '7c000000-0000-4000-8000-000000000003',
        '7c000000-0000-4000-8000-000000000004',
        'liga_portugal_v1',
        v_cutover_at
      );

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000003',
        '7c000000-0000-4000-8000-000000000004'
      );
    raise exception 'preexisting topology map did not fail closed';
  exception when others then
    if sqlerrm not like '%target-not-virgin%' then
      raise;
    end if;
  end;
end;
$test$;

create function pg_temp.fail_target_block_v17()
returns trigger
language plpgsql
as $function$
begin
  if new.matchday_id = '7c000000-0000-4000-8000-000000000004' then
    raise exception 'fixture-injected-block-failure';
  end if;
  return new;
end;
$function$;

do $test$
begin
  begin
    execute $ddl$
      create trigger topology_v17_injected_block_failure
      before insert on public.matchday_live_layout_blocks
      for each row execute function pg_temp.fail_target_block_v17()
    $ddl$;

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000003',
        '7c000000-0000-4000-8000-000000000004'
      );
    raise exception 'fixture failure was not raised';
  exception when others then
    if sqlerrm not like '%fixture-injected-block-failure%' then
      raise;
    end if;
  end;
end;
$test$;

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
    where source_matchday_id = '7c000000-0000-4000-8000-000000000003'
       or target_matchday_id = '7c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_zone_maps
    where source_matchday_id = '7c000000-0000-4000-8000-000000000003'
       or target_matchday_id = '7c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_zones
    where matchday_id = '7c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_blocks
    where matchday_id = '7c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_workspace_settings
    where matchday_id = '7c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers
    where matchday_id = '7c000000-0000-4000-8000-000000000004'
  ),
  'rollback left target physical residue'
);

create temp table five_result as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  '7c000000-0000-4000-8000-000000000003',
  '7c000000-0000-4000-8000-000000000004'
);

select pg_temp.assert_true(
  (select zone_count = 5 from five_result)
  and (
    select pg_catalog.count(*) = 5
    from jornada_private.matchday_live_layout_physical_zone_maps as zone_map
    join five_result as result_row
      on result_row.topology_transition_id = zone_map.topology_transition_id
  )
  and not exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '7c000000-0000-4000-8000-000000000004'
  ),
  'five-zone retry after rollback is not complete and empty'
);

insert into topology_v17_results values
  (3, 'target fail-closed rollback and five-zone retry', 'PASS');

-- ============================================================
-- C. CORRUPT PHYSICAL SOURCES NEVER FALL BACK TO LEGACY
-- ============================================================

set constraints all immediate;
set constraints all deferred;

do $test$
begin
  begin
    delete from public.matchday_live_layout_workspace_settings
    where matchday_id = '7c000000-0000-4000-8000-000000000001';

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000001',
        '7c000000-0000-4000-8000-000000000002'
      );
    raise exception 'source marker without settings did not fail closed';
  exception when others then
    if sqlerrm not like '%source-authority-incoherent%' then
      raise;
    end if;
  end;
end;
$test$;

do $test$
begin
  begin
    delete from jornada_private.matchday_live_layout_physical_cutovers
    where matchday_id = '7c000000-0000-4000-8000-000000000001';

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000001',
        '7c000000-0000-4000-8000-000000000002'
      );
    raise exception 'source settings without marker did not fail closed';
  exception when others then
    if sqlerrm not like '%source-authority-incoherent%' then
      raise;
    end if;
  end;
end;
$test$;

do $test$
begin
  begin
    alter table public.matchday_live_layout_blocks disable trigger all;
    update public.matchday_live_layout_blocks
    set zone_id = '7c000000-0000-4000-8000-000000000099'
    where id = '7c000000-0000-4000-8000-000000000071';
    alter table public.matchday_live_layout_blocks enable trigger all;

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000001',
        '7c000000-0000-4000-8000-000000000002'
      );
    raise exception 'orphan source block did not fail closed';
  exception when others then
    if sqlerrm not like '%source-block%invalid%' then
      raise;
    end if;
  end;
end;
$test$;

do $test$
begin
  begin
    alter table
      jornada_private.matchday_live_layout_zone_legacy_projection
    disable trigger all;
    update jornada_private.matchday_live_layout_zone_legacy_projection
    set zone_id = '7c000000-0000-4000-8000-000000000099'
    where matchday_id = '7c000000-0000-4000-8000-000000000001'
      and legacy_zone_key = 'benfica';
    alter table
      jornada_private.matchday_live_layout_zone_legacy_projection
    enable trigger all;

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000001',
        '7c000000-0000-4000-8000-000000000002'
      );
    raise exception 'invalid source projection did not fail closed';
  exception when others then
    if sqlerrm not like '%legacy-projection-invalid%' then
      raise;
    end if;
  end;
end;
$test$;

do $test$
begin
  begin
    alter table public.matchday_live_layout_blocks disable trigger all;
    update public.matchday_live_layout_blocks
    set sort_order = 1000000001
    where id = '7c000000-0000-4000-8000-000000000071';
    alter table public.matchday_live_layout_blocks enable trigger all;

    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000001',
        '7c000000-0000-4000-8000-000000000002'
      );
    raise exception 'invalid source order did not fail closed';
  exception when others then
    if sqlerrm not like '%source-blocks-invalid%' then
      raise;
    end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into jornada_private.matchday_live_layout_zone_legacy_projection (
      matchday_id,
      legacy_zone_key,
      zone_id
    )
    select
      projection_row.matchday_id,
      projection_row.legacy_zone_key,
      '7c000000-0000-4000-8000-000000000062'
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
    where projection_row.matchday_id =
          '7c000000-0000-4000-8000-000000000001'
      and projection_row.legacy_zone_key = 'benfica';
    raise exception 'duplicate source projection was accepted';
  exception when unique_violation then
    null;
  end;
end;
$test$;

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 5
    from jornada_private.matchday_live_layout_zone_legacy_projection
    where matchday_id = '7c000000-0000-4000-8000-000000000001'
  ),
  'projection uniqueness test changed source state'
);

insert into topology_v17_results values
  (4, 'corrupt physical sources fail closed', 'PASS');

do $test$
begin
  begin
    perform *
    from jornada_private
      .materialize_matchday_live_layout_physical_topology_v17(
        '7c000000-0000-4000-8000-000000000005',
        '7c000000-0000-4000-8000-000000000006'
      );
    raise exception 'legacy shadow source was accepted as physical';
  exception when others then
    if sqlerrm not like '%source-not-physical%' then
      raise;
    end if;
  end;
end;
$test$;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_zones
    where matchday_id = '7c000000-0000-4000-8000-000000000006'
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
    where target_matchday_id = '7c000000-0000-4000-8000-000000000006'
  ),
  'legacy-source refusal left target residue'
);

insert into topology_v17_results values
  (5, 'legacy shadow is not a physical predecessor', 'PASS');

-- The source state remains byte-for-byte authoritative after every test.
select pg_temp.assert_true(
  pg_temp.state_items_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) = (select state_items_hash from seven_authority_before)
  and pg_temp.classification_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) = (select classification_hash from seven_authority_before)
  and pg_temp.placement_hash(
    '7c000000-0000-4000-8000-000000000001'
  ) = (select placement_hash from seven_authority_before)
  and exists (
    select 1
    from public.matchday_live_layout_placements
    where id = '7c000000-0000-4000-8000-000000000111'
  ),
  'classification, residual state_items or source placement was lost'
);

insert into topology_v17_results values
  (6, 'classification and positional state remain untouched', 'PASS');

select * from topology_v17_results order by test_number;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 6 from topology_v17_results),
  'not all topology v17 assertions ran'
);

rollback;
