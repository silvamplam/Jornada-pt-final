\set ON_ERROR_STOP on

-- Run on PostgreSQL 17 after migrations through physical CRUD v20. Every row,
-- certificate and helper is transaction-local and is rolled back.
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

create function pg_temp.placement(
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

create temp table physical_v20_items (
  item_kind text primary key,
  article_id uuid not null,
  bank_item_id uuid
);

create temp table physical_v20_results (
  test_number integer primary key,
  test_name text unique not null,
  status text not null check (status = 'PASS')
);

create function pg_temp.bank_id(p_item_kind text)
returns uuid
language sql
stable
as $function$
  select item_row.bank_item_id
  from pg_temp.physical_v20_items as item_row
  where item_row.item_kind = p_item_kind;
$function$;

create function pg_temp.zone_id(p_legacy_zone_key text)
returns uuid
language sql
stable
as $function$
  select projection_row.zone_id
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
  where projection_row.matchday_id =
        'a0000000-0000-4000-8000-000000000001'
    and projection_row.legacy_zone_key = p_legacy_zone_key;
$function$;

create function pg_temp.zones_payload()
returns jsonb
language sql
stable
as $function$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', zone_row.id,
      'public_title', zone_row.public_title,
      'visual_family', zone_row.visual_family
    ) order by zone_row.id
  ), '[]'::jsonb)
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id =
        'a0000000-0000-4000-8000-000000000001';
$function$;

create function pg_temp.blocks_payload()
returns jsonb
language sql
stable
as $function$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', block_row.id,
      'block_type', block_row.block_type,
      'zone_id', block_row.zone_id,
      'sort_order', block_row.sort_order
    ) order by block_row.id
  ), '[]'::jsonb)
  from public.matchday_live_layout_blocks as block_row
  where block_row.matchday_id =
        'a0000000-0000-4000-8000-000000000001';
$function$;

create function pg_temp.physical_hash()
returns text
language sql
stable
as $function$
  select pg_catalog.md5(pg_catalog.jsonb_build_object(
    'zones', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
      order by row_value.id), '[]'::jsonb)
      from public.matchday_live_layout_zones as row_value
      where row_value.matchday_id = 'a0000000-0000-4000-8000-000000000001'),
    'blocks', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
      order by row_value.id), '[]'::jsonb)
      from public.matchday_live_layout_blocks as row_value
      where row_value.matchday_id = 'a0000000-0000-4000-8000-000000000001'),
    'placements', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
      order by row_value.id), '[]'::jsonb)
      from public.matchday_live_layout_placements as row_value
      where row_value.matchday_id = 'a0000000-0000-4000-8000-000000000001'),
    'memory', (select coalesce(pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
      order by row_value.bank_item_id), '[]'::jsonb)
      from public.matchday_live_layout_bank_item_state_memory as row_value
      where row_value.matchday_id = 'a0000000-0000-4000-8000-000000000001')
  )::text);
$function$;

create function pg_temp.classification_hash()
returns text
language sql
stable
as $function$
  select pg_catalog.md5(coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', bank_row.id,
      'classification_key', bank_row.classification_key,
      'classification_source', bank_row.classification_source,
      'classified_at', bank_row.classified_at,
      'automatic_eligible', bank_row.automatic_eligible
    ) order by bank_row.id
  ), '[]'::jsonb)::text)
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id =
        'a0000000-0000-4000-8000-000000000001';
$function$;

create function pg_temp.apply_v20(
  p_zones jsonb,
  p_blocks jsonb,
  p_placements jsonb,
  p_displaced jsonb default '[]'::jsonb,
  p_displaced_arrivals jsonb default '[]'::jsonb
)
returns text
language plpgsql
as $function$
declare
  v_token text;
  v_final_token text;
begin
  select token_row.state_token
  into strict v_token
  from public.matchday_editorial_profile_workspace_token_v13(
    'a0000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  ) as token_row;

  select applied.state_token
  into strict v_final_token
  from public.apply_matchday_live_layout_physical_v20(
    'a0000000-0000-4000-8000-000000000001',
    'liga_portugal_v1',
    v_token,
    p_zones,
    p_blocks,
    p_placements,
    0,
    '[]'::jsonb,
    p_displaced,
    (
      select coalesce(pg_catalog.jsonb_agg(
        item_row.bank_item_id order by item_row.bank_item_id
      ), '[]'::jsonb)
      from pg_temp.physical_v20_items as item_row
      where item_row.bank_item_id is not null
    ),
    '[]'::jsonb,
    p_displaced_arrivals,
    pg_catalog.jsonb_build_object(
      'headline_title_color', null,
      'latest_zone_placement', 'top',
      'latest_zone_title', 'Últimas',
      'video_module_active', false
    )
  ) as applied;

  return v_final_token;
end;
$function$;

insert into jornada_private.matchday_live_layout_cutover_control (
  scope,
  authority_mode
)
values ('live_layout', 'authoritative')
on conflict (scope) do update set authority_mode = excluded.authority_mode;

insert into public.countries (id, name, slug)
values (
  'a0000000-0000-4000-8000-000000000010',
  'Physical CRUD V20 Country',
  'physical-crud-v20-country'
);

insert into public.competitions (id, name, slug, country, country_id)
values (
  'a0000000-0000-4000-8000-000000000020',
  'Physical CRUD V20 Competition',
  'liga-portugal',
  'Physical CRUD V20 Country',
  'a0000000-0000-4000-8000-000000000010'
);

insert into public.seasons (id, competition_id, label)
values
  ('a0000000-0000-4000-8000-000000000030','a0000000-0000-4000-8000-000000000020','V20 2026/27'),
  ('a0000000-0000-4000-8000-000000000031','a0000000-0000-4000-8000-000000000020','V20 foreign');

insert into public.matchdays (id, season_id, number, label)
values
  ('a0000000-0000-4000-8000-000000000001','a0000000-0000-4000-8000-000000000030',1,'v20 source'),
  ('a0000000-0000-4000-8000-000000000002','a0000000-0000-4000-8000-000000000030',2,'v20 target'),
  ('a0000000-0000-4000-8000-000000000003','a0000000-0000-4000-8000-000000000031',1,'v20 foreign evidence');

insert into public.matchday_editorial_desk_control (
  matchday_id,
  season_id,
  is_managed
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000030',
  true
);

insert into public.matchday_editorial_profile_assignments (
  matchday_id,
  profile_key
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

insert into public.matchday_editorial_profile_reconcile_control (
  matchday_id,
  profile_key,
  thematic_zone_titles
)
values (
  'a0000000-0000-4000-8000-000000000001',
  'liga_portugal_v1',
  '{"benfica":"Benfica","sporting":"Sporting","fc_porto":"FC Porto","other_liga_clubs":"1ª Liga","outside_liga_other":"Fora da Liga"}'::jsonb
);

select jornada_private.sync_matchday_live_layout_shadow(
  array['a0000000-0000-4000-8000-000000000001'::uuid]
);

set constraints all immediate;
set constraints all deferred;

-- Initial physical authority, no content and no occupancy requirement.
select pg_temp.apply_v20(
  pg_temp.zones_payload(),
  pg_temp.blocks_payload(),
  '[]'::jsonb
);

insert into physical_v20_items (item_kind, article_id)
values
  ('mapped', 'a0000000-0000-4000-8000-000000000101'),
  ('deleted_displaced', 'a0000000-0000-4000-8000-000000000102'),
  ('deleted_moved', 'a0000000-0000-4000-8000-000000000103');

insert into public.editorial_articles (
  id, title, slug, status, scope, label, subtitle, body, image_url,
  published_at, competition_id, season_id, matchday_id
)
select
  item_row.article_id,
  'Physical CRUD V20 ' || item_row.item_kind,
  'physical-crud-v20-' || item_row.item_kind,
  'published',
  'matchday',
  'V20',
  'Fixture',
  'Fixture body',
  'https://example.test/' || item_row.item_kind || '.jpg',
  pg_catalog.transaction_timestamp(),
  'a0000000-0000-4000-8000-000000000020',
  'a0000000-0000-4000-8000-000000000030',
  'a0000000-0000-4000-8000-000000000001'
from physical_v20_items as item_row;

select jornada_private.begin_matchday_live_layout_downstream_v14(
  'a0000000-0000-4000-8000-000000000001'
);

select jornada_private.authorize_matchday_editorial_bank_classification_writes(
  array[
    'a0000000-0000-4000-8000-000000000201'::uuid,
    'a0000000-0000-4000-8000-000000000202'::uuid,
    'a0000000-0000-4000-8000-000000000203'::uuid
  ]
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
  case item_row.item_kind
    when 'mapped' then 'a0000000-0000-4000-8000-000000000201'::uuid
    when 'deleted_displaced' then 'a0000000-0000-4000-8000-000000000202'::uuid
    else 'a0000000-0000-4000-8000-000000000203'::uuid
  end,
  'a0000000-0000-4000-8000-000000000001'::uuid,
  'V20',
  'Physical CRUD V20 ' || item_row.item_kind,
  'Fixture',
  'https://example.test/' || item_row.item_kind || '.jpg',
  '/noticias/physical-crud-v20-' || item_row.item_kind,
  'editorial_article',
  item_row.article_id::text,
  'physical-crud-v20-' || item_row.item_kind,
  'fixture',
  case item_row.item_kind
    when 'mapped' then 1
    when 'deleted_displaced' then 2
    else 3
  end,
  'active',
  item_row.item_kind <> 'deleted_displaced',
  '2026-09-05 12:30:00+00'::timestamptz,
  case item_row.item_kind
    when 'mapped' then 'benfica'
    when 'deleted_displaced' then 'sporting'
    else 'fc_porto'
  end,
  'manual',
  '2026-09-05 12:20:00+00'::timestamptz
from physical_v20_items as item_row;

select jornada_private.revoke_matchday_editorial_bank_classification_writes(
  array[
    'a0000000-0000-4000-8000-000000000201'::uuid,
    'a0000000-0000-4000-8000-000000000202'::uuid,
    'a0000000-0000-4000-8000-000000000203'::uuid
  ]
);

select jornada_private.end_matchday_live_layout_downstream_v14(
  'a0000000-0000-4000-8000-000000000001'
);

update physical_v20_items as item_row
set bank_item_id = bank_row.id
from public.matchday_editorial_bank_items as bank_row
where bank_row.matchday_id = 'a0000000-0000-4000-8000-000000000001'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
      'editorial_article'
  and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
      item_row.article_id::text;

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 3 from physical_v20_items
   where bank_item_id is not null),
  'v20 fixture Bank identities missing'
);

create temp table physical_v20_baseline as
select pg_temp.classification_hash() as classification_hash;

create function pg_temp.zones_plus(
  p_zone_id uuid,
  p_title text,
  p_layout text
)
returns jsonb
language sql
stable
as $function$
  select pg_temp.zones_payload() || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id', p_zone_id,
      'public_title', p_title,
      'visual_family', p_layout
    )
  );
$function$;

create function pg_temp.blocks_plus(p_block_id uuid, p_zone_id uuid)
returns jsonb
language sql
stable
as $function$
  select pg_temp.blocks_payload() || pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'id', p_block_id,
      'block_type', 'zone',
      'zone_id', p_zone_id,
      'sort_order', (
        select coalesce(pg_catalog.max(block_row.sort_order), 0) + 1
        from public.matchday_live_layout_blocks as block_row
        where block_row.matchday_id =
              'a0000000-0000-4000-8000-000000000001'
      )
    )
  );
$function$;

create function pg_temp.zones_without(p_zone_id uuid)
returns jsonb
language sql
stable
as $function$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', zone_row.id,
      'public_title', zone_row.public_title,
      'visual_family', zone_row.visual_family
    ) order by zone_row.id
  ), '[]'::jsonb)
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id =
        'a0000000-0000-4000-8000-000000000001'
    and zone_row.id <> p_zone_id;
$function$;

create function pg_temp.blocks_without_zone(p_zone_id uuid)
returns jsonb
language sql
stable
as $function$
  select coalesce(pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', block_row.id,
      'block_type', block_row.block_type,
      'zone_id', block_row.zone_id,
      'sort_order', block_row.sort_order
    ) order by block_row.id
  ), '[]'::jsonb)
  from public.matchday_live_layout_blocks as block_row
  where block_row.matchday_id =
        'a0000000-0000-4000-8000-000000000001'
    and block_row.zone_id is distinct from p_zone_id;
$function$;

-- 1. Normal title/layout update preserves the physical zone UUID.
select pg_temp.apply_v20(
  (
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', zone_row.id,
      'public_title', case when zone_row.id = pg_temp.zone_id('benfica')
        then 'Benfica renomeado' else zone_row.public_title end,
      'visual_family', case when zone_row.id = pg_temp.zone_id('benfica')
        then 'five_news_secondary' else zone_row.visual_family end
    ) order by zone_row.id)
    from public.matchday_live_layout_zones as zone_row
    where zone_row.matchday_id =
          'a0000000-0000-4000-8000-000000000001'
  ),
  pg_temp.blocks_payload(),
  '[]'::jsonb
);

select pg_temp.assert_true(
  exists (
    select 1 from public.matchday_live_layout_zones
    where id = pg_temp.zone_id('benfica')
      and public_title = 'Benfica renomeado'
      and visual_family = 'five_news_secondary'
  ),
  'normal zone update did not preserve UUID/title/layout'
);

insert into physical_v20_results values
  (1, 'normal zone update preserves identity', 'PASS');

-- 2-4. Sixth and seventh zones plus their physical blocks are created empty;
-- neither requires a legacy classification/projection.
select pg_temp.apply_v20(
  pg_temp.zones_plus(
    'a0000000-0000-4000-8000-000000000061',
    'Sexta zona física',
    'six_news'
  ) || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id', 'a0000000-0000-4000-8000-000000000062',
    'public_title', 'Sétima zona física',
    'visual_family', 'six_news'
  )),
  pg_temp.blocks_plus(
    'a0000000-0000-4000-8000-000000000071',
    'a0000000-0000-4000-8000-000000000061'
  ) || pg_catalog.jsonb_build_array(pg_catalog.jsonb_build_object(
    'id', 'a0000000-0000-4000-8000-000000000072',
    'block_type', 'zone',
    'zone_id', 'a0000000-0000-4000-8000-000000000062',
    'sort_order', (
      select pg_catalog.max(block_row.sort_order) + 2
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id =
            'a0000000-0000-4000-8000-000000000001'
    )
  )),
  '[]'::jsonb
);

select pg_temp.assert_true(
  (select pg_catalog.count(*) = 7
   from public.matchday_live_layout_zones
   where matchday_id = 'a0000000-0000-4000-8000-000000000001')
  and (select pg_catalog.count(*) = 2
       from public.matchday_live_layout_blocks
       where id in (
         'a0000000-0000-4000-8000-000000000071',
         'a0000000-0000-4000-8000-000000000072'
       ))
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id in (
        'a0000000-0000-4000-8000-000000000061',
        'a0000000-0000-4000-8000-000000000062'
      )
  )
  and not exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id in (
        'a0000000-0000-4000-8000-000000000061',
        'a0000000-0000-4000-8000-000000000062'
      )
  ),
  'sixth/seventh empty physical zones or blocks/projection are invalid'
);

insert into physical_v20_results values
  (2, 'sixth empty zone and block without projection', 'PASS');

-- 5. A UUID already owned by another Jornada fails before DML.
insert into public.matchday_live_layout_zones (
  id, matchday_id, public_title, visual_family
)
values (
  'a0000000-0000-4000-8000-000000000063',
  'a0000000-0000-4000-8000-000000000003',
  'Foreign physical evidence',
  'six_news'
);

do $test$
declare
  v_before text := pg_temp.physical_hash();
begin
  begin
    perform pg_temp.apply_v20(
      pg_temp.zones_plus(
        'a0000000-0000-4000-8000-000000000063',
        'Illegal cross-Jornada zone',
        'six_news'
      ),
      pg_temp.blocks_plus(
        'a0000000-0000-4000-8000-000000000073',
        'a0000000-0000-4000-8000-000000000063'
      ),
      '[]'::jsonb
    );
    raise exception 'cross-Jornada zone UUID did not fail';
  exception
    when others then
      if sqlerrm not like '%zone-owned-by-other-matchday%' then
        raise;
      end if;
  end;

  perform pg_temp.assert_true(
    pg_temp.physical_hash() = v_before,
    'cross-Jornada UUID failure wrote partial state'
  );
end;
$test$;

insert into physical_v20_results values
  (3, 'cross-Jornada zone UUID fails atomically', 'PASS');

-- 6. Creating and then deleting an empty zone is valid.
select pg_temp.apply_v20(
  pg_temp.zones_plus(
    'a0000000-0000-4000-8000-000000000064',
    'Zona vazia temporária',
    'five_news_balanced'
  ),
  pg_temp.blocks_plus(
    'a0000000-0000-4000-8000-000000000074',
    'a0000000-0000-4000-8000-000000000064'
  ),
  '[]'::jsonb
);

select pg_temp.apply_v20(
  pg_temp.zones_without('a0000000-0000-4000-8000-000000000064'),
  pg_temp.blocks_without_zone('a0000000-0000-4000-8000-000000000064'),
  '[]'::jsonb
);

select pg_temp.assert_true(
  not exists (select 1 from public.matchday_live_layout_zones
    where id = 'a0000000-0000-4000-8000-000000000064')
  and not exists (select 1 from public.matchday_live_layout_blocks
    where id = 'a0000000-0000-4000-8000-000000000074'),
  'empty zone or associated block survived delete'
);

insert into physical_v20_results values
  (4, 'empty zone deletion', 'PASS');

-- 7-8 and 13-15. Occupancy is sparse; layout shrink validates placements but
-- never compacts the gap between slots 3 and 6.
select pg_temp.apply_v20(
  pg_temp.zones_payload(),
  pg_temp.blocks_payload(),
  pg_catalog.jsonb_build_array(
    pg_temp.placement(
      pg_temp.bank_id('mapped'),
      'zone',
      pg_temp.zone_id('benfica'),
      2
    ),
    pg_temp.placement(
      pg_temp.bank_id('deleted_moved'),
      'zone',
      'a0000000-0000-4000-8000-000000000061',
      3
    ),
    pg_temp.placement(
      pg_temp.bank_id('deleted_displaced'),
      'zone',
      'a0000000-0000-4000-8000-000000000061',
      6
    )
  )
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id = 'a0000000-0000-4000-8000-000000000061'
      and slot_position = 3
  )
  and not exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id = 'a0000000-0000-4000-8000-000000000061'
      and slot_position in (1, 2, 4, 5)
  )
  and exists (
    select 1
    from public.matchday_live_layout_placements
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id = 'a0000000-0000-4000-8000-000000000061'
      and slot_position = 6
  ),
  'sparse zone positions were compacted or lost'
);

select pg_temp.assert_true(
  exists (
    select 1
    from public.matchday_editorial_profile_zone_items as zone_item
    where zone_item.matchday_id =
          'a0000000-0000-4000-8000-000000000001'
      and zone_item.profile_key = 'liga_portugal_v1'
      and zone_item.source_id =
          'a0000000-0000-4000-8000-000000000101'
  ),
  'mapped legacy subset was not materialized'
);

do $test$
declare
  v_before text := pg_temp.physical_hash();
  v_shrunk_zones jsonb;
begin
  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', zone_row.id,
    'public_title', zone_row.public_title,
    'visual_family', case
      when zone_row.id = 'a0000000-0000-4000-8000-000000000061'
        then 'five_news_balanced'
      else zone_row.visual_family
    end
  ) order by zone_row.id)
  into v_shrunk_zones
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = 'a0000000-0000-4000-8000-000000000001';

  begin
    perform pg_temp.apply_v20(
      v_shrunk_zones,
      pg_temp.blocks_payload(),
      pg_catalog.jsonb_build_array(
        pg_temp.placement(pg_temp.bank_id('mapped'), 'zone',
          pg_temp.zone_id('benfica'), 2),
        pg_temp.placement(pg_temp.bank_id('deleted_moved'), 'zone',
          'a0000000-0000-4000-8000-000000000061', 3),
        pg_temp.placement(pg_temp.bank_id('deleted_displaced'), 'zone',
          'a0000000-0000-4000-8000-000000000061', 6)
      )
    );
    raise exception 'layout shrink with slot 6 did not fail';
  exception
    when others then
      if sqlerrm not like '%zone-capacity-invalid%' then
        raise;
      end if;
  end;

  perform pg_temp.assert_true(
    pg_temp.physical_hash() = v_before,
    'layout shrink failure changed physical state'
  );
end;
$test$;

insert into physical_v20_results values
  (5, 'sparse gap and incompatible shrink', 'PASS');

-- 7. Deleting an occupied zone without the displaced state fails closed.
do $test$
declare
  v_before text := pg_temp.physical_hash();
begin
  begin
    perform pg_temp.apply_v20(
      pg_temp.zones_without('a0000000-0000-4000-8000-000000000061'),
      pg_temp.blocks_without_zone('a0000000-0000-4000-8000-000000000061'),
      pg_catalog.jsonb_build_array(
        pg_temp.placement(pg_temp.bank_id('mapped'), 'zone',
          'a0000000-0000-4000-8000-000000000062', 1),
        pg_temp.placement(pg_temp.bank_id('deleted_moved'), 'zone',
          'a0000000-0000-4000-8000-000000000062', 3)
      )
    );
    raise exception 'occupied delete without displaced did not fail';
  exception
    when others then
      if sqlerrm not like '%deleted-zone-items-not-displaced%' then
        raise;
      end if;
  end;

  perform pg_temp.assert_true(
    pg_temp.physical_hash() = v_before,
    'failed occupied delete was not a total rollback'
  );
end;
$test$;

insert into physical_v20_results values
  (6, 'occupied delete requires displaced contract', 'PASS');

-- 8-12 and 19-20. One item becomes DESALOJADA; another is explicitly moved
-- to a surviving arbitrary zone. Neither becomes explicit Bank or NOVA.
select pg_temp.apply_v20(
  pg_temp.zones_without('a0000000-0000-4000-8000-000000000061'),
  pg_temp.blocks_without_zone('a0000000-0000-4000-8000-000000000061'),
  pg_catalog.jsonb_build_array(
    pg_temp.placement(pg_temp.bank_id('mapped'), 'zone',
      'a0000000-0000-4000-8000-000000000062', 1),
    pg_temp.placement(pg_temp.bank_id('deleted_moved'), 'zone',
      'a0000000-0000-4000-8000-000000000062', 3)
  ),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('deleted_displaced')),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('deleted_displaced'))
);

select pg_temp.assert_true(
  not exists (select 1 from public.matchday_live_layout_zones
    where id = 'a0000000-0000-4000-8000-000000000061')
  and not exists (select 1 from public.matchday_live_layout_blocks
    where id = 'a0000000-0000-4000-8000-000000000071')
  and (select state_row.editorial_state = 'DESALOJADA'
       from jornada_private.project_matchday_live_layout_bank_item_states(
         array['a0000000-0000-4000-8000-000000000001'::uuid]
       ) as state_row
       where state_row.bank_item_id =
             pg_temp.bank_id('deleted_displaced'))
  and (select state_row.editorial_state = 'COLOCADA'
       from jornada_private.project_matchday_live_layout_bank_item_states(
         array['a0000000-0000-4000-8000-000000000001'::uuid]
       ) as state_row
       where state_row.bank_item_id = pg_temp.bank_id('deleted_moved'))
  and not exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = override_row.matchday_id
     and bank_row.source_type = override_row.source_type
     and bank_row.source_id = override_row.source_id
    where override_row.matchday_id =
          'a0000000-0000-4000-8000-000000000001'
      and bank_row.id = pg_temp.bank_id('deleted_displaced')
  )
  and exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id = 'a0000000-0000-4000-8000-000000000062'
      and slot_position = 1
  )
  and not exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id = 'a0000000-0000-4000-8000-000000000062'
      and slot_position = 2
  )
  and exists (
    select 1 from public.matchday_live_layout_placements
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
      and zone_id = 'a0000000-0000-4000-8000-000000000062'
      and slot_position = 3
  ),
  'occupied delete did not preserve DISPLACED/move/gap semantics'
);

select pg_temp.assert_true(
  not exists (
    select 1
    from public.matchday_editorial_profile_zone_items as zone_item
    where zone_item.matchday_id =
          'a0000000-0000-4000-8000-000000000001'
      and zone_item.source_id in (
        'a0000000-0000-4000-8000-000000000101',
        'a0000000-0000-4000-8000-000000000103'
      )
  ),
  'arbitrary-zone placement retained or invented a legacy zone_item'
);

insert into physical_v20_results values
  (7, 'occupied delete, DISPLACED, move and legacy subset', 'PASS');

create function pg_temp.final_placements()
returns jsonb
language sql
stable
as $function$
  select pg_catalog.jsonb_build_array(
    pg_temp.placement(pg_temp.bank_id('mapped'), 'zone',
      'a0000000-0000-4000-8000-000000000062', 1),
    pg_temp.placement(pg_temp.bank_id('deleted_moved'), 'zone',
      'a0000000-0000-4000-8000-000000000062', 3)
  );
$function$;

-- 14. Any unique positive block order is accepted and becomes authoritative.
create temp table physical_v20_expected_block_order as
select
  block_row.id,
  block_row.block_type,
  block_row.zone_id,
  100 - block_row.sort_order as sort_order
from public.matchday_live_layout_blocks as block_row
where block_row.matchday_id =
      'a0000000-0000-4000-8000-000000000001';

select pg_temp.apply_v20(
  pg_temp.zones_payload(),
  (
    select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
      'id', block_row.id,
      'block_type', block_row.block_type,
      'zone_id', block_row.zone_id,
      'sort_order', block_row.sort_order
    ) order by block_row.id)
    from physical_v20_expected_block_order as block_row
  ),
  pg_temp.final_placements(),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('deleted_displaced'))
);

select pg_temp.assert_true(
  not exists (
    select 1
    from physical_v20_expected_block_order as expected_row
    full join public.matchday_live_layout_blocks as actual_row
      on actual_row.id = expected_row.id
     and actual_row.matchday_id =
         'a0000000-0000-4000-8000-000000000001'
    where expected_row.id is null
       or actual_row.id is null
       or actual_row.block_type is distinct from expected_row.block_type
       or actual_row.zone_id is distinct from expected_row.zone_id
       or actual_row.sort_order is distinct from expected_row.sort_order
  ),
  'arbitrary block order was not persisted'
);

insert into physical_v20_results values
  (8, 'arbitrary block order', 'PASS');

-- 17. A stale token fails before DML and preserves the state written by the
-- serialized winner.
do $test$
declare
  v_stale_token text;
  v_before text;
  v_renamed_zones jsonb;
begin
  select state_token into strict v_stale_token
  from public.matchday_editorial_profile_workspace_token_v13(
    'a0000000-0000-4000-8000-000000000001',
    'liga_portugal_v1'
  );

  select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
    'id', zone_row.id,
    'public_title', case
      when zone_row.id = 'a0000000-0000-4000-8000-000000000062'
        then 'Sétima zona ganhou a corrida'
      else zone_row.public_title
    end,
    'visual_family', zone_row.visual_family
  ) order by zone_row.id)
  into v_renamed_zones
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = 'a0000000-0000-4000-8000-000000000001';

  perform pg_temp.apply_v20(
    v_renamed_zones,
    pg_temp.blocks_payload(),
    pg_temp.final_placements(),
    pg_catalog.jsonb_build_array(pg_temp.bank_id('deleted_displaced'))
  );

  v_before := pg_temp.physical_hash();

  begin
    perform *
    from public.apply_matchday_live_layout_physical_v20(
      'a0000000-0000-4000-8000-000000000001',
      'liga_portugal_v1',
      v_stale_token,
      pg_temp.zones_payload(),
      pg_temp.blocks_payload(),
      pg_temp.final_placements(),
      0,
      '[]'::jsonb,
      pg_catalog.jsonb_build_array(pg_temp.bank_id('deleted_displaced')),
      '[]'::jsonb,
      '[]'::jsonb,
      '[]'::jsonb,
      pg_catalog.jsonb_build_object(
        'headline_title_color', null,
        'latest_zone_placement', 'top',
        'latest_zone_title', 'Últimas',
        'video_module_active', false
      )
    );
    raise exception 'stale token did not fail';
  exception
    when others then
      if sqlerrm not like '%physical-v20-concurrent-write%' then
        raise;
      end if;
  end;

  perform pg_temp.assert_true(
    pg_temp.physical_hash() = v_before,
    'stale token produced writes'
  );
end;
$test$;

insert into physical_v20_results values
  (9, 'stale token fails without writes', 'PASS');

-- 18. A failure after a new zone INSERT rolls back settings/topology/content.
create function pg_temp.inject_v20_failure()
returns trigger
language plpgsql
as $function$
begin
  if new.id = 'a0000000-0000-4000-8000-000000000065' then
    raise exception 'v20-injected-mid-transaction-failure';
  end if;
  return new;
end;
$function$;

create trigger physical_v20_injected_failure
after insert on public.matchday_live_layout_zones
for each row execute function pg_temp.inject_v20_failure();

do $test$
declare
  v_before text := pg_temp.physical_hash();
begin
  begin
    perform pg_temp.apply_v20(
      pg_temp.zones_plus(
        'a0000000-0000-4000-8000-000000000065',
        'Injected failure zone',
        'six_news'
      ),
      pg_temp.blocks_plus(
        'a0000000-0000-4000-8000-000000000075',
        'a0000000-0000-4000-8000-000000000065'
      ),
      pg_temp.final_placements(),
      pg_catalog.jsonb_build_array(pg_temp.bank_id('deleted_displaced'))
    );
    raise exception 'injected v20 failure did not fire';
  exception
    when others then
      if sqlerrm not like '%v20-injected-mid-transaction-failure%' then
        raise;
      end if;
  end;

  perform pg_temp.assert_true(
    pg_temp.physical_hash() = v_before
    and not exists (select 1 from public.matchday_live_layout_zones
      where id = 'a0000000-0000-4000-8000-000000000065')
    and not exists (select 1 from public.matchday_live_layout_blocks
      where id = 'a0000000-0000-4000-8000-000000000075'),
    'mid-transaction error did not roll back every write'
  );
end;
$test$;

drop trigger physical_v20_injected_failure
on public.matchday_live_layout_zones;

insert into physical_v20_results values
  (10, 'mid-transaction error rolls back', 'PASS');

-- Flush deferred shadow/classification triggers before observing the absolute
-- invariant, then restore the baseline trigger mode for the handoff proofs.
set constraints all immediate;

select pg_temp.assert_true(
  pg_temp.classification_hash() =
    (select classification_hash from physical_v20_baseline),
  'classification changed across physical CRUD'
);

set constraints all deferred;

insert into physical_v20_results values
  (11, 'classification and eligibility remain identical', 'PASS');

-- 20-24. Remove every optional legacy mapping, re-project best-effort, then
-- exercise the real v17 constructor and v18 physical carryover.
select jornada_private.begin_matchday_live_layout_downstream_v14(
  'a0000000-0000-4000-8000-000000000001'
);

delete from jornada_private.matchday_live_layout_zone_legacy_projection
where matchday_id = 'a0000000-0000-4000-8000-000000000001';

select jornada_private.end_matchday_live_layout_downstream_v14(
  'a0000000-0000-4000-8000-000000000001'
);

select pg_temp.apply_v20(
  pg_temp.zones_payload(),
  pg_temp.blocks_payload(),
  pg_temp.final_placements(),
  pg_catalog.jsonb_build_array(pg_temp.bank_id('deleted_displaced'))
);

select pg_temp.assert_true(
  not exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
  )
  and not exists (
    select 1
    from public.matchday_editorial_profile_zone_items
    where matchday_id = 'a0000000-0000-4000-8000-000000000001'
  ),
  'zero-projection physical Apply was blocked or invented legacy rows'
);

select jornada_private.assert_matchday_live_layout_physical_topology_source_v17(
  'a0000000-0000-4000-8000-000000000001',
  'liga_portugal_v1'
);

insert into public.matchday_reference_compositions (
  id, matchday_id, status, is_current, internal_name, published_at
)
values (
  'a0000000-0000-4000-8000-000000000701',
  'a0000000-0000-4000-8000-000000000001',
  'published',
  true,
  'Physical CRUD v20 carryover provenance',
  pg_catalog.statement_timestamp()
);

create temp table physical_v20_topology as
select *
from jornada_private.materialize_matchday_live_layout_physical_topology_v17(
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002'
);

select pg_temp.assert_true(
  (select zone_count = 6 and legacy_projection_count = 0
   from physical_v20_topology)
  and (select pg_catalog.count(*) = 6
       from jornada_private.matchday_live_layout_physical_zone_maps
       where topology_transition_id =
             (select topology_transition_id from physical_v20_topology))
  and not exists (
    select 1
    from public.matchday_live_layout_blocks as source_block
    left join public.matchday_live_layout_blocks as target_block
      on target_block.matchday_id =
         'a0000000-0000-4000-8000-000000000002'
     and target_block.block_type = source_block.block_type
     and target_block.sort_order = source_block.sort_order
    where source_block.matchday_id =
          'a0000000-0000-4000-8000-000000000001'
      and target_block.id is null
  ),
  'v17 did not transport >5 zones, layouts and block order without projection'
);

create temp table physical_v20_carryover as
select *
from jornada_private.materialize_matchday_live_layout_physical_carryover_v18(
  'a0000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000002',
  'a0000000-0000-4000-8000-000000000701',
  (select topology_transition_id from physical_v20_topology)
);

select pg_temp.assert_true(
  (select inherited_placement_count = 2
   from physical_v20_carryover)
  and not exists (
    select 1
    from public.matchday_live_layout_placements as source_placement
    join jornada_private.matchday_live_layout_physical_zone_maps as zone_map
      on zone_map.topology_transition_id =
         (select topology_transition_id from physical_v20_topology)
     and zone_map.source_zone_id = source_placement.zone_id
    left join public.matchday_live_layout_placements as target_placement
      on target_placement.matchday_id =
         'a0000000-0000-4000-8000-000000000002'
     and target_placement.zone_id = zone_map.target_zone_id
     and target_placement.slot_position = source_placement.slot_position
    where source_placement.matchday_id =
          'a0000000-0000-4000-8000-000000000001'
      and source_placement.placement_type = 'zone'
      and target_placement.id is null
  )
  and not exists (
    select 1
    from jornada_private.matchday_live_layout_zone_legacy_projection
    where matchday_id = 'a0000000-0000-4000-8000-000000000002'
  ),
  'v18 lost arbitrary-zone placements/gaps or required legacy projection'
);

insert into physical_v20_results values
  (12, 'v17/v18 arbitrary topology without legacy projection', 'PASS');

-- 26. v19 remains marker-first and fails closed on unmarked physical evidence.
select pg_temp.assert_true(
  jornada_private.matchday_live_layout_continuity_authority_v19(
    'a0000000-0000-4000-8000-000000000001'
  ) = 'physical',
  'v19 did not choose marker-backed physical authority'
);

do $test$
begin
  begin
    perform jornada_private.matchday_live_layout_continuity_authority_v19(
      'a0000000-0000-4000-8000-000000000003'
    );
    raise exception 'v19 accepted unmarked physical evidence as legacy';
  exception
    when others then
      if sqlerrm not like '%source-physical-incoherent%' then
        raise;
      end if;
  end;
end;
$test$;

insert into physical_v20_results values
  (13, 'v19 remains marker-first and fail-closed', 'PASS');

select pg_temp.assert_true(
  not pg_catalog.has_function_privilege(
    'anon',
    'public.apply_matchday_live_layout_physical_v20(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and not pg_catalog.has_function_privilege(
    'authenticated',
    'public.apply_matchday_live_layout_physical_v20(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
  and pg_catalog.has_function_privilege(
    'service_role',
    'public.apply_matchday_live_layout_physical_v20(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ),
  'v20 facade ACL is not service-role-only'
);

insert into physical_v20_results values
  (14, 'service-role-only facade', 'PASS');

table physical_v20_results order by test_number;

rollback;
