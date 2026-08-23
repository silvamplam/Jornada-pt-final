begin;

alter table public.matchday_editorial_profile_reconcile_control
  add column thematic_zone_order text[] not null default array[
    'benfica',
    'sporting',
    'fc_porto',
    'other_liga_clubs',
    'outside_liga_other'
  ]::text[];

alter table public.matchday_editorial_profile_reconcile_control
  add constraint matchday_editorial_profile_reconcile_control_thematic_zone_order_check
  check (
    pg_catalog.cardinality(thematic_zone_order) = 5
    and thematic_zone_order <@ array[
      'benfica', 'sporting', 'fc_porto', 'other_liga_clubs', 'outside_liga_other'
    ]::text[]
    and thematic_zone_order @> array[
      'benfica', 'sporting', 'fc_porto', 'other_liga_clubs', 'outside_liga_other'
    ]::text[]
  );

comment on column public.matchday_editorial_profile_reconcile_control.thematic_zone_order is
  'Ordem editorial das cinco zonas do perfil temático. É estado temático próprio e não reutiliza live_public_zone_order do circuito Legacy.';

-- Ordinary Legacy/core opening writes continue to sync to the Bank. The thematic
-- workspace already starts from canonical active Bank candidates, so those same
-- per-row syncs are redundant during its atomic Apply and would retrigger the
-- thematic distribution refresh unnecessarily.
drop trigger if exists sync_matchday_editorials_to_bank
  on public.matchday_editorials;
create trigger sync_matchday_editorials_to_bank
after insert or update on public.matchday_editorials
for each row
when (
  pg_catalog.current_setting('jornada.thematic_workspace_apply', true)
    is distinct from 'on'
)
execute function public.sync_matchday_zone_row_to_bank();

comment on trigger sync_matchday_editorials_to_bank
  on public.matchday_editorials is
  'Legacy/core Bank sync remains unchanged for ordinary writes; thematic workspace Apply suppresses only its redundant same-transaction resync.';

drop trigger if exists sync_matchday_highlights_to_bank
  on public.matchday_highlights;
create trigger sync_matchday_highlights_to_bank
after insert or update on public.matchday_highlights
for each row
when (
  pg_catalog.current_setting('jornada.thematic_workspace_apply', true)
    is distinct from 'on'
)
execute function public.sync_matchday_zone_row_to_bank();

comment on trigger sync_matchday_highlights_to_bank
  on public.matchday_highlights is
  'Legacy/core Bank sync remains unchanged for ordinary writes; thematic workspace Apply suppresses only its redundant same-transaction resync.';

create function public.matchday_editorial_profile_workspace_token(
  p_matchday_id uuid,
  p_profile_key text
)
returns table (state_token text)
language sql
stable
security definer
set search_path = ''
as $$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'thematic_reconcile', coalesce(
        (
          select token_row.state_token
          from public.matchday_editorial_profile_reconcile_token(
            p_matchday_id,
            p_profile_key
          ) as token_row
        ),
        ''
      ),
      'opening_editorial', coalesce(
        (
          select pg_catalog.to_jsonb(editorial_row)
          from public.matchday_editorials as editorial_row
          where editorial_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'opening_highlights', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(highlight_row)
            order by highlight_row.sort_order, highlight_row.id
          )
          from public.matchday_highlights as highlight_row
          where highlight_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      )
    )::text
  ) as state_token;
$$;

revoke all on function public.matchday_editorial_profile_workspace_token(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.matchday_editorial_profile_workspace_token(uuid, text)
  to service_role;

comment on function public.matchday_editorial_profile_workspace_token(uuid, text) is
  'Optimistic token for the thematic workspace. It extends the audited thematic reconcile token with the canonical shared opening; thematic zone order is already part of the reconcile control token.';

create function public.apply_matchday_editorial_profile_workspace(
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
as $$
declare
  v_current_workspace_token text;
  v_base_token text;
  v_competition_slug text;
  v_apply record;
  v_now timestamptz := pg_catalog.now();
  v_requested_opening jsonb;
  v_current_opening jsonb;
  v_requested_controls jsonb;
  v_current_controls jsonb;
  v_headline_changed boolean;
  v_context_changed boolean;
  v_highlight_1_changed boolean;
  v_highlight_2_changed boolean;
  v_highlight_3_changed boolean;
  v_highlights_changed boolean;
  v_headline_color_changed boolean;
  v_latest_placement_changed boolean;
  v_zone_order_changed boolean;
  v_editorial_changed boolean;
  v_workspace_changed boolean;
  v_final_revision bigint;
  v_headline_source_id text;
  v_context_source_id text;
  v_headline public.editorial_articles%rowtype;
  v_context public.editorial_articles%rowtype;
  v_highlight_slot integer;
  v_highlight_key text;
  v_highlight_source_id text;
  v_highlight public.editorial_articles%rowtype;
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
    or p_opening is null
    or pg_catalog.jsonb_typeof(p_opening) <> 'object'
    or p_page_controls is null
    or pg_catalog.jsonb_typeof(p_page_controls) <> 'object'
  then
    raise exception 'matchday-editorial-profile-workspace-invalid-input';
  end if;

  if p_profile_key <> 'liga_portugal_v1' then
    raise exception 'matchday-editorial-profile-workspace-invalid-profile';
  end if;

  if not (p_opening ?& array[
    'headline', 'highlight_1', 'highlight_2', 'highlight_3', 'context'
  ]) or (p_opening - array[
    'headline', 'highlight_1', 'highlight_2', 'highlight_3', 'context'
  ]) <> '{}'::jsonb then
    raise exception 'matchday-editorial-profile-workspace-invalid-opening';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(p_opening) as opening_row(slot_key, value)
    where pg_catalog.jsonb_typeof(opening_row.value) not in ('null', 'string')
      or (
        pg_catalog.jsonb_typeof(opening_row.value) = 'string'
        and nullif(pg_catalog.btrim(opening_row.value #>> '{}'), '') is null
      )
  ) then
    raise exception 'matchday-editorial-profile-workspace-invalid-opening';
  end if;

  if not (p_page_controls ?& array[
    'headline_title_color', 'latest_zone_placement', 'thematic_zone_order'
  ]) or (p_page_controls - array[
    'headline_title_color', 'latest_zone_placement', 'thematic_zone_order'
  ]) <> '{}'::jsonb then
    raise exception 'matchday-editorial-profile-workspace-invalid-page-controls';
  end if;

  if pg_catalog.jsonb_typeof(p_page_controls -> 'headline_title_color') not in ('null', 'string')
    or (
      pg_catalog.jsonb_typeof(p_page_controls -> 'headline_title_color') = 'string'
      and (p_page_controls ->> 'headline_title_color') !~ '^#[0-9A-Fa-f]{6}$'
    )
    or pg_catalog.jsonb_typeof(p_page_controls -> 'latest_zone_placement') <> 'string'
    or p_page_controls ->> 'latest_zone_placement' not in ('top', 'four_news', 'hidden')
    or pg_catalog.jsonb_typeof(p_page_controls -> 'thematic_zone_order') <> 'array'
  then
    raise exception 'matchday-editorial-profile-workspace-invalid-page-controls';
  end if;

  if pg_catalog.jsonb_array_length(p_page_controls -> 'thematic_zone_order') <> 5
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(p_page_controls -> 'thematic_zone_order') as zone_row(value)
      where pg_catalog.jsonb_typeof(zone_row.value) <> 'string'
        or zone_row.value #>> '{}' not in (
          'benfica', 'sporting', 'fc_porto', 'other_liga_clubs', 'outside_liga_other'
        )
    )
    or (
      select pg_catalog.count(distinct zone_row.value #>> '{}')
      from pg_catalog.jsonb_array_elements(p_page_controls -> 'thematic_zone_order') as zone_row(value)
    ) <> 5
  then
    raise exception 'matchday-editorial-profile-workspace-invalid-page-controls';
  end if;

  v_requested_opening := pg_catalog.jsonb_build_object(
    'headline', case when pg_catalog.jsonb_typeof(p_opening -> 'headline') = 'string'
      then pg_catalog.lower(pg_catalog.btrim(p_opening ->> 'headline')) else null end,
    'highlight_1', case when pg_catalog.jsonb_typeof(p_opening -> 'highlight_1') = 'string'
      then pg_catalog.lower(pg_catalog.btrim(p_opening ->> 'highlight_1')) else null end,
    'highlight_2', case when pg_catalog.jsonb_typeof(p_opening -> 'highlight_2') = 'string'
      then pg_catalog.lower(pg_catalog.btrim(p_opening ->> 'highlight_2')) else null end,
    'highlight_3', case when pg_catalog.jsonb_typeof(p_opening -> 'highlight_3') = 'string'
      then pg_catalog.lower(pg_catalog.btrim(p_opening ->> 'highlight_3')) else null end,
    'context', case when pg_catalog.jsonb_typeof(p_opening -> 'context') = 'string'
      then pg_catalog.lower(pg_catalog.btrim(p_opening ->> 'context')) else null end
  );
  v_requested_controls := pg_catalog.jsonb_build_object(
    'headline_title_color', case
      when pg_catalog.jsonb_typeof(p_page_controls -> 'headline_title_color') = 'string'
        then pg_catalog.upper(pg_catalog.btrim(p_page_controls ->> 'headline_title_color'))
      else null
    end,
    'latest_zone_placement', p_page_controls ->> 'latest_zone_placement',
    'thematic_zone_order', p_page_controls -> 'thematic_zone_order'
  );

  if exists (
    select 1
    from pg_catalog.jsonb_each(v_requested_opening) as opening_row(slot_key, value)
    where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
    group by pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-workspace-invalid-opening-duplicate';
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
    raise exception 'matchday-editorial-profile-workspace-matchday-not-found';
  end if;
  if v_competition_slug <> 'liga-portugal' then
    raise exception 'matchday-editorial-profile-workspace-incompatible-competition';
  end if;

  -- Preserve the core lock order: Jornada first, then shared opening/highlights,
  -- Faixa and articles. The nested audited thematic reconcile reuses these locks.
  lock table public.matchday_editorials in share row exclusive mode;
  lock table public.matchday_highlights in share row exclusive mode;
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

  perform 1
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id
    and assignment_row.profile_key = p_profile_key
  for share;
  if not found then
    raise exception 'matchday-editorial-profile-workspace-assignment-not-found';
  end if;

  perform 1
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key
  for update;

  select token_row.state_token
  into v_current_workspace_token
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
  if v_current_workspace_token is distinct from p_expected_state_token then
    raise exception 'matchday-editorial-profile-workspace-state-token-conflict';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(v_requested_opening) as opening_row(slot_key, value)
    where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
      and not exists (
        select 1
        from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified_row
        where classified_row.source_type = 'editorial_article'
          and classified_row.source_id = pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
      )
  ) then
    raise exception 'matchday-editorial-profile-workspace-invalid-opening-source';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_each(v_requested_opening) as opening_row(slot_key, value)
    where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
      and (
        exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_zone_items) as zone_row(value)
          where pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_id'))
            = pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as faixa_row(value)
          where pg_catalog.lower(pg_catalog.btrim(faixa_row.value #>> '{}'))
            = pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
        )
        or exists (
          select 1
          from pg_catalog.jsonb_array_elements(p_overrides) as override_row(value)
          where pg_catalog.lower(pg_catalog.btrim(override_row.value ->> 'source_id'))
            = pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}'))
        )
      )
  ) then
    raise exception 'matchday-editorial-profile-workspace-exclusive-opening-conflict';
  end if;

  -- Every active candidate must have exactly one effective public placement.
  if exists (
    select 1
    from public.matchday_editorial_profile_classification_plan(p_matchday_id) as classified_row
    where (
      (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_each(v_requested_opening) as opening_row(slot_key, value)
        where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
          and pg_catalog.lower(pg_catalog.btrim(opening_row.value #>> '{}')) = classified_row.source_id
      )
      + (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(p_zone_items) as zone_row(value)
        where pg_catalog.lower(pg_catalog.btrim(zone_row.value ->> 'source_id')) = classified_row.source_id
      )
      + (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(p_faixa_source_ids) as faixa_row(value)
        where pg_catalog.lower(pg_catalog.btrim(faixa_row.value #>> '{}')) = classified_row.source_id
      )
      + (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_array_elements(p_overrides) as override_row(value)
        where override_row.value ->> 'placement_target' = 'bank'
          and pg_catalog.lower(pg_catalog.btrim(override_row.value ->> 'source_id')) = classified_row.source_id
      )
    ) <> 1
  ) then
    raise exception 'matchday-editorial-profile-workspace-exclusive-placement-incomplete';
  end if;

  v_current_opening := pg_catalog.jsonb_build_object(
    'headline', (
      select pg_catalog.min(article_row.id::text)
      from public.matchday_editorials as editorial_row
      join public.editorial_articles as article_row
        on article_row.status = 'published'
       and '/noticias/' || pg_catalog.btrim(article_row.slug)
         = pg_catalog.btrim(editorial_row.headline_link_url)
      where editorial_row.matchday_id = p_matchday_id
        and editorial_row.status = 'published'
    ),
    'highlight_1', (
      select pg_catalog.min(article_row.id::text)
      from public.matchday_highlights as highlight_row
      join public.editorial_articles as article_row
        on article_row.status = 'published'
       and '/noticias/' || pg_catalog.btrim(article_row.slug)
         = pg_catalog.btrim(highlight_row.link_url)
      where highlight_row.matchday_id = p_matchday_id
        and highlight_row.sort_order = 1
        and highlight_row.status = 'published'
    ),
    'highlight_2', (
      select pg_catalog.min(article_row.id::text)
      from public.matchday_highlights as highlight_row
      join public.editorial_articles as article_row
        on article_row.status = 'published'
       and '/noticias/' || pg_catalog.btrim(article_row.slug)
         = pg_catalog.btrim(highlight_row.link_url)
      where highlight_row.matchday_id = p_matchday_id
        and highlight_row.sort_order = 2
        and highlight_row.status = 'published'
    ),
    'highlight_3', (
      select pg_catalog.min(article_row.id::text)
      from public.matchday_highlights as highlight_row
      join public.editorial_articles as article_row
        on article_row.status = 'published'
       and '/noticias/' || pg_catalog.btrim(article_row.slug)
         = pg_catalog.btrim(highlight_row.link_url)
      where highlight_row.matchday_id = p_matchday_id
        and highlight_row.sort_order = 3
        and highlight_row.status = 'published'
    ),
    'context', (
      select pg_catalog.min(article_row.id::text)
      from public.matchday_editorials as editorial_row
      join public.editorial_articles as article_row
        on article_row.status = 'published'
       and '/noticias/' || pg_catalog.btrim(article_row.slug)
         = pg_catalog.btrim(editorial_row.side_block_link_url)
      where editorial_row.matchday_id = p_matchday_id
        and editorial_row.side_block_status = 'published'
    )
  );

  v_current_controls := pg_catalog.jsonb_build_object(
    'headline_title_color', (
      select case
        when editorial_row.title_color ~ '^#[0-9A-Fa-f]{6}$'
          then pg_catalog.upper(editorial_row.title_color)
        else null
      end
      from public.matchday_editorials as editorial_row
      where editorial_row.matchday_id = p_matchday_id
    ),
    'latest_zone_placement', coalesce(
      (
        select case
          when editorial_row.latest_zone_placement in ('top', 'four_news', 'hidden')
            then editorial_row.latest_zone_placement
          else 'top'
        end
        from public.matchday_editorials as editorial_row
        where editorial_row.matchday_id = p_matchday_id
      ),
      'top'
    ),
    'thematic_zone_order', coalesce(
      (
        select pg_catalog.to_jsonb(control_row.thematic_zone_order)
        from public.matchday_editorial_profile_reconcile_control as control_row
        where control_row.matchday_id = p_matchday_id
          and control_row.profile_key = p_profile_key
      ),
      '["benfica","sporting","fc_porto","other_liga_clubs","outside_liga_other"]'::jsonb
    )
  );

  v_headline_changed := (v_current_opening -> 'headline') is distinct from (v_requested_opening -> 'headline');
  v_context_changed := (v_current_opening -> 'context') is distinct from (v_requested_opening -> 'context');
  v_highlight_1_changed := (v_current_opening -> 'highlight_1') is distinct from (v_requested_opening -> 'highlight_1');
  v_highlight_2_changed := (v_current_opening -> 'highlight_2') is distinct from (v_requested_opening -> 'highlight_2');
  v_highlight_3_changed := (v_current_opening -> 'highlight_3') is distinct from (v_requested_opening -> 'highlight_3');
  v_highlights_changed := v_highlight_1_changed or v_highlight_2_changed or v_highlight_3_changed;
  v_headline_color_changed := (v_current_controls -> 'headline_title_color') is distinct from (v_requested_controls -> 'headline_title_color');
  v_latest_placement_changed := (v_current_controls -> 'latest_zone_placement') is distinct from (v_requested_controls -> 'latest_zone_placement');
  v_zone_order_changed := (v_current_controls -> 'thematic_zone_order') is distinct from (v_requested_controls -> 'thematic_zone_order');
  v_editorial_changed := v_headline_changed or v_context_changed or v_headline_color_changed or v_latest_placement_changed;
  v_workspace_changed := v_editorial_changed or v_highlights_changed or v_zone_order_changed;

  -- Protect independent draft work only in the opening dimension that this Apply
  -- intends to replace. Color/Últimas/order changes do not rewrite draft content.
  if v_headline_changed and exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.status <> 'published'
      and coalesce(
        nullif(pg_catalog.btrim(editorial_row.title), ''),
        nullif(pg_catalog.btrim(editorial_row.summary), ''),
        nullif(pg_catalog.btrim(editorial_row.image_url), ''),
        nullif(pg_catalog.btrim(editorial_row.headline_link_url), '')
      ) is not null
  ) then
    raise exception 'matchday-editorial-profile-workspace-headline-draft-content';
  end if;

  if v_context_changed and exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.side_block_status <> 'published'
      and coalesce(
        nullif(pg_catalog.btrim(editorial_row.side_block_label), ''),
        nullif(pg_catalog.btrim(editorial_row.side_block_title), ''),
        nullif(pg_catalog.btrim(editorial_row.side_block_author), ''),
        nullif(pg_catalog.btrim(editorial_row.side_block_text), ''),
        nullif(pg_catalog.btrim(editorial_row.side_block_image_url), ''),
        nullif(pg_catalog.btrim(editorial_row.side_block_link_url), '')
      ) is not null
  ) then
    raise exception 'matchday-editorial-profile-workspace-context-draft-content';
  end if;

  for v_highlight_slot in 1..3 loop
    v_highlight_key := 'highlight_' || v_highlight_slot::text;
    if (v_current_opening -> v_highlight_key) is distinct from (v_requested_opening -> v_highlight_key) then
      if (
        select pg_catalog.count(*) > 1
        from public.matchday_highlights as highlight_row
        where highlight_row.matchday_id = p_matchday_id
          and highlight_row.sort_order = v_highlight_slot
      ) then
        raise exception 'matchday-editorial-profile-workspace-duplicate-highlight-slot';
      end if;

      if exists (
        select 1
        from public.matchday_highlights as highlight_row
        where highlight_row.matchday_id = p_matchday_id
          and highlight_row.sort_order = v_highlight_slot
          and highlight_row.status <> 'published'
          and coalesce(
            nullif(pg_catalog.btrim(highlight_row.label), ''),
            nullif(pg_catalog.btrim(highlight_row.title), ''),
            nullif(pg_catalog.btrim(highlight_row.subtitle), ''),
            nullif(pg_catalog.btrim(highlight_row.image_url), ''),
            nullif(pg_catalog.btrim(highlight_row.link_url), '')
          ) is not null
      ) then
        raise exception 'matchday-editorial-profile-workspace-highlight-draft-content';
      end if;
    end if;
  end loop;

  select token_row.state_token
  into v_base_token
  from public.matchday_editorial_profile_reconcile_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_reconcile_v2(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    v_base_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids
  );

  -- Suppress only redundant opening/highlight -> Bank resyncs inside this thematic
  -- transaction. Ordinary Legacy/core writes still execute their triggers.
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );

  if v_editorial_changed then
    v_headline_source_id := v_requested_opening ->> 'headline';
    v_context_source_id := v_requested_opening ->> 'context';

    if v_headline_changed and v_headline_source_id is not null then
      select article_row.* into strict v_headline
      from public.editorial_articles as article_row
      where article_row.id::text = v_headline_source_id
        and article_row.status = 'published';
    end if;

    if v_context_changed and v_context_source_id is not null then
      select article_row.* into strict v_context
      from public.editorial_articles as article_row
      where article_row.id::text = v_context_source_id
        and article_row.status = 'published';
    end if;

    insert into public.matchday_editorials (matchday_id, updated_at)
    values (p_matchday_id, v_now)
    on conflict (matchday_id) do nothing;

    update public.matchday_editorials as editorial_row
    set
      title = case when v_headline_changed
        then nullif(pg_catalog.btrim(v_headline.title), '') else editorial_row.title end,
      summary = case when v_headline_changed
        then nullif(pg_catalog.btrim(v_headline.subtitle), '') else editorial_row.summary end,
      image_url = case when v_headline_changed
        then nullif(pg_catalog.btrim(v_headline.image_url), '') else editorial_row.image_url end,
      headline_link_url = case when v_headline_changed
        then case when v_headline_source_id is null then null
          else '/noticias/' || pg_catalog.btrim(v_headline.slug) end
        else editorial_row.headline_link_url end,
      status = case when v_headline_changed
        then case when v_headline_source_id is null then 'draft' else 'published' end
        else editorial_row.status end,
      side_block_status = case when v_context_changed
        then case when v_context_source_id is null then 'draft' else 'published' end
        else editorial_row.side_block_status end,
      side_block_label = case when v_context_changed
        then nullif(pg_catalog.btrim(v_context.label), '') else editorial_row.side_block_label end,
      side_block_title = case when v_context_changed
        then nullif(pg_catalog.btrim(v_context.title), '') else editorial_row.side_block_title end,
      side_block_author = case when v_context_changed
        then nullif(pg_catalog.btrim(v_context.author), '') else editorial_row.side_block_author end,
      side_block_text = case when v_context_changed
        then pg_catalog.left(nullif(pg_catalog.btrim(v_context.subtitle), ''), 500)
        else editorial_row.side_block_text end,
      side_block_image_url = case when v_context_changed
        then nullif(pg_catalog.btrim(v_context.image_url), '') else editorial_row.side_block_image_url end,
      side_block_link_url = case when v_context_changed
        then case when v_context_source_id is null then null
          else '/noticias/' || pg_catalog.btrim(v_context.slug) end
        else editorial_row.side_block_link_url end,
      title_color = case when v_headline_color_changed
        then v_requested_controls ->> 'headline_title_color' else editorial_row.title_color end,
      latest_zone_placement = case when v_latest_placement_changed
        then v_requested_controls ->> 'latest_zone_placement' else editorial_row.latest_zone_placement end,
      updated_at = v_now
    where editorial_row.matchday_id = p_matchday_id;
  end if;

  if v_highlights_changed then
    for v_highlight_slot in 1..3 loop
      v_highlight_key := 'highlight_' || v_highlight_slot::text;
      if (v_current_opening -> v_highlight_key) is distinct from (v_requested_opening -> v_highlight_key) then
        v_highlight_source_id := v_requested_opening ->> v_highlight_key;

        if v_highlight_source_id is null then
          delete from public.matchday_highlights
          where matchday_id = p_matchday_id
            and sort_order = v_highlight_slot;
        else
          select article_row.* into strict v_highlight
          from public.editorial_articles as article_row
          where article_row.id::text = v_highlight_source_id
            and article_row.status = 'published';

          update public.matchday_highlights as highlight_row
          set
            label = nullif(pg_catalog.btrim(v_highlight.label), ''),
            title = nullif(pg_catalog.btrim(v_highlight.title), ''),
            subtitle = nullif(pg_catalog.btrim(v_highlight.subtitle), ''),
            image_url = nullif(pg_catalog.btrim(v_highlight.image_url), ''),
            link_url = '/noticias/' || pg_catalog.btrim(v_highlight.slug),
            status = 'published',
            updated_at = v_now
          where highlight_row.matchday_id = p_matchday_id
            and highlight_row.sort_order = v_highlight_slot;

          if not found then
            insert into public.matchday_highlights (
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
            ) values (
              p_matchday_id,
              nullif(pg_catalog.btrim(v_highlight.label), ''),
              null,
              nullif(pg_catalog.btrim(v_highlight.title), ''),
              nullif(pg_catalog.btrim(v_highlight.subtitle), ''),
              nullif(pg_catalog.btrim(v_highlight.image_url), ''),
              '/noticias/' || pg_catalog.btrim(v_highlight.slug),
              v_highlight_slot,
              'published',
              v_now,
              v_now
            );
          end if;
        end if;
      end if;
    end loop;
  end if;

  if v_zone_order_changed then
    update public.matchday_editorial_profile_reconcile_control as control_row
    set
      thematic_zone_order = array(
        select zone_row.value #>> '{}'
        from pg_catalog.jsonb_array_elements(
          v_requested_controls -> 'thematic_zone_order'
        ) with ordinality as zone_row(value, sort_order)
        order by zone_row.sort_order
      ),
      updated_at = v_now
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key;

    if not found then
      raise exception 'matchday-editorial-profile-workspace-reconcile-control-not-found';
    end if;
  end if;

  v_final_revision := v_apply.revision;
  if v_workspace_changed and v_final_revision = p_expected_revision then
    v_final_revision := p_expected_revision + 1;
    insert into public.matchday_editorial_profile_reconcile_control (
      matchday_id,
      profile_key,
      revision,
      last_applied_at,
      updated_at
    ) values (
      p_matchday_id,
      p_profile_key,
      v_final_revision,
      v_now,
      v_now
    )
    on conflict (matchday_id, profile_key) do update set
      revision = excluded.revision,
      last_applied_at = excluded.last_applied_at,
      updated_at = excluded.updated_at;
  end if;

  return query
  select
    v_final_revision,
    token_row.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    (
      select pg_catalog.count(*)::integer
      from pg_catalog.jsonb_each(v_requested_opening) as opening_row(slot_key, value)
      where pg_catalog.jsonb_typeof(opening_row.value) = 'string'
    )
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
end;
$$;

revoke all on function public.apply_matchday_editorial_profile_workspace(
  uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.apply_matchday_editorial_profile_workspace(
  uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb
) to service_role;

comment on function public.apply_matchday_editorial_profile_workspace(
  uuid, text, bigint, text, jsonb, jsonb, jsonb, jsonb, jsonb
) is
  'Atomically applies the thematic five-zone snapshot, complete shared Faixa, canonical manual opening, thematic zone order and neutral shared headline/latest controls. It validates exclusivity, draft protection and optimistic state before the first write and never calls the Legacy Apply.';

notify pgrst, 'reload schema';

commit;
