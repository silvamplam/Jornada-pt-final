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

create function pg_temp.target_live_state_hash(p_matchday_id uuid)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'desk', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.matchday_id),
          '[]'::jsonb
        )
        from public.matchday_editorial_desk_control as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'bank', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_editorial_bank_items as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'placements', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_placements as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'overrides', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_editorial_profile_manual_overrides as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'memory', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.bank_item_id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_bank_item_state_memory as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'zones', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_zones as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'blocks', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_blocks as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'latest', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_latest_news as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'roundup', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
            order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_roundup_items as row_value
        where row_value.matchday_id = p_matchday_id
      )
    )::text
  );
$function$;

create temp table handoff_fixture_items (
  item_kind text primary key,
  article_id uuid not null unique,
  source_bank_item_id uuid,
  classification_key text not null
);

create temp table handoff_results (
  test_number integer primary key,
  test_name text not null,
  status text not null,
  detail text not null
);

insert into jornada_private.matchday_live_layout_cutover_control (
  scope,
  authority_mode
)
values ('live_layout', 'authoritative');

insert into public.countries (id, name, slug)
values (
  '18000000-0000-4000-8000-000000000001',
  'Handoff Country',
  'handoff-country'
);

insert into public.competitions (
  id,
  name,
  slug,
  country,
  country_id
)
values (
  '28000000-0000-4000-8000-000000000001',
  'Handoff Competition',
  'liga-portugal',
  'Handoff Country',
  '18000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '38000000-0000-4000-8000-000000000001',
  '28000000-0000-4000-8000-000000000001',
  'Handoff Season',
  'handoff-season'
);

insert into public.matchdays (id, season_id, number, label)
values
  (
    '48000000-0000-4000-8000-000000000001',
    '38000000-0000-4000-8000-000000000001',
    1,
    'Handoff N'
  ),
  (
    '48000000-0000-4000-8000-000000000002',
    '38000000-0000-4000-8000-000000000001',
    2,
    'Handoff N+1'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '48000000-0000-4000-8000-000000000001',
    '38000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '48000000-0000-4000-8000-000000000002',
    '38000000-0000-4000-8000-000000000001',
    false
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
  thematic_zone_order,
  thematic_zone_layouts,
  thematic_block_order,
  thematic_zone_titles
)
values (
  '48000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  array[
    'benfica',
    'sporting',
    'fc_porto',
    'other_liga_clubs',
    'outside_liga_other'
  ]::text[],
  '{"benfica":"six_news","sporting":"five_news_balanced","fc_porto":"five_news_balanced","other_liga_clubs":"six_news","outside_liga_other":"five_news_secondary"}'::jsonb,
  array[
    'benfica',
    'sporting',
    'fc_porto',
    'other_liga_clubs',
    'outside_liga_other',
    'latest',
    'video'
  ]::text[],
  '{"benfica":"Benfica N","sporting":"Sporting N","fc_porto":"FC Porto N","other_liga_clubs":"Outros N","outside_liga_other":"Fora N"}'::jsonb
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['48000000-0000-4000-8000-000000000001'::uuid]
);

insert into handoff_fixture_items (
  item_kind,
  article_id,
  classification_key
)
values
  ('NOVA', '58000000-0000-4000-8000-000000000001', 'benfica'),
  ('FAIXA', '58000000-0000-4000-8000-000000000002', 'sporting'),
  ('DESALOJADA', '58000000-0000-4000-8000-000000000003', 'fc_porto'),
  ('BANCO', '58000000-0000-4000-8000-000000000004', 'other_liga_clubs'),
  ('OPENING', '58000000-0000-4000-8000-000000000005', 'outside_liga_other'),
  ('ZONE', '58000000-0000-4000-8000-000000000006', 'benfica'),
  ('SELECTION', '58000000-0000-4000-8000-000000000007', 'sporting'),
  ('VIDEO_HIGHLIGHT', '58000000-0000-4000-8000-000000000008', 'fc_porto'),
  ('LEGACY_UNKNOWN', '58000000-0000-4000-8000-000000000009', 'other_liga_clubs'),
  ('ARCHIVED', '58000000-0000-4000-8000-000000000010', 'outside_liga_other');

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
  'Handoff ' || fixture.item_kind,
  'handoff-' || pg_catalog.lower(fixture.item_kind),
  'published',
  'matchday',
  fixture.item_kind,
  'Handoff fixture ' || fixture.item_kind,
  'Body must never be copied into the continuity reader',
  'https://example.test/handoff-' || fixture.item_kind || '.jpg',
  '2026-09-02T15:00:00Z'::timestamptz,
  '28000000-0000-4000-8000-000000000001',
  '38000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000001'
from handoff_fixture_items as fixture;

update handoff_fixture_items as fixture
set source_bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '48000000-0000-4000-8000-000000000001'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      fixture.article_id::text;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 10
   from handoff_fixture_items
   where source_bank_item_id is not null),
  'fixture did not create ten contextual Bank participations'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  array(
    select fixture.source_bank_item_id
    from handoff_fixture_items as fixture
    order by fixture.source_bank_item_id
  )
);

update public.matchday_editorial_bank_items as bank_row
set classification_key = fixture.classification_key,
    classification_source = 'manual',
    classified_at = '2026-09-02T15:05:00Z'::timestamptz
from handoff_fixture_items as fixture
where bank_row.id = fixture.source_bank_item_id;

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  array(
    select fixture.source_bank_item_id
    from handoff_fixture_items as fixture
    order by fixture.source_bank_item_id
  )
);

update public.matchday_editorial_bank_items as bank_row
set status = 'archived'
from handoff_fixture_items as fixture
where fixture.item_kind = 'ARCHIVED'
  and bank_row.id = fixture.source_bank_item_id;

insert into public.matchday_editorial_profile_manual_overrides (
  matchday_id,
  profile_key,
  source_type,
  source_id,
  placement_target,
  zone_key,
  sort_order
)
select
  '48000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  'editorial_article',
  fixture.article_id::text,
  'bank',
  null,
  null
from handoff_fixture_items as fixture
where fixture.item_kind = 'BANCO';

insert into public.matchday_live_layout_bank_item_state_memory (
  matchday_id,
  bank_item_id,
  memory_kind,
  recorded_at
)
select
  '48000000-0000-4000-8000-000000000001',
  fixture.source_bank_item_id,
  case fixture.item_kind
    when 'DESALOJADA' then 'displaced'
    else 'legacy_unknown'
  end,
  case fixture.item_kind
    when 'DESALOJADA' then '2026-09-02T15:10:00Z'::timestamptz
    else '2026-09-02T15:11:00Z'::timestamptz
  end
from handoff_fixture_items as fixture
where fixture.item_kind in ('DESALOJADA', 'LEGACY_UNKNOWN');

insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '48000000-0000-4000-8000-000000000001',
  fixture.source_bank_item_id,
  placement.placement_type,
  case
    when placement.placement_type = 'zone' then zone_projection.zone_id
  end,
  placement.slot_position
from handoff_fixture_items as fixture
join (values
  ('FAIXA'::text, 'faixa'::text, 4),
  ('OPENING'::text, 'opening'::text, 1),
  ('ZONE'::text, 'zone'::text, 3),
  ('SELECTION'::text, 'selection'::text, 2),
  ('VIDEO_HIGHLIGHT'::text, 'video_highlight'::text, 1)
) as placement(item_kind, placement_type, slot_position)
  on placement.item_kind = fixture.item_kind
left join jornada_private.matchday_live_layout_zone_legacy_projection
  as zone_projection
  on placement.placement_type = 'zone'
 and zone_projection.matchday_id =
     '48000000-0000-4000-8000-000000000001'
 and zone_projection.legacy_zone_key = 'benfica';

select jornada_private.project_matchday_live_layout_placements_to_legacy(
  array['48000000-0000-4000-8000-000000000001'::uuid]
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
  '68000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000001',
  '15:20',
  'Handoff Latest',
  'Latest remains live',
  'https://example.test/handoff-latest',
  'https://example.test/handoff-latest.jpg',
  7,
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
  '68000000-0000-4000-8000-000000000002',
  '48000000-0000-4000-8000-000000000001',
  'Roundup',
  'Handoff Roundup',
  'Roundup remains live',
  'https://example.test/handoff-roundup.jpg',
  'https://example.test/handoff-roundup.mp4',
  'resumo',
  9,
  'published'
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
  '78000000-0000-4000-8000-000000000001',
  '48000000-0000-4000-8000-000000000001',
  'draft',
  false,
  'Handoff trigger composition',
  'hierarchical',
  'Historical editorial',
  'Historical excerpt',
  'Historical text',
  'Historical author',
  '#123456',
  'Historical Zone 1',
  'Historical Zone 2',
  '["opening","zone_1","zone_2","video","beyond"]'::jsonb,
  1
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
  ('79000000-0000-4000-8000-' ||
    pg_catalog.lpad(position::text, 12, '0'))::uuid,
  '78000000-0000-4000-8000-000000000001',
  slot_key,
  fixture.source_bank_item_id,
  'historical-slot-' || position::text,
  'Historical',
  'Historical slot ' || position::text,
  'Historical slot subtitle ' || position::text,
  'https://example.test/historical-slot-' || position::text || '.jpg',
  'https://example.test/historical-slot-' || position::text
from (values
  (1, 'dominant_main'::text, 'OPENING'::text),
  (2, 'other_chronicle_1'::text, 'ZONE'::text),
  (3, 'other_chronicle_2'::text, 'SELECTION'::text),
  (4, 'other_chronicle_3'::text, 'VIDEO_HIGHLIGHT'::text)
) as slot(position, slot_key, item_kind)
join handoff_fixture_items as fixture
  on fixture.item_kind = slot.item_kind;

insert into public.matchday_historical_composition_zones (
  id,
  composition_id,
  sort_order,
  public_title,
  visual_family
)
values (
  '7a000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001',
  1,
  'Historical-only zone',
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
  ('7b000000-0000-4000-8000-' ||
    pg_catalog.lpad(position::text, 12, '0'))::uuid,
  '78000000-0000-4000-8000-000000000001',
  '7a000000-0000-4000-8000-000000000001',
  position,
  fixture.source_bank_item_id,
  'historical-zone-' || position::text,
  'Historical',
  'Historical zone item ' || position::text,
  'Historical zone subtitle ' || position::text,
  'https://example.test/historical-zone-' || position::text || '.jpg',
  'https://example.test/historical-zone-' || position::text
from (values
  (1, 'NOVA'::text),
  (2, 'FAIXA'::text),
  (3, 'DESALOJADA'::text),
  (4, 'BANCO'::text),
  (5, 'OPENING'::text)
) as historical_item(position, item_kind)
join handoff_fixture_items as fixture
  on fixture.item_kind = historical_item.item_kind;

insert into public.matchday_reference_composition_items (
  id,
  composition_id,
  slot_type,
  source_type,
  source_id,
  sort_order,
  label_snapshot,
  title_snapshot,
  subtitle_snapshot,
  image_url_snapshot,
  link_url_snapshot,
  status
)
values (
  '7c000000-0000-4000-8000-000000000001',
  '78000000-0000-4000-8000-000000000001',
  'custom_card',
  'manual_link',
  null,
  1,
  'Historical only',
  'HISTORICAL-ONLY',
  'Must not enter the next live desk',
  'https://example.test/historical-only.jpg',
  'https://example.test/historical-only',
  'published'
);

-- Guard de consistÃªncia: uma participaÃ§Ã£o archived nÃ£o pode conservar
-- placement autoritativo no instante do handoff.
insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '48000000-0000-4000-8000-000000000001',
  fixture.source_bank_item_id,
  'faixa',
  null,
  8
from handoff_fixture_items as fixture
where fixture.item_kind = 'ARCHIVED';

do $inactive_placement_guard$
declare
  v_error text;
begin
  begin
    perform public.publish_matchday_reference_composition(
      '48000000-0000-4000-8000-000000000001',
      '78000000-0000-4000-8000-000000000001'
    );

    raise exception 'fixture-expected-inactive-placement-guard';
  exception
    when others then
      v_error := sqlerrm;
  end;

  perform pg_temp.assert_true(
    v_error = 'matchday-live-continuity-source-placement-inactive',
    'archived placement did not fail closed with the inactive-placement guard: ' ||
      coalesce(v_error, '<null>')
  );

  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_editorial_continuity_transitions
      where source_matchday_id =
            '48000000-0000-4000-8000-000000000001'
         or target_matchday_id =
            '48000000-0000-4000-8000-000000000002'
    )
    and exists (
      select 1
      from public.matchday_reference_compositions
      where id = '78000000-0000-4000-8000-000000000001'
        and matchday_id =
            '48000000-0000-4000-8000-000000000001'
        and status = 'draft'
        and is_current = false
    )
    and not exists (
      select 1
      from public.matchday_editorial_bank_items
      where matchday_id =
            '48000000-0000-4000-8000-000000000002'
    ),
    'failed inactive-placement handoff left partial target or transition state'
  );
end;
$inactive_placement_guard$;

delete from public.matchday_live_layout_placements as placement_row
using handoff_fixture_items as fixture
where fixture.item_kind = 'ARCHIVED'
  and placement_row.matchday_id =
      '48000000-0000-4000-8000-000000000001'
  and placement_row.bank_item_id = fixture.source_bank_item_id
  and placement_row.placement_type = 'faixa'
  and placement_row.slot_position = 8;
do $test$
declare
  v_result jsonb;
begin
  v_result := public.publish_matchday_reference_composition(
    '48000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'first_publication'
      and (v_result ->> 'carryoverApplied')::boolean
      and (v_result ->> 'materialized')::boolean
      and (v_result ->> 'sourceRetired')::boolean
      and (v_result ->> 'inheritedBankCount')::integer = 9,
    'first publication did not hand off all nine active Bank items'
  );

  insert into handoff_results values (
    1,
    'FIRST PUBLICATION COMPLETE UNIVERSE',
    'PASS',
    v_result::text
  );
end;
$test$;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 9
   from handoff_fixture_items as fixture
   join public.matchday_editorial_bank_items as target_bank
     on target_bank.matchday_id =
        '48000000-0000-4000-8000-000000000002'
    and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
        'editorial_article'
    and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
        fixture.article_id::text
   where fixture.item_kind <> 'ARCHIVED'
     and target_bank.id <> fixture.source_bank_item_id
     and target_bank.continuity_source_matchday_id =
         '48000000-0000-4000-8000-000000000001'
     and target_bank.continuity_source_composition_id =
         '78000000-0000-4000-8000-000000000001'
     and not target_bank.automatic_eligible
     and target_bank.classification_key = fixture.classification_key
     and target_bank.classification_source = 'continuity_assisted'
     and target_bank.classified_at is not null),
  'target Bank identity provenance or classification is incomplete'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_editorial_bank_items as target_bank
    join handoff_fixture_items as fixture
      on target_bank.source_id = fixture.article_id::text
    where target_bank.matchday_id =
          '48000000-0000-4000-8000-000000000002'
      and fixture.item_kind = 'ARCHIVED'
  ),
  'archived source participation followed the handoff'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_editorial_bank_items as target_bank
    where target_bank.matchday_id =
          '48000000-0000-4000-8000-000000000002'
      and pg_catalog.lower(pg_catalog.btrim(target_bank.link_url)) =
          'https://example.test/historical-only'
  ),
  'HISTORICAL-ONLY composition item became live Bank content'
);

insert into handoff_results values (
  2,
  'ACTIVE BANK NOT HISTORICAL COMPOSITION',
  'PASS',
  '9 active identities inherited; archived and HISTORICAL-ONLY excluded'
);

select pg_temp.assert_true(
  exists (
    select 1
    from handoff_fixture_items as fixture
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id =
         '48000000-0000-4000-8000-000000000002'
     and target_bank.source_id = fixture.article_id::text
    join public.read_matchday_live_desk_aggregate_tracking(
      '48000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as reader
      on reader.bank_item_id = target_bank.id
    where fixture.item_kind = 'NOVA'
      and reader.editorial_state = 'NOVA'
      and not reader.is_explicit_bank
      and reader.memory_kind is null
      and reader.placement_count = 0
  ),
  'NOVA did not remain NOVA'
);

select pg_temp.assert_true(
  exists (
    select 1
    from handoff_fixture_items as fixture
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id =
         '48000000-0000-4000-8000-000000000002'
     and target_bank.source_id = fixture.article_id::text
    join public.read_matchday_live_desk_aggregate_tracking(
      '48000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as reader
      on reader.bank_item_id = target_bank.id
    where fixture.item_kind = 'FAIXA'
      and reader.editorial_state = 'FAIXA'
      and reader.placement_type = 'faixa'
      and reader.slot_position = 4
  ),
  'FAIXA did not retain its gapped slot position'
);

select pg_temp.assert_true(
  exists (
    select 1
    from handoff_fixture_items as fixture
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id =
         '48000000-0000-4000-8000-000000000002'
     and target_bank.source_id = fixture.article_id::text
    join public.read_matchday_live_desk_aggregate_tracking(
      '48000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as reader
      on reader.bank_item_id = target_bank.id
    where fixture.item_kind = 'DESALOJADA'
      and reader.editorial_state = 'DESALOJADA'
      and reader.memory_kind = 'displaced'
      and reader.placement_count = 0
      and not reader.is_explicit_bank
  ),
  'DESALOJADA did not retain displaced memory on the target identity'
);

select pg_temp.assert_true(
  exists (
    select 1
    from handoff_fixture_items as fixture
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id =
         '48000000-0000-4000-8000-000000000002'
     and target_bank.source_id = fixture.article_id::text
    join public.read_matchday_live_desk_aggregate_tracking(
      '48000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as reader
      on reader.bank_item_id = target_bank.id
    where fixture.item_kind = 'BANCO'
      and reader.is_explicit_bank
      and reader.editorial_state is null
      and reader.memory_kind is null
      and reader.placement_count = 0
  ),
  'BANCO did not remain explicit and separate from tracking'
);

select pg_temp.assert_true(
  exists (
    select 1
    from handoff_fixture_items as fixture
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id =
         '48000000-0000-4000-8000-000000000002'
     and target_bank.source_id = fixture.article_id::text
    join public.read_matchday_live_desk_aggregate_tracking(
      '48000000-0000-4000-8000-000000000002',
      'liga_portugal_v1'
    ) as reader
      on reader.bank_item_id = target_bank.id
    where fixture.item_kind = 'LEGACY_UNKNOWN'
      and reader.editorial_state is null
      and reader.history_unknown
      and reader.memory_kind = 'legacy_unknown'
      and reader.placement_count = 0
  ),
  'LEGACY_UNKNOWN was not preserved neutrally'
);

insert into handoff_results values (
  3,
  'TRACKING BANK AND MEMORY',
  'PASS',
  'NOVA, FAIXA, DESALOJADA, BANCO and LEGACY_UNKNOWN preserved'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 5
   from public.matchday_live_layout_placements
   where matchday_id = '48000000-0000-4000-8000-000000000002'),
  'target placement count changed'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    join handoff_fixture_items as fixture
      on fixture.article_id::text = bank_row.source_id
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as zone_projection
      on zone_projection.matchday_id = placement_row.matchday_id
     and zone_projection.zone_id = placement_row.zone_id
    where placement_row.matchday_id =
          '48000000-0000-4000-8000-000000000002'
      and fixture.item_kind = 'ZONE'
      and placement_row.placement_type = 'zone'
      and placement_row.slot_position = 3
      and zone_projection.legacy_zone_key = 'benfica'
  ),
  'ZONE semantic identity or gap was not preserved'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000002'
      and placement_type = 'faixa'
      and slot_position between 1 and 3
  ) and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as zone_projection
      on zone_projection.matchday_id = placement_row.matchday_id
     and zone_projection.zone_id = placement_row.zone_id
    where placement_row.matchday_id =
          '48000000-0000-4000-8000-000000000002'
      and placement_row.placement_type = 'zone'
      and zone_projection.legacy_zone_key = 'benfica'
      and placement_row.slot_position between 1 and 2
  ),
  'Faixa or zone gaps were compacted'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 4
   from handoff_fixture_items as fixture
   join public.matchday_editorial_bank_items as target_bank
     on target_bank.matchday_id =
        '48000000-0000-4000-8000-000000000002'
    and target_bank.source_id = fixture.article_id::text
   join public.matchday_live_layout_placements as placement_row
     on placement_row.matchday_id = target_bank.matchday_id
    and placement_row.bank_item_id = target_bank.id
   where (fixture.item_kind, placement_row.placement_type,
          placement_row.slot_position) in (
     ('OPENING', 'opening', 1),
     ('ZONE', 'zone', 3),
     ('SELECTION', 'selection', 2),
     ('VIDEO_HIGHLIGHT', 'video_highlight', 1)
   )),
  'one or more COLOCADA placements changed structural destination'
);

select pg_temp.assert_true(
  not exists (
    select bank_item_id
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000002'
    group by bank_item_id
    having pg_catalog.count(*) > 1
  ),
  'target transversal uniqueness failed'
);

insert into handoff_results values (
  4,
  'PLACEMENTS AND GAPS',
  'PASS',
  'opening/zone/faixa/selection/video exact; gaps and UNIQUE preserved'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from public.matchday_latest_news
   where matchday_id = '48000000-0000-4000-8000-000000000002'
     and title = 'Handoff Latest'
     and sort_order = 7)
  and
  (select pg_catalog.count(*) = 1
   from public.matchday_roundup_items
   where matchday_id = '48000000-0000-4000-8000-000000000002'
     and title = 'Handoff Roundup'
     and sort_order = 9),
  'Latest or Roundup was not preserved'
);

select pg_temp.assert_true(
  (select not is_managed
   from public.matchday_editorial_desk_control
   where matchday_id = '48000000-0000-4000-8000-000000000001')
  and
  (select is_managed
   from public.matchday_editorial_desk_control
   where matchday_id = '48000000-0000-4000-8000-000000000002')
  and not exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = '48000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory
    where matchday_id = '48000000-0000-4000-8000-000000000001'
  ),
  'source retirement or target live switch failed'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from public.matchday_editorial_continuity_transitions
   where source_matchday_id = '48000000-0000-4000-8000-000000000001'
     and target_matchday_id = '48000000-0000-4000-8000-000000000002'
     and source_composition_id = '78000000-0000-4000-8000-000000000001'
     and continuity_version = 6),
  'transition v6 or source_composition_id is invalid'
);

insert into handoff_results values (
  5,
  'AUXILIARY SURFACES TRANSITION AND RETIREMENT',
  'PASS',
  'Latest/Roundup inherited; transition v6 unique; source retired'
);

do $test$
declare
  v_before_hash text;
  v_transition_before jsonb;
  v_draft_id uuid;
  v_result jsonb;
begin
  v_before_hash := pg_temp.target_live_state_hash(
    '48000000-0000-4000-8000-000000000002'
  );

  select pg_catalog.to_jsonb(transition_row)
  into v_transition_before
  from public.matchday_editorial_continuity_transitions as transition_row
  where transition_row.source_matchday_id =
        '48000000-0000-4000-8000-000000000001';

  v_draft_id := public.reopen_matchday_reference_composition(
    '48000000-0000-4000-8000-000000000001',
    '78000000-0000-4000-8000-000000000001'
  );

  update public.matchday_reference_compositions
  set internal_name = 'Historical republish must not hand off again'
  where id = v_draft_id;

  v_result := public.publish_matchday_reference_composition(
    '48000000-0000-4000-8000-000000000001',
    v_draft_id
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'historical_republish'
      and not (v_result ->> 'carryoverApplied')::boolean
      and not (v_result ->> 'materialized')::boolean
      and (v_result ->> 'transitionPreserved')::boolean,
    'historical republish selected continuity'
  );

  perform pg_temp.assert_true(
    pg_temp.target_live_state_hash(
      '48000000-0000-4000-8000-000000000002'
    ) = v_before_hash,
    'historical republish changed the target live desk'
  );

  perform pg_temp.assert_true(
    (select pg_catalog.to_jsonb(transition_row) = v_transition_before
     from public.matchday_editorial_continuity_transitions as transition_row
     where transition_row.source_matchday_id =
           '48000000-0000-4000-8000-000000000001'),
    'historical republish rewrote the original transition certificate'
  );

  insert into handoff_results values (
    6,
    'HISTORICAL REPUBLISH ISOLATION',
    'PASS',
    'target full-state hash and original transition remain byte-logically equal'
  );
end;
$test$;

select test_number, test_name, status, detail
from handoff_results
order by test_number;

select
  state_key,
  pg_catalog.count(*) as item_count
from (
  select
    case
      when reader.is_explicit_bank then 'BANCO'
      when reader.history_unknown then 'LEGACY_UNKNOWN'
      else reader.editorial_state
    end as state_key
  from public.read_matchday_live_desk_aggregate_tracking(
    '48000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) as reader
) as target_state
group by state_key
order by state_key;


-- ============================================================
-- POSTCONDITIONS DE MIGRATION 7B
-- ============================================================

select pg_temp.assert_true(
  not exists (
    select 1
    from (values
      ('matchday_editorial_bank_items'),
      ('matchday_live_layout_placements'),
      ('matchday_editorial_profile_manual_overrides'),
      ('matchday_live_layout_bank_item_state_memory'),
      ('matchday_latest_news'),
      ('matchday_roundup_items'),
      ('matchday_editorial_desk_control'),
      ('matchday_editorial_profile_reconcile_control'),
      ('matchday_editorial_profile_assignments'),
      ('matchday_live_layout_zones'),
      ('matchday_live_layout_blocks'),
      ('editorial_articles'),
      ('editorial_contents')
    ) as target(table_name)
    left join pg_class class_row
      on class_row.relname = target.table_name
    left join pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
     and namespace_row.nspname = 'public'
    left join pg_trigger trigger_row
      on trigger_row.tgrelid = class_row.oid
     and trigger_row.tgname = 'matchday_live_desk_handoff_writer_fence'
    where class_row.oid is null
       or namespace_row.oid is null
       or trigger_row.oid is null
  ),
  'all 13 handoff fence surfaces (11 live desks + articles + contents) were created on expected tables'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from (values
      ('matchday_editorials'),
      ('matchday_highlights'),
      ('matchday_horizontal_news'),
      ('matchday_live_layout_items'),
      ('matchday_editorial_profile_zone_items')
    ) as legacy(table_name)
    join pg_class class_row
      on class_row.relname = legacy.table_name
    join pg_namespace namespace_row
      on namespace_row.oid = class_row.relnamespace
     and namespace_row.nspname = 'public'
    join pg_trigger trigger_row
      on trigger_row.tgrelid = class_row.oid
     and trigger_row.tgname = 'matchday_live_desk_handoff_writer_fence'
  ),
  'legacy tables kept without duplicated matchday_live_desk_handoff_writer_fence trigger'
);
rollback;
