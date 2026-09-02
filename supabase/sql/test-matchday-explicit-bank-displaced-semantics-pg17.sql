\set ON_ERROR_STOP on

-- Run against the production-schema snapshot after applying
-- 20260902110327_matchday_live_desk_aggregate_tracking_reader.sql. The first
-- transaction deliberately creates an overlap with the old memory trigger;
-- the forward migration below must repair it before the runtime tests begin.
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

create temp table explicit_bank_fixture_items (
  item_kind text primary key,
  article_id uuid not null,
  bank_item_id uuid
);

create temp table explicit_bank_results (
  test_name text primary key,
  status text not null,
  detail text not null
);

create temp table explicit_bank_evidence (
  key text primary key,
  value text not null
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
  '14000000-0000-4000-8000-000000000001',
  'Explicit Bank Fixture Country',
  'explicit-bank-fixture-country'
);

insert into public.competitions (
  id,
  name,
  slug,
  country,
  country_id
)
values (
  '24000000-0000-4000-8000-000000000001',
  'Explicit Bank Fixture Competition',
  'liga-portugal',
  'Explicit Bank Fixture Country',
  '14000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '34000000-0000-4000-8000-000000000001',
  '24000000-0000-4000-8000-000000000001',
  'Explicit Bank 2026/27',
  'explicit-bank-2026-27'
);

insert into public.matchdays (id, season_id, number, label)
values (
  '44000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  1,
  'Explicit Bank N'
);

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values (
  '44000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  true
);

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values (
  '44000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key
)
values (
  '44000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['44000000-0000-4000-8000-000000000001'::uuid]
);

insert into explicit_bank_fixture_items (item_kind, article_id)
values
  ('repair_bank', '54000000-0000-4000-8000-000000000001'),
  ('faixa_bank', '54000000-0000-4000-8000-000000000002'),
  ('zone_bank', '54000000-0000-4000-8000-000000000003'),
  ('bank_faixa', '54000000-0000-4000-8000-000000000004'),
  ('bank_zone', '54000000-0000-4000-8000-000000000005'),
  ('displaced_x', '54000000-0000-4000-8000-000000000006'),
  ('incoming_y', '54000000-0000-4000-8000-000000000007'),
  ('new', '54000000-0000-4000-8000-000000000008'),
  ('legacy_unknown', '54000000-0000-4000-8000-000000000009');

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
  'Explicit Bank ' || fixture.item_kind,
  'explicit-bank-' || pg_catalog.replace(fixture.article_id::text, '-', ''),
  'published',
  'matchday',
  'Fixture',
  'Explicit Bank fixture',
  'Body excluded from the aggregate reader',
  'https://example.test/' || fixture.article_id::text || '.jpg',
  pg_catalog.transaction_timestamp(),
  '24000000-0000-4000-8000-000000000001',
  '34000000-0000-4000-8000-000000000001',
  '44000000-0000-4000-8000-000000000001'
from explicit_bank_fixture_items as fixture;

update explicit_bank_fixture_items as fixture
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '44000000-0000-4000-8000-000000000001'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      fixture.article_id::text;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 9
   from explicit_bank_fixture_items
   where bank_item_id is not null),
  'fixture did not create all contextual Bank items'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from explicit_bank_fixture_items as fixture
    order by fixture.bank_item_id
  )
);

update public.matchday_editorial_bank_items as bank_row
set classification_key = case fixture.item_kind
      when 'bank_zone' then 'benfica'
      when 'new' then 'fc_porto'
      else 'sporting'
    end,
    classification_source = 'manual',
    classified_at = '2026-09-02T13:00:00Z'::timestamptz
from explicit_bank_fixture_items as fixture
where bank_row.id = fixture.bank_item_id;

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from explicit_bank_fixture_items as fixture
    order by fixture.bank_item_id
  )
);

insert into explicit_bank_evidence (key, value)
values (
  'classification_before',
  pg_temp.classification_hash(
    '44000000-0000-4000-8000-000000000001'
  )
);

insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '44000000-0000-4000-8000-000000000001',
  fixture.bank_item_id,
  placement.placement_type,
  case
    when placement.placement_type = 'zone' then zone_projection.zone_id
  end,
  placement.slot_position
from (
  values
    ('repair_bank'::text, 'faixa'::text, 1),
    ('faixa_bank'::text, 'faixa'::text, 2),
    ('zone_bank'::text, 'zone'::text, 1),
    ('displaced_x'::text, 'zone'::text, 2)
) as placement(item_kind, placement_type, slot_position)
join explicit_bank_fixture_items as fixture
  on fixture.item_kind = placement.item_kind
left join jornada_private.matchday_live_layout_zone_legacy_projection
  as zone_projection
  on zone_projection.matchday_id =
     '44000000-0000-4000-8000-000000000001'
 and zone_projection.legacy_zone_key = 'sporting';

-- Reproduce the pre-fix overlap: the old placement trigger records displaced,
-- then an explicit Bank override cannot clear it.
delete from public.matchday_live_layout_placements as placement_row
using explicit_bank_fixture_items as fixture
where fixture.item_kind = 'repair_bank'
  and placement_row.matchday_id =
      '44000000-0000-4000-8000-000000000001'
  and placement_row.bank_item_id = fixture.bank_item_id;

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
  '44000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  'editorial_article',
  fixture.article_id::text,
  'bank',
  null,
  null
from explicit_bank_fixture_items as fixture
where fixture.item_kind in ('repair_bank', 'bank_faixa', 'bank_zone');

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 1
   from public.matchday_live_layout_bank_item_state_memory as memory_row
   join explicit_bank_fixture_items as fixture
     on fixture.bank_item_id = memory_row.bank_item_id
   where fixture.item_kind = 'repair_bank'
     and memory_row.matchday_id =
         '44000000-0000-4000-8000-000000000001'
     and memory_row.memory_kind = 'displaced'),
  'pre-fix explicit Bank overlap was not reproduced'
);

-- Keep the committed pre-migration fixture consistent with the authoritative
-- cutover contract; only the memory/Bank overlap is intentionally stale.
select jornada_private.project_matchday_live_layout_placements_to_legacy(
  array['44000000-0000-4000-8000-000000000001'::uuid]
);

commit;

\ir ../migrations/20260902130518_matchday_explicit_bank_displaced_semantics.sql

begin;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    join explicit_bank_fixture_items as fixture
      on fixture.bank_item_id = memory_row.bank_item_id
    where fixture.item_kind = 'repair_bank'
      and memory_row.matchday_id =
          '44000000-0000-4000-8000-000000000001'
  ),
  'forward migration did not repair explicit Bank plus displaced overlap'
);

select pg_temp.assert_true(
  (select reader.is_explicit_bank
          and not reader.bank_placement_conflict
          and reader.editorial_state is null
          and reader.memory_kind is null
   from explicit_bank_fixture_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     '44000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'repair_bank'),
  'repaired explicit Bank item is not separated from tracking'
);

insert into explicit_bank_results values (
  '1 GENERIC BASELINE REPAIR',
  'PASS',
  'explicit Bank + displaced + zero placement repaired without fixture IDs'
);

-- The workspace writer persists the complete override set before reconciling
-- placements. Reproduce that order for Faixa -> Banco and Zone -> Banco.
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
  '44000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  'editorial_article',
  fixture.article_id::text,
  'bank',
  null,
  null
from explicit_bank_fixture_items as fixture
where fixture.item_kind in ('faixa_bank', 'zone_bank');

delete from public.matchday_live_layout_placements as placement_row
using explicit_bank_fixture_items as fixture
where fixture.item_kind in ('faixa_bank', 'zone_bank')
  and placement_row.matchday_id =
      '44000000-0000-4000-8000-000000000001'
  and placement_row.bank_item_id = fixture.bank_item_id;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 2
   from explicit_bank_fixture_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     '44000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind in ('faixa_bank', 'zone_bank')
     and reader.is_explicit_bank
     and reader.editorial_state is null
     and reader.placement_count = 0
     and reader.memory_kind is null),
  'explicit Faixa/Zone to Bank did not end in clean Banco state'
);

insert into explicit_bank_results values (
  '2 EXPLICIT MOVEMENT TO BANK',
  'PASS',
  'Faixa -> Banco and Zone -> Banco leave no governing displaced memory'
);

-- Banco -> placement removes the explicit override from the full workspace
-- state before inserting the new authoritative placement.
delete from public.matchday_editorial_profile_manual_overrides as override_row
using explicit_bank_fixture_items as fixture
where fixture.item_kind in ('bank_faixa', 'bank_zone')
  and override_row.matchday_id =
      '44000000-0000-4000-8000-000000000001'
  and override_row.profile_key = 'liga_portugal_v1'
  and override_row.source_type = 'editorial_article'
  and override_row.source_id = fixture.article_id::text;

insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '44000000-0000-4000-8000-000000000001',
  fixture.bank_item_id,
  case fixture.item_kind
    when 'bank_faixa' then 'faixa'
    else 'zone'
  end,
  case
    when fixture.item_kind = 'bank_zone' then zone_projection.zone_id
  end,
  3
from explicit_bank_fixture_items as fixture
left join jornada_private.matchday_live_layout_zone_legacy_projection
  as zone_projection
  on zone_projection.matchday_id =
     '44000000-0000-4000-8000-000000000001'
 and zone_projection.legacy_zone_key = 'sporting'
where fixture.item_kind in ('bank_faixa', 'bank_zone');

select pg_temp.assert_true(
  (select reader.editorial_state = 'FAIXA'
          and not reader.is_explicit_bank
          and reader.memory_kind is null
   from explicit_bank_fixture_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     '44000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'bank_faixa'),
  'Banco to Faixa did not end in FAIXA'
);

select pg_temp.assert_true(
  (select reader.editorial_state = 'COLOCADA'
          and reader.placement_type = 'zone'
          and not reader.is_explicit_bank
          and reader.memory_kind is null
   from explicit_bank_fixture_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     '44000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'bank_zone'),
  'Banco to Zone did not end in COLOCADA'
);

insert into explicit_bank_results values (
  '3 BANK TO PLACEMENT',
  'PASS',
  'Banco -> Faixa is FAIXA; Banco -> Zone is COLOCADA'
);

do $test$
declare
  v_displaced_bank_item_id uuid;
  v_incoming_bank_item_id uuid;
  v_zone_id uuid;
  v_result jsonb;
begin
  select fixture.bank_item_id
  into v_displaced_bank_item_id
  from explicit_bank_fixture_items as fixture
  where fixture.item_kind = 'displaced_x';

  select fixture.bank_item_id
  into v_incoming_bank_item_id
  from explicit_bank_fixture_items as fixture
  where fixture.item_kind = 'incoming_y';

  select zone_projection.zone_id
  into v_zone_id
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as zone_projection
  where zone_projection.matchday_id =
        '44000000-0000-4000-8000-000000000001'
    and zone_projection.legacy_zone_key = 'sporting';

  v_result := public.apply_matchday_live_layout_movement(
    '44000000-0000-4000-8000-000000000001',
    'place',
    v_incoming_bank_item_id,
    'zone',
    v_zone_id,
    2,
    v_displaced_bank_item_id,
    false
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory
      where matchday_id =
            '44000000-0000-4000-8000-000000000001'
        and bank_item_id = v_displaced_bank_item_id
        and memory_kind = 'displaced'
    ),
    'real replacement did not retain displaced memory'
  );

  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_editorial_profile_manual_overrides
      where matchday_id =
            '44000000-0000-4000-8000-000000000001'
        and profile_key = 'liga_portugal_v1'
        and source_type = 'editorial_article'
        and source_id = (
          select fixture.article_id::text
          from explicit_bank_fixture_items as fixture
          where fixture.item_kind = 'displaced_x'
        )
        and placement_target = 'bank'
    ),
    'real replacement created an explicit Bank override'
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.read_matchday_live_desk_aggregate_tracking(
        '44000000-0000-4000-8000-000000000001',
        'liga_portugal_v1'
      ) as reader
      where reader.bank_item_id = v_displaced_bank_item_id
        and reader.editorial_state = 'DESALOJADA'
        and not reader.is_explicit_bank
    ),
    'real replacement is not DESALOJADA'
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.read_matchday_live_desk_aggregate_tracking(
        '44000000-0000-4000-8000-000000000001',
        'liga_portugal_v1'
      ) as reader
      where reader.bank_item_id = v_incoming_bank_item_id
        and reader.editorial_state = 'COLOCADA'
        and reader.placement_type = 'zone'
    ),
    'incoming replacement is not COLOCADA'
  );
end;
$test$;

insert into explicit_bank_results values (
  '4 REAL DISPLACEMENT',
  'PASS',
  'replacement X -> DESALOJADA, Y -> COLOCADA, no implicit Banco'
);

insert into public.matchday_live_layout_bank_item_state_memory (
  matchday_id,
  bank_item_id,
  memory_kind
)
select
  '44000000-0000-4000-8000-000000000001',
  fixture.bank_item_id,
  'legacy_unknown'
from explicit_bank_fixture_items as fixture
where fixture.item_kind = 'legacy_unknown';

select pg_temp.assert_true(
  (select reader.editorial_state = 'NOVA'
          and not reader.is_explicit_bank
   from explicit_bank_fixture_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     '44000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'new'),
  'unplaced item without Bank or memory is not NOVA'
);

select pg_temp.assert_true(
  (select reader.editorial_state is null
          and reader.history_unknown
          and not reader.is_explicit_bank
   from explicit_bank_fixture_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     '44000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'legacy_unknown'),
  'legacy_unknown was promoted into a normal state'
);

insert into explicit_bank_results values (
  '5 NEW AND LEGACY',
  'PASS',
  'NOVA preserved; legacy_unknown remains neutral'
);

-- A corrupt explicit Bank plus placement state must be visible but must not
-- be classified as a normal tracking state or a normal Banco item.
insert into public.matchday_live_layout_placements (
  matchday_id,
  bank_item_id,
  placement_type,
  zone_id,
  slot_position
)
select
  '44000000-0000-4000-8000-000000000001',
  fixture.bank_item_id,
  'faixa',
  null,
  9
from explicit_bank_fixture_items as fixture
where fixture.item_kind = 'repair_bank';

select pg_temp.assert_true(
  (select reader.is_explicit_bank
          and reader.bank_placement_conflict
          and reader.editorial_state is null
   from explicit_bank_fixture_items as fixture
   join public.read_matchday_live_desk_aggregate_tracking(
     '44000000-0000-4000-8000-000000000001',
     'liga_portugal_v1'
   ) as reader on reader.bank_item_id = fixture.bank_item_id
   where fixture.item_kind = 'repair_bank'),
  'explicit Bank plus placement did not fail closed'
);

select pg_temp.assert_true(
  not exists (
    select reader.bank_item_id
    from public.read_matchday_live_desk_aggregate_tracking(
      '44000000-0000-4000-8000-000000000001',
      'liga_portugal_v1'
    ) as reader
    where reader.is_explicit_bank
      and reader.editorial_state in ('NOVA', 'FAIXA', 'DESALOJADA')
  ),
  'explicit Banco leaked into Tracking Todas or class counters'
);

select pg_temp.assert_true(
  not exists (
    select placement_row.bank_item_id
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '44000000-0000-4000-8000-000000000001'
    group by placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ),
  'transversal placement uniqueness was violated'
);

insert into explicit_bank_results values (
  '6 FAIL CLOSED AND UNIQUE',
  'PASS',
  'Banco+placement diagnostic exposed; no duplicate placement identity'
);

select pg_temp.assert_true(
  (select value = pg_temp.classification_hash(
      '44000000-0000-4000-8000-000000000001'
    )
   from explicit_bank_evidence
   where key = 'classification_before'),
  'movement changed persisted contextual classification'
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

insert into explicit_bank_results values (
  '7 CLASSIFICATION AND ACCESS',
  'PASS',
  'classification hash before=after; aggregate reader remains service-role'
);

insert into explicit_bank_evidence (key, value)
select
  'reader_state_counts',
  pg_catalog.jsonb_object_agg(
    state_row.state_key,
    state_row.item_count
  )::text
from (
  select
    case
      when reader.bank_placement_conflict then 'CONFLICT'
      when reader.is_explicit_bank then 'BANCO'
      else coalesce(reader.editorial_state, 'EXCLUDED')
    end as state_key,
    pg_catalog.count(*) as item_count
  from public.read_matchday_live_desk_aggregate_tracking(
    '44000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as reader
  group by 1
) as state_row;

insert into explicit_bank_evidence (key, value)
values (
  'classification_after',
  pg_temp.classification_hash(
    '44000000-0000-4000-8000-000000000001'
  )
);

select test_name, status, detail
from explicit_bank_results
order by test_name;

select key, value
from explicit_bank_evidence
order by key;

rollback;
