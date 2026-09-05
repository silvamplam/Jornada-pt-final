\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after migrations through v18. All fixture data and
-- failure-injection triggers are transaction-local and rolled back.
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

create temp table carryover_v18_results (
  test_number integer primary key,
  test_name text unique not null,
  status text not null check (status = 'PASS')
);

insert into jornada_private.matchday_live_layout_cutover_control (
  scope,
  authority_mode
)
values ('live_layout', 'authoritative')
on conflict (scope) do update
set authority_mode = excluded.authority_mode;

insert into public.countries (id, name, slug)
values (
  '8c000000-0000-4000-8000-000000000010',
  'Carryover V18 Country',
  'carryover-v18-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  '8c000000-0000-4000-8000-000000000020',
  'Carryover V18 Competition',
  'liga-portugal',
  'Carryover V18 Country',
  '8c000000-0000-4000-8000-000000000010'
);

insert into public.seasons (id, competition_id, label)
values
  (
    '8c000000-0000-4000-8000-000000000030',
    '8c000000-0000-4000-8000-000000000020',
    'Carryover V18 2026/27'
  ),
  (
    '8c000000-0000-4000-8000-000000000031',
    '8c000000-0000-4000-8000-000000000020',
    'Carryover V18 rollback 2026/27'
  );

insert into public.matchdays (id, season_id, number, label)
values
  (
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000030',
    1,
    'Carryover V18 source seven'
  ),
  (
    '8c000000-0000-4000-8000-000000000002',
    '8c000000-0000-4000-8000-000000000030',
    2,
    'Carryover V18 target seven'
  ),
  (
    '8c000000-0000-4000-8000-000000000003',
    '8c000000-0000-4000-8000-000000000031',
    3,
    'Carryover V18 source rollback'
  ),
  (
    '8c000000-0000-4000-8000-000000000004',
    '8c000000-0000-4000-8000-000000000031',
    4,
    'Carryover V18 target rollback'
  );

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values
  ('8c000000-0000-4000-8000-000000000001', 'liga_portugal_v1'),
  ('8c000000-0000-4000-8000-000000000003', 'liga_portugal_v1');

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
values
  (
    '8c000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"Porto","other_liga_clubs":"Liga","outside_liga_other":"Exterior"}'::jsonb
  ),
  (
    '8c000000-0000-4000-8000-000000000003',
    'liga_portugal_v1',
    '{"benfica":"Benfica R","sporting":"Sporting R","fc_porto":"Porto R","other_liga_clubs":"Liga R","outside_liga_other":"Exterior R"}'::jsonb
  );

select jornada_private.sync_matchday_live_layout_shadow(array[
  '8c000000-0000-4000-8000-000000000001'::uuid,
  '8c000000-0000-4000-8000-000000000003'::uuid
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
    '8c000000-0000-4000-8000-000000000061',
    '8c000000-0000-4000-8000-000000000001',
    'Zona Física Seis',
    'six_news'
  ),
  (
    '8c000000-0000-4000-8000-000000000062',
    '8c000000-0000-4000-8000-000000000001',
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
values
  (
    '8c000000-0000-4000-8000-000000000071',
    '8c000000-0000-4000-8000-000000000001',
    'zone',
    '8c000000-0000-4000-8000-000000000061',
    20
  ),
  (
    '8c000000-0000-4000-8000-000000000072',
    '8c000000-0000-4000-8000-000000000001',
    'zone',
    '8c000000-0000-4000-8000-000000000062',
    21
  );

update public.matchday_live_layout_blocks
set sort_order = sort_order + 100
where matchday_id = '8c000000-0000-4000-8000-000000000001';

update public.matchday_live_layout_blocks as block_row
set sort_order = case
  when block_row.zone_id = '8c000000-0000-4000-8000-000000000061' then 1
  when block_row.block_type = 'latest' then 2
  when projection_row.legacy_zone_key = 'benfica' then 3
  when projection_row.legacy_zone_key = 'other_liga_clubs' then 4
  when projection_row.legacy_zone_key = 'sporting' then 5
  when projection_row.legacy_zone_key = 'fc_porto' then 6
  when projection_row.legacy_zone_key = 'outside_liga_other' then 7
  when block_row.block_type = 'video' then 8
  when block_row.zone_id = '8c000000-0000-4000-8000-000000000062' then 9
end
from (
  select null::uuid as zone_id, null::text as legacy_zone_key
  union all
  select projection_row.zone_id, projection_row.legacy_zone_key
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
  where projection_row.matchday_id =
        '8c000000-0000-4000-8000-000000000001'
) as projection_row
where block_row.matchday_id =
      '8c000000-0000-4000-8000-000000000001'
  and (
    projection_row.zone_id = block_row.zone_id
    or (
      projection_row.zone_id is null
      and (
        block_row.block_type in ('latest', 'video')
        or block_row.zone_id in (
          '8c000000-0000-4000-8000-000000000061'::uuid,
          '8c000000-0000-4000-8000-000000000062'::uuid
        )
      )
    )
  );

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
    '8c000000-0000-4000-8000-000000000001',
    8,
    '#123456',
    'four_news',
    'Últimas Sete',
    true,
    'editorial_line',
    '#ABCDEF'
  ),
  (
    '8c000000-0000-4000-8000-000000000003',
    5,
    '#654321',
    'top',
    'Últimas Rollback',
    true,
    'latest_news',
    '#FEDCBA'
  );

insert into jornada_private.matchday_live_layout_physical_cutovers (
  matchday_id,
  profile_key
)
values
  ('8c000000-0000-4000-8000-000000000001', 'liga_portugal_v1'),
  ('8c000000-0000-4000-8000-000000000003', 'liga_portugal_v1');

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000030',
    true
  ),
  (
    '8c000000-0000-4000-8000-000000000003',
    '8c000000-0000-4000-8000-000000000031',
    true
  );

-- Canonical articles exist only to make the ordinary Latest synchronizer's
-- provenance check observable. The historical composition does not filter
-- this set.
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
select
  ('8c000000-0000-4000-8000-' || pg_catalog.lpad(item_no::text, 12, '0'))::uuid,
  'Carryover article ' || item_no,
  'carryover-v18-' || item_no,
  'published',
  'matchday',
  'TESTE ' || item_no,
  'Subtitle ' || item_no,
  'Body ' || item_no,
  'Author ' || item_no,
  '2026-09-05 12:00:00+00'::timestamptz + item_no * interval '1 minute',
  '8c000000-0000-4000-8000-000000000020'::uuid,
  case when item_no <= 113
    then '8c000000-0000-4000-8000-000000000030'::uuid
    else '8c000000-0000-4000-8000-000000000031'::uuid end,
  case when item_no <= 13
    then '8c000000-0000-4000-8000-000000000001'::uuid
    else '8c000000-0000-4000-8000-000000000003'::uuid end
from pg_catalog.generate_series(101, 114) as item_row(item_no);

select jornada_private.begin_matchday_live_layout_downstream_v14(
  '8c000000-0000-4000-8000-000000000001'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  pg_catalog.array_agg(
    ('8c000000-0000-4000-8000-' ||
      pg_catalog.lpad(item_no::text, 12, '0'))::uuid
    order by item_no
  )
)
from pg_catalog.generate_series(201, 213) as item_row(item_no);

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
  source_slug,
  origin_slot_type,
  sort_order,
  status,
  automatic_eligible,
  editorially_worked_at,
  classification_key,
  classification_source,
  classified_at
)
select
  ('8c000000-0000-4000-8000-' ||
    pg_catalog.lpad((200 + ordinal_no)::text, 12, '0'))::uuid,
  '8c000000-0000-4000-8000-000000000001'::uuid,
  'TESTE ' || (100 + ordinal_no),
  'Carryover article ' || (100 + ordinal_no),
  'Subtitle ' || (100 + ordinal_no),
  'https://example.test/' || (100 + ordinal_no) || '.jpg',
  '/noticias/carryover-v18-' || (100 + ordinal_no),
  'editorial_article',
  ('8c000000-0000-4000-8000-' ||
    pg_catalog.lpad((100 + ordinal_no)::text, 12, '0'))::uuid::text,
  'carryover-v18-' || (100 + ordinal_no),
  'fixture',
  ordinal_no,
  case when ordinal_no = 13 then 'archived' else 'active' end,
  false,
  case when ordinal_no = 9 then null
    else '2026-09-05 12:30:00+00'::timestamptz +
         ordinal_no * interval '1 minute' end,
  case ordinal_no
    when 1 then 'sporting'
    when 2 then 'benfica'
    when 3 then 'outside_liga_other'
    when 10 then 'fc_porto'
    else null
  end,
  case when ordinal_no in (1, 2, 3, 10) then 'manual' else null end,
  case when ordinal_no in (1, 2, 3, 10)
    then '2026-09-05 12:20:00+00'::timestamptz +
         ordinal_no * interval '1 minute'
    else null end
from pg_catalog.generate_series(1, 13) as item_row(ordinal_no);

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  pg_catalog.array_agg(
    ('8c000000-0000-4000-8000-' ||
      pg_catalog.lpad(item_no::text, 12, '0'))::uuid
    order by item_no
  )
)
from pg_catalog.generate_series(201, 213) as item_row(item_no);

insert into public.matchday_live_layout_placements (
  id,
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '8c000000-0000-4000-8000-000000000301',
  '8c000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000201',
  'zone',
  projection_row.zone_id,
  2
from jornada_private.matchday_live_layout_zone_legacy_projection
  as projection_row
where projection_row.matchday_id =
      '8c000000-0000-4000-8000-000000000001'
  and projection_row.legacy_zone_key = 'benfica';

insert into public.matchday_live_layout_placements (
  id, matchday_id, bank_item_id, placement_type, zone_id, slot_position
)
values
  (
    '8c000000-0000-4000-8000-000000000302',
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000202',
    'zone',
    '8c000000-0000-4000-8000-000000000061',
    5
  ),
  (
    '8c000000-0000-4000-8000-000000000303',
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000203',
    'zone',
    '8c000000-0000-4000-8000-000000000062',
    4
  ),
  (
    '8c000000-0000-4000-8000-000000000304',
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000204',
    'opening',
    null,
    1
  ),
  (
    '8c000000-0000-4000-8000-000000000305',
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000205',
    'faixa',
    null,
    1
  ),
  (
    '8c000000-0000-4000-8000-000000000306',
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000206',
    'faixa',
    null,
    4
  ),
  (
    '8c000000-0000-4000-8000-000000000307',
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000207',
    'selection',
    null,
    3
  ),
  (
    '8c000000-0000-4000-8000-000000000308',
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000208',
    'video_highlight',
    null,
    1
  );

insert into public.matchday_editorial_profile_manual_overrides (
  matchday_id,
  profile_key,
  source_type,
  source_id,
  placement_target,
  zone_key,
  sort_order
)
values (
  '8c000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  'editorial_article',
  '8c000000-0000-4000-8000-000000000110',
  'bank',
  null,
  null
);

insert into public.matchday_live_layout_bank_item_state_memory (
  matchday_id,
  bank_item_id,
  memory_kind,
  recorded_at
)
values
  (
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000211',
    'displaced',
    '2026-09-04 10:00:00+00'
  ),
  (
    '8c000000-0000-4000-8000-000000000001',
    '8c000000-0000-4000-8000-000000000212',
    'legacy_unknown',
    '2026-09-01 09:00:00+00'
  );

insert into public.matchday_latest_news (
  id,
  matchday_id,
  time_label,
  time_label_color,
  title,
  subtitle,
  link_url,
  image_url,
  sort_order,
  status
)
values
  (
    '8c000000-0000-4000-8000-000000000401',
    '8c000000-0000-4000-8000-000000000001',
    '12:01 · TESTE 101',
    '#111111',
    'Carryover article 101',
    'Subtitle 101',
    '/noticias/carryover-v18-101',
    'https://example.test/101.jpg',
    2,
    'published'
  ),
  (
    '8c000000-0000-4000-8000-000000000402',
    '8c000000-0000-4000-8000-000000000001',
    '12:09 · TESTE 109',
    '#222222',
    'Carryover article 109',
    'Subtitle 109',
    '/noticias/carryover-v18-109',
    'https://example.test/109.jpg',
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
  duration,
  type,
  sort_order,
  status,
  youtube_video_id,
  youtube_channel_id,
  is_embeddable
)
values
  (
    '8c000000-0000-4000-8000-000000000501',
    '8c000000-0000-4000-8000-000000000001',
    'Resumo',
    'Roundup um',
    'Resumo integral um',
    'https://example.test/r1.jpg',
    'https://example.test/r1.mp4',
    '02:30',
    'resumo',
    1,
    'published',
    'video-1',
    'channel-1',
    true
  ),
  (
    '8c000000-0000-4000-8000-000000000502',
    '8c000000-0000-4000-8000-000000000001',
    'Golos',
    'Roundup dois',
    'Resumo integral dois',
    'https://example.test/r2.jpg',
    'https://example.test/r2.mp4',
    '03:10',
    'golos',
    3,
    'draft',
    'video-2',
    'channel-2',
    false
  );

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
  source_id
)
values (
  '8c000000-0000-4000-8000-000000000601',
  '8c000000-0000-4000-8000-000000000001',
  'headline',
  '8c000000-0000-4000-8000-000000000104',
  'TESTE 104',
  'Carryover article 104',
  'Subtitle 104',
  'https://example.test/104.jpg',
  '/noticias/carryover-v18-104',
  'editorial_article',
  '8c000000-0000-4000-8000-000000000104'
);

select jornada_private.project_matchday_live_layout_placements_downstream_v14(
  '8c000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

update public.matchday_editorials
set below_headline_mode = 'highlights',
    complementary_roundup_item_id =
      '8c000000-0000-4000-8000-000000000501',
    complementary_text_color = '#121212',
    roundup_video_heading = 'Vídeos da Jornada',
    roundup_video_heading_color = '#343434',
    below_headline_heading = 'Em destaque',
    below_headline_heading_color = '#565656',
    below_headline_subtitle = 'Subtítulo funcional',
    side_block_title_color = '#787878',
    side_block_author = 'Autor preservado'
where matchday_id = '8c000000-0000-4000-8000-000000000001';

select jornada_private.assert_matchday_live_layout_downstream_v14(
  '8c000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

select jornada_private.end_matchday_live_layout_downstream_v14(
  '8c000000-0000-4000-8000-000000000001'
);

-- Smaller source used for rollback, fail-closed and retry proofs.
select jornada_private.begin_matchday_live_layout_downstream_v14(
  '8c000000-0000-4000-8000-000000000003'
);

-- Works both with the complete baseline trigger and with the local-only
-- article-to-Bank helper used by this disposable PG17 cluster.
create temp table rollback_source_bank as
select public.upsert_matchday_editorial_bank_publication(
  '8c000000-0000-4000-8000-000000000003',
  'editorial_article',
  '8c000000-0000-4000-8000-000000000114',
  'carryover-v18-114',
  'TESTE 114',
  'Carryover article 114',
  'Subtitle 114',
  null,
  '/noticias/carryover-v18-114'
) as bank_item_id;

update public.matchday_editorial_bank_items
set status = 'archived'
where matchday_id = '8c000000-0000-4000-8000-000000000003'
  and id <> (select bank_item_id from rollback_source_bank);

update public.matchday_editorial_bank_items
set automatic_eligible = false,
    origin_slot_type = 'fixture',
    sort_order = 1,
    editorially_worked_at = '2026-09-05 13:00:00+00'
where id = (select bank_item_id from rollback_source_bank);

insert into public.matchday_live_layout_placements (
  id,
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '8c000000-0000-4000-8000-000000000314',
  '8c000000-0000-4000-8000-000000000003',
  bank_item_id,
  'opening',
  null,
  1
from rollback_source_bank;

select jornada_private.project_matchday_live_layout_placements_downstream_v14(
  '8c000000-0000-4000-8000-000000000003',
  'liga_portugal_v1'
);

select jornada_private.end_matchday_live_layout_downstream_v14(
  '8c000000-0000-4000-8000-000000000003'
);

insert into public.matchday_reference_compositions (
  id,
  matchday_id,
  status,
  is_current,
  internal_name,
  published_at
)
values
  (
    '8c000000-0000-4000-8000-000000000701',
    '8c000000-0000-4000-8000-000000000001',
    'published',
    true,
    'Carryover provenance seven',
    '2026-09-05 14:00:00+00'
  ),
  (
    '8c000000-0000-4000-8000-000000000702',
    '8c000000-0000-4000-8000-000000000003',
    'published',
    true,
    'Carryover provenance rollback',
    '2026-09-05 14:10:00+00'
  );

create temp table topology_seven as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  '8c000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000002'
);

create temp table topology_rollback as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  '8c000000-0000-4000-8000-000000000003',
  '8c000000-0000-4000-8000-000000000004'
);

create temp table rollback_topology_before as
select
  jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000003'
  ) as source_hash,
  jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000004'
  ) as target_content_hash,
  workspace_row.state_token
from public.read_matchday_live_layout_workspace_v13(
  '8c000000-0000-4000-8000-000000000004',
  'liga_portugal_v1'
) as workspace_row;

create temp table seven_before as
select
  jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000001'
  ) as source_hash,
  workspace_row.state_token
from public.read_matchday_live_layout_workspace_v13(
  '8c000000-0000-4000-8000-000000000002',
  'liga_portugal_v1'
) as workspace_row;

create temp table seven_result as
select *
from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
  '8c000000-0000-4000-8000-000000000001',
  '8c000000-0000-4000-8000-000000000002',
  '8c000000-0000-4000-8000-000000000701',
  (select topology_transition_id from topology_seven)
);

select pg_temp.assert_true(
  (select inherited_bank_count = 12
      and inherited_placement_count = 8
      and inherited_explicit_bank_count = 1
      and inherited_memory_count = 2
      and inherited_latest_count = 2
      and inherited_roundup_count = 2
      and inherited_functional_layout_item_count = 1
   from seven_result),
  'carryover certificate counts do not match the complete source state'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 12
   from jornada_private.matchday_live_layout_physical_bank_maps
   where carryover_id = (select carryover_id from seven_result))
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps
    where carryover_id = (select carryover_id from seven_result)
      and source_bank_item_id = target_bank_item_id
  ),
  'Bank map is incomplete or reused source UUIDs'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_editorial_bank_items
    where matchday_id = '8c000000-0000-4000-8000-000000000002'
      and source_id = '8c000000-0000-4000-8000-000000000113'
  ),
  'archived Bank participation was carried'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements as target_placement
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.target_bank_item_id = target_placement.bank_item_id
     and bank_map.carryover_id = (select carryover_id from seven_result)
    join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.target_zone_id = target_placement.zone_id
     and zone_map.topology_transition_id =
         (select topology_transition_id from topology_seven)
    where bank_map.source_bank_item_id =
          '8c000000-0000-4000-8000-000000000202'
      and zone_map.source_zone_id =
          '8c000000-0000-4000-8000-000000000061'
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
     and bank_map.carryover_id = (select carryover_id from seven_result)
    join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.target_zone_id = target_placement.zone_id
     and zone_map.topology_transition_id =
         (select topology_transition_id from topology_seven)
    where bank_map.source_bank_item_id =
          '8c000000-0000-4000-8000-000000000203'
      and zone_map.source_zone_id =
          '8c000000-0000-4000-8000-000000000062'
      and target_placement.slot_position = 4
  ),
  'zone seven placement was not remapped by the physical map'
);

select pg_temp.assert_true(
  (select pg_catalog.array_agg(slot_position order by slot_position) =
          array[1, 4]
   from public.matchday_live_layout_placements
   where matchday_id = '8c000000-0000-4000-8000-000000000002'
     and placement_type = 'faixa'),
  'Faixa gaps were compacted'
);

select pg_temp.assert_true(
  exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps as bank_map
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = bank_map.target_bank_item_id
    where bank_map.carryover_id = (select carryover_id from seven_result)
      and bank_map.source_bank_item_id =
          '8c000000-0000-4000-8000-000000000209'
      and target_bank.editorially_worked_at is null
      and not exists (
        select 1 from public.matchday_live_layout_placements
        where matchday_id = target_bank.matchday_id
          and bank_item_id = target_bank.id
      )
      and not exists (
        select 1 from public.matchday_live_layout_bank_item_state_memory
        where matchday_id = target_bank.matchday_id
          and bank_item_id = target_bank.id
      )
  ),
  'NOVA worked timestamp changed'
);

select pg_temp.assert_true(
  exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps as bank_map
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = bank_map.target_bank_item_id
    where bank_map.carryover_id = (select carryover_id from seven_result)
      and bank_map.source_bank_item_id =
          '8c000000-0000-4000-8000-000000000202'
      and target_bank.classification_key = 'benfica'
      and target_bank.classification_source = 'continuity_assisted'
  ),
  'classification was not carried independently from the extra physical zone'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps as bank_map
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.id = bank_map.source_bank_item_id
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = bank_map.target_bank_item_id
    where bank_map.carryover_id = (select carryover_id from seven_result)
      and (
        target_bank.automatic_eligible
        or target_bank.editorially_worked_at is distinct from
           source_bank.editorially_worked_at
      )
  ),
  'automatic_eligible or worked timestamp changed after final triggers'
);

select pg_temp.assert_true(
  exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps as bank_map
    join public.matchday_editorial_profile_manual_overrides as override_row
      on override_row.matchday_id =
          '8c000000-0000-4000-8000-000000000002'
     and override_row.source_id = (
       select source_id from public.matchday_editorial_bank_items
       where id = bank_map.target_bank_item_id
     )
     and override_row.placement_target = 'bank'
    where bank_map.carryover_id = (select carryover_id from seven_result)
      and bank_map.source_bank_item_id =
          '8c000000-0000-4000-8000-000000000210'
  ),
  'explicit Banco state was not remapped'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as target_memory
    join jornada_private.matchday_live_layout_physical_bank_maps as bank_map
      on bank_map.target_bank_item_id = target_memory.bank_item_id
     and bank_map.carryover_id = (select carryover_id from seven_result)
    join public.matchday_live_layout_bank_item_state_memory as source_memory
      on source_memory.bank_item_id = bank_map.source_bank_item_id
     and source_memory.matchday_id =
         '8c000000-0000-4000-8000-000000000001'
    where target_memory.memory_kind is distinct from source_memory.memory_kind
       or target_memory.recorded_at is distinct from source_memory.recorded_at
  ),
  'DESALOJADA or legacy_unknown memory was not preserved exactly'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 2
   from public.matchday_latest_news
   where matchday_id = '8c000000-0000-4000-8000-000000000002')
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_bank_maps as bank_map
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.id = bank_map.target_bank_item_id
    join public.matchday_live_layout_placements as target_placement
      on target_placement.bank_item_id = target_bank.id
     and target_placement.matchday_id = target_bank.matchday_id
    where bank_map.carryover_id = (select carryover_id from seven_result)
      and bank_map.source_bank_item_id =
          '8c000000-0000-4000-8000-000000000209'
  ),
  'Latest created lateral physical placement'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 2
   from public.matchday_roundup_items
   where matchday_id = '8c000000-0000-4000-8000-000000000002')
  and exists (
    select 1
    from public.matchday_editorials as editorial_row
    join public.matchday_roundup_items as roundup_row
      on roundup_row.id = editorial_row.complementary_roundup_item_id
     and roundup_row.matchday_id = editorial_row.matchday_id
    where editorial_row.matchday_id =
          '8c000000-0000-4000-8000-000000000002'
      and roundup_row.id <>
          '8c000000-0000-4000-8000-000000000501'
  ),
  'roundup rows or their internal editorial reference were not remapped'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 7
   from public.matchday_live_layout_zones
   where matchday_id = '8c000000-0000-4000-8000-000000000002')
  and (select pg_catalog.count(*) = 5
       from jornada_private.matchday_live_layout_zone_legacy_projection
       where matchday_id = '8c000000-0000-4000-8000-000000000002')
  and (select pg_catalog.count(*) = 0
       from public.matchday_editorial_profile_state_items
       where matchday_id = '8c000000-0000-4000-8000-000000000002')
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
    where matchday_id = '8c000000-0000-4000-8000-000000000002'
  ),
  'extra zones, compatibility subset, state_items or reverse queue regressed'
);

select pg_temp.assert_true(
  jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000001'
  ) = (select source_hash from seven_before)
  and (select state_token from seven_result) <>
      (select state_token from seven_before)
  and not exists (
    select 1 from public.matchday_editorial_desk_control
    where matchday_id = '8c000000-0000-4000-8000-000000000002'
      and is_managed
  ),
  'source changed, state token did not change, or target was activated'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryover_context
    where target_matchday_id = '8c000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_downstream_context
    where matchday_id = '8c000000-0000-4000-8000-000000000002'
  )
  and not exists (
    select 1
    from jornada_private.matchday_editorial_bank_classification_authorizations
      as authorization_row
    where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
      and authorization_row.transaction_id = pg_catalog.pg_current_xact_id()
  ),
  'successful carryover left a temporary authorization or context'
);

select pg_temp.assert_true(
  pg_catalog.pg_get_functiondef(
    'jornada_private.acquire_matchday_live_desk_handoff_lock()'::regprocedure
  ) like '%pg_advisory_xact_lock(6026, 2)%',
  'v18 barrier is not the existing exclusive handoff lock (6026,2)'
);

insert into carryover_v18_results values
  (1, 'seven-zone physical content carryover', 'PASS');

-- An authorization for target A cannot authorize an equivalent legacy write
-- on physical matchday B.
do $test$
declare
  v_source_hash text;
begin
  v_source_hash :=
    jornada_private.matchday_live_layout_carryover_source_hash_v18(
      '8c000000-0000-4000-8000-000000000003'
    );

  insert into jornada_private.matchday_live_layout_physical_carryover_context (
    backend_pid,
    transaction_id,
    target_matchday_id,
    carryover_id
  ) values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.pg_current_xact_id(),
    '8c000000-0000-4000-8000-000000000002',
    (select carryover_id from seven_result)
  );

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    '8c000000-0000-4000-8000-000000000002'
  );

  begin
    update public.matchday_editorials
    set headline_link_url = '/artigos/forbidden-cross-matchday-write'
    where matchday_id = '8c000000-0000-4000-8000-000000000003';
    raise exception 'target A authorization leaked to matchday B';
  exception when others then
    if sqlerrm not like
       '%matchday-live-layout-legacy-placement-after-physical-cutover%'
    then
      raise;
    end if;
  end;

  perform jornada_private.end_matchday_live_layout_downstream_v14(
    '8c000000-0000-4000-8000-000000000002'
  );

  delete from jornada_private.matchday_live_layout_physical_carryover_context
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.pg_current_xact_id()
    and target_matchday_id = '8c000000-0000-4000-8000-000000000002';

  if jornada_private.matchday_live_layout_carryover_source_hash_v18(
       '8c000000-0000-4000-8000-000000000003'
     ) is distinct from v_source_hash
  then
    raise exception 'cross-matchday isolation attempt changed matchday B';
  end if;
end;
$test$;

-- ============================================================
-- FAIL-CLOSED TARGET/SOURCE/PROVENANCE CASES ON TOPOLOGY-ONLY TARGET
-- ============================================================

do $test$
begin
  begin
    insert into public.matchday_editorial_bank_items (
      matchday_id, title, source_type, source_id, status,
      automatic_eligible
    ) values (
      '8c000000-0000-4000-8000-000000000004',
      'partial target',
      'editorial_article',
      'partial-target',
      'active',
      false
    );

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'partial target Bank did not fail closed';
  exception when others then
    if sqlerrm not like '%target-not-virgin%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into public.matchday_editorial_bank_items (
      matchday_id, title, source_type, source_id, status,
      automatic_eligible
    ) values (
      '8c000000-0000-4000-8000-000000000004',
      'partial target placement',
      'editorial_article',
      'partial-target-placement',
      'active',
      false
    );

    insert into public.matchday_live_layout_placements (
      matchday_id, bank_item_id, placement_type, slot_position
    )
    select matchday_id, id, 'opening', 2
    from public.matchday_editorial_bank_items
    where matchday_id = '8c000000-0000-4000-8000-000000000004';

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'partial target placement did not fail closed';
  exception when others then
    if sqlerrm not like '%target-not-virgin%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into public.matchday_editorial_bank_items (
      matchday_id, title, source_type, source_id, status,
      automatic_eligible
    ) values (
      '8c000000-0000-4000-8000-000000000004',
      'partial target memory',
      'editorial_article',
      'partial-target-memory',
      'active',
      false
    );

    insert into public.matchday_live_layout_bank_item_state_memory (
      matchday_id, bank_item_id, memory_kind
    )
    select matchday_id, id, 'displaced'
    from public.matchday_editorial_bank_items
    where matchday_id = '8c000000-0000-4000-8000-000000000004';

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'partial target memory did not fail closed';
  exception when others then
    if sqlerrm not like '%target-not-virgin%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    perform jornada_private.begin_matchday_live_layout_downstream_v14(
      '8c000000-0000-4000-8000-000000000003'
    );

    insert into public.matchday_editorial_profile_manual_overrides (
      matchday_id, profile_key, source_type, source_id,
      placement_target, zone_key, sort_order
    )
    select
      source_bank.matchday_id,
      'liga_portugal_v1',
      source_bank.source_type,
      source_bank.source_id,
      'bank',
      null,
      null
    from public.matchday_editorial_bank_items as source_bank
    where source_bank.id = (select bank_item_id from rollback_source_bank);

    perform jornada_private.end_matchday_live_layout_downstream_v14(
      '8c000000-0000-4000-8000-000000000003'
    );

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'explicit Bank plus placement did not fail closed';
  exception when others then
    if sqlerrm not like '%explicit-bank%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into public.matchday_live_layout_bank_item_state_memory (
      matchday_id, bank_item_id, memory_kind
    ) values (
      '8c000000-0000-4000-8000-000000000003',
      (select bank_item_id from rollback_source_bank),
      'displaced'
    );

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'memory plus placement did not fail closed';
  exception when others then
    if sqlerrm not like '%memory%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into public.matchday_editorial_bank_items (
      matchday_id, title, status, automatic_eligible
    ) values (
      '8c000000-0000-4000-8000-000000000003',
      'invalid source identity',
      'active',
      false
    );

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'invalid source Bank identity did not fail closed';
  exception when others then
    if sqlerrm not like '%source-bank-invalid%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    update public.matchday_editorial_bank_items
    set status = 'archived'
    where id = (select bank_item_id from rollback_source_bank);

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'placement for archived Bank did not fail closed';
  exception when others then
    if sqlerrm not like '%placement-inactive%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    delete from jornada_private.matchday_live_layout_physical_zone_maps
    where topology_transition_id =
          (select topology_transition_id from topology_rollback)
      and source_zone_id = (
        select source_zone_id
        from jornada_private.matchday_live_layout_physical_zone_maps
        where topology_transition_id =
              (select topology_transition_id from topology_rollback)
        order by source_zone_id
        limit 1
      );

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'incomplete physical zone map did not fail closed';
  exception when others then
    if sqlerrm not like '%zone-map-incomplete%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_seven)
    );
    raise exception 'wrong topology transition did not fail closed';
  exception when others then
    if sqlerrm not like '%topology-invalid%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000701',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'foreign source composition did not fail closed';
  exception when others then
    if sqlerrm not like '%composition-invalid%' then raise; end if;
  end;
end;
$test$;

do $test$
begin
  begin
    insert into jornada_private.matchday_live_layout_physical_carryovers (
      topology_transition_id,
      source_matchday_id,
      target_matchday_id,
      source_composition_id,
      profile_key,
      inherited_bank_count,
      inherited_placement_count,
      inherited_explicit_bank_count,
      inherited_memory_count,
      inherited_latest_count,
      inherited_roundup_count,
      inherited_functional_layout_item_count,
      state_token_before
    ) values (
      (select topology_transition_id from topology_rollback),
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      'liga_portugal_v1',
      0, 0, 0, 0, 0, 0, 0,
      'incompatible'
    );

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'preexisting carryover certificate did not fail closed';
  exception when others then
    if sqlerrm not like '%already-materialized%' then raise; end if;
  end;
end;
$test$;

-- A canonical article appearing after a published Latest row proves that the
-- validator catches provenance that the ordinary insert trigger could not
-- have synchronized at insertion time.
do $test$
begin
  begin
    insert into public.matchday_latest_news (
      matchday_id, title, link_url, sort_order, status
    ) values (
      '8c000000-0000-4000-8000-000000000003',
      'Late canonical provenance',
      '/noticias/carryover-v18-late-canonical',
      1,
      'published'
    );

    insert into public.editorial_articles (
      id, title, slug, status, scope, body, author, published_at,
      competition_id, season_id, matchday_id
    ) values (
      '8c000000-0000-4000-8000-000000000115',
      'Late canonical provenance',
      'carryover-v18-late-canonical',
      'published',
      'matchday',
      'Body',
      'Author',
      '2026-09-05 15:00:00+00',
      '8c000000-0000-4000-8000-000000000020',
      '8c000000-0000-4000-8000-000000000031',
      '8c000000-0000-4000-8000-000000000003'
    );

    update public.matchday_editorial_bank_items
    set status = 'archived'
    where matchday_id = '8c000000-0000-4000-8000-000000000003'
      and source_id = '8c000000-0000-4000-8000-000000000115';

    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'Latest provenance conflict did not fail closed';
  exception when others then
    if sqlerrm not like '%latest-provenance-invalid%' then raise; end if;
  end;
end;
$test$;

insert into carryover_v18_results values
  (2, 'strict source target topology and provenance validation', 'PASS');

-- ============================================================
-- FAILURE INJECTION: EACH CALL MUST RETURN TO TOPOLOGY-ONLY
-- ============================================================

create function pg_temp.fail_carryover_after_bank_v18()
returns trigger
language plpgsql
as $function$
begin
  if new.matchday_id = '8c000000-0000-4000-8000-000000000004' then
    raise exception 'fixture-fail-after-bank';
  end if;
  return new;
end;
$function$;

create trigger fail_carryover_after_bank_v18
after insert on public.matchday_editorial_bank_items
for each row execute function pg_temp.fail_carryover_after_bank_v18();

do $test$
begin
  begin
    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'Bank failure injection did not fail';
  exception when others then
    if sqlerrm not like '%fixture-fail-after-bank%' then raise; end if;
  end;
end;
$test$;

drop trigger fail_carryover_after_bank_v18
on public.matchday_editorial_bank_items;

select pg_temp.assert_true(
  not exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_carryovers
    where target_matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_bank_maps
    where target_matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and exists (
    select 1 from jornada_private.matchday_live_layout_physical_topology_transitions
    where target_matchday_id = '8c000000-0000-4000-8000-000000000004'
  ),
  'failure after Bank did not roll back to topology-only'
);

select pg_temp.assert_true(
  jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000003'
  ) = (select source_hash from rollback_topology_before)
  and jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000004'
  ) = (select target_content_hash from rollback_topology_before)
  and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_carryover_context
    where target_matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from jornada_private.matchday_live_layout_downstream_context
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1
    from jornada_private.matchday_editorial_bank_classification_authorizations
      as authorization_row
    where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
      and authorization_row.transaction_id = pg_catalog.pg_current_xact_id()
  ),
  'failure after Bank left context or changed source/target'
);

create function pg_temp.fail_carryover_after_placements_v18()
returns trigger
language plpgsql
as $function$
begin
  if new.matchday_id = '8c000000-0000-4000-8000-000000000004' then
    raise exception 'fixture-fail-after-placements';
  end if;
  return new;
end;
$function$;

create trigger fail_carryover_after_placements_v18
after insert on public.matchday_live_layout_placements
for each row execute function pg_temp.fail_carryover_after_placements_v18();

do $test$
begin
  begin
    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'placement failure injection did not fail';
  exception when others then
    if sqlerrm not like '%fixture-fail-after-placements%' then raise; end if;
  end;
end;
$test$;

drop trigger fail_carryover_after_placements_v18
on public.matchday_live_layout_placements;

select pg_temp.assert_true(
  not exists (
    select 1 from public.matchday_editorial_bank_items
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_carryovers
    where target_matchday_id = '8c000000-0000-4000-8000-000000000004'
  ),
  'failure after placements did not roll back to topology-only'
);

select pg_temp.assert_true(
  jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000003'
  ) = (select source_hash from rollback_topology_before)
  and jornada_private.matchday_live_layout_carryover_source_hash_v18(
    '8c000000-0000-4000-8000-000000000004'
  ) = (select target_content_hash from rollback_topology_before)
  and (
    select workspace_row.state_token =
           (select state_token from rollback_topology_before)
    from public.read_matchday_live_layout_workspace_v13(
      '8c000000-0000-4000-8000-000000000004',
      'liga_portugal_v1'
    ) as workspace_row
  )
  and not exists (
    select 1 from public.matchday_live_layout_bank_item_state_memory
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from public.matchday_latest_news
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from public.matchday_roundup_items
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from jornada_private.matchday_live_layout_physical_carryover_context
    where target_matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1 from jornada_private.matchday_live_layout_downstream_context
    where matchday_id = '8c000000-0000-4000-8000-000000000004'
  )
  and not exists (
    select 1
    from jornada_private.matchday_editorial_bank_classification_authorizations
      as authorization_row
    where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
      and authorization_row.transaction_id = pg_catalog.pg_current_xact_id()
  ),
  'failure after placements left state/context or changed topology/source'
);

insert into carryover_v18_results values
  (3, 'atomic rollback after Bank and placements', 'PASS');

create temp table rollback_result as
select *
from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
  '8c000000-0000-4000-8000-000000000003',
  '8c000000-0000-4000-8000-000000000004',
  '8c000000-0000-4000-8000-000000000702',
  (select topology_transition_id from topology_rollback)
);

select pg_temp.assert_true(
  (select inherited_bank_count = 1 and inherited_placement_count = 1
   from rollback_result),
  'retry after rollback did not materialize complete content'
);

do $test$
begin
  begin
    perform *
    from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
      '8c000000-0000-4000-8000-000000000003',
      '8c000000-0000-4000-8000-000000000004',
      '8c000000-0000-4000-8000-000000000702',
      (select topology_transition_id from topology_rollback)
    );
    raise exception 'successful retry did not fail closed';
  exception when others then
    if sqlerrm not like '%already-materialized%' then raise; end if;
  end;
end;
$test$;

insert into carryover_v18_results values
  (4, 'rollback retry and successful-call idempotency', 'PASS');

select * from carryover_v18_results order by test_number;

rollback;
