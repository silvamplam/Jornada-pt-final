\set ON_ERROR_STOP on

-- Run against the production-schema snapshot after applying
-- 20260904120000_matchday_live_layout_physical_writer_v13_shadow.sql.
-- Every object created by this fixture is rolled back.
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

create function pg_temp.physical_placement(
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

create temp table physical_v13_fixture_items (
  item_kind text primary key,
  article_id uuid not null,
  bank_item_id uuid
);

create temp table physical_v13_evidence (
  key text primary key,
  value text not null
);

create temp table physical_v13_results (
  test_name text primary key,
  status text not null,
  detail text not null
);

create function pg_temp.expect_physical_writer_error(
  p_expected_error text,
  p_authoritative_placements jsonb,
  p_explicit_bank_item_ids jsonb default '[]'::jsonb,
  p_displaced_bank_item_ids jsonb default '[]'::jsonb,
  p_expected_state_token text default null
)
returns void
language plpgsql
as $function$
declare
  v_state_token text;
begin
  select token_row.state_token
  into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  begin
    perform *
    from jornada_private
      .apply_matchday_live_layout_physical_state_v13_shadow(
        '47000000-0000-4000-8000-000000000001',
        'liga_portugal_v1',
        coalesce(p_expected_state_token, v_state_token),
        p_authoritative_placements,
        p_explicit_bank_item_ids,
        p_displaced_bank_item_ids,
        '[]'::jsonb,
        '[]'::jsonb,
        '[]'::jsonb
      );
  exception
    when others then
      if pg_catalog.strpos(sqlerrm, p_expected_error) = 0 then
        raise exception 'unexpected-error: expected %, got %',
          p_expected_error,
          sqlerrm;
      end if;

      return;
  end;

  raise exception 'expected-error-not-raised: %', p_expected_error;
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
  '17000000-0000-4000-8000-000000000001',
  'Physical V13 Fixture Country',
  'physical-v13-fixture-country'
);

insert into public.competitions (
  id,
  name,
  slug,
  country,
  country_id
)
values (
  '27000000-0000-4000-8000-000000000001',
  'Physical V13 Fixture Competition',
  'liga-portugal',
  'Physical V13 Fixture Country',
  '17000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '37000000-0000-4000-8000-000000000001',
  '27000000-0000-4000-8000-000000000001',
  'Physical V13 2026/27',
  'physical-v13-2026-27'
);

insert into public.matchdays (id, season_id, number, label)
values
  (
    '47000000-0000-4000-8000-000000000001',
    '37000000-0000-4000-8000-000000000001',
    1,
    'Physical V13 live'
  ),
  (
    '47000000-0000-4000-8000-000000000002',
    '37000000-0000-4000-8000-000000000001',
    2,
    'Physical V13 other'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values (
  '47000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000001',
  true
);

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values (
  '47000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key
)
values (
  '47000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['47000000-0000-4000-8000-000000000001'::uuid]
);

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 5
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id =
          '47000000-0000-4000-8000-000000000001'
  ),
  'the five current physical zones were not built'
);

-- Five-zone cardinality accepts a completely sparse physical workspace.
do $test$
declare
  v_state_token text;
begin
  select token_row.state_token
  into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
end;
$test$;

insert into physical_v13_results values (
  '1 five-zone-cardinality',
  'PASS',
  'five physical zones and empty slots accepted'
);

insert into physical_v13_fixture_items (item_kind, article_id)
values
  ('sixth_zone', '57000000-0000-4000-8000-000000000001'),
  ('explicit_bank', '57000000-0000-4000-8000-000000000002'),
  ('displaced', '57000000-0000-4000-8000-000000000003'),
  ('faixa_existing', '57000000-0000-4000-8000-000000000004'),
  ('faixa_arrival', '57000000-0000-4000-8000-000000000005');

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
  'Physical V13 ' || fixture.item_kind,
  'physical-v13-' || pg_catalog.replace(fixture.article_id::text, '-', ''),
  'published',
  'matchday',
  'Fixture',
  'Physical V13 fixture',
  'Body excluded from the aggregate reader',
  'https://example.test/' || fixture.article_id::text || '.jpg',
  pg_catalog.transaction_timestamp(),
  '27000000-0000-4000-8000-000000000001',
  '37000000-0000-4000-8000-000000000001',
  '47000000-0000-4000-8000-000000000001'
from physical_v13_fixture_items as fixture;

update physical_v13_fixture_items as fixture
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '47000000-0000-4000-8000-000000000001'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      fixture.article_id::text;

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 5
    from physical_v13_fixture_items
    where bank_item_id is not null
  ),
  'fixture did not create all contextual Bank items'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from physical_v13_fixture_items as fixture
    order by fixture.bank_item_id
  )
);

update public.matchday_editorial_bank_items as bank_row
set classification_key = 'benfica',
    classification_source = 'manual',
    classified_at = '2026-09-04T12:00:00Z'::timestamptz
from physical_v13_fixture_items as fixture
where bank_row.id = fixture.bank_item_id
  and fixture.item_kind = 'sixth_zone';

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from physical_v13_fixture_items as fixture
    order by fixture.bank_item_id
  )
);

insert into physical_v13_evidence (key, value)
select
  'classification_before',
  pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'classification_key', bank_row.classification_key,
      'classification_source', bank_row.classification_source,
      'classified_at', bank_row.classified_at,
      'automatic_eligible', bank_row.automatic_eligible
    )::text
  )
from public.matchday_editorial_bank_items as bank_row
join physical_v13_fixture_items as fixture
  on fixture.bank_item_id = bank_row.id
where fixture.item_kind = 'sixth_zone';

insert into public.matchday_live_layout_zones (
  id,
  matchday_id,
  public_title,
  visual_family
)
values (
  '67000000-0000-4000-8000-000000000006',
  '47000000-0000-4000-8000-000000000001',
  'Sexta zona fisica',
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
  '77000000-0000-4000-8000-000000000006',
  '47000000-0000-4000-8000-000000000001',
  'zone',
  '67000000-0000-4000-8000-000000000006',
  pg_catalog.max(block_row.sort_order) + 1
from public.matchday_live_layout_blocks as block_row
where block_row.matchday_id =
      '47000000-0000-4000-8000-000000000001';

insert into public.matchday_live_layout_zones (
  id,
  matchday_id,
  public_title,
  visual_family
)
values (
  '67000000-0000-4000-8000-000000000099',
  '47000000-0000-4000-8000-000000000002',
  'Zona de outra Jornada',
  'six_news'
);

insert into public.matchday_live_layout_blocks (
  id,
  matchday_id,
  block_type,
  zone_id,
  sort_order
)
values (
  '77000000-0000-4000-8000-000000000099',
  '47000000-0000-4000-8000-000000000002',
  'zone',
  '67000000-0000-4000-8000-000000000099',
  1
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
    where projection_row.zone_id =
          '67000000-0000-4000-8000-000000000006'
  ),
  'sixth physical zone unexpectedly has a legacy projection'
);

do $test$
declare
  v_bank_item_id uuid;
  v_state_token text;
begin
  select fixture.bank_item_id
  into v_bank_item_id
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'sixth_zone';

  select token_row.state_token
  into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_bank_item_id,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        3
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_bank_item_id),
    '[]'::jsonb,
    '[]'::jsonb
  );
end;
$test$;

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join physical_v13_fixture_items as fixture
      on fixture.bank_item_id = placement_row.bank_item_id
    where fixture.item_kind = 'sixth_zone'
      and placement_row.matchday_id =
          '47000000-0000-4000-8000-000000000001'
      and placement_row.placement_type = 'zone'
      and placement_row.zone_id =
          '67000000-0000-4000-8000-000000000006'
      and placement_row.slot_position = 3
  ),
  'writer did not preserve sixth physical zone_id and slot_position'
);

select pg_temp.assert_true(
  (
    select bank_row.classification_key = 'benfica'
           and bank_row.classification_source = 'manual'
           and bank_row.editorially_worked_at is not null
    from public.matchday_editorial_bank_items as bank_row
    join physical_v13_fixture_items as fixture
      on fixture.bank_item_id = bank_row.id
    where fixture.item_kind = 'sixth_zone'
  ),
  'classification or worked state was not preserved'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
    where projection_row.zone_id =
          '67000000-0000-4000-8000-000000000006'
  ),
  'writer created a forbidden legacy projection for the sixth zone'
);

insert into physical_v13_results values (
  '2 sixth-zone-no-legacy',
  'PASS',
  'benfica participation placed at sixth zone slot 3 without projection'
);

-- A no-op apply must preserve placement identity and both clocks.
do $test$
declare
  v_bank_item_id uuid;
  v_state_token text;
  v_before jsonb;
  v_after jsonb;
begin
  select fixture.bank_item_id
  into v_bank_item_id
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'sixth_zone';

  select pg_catalog.to_jsonb(placement_row)
  into v_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id =
        '47000000-0000-4000-8000-000000000001'
    and placement_row.bank_item_id = v_bank_item_id;

  select token_row.state_token
  into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_bank_item_id,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        3
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );

  select pg_catalog.to_jsonb(placement_row)
  into v_after
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id =
        '47000000-0000-4000-8000-000000000001'
    and placement_row.bank_item_id = v_bank_item_id;

  perform pg_temp.assert_true(
    v_before = v_after,
    'no-op apply rewrote an identical placement or its clocks'
  );
end;
$test$;

insert into physical_v13_results values (
  '3 minimal-plan-clocks',
  'PASS',
  'identical physical placement is untouched'
);

-- Validation failures are isolated subtransactions and leave the fixture intact.
do $test$
declare
  v_first uuid;
  v_second uuid;
begin
  select fixture.bank_item_id into v_first
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'sixth_zone';

  select fixture.bank_item_id into v_second
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'explicit_bank';

  perform pg_temp.expect_physical_writer_error(
    'zone-invalid',
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        7
      )
    )
  );

  perform pg_temp.expect_physical_writer_error(
    'zone-invalid',
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000099',
        1
      )
    )
  );

  perform pg_temp.expect_physical_writer_error(
    'duplicate-target',
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        1
      ),
      pg_temp.physical_placement(
        v_second,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        1
      )
    )
  );

  perform pg_temp.expect_physical_writer_error(
    'duplicate-bank-item',
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        1
      ),
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        2
      )
    )
  );

  perform pg_temp.expect_physical_writer_error(
    'bank-placement-conflict',
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        1
      )
    ),
    pg_catalog.jsonb_build_array(v_first)
  );

  perform pg_temp.expect_physical_writer_error(
    'displaced-placement-conflict',
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        1
      )
    ),
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_first)
  );

  perform pg_temp.expect_physical_writer_error(
    'concurrent-write',
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_first,
        'zone',
        '67000000-0000-4000-8000-000000000006',
        3
      )
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    'stale-v13-token'
  );
end;
$test$;

insert into physical_v13_results values (
  '4 physical-validation',
  'PASS',
  'capacity, foreign zone, duplicates, state conflicts and OCC fail closed'
);

-- Empty authoritative placements are valid and leave every physical slot empty.
do $test$
declare
  v_state_token text;
begin
  select token_row.state_token
  into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
end;
$test$;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '47000000-0000-4000-8000-000000000001'
  ),
  'slots-empty apply retained a physical placement'
);

insert into physical_v13_results values (
  '5 slots-empty',
  'PASS',
  'authoritative empty placement set is accepted'
);

-- Converge explicit Banco and displaced state, then prove their clocks are stable.
do $test$
declare
  v_explicit uuid;
  v_displaced uuid;
  v_state_token text;
  v_recorded_at timestamptz;
begin
  select fixture.bank_item_id into v_explicit
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'explicit_bank';

  select fixture.bank_item_id into v_displaced
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'displaced';

  select token_row.state_token into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_explicit),
    pg_catalog.jsonb_build_array(v_displaced),
    '[]'::jsonb,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_displaced)
  );

  select memory_row.recorded_at into v_recorded_at
  from public.matchday_live_layout_bank_item_state_memory as memory_row
  where memory_row.matchday_id =
        '47000000-0000-4000-8000-000000000001'
    and memory_row.bank_item_id = v_displaced
    and memory_row.memory_kind = 'displaced';

  select token_row.state_token into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_explicit),
    pg_catalog.jsonb_build_array(v_displaced),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id =
            '47000000-0000-4000-8000-000000000001'
        and memory_row.bank_item_id = v_displaced
        and memory_row.memory_kind = 'displaced'
        and memory_row.recorded_at = v_recorded_at
    ),
    'existing displaced recorded_at changed'
  );

  perform pg_temp.assert_true(
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
            '47000000-0000-4000-8000-000000000001'
        and override_row.profile_key = 'liga_portugal_v1'
        and override_row.placement_target = 'bank'
        and override_row.zone_key is null
        and override_row.sort_order is null
        and bank_row.id = v_explicit
    ),
    'explicit Banco override did not converge'
  );
end;
$test$;

insert into physical_v13_results values (
  '6 bank-displaced-clocks',
  'PASS',
  'explicit Banco converged and existing displaced clock preserved'
);

-- Faixa reorder recreates the moved row in the physical core, but the writer
-- restores the previous arrival clock and timestamps only the real arrival.
do $test$
declare
  v_explicit uuid;
  v_displaced uuid;
  v_existing uuid;
  v_arrival uuid;
  v_state_token text;
  v_existing_created_at timestamptz;
begin
  select fixture.bank_item_id into v_explicit
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'explicit_bank';

  select fixture.bank_item_id into v_displaced
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'displaced';

  select fixture.bank_item_id into v_existing
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'faixa_existing';

  select fixture.bank_item_id into v_arrival
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'faixa_arrival';

  select token_row.state_token into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(v_existing, 'faixa', null, 1)
    ),
    pg_catalog.jsonb_build_array(v_explicit),
    pg_catalog.jsonb_build_array(v_displaced),
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_existing),
    '[]'::jsonb
  );

  select placement_row.created_at into v_existing_created_at
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id =
        '47000000-0000-4000-8000-000000000001'
    and placement_row.bank_item_id = v_existing;

  select token_row.state_token into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(v_arrival, 'faixa', null, 1),
      pg_temp.physical_placement(v_existing, 'faixa', null, 2)
    ),
    pg_catalog.jsonb_build_array(v_explicit),
    pg_catalog.jsonb_build_array(v_displaced),
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_arrival),
    '[]'::jsonb
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id =
            '47000000-0000-4000-8000-000000000001'
        and placement_row.bank_item_id = v_existing
        and placement_row.placement_type = 'faixa'
        and placement_row.slot_position = 2
        and placement_row.created_at = v_existing_created_at
    ),
    'existing Faixa arrival clock changed during reorder'
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements as arrival_row
      join public.matchday_live_layout_placements as existing_row
        on existing_row.matchday_id = arrival_row.matchday_id
       and existing_row.bank_item_id = v_existing
      where arrival_row.matchday_id =
            '47000000-0000-4000-8000-000000000001'
        and arrival_row.bank_item_id = v_arrival
        and arrival_row.created_at > existing_row.created_at
    ),
    'new Faixa arrival did not receive a newer event clock'
  );
end;
$test$;

insert into physical_v13_results values (
  '7 faixa-event-clocks',
  'PASS',
  'existing Faixa clock preserved and new arrival ordered deterministically'
);

-- Token covers physical zone metadata directly.
do $test$
declare
  v_before text;
  v_after text;
begin
  select token_row.state_token into v_before
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  update public.matchday_live_layout_zones
  set public_title = 'Sexta zona fisica alterada'
  where id = '67000000-0000-4000-8000-000000000006';

  select token_row.state_token into v_after
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform pg_temp.assert_true(
    v_before is distinct from v_after,
    'v13 token ignored physical zone title change'
  );
end;
$test$;

insert into physical_v13_results values (
  '8 token-physical-occ',
  'PASS',
  'direct physical zone metadata changes the v13 token'
);

-- Remove three unoccupied zones and prove there is no hidden cardinality five.
delete from public.matchday_live_layout_zones as zone_row
where zone_row.matchday_id = '47000000-0000-4000-8000-000000000001'
  and zone_row.id in (
    select candidate.id
    from public.matchday_live_layout_zones as candidate
    where candidate.matchday_id =
          '47000000-0000-4000-8000-000000000001'
      and candidate.id <>
          '67000000-0000-4000-8000-000000000006'
    order by candidate.id
    limit 3
  );

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 3
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id =
          '47000000-0000-4000-8000-000000000001'
  ),
  'fixture did not reach three-zone cardinality'
);

do $test$
declare
  v_explicit uuid;
  v_displaced uuid;
  v_existing uuid;
  v_arrival uuid;
  v_state_token text;
begin
  select fixture.bank_item_id into v_explicit
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'explicit_bank';
  select fixture.bank_item_id into v_displaced
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'displaced';
  select fixture.bank_item_id into v_existing
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'faixa_existing';
  select fixture.bank_item_id into v_arrival
  from physical_v13_fixture_items as fixture
  where fixture.item_kind = 'faixa_arrival';

  select token_row.state_token into v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '47000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(v_arrival, 'faixa', null, 1),
      pg_temp.physical_placement(v_existing, 'faixa', null, 2)
    ),
    pg_catalog.jsonb_build_array(v_explicit),
    pg_catalog.jsonb_build_array(v_displaced),
    '[]'::jsonb,
    '[]'::jsonb,
    '[]'::jsonb
  );
end;
$test$;

insert into physical_v13_results values (
  '9 three-zone-cardinality',
  'PASS',
  'three physical zones accepted without classification changes'
);

select pg_temp.assert_true(
  (
    select evidence.value = pg_catalog.md5(
      pg_catalog.jsonb_build_object(
        'classification_key', bank_row.classification_key,
        'classification_source', bank_row.classification_source,
        'classified_at', bank_row.classified_at,
        'automatic_eligible', bank_row.automatic_eligible
      )::text
    )
    from physical_v13_evidence as evidence
    join physical_v13_fixture_items as fixture
      on fixture.item_kind = 'sixth_zone'
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = fixture.bank_item_id
    where evidence.key = 'classification_before'
  ),
  'writer changed classification_key/source/classified_at/automatic_eligible'
);

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege(
    'anon',
    'jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'shadow writer has external EXECUTE privilege'
);

insert into physical_v13_results values (
  '10 classification-access',
  'PASS',
  'classification unchanged and shadow writer fully private'
);

select test_name, status, detail
from physical_v13_results
order by test_name;

rollback;
