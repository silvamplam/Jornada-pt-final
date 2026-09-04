\set ON_ERROR_STOP on

-- Run after 20260904130000_matchday_live_layout_workspace_v13_reader.sql.
-- This fixture exercises only local state and every fixture write is rolled back.
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

create temp table workspace_v13_fixture_items (
  item_kind text primary key,
  article_id uuid not null,
  bank_item_id uuid
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
  '11000000-0000-4000-8000-000000000001',
  'Workspace V13 Fixture Country',
  'workspace-v13-fixture-country'
);

insert into public.competitions (
  id,
  name,
  slug,
  country,
  country_id
)
values (
  '21000000-0000-4000-8000-000000000001',
  'Workspace V13 Fixture Competition',
  'liga-portugal',
  'Workspace V13 Fixture Country',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Workspace V13 2026/27',
  'workspace-v13-2026-27'
);

insert into public.matchdays (id, season_id, number, label)
values (
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  1,
  'Workspace V13 live'
);

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values (
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  true
);

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values (
  '41000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key
)
values (
  '41000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['41000000-0000-4000-8000-000000000001'::uuid]
);

-- The sixth physical zone intentionally has no legacy projection.
insert into public.matchday_live_layout_zones (
  id,
  matchday_id,
  public_title,
  visual_family
)
values (
  '61000000-0000-4000-8000-000000000006',
  '41000000-0000-4000-8000-000000000001',
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
  '71000000-0000-4000-8000-000000000006',
  '41000000-0000-4000-8000-000000000001',
  'zone',
  '61000000-0000-4000-8000-000000000006',
  pg_catalog.max(block_row.sort_order) + 1
from public.matchday_live_layout_blocks as block_row
where block_row.matchday_id =
      '41000000-0000-4000-8000-000000000001';

insert into workspace_v13_fixture_items (item_kind, article_id)
values
  ('sixth_zone', '51000000-0000-4000-8000-000000000001'),
  ('opening', '51000000-0000-4000-8000-000000000002'),
  ('explicit_bank', '51000000-0000-4000-8000-000000000003'),
  ('displaced', '51000000-0000-4000-8000-000000000004');

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
  'Workspace V13 ' || fixture.item_kind,
  'workspace-v13-' || pg_catalog.replace(fixture.article_id::text, '-', ''),
  'published',
  'matchday',
  'Fixture',
  'Workspace V13 fixture',
  'Body excluded from the reader',
  'https://example.test/' || fixture.article_id::text || '.jpg',
  pg_catalog.transaction_timestamp(),
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001'
from workspace_v13_fixture_items as fixture;

update workspace_v13_fixture_items as fixture
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
      '41000000-0000-4000-8000-000000000001'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      fixture.article_id::text;

select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 4
    from workspace_v13_fixture_items
    where bank_item_id is not null
  ),
  'fixture did not create all contextual Bank items'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from workspace_v13_fixture_items as fixture
    where fixture.item_kind = 'sixth_zone'
  )
);

update public.matchday_editorial_bank_items as bank_row
set classification_key = 'sporting',
    classification_source = 'manual',
    classified_at = '2026-09-04T13:00:00Z'::timestamptz
from workspace_v13_fixture_items as fixture
where bank_row.id = fixture.bank_item_id
  and fixture.item_kind = 'sixth_zone';

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from workspace_v13_fixture_items as fixture
    where fixture.item_kind = 'sixth_zone'
  )
);

do $setup$
declare
  v_zone_item uuid;
  v_opening uuid;
  v_explicit uuid;
  v_displaced uuid;
  v_state_token text;
begin
  select fixture.bank_item_id into strict v_zone_item
  from workspace_v13_fixture_items as fixture
  where fixture.item_kind = 'sixth_zone';

  select fixture.bank_item_id into strict v_opening
  from workspace_v13_fixture_items as fixture
  where fixture.item_kind = 'opening';

  select fixture.bank_item_id into strict v_explicit
  from workspace_v13_fixture_items as fixture
  where fixture.item_kind = 'explicit_bank';

  select fixture.bank_item_id into strict v_displaced
  from workspace_v13_fixture_items as fixture
  where fixture.item_kind = 'displaced';

  select token_row.state_token into strict v_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '41000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform *
  from jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    '41000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_state_token,
    pg_catalog.jsonb_build_array(
      pg_temp.physical_placement(
        v_zone_item,
        'zone',
        '61000000-0000-4000-8000-000000000006',
        3
      ),
      pg_temp.physical_placement(v_opening, 'opening', null, 1)
    ),
    pg_catalog.jsonb_build_array(v_explicit),
    pg_catalog.jsonb_build_array(v_displaced),
    pg_catalog.jsonb_build_array(v_zone_item),
    '[]'::jsonb,
    '[]'::jsonb
  );
end;
$setup$;

do $test$
declare
  v_reader record;
  v_direct_token text;
  v_zone_item uuid;
  v_explicit uuid;
  v_displaced uuid;
begin
  select fixture.bank_item_id into strict v_zone_item
  from workspace_v13_fixture_items as fixture
  where fixture.item_kind = 'sixth_zone';

  select fixture.bank_item_id into strict v_explicit
  from workspace_v13_fixture_items as fixture
  where fixture.item_kind = 'explicit_bank';

  select fixture.bank_item_id into strict v_displaced
  from workspace_v13_fixture_items as fixture
  where fixture.item_kind = 'displaced';

  select * into strict v_reader
  from public.read_matchday_live_layout_workspace_v13(
    '41000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  );

  select token_row.state_token into strict v_direct_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '41000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform pg_temp.assert_true(
    v_reader.state_token = v_direct_token,
    'reader token is not the v13 OCC token'
  );
  perform pg_temp.assert_true(
    pg_catalog.jsonb_array_length(v_reader.zones) = 6,
    'sixth physical zone was hidden'
  );
  perform pg_temp.assert_true(
    pg_catalog.jsonb_array_length(v_reader.legacy_zone_projection) = 5,
    'legacy_zone_projection is not the explicit five-row bridge'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        v_reader.legacy_zone_projection
      ) as projection(value)
      where projection.value ->> 'zone_id' =
            '61000000-0000-4000-8000-000000000006'
    ),
    'sixth physical zone gained an inferred projection'
  );
  perform pg_temp.assert_true(
    exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_reader.placements) as placement(value)
      where placement.value ->> 'bank_item_id' = v_zone_item::text
        and placement.value ->> 'placement_type' = 'zone'
        and placement.value ->> 'zone_id' =
            '61000000-0000-4000-8000-000000000006'
        and (placement.value ->> 'slot_position')::integer = 3
    ),
    'physical zone placement or sparse slot was not returned'
  );
  perform pg_temp.assert_true(
    v_reader.explicit_bank_item_ids @>
      pg_catalog.jsonb_build_array(v_explicit),
    'explicit_bank_item_ids does not contain the explicit Bank item'
  );
  perform pg_temp.assert_true(
    v_reader.displaced_bank_item_ids @>
      pg_catalog.jsonb_build_array(v_displaced),
    'displaced_bank_item_ids does not contain the displaced item'
  );
  perform pg_temp.assert_true(
    v_reader.worked_bank_item_ids @>
      pg_catalog.jsonb_build_array(v_zone_item),
    'worked_bank_item_ids does not contain the worked item'
  );
  perform pg_temp.assert_true(
    exists (
      select 1
      from pg_catalog.jsonb_array_elements(v_reader.bank_items) as bank(value)
      where bank.value ->> 'id' = v_zone_item::text
        and bank.value ->> 'classification_key' = 'sporting'
        and bank.value ->> 'classification_source' = 'manual'
    ),
    'classification was not observed independently from zone_id'
  );
end;
$test$;

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  ),
  'reader privileges are not service_role only'
);

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'writer v13 unexpectedly gained external EXECUTE'
);

select
  'PASS' as status,
  'workspace v13 reader preserves physical state and explicit compatibility metadata'
    as detail;

rollback;
