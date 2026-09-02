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

create function pg_temp.classification_hash(p_matchday_id uuid)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'bank_item_id', bank_row.id,
          'classification_key', bank_row.classification_key,
          'classification_source', bank_row.classification_source,
          'classified_at', bank_row.classified_at
        )
        order by bank_row.id
      ),
      '[]'::jsonb
    )::text
  )
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id;
$function$;

create temp table aggregate_tracking_results (
  test_name text primary key,
  status text not null,
  detail text not null
);

create temp table aggregate_tracking_evidence (
  key text primary key,
  value text not null
);

create temp table aggregate_tracking_items (
  matchday_id uuid not null,
  item_kind text not null,
  article_id uuid not null,
  bank_item_id uuid,
  primary key (matchday_id, item_kind)
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
  '13000000-0000-4000-8000-000000000001',
  'Aggregate Tracking Fixture Country',
  'aggregate-tracking-fixture-country'
);

insert into public.competitions (
  id,
  name,
  slug,
  country,
  country_id
)
values (
  '23000000-0000-4000-8000-000000000001',
  'Aggregate Tracking Fixture Competition',
  'liga-portugal',
  'Aggregate Tracking Fixture Country',
  '13000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '33000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  'Aggregate Tracking 2026/27',
  'aggregate-tracking-2026-27'
);

insert into public.matchdays (id, season_id, number, label)
values
  (
    '43000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000001',
    1,
    'Aggregate Tracking N'
  ),
  (
    '43000000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8000-000000000001',
    2,
    'Aggregate Tracking N+1'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '43000000-0000-4000-8000-000000000001',
    '33000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '43000000-0000-4000-8000-000000000002',
    '33000000-0000-4000-8000-000000000001',
    false
  );

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values
  ('43000000-0000-4000-8000-000000000001', 'liga_portugal_v1'),
  ('43000000-0000-4000-8000-000000000002', 'liga_portugal_v1');

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key
)
values
  ('43000000-0000-4000-8000-000000000001', 'liga_portugal_v1'),
  ('43000000-0000-4000-8000-000000000002', 'liga_portugal_v1');

select jornada_private.sync_matchday_live_layout_shadow(
  array[
    '43000000-0000-4000-8000-000000000001'::uuid,
    '43000000-0000-4000-8000-000000000002'::uuid
  ]
);

insert into aggregate_tracking_items (
  matchday_id,
  item_kind,
  article_id
)
values
  ('43000000-0000-4000-8000-000000000001', 'new',
   '53000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000001', 'faixa',
   '53000000-0000-4000-8000-000000000002'),
  ('43000000-0000-4000-8000-000000000001', 'displaced',
   '53000000-0000-4000-8000-000000000003'),
  ('43000000-0000-4000-8000-000000000001', 'opening',
   '53000000-0000-4000-8000-000000000004'),
  ('43000000-0000-4000-8000-000000000001', 'selection',
   '53000000-0000-4000-8000-000000000005'),
  ('43000000-0000-4000-8000-000000000001', 'video_highlight',
   '53000000-0000-4000-8000-000000000006'),
  ('43000000-0000-4000-8000-000000000001', 'zone',
   '53000000-0000-4000-8000-000000000007'),
  ('43000000-0000-4000-8000-000000000001', 'legacy_unknown',
   '53000000-0000-4000-8000-000000000008'),
  ('43000000-0000-4000-8000-000000000001', 'transversal_conflict',
   '53000000-0000-4000-8000-000000000009'),
  ('43000000-0000-4000-8000-000000000001', 'memory_conflict',
   '53000000-0000-4000-8000-000000000010'),
  ('43000000-0000-4000-8000-000000000001', 'transition_sequence',
   '53000000-0000-4000-8000-000000000011'),
  ('43000000-0000-4000-8000-000000000002', 'next_new',
   '53000000-0000-4000-8000-000000000012');

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
  'Aggregate Tracking ' || fixture.item_kind,
  'aggregate-tracking-' || pg_catalog.replace(fixture.article_id::text, '-', ''),
  'published',
  'matchday',
  'Fixture',
  'Aggregate tracking fixture',
  'Fixture body deliberately excluded from the aggregate reader',
  'https://example.test/' || fixture.article_id::text || '.jpg',
  pg_catalog.transaction_timestamp(),
  '23000000-0000-4000-8000-000000000001',
  '33000000-0000-4000-8000-000000000001',
  fixture.matchday_id
from aggregate_tracking_items as fixture;

update aggregate_tracking_items as fixture
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id = fixture.matchday_id
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      fixture.article_id::text;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 12
   from aggregate_tracking_items
   where bank_item_id is not null),
  'fixture did not create all contextual Bank items'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from aggregate_tracking_items as fixture
    order by fixture.bank_item_id
  )
);

update public.matchday_editorial_bank_items as bank_row
set classification_key = 'sporting',
    classification_source = 'manual',
    classified_at = '2026-09-02T10:00:00Z'::timestamptz
from aggregate_tracking_items as fixture
where bank_row.id = fixture.bank_item_id;

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from aggregate_tracking_items as fixture
    order by fixture.bank_item_id
  )
);

insert into aggregate_tracking_evidence (key, value)
values (
  'classification_before',
  pg_temp.classification_hash(
    '43000000-0000-4000-8000-000000000001'
  )
);

-- The transition item proves the complete state machine without any
-- TypeScript inference. Each observation comes from the aggregate RPC.
select pg_temp.assert_true(
  (select reader.editorial_state = 'NOVA'
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'transition_sequence'),
  'unplaced item without memory is not NOVA'
);

insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select fixture.matchday_id, fixture.bank_item_id, 'faixa', null, 90
from aggregate_tracking_items as fixture
where fixture.item_kind = 'transition_sequence';

select pg_temp.assert_true(
  (select reader.editorial_state = 'FAIXA'
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'transition_sequence'),
  'Faixa placement is not FAIXA'
);

update public.matchday_live_layout_placements as placement_row
set placement_type = 'zone',
    zone_id = zone_projection.zone_id,
    slot_position = 2
from aggregate_tracking_items as fixture
join jornada_private.matchday_live_layout_zone_legacy_projection
  as zone_projection
  on zone_projection.matchday_id = fixture.matchday_id
 and zone_projection.legacy_zone_key = 'sporting'
where fixture.item_kind = 'transition_sequence'
  and placement_row.matchday_id = fixture.matchday_id
  and placement_row.bank_item_id = fixture.bank_item_id;

select pg_temp.assert_true(
  (select reader.editorial_state = 'COLOCADA'
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'transition_sequence'),
  'non-Faixa placement is not COLOCADA'
);

delete from public.matchday_live_layout_placements as placement_row
using aggregate_tracking_items as fixture
where fixture.item_kind = 'transition_sequence'
  and placement_row.matchday_id = fixture.matchday_id
  and placement_row.bank_item_id = fixture.bank_item_id;

select pg_temp.assert_true(
  (select reader.editorial_state = 'DESALOJADA'
          and reader.memory_kind = 'displaced'
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'transition_sequence'),
  'removed placed item is not DESALOJADA'
);

insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select fixture.matchday_id, fixture.bank_item_id, 'faixa', null, 90
from aggregate_tracking_items as fixture
where fixture.item_kind = 'transition_sequence';

select pg_temp.assert_true(
  (select reader.editorial_state = 'FAIXA'
          and reader.memory_kind is null
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'transition_sequence'),
  'replacement did not restore current placement authority'
);

insert into aggregate_tracking_results values (
  '1 AUTHORITATIVE STATE TRANSITIONS',
  'PASS',
  'NOVA -> FAIXA -> COLOCADA -> DESALOJADA -> FAIXA'
);

-- Build simultaneous Sporting tracking and autonomous placed surfaces.
insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  fixture.matchday_id,
  fixture.bank_item_id,
  case fixture.item_kind
    when 'faixa' then 'faixa'
    when 'displaced' then 'faixa'
    when 'opening' then 'opening'
    when 'selection' then 'selection'
    when 'video_highlight' then 'video_highlight'
    when 'zone' then 'zone'
    when 'memory_conflict' then 'selection'
  end,
  case when fixture.item_kind = 'zone' then zone_projection.zone_id end,
  case fixture.item_kind
    when 'faixa' then 1
    when 'displaced' then 2
    when 'opening' then 1
    when 'selection' then 1
    when 'video_highlight' then 1
    when 'zone' then 1
    when 'memory_conflict' then 2
  end
from aggregate_tracking_items as fixture
left join jornada_private.matchday_live_layout_zone_legacy_projection
  as zone_projection
  on zone_projection.matchday_id = fixture.matchday_id
 and zone_projection.legacy_zone_key = 'sporting'
where fixture.item_kind in (
  'faixa',
  'displaced',
  'opening',
  'selection',
  'video_highlight',
  'zone',
  'memory_conflict'
);

delete from public.matchday_live_layout_placements as placement_row
using aggregate_tracking_items as fixture
where fixture.item_kind = 'displaced'
  and placement_row.matchday_id = fixture.matchday_id
  and placement_row.bank_item_id = fixture.bank_item_id;

insert into public.matchday_live_layout_bank_item_state_memory (
  matchday_id,
  bank_item_id,
  memory_kind
)
select fixture.matchday_id, fixture.bank_item_id, 'legacy_unknown'
from aggregate_tracking_items as fixture
where fixture.item_kind = 'legacy_unknown';

insert into public.matchday_live_layout_bank_item_state_memory (
  matchday_id,
  bank_item_id,
  memory_kind
)
select fixture.matchday_id, fixture.bank_item_id, 'displaced'
from aggregate_tracking_items as fixture
where fixture.item_kind = 'memory_conflict';

-- The transversal UNIQUE is DEFERRABLE. The invalid state may be observed
-- inside this transaction, but cannot commit. The fixture itself rolls back.
set constraints
  matchday_live_layout_placements_matchday_bank_key deferred;

insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select fixture.matchday_id, fixture.bank_item_id, placement.placement_type,
       null, placement.slot_position
from aggregate_tracking_items as fixture
cross join (
  values ('faixa'::text, 3), ('opening'::text, 2)
) as placement(placement_type, slot_position)
where fixture.item_kind = 'transversal_conflict';

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from public.read_matchday_live_desk_aggregate_tracking(
     '43000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader
   where reader.classification_key = 'sporting'
     and reader.editorial_state = 'NOVA'),
  'Sporting NOVA count is not one'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 2
   from public.read_matchday_live_desk_aggregate_tracking(
     '43000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader
   where reader.classification_key = 'sporting'
     and reader.editorial_state = 'FAIXA'),
  'Sporting FAIXA count is not two'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from public.read_matchday_live_desk_aggregate_tracking(
     '43000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader
   where reader.classification_key = 'sporting'
     and reader.editorial_state = 'DESALOJADA'),
  'Sporting DESALOJADA count is not one'
);

insert into aggregate_tracking_results values (
  '2 SIMULTANEOUS CLASS TRACKING',
  'PASS',
  'Sporting NOVA=1 FAIXA=2 DESALOJADA=1'
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 4
   from public.read_matchday_live_desk_aggregate_tracking(
     '43000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader
   where reader.editorial_state = 'COLOCADA'
     and reader.placement_type in (
       'opening', 'zone', 'selection', 'video_highlight'
     )),
  'autonomous placed surfaces are not all COLOCADA'
);

select pg_temp.assert_true(
  (select reader.editorial_state is null
          and reader.history_unknown
          and reader.memory_kind = 'legacy_unknown'
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'legacy_unknown'),
  'legacy_unknown was reclassified as a tracking state'
);

insert into aggregate_tracking_results values (
  '3 PLACED AND LEGACY EXCLUSIONS',
  'PASS',
  'opening/zone/selection/video COLOCADA; legacy_unknown excluded'
);

select pg_temp.assert_true(
  (select reader.placement_count = 2
          and reader.transversal_conflict
          and reader.editorial_state is null
          and reader.placement_id is null
          and reader.placement_type is null
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'transversal_conflict'),
  'transversal conflict did not fail closed'
);

select pg_temp.assert_true(
  (select reader.placement_count = 1
          and reader.memory_placement_conflict
          and reader.editorial_state is null
   from aggregate_tracking_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     fixture.matchday_id,
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'memory_conflict'),
  'placement plus memory conflict did not fail closed'
);

insert into aggregate_tracking_results values (
  '4 CONFLICTS FAIL CLOSED',
  'PASS',
  'two placements and placement+memory expose diagnostics without winner'
);

select pg_temp.assert_true(
  (select value = pg_temp.classification_hash(
      '43000000-0000-4000-8000-000000000001'
    )
   from aggregate_tracking_evidence
   where key = 'classification_before'),
  'placement transitions changed contextual classification'
);

insert into aggregate_tracking_results values (
  '5 CLASSIFICATION INDEPENDENCE',
  'PASS',
  'classification hash before=after'
);

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ),
  'aggregate reader grants are not service-role only'
);

insert into aggregate_tracking_results values (
  '6 RPC ACCESS CONTRACT',
  'PASS',
  'SECURITY DEFINER execute restricted to service_role'
);

update public.matchday_editorial_desk_control
set is_managed = false
where matchday_id = '43000000-0000-4000-8000-000000000001';

update public.matchday_editorial_desk_control
set is_managed = true
where matchday_id = '43000000-0000-4000-8000-000000000002';

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from public.read_matchday_live_desk_aggregate_tracking(
     '43000000-0000-4000-8000-000000000002',
     'liga_portugal_v1'
   ) as reader
   where reader.editorial_state = 'NOVA'
     and reader.classification_key = 'sporting'),
  'N+1 reader did not expose its new contextual article as NOVA'
);

select pg_temp.assert_true(
  (select control_row.is_managed
   from public.matchday_editorial_desk_control as control_row
   where control_row.matchday_id =
     '43000000-0000-4000-8000-000000000002'),
  'N+1 did not retain live desk authority'
);

insert into aggregate_tracking_results values (
  '7 N+1 READER GENERALIZATION',
  'PASS',
  'same reader exposes contextual N+1 article as NOVA'
);

insert into aggregate_tracking_evidence (key, value)
select
  'N_tracking_counts',
  pg_catalog.jsonb_object_agg(state_row.state_key, state_row.item_count)::text
from (
  select
    coalesce(reader.editorial_state, 'EXCLUDED') as state_key,
    pg_catalog.count(*) as item_count
  from public.read_matchday_live_desk_aggregate_tracking(
    '43000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as reader
  group by coalesce(reader.editorial_state, 'EXCLUDED')
) as state_row;

select test_name, status, detail
from aggregate_tracking_results
order by test_name;

select key, value
from aggregate_tracking_evidence
order by key;

rollback;
