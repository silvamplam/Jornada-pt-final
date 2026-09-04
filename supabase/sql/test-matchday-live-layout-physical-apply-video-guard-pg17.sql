\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after applying migrations through
-- 20260904150000_matchday_live_layout_physical_apply_video_guard.sql.
-- Every fixture row and helper is transaction-local and rolled back.
begin;

create function pg_temp.assert_true(
  p_condition boolean,
  p_message text
)
returns void
language plpgsql
as $function$
begin
  if not coalesce(p_condition, false) then
    raise exception 'assertion-failed: %', p_message;
  end if;
end;
$function$;

create function pg_temp.placement(
  p_bank_item_id uuid,
  p_placement_type text,
  p_zone_id uuid,
  p_slot_position integer
)
returns jsonb
language sql
immutable
as $function$
  select pg_catalog.jsonb_build_object(
    'bank_item_id', p_bank_item_id,
    'placement_type', p_placement_type,
    'zone_id', p_zone_id,
    'slot_position', p_slot_position
  );
$function$;

create temp table physical_v14_video_items (
  item_kind text primary key,
  article_id uuid not null,
  bank_item_id uuid
);

create temp table physical_v14_video_results (
  test_number integer primary key,
  test_name text unique not null,
  status text not null check (status = 'PASS')
);

create function pg_temp.bank_id(p_item_kind text)
returns uuid
language sql
stable
as $function$
  select fixture.bank_item_id
  from pg_temp.physical_v14_video_items as fixture
  where fixture.item_kind = p_item_kind;
$function$;

create function pg_temp.zone_id(p_legacy_zone_key text)
returns uuid
language sql
stable
as $function$
  select projection_row.zone_id
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
  where projection_row.matchday_id =
        '49000000-0000-4000-8000-000000000001'
    and projection_row.legacy_zone_key = p_legacy_zone_key;
$function$;

create function pg_temp.zones_payload()
returns jsonb
language sql
stable
as $function$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', zone_row.id,
        'public_title', zone_row.public_title,
        'visual_family', zone_row.visual_family
      ) order by zone_row.id
    ),
    '[]'::jsonb
  )
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id =
        '49000000-0000-4000-8000-000000000001';
$function$;

create function pg_temp.blocks_payload()
returns jsonb
language sql
stable
as $function$
  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', block_row.id,
        'block_type', block_row.block_type,
        'zone_id', block_row.zone_id,
        'sort_order', block_row.sort_order
      ) order by block_row.id
    ),
    '[]'::jsonb
  )
  from public.matchday_live_layout_blocks as block_row
  where block_row.matchday_id =
        '49000000-0000-4000-8000-000000000001';
$function$;

create function pg_temp.classification_hash()
returns text
language sql
stable
as $function$
  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', bank_row.id,
        'automatic_eligible', bank_row.automatic_eligible,
        'classification_key', bank_row.classification_key,
        'classification_source', bank_row.classification_source,
        'classified_at', bank_row.classified_at
      ) order by bank_row.id
    ),
    '[]'::jsonb
  )::text)
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id =
        '49000000-0000-4000-8000-000000000001';
$function$;

create function pg_temp.authoritative_hash()
returns text
language sql
stable
as $function$
  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'marker', (
      select pg_catalog.to_jsonb(marker_row)
      from jornada_private.matchday_live_layout_physical_cutovers as marker_row
      where marker_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'settings', (
      select pg_catalog.to_jsonb(settings_row)
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'zones', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(zone_row) order by zone_row.id),
        '[]'::jsonb
      )
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'blocks', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(block_row) order by block_row.id),
        '[]'::jsonb
      )
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'placements', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(placement_row) order by placement_row.id
        ),
        '[]'::jsonb
      )
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'memory', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(memory_row) order by memory_row.bank_item_id
        ),
        '[]'::jsonb
      )
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'bank', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(bank_row) order by bank_row.id),
        '[]'::jsonb
      )
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'overrides', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(override_row) order by override_row.id
        ),
        '[]'::jsonb
      )
      from public.matchday_editorial_profile_manual_overrides as override_row
      where override_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'editorial', (
      select pg_catalog.to_jsonb(editorial_row)
      from public.matchday_editorials as editorial_row
      where editorial_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'control', (
      select pg_catalog.to_jsonb(control_row)
      from public.matchday_editorial_profile_reconcile_control as control_row
      where control_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
        and control_row.profile_key = 'liga_portugal_v1'
    ),
    'zone_items', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item_row) order by item_row.id),
        '[]'::jsonb
      )
      from public.matchday_editorial_profile_zone_items as item_row
      where item_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
        and item_row.profile_key = 'liga_portugal_v1'
    ),
    'highlights', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(highlight_row) order by highlight_row.id
        ),
        '[]'::jsonb
      )
      from public.matchday_highlights as highlight_row
      where highlight_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'faixa', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(faixa_row) order by faixa_row.id),
        '[]'::jsonb
      )
      from public.matchday_horizontal_news as faixa_row
      where faixa_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
    ),
    'selection', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(selection_row) order by selection_row.id
        ),
        '[]'::jsonb
      )
      from public.matchday_live_layout_items as selection_row
      where selection_row.matchday_id =
            '49000000-0000-4000-8000-000000000001'
        and selection_row.slot_type like 'live_four_news:%'
    )
  )::text);
$function$;

create function pg_temp.current_token()
returns text
language sql
stable
as $function$
  select token_row.state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '49000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;
$function$;

create function pg_temp.apply_workspace(
  p_placements jsonb,
  p_explicit_bank_item_ids jsonb,
  p_video_module_active boolean
)
returns text
language plpgsql
as $function$
declare
  v_final_token text;
begin
  select applied.state_token
  into strict v_final_token
  from public.apply_matchday_live_layout_physical_workspace_v14(
    '49000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    pg_temp.current_token(),
    pg_temp.zones_payload(),
    pg_temp.blocks_payload(),
    p_placements,
    0,
    p_explicit_bank_item_ids,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_object(
      'headline_title_color', '#AABBCC',
      'latest_zone_placement', 'top',
      'latest_zone_title', 'Latest video guard',
      'video_module_active', p_video_module_active
    )
  ) as applied;

  return v_final_token;
end;
$function$;

create function pg_temp.expect_rejected(
  p_error_code text,
  p_placements jsonb,
  p_explicit_bank_item_ids jsonb
)
returns void
language plpgsql
as $function$
declare
  v_before text;
begin
  v_before := pg_temp.authoritative_hash();

  begin
    perform pg_temp.apply_workspace(
      p_placements,
      p_explicit_bank_item_ids,
      true
    );
    raise exception 'fixture-expected-rejection-was-not-raised';
  exception when others then
    if sqlerrm = 'fixture-expected-rejection-was-not-raised' then
      raise;
    end if;
    if pg_catalog.strpos(sqlerrm, p_error_code) = 0 then
      raise;
    end if;
  end;

  perform pg_temp.assert_true(
    pg_temp.authoritative_hash() = v_before,
    'guard failure left physical or downstream DML'
  );
end;
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
  '19000000-0000-4000-8000-000000000001',
  'Physical V14 Video Guard Country',
  'physical-v14-video-guard-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  '29000000-0000-4000-8000-000000000001',
  'Physical V14 Video Guard Competition',
  'liga-portugal',
  'Physical V14 Video Guard Country',
  '19000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '39000000-0000-4000-8000-000000000001',
  '29000000-0000-4000-8000-000000000001',
  'Physical V14 Video Guard 2026/27',
  'physical-v14-video-guard-2026-27'
);

insert into public.matchdays (id, season_id, number, label)
values (
  '49000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001',
  1,
  'Physical V14 video guard live'
);

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values (
  '49000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001',
  true
);

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values (
  '49000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
values (
  '49000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"FC Porto","other_liga_clubs":"1st League","outside_liga_other":"Outside League"}'::jsonb
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['49000000-0000-4000-8000-000000000001'::uuid]
);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 5
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
    where projection_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
  ),
  'initial five-key projection is not exact'
);

insert into public.matchday_live_layout_blocks (
  id,
  matchday_id,
  block_type,
  zone_id,
  sort_order
)
select
  '79000000-0000-4000-8000-000000000008',
  '49000000-0000-4000-8000-000000000001',
  'video',
  null,
  (
    select coalesce(pg_catalog.max(block_row.sort_order), 0) + 1
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
  )
where not exists (
  select 1
  from public.matchday_live_layout_blocks as existing_row
  where existing_row.matchday_id =
        '49000000-0000-4000-8000-000000000001'
    and existing_row.block_type = 'video'
);

insert into physical_v14_video_items (item_kind, article_id)
values
  ('video', '59000000-0000-4000-8000-000000000001'),
  ('zone', '59000000-0000-4000-8000-000000000002');

insert into public.editorial_articles (
  id,
  title,
  slug,
  status,
  scope,
  label,
  subtitle,
  body,
  image_url,
  published_at,
  competition_id,
  season_id,
  matchday_id
)
select
  fixture.article_id,
  'Physical V14 video guard ' || fixture.item_kind,
  'physical-v14-video-guard-' ||
    pg_catalog.replace(fixture.article_id::text, '-', ''),
  'published',
  'matchday',
  'Fixture',
  'Physical V14 video guard fixture',
  'Fixture body',
  'https://example.test/' || fixture.article_id::text || '.jpg',
  pg_catalog.transaction_timestamp(),
  '29000000-0000-4000-8000-000000000001',
  '39000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000001'
from physical_v14_video_items as fixture;

update physical_v14_video_items as fixture
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '49000000-0000-4000-8000-000000000001'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      fixture.article_id::text;

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 2
    from physical_v14_video_items
    where bank_item_id is not null
  ),
  'fixture Bank items were not created'
);

select pg_temp.assert_true(
  nullif(
    pg_catalog.btrim((
      select bank_row.link_url
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.id = pg_temp.bank_id('video')
    )),
    ''
  ) is not null,
  'video highlight fixture is not publishable'
);

create function pg_temp.zone_only_placements()
returns jsonb
language sql
stable
as $function$
  select pg_catalog.jsonb_build_array(
    pg_temp.placement(
      pg_temp.bank_id('zone'),
      'zone',
      pg_temp.zone_id('benfica'),
      1
    )
  );
$function$;

create function pg_temp.video_placements()
returns jsonb
language sql
stable
as $function$
  select pg_temp.zone_only_placements() || pg_catalog.jsonb_build_array(
    pg_temp.placement(
      pg_temp.bank_id('video'),
      'video_highlight',
      null,
      1
    )
  );
$function$;

insert into pg_temp.physical_v14_video_results
values (10, 'fixture ends ROLLBACK', 'PASS');

-- 2 + 7: activation without a qualifying roundup fails before the private
-- core, leaving no marker, settings or other physical/downstream mutation.
select pg_temp.expect_rejected(
  'matchday-live-layout-physical-v14-video-required',
  pg_temp.video_placements(),
  '[]'::jsonb
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
  ),
  'failed guard created marker or settings'
);

insert into pg_temp.physical_v14_video_results
values
  (2, 'active without published roundup rejected', 'PASS'),
  (7, 'guard failure has zero partial DML', 'PASS');

-- 1: an inactive module needs no roundup and applies normally.
select pg_temp.apply_workspace(
  pg_temp.zone_only_placements(),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('video')),
  false
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
      and settings_row.video_module_active = false
  ),
  'inactive video module was not applied'
);

insert into pg_temp.physical_v14_video_results
values (1, 'inactive without roundup', 'PASS');

insert into public.matchday_roundup_items (
  id,
  matchday_id,
  label,
  title,
  subtitle,
  image_url,
  video_url,
  type,
  sort_order,
  status
)
values (
  '89000000-0000-4000-8000-000000000001',
  '49000000-0000-4000-8000-000000000001',
  'Video',
  'Physical V14 Video Guard Roundup',
  'Fixture roundup',
  'https://example.test/roundup.jpg',
  'https://example.test/roundup.mp4',
  'resumo',
  1,
  'draft'
);

-- 3: a draft roundup never satisfies the publication prerequisite.
select pg_temp.expect_rejected(
  'matchday-live-layout-physical-v14-video-required',
  pg_temp.video_placements(),
  '[]'::jsonb
);

insert into pg_temp.physical_v14_video_results
values (3, 'draft roundup rejected', 'PASS');

-- 4: both NULL and empty URLs remain invalid when the roundup is published.
update public.matchday_roundup_items
set status = 'published',
    video_url = null
where id = '89000000-0000-4000-8000-000000000001';

select pg_temp.expect_rejected(
  'matchday-live-layout-physical-v14-video-required',
  pg_temp.video_placements(),
  '[]'::jsonb
);

update public.matchday_roundup_items
set video_url = '   '
where id = '89000000-0000-4000-8000-000000000001';

select pg_temp.expect_rejected(
  'matchday-live-layout-physical-v14-video-required',
  pg_temp.video_placements(),
  '[]'::jsonb
);

insert into pg_temp.physical_v14_video_results
values (4, 'published roundup without video rejected', 'PASS');

update public.matchday_roundup_items
set video_url = 'https://example.test/roundup.mp4'
where id = '89000000-0000-4000-8000-000000000001';

-- 5: a valid roundup cannot activate the module without the requested,
-- publishable physical video highlight.
select pg_temp.expect_rejected(
  'matchday-live-layout-physical-v14-highlight-required',
  pg_temp.zone_only_placements(),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('video'))
);

insert into pg_temp.physical_v14_video_results
values (5, 'incoherent video highlight rejected', 'PASS');

insert into pg_temp.physical_v14_video_results
select 9, 'classification invariant', 'PASS'
where pg_temp.classification_hash() is not null;

create temp table physical_v14_video_classification_before as
select pg_temp.classification_hash() as value;

-- 6: published roundup plus a coherent highlight succeeds.
select pg_temp.apply_workspace(
  pg_temp.video_placements(),
  '[]'::jsonb,
  true
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
      and settings_row.video_module_active = true
  )
  and exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
      and placement_row.bank_item_id = pg_temp.bank_id('video')
      and placement_row.placement_type = 'video_highlight'
      and placement_row.zone_id is null
      and placement_row.slot_position = 1
  ),
  'valid physical video state was not applied'
);

insert into pg_temp.physical_v14_video_results
values (6, 'published roundup and coherent highlight', 'PASS');

-- 8: the same transaction produces the expected downstream legacy state.
select pg_temp.assert_true(
  exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
      and marker_row.profile_key = 'liga_portugal_v1'
  )
  and exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
      and editorial_row.complementary_mode = 'roundup_video'
      and editorial_row.complementary_status = 'published'
      and nullif(
        pg_catalog.btrim(editorial_row.complementary_link_url),
        ''
      ) is not null
  )
  and exists (
    select 1
    from public.matchday_editorial_profile_zone_items as item_row
    where item_row.matchday_id =
          '49000000-0000-4000-8000-000000000001'
      and item_row.profile_key = 'liga_portugal_v1'
      and item_row.zone_key = 'benfica'
      and item_row.source_type = 'editorial_article'
      and item_row.source_id =
          '59000000-0000-4000-8000-000000000002'
  ),
  'successful Apply did not materialize downstream legacy state'
);

insert into pg_temp.physical_v14_video_results
values (8, 'successful downstream projection', 'PASS');

select pg_temp.assert_true(
  (
    select value
    from pg_temp.physical_v14_video_classification_before
  ) = pg_temp.classification_hash(),
  'classification changed across guarded physical Apply'
);

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 10
    from pg_temp.physical_v14_video_results
  ),
  'fixture did not record all 10 required checks'
);

select test_number, test_name, status
from pg_temp.physical_v14_video_results
order by test_number;

ROLLBACK;
