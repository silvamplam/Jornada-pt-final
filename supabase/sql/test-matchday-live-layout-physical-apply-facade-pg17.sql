\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after applying migrations through
-- 20260904140000_matchday_live_layout_physical_apply_facade.sql.
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

create temp table physical_v14_items (
  item_kind text primary key,
  article_id uuid not null,
  bank_item_id uuid
);

create temp table physical_v14_draft (
  singleton boolean primary key default true check (singleton),
  placements jsonb not null,
  explicit_bank_item_ids jsonb not null,
  displaced_bank_item_ids jsonb not null,
  worked_bank_item_ids jsonb not null,
  faixa_slot_count integer not null,
  presentation jsonb not null
);

create temp table physical_v14_evidence (
  key text primary key,
  value text not null
);

create temp table physical_v14_results (
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
  from pg_temp.physical_v14_items as fixture
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
        '48000000-0000-4000-8000-000000000001'
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
        '48000000-0000-4000-8000-000000000001';
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
        '48000000-0000-4000-8000-000000000001';
$function$;

create function pg_temp.authoritative_hash()
returns text
language sql
stable
as $function$
  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'zones', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(zone_row) order by zone_row.id),
        '[]'::jsonb
      )
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
    ),
    'blocks', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(block_row) order by block_row.id),
        '[]'::jsonb
      )
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
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
            '48000000-0000-4000-8000-000000000001'
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
            '48000000-0000-4000-8000-000000000001'
    ),
    'settings', (
      select pg_catalog.to_jsonb(settings_row)
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
    ),
    'legacy_editorial', (
      select pg_catalog.to_jsonb(editorial_row)
      from public.matchday_editorials as editorial_row
      where editorial_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
    ),
    'legacy_control', (
      select pg_catalog.to_jsonb(control_row)
      from public.matchday_editorial_profile_reconcile_control as control_row
      where control_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
        and control_row.profile_key = 'liga_portugal_v1'
    ),
    'legacy_zone_items', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(item_row) order by item_row.id),
        '[]'::jsonb
      )
      from public.matchday_editorial_profile_zone_items as item_row
      where item_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
        and item_row.profile_key = 'liga_portugal_v1'
    ),
    'legacy_highlights', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(highlight_row) order by highlight_row.id
        ),
        '[]'::jsonb
      )
      from public.matchday_highlights as highlight_row
      where highlight_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
    ),
    'legacy_faixa', (
      select coalesce(
        pg_catalog.jsonb_agg(pg_catalog.to_jsonb(faixa_row) order by faixa_row.id),
        '[]'::jsonb
      )
      from public.matchday_horizontal_news as faixa_row
      where faixa_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
    ),
    'legacy_selection', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(selection_row) order by selection_row.id
        ),
        '[]'::jsonb
      )
      from public.matchday_live_layout_items as selection_row
      where selection_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
        and selection_row.slot_type like 'live_four_news:%'
    ),
    'legacy_overrides', (
      select coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(override_row) order by override_row.id
        ),
        '[]'::jsonb
      )
      from public.matchday_editorial_profile_manual_overrides as override_row
      where override_row.matchday_id =
            '48000000-0000-4000-8000-000000000001'
        and override_row.profile_key = 'liga_portugal_v1'
    )
  )::text);
$function$;

create function pg_temp.apply_current(
  p_faixa_arrival_bank_item_ids jsonb default '[]'::jsonb,
  p_displaced_arrival_bank_item_ids jsonb default '[]'::jsonb,
  p_zones jsonb default null,
  p_blocks jsonb default null
)
returns text
language plpgsql
as $function$
declare
  v_draft record;
  v_state_token text;
  v_final_token text;
begin
  select * into strict v_draft
  from pg_temp.physical_v14_draft
  where singleton;

  select token_row.state_token
  into strict v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '48000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  select applied.state_token
  into strict v_final_token
  from public.apply_matchday_live_layout_physical_workspace_v14(
    '48000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    coalesce(p_zones, pg_temp.zones_payload()),
    coalesce(p_blocks, pg_temp.blocks_payload()),
    v_draft.placements,
    v_draft.faixa_slot_count,
    v_draft.explicit_bank_item_ids,
    v_draft.displaced_bank_item_ids,
    v_draft.worked_bank_item_ids,
    p_faixa_arrival_bank_item_ids,
    p_displaced_arrival_bank_item_ids,
    v_draft.presentation
  ) as applied;

  return v_final_token;
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
  '18000000-0000-4000-8000-000000000001',
  'Physical V14 Fixture Country',
  'physical-v14-fixture-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  '28000000-0000-4000-8000-000000000001',
  'Physical V14 Fixture Competition',
  'liga-portugal',
  'Physical V14 Fixture Country',
  '18000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '38000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000001',
  'Physical V14 2026/27',
  'physical-v14-2026-27'
);

insert into public.matchdays (id, season_id, number, label)
values (
  '48000000-0000-4000-8000-000000000001',
  '38000000-0000-4000-8000-000000000001',
  1,
  'Physical V14 live'
);

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values (
  '48000000-0000-4000-8000-000000000001',
  '38000000-0000-4000-8000-000000000001',
  true
);

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values (
  '48000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
values (
  '48000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"FC Porto","other_liga_clubs":"1ª Liga","outside_liga_other":"Para lá da 1ª Liga"}'::jsonb
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['48000000-0000-4000-8000-000000000001'::uuid]
);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 5
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
    where projection_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
  ),
  'initial five-key projection is not exact'
);

-- Additional physical zones are fixture topology, not facade CRUD.
insert into public.matchday_live_layout_zones (
  id,
  matchday_id,
  public_title,
  visual_family
)
values
  (
    '68000000-0000-4000-8000-000000000006',
    '48000000-0000-4000-8000-000000000001',
    'Sixth physical zone',
    'six_news'
  ),
  (
    '68000000-0000-4000-8000-000000000007',
    '48000000-0000-4000-8000-000000000001',
    'Seventh physical zone',
    'six_news'
  );

insert into public.matchday_live_layout_blocks (
  id,
  matchday_id,
  block_type,
  zone_id,
  sort_order
)
select
  '78000000-0000-4000-8000-000000000006',
  '48000000-0000-4000-8000-000000000001',
  'zone',
  '68000000-0000-4000-8000-000000000006',
  pg_catalog.max(block_row.sort_order) + 1
from public.matchday_live_layout_blocks as block_row
where block_row.matchday_id =
      '48000000-0000-4000-8000-000000000001';

insert into public.matchday_live_layout_blocks (
  id,
  matchday_id,
  block_type,
  zone_id,
  sort_order
)
select
  '78000000-0000-4000-8000-000000000007',
  '48000000-0000-4000-8000-000000000001',
  'zone',
  '68000000-0000-4000-8000-000000000007',
  pg_catalog.max(block_row.sort_order) + 1
from public.matchday_live_layout_blocks as block_row
where block_row.matchday_id =
      '48000000-0000-4000-8000-000000000001';

insert into public.matchday_live_layout_blocks (
  id,
  matchday_id,
  block_type,
  zone_id,
  sort_order
)
select
  '78000000-0000-4000-8000-000000000008',
  '48000000-0000-4000-8000-000000000001',
  'video',
  null,
  (
    select coalesce(pg_catalog.max(block_row.sort_order), 0) + 1
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
  )
where not exists (
  select 1
  from public.matchday_live_layout_blocks as existing_row
  where existing_row.matchday_id =
        '48000000-0000-4000-8000-000000000001'
    and existing_row.block_type = 'video'
);

insert into physical_v14_items (item_kind, article_id)
values
  ('opening', '58000000-0000-4000-8000-000000000001'),
  ('faixa_one', '58000000-0000-4000-8000-000000000002'),
  ('faixa_three', '58000000-0000-4000-8000-000000000003'),
  ('selection', '58000000-0000-4000-8000-000000000004'),
  ('video', '58000000-0000-4000-8000-000000000005'),
  ('mapped_zone', '58000000-0000-4000-8000-000000000006'),
  ('sixth_zone', '58000000-0000-4000-8000-000000000007'),
  ('seventh_zone', '58000000-0000-4000-8000-000000000008'),
  ('explicit_bank', '58000000-0000-4000-8000-000000000009'),
  ('displaced', '58000000-0000-4000-8000-000000000010'),
  ('bulk_one', '58000000-0000-4000-8000-000000000011'),
  ('bulk_two', '58000000-0000-4000-8000-000000000012'),
  ('bulk_three', '58000000-0000-4000-8000-000000000013');

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
  'Physical V14 ' || fixture.item_kind,
  'physical-v14-' || pg_catalog.replace(fixture.article_id::text, '-', ''),
  'published',
  'matchday',
  'Fixture',
  'Physical V14 fixture',
  'Fixture body',
  'https://example.test/' || fixture.article_id::text || '.jpg',
  pg_catalog.transaction_timestamp(),
  '28000000-0000-4000-8000-000000000001',
  '38000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000001'
from physical_v14_items as fixture;

update physical_v14_items as fixture
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '48000000-0000-4000-8000-000000000001'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      fixture.article_id::text;

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 13
    from physical_v14_items
    where bank_item_id is not null
  ),
  'fixture Bank items were not created'
);

insert into physical_v14_draft (
  placements,
  explicit_bank_item_ids,
  displaced_bank_item_ids,
  worked_bank_item_ids,
  faixa_slot_count,
  presentation
)
values (
  pg_catalog.jsonb_build_array(
    pg_temp.placement(pg_temp.bank_id('opening'), 'opening', null, 2),
    pg_temp.placement(pg_temp.bank_id('faixa_one'), 'faixa', null, 1),
    pg_temp.placement(pg_temp.bank_id('faixa_three'), 'faixa', null, 3),
    pg_temp.placement(pg_temp.bank_id('selection'), 'selection', null, 4),
    pg_temp.placement(pg_temp.bank_id('video'), 'video_highlight', null, 1),
    pg_temp.placement(
      pg_temp.bank_id('mapped_zone'),
      'zone',
      pg_temp.zone_id('benfica'),
      2
    ),
    pg_temp.placement(
      pg_temp.bank_id('sixth_zone'),
      'zone',
      '68000000-0000-4000-8000-000000000006',
      3
    ),
    pg_temp.placement(
      pg_temp.bank_id('seventh_zone'),
      'zone',
      '68000000-0000-4000-8000-000000000007',
      6
    )
  ),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('explicit_bank')),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('displaced')),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('mapped_zone')),
  4,
  pg_catalog.jsonb_build_object(
    'headline_title_color', '#AABBCC',
    'latest_zone_placement', 'top',
    'latest_zone_title', 'Latest physical',
    'video_module_active', true
  )
);

-- Race case A / stale token before DML: a prior serialized writer changes the
-- state after the client token. The facade must reject before marker/settings.
do $test$
declare
  v_stale_token text;
begin
  perform jornada_private.assert_matchday_live_layout_legacy_writer_v14(
    '48000000-0000-4000-8000-000000000001'
  );

  select token_row.state_token
  into strict v_stale_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '48000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  update public.matchday_live_layout_zones
  set public_title = public_title || ' prior-writer'
  where id = pg_temp.zone_id('sporting');

  begin
    perform *
    from public.apply_matchday_live_layout_physical_workspace_v14(
      '48000000-0000-4000-8000-000000000001',
      'liga_portugal_v1',
      v_stale_token,
      pg_temp.zones_payload(),
      pg_temp.blocks_payload(),
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
        'latest_zone_title', 'Stale rejected',
        'video_module_active', false
      )
    );
    raise exception 'stale token was accepted';
  exception
    when others then
      if pg_catalog.strpos(sqlerrm, 'physical-v14-concurrent-write') = 0 then
        raise;
      end if;
  end;

  perform pg_temp.assert_true(
    not exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
      where matchday_id = '48000000-0000-4000-8000-000000000001'
    ) and not exists (
      select 1
      from public.matchday_live_layout_workspace_settings
      where matchday_id = '48000000-0000-4000-8000-000000000001'
    ),
    'stale token wrote marker or settings'
  );
end;
$test$;

insert into physical_v14_results values
  (1, 'stale token before DML', 'PASS');

-- A forced late failure proves total subtransaction rollback, including marker.
create function pg_temp.reject_late_apply()
returns trigger
language plpgsql
as $function$
begin
  if new.latest_zone_title = 'Force late error' then
    raise exception 'fixture-late-error';
  end if;
  return new;
end;
$function$;

create trigger physical_v14_force_late_error
after insert or update
on public.matchday_live_layout_workspace_settings
for each row execute function pg_temp.reject_late_apply();

do $test$
declare
  v_state_token text;
begin
  select token_row.state_token
  into strict v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '48000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  begin
    perform *
    from public.apply_matchday_live_layout_physical_workspace_v14(
      '48000000-0000-4000-8000-000000000001',
      'liga_portugal_v1',
      v_state_token,
      pg_temp.zones_payload(),
      pg_temp.blocks_payload(),
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
        'latest_zone_title', 'Force late error',
        'video_module_active', false
      )
    );
    raise exception 'late error was not raised';
  exception
    when others then
      if pg_catalog.strpos(sqlerrm, 'fixture-late-error') = 0 then
        raise;
      end if;
  end;

  perform pg_temp.assert_true(
    not exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
      where matchday_id = '48000000-0000-4000-8000-000000000001'
    ) and not exists (
      select 1
      from public.matchday_live_layout_workspace_settings
      where matchday_id = '48000000-0000-4000-8000-000000000001'
    ),
    'late error did not roll back all facade writes'
  );
end;
$test$;

drop trigger physical_v14_force_late_error
on public.matchday_live_layout_workspace_settings;

insert into physical_v14_results values
  (2, 'late error total rollback', 'PASS');

insert into physical_v14_evidence (key, value)
select
  'classification_before',
  pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', bank_row.id,
        'classification_key', bank_row.classification_key,
        'classification_source', bank_row.classification_source,
        'automatic_eligible', bank_row.automatic_eligible,
        'classified_at', bank_row.classified_at
      ) order by bank_row.id
    ),
    '[]'::jsonb
  )::text)
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '48000000-0000-4000-8000-000000000001';

select pg_temp.apply_current(
  pg_catalog.jsonb_build_array(
    pg_temp.bank_id('faixa_one'),
    pg_temp.bank_id('faixa_three')
  ),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('displaced'))
);

select pg_temp.assert_true(
  (
    select settings_row.faixa_slot_count = 4
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
  ),
  'faixa extent did not survive logical reload'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000001'
      and placement_type = 'faixa'
      and slot_position = 1
  ) and exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000001'
      and placement_type = 'faixa'
      and slot_position = 3
  ) and not exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000001'
      and placement_type = 'faixa'
      and slot_position in (2, 4)
  ),
  'sparse Faixa was compacted or filled'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000001'
      and zone_id = '68000000-0000-4000-8000-000000000006'
      and slot_position = 3
  ) and exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000001'
      and zone_id = '68000000-0000-4000-8000-000000000007'
      and slot_position = 6
  ),
  'additional-zone placements were not persisted'
);

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 8
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000001'
  ) and exists (
    select 1 from public.matchday_live_layout_placements
    where bank_item_id = pg_temp.bank_id('opening')
      and placement_type = 'opening' and slot_position = 2
  ) and exists (
    select 1 from public.matchday_live_layout_placements
    where bank_item_id = pg_temp.bank_id('selection')
      and placement_type = 'selection' and slot_position = 4
  ) and exists (
    select 1 from public.matchday_live_layout_placements
    where bank_item_id = pg_temp.bank_id('video')
      and placement_type = 'video_highlight' and slot_position = 1
  ),
  'non-zone physical placements diverged or were redistributed'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = override_row.matchday_id
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(override_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(override_row.source_id))
    where override_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
      and override_row.profile_key = 'liga_portugal_v1'
      and override_row.placement_target = 'bank'
      and override_row.zone_key is null
      and override_row.sort_order is null
      and bank_row.id = pg_temp.bank_id('explicit_bank')
  ) and not exists (
    select 1
    from public.matchday_live_layout_placements
    where bank_item_id = pg_temp.bank_id('explicit_bank')
  ),
  'explicit Bank state is not canonical'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory
    where matchday_id = '48000000-0000-4000-8000-000000000001'
      and bank_item_id = pg_temp.bank_id('displaced')
      and memory_kind = 'displaced'
      and recorded_at is not null
  ) and exists (
    select 1
    from public.matchday_editorial_bank_items
    where id = pg_temp.bank_id('mapped_zone')
      and editorially_worked_at is not null
  ),
  'Displaced memory, arrival clock or worked state is missing'
);

select pg_temp.assert_true(
  (
    select first_row.created_at > third_row.created_at
    from public.matchday_live_layout_placements as first_row
    cross join public.matchday_live_layout_placements as third_row
    where first_row.bank_item_id = pg_temp.bank_id('faixa_one')
      and first_row.placement_type = 'faixa'
      and third_row.bank_item_id = pg_temp.bank_id('faixa_three')
      and third_row.placement_type = 'faixa'
  ),
  'Faixa arrival clocks do not preserve input event order'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_editorial_profile_zone_items as item_row
    where item_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
      and item_row.source_id in (
        (select article_id::text from physical_v14_items where item_kind = 'sixth_zone'),
        (select article_id::text from physical_v14_items where item_kind = 'seventh_zone')
      )
  ) and not exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
    where zone_id in (
      '68000000-0000-4000-8000-000000000006',
      '68000000-0000-4000-8000-000000000007'
    )
  ),
  'legacy projection included or invented an additional zone mapping'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_shadow_sync_queue as queue_row
    where queue_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
  ) and not exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
      as queue_row
    where queue_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
  ),
  'downstream projection queued a legacy-to-physical recovery at COMMIT'
);

insert into physical_v14_results values
  (7, 'intermediate zone vacancy', 'PASS'),
  (8, 'final zone vacancy', 'PASS'),
  (9, 'intermediate faixa vacancy', 'PASS'),
  (10, 'final faixa vacancy', 'PASS'),
  (11, 'faixa extent reload', 'PASS'),
  (12, 'no compaction', 'PASS'),
  (13, 'no redistribution', 'PASS'),
  (14, 'faixa arrival clock', 'PASS'),
  (15, 'displaced arrival clock', 'PASS'),
  (16, 'explicit Bank', 'PASS'),
  (17, 'Displaced', 'PASS'),
  (18, 'worked', 'PASS'),
  (19, 'Opening', 'PASS'),
  (20, 'Selection', 'PASS'),
  (21, 'Video highlight', 'PASS'),
  (26, 'sixth zone preserved', 'PASS'),
  (27, 'seventh zone preserved', 'PASS'),
  (28, 'additional-zone placements', 'PASS'),
  (29, 'legacy omits additional zones', 'PASS'),
  (30, 'no invented projection', 'PASS');

-- Identical Apply: physical IDs/clocks, memory, settings and legacy rows stay.
insert into physical_v14_evidence values
  ('no_op_before', pg_temp.authoritative_hash());

insert into physical_v14_evidence (key, value)
select 'no_op_token_before', token_row.state_token
from public.matchday_editorial_profile_workspace_token_v13(
  '48000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
) as token_row;

select pg_temp.apply_current();

select pg_temp.assert_true(
  (select value from physical_v14_evidence where key = 'no_op_before') =
  pg_temp.authoritative_hash(),
  'no-op changed physical or downstream identity/clocks'
);

select pg_temp.assert_true(
  (select value from physical_v14_evidence where key = 'no_op_token_before') =
  (
    select token_row.state_token
    from public.matchday_editorial_profile_workspace_token_v13(
      '48000000-0000-4000-8000-000000000001',
      'liga_portugal_v1'
    ) as token_row
  ),
  'no-op changed the physical state token'
);

insert into physical_v14_results values
  (3, 'no-op clocks and ids', 'PASS');

-- Simple movement by UUID, then a two-item swap, then a three-item bulk move.
update physical_v14_draft
set placements = (
  select pg_catalog.jsonb_agg(
    case
      when (raw_row.value ->> 'bank_item_id')::uuid =
           pg_temp.bank_id('mapped_zone')
        then raw_row.value || '{"slot_position":4}'::jsonb
      else raw_row.value
    end order by raw_row.ordinality
  )
  from pg_catalog.jsonb_array_elements(placements)
    with ordinality as raw_row(value, ordinality)
);

select pg_temp.apply_current();

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements
    where bank_item_id = pg_temp.bank_id('mapped_zone')
      and zone_id = pg_temp.zone_id('benfica')
      and slot_position = 4
  ),
  'simple move failed'
);

insert into physical_v14_results values (4, 'simple move', 'PASS');

update physical_v14_draft
set placements = placements || pg_catalog.jsonb_build_array(
  pg_temp.placement(
    pg_temp.bank_id('bulk_one'),
    'zone',
    pg_temp.zone_id('benfica'),
    2
  )
);

select pg_temp.apply_current();

update physical_v14_draft
set placements = (
  select pg_catalog.jsonb_agg(
    case
      when (raw_row.value ->> 'bank_item_id')::uuid =
           pg_temp.bank_id('mapped_zone')
        then raw_row.value || '{"slot_position":2}'::jsonb
      when (raw_row.value ->> 'bank_item_id')::uuid =
           pg_temp.bank_id('bulk_one')
        then raw_row.value || '{"slot_position":4}'::jsonb
      else raw_row.value
    end order by raw_row.ordinality
  )
  from pg_catalog.jsonb_array_elements(placements)
    with ordinality as raw_row(value, ordinality)
);

select pg_temp.apply_current();

select pg_temp.assert_true(
  exists (
    select 1 from public.matchday_live_layout_placements
    where bank_item_id = pg_temp.bank_id('mapped_zone')
      and slot_position = 2
  ) and exists (
    select 1 from public.matchday_live_layout_placements
    where bank_item_id = pg_temp.bank_id('bulk_one')
      and slot_position = 4
  ),
  'swap failed'
);

insert into physical_v14_results values (5, 'swap', 'PASS');

update physical_v14_draft
set placements = (
  select pg_catalog.jsonb_agg(raw_row.value order by raw_row.ordinality)
  from pg_catalog.jsonb_array_elements(placements)
    with ordinality as raw_row(value, ordinality)
  where (raw_row.value ->> 'bank_item_id')::uuid <>
        pg_temp.bank_id('bulk_one')
) || pg_catalog.jsonb_build_array(
  pg_temp.placement(
    pg_temp.bank_id('bulk_one'),
    'zone',
    '68000000-0000-4000-8000-000000000006',
    1
  ),
  pg_temp.placement(
    pg_temp.bank_id('bulk_two'),
    'zone',
    '68000000-0000-4000-8000-000000000006',
    2
  ),
  pg_temp.placement(
    pg_temp.bank_id('bulk_three'),
    'zone',
    '68000000-0000-4000-8000-000000000006',
    4
  )
);

select pg_temp.apply_current();

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 4
    from public.matchday_live_layout_placements
    where zone_id = '68000000-0000-4000-8000-000000000006'
      and slot_position in (1, 2, 3, 4)
  ),
  'bulk move did not preserve exact slots'
);

insert into physical_v14_results values (6, 'bulk move', 'PASS');

-- Empty physical public title and incompatible visual-family shrink fail closed.
do $test$
declare
  v_bad_zones jsonb;
begin
  select pg_catalog.jsonb_agg(
    case
      when (raw_row.value ->> 'id')::uuid =
           '68000000-0000-4000-8000-000000000006'
        then raw_row.value || '{"public_title":""}'::jsonb
      else raw_row.value
    end order by raw_row.ordinality
  )
  into v_bad_zones
  from pg_catalog.jsonb_array_elements(pg_temp.zones_payload())
    with ordinality as raw_row(value, ordinality);

  begin
    perform pg_temp.apply_current('[]'::jsonb, '[]'::jsonb, v_bad_zones);
    raise exception 'empty title accepted';
  exception when others then
    if pg_catalog.strpos(sqlerrm, 'zone-value-invalid') = 0 then raise; end if;
  end;
end;
$test$;

do $test$
declare
  v_bad_zones jsonb;
begin
  select pg_catalog.jsonb_agg(
    case
      when (raw_row.value ->> 'id')::uuid =
           '68000000-0000-4000-8000-000000000007'
        then raw_row.value || '{"visual_family":"five_news_balanced"}'::jsonb
      else raw_row.value
    end order by raw_row.ordinality
  )
  into v_bad_zones
  from pg_catalog.jsonb_array_elements(pg_temp.zones_payload())
    with ordinality as raw_row(value, ordinality);

  begin
    perform pg_temp.apply_current('[]'::jsonb, '[]'::jsonb, v_bad_zones);
    raise exception 'incompatible shrink accepted';
  exception when others then
    if pg_catalog.strpos(sqlerrm, 'zone-capacity-invalid') = 0 then raise; end if;
  end;
end;
$test$;

insert into physical_v14_results values
  (22, 'empty title rejected', 'PASS'),
  (23, 'incompatible shrink rejected', 'PASS');

-- A valid extra-zone title/layout change and arbitrary block reorder persist.
do $test$
declare
  v_zones jsonb;
  v_blocks jsonb;
begin
  select pg_catalog.jsonb_agg(
    case
      when (raw_row.value ->> 'id')::uuid =
           '68000000-0000-4000-8000-000000000006'
        then raw_row.value || pg_catalog.jsonb_build_object(
          'public_title', 'Sixth edited',
          'visual_family', 'five_news_balanced'
        )
      else raw_row.value
    end order by raw_row.ordinality
  )
  into v_zones
  from pg_catalog.jsonb_array_elements(pg_temp.zones_payload())
    with ordinality as raw_row(value, ordinality);

  select pg_catalog.jsonb_agg(
    raw_row.value || pg_catalog.jsonb_build_object(
      'sort_order', raw_row.new_order
    ) order by raw_row.ordinality
  )
  into v_blocks
  from (
    select
      source_row.value,
      source_row.ordinality,
      pg_catalog.row_number() over (
        order by (source_row.value ->> 'sort_order')::integer desc
      )::integer as new_order
    from pg_catalog.jsonb_array_elements(pg_temp.blocks_payload())
      with ordinality as source_row(value, ordinality)
  ) as raw_row;

  perform pg_temp.apply_current('[]'::jsonb, '[]'::jsonb, v_zones, v_blocks);
end;
$test$;

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_zones
    where id = '68000000-0000-4000-8000-000000000006'
      and public_title = 'Sixth edited'
      and visual_family = 'five_news_balanced'
  ),
  'valid title/layout did not persist'
);

insert into physical_v14_results values
  (24, 'valid title and layout', 'PASS'),
  (25, 'block reorder', 'PASS');

-- Corrupting any of the mandatory five-key projection rows is fail-closed.
do $test$
declare
  v_projection record;
begin
  select * into strict v_projection
  from jornada_private.matchday_live_layout_zone_legacy_projection
  where matchday_id = '48000000-0000-4000-8000-000000000001'
    and legacy_zone_key = 'sporting';

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    '48000000-0000-4000-8000-000000000001'
  );
  delete from jornada_private.matchday_live_layout_zone_legacy_projection
  where matchday_id = '48000000-0000-4000-8000-000000000001'
    and legacy_zone_key = 'sporting';
  perform jornada_private.end_matchday_live_layout_downstream_v14(
    '48000000-0000-4000-8000-000000000001'
  );

  begin
    perform pg_temp.apply_current();
    raise exception 'invalid five-key mapping accepted';
  exception when others then
    if pg_catalog.strpos(sqlerrm, 'legacy-projection-invalid') = 0 then raise; end if;
  end;

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    '48000000-0000-4000-8000-000000000001'
  );
  insert into jornada_private.matchday_live_layout_zone_legacy_projection (
    matchday_id,
    legacy_zone_key,
    zone_id
  ) values (
    v_projection.matchday_id,
    v_projection.legacy_zone_key,
    v_projection.zone_id
  );
  perform jornada_private.end_matchday_live_layout_downstream_v14(
    '48000000-0000-4000-8000-000000000001'
  );
end;
$test$;

insert into physical_v14_results values
  (31, 'invalid five-key mapping rejected', 'PASS');

-- Race case B: marker exists, so legacy topology and all exposed writers fail.
do $test$
begin
  begin
    update public.matchday_editorial_profile_reconcile_control
    set thematic_zone_order = thematic_zone_order
    where matchday_id = '48000000-0000-4000-8000-000000000001'
      and profile_key = 'liga_portugal_v1';
    raise exception 'topology trigger accepted a post-cutover legacy write';
  exception when others then
    if pg_catalog.strpos(sqlerrm, 'legacy-topology-after-physical-cutover') = 0
    then raise; end if;
  end;

  begin
    perform * from public.apply_matchday_editorial_profile_workspace_v12(
      '48000000-0000-4000-8000-000000000001', null, null, null,
      null, null, null, null, null, null, null, null, null, null, null, null, null
    );
    raise exception 'v12 accepted a post-cutover write';
  exception when others then
    if pg_catalog.strpos(
      sqlerrm,
      'legacy-writer-after-physical-cutover'
    ) = 0 then raise; end if;
  end;

  begin
    perform * from public.apply_matchday_editorial_profile_workspace_v11(
      '48000000-0000-4000-8000-000000000001', null, null, null,
      null, null, null, null, null, null, null, null, null, null, null
    );
    raise exception 'v11 accepted a post-cutover write';
  exception when others then
    if pg_catalog.strpos(
      sqlerrm,
      'legacy-writer-after-physical-cutover'
    ) = 0 then raise; end if;
  end;

  begin
    perform * from public.apply_matchday_editorial_desk_state_v2(
      '48000000-0000-4000-8000-000000000001', null, null, null, null
    );
    raise exception 'desk v2 accepted a post-cutover write';
  exception when others then
    if pg_catalog.strpos(
      sqlerrm,
      'legacy-writer-after-physical-cutover'
    ) = 0 then raise; end if;
  end;
end;
$test$;

insert into physical_v14_results values
  (32, 'topology trigger fenced', 'PASS'),
  (33, 'v12 fenced', 'PASS'),
  (34, 'v11 fenced', 'PASS'),
  (35, 'desk v2 fenced', 'PASS');

select pg_temp.assert_true(
  (select value from physical_v14_evidence where key = 'classification_before') =
  (
    select pg_catalog.md5(coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', bank_row.id,
          'classification_key', bank_row.classification_key,
          'classification_source', bank_row.classification_source,
          'automatic_eligible', bank_row.automatic_eligible,
          'classified_at', bank_row.classified_at
        ) order by bank_row.id
      ),
      '[]'::jsonb
    )::text)
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id =
          '48000000-0000-4000-8000-000000000001'
  ),
  'classification changed across physical applies'
);

select pg_temp.assert_true(
  (
    select reader.state_token = token_row.state_token
    from public.read_matchday_live_layout_workspace_v13(
      '48000000-0000-4000-8000-000000000001',
      'liga_portugal_v1'
    ) as reader
    cross join public.matchday_editorial_profile_workspace_token_v13(
      '48000000-0000-4000-8000-000000000001',
      'liga_portugal_v1'
    ) as token_row
  ),
  'reader and facade token composition diverged'
);

insert into physical_v14_results values
  (36, 'classification invariant', 'PASS'),
  (37, 'final token', 'PASS');

select pg_temp.assert_true(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    cross join lateral pg_catalog.aclexplode(coalesce(
      procedure_row.proacl,
      pg_catalog.acldefault('f', procedure_row.proowner)
    )) as acl_row
    where procedure_row.oid =
      'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
      and acl_row.grantee = 0
      and acl_row.privilege_type = 'EXECUTE'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_cutovers',
    'INSERT,UPDATE,DELETE'
  )
  and not pg_catalog.has_table_privilege(
    'service_role',
    'public.matchday_live_layout_workspace_settings',
    'INSERT,UPDATE,DELETE'
  ),
  'facade or state tables have invalid access control'
);

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) and not pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.apply_matchday_live_layout_placement_plan(uuid,jsonb,boolean)',
    'EXECUTE'
  ) and not pg_catalog.has_function_privilege(
    'anon',
    'jornada_private.apply_matchday_live_layout_placement_plan(uuid,jsonb,boolean)',
    'EXECUTE'
  ) and not pg_catalog.has_function_privilege(
    'authenticated',
    'jornada_private.apply_matchday_live_layout_placement_plan(uuid,jsonb,boolean)',
    'EXECUTE'
  ),
  'writer v13 or physical core became externally executable'
);

insert into physical_v14_results values
  (38, 'access control', 'PASS'),
  (39, 'writer v13 private', 'PASS'),
  (40, 'fixture ends ROLLBACK', 'PASS');

select pg_temp.assert_true(
  (select pg_catalog.count(*) from physical_v14_results) = 40,
  'fixture did not record all 40 required checks'
);

table physical_v14_results order by test_number;

ROLLBACK;
