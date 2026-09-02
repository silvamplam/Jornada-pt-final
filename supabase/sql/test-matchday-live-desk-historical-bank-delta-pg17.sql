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

create function pg_temp.live_page_hash(
  p_matchday_id uuid
)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'desk', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.matchday_id),
          '[]'::jsonb
        )
        from public.matchday_editorial_desk_control as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'placements', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_placements as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'bank', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_editorial_bank_items as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'zones', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_zones as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'blocks', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_blocks as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'latest', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_latest_news as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'roundup', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.id),
          '[]'::jsonb
        )
        from public.matchday_roundup_items as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'memory', (
        select coalesce(
          pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value) order by row_value.bank_item_id),
          '[]'::jsonb
        )
        from public.matchday_live_layout_bank_item_state_memory as row_value
        where row_value.matchday_id = p_matchday_id
      )
    )::text
  );
$function$;

create temp table delta_results (
  test_name text primary key,
  status text not null,
  detail text not null
);

create temp table delta_evidence (
  key text primary key,
  value text not null
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
  '11000000-0000-4000-8000-000000000001',
  'Delta Country',
  'delta-country'
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
  'Delta Liga Portugal',
  'liga-portugal',
  'Delta Country',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.seasons (
  id,
  competition_id,
  label,
  slug
)
values (
  '31000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  'Delta 2026/27',
  'delta-2026-27'
);

insert into public.matchdays (
  id,
  season_id,
  number,
  label
)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    1,
    'Delta J01'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000001',
    2,
    'Delta J02'
  ),
  (
    '41000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000001',
    3,
    'Delta J03'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '31000000-0000-4000-8000-000000000001',
    true
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '31000000-0000-4000-8000-000000000001',
    false
  ),
  (
    '41000000-0000-4000-8000-000000000003',
    '31000000-0000-4000-8000-000000000001',
    false
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
    '51000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    'Delta 1',
    'Delta live item 1',
    'Delta live subtitle 1',
    'https://example.test/delta-1.jpg',
    'https://example.test/delta-1',
    'manual_link',
    'delta-source-1',
    1
  ),
  (
    '51000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000001',
    'Delta 2',
    'Delta live item 2',
    'Delta live subtitle 2',
    'https://example.test/delta-2.jpg',
    'https://example.test/delta-2',
    'manual_link',
    'delta-source-2',
    2
  );

select public.apply_matchday_live_layout_movement(
  '41000000-0000-4000-8000-000000000001',
  'place',
  '51000000-0000-4000-8000-000000000001',
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
  '71000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '10:00',
  'Delta Latest',
  'Delta Latest subtitle',
  'https://example.test/delta-latest',
  'https://example.test/delta-latest.jpg',
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
  '72000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'Vídeo',
  'Delta Roundup',
  'Delta Roundup subtitle',
  'https://example.test/delta-roundup.jpg',
  'https://example.test/delta-roundup.mp4',
  'resumo',
  1,
  'published'
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
  '61000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'draft',
  false,
  'Delta N first publication',
  'standard'
);

do $test$
declare
  v_result jsonb;
begin
  perform pg_temp.assert_true(
    (select is_managed
     from public.matchday_editorial_desk_control
     where matchday_id = '41000000-0000-4000-8000-000000000001'),
    'N was not the live Mesa before first publication'
  );

  v_result := public.publish_matchday_reference_composition(
    '41000000-0000-4000-8000-000000000001',
    '61000000-0000-4000-8000-000000000001'
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'first_publication'
      and (v_result ->> 'materialized')::boolean
      and (v_result ->> 'sourceRetired')::boolean,
    'N to N+1 did not use first-publication continuity'
  );
  perform pg_temp.assert_true(
    (select not is_managed
     from public.matchday_editorial_desk_control
     where matchday_id = '41000000-0000-4000-8000-000000000001')
      and (select is_managed
           from public.matchday_editorial_desk_control
           where matchday_id = '41000000-0000-4000-8000-000000000002'),
    'Mesa authority did not move from N to N+1'
  );
  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_editorial_profile_assignments
      where matchday_id = '41000000-0000-4000-8000-000000000002'
        and profile_key = 'liga_portugal_v1'
    )
      and exists (
        select 1
        from public.matchday_editorial_profile_reconcile_control
        where matchday_id = '41000000-0000-4000-8000-000000000002'
          and profile_key = 'liga_portugal_v1'
      )
      and exists (
        select 1 from public.matchday_live_layout_zones
        where matchday_id = '41000000-0000-4000-8000-000000000002'
      )
      and exists (
        select 1 from public.matchday_live_layout_blocks
        where matchday_id = '41000000-0000-4000-8000-000000000002'
      )
      and exists (
        select 1 from public.matchday_live_layout_placements
        where matchday_id = '41000000-0000-4000-8000-000000000002'
      )
      and exists (
        select 1 from public.matchday_editorial_bank_items
        where matchday_id = '41000000-0000-4000-8000-000000000002'
      )
      and exists (
        select 1 from public.matchday_latest_news
        where matchday_id = '41000000-0000-4000-8000-000000000002'
      )
      and exists (
        select 1 from public.matchday_roundup_items
        where matchday_id = '41000000-0000-4000-8000-000000000002'
      ),
    'N+1 was not operational immediately in the same Mesa architecture'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_editorial_continuity_transitions
     where source_matchday_id = '41000000-0000-4000-8000-000000000001'
       and target_matchday_id = '41000000-0000-4000-8000-000000000002'
       and continuity_version = 6),
    'N to N+1 transition was not unique'
  );

  insert into delta_results values (
    'A MESA N TO N+1',
    'PASS',
    v_result::text
  );
end;
$test$;

do $test$
declare
  v_current_bank_id uuid;
  v_result jsonb;
begin
  select id
  into v_current_bank_id
  from public.matchday_editorial_bank_items
  where matchday_id = '41000000-0000-4000-8000-000000000002'
    and source_id = 'delta-source-1';

  v_result := public.apply_matchday_live_layout_movement(
    '41000000-0000-4000-8000-000000000002',
    'place',
    v_current_bank_id,
    'faixa',
    null,
    2,
    null,
    false
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements
      where matchday_id = '41000000-0000-4000-8000-000000000002'
        and bank_item_id = v_current_bank_id
        and placement_type = 'faixa'
        and slot_position = 2
    ),
    'N+1 Mesa did not move the inherited item'
  );

  insert into delta_results values (
    'A N+1 MOVEMENT',
    'PASS',
    v_result::text
  );
end;
$test$;

insert into public.matchday_reference_compositions (
  id,
  matchday_id,
  status,
  is_current,
  internal_name,
  presentation_mode
)
values (
  '61000000-0000-4000-8000-000000000002',
  '41000000-0000-4000-8000-000000000002',
  'draft',
  false,
  'Delta N+1 first publication',
  'standard'
);

do $test$
declare
  v_result jsonb;
begin
  v_result := public.publish_matchday_reference_composition(
    '41000000-0000-4000-8000-000000000002',
    '61000000-0000-4000-8000-000000000002'
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'first_publication'
      and (v_result ->> 'materialized')::boolean
      and (v_result ->> 'sourceRetired')::boolean,
    'N+1 to N+2 did not use first-publication continuity'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_editorial_desk_control
     where season_id = '31000000-0000-4000-8000-000000000001'
       and is_managed = true)
      and (select is_managed
           from public.matchday_editorial_desk_control
           where matchday_id = '41000000-0000-4000-8000-000000000003'),
    'Mesa authority did not move uniquely to N+2'
  );
  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_editorial_profile_assignments
      where matchday_id = '41000000-0000-4000-8000-000000000003'
        and profile_key = 'liga_portugal_v1'
    )
      and exists (
        select 1 from public.matchday_live_layout_zones
        where matchday_id = '41000000-0000-4000-8000-000000000003'
      )
      and exists (
        select 1 from public.matchday_live_layout_blocks
        where matchday_id = '41000000-0000-4000-8000-000000000003'
      )
      and exists (
        select 1 from public.matchday_live_layout_placements
        where matchday_id = '41000000-0000-4000-8000-000000000003'
      )
      and exists (
        select 1 from public.matchday_editorial_bank_items
        where matchday_id = '41000000-0000-4000-8000-000000000003'
      ),
    'N+2 was not immediately operational in the same Mesa architecture'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_editorial_continuity_transitions
     where source_matchday_id = '41000000-0000-4000-8000-000000000002'
       and target_matchday_id = '41000000-0000-4000-8000-000000000003'
       and continuity_version = 6),
    'N+1 to N+2 transition was not unique'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1 from public.matchday_live_layout_placements
      where matchday_id in (
        '41000000-0000-4000-8000-000000000001',
        '41000000-0000-4000-8000-000000000002'
      )
    )
      and not exists (
        select 1 from public.matchday_live_layout_bank_item_state_memory
        where matchday_id in (
          '41000000-0000-4000-8000-000000000001',
          '41000000-0000-4000-8000-000000000002'
        )
      ),
    'historical sources retained live placements or memory'
  );

  insert into delta_results values (
    'B GENERALIZATION N+1 TO N+2',
    'PASS',
    v_result::text
  );
end;
$test$;

insert into delta_evidence (key, value)
values (
  'live_n2_before_historical_article',
  pg_temp.live_page_hash('41000000-0000-4000-8000-000000000003')
);

insert into delta_evidence (key, value)
select
  'transition_n_n1_before_historical_article',
  pg_catalog.to_jsonb(transition_row)::text
from public.matchday_editorial_continuity_transitions as transition_row
where transition_row.source_matchday_id =
  '41000000-0000-4000-8000-000000000001';

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
values (
  '81000000-0000-4000-8000-000000000001',
  'Novo artigo para Delta J01 histórica',
  'novo-artigo-delta-j01-historica',
  'published',
  'matchday',
  'Delta histórico',
  'Novo artigo contextual depois do retirement',
  'Corpo editorial de teste.',
  'https://example.test/delta-historical-article.jpg',
  pg_catalog.now(),
  '21000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001'
);

do $test$
declare
  v_bank_id uuid;
begin
  select bank_row.id
  into v_bank_id
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = '41000000-0000-4000-8000-000000000001'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) = 'editorial_article'
    and bank_row.source_id = '81000000-0000-4000-8000-000000000001';

  perform pg_temp.assert_true(
    v_bank_id is not null,
    'published historical article did not enter its own Bank'
  );
  perform pg_temp.assert_true(
    (select not is_managed
     from public.matchday_editorial_desk_control
     where matchday_id = '41000000-0000-4000-8000-000000000001')
      and not exists (
        select 1 from public.matchday_live_layout_placements
        where matchday_id = '41000000-0000-4000-8000-000000000001'
      )
      and not exists (
        select 1 from public.matchday_live_layout_bank_item_state_memory
        where matchday_id = '41000000-0000-4000-8000-000000000001'
      ),
    'historical article publication resurrected live state'
  );
  perform pg_temp.assert_true(
    pg_temp.live_page_hash('41000000-0000-4000-8000-000000000003')
      = (select value from delta_evidence where key = 'live_n2_before_historical_article'),
    'historical article publication changed current Mesa N+2'
  );

  insert into delta_results values (
    'C ARTICLE TO HISTORICAL BANK',
    'PASS',
    'article=81000000-0000-4000-8000-000000000001 bank=' || v_bank_id::text
  );
end;
$test$;

do $test$
declare
  v_bank_id uuid;
  v_draft_id uuid;
  v_old_public_id uuid;
  v_result jsonb;
begin
  select id
  into v_old_public_id
  from public.matchday_reference_compositions
  where matchday_id = '41000000-0000-4000-8000-000000000001'
    and status = 'published'
    and is_current = true;

  select bank_row.id
  into v_bank_id
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = '41000000-0000-4000-8000-000000000001'
    and bank_row.source_type = 'editorial_article'
    and bank_row.source_id = '81000000-0000-4000-8000-000000000001';

  v_draft_id := public.reopen_matchday_reference_composition(
    '41000000-0000-4000-8000-000000000001',
    v_old_public_id
  );

  insert into public.matchday_reference_composition_items (
    id,
    composition_id,
    slot_type,
    source_type,
    source_id,
    article_id,
    sort_order,
    label_snapshot,
    title_snapshot,
    subtitle_snapshot,
    image_url_snapshot,
    link_url_snapshot,
    status
  )
  select
    '62000000-0000-4000-8000-000000000001',
    v_draft_id,
    'editorial_line_item',
    'matchday_editorial_bank_item',
    bank_row.id,
    null,
    1,
    bank_row.label,
    bank_row.title,
    bank_row.subtitle,
    bank_row.image_url,
    bank_row.link_url,
    'draft'
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = v_bank_id
    and bank_row.matchday_id = '41000000-0000-4000-8000-000000000001'
    and bank_row.status = 'active';

  perform pg_temp.assert_true(
    (select status = 'published' and is_current
     from public.matchday_reference_compositions
     where id = v_old_public_id)
      and exists (
        select 1
        from public.matchday_reference_composition_items
        where composition_id = v_draft_id
          and source_type = 'matchday_editorial_bank_item'
          and source_id = v_bank_id
          and title_snapshot = 'Novo artigo para Delta J01 histórica'
      ),
    'draft save did not preserve old public or use historical Bank article'
  );
  perform pg_temp.assert_true(
    pg_temp.live_page_hash('41000000-0000-4000-8000-000000000003')
      = (select value from delta_evidence where key = 'live_n2_before_historical_article'),
    'historical draft save changed current Mesa N+2'
  );

  v_result := public.publish_matchday_reference_composition(
    '41000000-0000-4000-8000-000000000001',
    v_draft_id
  );

  perform pg_temp.assert_true(
    v_result ->> 'publicationKind' = 'historical_republish'
      and (v_result ->> 'materialized')::boolean = false
      and (v_result ->> 'transitionPreserved')::boolean,
    'historical article composition publish repeated continuity'
  );
  perform pg_temp.assert_true(
    (select status = 'published' and is_current
     from public.matchday_reference_compositions
     where id = v_draft_id)
      and pg_temp.live_page_hash('41000000-0000-4000-8000-000000000003')
        = (select value from delta_evidence where key = 'live_n2_before_historical_article'),
    'historical republish did not switch current atomically or changed N+2'
  );
  perform pg_temp.assert_true(
    (select count(*) = 1
     from public.matchday_editorial_continuity_transitions
     where source_matchday_id = '41000000-0000-4000-8000-000000000001'
       and target_matchday_id = '41000000-0000-4000-8000-000000000002'
       and continuity_version = 6)
      and (select pg_catalog.to_jsonb(transition_row)::text
           from public.matchday_editorial_continuity_transitions as transition_row
           where transition_row.source_matchday_id = '41000000-0000-4000-8000-000000000001')
        = (select value
           from delta_evidence
           where key = 'transition_n_n1_before_historical_article'),
    'historical republish changed or duplicated original transition'
  );
  perform pg_temp.assert_true(
    (select not is_managed
     from public.matchday_editorial_desk_control
     where matchday_id = '41000000-0000-4000-8000-000000000001')
      and not exists (
        select 1 from public.matchday_live_layout_placements
        where matchday_id = '41000000-0000-4000-8000-000000000001'
      )
      and not exists (
        select 1 from public.matchday_live_layout_bank_item_state_memory
        where matchday_id = '41000000-0000-4000-8000-000000000001'
      ),
    'historical composition work resurrected N live state'
  );

  insert into delta_results values (
    'D-E HISTORICAL COMPOSITION WITHOUT LIVE RESURRECTION',
    'PASS',
    v_result::text
  );
end;
$test$;

set constraints all immediate;

select
  pg_catalog.current_setting('server_version') as postgres_version,
  (
    select authority_mode
    from jornada_private.matchday_live_layout_cutover_control
    where scope = 'live_layout'
  ) as authority_mode,
  (
    select count(*)
    from public.matchday_editorial_desk_control
    where season_id = '31000000-0000-4000-8000-000000000001'
      and is_managed = true
  ) as managed_desk_count,
  pg_temp.live_page_hash(
    '41000000-0000-4000-8000-000000000003'
  ) as live_n2_hash_after;

select test_name, status, detail
from delta_results
order by test_name;

select
  (select value
   from delta_evidence
   where key = 'live_n2_before_historical_article') as live_n2_hash_before,
  pg_temp.live_page_hash(
    '41000000-0000-4000-8000-000000000003'
  ) as live_n2_hash_after,
  (
    select count(*)
    from public.matchday_editorial_continuity_transitions
    where source_matchday_id = '41000000-0000-4000-8000-000000000001'
      and target_matchday_id = '41000000-0000-4000-8000-000000000002'
      and continuity_version = 6
  ) as original_transition_count,
  (
    select count(*)
    from public.matchday_live_layout_placements
    where matchday_id = '41000000-0000-4000-8000-000000000001'
  ) as historical_placements,
  (
    select count(*)
    from public.matchday_live_layout_bank_item_state_memory
    where matchday_id = '41000000-0000-4000-8000-000000000001'
  ) as historical_memory;

rollback;
