\set ON_ERROR_STOP on

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

create function pg_temp.live_surface_hash(
  p_matchday_id uuid,
  p_surface text
)
returns text
language plpgsql
stable
as $function$
declare
  v_hash text;
begin
  case p_surface
    when 'desk' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.matchday_id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_editorial_desk_control as row_value
      where row_value.matchday_id = p_matchday_id;

    when 'placements' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_live_layout_placements as row_value
      where row_value.matchday_id = p_matchday_id;

    when 'bank' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_editorial_bank_items as row_value
      where row_value.matchday_id = p_matchday_id;

    when 'zones' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_live_layout_zones as row_value
      where row_value.matchday_id = p_matchday_id;

    when 'blocks' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_live_layout_blocks as row_value
      where row_value.matchday_id = p_matchday_id;

    when 'latest' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_latest_news as row_value
      where row_value.matchday_id = p_matchday_id;

    when 'roundup' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_roundup_items as row_value
      where row_value.matchday_id = p_matchday_id;

    when 'memory' then
      select pg_catalog.md5(
        coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.bank_item_id
          )::text,
          '[]'
        )
      )
      into v_hash
      from public.matchday_live_layout_bank_item_state_memory as row_value
      where row_value.matchday_id = p_matchday_id;

    else
      raise exception 'unknown-live-surface: %', p_surface;
  end case;

  return v_hash;
end;
$function$;

create temp table test_results (
  test_number integer primary key,
  test_name text not null,
  status text not null,
  detail text not null
);

create temp table target_hash_evidence (
  checkpoint text not null,
  surface text not null,
  hash text not null,
  primary key (checkpoint, surface)
);

create temp table transition_evidence (
  checkpoint text primary key,
  payload jsonb not null
);

insert into jornada_private.matchday_live_layout_cutover_control (
  scope,
  authority_mode
)
values ('live_layout', 'authoritative');

insert into public.countries (
  id,
  name,
  slug
)
values (
  '10000000-0000-4000-8000-000000000001',
  'Fixture Country',
  'fixture-country'
);

insert into public.competitions (
  id,
  name,
  slug,
  country,
  country_id
)
values (
  '20000000-0000-4000-8000-000000000001',
  'Fixture Competition',
  'liga-portugal',
  'Fixture Country',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.seasons (
  id,
  competition_id,
  label,
  slug
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Fixture A',
    'fixture-a'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Fixture B',
    'fixture-b'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '20000000-0000-4000-8000-000000000001',
    'Fixture C',
    'fixture-c'
  );

insert into public.matchdays (
  id,
  season_id,
  number,
  label
)
values
  (
    '40000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000001',
    1,
    'A J01'
  ),
  (
    '40000000-0000-4000-8000-000000000012',
    '30000000-0000-4000-8000-000000000001',
    2,
    'A J02'
  ),
  (
    '40000000-0000-4000-8000-000000000021',
    '30000000-0000-4000-8000-000000000002',
    1,
    'B J01'
  ),
  (
    '40000000-0000-4000-8000-000000000022',
    '30000000-0000-4000-8000-000000000002',
    2,
    'B J02'
  ),
  (
    '40000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000003',
    1,
    'C J01'
  ),
  (
    '40000000-0000-4000-8000-000000000032',
    '30000000-0000-4000-8000-000000000003',
    2,
    'C J02'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '40000000-0000-4000-8000-000000000011',
    '30000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000012',
    '30000000-0000-4000-8000-000000000001',
    false
  ),
  (
    '40000000-0000-4000-8000-000000000021',
    '30000000-0000-4000-8000-000000000002',
    false
  ),
  (
    '40000000-0000-4000-8000-000000000022',
    '30000000-0000-4000-8000-000000000002',
    false
  ),
  (
    '40000000-0000-4000-8000-000000000031',
    '30000000-0000-4000-8000-000000000003',
    true
  ),
  (
    '40000000-0000-4000-8000-000000000032',
    '30000000-0000-4000-8000-000000000003',
    false
  );

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key
)
values
  (
    '40000000-0000-4000-8000-000000000011',
    'liga_portugal_v1'
  ),
  (
    '40000000-0000-4000-8000-000000000031',
    'liga_portugal_v1'
  );

select jornada_private.sync_matchday_live_layout_shadow(
  array[
    '40000000-0000-4000-8000-000000000011'::uuid,
    '40000000-0000-4000-8000-000000000031'::uuid
  ]
);

insert into public.matchday_editorial_bank_items (
  id,
  matchday_id,
  label,
  title,
  subtitle,
  image_url,
  link_url,
  source_type,
  source_id,
  sort_order
)
select
  ('50000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  '40000000-0000-4000-8000-000000000011'::uuid,
  'A' || value::text,
  'A title ' || value::text,
  'A subtitle ' || value::text,
  'https://example.test/a-' || value::text || '.jpg',
  'https://example.test/a-' || value::text,
  'manual_link',
  ('51000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0')),
  value
from pg_catalog.generate_series(1, 10) as source_row(value);

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
  '60000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000011',
  'draft',
  false,
  'A first publication',
  'hierarchical',
  'A Editorial',
  'A Editorial excerpt',
  'A Editorial text',
  'A Author',
  '#112233',
  'A Zone 1',
  'A Zone 2',
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
  status
)
values (
  '61000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  'custom_card',
  'manual_link',
  '51000000-0000-4000-8000-000000000010',
  1,
  'A reference item',
  'published'
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
  link_url_snapshot
)
select
  ('62000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  '60000000-0000-4000-8000-000000000001'::uuid,
  (array[
    'dominant_main',
    'other_chronicle_1',
    'other_chronicle_2',
    'other_chronicle_3'
  ])[value],
  ('50000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  'a-slot-' || value::text,
  'A' || value::text,
  'A slot title ' || value::text,
  'A slot subtitle ' || value::text,
  'https://example.test/a-slot-' || value::text || '.jpg',
  'https://example.test/a-slot-' || value::text
from pg_catalog.generate_series(1, 4) as source_row(value);

insert into public.matchday_historical_composition_zones (
  id,
  composition_id,
  sort_order,
  public_title,
  visual_family
)
values (
  '63000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001',
  1,
  'A Dynamic Zone',
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
  ('64000000-0000-4000-8000-' || pg_catalog.lpad(value::text, 12, '0'))::uuid,
  '60000000-0000-4000-8000-000000000001'::uuid,
  '63000000-0000-4000-8000-000000000001'::uuid,
  value,
  ('50000000-0000-4000-8000-' || pg_catalog.lpad((value + 4)::text, 12, '0'))::uuid,
  'a-zone-' || value::text,
  'AZ' || value::text,
  'A zone title ' || value::text,
  'A zone subtitle ' || value::text,
  'https://example.test/a-zone-' || value::text || '.jpg',
  'https://example.test/a-zone-' || value::text
from pg_catalog.generate_series(1, 5) as source_row(value);

select public.apply_matchday_live_layout_movement(
  '40000000-0000-4000-8000-000000000011',
  'place',
  '50000000-0000-4000-8000-000000000001',
  'faixa',
  null,
  1,
  null,
  true
);

insert into public.matchday_latest_news (
  id,
  matchday_id,
  time_label,
  title,
  subtitle,
  link_url,
  image_url,
  sort_order,
  status
)
values (
  '70000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000011',
  '12:00',
  'A Latest',
  'A Latest subtitle',
  'https://example.test/a-latest',
  'https://example.test/a-latest.jpg',
  1,
  'published'
);

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
  '71000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000011',
  'Video',
  'A Roundup',
  'A Roundup subtitle',
  'https://example.test/a-roundup.jpg',
  'https://example.test/a-roundup.mp4',
  'resumo',
  1,
  'published'
);

do $test$
declare
  v_result jsonb;
begin
  v_result := public.publish_matchday_reference_composition(
    '40000000-0000-4000-8000-000000000011',
    '60000000-0000-4000-8000-000000000001'
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'first_publication',
    'first publication was not selected'
  );
  perform pg_temp.assert_true(
    (select status = 'published' and is_current
     from public.matchday_reference_compositions
     where id = '60000000-0000-4000-8000-000000000001'),
    'source composition was not published/current'
  );
  perform pg_temp.assert_true(
    (select not is_managed
     from public.matchday_editorial_desk_control
     where matchday_id = '40000000-0000-4000-8000-000000000011'),
    'source remained live'
  );
  perform pg_temp.assert_true(
    (select is_managed
     from public.matchday_editorial_desk_control
     where matchday_id = '40000000-0000-4000-8000-000000000012'),
    'target did not become live'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1 from public.matchday_live_layout_placements
      where matchday_id = '40000000-0000-4000-8000-000000000011'
    ) and not exists (
      select 1 from public.matchday_live_layout_bank_item_state_memory
      where matchday_id = '40000000-0000-4000-8000-000000000011'
    ),
    'source live state was not retired'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_editorial_continuity_transitions
     where source_matchday_id = '40000000-0000-4000-8000-000000000011'
       and target_matchday_id = '40000000-0000-4000-8000-000000000012'
       and continuity_version = 6),
    'transition v6 was not unique'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_live_layout_placements
     where matchday_id = '40000000-0000-4000-8000-000000000012')
    and (select count(*) = 1
         from public.matchday_latest_news
         where matchday_id = '40000000-0000-4000-8000-000000000012')
    and (select count(*) = 1
         from public.matchday_roundup_items
         where matchday_id = '40000000-0000-4000-8000-000000000012'),
    'target did not inherit non-empty live surfaces'
  );

  insert into test_results values (
    1,
    'FIRST PUBLICATION',
    'PASS',
    v_result::text
  );
end;
$test$;

insert into target_hash_evidence (checkpoint, surface, hash)
select
  'before_historical_republish',
  surface,
  pg_temp.live_surface_hash(
    '40000000-0000-4000-8000-000000000012',
    surface
  )
from pg_catalog.unnest(array[
  'desk',
  'placements',
  'bank',
  'zones',
  'blocks',
  'latest',
  'roundup',
  'memory'
]) as surface_row(surface);

insert into transition_evidence (checkpoint, payload)
select
  'before_historical_republish',
  pg_catalog.to_jsonb(transition_row)
from public.matchday_editorial_continuity_transitions as transition_row
where transition_row.source_matchday_id =
  '40000000-0000-4000-8000-000000000011';

do $test$
declare
  v_draft_id uuid;
begin
  v_draft_id := public.reopen_matchday_reference_composition(
    '40000000-0000-4000-8000-000000000011',
    '60000000-0000-4000-8000-000000000001'
  );

  perform pg_temp.assert_true(
    (select status = 'draft' and not is_current
     from public.matchday_reference_compositions
     where id = v_draft_id),
    'reopen did not create a draft'
  );
  perform pg_temp.assert_true(
    (select status = 'published' and is_current
     from public.matchday_reference_compositions
     where id = '60000000-0000-4000-8000-000000000001'),
    'public composition stopped being public during edit'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_reference_composition_items
     where composition_id = v_draft_id)
    and (select count(*) = 4
         from public.matchday_hierarchical_composition_slots
         where composition_id = v_draft_id)
    and (select count(*) = 1
         from public.matchday_historical_composition_zones
         where composition_id = v_draft_id)
    and (select count(*) = 5
         from public.matchday_historical_composition_zone_items
         where composition_id = v_draft_id),
    'reopen did not clone all historical child families'
  );

  update public.matchday_reference_compositions
  set internal_name = 'A historical edit 1'
  where id = v_draft_id;

  update public.matchday_reference_composition_items
  set title_snapshot = 'A edited reference item'
  where composition_id = v_draft_id;

  update public.matchday_hierarchical_composition_slots
  set title_snapshot = 'A edited opening slot'
  where composition_id = v_draft_id
    and slot_key = 'dominant_main';

  update public.matchday_historical_composition_zones
  set public_title = 'A Edited Dynamic Zone'
  where composition_id = v_draft_id;

  update public.matchday_historical_composition_zone_items
  set title_snapshot = 'A edited zone item'
  where composition_id = v_draft_id
    and position = 1;

  perform pg_temp.assert_true(
    (select internal_name = 'A first publication'
     from public.matchday_reference_compositions
     where id = '60000000-0000-4000-8000-000000000001'),
    'working edit leaked into public composition'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from target_hash_evidence as evidence
      where evidence.checkpoint = 'before_historical_republish'
        and evidence.hash is distinct from pg_temp.live_surface_hash(
          '40000000-0000-4000-8000-000000000012',
          evidence.surface
        )
    ),
    'target changed during historical reopen/save'
  );

  insert into test_results values (
    2,
    'FIRST REOPEN',
    'PASS',
    'parent + item + slot + zone + zone item edited; source retired; target unchanged'
  );
  insert into test_results values (
    6,
    'DRAFT DOES NOT AUTO-PUBLISH',
    'PASS',
    'previous published/current composition remained public'
  );
end;
$test$;

do $test$
declare
  v_draft_id uuid;
  v_result jsonb;
begin
  select id
  into v_draft_id
  from public.matchday_reference_compositions
  where matchday_id = '40000000-0000-4000-8000-000000000011'
    and status = 'draft';

  v_result := public.publish_matchday_reference_composition(
    '40000000-0000-4000-8000-000000000011',
    v_draft_id
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'historical_republish'
      and (v_result ->> 'carryoverApplied')::boolean = false
      and (v_result ->> 'materialized')::boolean = false
      and (v_result ->> 'transitionPreserved')::boolean = true,
    'historical publisher returned an invalid result'
  );
  perform pg_temp.assert_true(
    (select status = 'published' and is_current
     from public.matchday_reference_compositions
     where id = v_draft_id),
    'revised composition did not become public/current'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from target_hash_evidence as evidence
      where evidence.checkpoint = 'before_historical_republish'
        and evidence.hash is distinct from pg_temp.live_surface_hash(
          '40000000-0000-4000-8000-000000000012',
          evidence.surface
        )
    ),
    'target changed during historical republish'
  );
  perform pg_temp.assert_true(
    (select pg_catalog.to_jsonb(transition_row) = evidence.payload
     from public.matchday_editorial_continuity_transitions as transition_row
     join transition_evidence as evidence
       on evidence.checkpoint = 'before_historical_republish'
     where transition_row.source_matchday_id =
       '40000000-0000-4000-8000-000000000011'),
    'original transition changed'
  );

  insert into test_results values (
    3,
    'HISTORICAL REPUBLISH',
    'PASS',
    v_result::text
  );
end;
$test$;

do $test$
declare
  v_iteration integer;
  v_current_id uuid;
  v_draft_id uuid;
  v_result jsonb;
begin
  for v_iteration in 2..3 loop
    select id
    into v_current_id
    from public.matchday_reference_compositions
    where matchday_id = '40000000-0000-4000-8000-000000000011'
      and status = 'published'
      and is_current = true;

    v_draft_id := public.reopen_matchday_reference_composition(
      '40000000-0000-4000-8000-000000000011',
      v_current_id
    );

    update public.matchday_reference_compositions
    set internal_name = 'A historical edit ' || v_iteration::text
    where id = v_draft_id;

    update public.matchday_historical_composition_zone_items
    set title_snapshot = 'A cycle ' || v_iteration::text
    where composition_id = v_draft_id
      and position = 1;

    v_result := public.publish_matchday_reference_composition(
      '40000000-0000-4000-8000-000000000011',
      v_draft_id
    );

    perform pg_temp.assert_true(
      v_result ->> 'publicationKind' = 'historical_republish',
      'repeat publish selected continuity'
    );
    perform pg_temp.assert_true(
      not exists (
        select 1
        from target_hash_evidence as evidence
        where evidence.checkpoint = 'before_historical_republish'
          and evidence.hash is distinct from pg_temp.live_surface_hash(
            '40000000-0000-4000-8000-000000000012',
            evidence.surface
          )
      ),
      'target changed in repeat cycle'
    );
  end loop;

  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_editorial_continuity_transitions
     where source_matchday_id = '40000000-0000-4000-8000-000000000011'
       and target_matchday_id = '40000000-0000-4000-8000-000000000012'
       and continuity_version = 6),
    'repeat cycles duplicated transition'
  );
  perform pg_temp.assert_true(
    (select source_composition_id =
       '60000000-0000-4000-8000-000000000001'
     from public.matchday_editorial_continuity_transitions
     where source_matchday_id = '40000000-0000-4000-8000-000000000011'),
    'repeat cycles rewrote transition source composition'
  );

  insert into test_results values (
    4,
    'SECOND REOPEN SAME MATCHDAY',
    'PASS',
    'same historical matchday reopened and republished twice more'
  );
  insert into test_results values (
    8,
    'CONTINUITY DOES NOT REPEAT',
    'PASS',
    'three historical republishes; one unchanged v6 transition; no target hash change'
  );
end;
$test$;

insert into target_hash_evidence (checkpoint, surface, hash)
select
  'after_historical_republish',
  surface,
  pg_temp.live_surface_hash(
    '40000000-0000-4000-8000-000000000012',
    surface
  )
from pg_catalog.unnest(array[
  'desk',
  'placements',
  'bank',
  'zones',
  'blocks',
  'latest',
  'roundup',
  'memory'
]) as surface_row(surface);

insert into transition_evidence (checkpoint, payload)
select
  'after_historical_republish',
  pg_catalog.to_jsonb(transition_row)
from public.matchday_editorial_continuity_transitions as transition_row
where transition_row.source_matchday_id =
  '40000000-0000-4000-8000-000000000011';

do $test$
begin
  perform pg_temp.assert_true(
    not exists (
      select 1
      from target_hash_evidence as before_row
      join target_hash_evidence as after_row
        on after_row.checkpoint = 'after_historical_republish'
       and after_row.surface = before_row.surface
      where before_row.checkpoint = 'before_historical_republish'
        and after_row.hash is distinct from before_row.hash
    ),
    'full live target hash comparison failed'
  );

  insert into test_results values (
    7,
    'LIVE TABLE UNCHANGED',
    'PASS',
    'desk/placements/bank/zones/blocks/latest/roundup/memory hashes equal'
  );
end;
$test$;

-- A second historical matchday is intentionally prepared from a valid v6
-- certificate. This proves that reopening is structural, not hardcoded to A.
insert into public.matchday_reference_compositions (
  id,
  matchday_id,
  status,
  is_current,
  internal_name,
  presentation_mode,
  published_at
)
values (
  '60000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000021',
  'published',
  true,
  'B published',
  'standard',
  pg_catalog.now()
);

insert into public.matchday_reference_composition_items (
  id,
  composition_id,
  slot_type,
  source_type,
  source_id,
  title_snapshot
)
values (
  '61000000-0000-4000-8000-000000000002',
  '60000000-0000-4000-8000-000000000002',
  'custom_card',
  'manual_link',
  '51000000-0000-4000-8000-000000000020',
  'B item'
);

insert into public.matchday_hierarchical_composition_slots (
  id,
  composition_id,
  slot_key,
  source_identity,
  title_snapshot
)
values (
  '62000000-0000-4000-8000-000000000020',
  '60000000-0000-4000-8000-000000000002',
  'dominant_main',
  'b-slot',
  'B slot'
);

insert into public.matchday_historical_composition_zones (
  id,
  composition_id,
  sort_order,
  public_title,
  visual_family
)
values (
  '63000000-0000-4000-8000-000000000020',
  '60000000-0000-4000-8000-000000000002',
  1,
  'B zone',
  'five_news_balanced'
);

insert into public.matchday_historical_composition_zone_items (
  id,
  composition_id,
  zone_id,
  position,
  source_identity,
  title_snapshot
)
values (
  '64000000-0000-4000-8000-000000000020',
  '60000000-0000-4000-8000-000000000002',
  '63000000-0000-4000-8000-000000000020',
  1,
  'b-zone-item',
  'B zone item'
);

insert into public.matchday_editorial_continuity_transitions (
  source_matchday_id,
  target_matchday_id,
  source_composition_id,
  continuity_version
)
values (
  '40000000-0000-4000-8000-000000000021',
  '40000000-0000-4000-8000-000000000022',
  '60000000-0000-4000-8000-000000000002',
  6
);

do $test$
declare
  v_iteration integer;
  v_current_id uuid := '60000000-0000-4000-8000-000000000002';
  v_draft_id uuid;
  v_target_hash text;
begin
  v_target_hash := pg_temp.live_surface_hash(
    '40000000-0000-4000-8000-000000000022',
    'desk'
  );

  for v_iteration in 1..2 loop
    v_draft_id := public.reopen_matchday_reference_composition(
      '40000000-0000-4000-8000-000000000021',
      v_current_id
    );

    update public.matchday_reference_compositions
    set internal_name = 'B edit ' || v_iteration::text
    where id = v_draft_id;

    update public.matchday_reference_composition_items
    set title_snapshot = 'B item ' || v_iteration::text
    where composition_id = v_draft_id;

    perform public.publish_matchday_reference_composition(
      '40000000-0000-4000-8000-000000000021',
      v_draft_id
    );

    v_current_id := v_draft_id;
  end loop;

  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_editorial_continuity_transitions
     where source_matchday_id = '40000000-0000-4000-8000-000000000021'
       and source_composition_id = '60000000-0000-4000-8000-000000000002'),
    'second historical matchday transition changed'
  );
  perform pg_temp.assert_true(
    pg_temp.live_surface_hash(
      '40000000-0000-4000-8000-000000000022',
      'desk'
    ) = v_target_hash,
    'second historical target changed'
  );

  insert into test_results values (
    5,
    'ANOTHER HISTORICAL MATCHDAY',
    'PASS',
    'second matchday reopened and republished twice; transition unique'
  );
end;
$test$;

-- A failed publication runs inside a PL/pgSQL subtransaction. The saved draft
-- remains editable, but no public/current, target or transition state changes.
do $test$
declare
  v_current_id uuid;
  v_draft_id uuid;
  v_transition_before jsonb;
  v_target_before text;
  v_failed boolean := false;
begin
  select id
  into v_current_id
  from public.matchday_reference_compositions
  where matchday_id = '40000000-0000-4000-8000-000000000011'
    and status = 'published'
    and is_current = true;

  v_draft_id := public.reopen_matchday_reference_composition(
    '40000000-0000-4000-8000-000000000011',
    v_current_id
  );

  update public.matchday_hierarchical_composition_slots
  set title_snapshot = null
  where composition_id = v_draft_id
    and slot_key = 'dominant_main';

  select pg_catalog.to_jsonb(transition_row)
  into v_transition_before
  from public.matchday_editorial_continuity_transitions as transition_row
  where transition_row.source_matchday_id =
    '40000000-0000-4000-8000-000000000011';

  v_target_before := pg_temp.live_surface_hash(
    '40000000-0000-4000-8000-000000000012',
    'placements'
  );

  begin
    perform public.publish_matchday_reference_composition(
      '40000000-0000-4000-8000-000000000011',
      v_draft_id
    );
  exception
    when others then
      v_failed := true;
  end;

  perform pg_temp.assert_true(v_failed, 'forced publication did not fail');
  perform pg_temp.assert_true(
    (select status = 'published' and is_current
     from public.matchday_reference_compositions
     where id = v_current_id),
    'rollback did not preserve previous public composition'
  );
  perform pg_temp.assert_true(
    (select status = 'draft' and not is_current
     from public.matchday_reference_compositions
     where id = v_draft_id),
    'failed draft entered a partial state'
  );
  perform pg_temp.assert_true(
    (select pg_catalog.to_jsonb(transition_row) = v_transition_before
     from public.matchday_editorial_continuity_transitions as transition_row
     where transition_row.source_matchday_id =
       '40000000-0000-4000-8000-000000000011'),
    'rollback changed transition'
  );
  perform pg_temp.assert_true(
    pg_temp.live_surface_hash(
      '40000000-0000-4000-8000-000000000012',
      'placements'
    ) = v_target_before,
    'rollback changed live target'
  );

  insert into test_results values (
    11,
    'ROLLBACK',
    'PASS',
    'previous public/current, live target and v6 transition preserved'
  );
end;
$test$;

-- A new live pair proves that first publication still executes the original
-- materializer, live switch and retirement path after the correction.
insert into public.matchday_editorial_bank_items (
  id,
  matchday_id,
  label,
  title,
  subtitle,
  image_url,
  link_url,
  source_type,
  source_id,
  sort_order
)
values
  (
    '50000000-0000-4000-8000-000000000031',
    '40000000-0000-4000-8000-000000000031',
    'C1',
    'C title 1',
    'C subtitle 1',
    'https://example.test/c-1.jpg',
    'https://example.test/c-1',
    'manual_link',
    '51000000-0000-4000-8000-000000000031',
    1
  ),
  (
    '50000000-0000-4000-8000-000000000032',
    '40000000-0000-4000-8000-000000000032',
    'C2',
    'C title 2',
    'C subtitle 2',
    'https://example.test/c-2.jpg',
    'https://example.test/c-2',
    'manual_link',
    '51000000-0000-4000-8000-000000000032',
    2
  );

insert into public.matchday_reference_compositions (
  id,
  matchday_id,
  status,
  is_current,
  internal_name,
  presentation_mode
)
values (
  '60000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000031',
  'draft',
  false,
  'C future first publication',
  'standard'
);

select public.apply_matchday_live_layout_movement(
  '40000000-0000-4000-8000-000000000031',
  'place',
  '50000000-0000-4000-8000-000000000031',
  'faixa',
  null,
  1,
  null,
  true
);

do $test$
declare
  v_result jsonb;
begin
  v_result := public.publish_matchday_reference_composition(
    '40000000-0000-4000-8000-000000000031',
    '60000000-0000-4000-8000-000000000003'
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'first_publication'
      and (v_result ->> 'materialized')::boolean
      and (v_result ->> 'sourceRetired')::boolean,
    'future first publication did not execute continuity/retirement'
  );
  perform pg_temp.assert_true(
    (select not is_managed
     from public.matchday_editorial_desk_control
     where matchday_id = '40000000-0000-4000-8000-000000000031')
    and (select is_managed
         from public.matchday_editorial_desk_control
         where matchday_id = '40000000-0000-4000-8000-000000000032'),
    'future live handoff failed'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1 from public.matchday_live_layout_placements
      where matchday_id = '40000000-0000-4000-8000-000000000031'
    ) and not exists (
      select 1 from public.matchday_live_layout_bank_item_state_memory
      where matchday_id = '40000000-0000-4000-8000-000000000031'
    ),
    'future source was not retired'
  );

  insert into test_results values (
    9,
    'FUTURE FIRST PUBLICATION',
    'PASS',
    v_result::text
  );
end;
$test$;

do $test$
declare
  v_inherited_bank_id uuid;
  v_result jsonb;
begin
  select placement_row.bank_item_id
  into v_inherited_bank_id
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = '40000000-0000-4000-8000-000000000032'
    and placement_row.placement_type = 'faixa'
    and placement_row.slot_position = 1;

  v_result := public.apply_matchday_live_layout_movement(
    '40000000-0000-4000-8000-000000000032',
    'place',
    '50000000-0000-4000-8000-000000000032',
    'faixa',
    null,
    1,
    v_inherited_bank_id,
    false
  );

  perform pg_temp.assert_true(
    (select bank_item_id = '50000000-0000-4000-8000-000000000032'
     from public.matchday_live_layout_placements
     where matchday_id = '40000000-0000-4000-8000-000000000032'
       and placement_type = 'faixa'
       and slot_position = 1),
    'movement did not replace target placement'
  );
  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory
      where matchday_id = '40000000-0000-4000-8000-000000000032'
        and bank_item_id = v_inherited_bank_id
        and memory_kind = 'displaced'
    ),
    'displaced memory was not recorded'
  );

  insert into test_results values (
    10,
    'MOVEMENT / DISPLACED',
    'PASS',
    v_result::text
  );
end;
$test$;

-- Execute the production deferred drift guard before certifying queue=0.
set constraints all immediate;

do $test$
begin
  perform pg_temp.assert_true(
    (select authority_mode = 'authoritative'
     from jornada_private.matchday_live_layout_cutover_control
     where scope = 'live_layout'),
    'authority mode changed'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from jornada_private.matchday_live_layout_placement_shadow_sync_queue
    ),
    'shadow queue is not empty'
  );
  perform pg_temp.assert_true(
    (select condeferrable and condeferred
     from pg_catalog.pg_constraint
     where conname = 'matchday_live_layout_placements_matchday_bank_key'),
    'transversal UNIQUE changed'
  );
end;
$test$;

select
  test_number,
  test_name,
  status,
  detail
from test_results
order by test_number;

select
  before_row.surface,
  before_row.hash as hash_before,
  after_row.hash as hash_after,
  before_row.hash = after_row.hash as equal
from target_hash_evidence as before_row
join target_hash_evidence as after_row
  on after_row.checkpoint = 'after_historical_republish'
 and after_row.surface = before_row.surface
where before_row.checkpoint = 'before_historical_republish'
order by before_row.surface;

select
  before_row.payload as transition_before,
  after_row.payload as transition_after,
  before_row.payload = after_row.payload as equal
from transition_evidence as before_row
join transition_evidence as after_row
  on after_row.checkpoint = 'after_historical_republish'
where before_row.checkpoint = 'before_historical_republish';

select
  pg_catalog.current_setting('server_version') as postgres_version,
  (
    select authority_mode
    from jornada_private.matchday_live_layout_cutover_control
    where scope = 'live_layout'
  ) as authority_mode,
  (
    select pg_catalog.count(*)
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
  ) as queue_count,
  (
    select pg_catalog.count(*)
    from public.matchday_editorial_continuity_transitions
    where source_matchday_id =
      '40000000-0000-4000-8000-000000000011'
  ) as original_transition_count;

rollback;
