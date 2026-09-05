\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after applying migrations through
-- 20260905110018_matchday_publication_physical_placement_boundary_v15.sql.
-- Fixture state and every command are transaction-local and rolled back.
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

create temp table boundary_v15_results (
  test_number integer primary key,
  test_name text unique not null,
  status text not null check (status = 'PASS')
);

create function pg_temp.bank_id(p_article_id uuid)
returns uuid
language sql
stable
as $function$
  select bank_row.id
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id =
        '8a000000-0000-4000-8000-000000000001'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
        'editorial_article'
    and bank_row.source_id = p_article_id::text;
$function$;

create function pg_temp.state_token()
returns text
language sql
stable
as $function$
  select token_row.state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    '8a000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;
$function$;

create function pg_temp.classification_hash()
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
        '8a000000-0000-4000-8000-000000000001';
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
  '8a000000-0000-4000-8000-000000000010',
  'Boundary V15 Country',
  'boundary-v15-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  '8a000000-0000-4000-8000-000000000020',
  'Boundary V15 Competition',
  'liga-portugal',
  'Boundary V15 Country',
  '8a000000-0000-4000-8000-000000000010'
);

insert into public.seasons (id, competition_id, label)
values (
  '8a000000-0000-4000-8000-000000000030',
  '8a000000-0000-4000-8000-000000000020',
  'Boundary V15 2026/27'
);

insert into public.matchdays (id, season_id, number, label)
values
  (
    '8a000000-0000-4000-8000-000000000001',
    '8a000000-0000-4000-8000-000000000030',
    1,
    'Boundary V15 physical'
  ),
  (
    '8a000000-0000-4000-8000-000000000002',
    '8a000000-0000-4000-8000-000000000030',
    2,
    'Boundary V15 legacy'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '8a000000-0000-4000-8000-000000000001',
    '8a000000-0000-4000-8000-000000000030',
    true
  ),
  (
    '8a000000-0000-4000-8000-000000000002',
    '8a000000-0000-4000-8000-000000000030',
    false
  );

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values
  ('8a000000-0000-4000-8000-000000000001', 'liga_portugal_v1'),
  ('8a000000-0000-4000-8000-000000000002', 'liga_portugal_v1');

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
values
  (
    '8a000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"FC Porto","other_liga_clubs":"1 Liga","outside_liga_other":"Fora da Liga"}'::jsonb
  ),
  (
    '8a000000-0000-4000-8000-000000000002',
    'liga_portugal_v1',
    '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"FC Porto","other_liga_clubs":"1 Liga","outside_liga_other":"Fora da Liga"}'::jsonb
  );

select jornada_private.sync_matchday_live_layout_shadow(array[
  '8a000000-0000-4000-8000-000000000001'::uuid,
  '8a000000-0000-4000-8000-000000000002'::uuid
]);

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
  author,
  published_at,
  competition_id,
  season_id,
  matchday_id
)
values
  (
    '8a000000-0000-4000-8000-000000000101',
    'Boundary article A',
    'boundary-article-a',
    'published',
    'matchday',
    'TESTE',
    'Subtitle A',
    'Body A',
    'https://example.test/a.jpg',
    'Author A',
    '2026-09-05 10:30:00+00',
    '8a000000-0000-4000-8000-000000000020',
    '8a000000-0000-4000-8000-000000000030',
    '8a000000-0000-4000-8000-000000000001'
  ),
  (
    '8a000000-0000-4000-8000-000000000102',
    'Boundary article B',
    'boundary-article-b',
    'published',
    'matchday',
    'TESTE',
    'Subtitle B',
    'Body B',
    'https://example.test/b.jpg',
    'Author B',
    '2026-09-05 10:31:00+00',
    '8a000000-0000-4000-8000-000000000020',
    '8a000000-0000-4000-8000-000000000030',
    '8a000000-0000-4000-8000-000000000001'
  );

select public.upsert_matchday_editorial_bank_publication(
  '8a000000-0000-4000-8000-000000000001',
  'editorial_article',
  '8a000000-0000-4000-8000-000000000101',
  'boundary-article-a',
  'TESTE',
  'Boundary article A',
  'Subtitle A',
  'https://example.test/a.jpg',
  '/noticias/boundary-article-a'
);

select public.upsert_matchday_editorial_bank_publication(
  '8a000000-0000-4000-8000-000000000001',
  'editorial_article',
  '8a000000-0000-4000-8000-000000000102',
  'boundary-article-b',
  'TESTE',
  'Boundary article B',
  'Subtitle B',
  'https://example.test/b.jpg',
  '/noticias/boundary-article-b'
);

set constraints all immediate;
set constraints all deferred;

select pg_temp.assert_true(
  pg_temp.bank_id('8a000000-0000-4000-8000-000000000101') is not null
  and pg_temp.bank_id('8a000000-0000-4000-8000-000000000102') is not null,
  'canonical publication did not create both contextual Bank items'
);

insert into public.matchday_live_layout_workspace_settings (
  matchday_id,
  faixa_slot_count,
  headline_title_color,
  latest_zone_placement,
  latest_zone_title,
  video_module_active
)
values (
  '8a000000-0000-4000-8000-000000000001',
  8,
  '#AABBCC',
  'top',
  'Ultimas boundary',
  false
);

insert into jornada_private.matchday_live_layout_physical_cutovers (
  matchday_id,
  profile_key
)
values (
  '8a000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

select pg_temp.assert_true(
  (
    select settings_row.latest_zone_mode = 'latest_news'
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
  ),
  'first physical settings insert did not initialize Latest mode'
);

select *
from public.set_matchday_latest_news_settings_v15(
  '8a000000-0000-4000-8000-000000000001',
  'latest_news',
  null,
  null,
  false
);

select pg_temp.assert_true(
  (
    select editorial_row.latest_zone_mode = 'latest_news'
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
  ),
  'physical Latest mode was not projected downstream'
);

insert into boundary_v15_results values
  (1, 'physical Latest settings and downstream projection', 'PASS');

do $test$
begin
  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    '8a000000-0000-4000-8000-000000000001'
  );
  delete from public.matchday_editorials
  where matchday_id = '8a000000-0000-4000-8000-000000000001';
  perform jornada_private.end_matchday_live_layout_downstream_v14(
    '8a000000-0000-4000-8000-000000000001'
  );
end;
$test$;

select *
from public.set_matchday_latest_news_settings_v15(
  '8a000000-0000-4000-8000-000000000001',
  'latest_news',
  null,
  null,
  false
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and editorial_row.latest_zone_mode = 'latest_news'
      and editorial_row.latest_zone_title = 'Ultimas boundary'
  ),
  'Latest finalization did not recreate missing compatibility row downstream'
);

do $test$
begin
  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    '8a000000-0000-4000-8000-000000000001'
  );
  update public.matchday_editorials
  set latest_zone_title = 'Stale compatibility title'
  where matchday_id = '8a000000-0000-4000-8000-000000000001';
  perform jornada_private.end_matchday_live_layout_downstream_v14(
    '8a000000-0000-4000-8000-000000000001'
  );
end;
$test$;

select *
from public.set_matchday_latest_news_settings_v15(
  '8a000000-0000-4000-8000-000000000001',
  'latest_news',
  null,
  null,
  false
);

select pg_temp.assert_true(
  (
    select editorial_row.latest_zone_title = 'Ultimas boundary'
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
  ),
  'Latest finalization did not repair compatibility from physical settings'
);

insert into boundary_v15_results values
  (2, 'physical Latest without prior compatibility row', 'PASS');

do $test$
declare
  v_classification text := pg_temp.classification_hash();
  v_result record;
begin
  select * into strict v_result
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    pg_temp.state_token(),
    'place',
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
    'opening',
    null,
    2,
    null,
    true
  );

  perform pg_temp.assert_true(not v_result.no_op, 'first placement was a no-op');
  perform pg_temp.assert_true(
    v_classification = pg_temp.classification_hash(),
    'placement changed contextual classification'
  );
end;
$test$;

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and placement_row.bank_item_id =
          pg_temp.bank_id('8a000000-0000-4000-8000-000000000101')
      and placement_row.placement_type = 'opening'
      and placement_row.slot_position = 2
  ) and exists (
    select 1
    from public.matchday_highlights as highlight_row
    where highlight_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and highlight_row.sort_order = 1
      and highlight_row.link_url = '/noticias/boundary-article-a'
  ),
  'single placement or compatibility projection is missing'
);

insert into boundary_v15_results values
  (3, 'single physical placement and classification invariant', 'PASS');

do $test$
declare
  v_before record;
  v_token text := pg_temp.state_token();
  v_result record;
begin
  select * into strict v_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id =
        '8a000000-0000-4000-8000-000000000001'
    and placement_row.bank_item_id =
        pg_temp.bank_id('8a000000-0000-4000-8000-000000000101');

  select * into strict v_result
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    v_token,
    'place',
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
    'opening',
    null,
    2,
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
    false
  );

  perform pg_temp.assert_true(v_result.no_op, 'same placement is not no-op');
  perform pg_temp.assert_true(v_result.state_token = v_token,
    'no-op changed state token');
  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.id = v_before.id
        and placement_row.created_at = v_before.created_at
        and placement_row.updated_at = v_before.updated_at
    ),
    'no-op recreated placement or clocks'
  );
end;
$test$;

insert into boundary_v15_results values
  (4, 'real no-op preserves id clocks and token', 'PASS');

do $test$
declare
  v_stale_token text := pg_temp.state_token();
begin
  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    v_stale_token,
    'place',
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000102'),
    'opening',
    null,
    2,
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
    false
  );

  begin
    perform *
    from public.apply_matchday_live_layout_single_placement_v15(
      '8a000000-0000-4000-8000-000000000001',
      v_stale_token,
      'place',
      pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
      'opening',
      null,
      3,
      null,
      true
    );
    raise exception 'stale command unexpectedly passed';
  exception when others then
    if sqlerrm not like '%matchday-live-layout-single-v15-stale%' then
      raise;
    end if;
  end;
end;
$test$;

select pg_temp.assert_true(
  (
    select placement_row.bank_item_id =
           pg_temp.bank_id('8a000000-0000-4000-8000-000000000102')
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and placement_row.placement_type = 'opening'
      and placement_row.slot_position = 2
  ) and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and placement_row.slot_position = 3
  ),
  'stale call left partial placement DML'
);

insert into boundary_v15_results values
  (5, 'target replacement displaces and stale rolls back', 'PASS');

do $test$
begin
  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    pg_temp.state_token(),
    'bank',
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000102'),
    null,
    null,
    null,
    null,
    false
  );
end;
$test$;

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.bank_item_id =
          pg_temp.bank_id('8a000000-0000-4000-8000-000000000102')
  )
  and not exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.bank_item_id =
          pg_temp.bank_id('8a000000-0000-4000-8000-000000000102')
  )
  and exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and override_row.placement_target = 'bank'
      and override_row.source_id =
          '8a000000-0000-4000-8000-000000000102'
  ),
  'explicit Bank was confused with displaced memory'
);

insert into boundary_v15_results values
  (6, 'explicit Bank remains distinct from displaced', 'PASS');

do $test$
begin
  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    pg_temp.state_token(),
    'place',
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
    'opening',
    null,
    1,
    null,
    true
  );

  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    pg_temp.state_token(),
    'displace',
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
    'opening',
    null,
    1,
    null,
    false
  );
end;
$test$;

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where memory_row.bank_item_id =
          pg_temp.bank_id('8a000000-0000-4000-8000-000000000101')
      and memory_row.memory_kind = 'displaced'
  ) and exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.id =
          pg_temp.bank_id('8a000000-0000-4000-8000-000000000101')
      and bank_row.editorially_worked_at is not null
  ),
  'displaced memory or monotonic worked state is missing'
);

insert into boundary_v15_results values
  (7, 'Desalojada and NOVA monotonic state', 'PASS');

do $test$
begin
  begin
    update public.matchday_editorials
    set status = case when status = 'published' then 'draft' else 'published' end
    where matchday_id = '8a000000-0000-4000-8000-000000000001';
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

insert into boundary_v15_results values
  (8, 'v14 legacy writer sentinel remains active', 'PASS');

insert into public.matchday_latest_news (
  matchday_id,
  time_label,
  title,
  link_url,
  sort_order,
  status
)
values (
  '8a000000-0000-4000-8000-000000000001',
  '11:30 · TESTE',
  'Boundary article A',
  '/noticias/boundary-article-a',
  1,
  'published'
);

do $test$
declare
  v_placement_id uuid;
  v_zone_id uuid;
  v_slot integer;
  v_classification text;
begin
  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    pg_temp.state_token(),
    'place',
    pg_temp.bank_id('8a000000-0000-4000-8000-000000000101'),
    'opening',
    null,
    1,
    null,
    true
  );

  select placement_row.id, placement_row.zone_id, placement_row.slot_position
  into strict v_placement_id, v_zone_id, v_slot
  from public.matchday_live_layout_placements as placement_row
  where placement_row.bank_item_id =
        pg_temp.bank_id('8a000000-0000-4000-8000-000000000101');

  update public.editorial_articles
  set title = 'Boundary article A updated',
      subtitle = 'Subtitle A updated',
      image_url = 'https://example.test/a-updated.jpg'
  where id = '8a000000-0000-4000-8000-000000000101';

  v_classification := pg_temp.classification_hash();

  perform *
  from public.sync_editorial_article_live_snapshots_v15(
    '8a000000-0000-4000-8000-000000000101',
    'boundary-article-a'
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.id = v_placement_id
        and placement_row.zone_id is not distinct from v_zone_id
        and placement_row.slot_position = v_slot
    ),
    'snapshot refresh moved or recreated physical placement'
  );
  perform pg_temp.assert_true(
    v_classification = pg_temp.classification_hash(),
    'snapshot refresh changed contextual classification'
  );
end;
$test$;

select pg_temp.assert_true(
  (
    select latest_row.title = 'Boundary article A updated'
      and latest_row.subtitle is null
      and latest_row.image_url is null
    from public.matchday_latest_news as latest_row
    where latest_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and latest_row.sort_order = 1
  ) and (
    select editorial_row.title = 'Boundary article A updated'
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
  ) and (
    select bank_row.title = 'Boundary article A updated'
      and bank_row.subtitle = 'Subtitle A updated'
      and bank_row.image_url = 'https://example.test/a-updated.jpg'
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.id =
          pg_temp.bank_id('8a000000-0000-4000-8000-000000000101')
  ),
  'atomic snapshot refresh did not update Bank, Latest and compatibility'
);

insert into boundary_v15_results values
  (9, 'placed snapshot refresh preserves physical identity', 'PASS');

select *
from public.set_matchday_latest_news_settings_v15(
  '8a000000-0000-4000-8000-000000000002',
  'editorial_line',
  'Legacy Latest',
  '#112233',
  true
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id =
          '8a000000-0000-4000-8000-000000000002'
  ) and exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '8a000000-0000-4000-8000-000000000002'
      and editorial_row.latest_zone_mode = 'editorial_line'
      and editorial_row.latest_zone_title = 'Legacy Latest'
  ),
  'pre-cutover Latest compatibility path regressed'
);

insert into boundary_v15_results values
  (10, 'pre-cutover Latest remains functional', 'PASS');

select pg_temp.assert_true(
  pg_catalog.has_function_privilege(
    'service_role',
    'public.apply_matchday_live_layout_single_placement_v15(uuid,text,text,uuid,text,uuid,integer,uuid,boolean)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'anon',
    'public.apply_matchday_live_layout_single_placement_v15(uuid,text,text,uuid,text,uuid,integer,uuid,boolean)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.apply_matchday_live_layout_single_placement_v15(uuid,text,text,uuid,text,uuid,integer,uuid,boolean)',
    'EXECUTE'
  ),
  'single-placement command ACL is not service-role-only'
);

insert into boundary_v15_results values
  (11, 'service-role-only command ACL', 'PASS');

do $test$
declare
  v_classification_before jsonb;
begin
  select pg_catalog.jsonb_build_object(
    'key', bank_row.classification_key,
    'source', bank_row.classification_source,
    'at', bank_row.classified_at
  )
  into v_classification_before
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id =
        pg_temp.bank_id('8a000000-0000-4000-8000-000000000102');

  update public.editorial_articles
  set title = 'Boundary article B updated while unplaced',
      subtitle = 'Subtitle B updated while unplaced'
  where id = '8a000000-0000-4000-8000-000000000102';

  perform *
  from public.sync_editorial_article_live_snapshots_v15(
    '8a000000-0000-4000-8000-000000000102',
    'boundary-article-b'
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.id =
            pg_temp.bank_id('8a000000-0000-4000-8000-000000000102')
        and bank_row.title =
            'Boundary article B updated while unplaced'
        and bank_row.subtitle =
            'Subtitle B updated while unplaced'
        and pg_catalog.jsonb_build_object(
          'key', bank_row.classification_key,
          'source', bank_row.classification_source,
          'at', bank_row.classified_at
        ) = v_classification_before
    )
    and not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.bank_item_id =
            pg_temp.bank_id('8a000000-0000-4000-8000-000000000102')
    ),
    'unplaced snapshot refresh changed placement or classification'
  );
end;
$test$;

insert into boundary_v15_results values
  (12, 'unplaced Bank snapshot refresh does not create movement', 'PASS');

insert into public.editorial_contents (
  id,
  slug,
  status,
  scope,
  content_type,
  label,
  title,
  subtitle,
  image_url,
  published_at,
  competition_id,
  season_id,
  matchday_id
)
values (
  '8a000000-0000-4000-8000-000000000103',
  'boundary-content-c',
  'published',
  'matchday',
  'video',
  'VIDEO',
  'Boundary content C',
  'Subtitle C',
  'https://example.test/c.jpg',
  '2026-09-05 10:32:00+00',
  '8a000000-0000-4000-8000-000000000020',
  '8a000000-0000-4000-8000-000000000030',
  '8a000000-0000-4000-8000-000000000001'
);

select public.upsert_matchday_editorial_bank_publication(
  '8a000000-0000-4000-8000-000000000001',
  'editorial_content',
  '8a000000-0000-4000-8000-000000000103',
  'boundary-content-c',
  'VIDEO',
  'Boundary content C',
  'Subtitle C',
  'https://example.test/c.jpg',
  '/conteudos/boundary-content-c'
);

do $test$
declare
  v_bank_item_id uuid;
  v_placement_id uuid;
  v_classification text;
begin
  select bank_row.id into strict v_bank_item_id
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id =
        '8a000000-0000-4000-8000-000000000001'
    and bank_row.source_type = 'editorial_content'
    and bank_row.source_id =
        '8a000000-0000-4000-8000-000000000103';

  perform *
  from public.apply_matchday_live_layout_single_placement_v15(
    '8a000000-0000-4000-8000-000000000001',
    pg_temp.state_token(),
    'place',
    v_bank_item_id,
    'faixa',
    null,
    1,
    null,
    true
  );

  select placement_row.id into strict v_placement_id
  from public.matchday_live_layout_placements as placement_row
  where placement_row.bank_item_id = v_bank_item_id;

  update public.editorial_contents
  set title = 'Boundary content C updated',
      subtitle = 'Subtitle C updated',
      thumbnail_url = 'https://example.test/c-updated.jpg'
  where id = '8a000000-0000-4000-8000-000000000103';

  v_classification := pg_temp.classification_hash();

  perform *
  from public.sync_editorial_content_live_snapshots_v15(
    '8a000000-0000-4000-8000-000000000103',
    'boundary-content-c'
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.id = v_placement_id
        and placement_row.placement_type = 'faixa'
        and placement_row.slot_position = 1
    )
    and exists (
      select 1
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.id = v_bank_item_id
        and bank_row.title = 'Boundary content C updated'
        and bank_row.subtitle = 'Subtitle C updated'
        and bank_row.image_url = 'https://example.test/c-updated.jpg'
    )
    and exists (
      select 1
      from public.matchday_horizontal_news as horizontal_row
      where horizontal_row.matchday_id =
            '8a000000-0000-4000-8000-000000000001'
        and horizontal_row.sort_order = 1
        and horizontal_row.title = 'Boundary content C updated'
    )
    and v_classification = pg_temp.classification_hash(),
    'content snapshot refresh changed placement/classification or missed Bank'
  );
end;
$test$;

insert into boundary_v15_results values
  (13, 'canonical content snapshots stay downstream of physical', 'PASS');

select *
from public.set_matchday_roundup_presentation_v15(
  '8a000000-0000-4000-8000-000000000001',
  'roundup_video',
  null,
  'Boundary roundup',
  '#334455'
);

select *
from public.set_matchday_below_headline_presentation_v15(
  '8a000000-0000-4000-8000-000000000001',
  'roundup',
  'Boundary below headline',
  '#556677'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and settings_row.video_module_active = true
  ) and exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '8a000000-0000-4000-8000-000000000001'
      and editorial_row.complementary_mode = 'roundup_video'
      and editorial_row.roundup_video_heading = 'Boundary roundup'
      and editorial_row.below_headline_mode = 'roundup'
      and editorial_row.below_headline_heading = 'Boundary below headline'
  ),
  'presentation settings bypassed physical/downstream authority'
);

insert into boundary_v15_results values
  (14, 'Gestor presentation settings use explicit physical boundary', 'PASS');

select *
from public.set_matchday_roundup_presentation_v15(
  '8a000000-0000-4000-8000-000000000002',
  'none',
  null,
  'Legacy roundup heading',
  null
);

select *
from public.set_matchday_below_headline_presentation_v15(
  '8a000000-0000-4000-8000-000000000002',
  'roundup',
  'Legacy below headline',
  null
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id =
          '8a000000-0000-4000-8000-000000000002'
  ) and exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id =
          '8a000000-0000-4000-8000-000000000002'
      and editorial_row.complementary_mode = 'none'
      and editorial_row.roundup_video_heading = 'Legacy roundup heading'
      and editorial_row.below_headline_mode = 'roundup'
      and editorial_row.below_headline_heading = 'Legacy below headline'
  ),
  'pre-cutover presentation settings regressed'
);

insert into boundary_v15_results values
  (15, 'pre-cutover presentation settings remain functional', 'PASS');

select pg_temp.assert_true(
  (select pg_catalog.count(*) from boundary_v15_results) = 15,
  'fixture did not record all required checks'
);

table boundary_v15_results order by test_number;

rollback;
