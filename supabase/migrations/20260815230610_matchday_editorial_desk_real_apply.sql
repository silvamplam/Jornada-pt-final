begin;

create table if not exists public.matchday_editorial_desk_control (
  matchday_id uuid primary key references public.matchdays(id) on delete cascade,
  is_managed boolean not null default false,
  faixa_visible boolean not null default true,
  revision bigint not null default 0,
  last_applied_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint matchday_editorial_desk_control_revision_check check (revision >= 0)
);

alter table public.matchday_editorial_desk_control enable row level security;

revoke all on table public.matchday_editorial_desk_control from public, anon, authenticated;
grant select, insert, update, delete on table public.matchday_editorial_desk_control to service_role;

comment on table public.matchday_editorial_desk_control is
  'Estado global e controlo de concorrência da Mesa de Edição de cada Jornada.';
comment on column public.matchday_editorial_desk_control.is_managed is
  'Depois do primeiro Apply, a página pública passa a usar exclusivamente as zonas vivas.';
comment on column public.matchday_editorial_desk_control.faixa_visible is
  'Visibilidade pública da Faixa; ocultar não remove os respetivos artigos.';
comment on column public.matchday_editorial_desk_control.revision is
  'Revisão monotónica do último estado final aplicado pela Mesa.';

create or replace function public.matchday_editorial_desk_state_token(p_matchday_id uuid)
returns text
language sql
stable
security invoker
set search_path = ''
as $$
  select md5(
    jsonb_build_object(
      'matchday', coalesce(
        (
          select to_jsonb(matchday_row)
          from public.matchdays as matchday_row
          where matchday_row.id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'control', coalesce(
        (
          select to_jsonb(control_row)
          from public.matchday_editorial_desk_control as control_row
          where control_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'articles', coalesce(
        (
          select jsonb_agg(to_jsonb(article_row) order by article_row.id)
          from public.editorial_articles as article_row
          where article_row.matchday_id = p_matchday_id
            and article_row.status = 'published'
        ),
        '[]'::jsonb
      ),
      'editorial', coalesce(
        (
          select jsonb_agg(to_jsonb(editorial_row) order by editorial_row.id)
          from public.matchday_editorials as editorial_row
          where editorial_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'highlights', coalesce(
        (
          select jsonb_agg(to_jsonb(highlight_row) order by highlight_row.sort_order, highlight_row.id)
          from public.matchday_highlights as highlight_row
          where highlight_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'latest', coalesce(
        (
          select jsonb_agg(to_jsonb(latest_row) order by latest_row.sort_order, latest_row.id)
          from public.matchday_latest_news as latest_row
          where latest_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'faixa', coalesce(
        (
          select jsonb_agg(to_jsonb(faixa_row) order by faixa_row.sort_order, faixa_row.id)
          from public.matchday_horizontal_news as faixa_row
          where faixa_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'layouts', coalesce(
        (
          select jsonb_agg(to_jsonb(layout_row) order by layout_row.slot_type, layout_row.id)
          from public.matchday_live_layout_items as layout_row
          where layout_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      )
    )::text
  );
$$;

revoke execute on function public.matchday_editorial_desk_state_token(uuid) from public, anon, authenticated;
grant execute on function public.matchday_editorial_desk_state_token(uuid) to service_role;

create or replace function public.apply_matchday_editorial_desk_state(
  p_matchday_id uuid,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_faixa_visible boolean,
  p_articles jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_now timestamptz := now();
  v_revision bigint := 0;
  v_next_revision bigint;
  v_current_token text;
  v_payload_count integer;
  v_faixa_count integer;
  v_headline public.editorial_articles%rowtype;
  v_side_block public.editorial_articles%rowtype;
  v_complement public.editorial_articles%rowtype;
  v_has_headline boolean := false;
  v_has_side_block boolean := false;
  v_has_complement boolean := false;
begin
  if p_expected_revision is null or p_expected_revision < 0
    or nullif(btrim(p_expected_state_token), '') is null
    or p_faixa_visible is null
    or jsonb_typeof(p_articles) <> 'array'
  then
    raise exception 'editorial-desk-invalid-state';
  end if;

  perform 1
  from public.matchdays
  where id = p_matchday_id
  for update;
  if not found then
    raise exception 'editorial-desk-matchday-not-found';
  end if;

  -- The existing administrative writers do not share a per-Jornada advisory lock.
  -- These short, consistently ordered locks close the optimistic-token race window.
  lock table public.matchday_editorials in share row exclusive mode;
  lock table public.matchday_highlights in share row exclusive mode;
  lock table public.matchday_horizontal_news in share row exclusive mode;
  lock table public.matchday_latest_news in share row exclusive mode;
  lock table public.matchday_live_layout_items in share row exclusive mode;
  lock table public.editorial_articles in share row exclusive mode;

  select control_row.revision
  into v_revision
  from public.matchday_editorial_desk_control as control_row
  where control_row.matchday_id = p_matchday_id
  for update;
  v_revision := coalesce(v_revision, 0);

  if v_revision <> p_expected_revision then
    raise exception 'editorial-desk-conflict';
  end if;

  v_current_token := public.matchday_editorial_desk_state_token(p_matchday_id);
  if v_current_token is distinct from p_expected_state_token then
    raise exception 'editorial-desk-state-token-conflict';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_articles) as input_row(value)
    where jsonb_typeof(input_row.value) <> 'object'
      or not (input_row.value ? 'article_id')
      or not (input_row.value ? 'in_latest')
      or not (input_row.value ? 'placement_key')
      or jsonb_typeof(input_row.value -> 'article_id') <> 'string'
      or (input_row.value ->> 'article_id') !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      or jsonb_typeof(input_row.value -> 'in_latest') <> 'boolean'
      or (
        input_row.value -> 'placement_key' <> 'null'::jsonb
        and jsonb_typeof(input_row.value -> 'placement_key') <> 'string'
      )
  ) then
    raise exception 'editorial-desk-invalid-state';
  end if;

  select count(*) into v_payload_count
  from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text);

  if v_payload_count <> (
    select count(*)
    from public.editorial_articles as article_row
    where article_row.matchday_id = p_matchday_id
      and article_row.status = 'published'
  ) then
    raise exception 'editorial-desk-incomplete-state';
  end if;

  if exists (
    select desired.article_id
    from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
    group by desired.article_id
    having count(*) > 1
  ) or exists (
    select 1
    from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
    left join public.editorial_articles as article_row
      on article_row.id = desired.article_id
      and article_row.matchday_id = p_matchday_id
      and article_row.status = 'published'
    where article_row.id is null
      or nullif(btrim(article_row.slug), '') is null
      or nullif(btrim(article_row.title), '') is null
  ) then
    raise exception 'editorial-desk-incomplete-state';
  end if;

  if exists (
    select 1
    from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
    where desired.placement_key is not null
      and desired.placement_key not in (
        'headline',
        'side_block',
        'highlight:1',
        'highlight:2',
        'highlight:3',
        'complement',
        'live_four_news:1',
        'live_four_news:2',
        'live_four_news:3',
        'live_four_news:4',
        'live_hierarchical:secondary_strong_1',
        'live_hierarchical:secondary_strong_2',
        'live_hierarchical:secondary_1',
        'live_hierarchical:secondary_2',
        'live_hierarchical:dominant_side_top',
        'live_hierarchical:dominant_side_bottom',
        'live_hierarchical:secondary_3',
        'live_hierarchical:secondary_4',
        'live_hierarchical:closing_1',
        'live_hierarchical:closing_2',
        'live_hierarchical:closing_3',
        'live_beyond_matchday:1',
        'live_beyond_matchday:2',
        'live_beyond_matchday:3',
        'live_beyond_matchday:4',
        'live_beyond_matchday:5'
      )
      and desired.placement_key !~ '^important_item:[1-9][0-9]*$'
  ) then
    raise exception 'editorial-desk-invalid-placement';
  end if;

  if exists (
    select desired.placement_key
    from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
    where desired.placement_key is not null
    group by desired.placement_key
    having count(*) > 1
  ) then
    raise exception 'editorial-desk-duplicate-placement';
  end if;

  select count(*) into v_faixa_count
  from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
  where desired.placement_key like 'important_item:%';

  if exists (
    select 1
    from generate_series(1, v_faixa_count) as expected(sort_order)
    where not exists (
      select 1
      from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
      where desired.placement_key = 'important_item:' || expected.sort_order::text
    )
  ) then
    raise exception 'editorial-desk-invalid-faixa-order';
  end if;

  -- Content in a draft state would otherwise be overwritten by the full-state apply.
  if exists (
    select 1 from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.status <> 'published'
      and coalesce(
        nullif(btrim(editorial_row.title), ''),
        nullif(btrim(editorial_row.summary), ''),
        nullif(btrim(editorial_row.image_url), ''),
        nullif(btrim(editorial_row.headline_link_url), '')
      ) is not null
  ) or exists (
    select 1 from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.side_block_status <> 'published'
      and coalesce(
        nullif(btrim(editorial_row.side_block_label), ''),
        nullif(btrim(editorial_row.side_block_title), ''),
        nullif(btrim(editorial_row.side_block_author), ''),
        nullif(btrim(editorial_row.side_block_text), ''),
        nullif(btrim(editorial_row.side_block_image_url), ''),
        nullif(btrim(editorial_row.side_block_link_url), '')
      ) is not null
  ) or exists (
    select 1 from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.complementary_status <> 'published'
      and coalesce(
        nullif(btrim(editorial_row.complementary_label), ''),
        nullif(btrim(editorial_row.complementary_title), ''),
        nullif(btrim(editorial_row.complementary_text), ''),
        nullif(btrim(editorial_row.complementary_image_url), ''),
        nullif(btrim(editorial_row.complementary_link_url), '')
      ) is not null
  ) or exists (
    select 1 from public.matchday_highlights as highlight_row
    where highlight_row.matchday_id = p_matchday_id
      and highlight_row.status <> 'published'
      and coalesce(
        nullif(btrim(highlight_row.label), ''),
        nullif(btrim(highlight_row.title), ''),
        nullif(btrim(highlight_row.subtitle), ''),
        nullif(btrim(highlight_row.image_url), ''),
        nullif(btrim(highlight_row.link_url), '')
      ) is not null
  ) or exists (
    select 1 from public.matchday_latest_news as latest_row
    where latest_row.matchday_id = p_matchday_id
      and latest_row.status <> 'published'
      and coalesce(
        nullif(btrim(latest_row.time_label), ''),
        nullif(btrim(latest_row.title), ''),
        nullif(btrim(latest_row.subtitle), ''),
        nullif(btrim(latest_row.image_url), ''),
        nullif(btrim(latest_row.link_url), '')
      ) is not null
  ) or exists (
    select 1 from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_matchday_id
      and faixa_row.status <> 'published'
      and coalesce(
        nullif(btrim(faixa_row.label), ''),
        nullif(btrim(faixa_row.title), ''),
        nullif(btrim(faixa_row.subtitle), ''),
        nullif(btrim(faixa_row.image_url), ''),
        nullif(btrim(faixa_row.link_url), '')
      ) is not null
  ) then
    raise exception 'editorial-desk-draft-content';
  end if;

  -- Every visible occupant must resolve to exactly one canonical article by /noticias/<slug>.
  if exists (
    select 1 from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.status = 'published'
      and coalesce(
        nullif(btrim(editorial_row.title), ''),
        nullif(btrim(editorial_row.summary), ''),
        nullif(btrim(editorial_row.image_url), ''),
        nullif(btrim(editorial_row.headline_link_url), '')
      ) is not null
      and 1 <> (
        select count(*) from public.editorial_articles as article_row
        where article_row.matchday_id = p_matchday_id
          and article_row.status = 'published'
          and '/noticias/' || btrim(article_row.slug) = btrim(editorial_row.headline_link_url)
      )
  ) or exists (
    select 1 from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.side_block_status = 'published'
      and coalesce(
        nullif(btrim(editorial_row.side_block_label), ''),
        nullif(btrim(editorial_row.side_block_title), ''),
        nullif(btrim(editorial_row.side_block_author), ''),
        nullif(btrim(editorial_row.side_block_text), ''),
        nullif(btrim(editorial_row.side_block_image_url), ''),
        nullif(btrim(editorial_row.side_block_link_url), '')
      ) is not null
      and 1 <> (
        select count(*) from public.editorial_articles as article_row
        where article_row.matchday_id = p_matchday_id
          and article_row.status = 'published'
          and '/noticias/' || btrim(article_row.slug) = btrim(editorial_row.side_block_link_url)
      )
  ) or exists (
    select 1 from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.complementary_status = 'published'
      and coalesce(
        nullif(btrim(editorial_row.complementary_label), ''),
        nullif(btrim(editorial_row.complementary_title), ''),
        nullif(btrim(editorial_row.complementary_text), ''),
        nullif(btrim(editorial_row.complementary_image_url), ''),
        nullif(btrim(editorial_row.complementary_link_url), '')
      ) is not null
      and 1 <> (
        select count(*) from public.editorial_articles as article_row
        where article_row.matchday_id = p_matchday_id
          and article_row.status = 'published'
          and '/noticias/' || btrim(article_row.slug) = btrim(editorial_row.complementary_link_url)
      )
  ) or exists (
    select 1 from public.matchday_highlights as highlight_row
    where highlight_row.matchday_id = p_matchday_id
      and highlight_row.status = 'published'
      and coalesce(
        nullif(btrim(highlight_row.label), ''),
        nullif(btrim(highlight_row.title), ''),
        nullif(btrim(highlight_row.subtitle), ''),
        nullif(btrim(highlight_row.image_url), ''),
        nullif(btrim(highlight_row.link_url), '')
      ) is not null
      and 1 <> (
        select count(*) from public.editorial_articles as article_row
        where article_row.matchday_id = p_matchday_id
          and article_row.status = 'published'
          and '/noticias/' || btrim(article_row.slug) = btrim(highlight_row.link_url)
      )
  ) or exists (
    select 1 from public.matchday_latest_news as latest_row
    where latest_row.matchday_id = p_matchday_id
      and latest_row.status = 'published'
      and coalesce(
        nullif(btrim(latest_row.time_label), ''),
        nullif(btrim(latest_row.title), ''),
        nullif(btrim(latest_row.subtitle), ''),
        nullif(btrim(latest_row.image_url), ''),
        nullif(btrim(latest_row.link_url), '')
      ) is not null
      and 1 <> (
        select count(*) from public.editorial_articles as article_row
        where article_row.matchday_id = p_matchday_id
          and article_row.status = 'published'
          and '/noticias/' || btrim(article_row.slug) = btrim(latest_row.link_url)
      )
  ) or exists (
    select 1 from public.matchday_horizontal_news as faixa_row
    where faixa_row.matchday_id = p_matchday_id
      and faixa_row.status = 'published'
      and coalesce(
        nullif(btrim(faixa_row.label), ''),
        nullif(btrim(faixa_row.title), ''),
        nullif(btrim(faixa_row.subtitle), ''),
        nullif(btrim(faixa_row.image_url), ''),
        nullif(btrim(faixa_row.link_url), '')
      ) is not null
      and 1 <> (
        select count(*) from public.editorial_articles as article_row
        where article_row.matchday_id = p_matchday_id
          and article_row.status = 'published'
          and '/noticias/' || btrim(article_row.slug) = btrim(faixa_row.link_url)
      )
  ) or exists (
    select 1 from public.matchday_live_layout_items as layout_row
    where layout_row.matchday_id = p_matchday_id
      and coalesce(
        nullif(btrim(layout_row.label), ''),
        nullif(btrim(layout_row.title), ''),
        nullif(btrim(layout_row.subtitle), ''),
        nullif(btrim(layout_row.image_url), ''),
        nullif(btrim(layout_row.link_url), '')
      ) is not null
      and 1 <> (
        select count(*) from public.editorial_articles as article_row
        where article_row.matchday_id = p_matchday_id
          and article_row.status = 'published'
          and (
            article_row.id = layout_row.article_id
            or '/noticias/' || btrim(article_row.slug) = btrim(layout_row.link_url)
          )
      )
  ) then
    raise exception 'editorial-desk-unresolved-content';
  end if;

  select article_row.* into v_headline
  from public.editorial_articles as article_row
  join jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
    on desired.article_id = article_row.id
  where desired.placement_key = 'headline';
  v_has_headline := found;

  select article_row.* into v_side_block
  from public.editorial_articles as article_row
  join jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
    on desired.article_id = article_row.id
  where desired.placement_key = 'side_block';
  v_has_side_block := found;

  select article_row.* into v_complement
  from public.editorial_articles as article_row
  join jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
    on desired.article_id = article_row.id
  where desired.placement_key = 'complement';
  v_has_complement := found;

  insert into public.matchday_editorials (
    matchday_id,
    title,
    summary,
    image_url,
    headline_link_url,
    status,
    side_block_status,
    side_block_label,
    side_block_title,
    side_block_author,
    side_block_text,
    side_block_image_url,
    side_block_link_url,
    complementary_status,
    complementary_label,
    complementary_title,
    complementary_text,
    complementary_image_url,
    complementary_link_url,
    latest_zone_mode,
    updated_at
  ) values (
    p_matchday_id,
    case when v_has_headline then nullif(btrim(v_headline.title), '') end,
    case when v_has_headline then nullif(btrim(v_headline.subtitle), '') end,
    case when v_has_headline then nullif(btrim(v_headline.image_url), '') end,
    case when v_has_headline then '/noticias/' || btrim(v_headline.slug) end,
    case when v_has_headline then 'published' else 'draft' end,
    case when v_has_side_block then 'published' else 'draft' end,
    case when v_has_side_block then nullif(btrim(v_side_block.label), '') end,
    case when v_has_side_block then nullif(btrim(v_side_block.title), '') end,
    case when v_has_side_block then nullif(btrim(v_side_block.author), '') end,
    case when v_has_side_block then left(nullif(btrim(v_side_block.subtitle), ''), 500) end,
    case when v_has_side_block then nullif(btrim(v_side_block.image_url), '') end,
    case when v_has_side_block then '/noticias/' || btrim(v_side_block.slug) end,
    case when v_has_complement then 'published' else 'draft' end,
    case when v_has_complement then nullif(btrim(v_complement.label), '') end,
    case when v_has_complement then nullif(btrim(v_complement.title), '') end,
    case when v_has_complement then nullif(btrim(v_complement.subtitle), '') end,
    case when v_has_complement then nullif(btrim(v_complement.image_url), '') end,
    case when v_has_complement then '/noticias/' || btrim(v_complement.slug) end,
    'latest_news',
    v_now
  )
  on conflict (matchday_id) do update set
    title = excluded.title,
    summary = excluded.summary,
    image_url = excluded.image_url,
    headline_link_url = excluded.headline_link_url,
    status = excluded.status,
    side_block_status = excluded.side_block_status,
    side_block_label = excluded.side_block_label,
    side_block_title = excluded.side_block_title,
    side_block_author = excluded.side_block_author,
    side_block_text = excluded.side_block_text,
    side_block_image_url = excluded.side_block_image_url,
    side_block_link_url = excluded.side_block_link_url,
    complementary_status = excluded.complementary_status,
    complementary_label = excluded.complementary_label,
    complementary_title = excluded.complementary_title,
    complementary_text = excluded.complementary_text,
    complementary_image_url = excluded.complementary_image_url,
    complementary_link_url = excluded.complementary_link_url,
    latest_zone_mode = excluded.latest_zone_mode,
    updated_at = excluded.updated_at;

  delete from public.matchday_highlights where matchday_id = p_matchday_id;
  delete from public.matchday_horizontal_news where matchday_id = p_matchday_id;
  delete from public.matchday_latest_news where matchday_id = p_matchday_id;
  delete from public.matchday_live_layout_items where matchday_id = p_matchday_id;

  insert into public.matchday_highlights (
    matchday_id, label, label_color, title, subtitle, image_url, link_url,
    sort_order, status, created_at, updated_at
  )
  select
    p_matchday_id,
    null,
    null,
    nullif(btrim(article_row.title), ''),
    nullif(btrim(article_row.subtitle), ''),
    nullif(btrim(article_row.image_url), ''),
    '/noticias/' || btrim(article_row.slug),
    split_part(desired.placement_key, ':', 2)::integer,
    'published',
    v_now,
    v_now
  from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
  join public.editorial_articles as article_row on article_row.id = desired.article_id
  where desired.placement_key like 'highlight:%';

  insert into public.matchday_latest_news (
    matchday_id, time_label, time_label_color, title, subtitle, image_url, link_url,
    article_id, sort_order, status, created_at, updated_at
  )
  select
    p_matchday_id,
    nullif(
      concat_ws(
        ' · ',
        case
          when coalesce(article_row.published_at, article_row.created_at) is not null
            then to_char(coalesce(article_row.published_at, article_row.created_at) at time zone 'Europe/Lisbon', 'HH24:MI')
        end,
        nullif(btrim(article_row.label), '')
      ),
      ''
    ),
    null,
    nullif(btrim(article_row.title), ''),
    null,
    null,
    '/noticias/' || btrim(article_row.slug),
    null,
    row_number() over (
      order by coalesce(article_row.published_at, article_row.created_at) desc nulls last, article_row.id
    )::integer,
    'published',
    v_now,
    v_now
  from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
  join public.editorial_articles as article_row on article_row.id = desired.article_id
  where desired.in_latest
  order by coalesce(article_row.published_at, article_row.created_at) desc nulls last, article_row.id;

  insert into public.matchday_horizontal_news (
    matchday_id, label, label_color, title, subtitle, image_url, link_url,
    sort_order, status, created_at, updated_at
  )
  select
    p_matchday_id,
    nullif(btrim(article_row.label), ''),
    null,
    nullif(btrim(article_row.title), ''),
    nullif(btrim(article_row.subtitle), ''),
    nullif(btrim(article_row.image_url), ''),
    '/noticias/' || btrim(article_row.slug),
    split_part(desired.placement_key, ':', 2)::integer,
    'published',
    v_now,
    v_now
  from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
  join public.editorial_articles as article_row on article_row.id = desired.article_id
  where desired.placement_key like 'important_item:%'
  order by split_part(desired.placement_key, ':', 2)::integer;

  insert into public.matchday_live_layout_items (
    matchday_id, slot_type, article_id, label, title, subtitle, image_url,
    link_url, created_at, updated_at
  )
  select
    p_matchday_id,
    desired.placement_key,
    article_row.id,
    nullif(btrim(article_row.label), ''),
    nullif(btrim(article_row.title), ''),
    nullif(btrim(article_row.subtitle), ''),
    nullif(btrim(article_row.image_url), ''),
    '/noticias/' || btrim(article_row.slug),
    v_now,
    v_now
  from jsonb_to_recordset(p_articles) as desired(article_id uuid, in_latest boolean, placement_key text)
  join public.editorial_articles as article_row on article_row.id = desired.article_id
  where desired.placement_key like 'live_%';

  v_next_revision := v_revision + 1;
  insert into public.matchday_editorial_desk_control (
    matchday_id, is_managed, faixa_visible, revision, last_applied_at, updated_at
  ) values (
    p_matchday_id, true, p_faixa_visible, v_next_revision, v_now, v_now
  )
  on conflict (matchday_id) do update set
    is_managed = true,
    faixa_visible = excluded.faixa_visible,
    revision = excluded.revision,
    last_applied_at = excluded.last_applied_at,
    updated_at = excluded.updated_at;

  return jsonb_build_object(
    'revision', v_next_revision,
    'stateToken', public.matchday_editorial_desk_state_token(p_matchday_id),
    'appliedAt', v_now,
    'isManaged', true,
    'faixaVisible', p_faixa_visible
  );
end;
$$;

revoke execute on function public.apply_matchday_editorial_desk_state(uuid, bigint, text, boolean, jsonb)
  from public, anon, authenticated;
grant execute on function public.apply_matchday_editorial_desk_state(uuid, bigint, text, boolean, jsonb)
  to service_role;

comment on function public.apply_matchday_editorial_desk_state(uuid, bigint, text, boolean, jsonb) is
  'Aplica atomicamente o estado final completo da Mesa, com revisão e token otimistas.';

notify pgrst, 'reload schema';

commit;
