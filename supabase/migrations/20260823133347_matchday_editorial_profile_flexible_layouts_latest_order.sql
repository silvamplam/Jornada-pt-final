begin;

alter table public.matchday_editorial_profile_reconcile_control
  add column thematic_zone_layouts jsonb;

update public.matchday_editorial_profile_reconcile_control
set thematic_zone_layouts =
  '{"benfica":"six_news","sporting":"five_news_balanced","fc_porto":"five_news_balanced","other_liga_clubs":"six_news","outside_liga_other":"five_news_secondary"}'::jsonb
where thematic_zone_layouts is null;

alter table public.matchday_editorial_profile_reconcile_control
  alter column thematic_zone_layouts set default
    '{"benfica":"six_news","sporting":"five_news_balanced","fc_porto":"five_news_balanced","other_liga_clubs":"six_news","outside_liga_other":"five_news_secondary"}'::jsonb,
  alter column thematic_zone_layouts set not null;

alter table public.matchday_editorial_profile_reconcile_control
  add constraint
    matchday_editorial_profile_reconcile_control_zone_layouts_check
  check (
    pg_catalog.jsonb_typeof(thematic_zone_layouts) = 'object'
    and thematic_zone_layouts ?& array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    ]
    and (
      thematic_zone_layouts - array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ) = '{}'::jsonb
    and thematic_zone_layouts ->> 'benfica'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    and thematic_zone_layouts ->> 'sporting'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    and thematic_zone_layouts ->> 'fc_porto'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    and thematic_zone_layouts ->> 'other_liga_clubs'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    and thematic_zone_layouts ->> 'outside_liga_other'
      in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
  );

comment on column
  public.matchday_editorial_profile_reconcile_control.thematic_zone_layouts
is
  'Applied visual layout per thematic semantic zone. Capacity derives from the selected layout, not from zone identity.';

alter table public.matchday_editorial_profile_reconcile_control
  add column thematic_block_order text[];

update public.matchday_editorial_profile_reconcile_control
set thematic_block_order =
  thematic_zone_order || array['latest']::text[]
where thematic_block_order is null;

alter table public.matchday_editorial_profile_reconcile_control
  alter column thematic_block_order set default array[
    'benfica',
    'sporting',
    'fc_porto',
    'other_liga_clubs',
    'outside_liga_other',
    'latest'
  ]::text[],
  alter column thematic_block_order set not null;

alter table public.matchday_editorial_profile_reconcile_control
  add constraint
    matchday_editorial_profile_reconcile_control_block_order_check
  check (
    pg_catalog.cardinality(thematic_block_order) = 6
    and thematic_block_order <@ array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other',
      'latest'
    ]::text[]
    and thematic_block_order @> array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other',
      'latest'
    ]::text[]
  );

comment on column
  public.matchday_editorial_profile_reconcile_control.thematic_block_order
is
  'Applied order of the five thematic semantic blocks plus Latest. It is independent of Legacy live_public_zone_order.';

alter table public.matchday_editorial_profile_manual_overrides
  drop constraint
    matchday_editorial_profile_manual_overrides_zone_capacity_check;

alter table public.matchday_editorial_profile_manual_overrides
  add constraint
    matchday_editorial_profile_manual_overrides_zone_capacity_check
  check (
    placement_target <> 'zone'
    or sort_order is null
    or sort_order <= 6
  );

alter table public.matchday_editorial_profile_zone_items
  drop constraint
    matchday_editorial_profile_zone_items_sort_order_check;

alter table public.matchday_editorial_profile_zone_items
  add constraint
    matchday_editorial_profile_zone_items_sort_order_check
  check (
    sort_order > 0
    and sort_order <= 6
  );

-- Persistência = envelope físico máximo.
-- Layout = capacidade editorial efetiva.
create or replace function public.apply_matchday_editorial_profile_reconcile(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb
)
returns table (
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_profile_key text;
  v_competition_slug text;
  v_current_revision bigint := 0;
  v_current_token text;
  v_next_revision bigint;
  v_now timestamptz := pg_catalog.now();
  v_offset integer;
begin
  if p_matchday_id is null
    or p_profile_key is null
    or pg_catalog.btrim(p_profile_key) = ''
    or p_expected_revision is null
    or p_expected_revision < 0
    or nullif(pg_catalog.btrim(p_expected_state_token), '') is null
    or p_overrides is null
    or pg_catalog.jsonb_typeof(p_overrides) <> 'array'
    or p_zone_items is null
    or pg_catalog.jsonb_typeof(p_zone_items) <> 'array'
    or p_faixa_source_ids is null
    or pg_catalog.jsonb_typeof(p_faixa_source_ids) <> 'array'
  then
    raise exception 'matchday-editorial-profile-reconcile-invalid-input';
  end if;

  if p_profile_key <> 'liga_portugal_v1' then
    raise exception 'matchday-editorial-profile-reconcile-invalid-profile';
  end if;

  select competition_row.slug
  into v_competition_slug
  from public.matchdays as matchday_row
  join public.seasons as season_row
    on season_row.id = matchday_row.season_id
  join public.competitions as competition_row
    on competition_row.id = season_row.competition_id
  where matchday_row.id = p_matchday_id
  for update of matchday_row;

  if not found then
    raise exception 'matchday-editorial-profile-reconcile-matchday-not-found';
  end if;

  -- Shared writers already serialize Faixa rewrites with this table lock.
  -- It is acquired before article and bank locks, matching the protected core
  -- path and avoiding an assignment -> bank inversion with automatic refresh.
  lock table public.matchday_horizontal_news in share row exclusive mode;
  lock table public.editorial_articles in share mode;

  perform 1
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
    and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) = 'editorial_article'
  order by pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
           pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  for share;

  -- Automatic bank writers hold a bank row before the refresh locks the
  -- assignment. Taking these locks in the same bank -> assignment order avoids
  -- the inverse assignment -> bank cycle while keeping assignment/state stable.
  select assignment_row.profile_key
  into v_assignment_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id
  for share;

  if not found then
    raise exception 'matchday-editorial-profile-reconcile-assignment-not-found';
  end if;
  if v_assignment_profile_key <> p_profile_key then
    raise exception 'matchday-editorial-profile-reconcile-assignment-mismatch';
  end if;
  if v_competition_slug <> 'liga-portugal' then
    raise exception 'matchday-editorial-profile-reconcile-incompatible-competition';
  end if;

  select control_row.revision
  into v_current_revision
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key
  for update;
  v_current_revision := coalesce(v_current_revision, 0);

  if v_current_revision <> p_expected_revision then
    raise exception 'matchday-editorial-profile-reconcile-revision-conflict';
  end if;

  select token_row.state_token
  into v_current_token
  from public.matchday_editorial_profile_reconcile_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
  if v_current_token is distinct from p_expected_state_token then
    raise exception 'matchday-editorial-profile-reconcile-state-token-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_matchday_id
      and 1 <> (
        select pg_catalog.count(*)
        from public.editorial_articles as article_row
        where article_row.status = 'published'
          and nullif(pg_catalog.btrim(article_row.slug), '') is not null
          and '/noticias/' || pg_catalog.btrim(article_row.slug)
            = pg_catalog.btrim(faixa_row.link_url)
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-unresolved-faixa';
  end if;

  if exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    join public.editorial_articles as article_row
      on article_row.status = 'published'
     and '/noticias/' || pg_catalog.btrim(article_row.slug)
       = pg_catalog.btrim(faixa_row.link_url)
    where faixa_row.matchday_id = p_matchday_id
    group by article_row.id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-faixa-identity';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where pg_catalog.jsonb_typeof(payload.value) <> 'object'
      or not (payload.value ?& array[
        'source_type', 'source_id', 'placement_target', 'zone_key', 'sort_order'
      ])
      or (payload.value - array[
        'source_type', 'source_id', 'placement_target', 'zone_key', 'sort_order'
      ]) <> '{}'::jsonb
      or pg_catalog.jsonb_typeof(payload.value -> 'source_type') <> 'string'
      or payload.value ->> 'source_type' <> 'editorial_article'
      or pg_catalog.jsonb_typeof(payload.value -> 'source_id') <> 'string'
      or nullif(pg_catalog.btrim(payload.value ->> 'source_id'), '') is null
      or pg_catalog.jsonb_typeof(payload.value -> 'placement_target') <> 'string'
      or payload.value ->> 'placement_target' not in ('bank', 'zone', 'faixa')
      or (
        payload.value ->> 'placement_target' = 'bank'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null'
          and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'null'
        )
      )
      or (
        payload.value ->> 'placement_target' = 'zone'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'string'
          and payload.value ->> 'zone_key' in (
            'benfica', 'sporting', 'fc_porto',
            'other_liga_clubs', 'outside_liga_other'
          )
          and (
            pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'null'
            or (
              pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
              and (payload.value ->> 'sort_order') ~ '^[1-9][0-9]*$'
              and (payload.value ->> 'sort_order')::integer <= case payload.value ->> 'zone_key'
                when 'benfica' then 6
                when 'sporting' then 6
                when 'fc_porto' then 6
                when 'other_liga_clubs' then 6
                when 'outside_liga_other' then 6
              end
            )
          )
        )
      )
      or (
        payload.value ->> 'placement_target' = 'faixa'
        and not (
          pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null'
          and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
          and (payload.value ->> 'sort_order') ~ '^[1-9][0-9]*$'
        )
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-invalid-overrides';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    group by pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-override';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where payload.value ->> 'placement_target' = 'zone'
      and pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'number'
    group by payload.value ->> 'zone_key', (payload.value ->> 'sort_order')::integer
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where payload.value ->> 'placement_target' = 'faixa'
    group by (payload.value ->> 'sort_order')::integer
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-manual-slot';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where payload.value ->> 'placement_target' = 'zone'
    group by payload.value ->> 'zone_key'
    having pg_catalog.count(*) > case payload.value ->> 'zone_key'
      when 'benfica' then 6
      when 'sporting' then 6
      when 'fc_porto' then 6
      when 'other_liga_clubs' then 6
      when 'outside_liga_other' then 6
    end
  ) then
    raise exception 'matchday-editorial-profile-reconcile-zone-capacity-exceeded';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as payload(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified
      where classified.source_type = 'editorial_article'
        and classified.source_id = pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-source-not-active';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    where pg_catalog.jsonb_typeof(payload.value) <> 'object'
      or not (payload.value ?& array['source_type', 'source_id', 'zone_key', 'sort_order'])
      or (payload.value - array['source_type', 'source_id', 'zone_key', 'sort_order']) <> '{}'::jsonb
      or payload.value ->> 'source_type' <> 'editorial_article'
      or pg_catalog.jsonb_typeof(payload.value -> 'source_id') <> 'string'
      or nullif(pg_catalog.btrim(payload.value ->> 'source_id'), '') is null
      or pg_catalog.jsonb_typeof(payload.value -> 'zone_key') <> 'string'
      or payload.value ->> 'zone_key' not in (
        'benfica', 'sporting', 'fc_porto',
        'other_liga_clubs', 'outside_liga_other'
      )
      or pg_catalog.jsonb_typeof(payload.value -> 'sort_order') <> 'number'
      or (payload.value ->> 'sort_order') !~ '^[1-9][0-9]*$'
      or (payload.value ->> 'sort_order')::integer > case payload.value ->> 'zone_key'
        when 'benfica' then 6
        when 'sporting' then 6
        when 'fc_porto' then 6
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 6
      end
  ) then
    raise exception 'matchday-editorial-profile-reconcile-invalid-zone-items';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    group by pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    group by payload.value ->> 'zone_key', (payload.value ->> 'sort_order')::integer
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-zone-item';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified
      where classified.source_type = 'editorial_article'
        and classified.source_id = pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
    )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-zone-source-not-active';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as override_payload(value)
    where override_payload.value ->> 'placement_target' = 'zone'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_zone_items) as zone_payload(value)
        where pg_catalog.lower(pg_catalog.btrim(zone_payload.value ->> 'source_id'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
          and zone_payload.value ->> 'zone_key' = override_payload.value ->> 'zone_key'
          and (
            pg_catalog.jsonb_typeof(override_payload.value -> 'sort_order') = 'null'
            or (zone_payload.value ->> 'sort_order')::integer
              = (override_payload.value ->> 'sort_order')::integer
          )
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-manual-zone-mismatch';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as desired(value, sort_order)
    where pg_catalog.jsonb_typeof(desired.value) <> 'string'
      or nullif(pg_catalog.btrim(desired.value #>> '{}'), '') is null
  ) then
    raise exception 'matchday-editorial-profile-reconcile-invalid-faixa';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
    group by pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-reconcile-duplicate-faixa-item';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified
      where classified.source_id = pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
    )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-faixa-source-not-active';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
    join pg_catalog.jsonb_array_elements(p_zone_items) as zone_payload(value)
      on pg_catalog.lower(pg_catalog.btrim(zone_payload.value ->> 'source_id'))
       = pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
  ) then
    raise exception 'matchday-editorial-profile-reconcile-zone-faixa-duplicate';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as override_payload(value)
    where override_payload.value ->> 'placement_target' = 'bank'
      and (
        exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_zone_items) as zone_payload(value)
          where pg_catalog.lower(pg_catalog.btrim(zone_payload.value ->> 'source_id'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as faixa_payload(value)
          where pg_catalog.lower(pg_catalog.btrim(faixa_payload.value #>> '{}'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
        )
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-explicit-bank-conflict';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as override_payload(value)
    where override_payload.value ->> 'placement_target' = 'faixa'
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as faixa_payload(value)
        where pg_catalog.lower(pg_catalog.btrim(faixa_payload.value #>> '{}'))
            = pg_catalog.lower(pg_catalog.btrim(override_payload.value ->> 'source_id'))
      )
  ) then
    raise exception 'matchday-editorial-profile-reconcile-manual-faixa-mismatch';
  end if;

  -- An identical full-set Apply is a successful no-op. This comparison happens
  -- after every payload/canonicality check and before the first write, so it
  -- neither changes timestamps nor advances the optimistic revision.
  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key
  )
  and not exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.profile_key = p_profile_key
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_overrides) as desired(value)
        where pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id')) = current_row.source_id
          and desired.value ->> 'source_type' = current_row.source_type
          and desired.value ->> 'placement_target' = current_row.placement_target
          and case when pg_catalog.jsonb_typeof(desired.value -> 'zone_key') = 'null'
            then null else desired.value ->> 'zone_key' end is not distinct from current_row.zone_key
          and case when pg_catalog.jsonb_typeof(desired.value -> 'sort_order') = 'null'
            then null else (desired.value ->> 'sort_order')::integer end is not distinct from current_row.sort_order
      )
  )
  and not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_overrides) as desired(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_manual_overrides as current_row
      where current_row.matchday_id = p_matchday_id
        and current_row.profile_key = p_profile_key
        and current_row.source_id = pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id'))
        and current_row.source_type = desired.value ->> 'source_type'
        and current_row.placement_target = desired.value ->> 'placement_target'
        and current_row.zone_key is not distinct from case
          when pg_catalog.jsonb_typeof(desired.value -> 'zone_key') = 'null' then null
          else desired.value ->> 'zone_key'
        end
        and current_row.sort_order is not distinct from case
          when pg_catalog.jsonb_typeof(desired.value -> 'sort_order') = 'null' then null
          else (desired.value ->> 'sort_order')::integer
        end
    )
  )
  and not exists (
    select 1
    from public.matchday_editorial_profile_zone_items as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.profile_key = p_profile_key
      and not exists (
        select 1
        from pg_catalog.jsonb_array_elements(p_zone_items) as desired(value)
        where pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id')) = current_row.source_id
          and desired.value ->> 'source_type' = current_row.source_type
          and desired.value ->> 'zone_key' = current_row.zone_key
          and (desired.value ->> 'sort_order')::integer = current_row.sort_order
      )
  )
  and not exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zone_items) as desired(value)
    where not exists (
      select 1
      from public.matchday_editorial_profile_zone_items as current_row
      where current_row.matchday_id = p_matchday_id
        and current_row.profile_key = p_profile_key
        and current_row.source_id = pg_catalog.lower(pg_catalog.btrim(desired.value ->> 'source_id'))
        and current_row.source_type = desired.value ->> 'source_type'
        and current_row.zone_key = desired.value ->> 'zone_key'
        and current_row.sort_order = (desired.value ->> 'sort_order')::integer
    )
  )
  and not exists (
    select 1
    from (
      select
        faixa_row.sort_order,
        pg_catalog.row_number() over (order by faixa_row.sort_order, faixa_row.id) as expected_sort_order
      from public.matchday_horizontal_news as faixa_row
      where faixa_row.matchday_id = p_matchday_id
    ) as ordered_faixa
    where ordered_faixa.sort_order <> ordered_faixa.expected_sort_order
  )
  and array(
    select article_row.id::text
    from public.matchday_horizontal_news as faixa_row
    join public.editorial_articles as article_row
      on article_row.status = 'published'
     and '/noticias/' || pg_catalog.btrim(article_row.slug) = pg_catalog.btrim(faixa_row.link_url)
    where faixa_row.matchday_id = p_matchday_id
    order by faixa_row.sort_order, faixa_row.id
  ) = array(
    select pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as desired(value, sort_order)
    order by desired.sort_order
  )
  then
    return query
    select
      v_current_revision,
      v_current_token,
      pg_catalog.jsonb_array_length(p_overrides),
      pg_catalog.jsonb_array_length(p_zone_items),
      pg_catalog.jsonb_array_length(p_faixa_source_ids);
    return;
  end if;

  delete from public.matchday_editorial_profile_manual_overrides
  where matchday_id = p_matchday_id
    and profile_key = p_profile_key;

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
    p_matchday_id,
    p_profile_key,
    'editorial_article',
    pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id')),
    payload.value ->> 'placement_target',
    case
      when pg_catalog.jsonb_typeof(payload.value -> 'zone_key') = 'null' then null
      else payload.value ->> 'zone_key'
    end,
    case
      when pg_catalog.jsonb_typeof(payload.value -> 'sort_order') = 'null' then null
      when payload.value ->> 'placement_target' = 'faixa' then (
        select faixa_payload.sort_order::integer
        from pg_catalog.jsonb_array_elements(p_faixa_source_ids)
          with ordinality as faixa_payload(value, sort_order)
        where pg_catalog.lower(pg_catalog.btrim(faixa_payload.value #>> '{}'))
          = pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id'))
      )
      else (payload.value ->> 'sort_order')::integer
    end
  from pg_catalog.jsonb_array_elements(p_overrides) as payload(value);

  delete from public.matchday_editorial_profile_zone_items
  where matchday_id = p_matchday_id
    and profile_key = p_profile_key;

  insert into public.matchday_editorial_profile_zone_items (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    zone_key,
    sort_order
  )
  select
    p_matchday_id,
    p_profile_key,
    'editorial_article',
    pg_catalog.lower(pg_catalog.btrim(payload.value ->> 'source_id')),
    payload.value ->> 'zone_key',
    (payload.value ->> 'sort_order')::integer
  from pg_catalog.jsonb_array_elements(p_zone_items) as payload(value);

  select coalesce(pg_catalog.max(faixa_row.sort_order), 0)
    + pg_catalog.jsonb_array_length(p_faixa_source_ids)
    + 1024
  into v_offset
  from public.matchday_horizontal_news as faixa_row
  where faixa_row.matchday_id = p_matchday_id;

  update public.matchday_horizontal_news
  set sort_order = sort_order + v_offset
  where matchday_id = p_matchday_id;

  delete from public.matchday_horizontal_news as faixa_row
  where faixa_row.matchday_id = p_matchday_id
    and not exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as desired(value)
      join public.editorial_articles as article_row
        on article_row.id::text = pg_catalog.lower(pg_catalog.btrim(desired.value #>> '{}'))
       and article_row.status = 'published'
       and '/noticias/' || pg_catalog.btrim(article_row.slug)
         = pg_catalog.btrim(faixa_row.link_url)
    );

  with desired as (
    select
      pg_catalog.lower(pg_catalog.btrim(payload.value #>> '{}')) as source_id,
      payload.sort_order::integer as sort_order
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as payload(value, sort_order)
  )
  update public.matchday_horizontal_news as faixa_row
  set sort_order = desired.sort_order,
      updated_at = v_now
  from desired
  join public.editorial_articles as article_row
    on article_row.id::text = desired.source_id
   and article_row.status = 'published'
  where faixa_row.matchday_id = p_matchday_id
    and '/noticias/' || pg_catalog.btrim(article_row.slug)
      = pg_catalog.btrim(faixa_row.link_url);

  with desired as (
    select
      pg_catalog.lower(pg_catalog.btrim(payload.value #>> '{}')) as source_id,
      payload.sort_order::integer as sort_order
    from pg_catalog.jsonb_array_elements(p_faixa_source_ids) with ordinality as payload(value, sort_order)
  )
  insert into public.matchday_horizontal_news (
    matchday_id,
    label,
    label_color,
    title,
    subtitle,
    image_url,
    link_url,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    p_matchday_id,
    nullif(pg_catalog.btrim(article_row.label), ''),
    null,
    nullif(pg_catalog.btrim(article_row.title), ''),
    nullif(pg_catalog.btrim(article_row.subtitle), ''),
    nullif(pg_catalog.btrim(article_row.image_url), ''),
    '/noticias/' || pg_catalog.btrim(article_row.slug),
    desired.sort_order,
    'published',
    v_now,
    v_now
  from desired
  join public.editorial_articles as article_row
    on article_row.id::text = desired.source_id
   and article_row.status = 'published'
  where not exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_matchday_id
      and pg_catalog.btrim(faixa_row.link_url)
        = '/noticias/' || pg_catalog.btrim(article_row.slug)
  )
  order by desired.sort_order;

  v_next_revision := v_current_revision + 1;
  insert into public.matchday_editorial_profile_reconcile_control (
    matchday_id,
    profile_key,
    revision,
    last_applied_at,
    updated_at
  ) values (
    p_matchday_id,
    p_profile_key,
    v_next_revision,
    v_now,
    v_now
  )
  on conflict (matchday_id, profile_key) do update set
    revision = excluded.revision,
    last_applied_at = excluded.last_applied_at,
    updated_at = excluded.updated_at;

  return query
  select
    v_next_revision,
    token_row.state_token,
    pg_catalog.jsonb_array_length(p_overrides),
    pg_catalog.jsonb_array_length(p_zone_items),
    pg_catalog.jsonb_array_length(p_faixa_source_ids)
  from public.matchday_editorial_profile_reconcile_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
end;
$$;
create or replace function
  public.apply_matchday_editorial_profile_workspace_v2(
    p_matchday_id uuid,
    p_profile_key text,
    p_expected_revision bigint,
    p_expected_state_token text,
    p_overrides jsonb,
    p_zone_items jsonb,
    p_faixa_source_ids jsonb,
    p_opening jsonb,
    p_page_controls jsonb
  )
returns table (
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_requested_layouts jsonb;
  v_requested_block_order text[];
  v_requested_zone_order text[];
  v_derived_zone_order text[];
  v_current_layouts jsonb;
  v_current_block_order text[];
  v_control_changed boolean := false;
  v_apply record;
  v_final_revision bigint;
  v_now timestamptz := pg_catalog.now();
begin
  if p_matchday_id is null
    or p_profile_key is null
    or pg_catalog.btrim(p_profile_key) = ''
    or p_expected_revision is null
    or p_expected_revision < 0
    or nullif(
      pg_catalog.btrim(p_expected_state_token),
      ''
    ) is null
    or p_overrides is null
    or pg_catalog.jsonb_typeof(p_overrides) <> 'array'
    or p_zone_items is null
    or pg_catalog.jsonb_typeof(p_zone_items) <> 'array'
    or p_faixa_source_ids is null
    or pg_catalog.jsonb_typeof(
      p_faixa_source_ids
    ) <> 'array'
    or p_opening is null
    or pg_catalog.jsonb_typeof(p_opening) <> 'object'
    or p_page_controls is null
    or pg_catalog.jsonb_typeof(
      p_page_controls
    ) <> 'object'
  then
    raise exception
      'matchday-editorial-profile-workspace-v2-invalid-input';
  end if;

  if p_profile_key <> 'liga_portugal_v1' then
    raise exception
      'matchday-editorial-profile-workspace-v2-invalid-profile';
  end if;

  if not (
    p_page_controls ?& array[
      'headline_title_color',
      'latest_zone_placement',
      'thematic_zone_order',
      'thematic_zone_layouts',
      'thematic_block_order'
    ]
  )
  or (
    p_page_controls - array[
      'headline_title_color',
      'latest_zone_placement',
      'thematic_zone_order',
      'thematic_zone_layouts',
      'thematic_block_order'
    ]::text[]
  ) <> '{}'::jsonb
  then
    raise exception
      'matchday-editorial-profile-workspace-v2-invalid-page-controls';
  end if;

  v_requested_layouts :=
    p_page_controls -> 'thematic_zone_layouts';

  if pg_catalog.jsonb_typeof(
    v_requested_layouts
  ) <> 'object'
    or not (
      v_requested_layouts ?& array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]
    )
    or (
      v_requested_layouts - array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ) <> '{}'::jsonb
    or v_requested_layouts ->> 'benfica'
      not in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    or v_requested_layouts ->> 'sporting'
      not in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    or v_requested_layouts ->> 'fc_porto'
      not in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    or v_requested_layouts ->> 'other_liga_clubs'
      not in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    or v_requested_layouts ->> 'outside_liga_other'
      not in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
  then
    raise exception
      'matchday-editorial-profile-workspace-v2-invalid-zone-layouts';
  end if;

  if pg_catalog.jsonb_typeof(
    p_page_controls -> 'thematic_block_order'
  ) <> 'array'
    or pg_catalog.jsonb_array_length(
      p_page_controls -> 'thematic_block_order'
    ) <> 6
  then
    raise exception
      'matchday-editorial-profile-workspace-v2-invalid-block-order';
  end if;

  select pg_catalog.array_agg(
    row_value.value #>> '{}'
    order by row_value.sort_order
  )
  into v_requested_block_order
  from pg_catalog.jsonb_array_elements(
    p_page_controls -> 'thematic_block_order'
  ) with ordinality as row_value(
    value,
    sort_order
  );

  if v_requested_block_order is null
    or pg_catalog.cardinality(
      v_requested_block_order
    ) <> 6
    or not (
      v_requested_block_order <@ array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other',
        'latest'
      ]::text[]
      and v_requested_block_order @> array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other',
        'latest'
      ]::text[]
    )
  then
    raise exception
      'matchday-editorial-profile-workspace-v2-invalid-block-order';
  end if;

  if pg_catalog.jsonb_typeof(
    p_page_controls -> 'thematic_zone_order'
  ) <> 'array'
    or pg_catalog.jsonb_array_length(
      p_page_controls -> 'thematic_zone_order'
    ) <> 5
  then
    raise exception
      'matchday-editorial-profile-workspace-v2-invalid-zone-order';
  end if;

  select pg_catalog.array_agg(
    row_value.value #>> '{}'
    order by row_value.sort_order
  )
  into v_requested_zone_order
  from pg_catalog.jsonb_array_elements(
    p_page_controls -> 'thematic_zone_order'
  ) with ordinality as row_value(
    value,
    sort_order
  );

  select pg_catalog.array_agg(
    row_value.block_key
    order by row_value.sort_order
  )
  into v_derived_zone_order
  from pg_catalog.unnest(
    v_requested_block_order
  ) with ordinality as row_value(
    block_key,
    sort_order
  )
  where row_value.block_key <> 'latest';

  if v_requested_zone_order
    is distinct from v_derived_zone_order
  then
    raise exception
      'matchday-editorial-profile-workspace-v2-zone-order-mismatch';
  end if;

  -- Manual > automático.
  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_overrides
    ) as payload(value)
    where payload.value ->> 'placement_target' = 'zone'
      and pg_catalog.jsonb_typeof(
        payload.value -> 'sort_order'
      ) = 'number'
      and (
        payload.value ->> 'sort_order'
      ) ~ '^[1-9][0-9]*$'
      and (
        payload.value ->> 'sort_order'
      )::integer >
        case v_requested_layouts ->> (
          payload.value ->> 'zone_key'
        )
          when 'six_news' then 6
          when 'five_news_balanced' then 5
          when 'five_news_secondary' then 5
          else 0
        end
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v2-manual-position-exceeds-layout';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_overrides
    ) as payload(value)
    where payload.value ->> 'placement_target' = 'zone'
    group by payload.value ->> 'zone_key'
    having pg_catalog.count(*) >
      case v_requested_layouts ->> (
        payload.value ->> 'zone_key'
      )
        when 'six_news' then 6
        when 'five_news_balanced' then 5
        when 'five_news_secondary' then 5
        else 0
      end
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v2-manual-zone-exceeds-layout';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_zone_items
    ) as payload(value)
    where pg_catalog.jsonb_typeof(
      payload.value -> 'sort_order'
    ) = 'number'
      and (
        payload.value ->> 'sort_order'
      ) ~ '^[1-9][0-9]*$'
      and (
        payload.value ->> 'sort_order'
      )::integer >
        case v_requested_layouts ->> (
          payload.value ->> 'zone_key'
        )
          when 'six_news' then 6
          when 'five_news_balanced' then 5
          when 'five_news_secondary' then 5
          else 0
        end
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v2-zone-item-exceeds-layout';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(
      p_zone_items
    ) as payload(value)
    group by payload.value ->> 'zone_key'
    having pg_catalog.count(*) >
      case v_requested_layouts ->> (
        payload.value ->> 'zone_key'
      )
        when 'six_news' then 6
        when 'five_news_balanced' then 5
        when 'five_news_secondary' then 5
        else 0
      end
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v2-zone-exceeds-layout';
  end if;

  select
    control_row.thematic_zone_layouts,
    control_row.thematic_block_order
  into
    v_current_layouts,
    v_current_block_order
  from
    public.matchday_editorial_profile_reconcile_control
      as control_row
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key;

  v_control_changed :=
    coalesce(
      v_current_layouts,
      '{"benfica":"six_news","sporting":"five_news_balanced","fc_porto":"five_news_balanced","other_liga_clubs":"six_news","outside_liga_other":"five_news_secondary"}'::jsonb
    ) is distinct from v_requested_layouts
    or coalesce(
      v_current_block_order,
      array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other',
        'latest'
      ]::text[]
    ) is distinct from v_requested_block_order;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    pg_catalog.jsonb_build_object(
      'headline_title_color',
      p_page_controls -> 'headline_title_color',
      'latest_zone_placement',
      p_page_controls -> 'latest_zone_placement',
      'thematic_zone_order',
      pg_catalog.to_jsonb(
        v_requested_zone_order
      )
    )
  );

  update
    public.matchday_editorial_profile_reconcile_control
      as control_row
  set
    thematic_zone_layouts =
      v_requested_layouts,
    thematic_block_order =
      v_requested_block_order,
    updated_at =
      v_now
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key;

  if not found then
    raise exception
      'matchday-editorial-profile-workspace-v2-control-not-found';
  end if;

  v_final_revision := v_apply.revision;

  if v_control_changed
    and v_final_revision = p_expected_revision
  then
    update
      public.matchday_editorial_profile_reconcile_control
        as control_row
    set
      revision =
        control_row.revision + 1,
      last_applied_at =
        v_now,
      updated_at =
        v_now
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key
    returning control_row.revision
    into v_final_revision;
  end if;

  return query
  select
    v_final_revision,
    token_row.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_profile_workspace_v2(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
from
  public,
  anon,
  authenticated,
  service_role;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v2(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
to service_role;

comment on function
  public.apply_matchday_editorial_profile_workspace_v2(
    uuid,
    text,
    bigint,
    text,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
is
  'Thematic workspace with independent per-zone layouts and an ordered Latest block. Capacity derives from layout. Legacy Apply is never called.';

notify pgrst, 'reload schema';

commit;