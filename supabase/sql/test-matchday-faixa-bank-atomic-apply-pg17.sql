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

create temp table faixa_bank_results (
  test_name text primary key,
  status text not null,
  detail text not null
);

create temp table faixa_bank_evidence (
  key text primary key,
  value text not null
);

create temp table faixa_bank_fixture_items (
  item_kind text not null,
  slot_position integer not null,
  zone_key text,
  classification_key text not null,
  article_id uuid not null default pg_catalog.gen_random_uuid(),
  bank_item_id uuid
);

create function pg_temp.logical_placement_hash(
  p_matchday_id uuid,
  p_placement_types text[]
)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'bank_item_id', placement_row.bank_item_id,
          'placement_type', placement_row.placement_type,
          'zone_id', placement_row.zone_id,
          'slot_position', placement_row.slot_position
        )
        order by
          placement_row.placement_type,
          placement_row.zone_id nulls first,
          placement_row.slot_position,
          placement_row.bank_item_id
      ),
      '[]'::jsonb
    )::text
  )
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = any(p_placement_types);
$function$;

create function pg_temp.classification_hash(
  p_matchday_id uuid
)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(
    coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', bank_row.id,
          'automatic_eligible', bank_row.automatic_eligible,
          'continuity_source_matchday_id',
            bank_row.continuity_source_matchday_id,
          'continuity_source_composition_id',
            bank_row.continuity_source_composition_id,
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

create function pg_temp.workspace_hash(
  p_matchday_id uuid
)
returns text
language sql
stable
as $function$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'placements', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          ),
          '[]'::jsonb
        )
        from public.matchday_live_layout_placements as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'memory', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.bank_item_id
          ),
          '[]'::jsonb
        )
        from public.matchday_live_layout_bank_item_state_memory as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'overrides', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          ),
          '[]'::jsonb
        )
        from public.matchday_editorial_profile_manual_overrides as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'zone_items', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          ),
          '[]'::jsonb
        )
        from public.matchday_editorial_profile_zone_items as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'control', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.profile_key
          ),
          '[]'::jsonb
        )
        from public.matchday_editorial_profile_reconcile_control as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'editorial', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          ),
          '[]'::jsonb
        )
        from public.matchday_editorials as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'highlights', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          ),
          '[]'::jsonb
        )
        from public.matchday_highlights as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'selection', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          ),
          '[]'::jsonb
        )
        from public.matchday_live_layout_items as row_value
        where row_value.matchday_id = p_matchday_id
      ),
      'faixa_compatibility', (
        select coalesce(
          pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(row_value)
            order by row_value.id
          ),
          '[]'::jsonb
        )
        from public.matchday_horizontal_news as row_value
        where row_value.matchday_id = p_matchday_id
      )
    )::text
  );
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
  '12000000-0000-4000-8000-000000000001',
  'Faixa Bank Fixture Country',
  'faixa-bank-fixture-country'
);

insert into public.competitions (
  id,
  name,
  slug,
  country,
  country_id
)
values (
  '22000000-0000-4000-8000-000000000001',
  'Faixa Bank Fixture Competition',
  'liga-portugal',
  'Faixa Bank Fixture Country',
  '12000000-0000-4000-8000-000000000001'
);

insert into public.seasons (id, competition_id, label, slug)
values (
  '32000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Faixa Bank Fixture 2026/27',
  'faixa-bank-fixture-2026-27'
);

insert into public.matchdays (id, season_id, number, label)
values
  (
    '42000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    1,
    'Faixa Bank Source'
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000001',
    2,
    'Faixa Bank Live'
  );

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values
  (
    '42000000-0000-4000-8000-000000000001',
    '32000000-0000-4000-8000-000000000001',
    false
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    '32000000-0000-4000-8000-000000000001',
    true
  );

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values (
  '42000000-0000-4000-8000-000000000002',
  'liga_portugal_v1'
);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key
)
values (
  '42000000-0000-4000-8000-000000000002',
  'liga_portugal_v1'
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['42000000-0000-4000-8000-000000000002'::uuid]
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
  '62000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000001',
  'published',
  true,
  'Faixa Bank Continuity Certificate',
  'standard'
);

insert into public.matchday_editorial_continuity_transitions (
  source_matchday_id,
  target_matchday_id,
  source_composition_id,
  continuity_version
)
values (
  '42000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000002',
  '62000000-0000-4000-8000-000000000001',
  6
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
  '42000000-0000-4000-8000-000000000002',
  'Vídeo',
  'Faixa Bank Fixture Roundup',
  'Roundup publicado para o módulo de vídeo',
  'https://example.test/faixa-bank-roundup.jpg',
  'https://example.test/faixa-bank-roundup.mp4',
  'resumo',
  1,
  'published'
);

insert into faixa_bank_fixture_items (
  item_kind,
  slot_position,
  zone_key,
  classification_key
)
select 'opening', position, null, 'benfica'
from pg_catalog.generate_series(1, 5) as position
union all
select 'selection', position, null, 'sporting'
from pg_catalog.generate_series(1, 4) as position
union all
select 'video_highlight', 1, null, 'sporting'
union all
select 'zone', position, zone_key, zone_key
from (
  values
    ('benfica'::text, 6),
    ('sporting'::text, 5),
    ('fc_porto'::text, 5),
    ('other_liga_clubs'::text, 6),
    ('outside_liga_other'::text, 5)
) as zone(zone_key, capacity)
cross join lateral pg_catalog.generate_series(1, zone.capacity) as position
union all
select 'faixa', position, null, 'outside_liga_other'
from pg_catalog.generate_series(1, 12) as position;

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
  pg_catalog.format(
    'Fixture %s %s',
    fixture.item_kind,
    fixture.slot_position
  ),
  'faixa-bank-' || pg_catalog.replace(fixture.article_id::text, '-', ''),
  'published',
  'matchday',
  'Fixture',
  'Faixa Bank atomic apply fixture',
  'Fixture body',
  'https://example.test/' || fixture.article_id::text || '.jpg',
  pg_catalog.clock_timestamp(),
  '22000000-0000-4000-8000-000000000001',
  '32000000-0000-4000-8000-000000000001',
  '42000000-0000-4000-8000-000000000002'
from faixa_bank_fixture_items as fixture;

update faixa_bank_fixture_items as fixture
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id =
    '42000000-0000-4000-8000-000000000002'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
    'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
    fixture.article_id::text;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 49
   from faixa_bank_fixture_items
   where bank_item_id is not null),
  'fixture did not materialize 49 contextual Bank items'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from faixa_bank_fixture_items as fixture
    order by fixture.bank_item_id
  )
);

update public.matchday_editorial_bank_items as bank_row
set automatic_eligible = false,
    continuity_source_matchday_id =
      '42000000-0000-4000-8000-000000000001',
    continuity_source_composition_id =
      '62000000-0000-4000-8000-000000000001',
    classification_key = fixture.classification_key,
    classification_source = 'continuity_assisted',
    classified_at = pg_catalog.transaction_timestamp()
from faixa_bank_fixture_items as fixture
where bank_row.id = fixture.bank_item_id;

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  array(
    select fixture.bank_item_id
    from faixa_bank_fixture_items as fixture
    order by fixture.bank_item_id
  )
);

select public.refresh_matchday_editorial_profile_distribution(
  '42000000-0000-4000-8000-000000000002'
);

select jornada_private.apply_matchday_live_layout_placement_plan(
  '42000000-0000-4000-8000-000000000002',
  (
    select pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'action', 'place',
        'bank_item_id', fixture.bank_item_id,
        'placement_type', fixture.item_kind,
        'zone_id', projection.zone_id,
        'slot_position', fixture.slot_position
      )
      order by
        fixture.item_kind,
        fixture.zone_key nulls first,
        fixture.slot_position
    )
    from faixa_bank_fixture_items as fixture
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection
      on projection.matchday_id =
        '42000000-0000-4000-8000-000000000002'
     and projection.legacy_zone_key = fixture.zone_key
  ),
  true
);

do $test$
declare
  v_authoritative_faixa integer;
  v_old_reader_candidate_count integer;
  v_video_bank_item_id uuid;
begin
  select pg_catalog.count(*)::integer
  into v_authoritative_faixa
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id =
      '42000000-0000-4000-8000-000000000002'
    and placement_row.placement_type = 'faixa';

  select fixture.bank_item_id
  into v_video_bank_item_id
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'video_highlight';

  -- This is the semantic error made by the former reader/reconcile: all
  -- workspace sources outside opening/selection/zones were treated as Faixa,
  -- even when authority already placed one of them in the video surface.
  select pg_catalog.count(*)::integer
  into v_old_reader_candidate_count
  from public.matchday_editorial_profile_workspace_sources(
    '42000000-0000-4000-8000-000000000002'
  ) as source_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.matchday_id =
      '42000000-0000-4000-8000-000000000002'
   and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      source_row.source_type
   and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      source_row.source_id
  where not exists (
      select 1
      from public.matchday_live_layout_placements as occupied
      where occupied.matchday_id = bank_row.matchday_id
        and occupied.bank_item_id = bank_row.id
        and occupied.placement_type in ('opening', 'selection', 'zone')
    );

  perform pg_temp.assert_true(
    v_authoritative_faixa = 12,
    'authoritative Faixa count is not 12'
  );
  perform pg_temp.assert_true(
    v_old_reader_candidate_count = 13,
    'fixture did not reproduce the extra video identity'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id =
          '42000000-0000-4000-8000-000000000002'
        and placement_row.placement_type = 'faixa'
        and placement_row.bank_item_id = v_video_bank_item_id
    ),
    'video identity is authoritatively duplicated in Faixa'
  );
  perform pg_temp.assert_true(
    (select pg_catalog.count(*) = 12
     from public.matchday_horizontal_news
     where matchday_id =
       '42000000-0000-4000-8000-000000000002'),
    'legacy compatibility projection diverges from authoritative Faixa'
  );

  insert into faixa_bank_results values (
    '1 READER TRANSVERSAL IDENTITY',
    'PASS',
    pg_catalog.format(
      'old-candidate=%s authority-faixa=%s video-bank=%s',
      v_old_reader_candidate_count,
      v_authoritative_faixa,
      v_video_bank_item_id
    )
  );
end;
$test$;

insert into faixa_bank_evidence (key, value)
values
  (
    'opening_before',
    pg_temp.logical_placement_hash(
      '42000000-0000-4000-8000-000000000002',
      array['opening']
    )
  ),
  (
    'selection_before',
    pg_temp.logical_placement_hash(
      '42000000-0000-4000-8000-000000000002',
      array['selection']
    )
  ),
  (
    'video_before',
    pg_temp.logical_placement_hash(
      '42000000-0000-4000-8000-000000000002',
      array['video_highlight']
    )
  ),
  (
    'zones_before',
    pg_temp.logical_placement_hash(
      '42000000-0000-4000-8000-000000000002',
      array['zone']
    )
  ),
  (
    'classification_before',
    pg_temp.classification_hash(
      '42000000-0000-4000-8000-000000000002'
    )
  );

do $test$
declare
  v_revision bigint;
  v_token text;
  v_overrides jsonb;
  v_zone_items jsonb;
  v_opening jsonb;
  v_page_controls jsonb;
  v_selection jsonb;
  v_worked jsonb;
  v_apply record;
begin
  select control_row.revision
  into v_revision
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id =
      '42000000-0000-4000-8000-000000000002'
    and control_row.profile_key = 'liga_portugal_v1';

  select token_row.state_token
  into v_token
  from public.matchday_editorial_profile_workspace_token(
    '42000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) as token_row;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source_type', 'editorial_article',
      'source_id', fixture.article_id,
      'placement_target', 'bank',
      'zone_key', null,
      'sort_order', null
    )
    order by fixture.slot_position
  )
  into v_overrides
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'faixa';

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source_type', 'editorial_article',
      'source_id', fixture.article_id,
      'zone_key', fixture.zone_key,
      'sort_order', fixture.slot_position
    )
    order by fixture.zone_key, fixture.slot_position
  )
  into v_zone_items
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'zone';

  select pg_catalog.jsonb_build_object(
    'headline', pg_catalog.max(article_id::text)
      filter (where slot_position = 1),
    'highlight_1', pg_catalog.max(article_id::text)
      filter (where slot_position = 2),
    'highlight_2', pg_catalog.max(article_id::text)
      filter (where slot_position = 3),
    'highlight_3', pg_catalog.max(article_id::text)
      filter (where slot_position = 4),
    'context', pg_catalog.max(article_id::text)
      filter (where slot_position = 5)
  )
  into v_opening
  from faixa_bank_fixture_items
  where item_kind = 'opening';

  v_page_controls := pg_catalog.jsonb_build_object(
    'headline_title_color', null,
    'latest_zone_placement', 'top',
    'latest_zone_title', '',
    'thematic_zone_order', pg_catalog.to_jsonb(array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    ]::text[]),
    'thematic_zone_layouts', pg_catalog.jsonb_build_object(
      'benfica', 'six_news',
      'sporting', 'five_news_balanced',
      'fc_porto', 'five_news_balanced',
      'other_liga_clubs', 'six_news',
      'outside_liga_other', 'five_news_secondary'
    ),
    'thematic_block_order', pg_catalog.to_jsonb(array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other',
      'latest',
      'video'
    ]::text[]),
    'thematic_zone_titles', pg_catalog.jsonb_build_object(
      'benfica', '',
      'sporting', '',
      'fc_porto', '',
      'other_liga_clubs', '',
      'outside_liga_other', ''
    )
  );

  select pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(fixture.bank_item_id::text)
    order by fixture.slot_position
  )
  into v_selection
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'selection';

  select pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(fixture.article_id::text)
    order by fixture.slot_position
  )
  into v_worked
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'faixa';

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v10(
    '42000000-0000-4000-8000-000000000002',
    'liga_portugal_v1',
    v_revision,
    v_token,
    v_overrides,
    v_zone_items,
    '[]'::jsonb,
    v_opening,
    v_page_controls,
    v_selection,
    pg_catalog.jsonb_build_object(
      'active', true,
      'highlight_action', 'preserve',
      'highlight_bank_item_id', null
    ),
    v_worked
  );

  perform pg_temp.assert_true(
    v_apply.revision = v_revision + 1,
    'atomic Apply did not advance exactly one revision'
  );
  perform pg_temp.assert_true(
    v_apply.applied_faixa_count = 0,
    'atomic Apply retained selected Faixa rows'
  );

  insert into faixa_bank_results values (
    '2 FAIXA ALL TO BANK APPLY',
    'PASS',
    pg_catalog.format(
      'revision=%s faixa=%s overrides=%s',
      v_apply.revision,
      v_apply.applied_faixa_count,
      v_apply.applied_override_count
    )
  );
end;
$test$;

do $test$
begin
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      join faixa_bank_fixture_items as fixture
        on fixture.bank_item_id = placement_row.bank_item_id
      where placement_row.matchday_id =
          '42000000-0000-4000-8000-000000000002'
        and fixture.item_kind = 'faixa'
    ),
    'a selected Faixa item retained a public placement'
  );
  perform pg_temp.assert_true(
    (select pg_catalog.count(*) = 12
     from public.matchday_editorial_profile_manual_overrides as override_row
     join faixa_bank_fixture_items as fixture
       on override_row.source_type = 'editorial_article'
      and override_row.source_id = fixture.article_id::text
     where override_row.matchday_id =
           '42000000-0000-4000-8000-000000000002'
       and override_row.profile_key = 'liga_portugal_v1'
       and override_row.placement_target = 'bank'
       and fixture.item_kind = 'faixa'),
    'selected Faixa items did not retain explicit Banco intent'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      join faixa_bank_fixture_items as fixture
        on fixture.bank_item_id = memory_row.bank_item_id
      where memory_row.matchday_id =
            '42000000-0000-4000-8000-000000000002'
        and fixture.item_kind = 'faixa'
    ),
    'explicit Faixa to Banco left governing state memory'
  );
  perform pg_temp.assert_true(
    (select pg_catalog.count(*) = 49
     from public.matchday_editorial_bank_items
     where matchday_id =
       '42000000-0000-4000-8000-000000000002'
       and status = 'active'),
    'contextual Bank items were removed or archived'
  );
  perform pg_temp.assert_true(
    (select value = pg_temp.logical_placement_hash(
        '42000000-0000-4000-8000-000000000002',
        array['opening']
      )
     from faixa_bank_evidence where key = 'opening_before'),
    'opening changed during Faixa to Bank Apply'
  );
  perform pg_temp.assert_true(
    (select value = pg_temp.logical_placement_hash(
        '42000000-0000-4000-8000-000000000002',
        array['selection']
      )
     from faixa_bank_evidence where key = 'selection_before'),
    'selection changed during Faixa to Bank Apply'
  );
  perform pg_temp.assert_true(
    (select value = pg_temp.logical_placement_hash(
        '42000000-0000-4000-8000-000000000002',
        array['video_highlight']
      )
     from faixa_bank_evidence where key = 'video_before'),
    'video highlight changed during Faixa to Bank Apply'
  );
  perform pg_temp.assert_true(
    (select value = pg_temp.logical_placement_hash(
        '42000000-0000-4000-8000-000000000002',
        array['zone']
      )
     from faixa_bank_evidence where key = 'zones_before'),
    'zones changed during Faixa to Bank Apply'
  );
  perform pg_temp.assert_true(
    (select value = pg_temp.classification_hash(
        '42000000-0000-4000-8000-000000000002'
      )
     from faixa_bank_evidence where key = 'classification_before'),
    'contextual classification changed during Faixa to Bank Apply'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id =
          '42000000-0000-4000-8000-000000000002'
      group by placement_row.bank_item_id
      having pg_catalog.count(*) > 1
    ),
    'transversal placement uniqueness was violated'
  );

  insert into faixa_bank_results values (
    '3 PRESERVE SURFACES CLASSIFICATION UNIQUE',
    'PASS',
    'opening=selection=video=zones=classification; duplicate-bank=0'
  );
end;
$test$;

do $test$
declare
  v_matchday_id constant uuid :=
    '42000000-0000-4000-8000-000000000002';
  v_revision bigint;
  v_token text;
  v_incoming_article_id uuid;
  v_incoming_bank_item_id uuid;
  v_outgoing_article_id uuid;
  v_outgoing_bank_item_id uuid;
  v_overrides jsonb;
  v_zone_items jsonb;
  v_opening jsonb;
  v_page_controls jsonb;
  v_selection jsonb;
  v_apply record;
  v_classification_before text;
  v_zones_before text;
  v_selection_before text;
  v_video_before text;
begin
  select fixture.article_id, fixture.bank_item_id
  into v_incoming_article_id, v_incoming_bank_item_id
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'faixa'
    and fixture.slot_position = 12;

  select fixture.article_id, fixture.bank_item_id
  into v_outgoing_article_id, v_outgoing_bank_item_id
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'opening'
    and fixture.slot_position = 5;

  select control_row.revision
  into v_revision
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id = v_matchday_id
    and control_row.profile_key = 'liga_portugal_v1';

  select token_row.state_token
  into v_token
  from public.matchday_editorial_profile_workspace_token(
    v_matchday_id,
    'liga_portugal_v1'
  ) as token_row;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'source_type', override_row.source_type,
      'source_id', override_row.source_id,
      'placement_target', override_row.placement_target,
      'zone_key', override_row.zone_key,
      'sort_order', override_row.sort_order
    ) order by override_row.source_id),
    '[]'::jsonb
  )
  into v_overrides
  from public.matchday_editorial_profile_manual_overrides as override_row
  where override_row.matchday_id = v_matchday_id
    and override_row.profile_key = 'liga_portugal_v1'
    and not (
      override_row.source_type = 'editorial_article'
      and override_row.source_id = v_incoming_article_id::text
    );

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'source_type', 'editorial_article',
    'source_id', fixture.article_id,
    'zone_key', fixture.zone_key,
    'sort_order', fixture.slot_position
  ) order by fixture.zone_key, fixture.slot_position)
  into v_zone_items
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'zone';

  select pg_catalog.jsonb_build_object(
    'headline', pg_catalog.max(article_id::text)
      filter (where slot_position = 1),
    'highlight_1', pg_catalog.max(article_id::text)
      filter (where slot_position = 2),
    'highlight_2', pg_catalog.max(article_id::text)
      filter (where slot_position = 3),
    'highlight_3', pg_catalog.max(article_id::text)
      filter (where slot_position = 4),
    'context', v_incoming_article_id::text
  )
  into v_opening
  from faixa_bank_fixture_items
  where item_kind = 'opening';

  v_page_controls := pg_catalog.jsonb_build_object(
    'headline_title_color', null,
    'latest_zone_placement', 'top',
    'latest_zone_title', '',
    'thematic_zone_order', pg_catalog.to_jsonb(array[
      'benfica', 'sporting', 'fc_porto',
      'other_liga_clubs', 'outside_liga_other'
    ]::text[]),
    'thematic_zone_layouts', pg_catalog.jsonb_build_object(
      'benfica', 'six_news',
      'sporting', 'five_news_balanced',
      'fc_porto', 'five_news_balanced',
      'other_liga_clubs', 'six_news',
      'outside_liga_other', 'five_news_secondary'
    ),
    'thematic_block_order', pg_catalog.to_jsonb(array[
      'benfica', 'sporting', 'fc_porto',
      'other_liga_clubs', 'outside_liga_other',
      'latest', 'video'
    ]::text[]),
    'thematic_zone_titles', pg_catalog.jsonb_build_object(
      'benfica', '',
      'sporting', '',
      'fc_porto', '',
      'other_liga_clubs', '',
      'outside_liga_other', ''
    )
  );

  select pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(fixture.bank_item_id::text)
    order by fixture.slot_position
  )
  into v_selection
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'selection';

  v_classification_before := pg_temp.classification_hash(v_matchday_id);
  v_zones_before := pg_temp.logical_placement_hash(
    v_matchday_id,
    array['zone']
  );
  v_selection_before := pg_temp.logical_placement_hash(
    v_matchday_id,
    array['selection']
  );
  v_video_before := pg_temp.logical_placement_hash(
    v_matchday_id,
    array['video_highlight']
  );

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v11(
    v_matchday_id,
    'liga_portugal_v1',
    v_revision,
    v_token,
    v_overrides,
    v_zone_items,
    pg_catalog.jsonb_build_array(v_outgoing_article_id::text),
    v_opening,
    v_page_controls,
    v_selection,
    pg_catalog.jsonb_build_object(
      'active', true,
      'highlight_action', 'preserve',
      'highlight_bank_item_id', null
    ),
    pg_catalog.jsonb_build_array(
      v_incoming_article_id::text,
      v_outgoing_article_id::text
    ),
    v_zone_items,
    '[]'::jsonb,
    pg_catalog.jsonb_build_array(v_outgoing_bank_item_id::text)
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements
      where matchday_id = v_matchday_id
        and bank_item_id = v_incoming_bank_item_id
        and placement_type = 'opening'
        and slot_position = 5
    ),
    'v11 did not place incoming item at the exact preview target'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_live_layout_placements
      where matchday_id = v_matchday_id
        and bank_item_id = v_outgoing_bank_item_id
    ),
    'v11 returned the replaced item to another placement'
  );
  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory
      where matchday_id = v_matchday_id
        and bank_item_id = v_outgoing_bank_item_id
        and memory_kind = 'displaced'
    ),
    'v11 did not persist the replaced item as displaced'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_editorial_profile_manual_overrides
      where matchday_id = v_matchday_id
        and profile_key = 'liga_portugal_v1'
        and source_type = 'editorial_article'
        and source_id in (
          v_incoming_article_id::text,
          v_outgoing_article_id::text
        )
        and placement_target = 'bank'
    ),
    'preview movement retained explicit Bank intent'
  );
  perform pg_temp.assert_true(
    v_zones_before = pg_temp.logical_placement_hash(
      v_matchday_id,
      array['zone']
    )
    and v_selection_before = pg_temp.logical_placement_hash(
      v_matchday_id,
      array['selection']
    )
    and v_video_before = pg_temp.logical_placement_hash(
      v_matchday_id,
      array['video_highlight']
    ),
    'v11 changed an unrelated placement surface'
  );
  perform pg_temp.assert_true(
    v_classification_before = pg_temp.classification_hash(v_matchday_id),
    'v11 changed contextual classification'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_live_layout_placements
      where matchday_id = v_matchday_id
      group by bank_item_id
      having pg_catalog.count(*) > 1
    ),
    'v11 violated transversal uniqueness'
  );

  insert into faixa_bank_results values (
    '4 PREVIEW EXACT APPLY WITHOUT CASCADE',
    'PASS',
    pg_catalog.format(
      'revision=%s incoming=context outgoing=displaced unrelated=preserved',
      v_apply.revision
    )
  );
end;
$test$;

do $test$
declare
  v_displaced_bank_item_id uuid;
  v_incoming_bank_item_id uuid;
  v_result jsonb;
begin
  select fixture.bank_item_id
  into v_displaced_bank_item_id
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'faixa'
    and fixture.slot_position = 1;

  select fixture.bank_item_id
  into v_incoming_bank_item_id
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'faixa'
    and fixture.slot_position = 2;

  delete from public.matchday_editorial_profile_manual_overrides
  where matchday_id = '42000000-0000-4000-8000-000000000002'
    and profile_key = 'liga_portugal_v1'
    and source_type = 'editorial_article'
    and source_id in (
      select fixture.article_id::text
      from faixa_bank_fixture_items as fixture
      where fixture.bank_item_id in (
        v_displaced_bank_item_id,
        v_incoming_bank_item_id
      )
    );

  v_result := public.apply_matchday_live_layout_movement(
    '42000000-0000-4000-8000-000000000002',
    'place',
    v_displaced_bank_item_id,
    'faixa',
    null,
    1,
    null,
    true
  );

  v_result := public.apply_matchday_live_layout_movement(
    '42000000-0000-4000-8000-000000000002',
    'place',
    v_incoming_bank_item_id,
    'faixa',
    null,
    1,
    v_displaced_bank_item_id,
    false
  );

  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_placements
      where matchday_id =
          '42000000-0000-4000-8000-000000000002'
        and bank_item_id = v_incoming_bank_item_id
        and placement_type = 'faixa'
        and slot_position = 1
    ),
    'normal authoritative movement failed'
  );
  perform pg_temp.assert_true(
    not exists (
      select 1
      from public.matchday_live_layout_placements
      where matchday_id =
          '42000000-0000-4000-8000-000000000002'
        and bank_item_id = v_displaced_bank_item_id
    ),
    'displaced item retained a placement'
  );
  perform pg_temp.assert_true(
    exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory
      where matchday_id =
          '42000000-0000-4000-8000-000000000002'
        and bank_item_id = v_displaced_bank_item_id
        and memory_kind = 'displaced'
    ),
    'real replacement did not create displaced memory'
  );

  insert into faixa_bank_results values (
    '5 MOVEMENT AND DISPLACED',
    'PASS',
    v_result::text
  );
end;
$test$;

create function pg_temp.force_atomic_apply_failure()
returns trigger
language plpgsql
as $function$
begin
  if old.matchday_id =
    '42000000-0000-4000-8000-000000000002'::uuid
  then
    raise exception 'faixa-bank-forced-rollback';
  end if;
  return new;
end;
$function$;

create trigger faixa_bank_force_atomic_apply_failure
before update on public.matchday_editorial_profile_reconcile_control
for each row
execute function pg_temp.force_atomic_apply_failure();

insert into faixa_bank_evidence (key, value)
values (
  'workspace_before_forced_failure',
  pg_temp.workspace_hash(
    '42000000-0000-4000-8000-000000000002'
  )
);

do $test$
declare
  v_revision bigint;
  v_token text;
  v_overrides jsonb;
  v_zone_items jsonb;
  v_opening jsonb;
  v_page_controls jsonb;
  v_selection jsonb;
  v_failed boolean := false;
begin
  select control_row.revision
  into v_revision
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id =
      '42000000-0000-4000-8000-000000000002'
    and control_row.profile_key = 'liga_portugal_v1';

  select token_row.state_token
  into v_token
  from public.matchday_editorial_profile_workspace_token(
    '42000000-0000-4000-8000-000000000002',
    'liga_portugal_v1'
  ) as token_row;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source_type', 'editorial_article',
      'source_id', fixture.article_id,
      'placement_target', 'bank',
      'zone_key', null,
      'sort_order', null
    )
    order by fixture.slot_position
  )
  into v_overrides
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'faixa';

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'source_type', 'editorial_article',
      'source_id', fixture.article_id,
      'zone_key', fixture.zone_key,
      'sort_order', fixture.slot_position
    )
    order by fixture.zone_key, fixture.slot_position
  )
  into v_zone_items
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'zone';

  select pg_catalog.jsonb_build_object(
    'headline', pg_catalog.max(article_id::text)
      filter (where slot_position = 1),
    'highlight_1', pg_catalog.max(article_id::text)
      filter (where slot_position = 2),
    'highlight_2', pg_catalog.max(article_id::text)
      filter (where slot_position = 3),
    'highlight_3', pg_catalog.max(article_id::text)
      filter (where slot_position = 4),
    'context', pg_catalog.max(article_id::text)
      filter (where slot_position = 5)
  )
  into v_opening
  from faixa_bank_fixture_items
  where item_kind = 'opening';

  v_page_controls := pg_catalog.jsonb_build_object(
    'headline_title_color', null,
    'latest_zone_placement', 'top',
    'latest_zone_title', '',
    'thematic_zone_order', pg_catalog.to_jsonb(array[
      'benfica', 'sporting', 'fc_porto',
      'other_liga_clubs', 'outside_liga_other'
    ]::text[]),
    'thematic_zone_layouts', pg_catalog.jsonb_build_object(
      'benfica', 'six_news',
      'sporting', 'five_news_balanced',
      'fc_porto', 'five_news_balanced',
      'other_liga_clubs', 'six_news',
      'outside_liga_other', 'five_news_secondary'
    ),
    'thematic_block_order', pg_catalog.to_jsonb(array[
      'benfica', 'sporting', 'fc_porto',
      'other_liga_clubs', 'outside_liga_other',
      'latest', 'video'
    ]::text[]),
    'thematic_zone_titles', pg_catalog.jsonb_build_object(
      'benfica', '',
      'sporting', '',
      'fc_porto', '',
      'other_liga_clubs', '',
      'outside_liga_other', ''
    )
  );

  select pg_catalog.jsonb_agg(
    pg_catalog.to_jsonb(fixture.bank_item_id::text)
    order by fixture.slot_position
  )
  into v_selection
  from faixa_bank_fixture_items as fixture
  where fixture.item_kind = 'selection';

  begin
    perform *
    from public.apply_matchday_editorial_profile_workspace_v11(
      '42000000-0000-4000-8000-000000000002',
      'liga_portugal_v1',
      v_revision,
      v_token,
      v_overrides,
      v_zone_items,
      '[]'::jsonb,
      v_opening,
      v_page_controls,
      v_selection,
      pg_catalog.jsonb_build_object(
        'active', true,
        'highlight_action', 'preserve',
        'highlight_bank_item_id', null
      ),
      '[]'::jsonb,
      v_zone_items,
      '[]'::jsonb,
      '[]'::jsonb
    );
  exception
    when others then
      if sqlerrm <> 'faixa-bank-forced-rollback' then
        raise;
      end if;
      v_failed := true;
  end;

  perform pg_catalog.set_config(
    'jornada.thematic_apply_token_cache_mode',
    'off',
    true
  );

  perform pg_temp.assert_true(
    v_failed,
    'forced Apply did not fail'
  );
  perform pg_temp.assert_true(
    (select value = pg_temp.workspace_hash(
        '42000000-0000-4000-8000-000000000002'
      )
     from faixa_bank_evidence
     where key = 'workspace_before_forced_failure'),
    'forced Apply left partial workspace state'
  );

  insert into faixa_bank_results values (
    '6 FORCED APPLY ROLLBACK',
    'PASS',
    'faixa-bank-forced-rollback; before=after'
  );
end;
$test$;

drop trigger faixa_bank_force_atomic_apply_failure
on public.matchday_editorial_profile_reconcile_control;

select test_name, status, detail
from faixa_bank_results
order by test_name;

select
  key,
  value
from faixa_bank_evidence
order by key;

rollback;
