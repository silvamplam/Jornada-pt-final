begin;

-- Continuity initialization may need to annotate a canonical target Bank row
-- that is already automatically eligible. That provenance-only update must not
-- recompute the target's current automatic distribution.
create or replace function public.refresh_matchday_editorial_profile_distribution_from_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_first_matchday_id uuid;
  v_second_matchday_id uuid;
begin
  if pg_catalog.current_setting(
    'jornada.thematic_continuity_initialize',
    true
  ) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    if not old.automatic_eligible then
      return null;
    end if;

    v_first_matchday_id := old.matchday_id;
  elsif tg_op = 'INSERT' then
    if not new.automatic_eligible then
      return null;
    end if;

    v_first_matchday_id := new.matchday_id;
  elsif not old.automatic_eligible and not new.automatic_eligible then
    return null;
  elsif old.automatic_eligible and not new.automatic_eligible then
    v_first_matchday_id := old.matchday_id;
  elsif not old.automatic_eligible and new.automatic_eligible then
    v_first_matchday_id := new.matchday_id;
  elsif old.matchday_id = new.matchday_id then
    v_first_matchday_id := new.matchday_id;
  elsif old.matchday_id < new.matchday_id then
    v_first_matchday_id := old.matchday_id;
    v_second_matchday_id := new.matchday_id;
  else
    v_first_matchday_id := new.matchday_id;
    v_second_matchday_id := old.matchday_id;
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = v_first_matchday_id
  ) then
    perform public.refresh_matchday_editorial_profile_distribution(
      v_first_matchday_id
    );
  end if;

  if v_second_matchday_id is not null and exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = v_second_matchday_id
  ) then
    perform public.refresh_matchday_editorial_profile_distribution(
      v_second_matchday_id
    );
  end if;

  return null;
end;
$$;

comment on function public.refresh_matchday_editorial_profile_distribution_from_bank() is
  'Refreshes only matchdays affected by automatically eligible Bank rows; provenance-only writes performed by the atomic thematic continuity initializer are explicitly suppressed.';

create function public.initialize_matchday_editorial_thematic_continuity_v3(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns table (
  initialized boolean,
  source_matchday_id uuid,
  target_matchday_id uuid,
  source_composition_id uuid,
  inherited_bank_count integer,
  inherited_zone_item_count integer,
  inherited_faixa_count integer,
  inherited_opening_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_target_season_id uuid;
  v_source_number integer;
  v_target_number integer;
  v_source_profile_key text;
  v_target_profile_key text;
  v_source_control record;
  v_source_editorial public.matchday_editorials%rowtype;
  v_article public.editorial_articles%rowtype;
  v_required_source_ids text[];
  v_required_source_id text;
  v_existing_bank_id uuid;
  v_existing_automatic_eligible boolean;
  v_existing_continuity_matchday_id uuid;
  v_existing_continuity_composition_id uuid;
  v_target_has_own_latest boolean := false;
  v_transition_inserted integer := 0;
  v_source_zone_count integer := 0;
  v_source_faixa_count integer := 0;
  v_now timestamptz := pg_catalog.now();
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
  then
    raise exception
      'matchday-editorial-thematic-continuity-v3-invalid-input';
  end if;

  if p_source_matchday_id = p_target_matchday_id then
    raise exception
      'matchday-editorial-thematic-continuity-v3-same-matchday';
  end if;

  -- A completed transition is an absolute no-op, including when a caller later
  -- presents another historical composition for the same source or target.
  if exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
       or transition_row.target_matchday_id = p_target_matchday_id
  ) then
    return query
    select
      false,
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      0,
      0,
      0,
      0;
    return;
  end if;

  select
    source_matchday.season_id,
    target_matchday.season_id,
    source_matchday.number,
    target_matchday.number
  into
    v_source_season_id,
    v_target_season_id,
    v_source_number,
    v_target_number
  from public.matchdays as source_matchday
  cross join public.matchdays as target_matchday
  where source_matchday.id = p_source_matchday_id
    and target_matchday.id = p_target_matchday_id;

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-matchday-not-found';
  end if;

  -- Deterministic row locks serialize any initializer sharing either matchday.
  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id in (
    p_source_matchday_id,
    p_target_matchday_id
  )
  order by matchday_row.id
  for update;

  -- Keep the source snapshots and the target conflict checks stable through the
  -- marker insert and every subsequent write in this transaction.
  lock table public.matchday_editorials in share row exclusive mode;
  lock table public.matchday_highlights in share row exclusive mode;
  lock table public.matchday_horizontal_news in share row exclusive mode;
  lock table public.editorial_articles in share mode;
  lock table public.matchday_editorial_bank_items in share row exclusive mode;
  lock table public.matchday_editorial_profile_assignments in share row exclusive mode;
  lock table public.matchday_editorial_profile_reconcile_control in share row exclusive mode;
  lock table public.matchday_editorial_profile_zone_items in share row exclusive mode;
  lock table public.matchday_editorial_profile_manual_overrides in share row exclusive mode;
  lock table public.matchday_editorial_desk_control in share row exclusive mode;
  lock table public.matchday_reference_compositions in share mode;
  lock table public.matchday_live_layout_items in share mode;
  lock table public.matchday_latest_news in share mode;

  -- A concurrent initializer may have completed while this call waited for the
  -- matchday locks. Recheck before validation and before any write.
  if exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
       or transition_row.target_matchday_id = p_target_matchday_id
  ) then
    return query
    select
      false,
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      0,
      0,
      0,
      0;
    return;
  end if;

  if v_source_season_id <> v_target_season_id then
    raise exception
      'matchday-editorial-thematic-continuity-v3-season-mismatch';
  end if;

  if v_target_number <> v_source_number + 1 then
    raise exception
      'matchday-editorial-thematic-continuity-v3-target-not-consecutive';
  end if;

  select assignment_row.profile_key
  into v_source_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_source_matchday_id
  for share;

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-assignment-invalid';
  end if;

  if v_source_profile_key <> 'liga_portugal_v1' then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-assignment-invalid';
  end if;

  select assignment_row.profile_key
  into v_target_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_target_matchday_id
  for share;

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-target-assignment-mismatch';
  end if;

  if v_target_profile_key <> v_source_profile_key then
    raise exception
      'matchday-editorial-thematic-continuity-v3-target-assignment-mismatch';
  end if;

  select control_row.*
  into v_source_control
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id = p_source_matchday_id
    and control_row.profile_key = v_source_profile_key
  for share;

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-not-applied';
  end if;

  if v_source_control.last_applied_at is null
    or v_source_control.revision < 1
  then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-not-applied';
  end if;

  perform 1
  from public.matchday_reference_compositions as composition_row
  where composition_row.id = p_source_composition_id
    and composition_row.matchday_id = p_source_matchday_id
    and composition_row.status = 'published'
    and composition_row.is_current = true
  for share;

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-composition-invalid';
  end if;

  perform 1
  from public.matchday_editorial_desk_control as desk_row
  where desk_row.matchday_id = p_source_matchday_id
    and desk_row.is_managed = false
  for update;

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-still-managed';
  end if;

  perform 1
  from public.matchday_editorial_desk_control as desk_row
  where desk_row.matchday_id = p_target_matchday_id
    and desk_row.is_managed = true
  for update;

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-target-not-managed';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where control_row.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_zone_items as zone_row
    where zone_row.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = p_target_matchday_id
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-target-already-applied';
  end if;

  if exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_target_matchday_id
      and (
        coalesce(
          nullif(pg_catalog.btrim(editorial_row.title), ''),
          nullif(pg_catalog.btrim(editorial_row.summary), ''),
          nullif(pg_catalog.btrim(editorial_row.image_url), ''),
          nullif(pg_catalog.btrim(editorial_row.headline_link_url), '')
        ) is not null
        or coalesce(
          nullif(pg_catalog.btrim(editorial_row.side_block_label), ''),
          nullif(pg_catalog.btrim(editorial_row.side_block_title), ''),
          nullif(pg_catalog.btrim(editorial_row.side_block_author), ''),
          nullif(pg_catalog.btrim(editorial_row.side_block_text), ''),
          nullif(pg_catalog.btrim(editorial_row.side_block_image_url), ''),
          nullif(pg_catalog.btrim(editorial_row.side_block_link_url), '')
        ) is not null
      )
  ) or exists (
    select 1
    from public.matchday_highlights as highlight_row
    where highlight_row.matchday_id = p_target_matchday_id
      and coalesce(
        nullif(pg_catalog.btrim(highlight_row.label), ''),
        nullif(pg_catalog.btrim(highlight_row.title), ''),
        nullif(pg_catalog.btrim(highlight_row.subtitle), ''),
        nullif(pg_catalog.btrim(highlight_row.image_url), ''),
        nullif(pg_catalog.btrim(highlight_row.link_url), '')
      ) is not null
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-target-opening-not-empty';
  end if;

  -- A pre-existing Faixa would make it impossible to retain the complete source
  -- ordering without overwriting target work. Fail closed instead.
  if exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_target_matchday_id
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-target-faixa-not-empty';
  end if;

  select editorial_row.*
  into v_source_editorial
  from public.matchday_editorials as editorial_row
  where editorial_row.matchday_id = p_source_matchday_id
    and editorial_row.status = 'published'
    and editorial_row.side_block_status = 'published';

  if not found then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-opening-incomplete';
  end if;

  if nullif(pg_catalog.btrim(v_source_editorial.headline_link_url), '') is null
    or nullif(pg_catalog.btrim(v_source_editorial.side_block_link_url), '') is null
  then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-opening-incomplete';
  end if;

  if 1 <> (
    select pg_catalog.count(*)
    from public.editorial_articles as article_row
    where article_row.status = 'published'
      and nullif(pg_catalog.btrim(article_row.slug), '') is not null
      and '/noticias/' || pg_catalog.btrim(article_row.slug)
        = pg_catalog.btrim(v_source_editorial.headline_link_url)
  ) or 1 <> (
    select pg_catalog.count(*)
    from public.editorial_articles as article_row
    where article_row.status = 'published'
      and nullif(pg_catalog.btrim(article_row.slug), '') is not null
      and '/noticias/' || pg_catalog.btrim(article_row.slug)
        = pg_catalog.btrim(v_source_editorial.side_block_link_url)
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-opening-unresolved';
  end if;

  if 3 <> (
    select pg_catalog.count(*)
    from public.matchday_highlights as highlight_row
    where highlight_row.matchday_id = p_source_matchday_id
      and highlight_row.status = 'published'
      and highlight_row.sort_order between 1 and 3
  ) or 3 <> (
    select pg_catalog.count(distinct highlight_row.sort_order)
    from public.matchday_highlights as highlight_row
    where highlight_row.matchday_id = p_source_matchday_id
      and highlight_row.status = 'published'
      and highlight_row.sort_order between 1 and 3
  ) or exists (
    select 1
    from public.matchday_highlights as highlight_row
    where highlight_row.matchday_id = p_source_matchday_id
      and highlight_row.status = 'published'
      and highlight_row.sort_order between 1 and 3
      and (
        nullif(pg_catalog.btrim(highlight_row.link_url), '') is null
        or 1 <> (
          select pg_catalog.count(*)
          from public.editorial_articles as article_row
          where article_row.status = 'published'
            and nullif(pg_catalog.btrim(article_row.slug), '') is not null
            and '/noticias/' || pg_catalog.btrim(article_row.slug)
              = pg_catalog.btrim(highlight_row.link_url)
        )
      )
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-highlights-incomplete';
  end if;

  select pg_catalog.count(*)::integer
  into v_source_zone_count
  from public.matchday_editorial_profile_zone_items as zone_row
  where zone_row.matchday_id = p_source_matchday_id
    and zone_row.profile_key = v_source_profile_key;

  if v_source_zone_count = 0 or exists (
    select 1
    from public.matchday_editorial_profile_zone_items as zone_row
    where zone_row.matchday_id = p_source_matchday_id
      and zone_row.profile_key = v_source_profile_key
      and (
        pg_catalog.lower(pg_catalog.btrim(zone_row.source_type))
          <> 'editorial_article'
        or not exists (
          select 1
          from public.editorial_articles as article_row
          where article_row.id::text = pg_catalog.lower(
              pg_catalog.btrim(zone_row.source_id)
            )
            and article_row.status = 'published'
        )
      )
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-zones-invalid';
  end if;

  select pg_catalog.count(*)::integer
  into v_source_faixa_count
  from public.matchday_horizontal_news as faixa_row
  where faixa_row.matchday_id = p_source_matchday_id
    and faixa_row.status = 'published';

  if exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_source_matchday_id
      and faixa_row.status = 'published'
      and 1 <> (
        select pg_catalog.count(*)
        from public.editorial_articles as article_row
        where article_row.status = 'published'
          and nullif(pg_catalog.btrim(article_row.slug), '') is not null
          and '/noticias/' || pg_catalog.btrim(article_row.slug)
            = pg_catalog.btrim(faixa_row.link_url)
      )
  ) or exists (
    select 1
    from public.matchday_horizontal_news as faixa_row
    join public.editorial_articles as article_row
      on article_row.status = 'published'
     and '/noticias/' || pg_catalog.btrim(article_row.slug)
       = pg_catalog.btrim(faixa_row.link_url)
    where faixa_row.matchday_id = p_source_matchday_id
      and faixa_row.status = 'published'
    group by article_row.id
    having pg_catalog.count(*) > 1
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-faixa-invalid';
  end if;

  select
    exists (
      select 1
      from public.matchday_live_layout_items as live_row
      where live_row.matchday_id = p_target_matchday_id
        and pg_catalog.lower(pg_catalog.btrim(live_row.slot_type))
          like 'live_four_news:%'
    ) or exists (
      select 1
      from public.matchday_latest_news as latest_row
      where latest_row.matchday_id = p_target_matchday_id
    )
  into v_target_has_own_latest;

  with required_sources as (
    select pg_catalog.lower(pg_catalog.btrim(zone_row.source_id)) as source_id
    from public.matchday_editorial_profile_zone_items as zone_row
    where zone_row.matchday_id = p_source_matchday_id
      and zone_row.profile_key = v_source_profile_key

    union

    select article_row.id::text
    from public.editorial_articles as article_row
    where article_row.status = 'published'
      and '/noticias/' || pg_catalog.btrim(article_row.slug) in (
        pg_catalog.btrim(v_source_editorial.headline_link_url),
        pg_catalog.btrim(v_source_editorial.side_block_link_url)
      )

    union

    select article_row.id::text
    from public.matchday_highlights as highlight_row
    join public.editorial_articles as article_row
      on article_row.status = 'published'
     and '/noticias/' || pg_catalog.btrim(article_row.slug)
       = pg_catalog.btrim(highlight_row.link_url)
    where highlight_row.matchday_id = p_source_matchday_id
      and highlight_row.status = 'published'
      and highlight_row.sort_order between 1 and 3

    union

    select article_row.id::text
    from public.matchday_horizontal_news as faixa_row
    join public.editorial_articles as article_row
      on article_row.status = 'published'
     and '/noticias/' || pg_catalog.btrim(article_row.slug)
       = pg_catalog.btrim(faixa_row.link_url)
    where faixa_row.matchday_id = p_source_matchday_id
      and faixa_row.status = 'published'
  )
  select pg_catalog.array_agg(
    required_row.source_id
    order by required_row.source_id
  )
  into v_required_source_ids
  from required_sources as required_row;

  if v_required_source_ids is null or exists (
    select 1
    from pg_catalog.unnest(v_required_source_ids) as required_row(source_id)
    join public.editorial_articles as article_row
      on article_row.id::text = required_row.source_id
    where article_row.status <> 'published'
      or nullif(pg_catalog.btrim(article_row.title), '') is null
      or nullif(pg_catalog.btrim(article_row.slug), '') is null
  ) then
    raise exception
      'matchday-editorial-thematic-continuity-v3-source-bank-invalid';
  end if;

  -- First logical write: the uniqueness constraints on source and target are the
  -- idempotency boundary. Every later exception rolls this row back as well.
  insert into public.matchday_editorial_continuity_transitions (
    source_matchday_id,
    target_matchday_id,
    source_composition_id,
    continuity_version
  ) values (
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    3
  )
  on conflict do nothing;

  get diagnostics v_transition_inserted = row_count;

  if v_transition_inserted = 0 then
    return query
    select
      false,
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      0,
      0,
      0,
      0;
    return;
  end if;

  perform pg_catalog.set_config(
    'jornada.thematic_continuity_initialize',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_faixa_reconcile',
    'on',
    true
  );

  foreach v_required_source_id in array v_required_source_ids
  loop
    select article_row.*
    into strict v_article
    from public.editorial_articles as article_row
    where article_row.id::text = v_required_source_id
      and article_row.status = 'published';

    v_existing_bank_id := null;
    v_existing_automatic_eligible := null;
    v_existing_continuity_matchday_id := null;
    v_existing_continuity_composition_id := null;

    select
      bank_row.id,
      bank_row.automatic_eligible,
      bank_row.continuity_source_matchday_id,
      bank_row.continuity_source_composition_id
    into
      v_existing_bank_id,
      v_existing_automatic_eligible,
      v_existing_continuity_matchday_id,
      v_existing_continuity_composition_id
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_target_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
        = 'editorial_article'
      and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
        = v_required_source_id
    order by bank_row.created_at, bank_row.id
    limit 1
    for update;

    if v_existing_bank_id is not null then
      if (
        v_existing_continuity_matchday_id is not null
        and v_existing_continuity_matchday_id <> p_source_matchday_id
      ) or (
        v_existing_continuity_composition_id is not null
        and v_existing_continuity_composition_id <> p_source_composition_id
      ) then
        raise exception
          'matchday-editorial-thematic-continuity-v3-bank-provenance-conflict';
      end if;

      if v_existing_continuity_matchday_id is null then
        update public.matchday_editorial_bank_items as bank_row
        set continuity_source_matchday_id = p_source_matchday_id,
            continuity_source_composition_id = p_source_composition_id
        where bank_row.id = v_existing_bank_id;
      end if;
    else
      if exists (
        select 1
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.matchday_id = p_target_matchday_id
          and pg_catalog.lower(
            pg_catalog.regexp_replace(
              pg_catalog.split_part(
                pg_catalog.split_part(coalesce(bank_row.link_url, ''), '?', 1),
                '#',
                1
              ),
              '/$',
              ''
            )
          ) = pg_catalog.lower('/noticias/' || pg_catalog.btrim(v_article.slug))
      ) then
        raise exception
          'matchday-editorial-thematic-continuity-v3-bank-link-conflict';
      end if;

      insert into public.matchday_editorial_bank_items (
        matchday_id,
        label,
        label_color,
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
        continuity_source_matchday_id,
        continuity_source_composition_id
      ) values (
        p_target_matchday_id,
        nullif(pg_catalog.btrim(v_article.label), ''),
        null,
        pg_catalog.btrim(v_article.title),
        nullif(pg_catalog.btrim(v_article.subtitle), ''),
        nullif(pg_catalog.btrim(v_article.image_url), ''),
        '/noticias/' || pg_catalog.btrim(v_article.slug),
        'editorial_article',
        v_required_source_id,
        pg_catalog.btrim(v_article.slug),
        null,
        null,
        'active',
        false,
        p_source_matchday_id,
        p_source_composition_id
      );
    end if;
  end loop;

  insert into public.matchday_editorials (
    matchday_id,
    updated_at
  ) values (
    p_target_matchday_id,
    v_now
  )
  on conflict (matchday_id) do nothing;

  update public.matchday_editorials as target_editorial
  set title = v_source_editorial.title,
      summary = v_source_editorial.summary,
      title_color = v_source_editorial.title_color,
      image_url = v_source_editorial.image_url,
      headline_link_url = v_source_editorial.headline_link_url,
      status = 'published',
      side_block_status = 'published',
      side_block_type = v_source_editorial.side_block_type,
      side_block_label = v_source_editorial.side_block_label,
      side_block_label_color = v_source_editorial.side_block_label_color,
      side_block_title = v_source_editorial.side_block_title,
      side_block_title_color = v_source_editorial.side_block_title_color,
      side_block_author = v_source_editorial.side_block_author,
      side_block_text = v_source_editorial.side_block_text,
      side_block_image_url = v_source_editorial.side_block_image_url,
      side_block_link_url = v_source_editorial.side_block_link_url,
      complementary_mode = 'none',
      complementary_status = 'draft',
      complementary_roundup_item_id = null,
      complementary_label = null,
      complementary_title = null,
      complementary_text = null,
      complementary_image_url = null,
      complementary_link_url = null,
      complementary_text_color = null,
      roundup_video_heading = null,
      roundup_video_heading_color = null,
      latest_zone_placement = case
        when v_target_has_own_latest then target_editorial.latest_zone_placement
        else v_source_editorial.latest_zone_placement
      end,
      latest_zone_title = case
        when v_target_has_own_latest then target_editorial.latest_zone_title
        else v_source_editorial.latest_zone_title
      end,
      latest_zone_title_color = case
        when v_target_has_own_latest then target_editorial.latest_zone_title_color
        else v_source_editorial.latest_zone_title_color
      end,
      updated_at = v_now
  where target_editorial.matchday_id = p_target_matchday_id;

  delete from public.matchday_highlights as target_highlight
  where target_highlight.matchday_id = p_target_matchday_id;

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
  )
  select
    p_target_matchday_id,
    source_highlight.label,
    source_highlight.label_color,
    source_highlight.title,
    source_highlight.subtitle,
    source_highlight.image_url,
    source_highlight.link_url,
    source_highlight.sort_order,
    'published',
    v_now,
    v_now
  from public.matchday_highlights as source_highlight
  where source_highlight.matchday_id = p_source_matchday_id
    and source_highlight.status = 'published'
    and source_highlight.sort_order between 1 and 3
  order by source_highlight.sort_order;

  insert into public.matchday_editorial_profile_reconcile_control (
    matchday_id,
    profile_key,
    revision,
    last_applied_at,
    thematic_zone_order,
    thematic_zone_layouts,
    thematic_zone_titles,
    thematic_block_order,
    updated_at
  ) values (
    p_target_matchday_id,
    v_source_profile_key,
    1,
    v_now,
    v_source_control.thematic_zone_order,
    v_source_control.thematic_zone_layouts,
    v_source_control.thematic_zone_titles,
    v_source_control.thematic_block_order,
    v_now
  );

  insert into public.matchday_editorial_profile_zone_items (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    zone_key,
    sort_order,
    created_at,
    updated_at
  )
  select
    p_target_matchday_id,
    source_zone.profile_key,
    source_zone.source_type,
    source_zone.source_id,
    source_zone.zone_key,
    source_zone.sort_order,
    v_now,
    v_now
  from public.matchday_editorial_profile_zone_items as source_zone
  where source_zone.matchday_id = p_source_matchday_id
    and source_zone.profile_key = v_source_profile_key
  order by source_zone.zone_key, source_zone.sort_order;

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
    p_target_matchday_id,
    source_faixa.label,
    source_faixa.label_color,
    source_faixa.title,
    source_faixa.subtitle,
    source_faixa.image_url,
    source_faixa.link_url,
    source_faixa.sort_order,
    'published',
    v_now,
    v_now
  from public.matchday_horizontal_news as source_faixa
  where source_faixa.matchday_id = p_source_matchday_id
    and source_faixa.status = 'published'
  order by source_faixa.sort_order;

  -- Supersede only the obsolete v2 snapshot. The target remains managed and all
  -- unrelated Desk control state is preserved.
  update public.matchday_editorial_desk_control as desk_row
  set carryover_source_composition_id = null,
      carryover_snapshot = null
  where desk_row.matchday_id = p_target_matchday_id
    and desk_row.is_managed = true;

  return query
  select
    true,
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    pg_catalog.cardinality(v_required_source_ids)::integer,
    v_source_zone_count,
    v_source_faixa_count,
    5;
end;
$function$;

comment on function public.initialize_matchday_editorial_thematic_continuity_v3(
  uuid,
  uuid,
  uuid
) is
  'Atomically initializes one source-to-next-matchday thematic continuity transition, preserving target automatic and Latest state while materializing the applied opening, zones, controls and complete live Faixa.';

revoke all on function public.initialize_matchday_editorial_thematic_continuity_v3(
  uuid,
  uuid,
  uuid
) from public, anon, authenticated, service_role;

grant execute on function public.initialize_matchday_editorial_thematic_continuity_v3(
  uuid,
  uuid,
  uuid
) to service_role;

notify pgrst, 'reload schema';

commit;
