begin;

-- A classificacao corrente da Mesa passa a ser uma decisao humana.
-- A ausencia de linha continua a representar "Sem classificacao".

do $preflight$
begin
  if pg_catalog.to_regclass(
    'public.newsroom_editorial_article_classifications'
  ) is null
    or pg_catalog.to_regclass('public.newsroom_editorial_themes') is null
    or pg_catalog.to_regclass('public.newsroom_editorial_theme_sources') is null
    or pg_catalog.to_regclass('public.newsroom_articles') is null
  then
    raise exception 'newsroom-manual-classification-preflight-authority-missing';
  end if;

  lock table public.newsroom_articles
    in share row exclusive mode;
  lock table public.newsroom_editorial_article_classifications
    in share row exclusive mode;
  lock table public.newsroom_editorial_themes
    in share row exclusive mode;
  lock table public.newsroom_editorial_theme_sources
    in share row exclusive mode;

  if exists (
    select 1
    from public.newsroom_editorial_themes as theme_row
    where theme_row.classification_key not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
  )
  then
    raise exception 'newsroom-manual-classification-preflight-theme-invalid';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_theme_sources as membership_row
    join public.newsroom_editorial_themes as theme_row
      on theme_row.id = membership_row.theme_id
    group by membership_row.newsroom_article_id
    having pg_catalog.count(distinct theme_row.classification_key) > 1
  )
  then
    raise exception 'newsroom-manual-classification-preflight-theme-conflict';
  end if;
end;
$preflight$;

create function public.newsroom_set_manual_article_classifications_v2(
  p_newsroom_article_ids uuid[],
  p_classification_key text
)
returns table (
  requested_count integer,
  changed_count integer,
  classification_key text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_changed_count bigint := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsroom-theme-source-classification-v1',
      0
    )
  );

  if p_newsroom_article_ids is null
    or pg_catalog.cardinality(p_newsroom_article_ids) < 1
    or pg_catalog.cardinality(p_newsroom_article_ids) > 20
    or pg_catalog.array_position(p_newsroom_article_ids, null) is not null
    or (
      select pg_catalog.count(distinct requested_row.newsroom_article_id)
      from pg_catalog.unnest(p_newsroom_article_ids)
        as requested_row(newsroom_article_id)
    ) <> pg_catalog.cardinality(p_newsroom_article_ids)
    or (
      p_classification_key is not null
      and p_classification_key not in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    )
  then
    raise exception 'newsroom_article_classification_invalid_input'
      using errcode = '22023';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_newsroom_article_ids)
      as requested_row(newsroom_article_id)
    left join public.newsroom_articles as article_row
      on article_row.id = requested_row.newsroom_article_id
    where article_row.id is null
  )
  then
    raise exception 'newsroom_article_classification_source_not_found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_newsroom_article_ids)
      as requested_row(newsroom_article_id)
    join public.newsroom_articles as article_row
      on article_row.id = requested_row.newsroom_article_id
    where article_row.first_detected_at
      < '2026-09-09T14:02:00Z'::timestamptz
  )
  then
    raise exception 'newsroom_article_classification_source_outside_cycle'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_newsroom_article_ids)
      as requested_row(newsroom_article_id)
    join public.newsroom_editorial_theme_sources as membership_row
      on membership_row.newsroom_article_id = requested_row.newsroom_article_id
    join public.newsroom_editorial_themes as theme_row
      on theme_row.id = membership_row.theme_id
    where p_classification_key is null
      or theme_row.classification_key is distinct from p_classification_key
  )
  then
    raise exception 'newsroom_article_classification_theme_conflict'
      using errcode = '23514';
  end if;

  if p_classification_key is null then
    delete from public.newsroom_editorial_article_classifications
      as classification_row
    where classification_row.newsroom_article_id = any (
      p_newsroom_article_ids
    );

    get diagnostics v_changed_count = row_count;
  else
    insert into public.newsroom_editorial_article_classifications (
      newsroom_article_id,
      classification_key,
      classification_source,
      classified_at
    )
    select
      requested_row.newsroom_article_id,
      p_classification_key,
      'manual',
      pg_catalog.statement_timestamp()
    from pg_catalog.unnest(p_newsroom_article_ids)
      as requested_row(newsroom_article_id)
    on conflict on constraint
      newsroom_editorial_article_classifications_pkey
    do update
    set
      classification_key = excluded.classification_key,
      classification_source = excluded.classification_source,
      classified_at = excluded.classified_at
    where (
      newsroom_editorial_article_classifications.classification_key,
      newsroom_editorial_article_classifications.classification_source
    ) is distinct from (
      excluded.classification_key,
      excluded.classification_source
    );

    get diagnostics v_changed_count = row_count;
  end if;

  return query
  select
    pg_catalog.cardinality(p_newsroom_article_ids),
    v_changed_count::integer,
    p_classification_key;
end;
$function$;

create or replace function public.newsroom_set_manual_article_classification_v1(
  p_newsroom_article_id uuid,
  p_classification_key text
)
returns table (
  newsroom_article_id uuid,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  updated_at timestamptz,
  classified boolean,
  applied boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row public.newsroom_editorial_article_classifications%rowtype;
  v_row_count bigint := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsroom-theme-source-classification-v1',
      0
    )
  );

  if p_newsroom_article_id is null
    or p_classification_key is null
    or p_classification_key not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
  then
    raise exception 'newsroom_article_classification_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_articles as article_row
    where article_row.id = p_newsroom_article_id
  )
  then
    raise exception 'newsroom_article_classification_source_not_found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_theme_sources as membership_row
    join public.newsroom_editorial_themes as theme_row
      on theme_row.id = membership_row.theme_id
    where membership_row.newsroom_article_id = p_newsroom_article_id
      and theme_row.classification_key is distinct from
        p_classification_key
  )
  then
    raise exception 'newsroom_article_classification_theme_conflict'
      using errcode = '23514';
  end if;

  insert into public.newsroom_editorial_article_classifications (
    newsroom_article_id,
    classification_key,
    classification_source,
    classified_at
  ) values (
    p_newsroom_article_id,
    p_classification_key,
    'manual',
    pg_catalog.statement_timestamp()
  )
  on conflict on constraint
    newsroom_editorial_article_classifications_pkey
  do update
  set
    classification_key = excluded.classification_key,
    classification_source = excluded.classification_source,
    classified_at = excluded.classified_at
  where (
    newsroom_editorial_article_classifications.classification_key,
    newsroom_editorial_article_classifications.classification_source
  ) is distinct from (
    excluded.classification_key,
    excluded.classification_source
  )
  returning * into v_row;

  get diagnostics v_row_count = row_count;

  if v_row_count = 0 then
    select classification_row.*
    into strict v_row
    from public.newsroom_editorial_article_classifications
      as classification_row
    where classification_row.newsroom_article_id = p_newsroom_article_id;
  end if;

  return query
  select
    v_row.newsroom_article_id,
    v_row.classification_key,
    v_row.classification_source,
    v_row.classified_at,
    v_row.updated_at,
    true,
    true,
    v_row_count > 0;
end;
$function$;

create or replace function public.newsroom_clear_article_classification_v1(
  p_newsroom_article_id uuid
)
returns table (
  newsroom_article_id uuid,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  updated_at timestamptz,
  classified boolean,
  applied boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_row_count bigint := 0;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsroom-theme-source-classification-v1',
      0
    )
  );

  if p_newsroom_article_id is null then
    raise exception 'newsroom_article_classification_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_articles as article_row
    where article_row.id = p_newsroom_article_id
  )
  then
    raise exception 'newsroom_article_classification_source_not_found'
      using errcode = 'P0002';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_theme_sources as membership_row
    where membership_row.newsroom_article_id = p_newsroom_article_id
  )
  then
    raise exception 'newsroom_article_classification_theme_conflict'
      using errcode = '23514';
  end if;

  delete from public.newsroom_editorial_article_classifications
    as classification_row
  where classification_row.newsroom_article_id = p_newsroom_article_id;

  get diagnostics v_row_count = row_count;

  return query
  select
    p_newsroom_article_id,
    null::text,
    null::text,
    null::timestamptz,
    null::timestamptz,
    false,
    true,
    v_row_count > 0;
end;
$function$;

create or replace function public.newsroom_set_editorial_theme_source_membership_v1(
  p_theme_id uuid,
  p_newsroom_article_id uuid,
  p_associated boolean
)
returns table (
  theme_id uuid,
  newsroom_article_id uuid,
  associated boolean,
  changed boolean,
  added_at timestamptz
)
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_row_count bigint := 0;
  v_added_at timestamptz;
  v_classification_key text;
begin
  if p_theme_id is null
    or p_newsroom_article_id is null
    or p_associated is null
  then
    raise exception 'editorial_theme_invalid_input'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsroom-theme-source-classification-v1',
      0
    )
  );

  select theme_row.classification_key
  into v_classification_key
  from public.newsroom_editorial_themes as theme_row
  where theme_row.id = p_theme_id;

  if not found then
    raise exception 'editorial_theme_not_found'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.newsroom_articles as article_row
    where article_row.id = p_newsroom_article_id
  )
  then
    raise exception 'editorial_theme_source_not_found'
      using errcode = 'P0002';
  end if;

  if p_associated then
    if exists (
      select 1
      from public.newsroom_editorial_theme_sources as membership_row
      join public.newsroom_editorial_themes as theme_row
        on theme_row.id = membership_row.theme_id
      where membership_row.newsroom_article_id = p_newsroom_article_id
        and membership_row.theme_id <> p_theme_id
        and theme_row.classification_key is distinct from
          v_classification_key
    )
    then
      raise exception 'editorial_theme_source_classification_conflict'
        using errcode = '23514';
    end if;

    insert into public.newsroom_editorial_theme_sources (
      theme_id,
      newsroom_article_id
    ) values (
      p_theme_id,
      p_newsroom_article_id
    )
    on conflict on constraint newsroom_editorial_theme_sources_pkey
    do nothing;

    get diagnostics v_row_count = row_count;

    perform public.newsroom_set_manual_article_classification_v1(
      p_newsroom_article_id,
      v_classification_key
    );

    select relation_row.added_at
    into v_added_at
    from public.newsroom_editorial_theme_sources as relation_row
    where relation_row.theme_id = p_theme_id
      and relation_row.newsroom_article_id = p_newsroom_article_id;
  else
    delete from public.newsroom_editorial_theme_sources as relation_row
    where relation_row.theme_id = p_theme_id
      and relation_row.newsroom_article_id = p_newsroom_article_id;

    get diagnostics v_row_count = row_count;
  end if;

  return query
  select
    p_theme_id,
    p_newsroom_article_id,
    p_associated,
    v_row_count > 0,
    v_added_at;
end;
$function$;

create or replace function public.newsroom_update_editorial_theme_v1(
  p_theme_id uuid,
  p_title text,
  p_classification_key text,
  p_context_text text default null,
  p_competition_id uuid default null,
  p_season_id uuid default null,
  p_matchday_id uuid default null,
  p_match_id uuid default null
)
returns setof public.newsroom_editorial_themes
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
declare
  v_title text := pg_catalog.btrim(p_title);
  v_context_text text := nullif(
    pg_catalog.btrim(p_context_text),
    ''
  );
  v_previous_classification_key text;
  v_newsroom_article_id uuid;
begin
  if p_theme_id is null
    or v_title is null
    or v_title = ''
    or p_classification_key is null
  then
    raise exception 'editorial_theme_invalid_input'
      using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'newsroom-theme-source-classification-v1',
      0
    )
  );

  select theme_row.classification_key
  into v_previous_classification_key
  from public.newsroom_editorial_themes as theme_row
  where theme_row.id = p_theme_id
  for update;

  if not found then
    raise exception 'editorial_theme_not_found'
      using errcode = 'P0002';
  end if;

  if p_classification_key is distinct from v_previous_classification_key
    and exists (
      select 1
      from public.newsroom_editorial_theme_sources as changed_membership
      join public.newsroom_editorial_theme_sources as other_membership
        on other_membership.newsroom_article_id =
          changed_membership.newsroom_article_id
        and other_membership.theme_id <> changed_membership.theme_id
      join public.newsroom_editorial_themes as other_theme
        on other_theme.id = other_membership.theme_id
      where changed_membership.theme_id = p_theme_id
        and other_theme.classification_key is distinct from
          p_classification_key
    )
  then
    raise exception 'editorial_theme_source_classification_conflict'
      using errcode = '23514';
  end if;

  update public.newsroom_editorial_themes as theme_row
  set
    title = v_title,
    classification_key = p_classification_key,
    context_text = v_context_text,
    competition_id = p_competition_id,
    season_id = p_season_id,
    matchday_id = p_matchday_id,
    match_id = p_match_id
  where theme_row.id = p_theme_id
    and (
      theme_row.title,
      theme_row.classification_key,
      theme_row.context_text,
      theme_row.competition_id,
      theme_row.season_id,
      theme_row.matchday_id,
      theme_row.match_id
    ) is distinct from (
      v_title,
      p_classification_key,
      v_context_text,
      p_competition_id,
      p_season_id,
      p_matchday_id,
      p_match_id
    );

  if p_classification_key is distinct from v_previous_classification_key then
    for v_newsroom_article_id in
      select membership_row.newsroom_article_id
      from public.newsroom_editorial_theme_sources as membership_row
      where membership_row.theme_id = p_theme_id
      order by membership_row.newsroom_article_id
    loop
      perform public.newsroom_set_manual_article_classification_v1(
        v_newsroom_article_id,
        p_classification_key
      );
    end loop;
  end if;

  return query
  select theme_row.*
  from public.newsroom_editorial_themes as theme_row
  where theme_row.id = p_theme_id;
end;
$function$;

-- Reset controlado do ciclo operacional atual. Fora deste universo nenhuma
-- classificacao automatica e alterada.
delete from public.newsroom_editorial_article_classifications
  as classification_row
using public.newsroom_articles as article_row
where article_row.id = classification_row.newsroom_article_id
  and article_row.first_detected_at
    >= '2026-09-09T14:02:00Z'::timestamptz
  and classification_row.classification_source = 'automatic';

insert into public.newsroom_editorial_article_classifications (
  newsroom_article_id,
  classification_key,
  classification_source,
  classified_at
)
select
  membership_row.newsroom_article_id,
  pg_catalog.min(theme_row.classification_key),
  'manual',
  pg_catalog.statement_timestamp()
from public.newsroom_editorial_theme_sources as membership_row
join public.newsroom_editorial_themes as theme_row
  on theme_row.id = membership_row.theme_id
join public.newsroom_articles as article_row
  on article_row.id = membership_row.newsroom_article_id
where article_row.first_detected_at
  >= '2026-09-09T14:02:00Z'::timestamptz
group by membership_row.newsroom_article_id
on conflict on constraint
  newsroom_editorial_article_classifications_pkey
do update
set
  classification_key = excluded.classification_key,
  classification_source = excluded.classification_source,
  classified_at = excluded.classified_at
where (
  newsroom_editorial_article_classifications.classification_key,
  newsroom_editorial_article_classifications.classification_source
) is distinct from (
  excluded.classification_key,
  excluded.classification_source
);

revoke all
on function public.newsroom_set_manual_article_classifications_v2(
  uuid[],
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.newsroom_set_manual_article_classifications_v2(
  uuid[],
  text
)
to service_role;

comment on function public.newsroom_set_manual_article_classifications_v2(
  uuid[],
  text
) is
  'Atomically sets or clears the current manual classification for 1-20 operational-cycle newsroom source identities. Null clears the row; Theme membership remains authoritative and rejects conflicting changes.';

comment on function public.newsroom_set_editorial_theme_source_membership_v1(
  uuid,
  uuid,
  boolean
) is
  'Atomically changes source membership. Association also persists the Theme classification as the source manual classification; removal never restores a previous value.';

comment on function public.newsroom_update_editorial_theme_v1(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid
) is
  'Updates a Theme and atomically reclassifies every current source member when classification_key changes.';

notify pgrst, 'reload schema';

commit;
