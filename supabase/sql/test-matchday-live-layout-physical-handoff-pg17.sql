\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after migrations through v19. Everything is rolled
-- back; no fixture state can escape this session.
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

create function pg_temp.inject_v19_failure()
returns trigger
language plpgsql
as $function$
begin
  raise exception 'v19-injected-failure';
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

insert into public.matchday_reference_compositions (
  id, matchday_id, status, is_current, internal_name
)
values (
  '9d000000-0000-4000-8000-000000000702',
  '9d000000-0000-4000-8000-000000000001',
  'draft',
  false,
  'v19 historical republication'
);

create temp table republish_before as
select
  jornada_private.matchday_live_layout_physical_archive_hash_v19(
    '9d000000-0000-4000-8000-000000000001'
  ) as source_hash,
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
  and (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_topology_transitions) =
      (select topology_count from republish_before)
  and (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_carryovers) =
      (select carryover_count from republish_before)
  and (select pg_catalog.count(*) from jornada_private.matchday_live_layout_physical_handoffs) =
      (select handoff_count from republish_before),
  'historical republication duplicated physical materialization'
);

insert into handoff_v19_results values
  (2, 'physical historical republication is independent', 'PASS');


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
