\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after applying migrations through
-- 20260905123608_matchday_contextual_classification_physical_boundary_v16.sql.
-- All fixture data is transaction-local and rolled back.
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

create temp table boundary_v16_results (
  test_number integer primary key,
  test_name text unique not null,
  status text not null check (status = 'PASS')
);

create function pg_temp.physical_bank_id(p_article_id uuid)
returns uuid
language sql
stable
as $function$
  select bank_row.id
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id =
        '8b000000-0000-4000-8000-000000000001'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
        'editorial_article'
    and bank_row.source_id = p_article_id::text;
$function$;

create function pg_temp.physical_token()
returns text
language sql
stable
as $function$
  select token_row.state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '8b000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;
$function$;

create function pg_temp.physical_classification_hash()
returns text
language sql
stable
as $function$
  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', bank_row.id,
        'classification_key', bank_row.classification_key,
        'classification_source', bank_row.classification_source,
        'classified_at', bank_row.classified_at
      ) order by bank_row.id
    ),
    '[]'::jsonb
  )::text)
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id =
        '8b000000-0000-4000-8000-000000000001';
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
  '8b000000-0000-4000-8000-000000000010',
  'Boundary V16 Country',
  'boundary-v16-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  '8b000000-0000-4000-8000-000000000020',
  'Boundary V16 Competition',
  'liga-portugal',
  'Boundary V16 Country',
  '8b000000-0000-4000-8000-000000000010'
);

insert into public.seasons (id, competition_id, label)
values (
  '8b000000-0000-4000-8000-000000000030',
  '8b000000-0000-4000-8000-000000000020',
  'Boundary V16 2026/27'
);

insert into public.matchdays (id, season_id, number, label)
values
  (
    '8b000000-0000-4000-8000-000000000001',
    '8b000000-0000-4000-8000-000000000030',
    1,
    'Boundary V16 physical'
  ),
  (
    '8b000000-0000-4000-8000-000000000002',
    '8b000000-0000-4000-8000-000000000030',
    2,
    'Boundary V16 legacy'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '8b000000-0000-4000-8000-000000000001',
    '8b000000-0000-4000-8000-000000000030',
    true
  ),
  (
    '8b000000-0000-4000-8000-000000000002',
    '8b000000-0000-4000-8000-000000000030',
    false
  );

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values
  ('8b000000-0000-4000-8000-000000000001', 'liga_portugal_v1'),
  ('8b000000-0000-4000-8000-000000000002', 'liga_portugal_v1');

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
values
  (
    '8b000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"FC Porto","other_liga_clubs":"1 Liga","outside_liga_other":"Fora da Liga"}'::jsonb
  ),
  (
    '8b000000-0000-4000-8000-000000000002',
    'liga_portugal_v1',
    '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"FC Porto","other_liga_clubs":"1 Liga","outside_liga_other":"Fora da Liga"}'::jsonb
  );

select jornada_private.sync_matchday_live_layout_shadow(array[
  '8b000000-0000-4000-8000-000000000001'::uuid,
  '8b000000-0000-4000-8000-000000000002'::uuid
]);

-- Seven physical zones prove that the five-key contextual taxonomy is not a
-- physical topology limit. The two additional zones deliberately have no
-- legacy projection.
insert into public.matchday_live_layout_zones (
  id,
  matchday_id,
  public_title,
  visual_family
)
values
  (
    '8b000000-0000-4000-8000-000000000061',
    '8b000000-0000-4000-8000-000000000001',
    'Physical zone 6',
    'six_news'
  ),
  (
    '8b000000-0000-4000-8000-000000000062',
    '8b000000-0000-4000-8000-000000000001',
    'Physical zone 7',
    'five_news_balanced'
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
    '8b000000-0000-4000-8000-000000000071',
    '8b000000-0000-4000-8000-000000000001',
    'zone',
    '8b000000-0000-4000-8000-000000000061',
    100
  ),
  (
    '8b000000-0000-4000-8000-000000000072',
    '8b000000-0000-4000-8000-000000000001',
    'zone',
    '8b000000-0000-4000-8000-000000000062',
    101
  );

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
values (
  '8b000000-0000-4000-8000-000000000101',
  'Residual classification article',
  'boundary-v16-residual',
  'published',
  'matchday',
  'TESTE',
  'Residual before cutover',
  'Body',
  'Author',
  '2026-09-05 10:01:00+00',
  '8b000000-0000-4000-8000-000000000020',
  '8b000000-0000-4000-8000-000000000030',
  '8b000000-0000-4000-8000-000000000001'
);

select public.upsert_matchday_editorial_bank_publication(
  '8b000000-0000-4000-8000-000000000001',
  'editorial_article',
  '8b000000-0000-4000-8000-000000000101',
  'boundary-v16-residual',
  'TESTE',
  'Residual classification article',
  'Residual before cutover',
  null,
  '/noticias/boundary-v16-residual'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_editorial_profile_state_items as state_row
    where state_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
      and state_row.source_id =
          '8b000000-0000-4000-8000-000000000101'
      and state_row.zone_key is not null
  ),
  'pre-cutover seed did not create residual automatic state'
);

insert into public.matchday_editorials (matchday_id, updated_at)
values (
  '8b000000-0000-4000-8000-000000000001',
  pg_catalog.statement_timestamp()
)
on conflict (matchday_id) do nothing;

insert into public.matchday_live_layout_workspace_settings (
  matchday_id,
  faixa_slot_count,
  headline_title_color,
  latest_zone_placement,
  latest_zone_title,
  video_module_active
)
values (
  '8b000000-0000-4000-8000-000000000001',
  8,
  '#112233',
  'top',
  'Ultimas V16',
  false
);

insert into jornada_private.matchday_live_layout_physical_cutovers (
  matchday_id,
  profile_key
)
values (
  '8b000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

-- A. Publication/Bank after cutover still materializes classification, but
-- creates neither legacy automatic state nor physical placement.
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
values
  (
    '8b000000-0000-4000-8000-000000000102',
    'Post-cutover article NOVA',
    'boundary-v16-new',
    'published',
    'matchday',
    'TESTE',
    'New after cutover',
    'Body',
    'Author',
    '2026-09-05 10:02:00+00',
    '8b000000-0000-4000-8000-000000000020',
    '8b000000-0000-4000-8000-000000000030',
    '8b000000-0000-4000-8000-000000000001'
  ),
  (
    '8b000000-0000-4000-8000-000000000103',
    'Post-cutover explicit Bank article',
    'boundary-v16-bank',
    'published',
    'matchday',
    'TESTE',
    'Explicit Bank',
    'Body',
    'Author',
    '2026-09-05 10:03:00+00',
    '8b000000-0000-4000-8000-000000000020',
    '8b000000-0000-4000-8000-000000000030',
    '8b000000-0000-4000-8000-000000000001'
  ),
  (
    '8b000000-0000-4000-8000-000000000104',
    'Post-cutover displaced article',
    'boundary-v16-displaced',
    'published',
    'matchday',
    'TESTE',
    'Displaced',
    'Body',
    'Author',
    '2026-09-05 10:04:00+00',
    '8b000000-0000-4000-8000-000000000020',
    '8b000000-0000-4000-8000-000000000030',
    '8b000000-0000-4000-8000-000000000001'
  );

select public.upsert_matchday_editorial_bank_publication(
  '8b000000-0000-4000-8000-000000000001',
  'editorial_article',
  article_row.id::text,
  article_row.slug,
  article_row.label,
  article_row.title,
  article_row.subtitle,
  article_row.image_url,
  '/noticias/' || article_row.slug
)
from public.editorial_articles as article_row
where article_row.id in (
  '8b000000-0000-4000-8000-000000000102'::uuid,
  '8b000000-0000-4000-8000-000000000103'::uuid,
  '8b000000-0000-4000-8000-000000000104'::uuid
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.id = pg_temp.physical_bank_id(
      '8b000000-0000-4000-8000-000000000102'
    )
      and bank_row.classification_key is not null
      and bank_row.classification_source = 'automatic'
      and bank_row.classified_at is not null
  )
  and not exists (
    select 1
    from public.matchday_editorial_profile_state_items as state_row
    where state_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
      and state_row.source_id in (
        '8b000000-0000-4000-8000-000000000102',
        '8b000000-0000-4000-8000-000000000103',
        '8b000000-0000-4000-8000-000000000104'
      )
  )
  and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
  ),
  'post-cutover publication coupled classification to a positional state'
);

insert into boundary_v16_results values
  (1, 'post-cutover publication classifies without distribution', 'PASS');

-- B. Latest can update Bank/classification without touching positional state.
do $test$
declare
  v_state_count bigint;
  v_placement_count bigint;
begin
  select pg_catalog.count(*) into v_state_count
  from public.matchday_editorial_profile_state_items
  where matchday_id = '8b000000-0000-4000-8000-000000000001';

  select pg_catalog.count(*) into v_placement_count
  from public.matchday_live_layout_placements
  where matchday_id = '8b000000-0000-4000-8000-000000000001';

  insert into public.matchday_latest_news (
    matchday_id,
    time_label,
    title,
    link_url,
    sort_order,
    status
  ) values (
    '8b000000-0000-4000-8000-000000000001',
    '10:05 - TESTE',
    'Post-cutover article NOVA',
    '/noticias/boundary-v16-new',
    1,
    'published'
  );

  perform pg_temp.assert_true(
    v_state_count = (
      select pg_catalog.count(*)
      from public.matchday_editorial_profile_state_items
      where matchday_id = '8b000000-0000-4000-8000-000000000001'
    )
    and v_placement_count = (
      select pg_catalog.count(*)
      from public.matchday_live_layout_placements
      where matchday_id = '8b000000-0000-4000-8000-000000000001'
    ),
    'Latest caused automatic distribution or physical placement'
  );
end;
$test$;

insert into boundary_v16_results values
  (2, 'Latest preserves independent classification and occupancy', 'PASS');

-- Create an authoritative placement in physical zone 6.
select *
from public.apply_matchday_live_layout_single_placement_v15(
  '8b000000-0000-4000-8000-000000000001',
  pg_temp.physical_token(),
  'place',
  pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000101'),
  'zone',
  '8b000000-0000-4000-8000-000000000061',
  2,
  null,
  true
);

-- C. Manual classification changes semantics and nothing about placement.
do $test$
declare
  v_before record;
  v_state_before text;
begin
  select placement_row.* into strict v_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id =
        '8b000000-0000-4000-8000-000000000001'
    and placement_row.bank_item_id = pg_temp.physical_bank_id(
      '8b000000-0000-4000-8000-000000000101'
    );

  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(state_row) order by state_row.id),
    '[]'::jsonb
  )::text)
  into v_state_before
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = '8b000000-0000-4000-8000-000000000001';

  perform *
  from public.apply_matchday_editorial_bank_manual_classification_v1(
    '8b000000-0000-4000-8000-000000000001',
    pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000101'),
    'sporting'
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.id = pg_temp.physical_bank_id(
        '8b000000-0000-4000-8000-000000000101'
      )
        and bank_row.classification_key = 'sporting'
        and bank_row.classification_source = 'manual'
        and bank_row.classified_at is not null
    )
    and exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.id = v_before.id
        and placement_row.zone_id = v_before.zone_id
        and placement_row.slot_position = v_before.slot_position
        and placement_row.created_at = v_before.created_at
        and placement_row.updated_at = v_before.updated_at
    )
    and v_state_before = (
      select pg_catalog.md5(coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(state_row) order by state_row.id
        ),
        '[]'::jsonb
      )::text)
      from public.matchday_editorial_profile_state_items as state_row
      where state_row.matchday_id =
            '8b000000-0000-4000-8000-000000000001'
    ),
    'manual classification changed physical placement or residual legacy state'
  );
end;
$test$;

insert into boundary_v16_results values
  (3, 'manual classification leaves physical placement invariant', 'PASS');

-- D. Movement from zone 6 to zone 7 leaves contextual classification intact.
do $test$
declare
  v_classification text := pg_temp.physical_classification_hash();
begin
  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8b000000-0000-4000-8000-000000000001',
    pg_temp.physical_token(),
    'place',
    pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000101'),
    'zone',
    '8b000000-0000-4000-8000-000000000062',
    4,
    null,
    true
  );

  perform pg_temp.assert_true(
    v_classification = pg_temp.physical_classification_hash()
    and exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.bank_item_id = pg_temp.physical_bank_id(
        '8b000000-0000-4000-8000-000000000101'
      )
        and placement_row.zone_id =
            '8b000000-0000-4000-8000-000000000062'
        and placement_row.slot_position = 4
    ),
    'physical movement changed classification or failed on extra zone'
  );
end;
$test$;

insert into boundary_v16_results values
  (4, 'movement across additional zones preserves classification', 'PASS');

-- E/F. Assignment and direct refresh are inert for physical distribution.
do $test$
declare
  v_state_hash text;
  v_refresh_result integer;
begin
  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(state_row) order by state_row.id),
    '[]'::jsonb
  )::text)
  into v_state_hash
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id =
        '8b000000-0000-4000-8000-000000000001';

  update public.matchday_editorial_profile_assignments
  set updated_at = pg_catalog.statement_timestamp()
  where matchday_id = '8b000000-0000-4000-8000-000000000001';

  select public.refresh_matchday_editorial_profile_distribution(
    '8b000000-0000-4000-8000-000000000001'
  ) into v_refresh_result;

  perform pg_temp.assert_true(
    v_refresh_result = 0
    and not exists (
      select 1
      from public.matchday_editorial_profile_distribution_plan(
        '8b000000-0000-4000-8000-000000000001'
      )
    )
    and v_state_hash = (
      select pg_catalog.md5(coalesce(
        pg_catalog.jsonb_agg(
          pg_catalog.to_jsonb(state_row) order by state_row.id
        ),
        '[]'::jsonb
      )::text)
      from public.matchday_editorial_profile_state_items as state_row
      where state_row.matchday_id =
            '8b000000-0000-4000-8000-000000000001'
    ),
    'assignment or direct refresh reopened physical automatic distribution'
  );
end;
$test$;

insert into boundary_v16_results values
  (5, 'assignment and direct refresh are marker-aware', 'PASS');

-- G. The same distribution contract remains operational before cutover.
insert into public.editorial_articles (
  id,
  title,
  slug,
  status,
  scope,
  label,
  body,
  author,
  published_at,
  competition_id,
  season_id,
  matchday_id
)
values (
  '8b000000-0000-4000-8000-000000000105',
  'Legacy automatic distribution article',
  'boundary-v16-legacy',
  'published',
  'matchday',
  'TESTE',
  'Body',
  'Author',
  '2026-09-05 10:05:00+00',
  '8b000000-0000-4000-8000-000000000020',
  '8b000000-0000-4000-8000-000000000030',
  '8b000000-0000-4000-8000-000000000002'
);

select public.upsert_matchday_editorial_bank_publication(
  '8b000000-0000-4000-8000-000000000002',
  'editorial_article',
  '8b000000-0000-4000-8000-000000000105',
  'boundary-v16-legacy',
  'TESTE',
  'Legacy automatic distribution article',
  null,
  null,
  '/noticias/boundary-v16-legacy'
);

select pg_temp.assert_true(
  public.refresh_matchday_editorial_profile_distribution(
    '8b000000-0000-4000-8000-000000000002'
  ) > 0
  and exists (
    select 1
    from public.matchday_editorial_profile_state_items as state_row
    where state_row.matchday_id =
          '8b000000-0000-4000-8000-000000000002'
      and state_row.source_id =
          '8b000000-0000-4000-8000-000000000105'
      and state_row.zone_key is not null
      and state_row.sort_order is not null
  ),
  'pre-cutover legacy distribution stopped working'
);

insert into boundary_v16_results values
  (6, 'pre-cutover legacy distribution remains functional', 'PASS');

-- H/I. Residual state is invisible to the physical reader and both physical
-- token names; genuine settings and placements still change physical OCC.
do $test$
declare
  v_physical_token text := pg_temp.physical_token();
  v_desk_token text;
  v_desk_token_after text;
  v_settings_token text;
begin
  select token_row.state_token into strict v_desk_token
  from public.matchday_editorial_profile_workspace_token(
    '8b000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  update public.matchday_editorial_profile_state_items
  set zone_key = 'fc_porto',
      sort_order = 5,
      updated_at = pg_catalog.statement_timestamp()
  where matchday_id = '8b000000-0000-4000-8000-000000000001'
    and source_id = '8b000000-0000-4000-8000-000000000101';

  select token_row.state_token into strict v_desk_token_after
  from public.matchday_editorial_profile_workspace_token(
    '8b000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  perform pg_temp.assert_true(
    v_physical_token = pg_temp.physical_token()
    and v_desk_token = v_desk_token_after
    and not exists (
      select 1
      from public.read_matchday_live_desk_aggregate_tracking(
        '8b000000-0000-4000-8000-000000000001',
        'liga_portugal_v1'
      ) as tracking_row
      where tracking_row.has_automatic_state
        or tracking_row.automatic_zone_key is not null
        or tracking_row.automatic_sort_order is not null
        or tracking_row.inactive_historical_count <> 0
    ),
    'residual state changed physical OCC or leaked as current occupancy'
  );

  perform *
  from public.set_matchday_latest_news_settings_v15(
    '8b000000-0000-4000-8000-000000000001',
    'editorial_line',
    null,
    null,
    false
  );

  v_settings_token := pg_temp.physical_token();
  perform pg_temp.assert_true(
    v_settings_token is distinct from v_physical_token,
    'authoritative physical settings did not change physical OCC token'
  );

  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8b000000-0000-4000-8000-000000000001',
    v_settings_token,
    'place',
    pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000101'),
    'zone',
    '8b000000-0000-4000-8000-000000000062',
    3,
    null,
    true
  );

  perform pg_temp.assert_true(
    pg_temp.physical_token() is distinct from v_settings_token,
    'authoritative physical placement did not change physical OCC token'
  );
end;
$test$;

insert into boundary_v16_results values
  (7, 'residual state is inert while physical OCC remains sensitive', 'PASS');

-- J. Classification does not advance NOVA through the editorial circuit.
select *
from public.apply_matchday_editorial_bank_manual_classification_v1(
  '8b000000-0000-4000-8000-000000000001',
  pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000102'),
  'benfica'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.read_matchday_live_desk_aggregate_tracking(
      '8b000000-0000-4000-8000-000000000001',
      'liga_portugal_v1'
    ) as tracking_row
    where tracking_row.bank_item_id = pg_temp.physical_bank_id(
      '8b000000-0000-4000-8000-000000000102'
    )
      and tracking_row.classification_key = 'benfica'
      and tracking_row.editorial_state = 'NOVA'
      and tracking_row.placement_count = 0
  ),
  'manual classification removed an item from NOVA'
);

insert into boundary_v16_results values
  (8, 'classification preserves NOVA', 'PASS');

-- K. Explicit Banco remains an explicit circuit decision after classification.
select *
from public.apply_matchday_live_layout_single_placement_v15(
  '8b000000-0000-4000-8000-000000000001',
  pg_temp.physical_token(),
  'bank',
  pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000103'),
  null,
  null,
  null,
  null,
  false
);

select *
from public.apply_matchday_editorial_bank_manual_classification_v1(
  '8b000000-0000-4000-8000-000000000001',
  pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000103'),
  'fc_porto'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
      and override_row.source_id =
          '8b000000-0000-4000-8000-000000000103'
      and override_row.placement_target = 'bank'
  )
  and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.bank_item_id = pg_temp.physical_bank_id(
      '8b000000-0000-4000-8000-000000000103'
    )
  ),
  'classification changed explicit Banco into placement or memory'
);

insert into boundary_v16_results values
  (9, 'classification preserves explicit Banco', 'PASS');

-- L. Desalojada memory survives classification unchanged.
select *
from public.apply_matchday_live_layout_single_placement_v15(
  '8b000000-0000-4000-8000-000000000001',
  pg_temp.physical_token(),
  'place',
  pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000104'),
  'opening',
  null,
  1,
  null,
  true
);

select *
from public.apply_matchday_live_layout_single_placement_v15(
  '8b000000-0000-4000-8000-000000000001',
  pg_temp.physical_token(),
  'displace',
  pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000104'),
  'opening',
  null,
  1,
  null,
  false
);

select *
from public.apply_matchday_editorial_bank_manual_classification_v1(
  '8b000000-0000-4000-8000-000000000001',
  pg_temp.physical_bank_id('8b000000-0000-4000-8000-000000000104'),
  'outside_liga_other'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.bank_item_id = pg_temp.physical_bank_id(
      '8b000000-0000-4000-8000-000000000104'
    )
      and memory_row.memory_kind = 'displaced'
  )
  and exists (
    select 1
    from public.read_matchday_live_desk_aggregate_tracking(
      '8b000000-0000-4000-8000-000000000001',
      'liga_portugal_v1'
    ) as tracking_row
    where tracking_row.bank_item_id = pg_temp.physical_bank_id(
      '8b000000-0000-4000-8000-000000000104'
    )
      and tracking_row.classification_key = 'outside_liga_other'
      and tracking_row.editorial_state = 'DESALOJADA'
  ),
  'classification changed displaced memory/state'
);

insert into boundary_v16_results values
  (10, 'classification preserves Desalojada', 'PASS');

-- M. Seven-zone topology is independent of the five-key taxonomy.
select pg_temp.assert_true(
  (
    select pg_catalog.count(*) = 7
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
  )
  and (
    select pg_catalog.count(*) = 5
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
    where projection_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
  )
  and exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
      and placement_row.zone_id =
          '8b000000-0000-4000-8000-000000000062'
  )
  and not exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id =
          '8b000000-0000-4000-8000-000000000001'
      and bank_row.classification_key not in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
  ),
  'contextual taxonomy limited or erased the seven-zone physical topology'
);

insert into boundary_v16_results values
  (11, 'five classifications remain independent of seven zones', 'PASS');

-- N. Existing v14/v15 fences still catch an external legacy occupation write.
do $test$
begin
  begin
    update public.matchday_editorials
    set status = case
      when status = 'published' then 'draft'
      else 'published'
    end
    where matchday_id = '8b000000-0000-4000-8000-000000000001';
    raise exception 'legacy writer unexpectedly passed';
  exception when others then
    if sqlerrm not like
       '%matchday-live-layout-legacy-placement-after-physical-cutover%'
    then
      raise;
    end if;
  end;
end;
$test$;

insert into boundary_v16_results values
  (12, 'legacy writer sentinel remains active', 'PASS');

select pg_temp.assert_true(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.refresh_matchday_editorial_profile_distribution(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.refresh_matchday_editorial_profile_distribution(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.refresh_matchday_editorial_profile_distribution(uuid)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'service_role',
    'public.matchday_editorial_profile_distribution_plan(uuid)',
    'EXECUTE'
  ),
  'v16 direct entrypoint ACL boundary is invalid'
);

insert into boundary_v16_results values
  (13, 'distribution entrypoint ACL remains least-privilege', 'PASS');

select *
from boundary_v16_results
order by test_number;

do $test$
declare
  v_pass_count integer;
begin
  select pg_catalog.count(*)::integer
  into v_pass_count
  from boundary_v16_results
  where status = 'PASS';

  if v_pass_count <> 13 then
    raise exception 'boundary-v16-pass-count:%', v_pass_count;
  end if;
end;
$test$;

rollback;
