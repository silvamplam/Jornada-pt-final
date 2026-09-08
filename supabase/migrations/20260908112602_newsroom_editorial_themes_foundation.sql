begin;

-- Mesa da Redacao - fundacao persistente e opcional do Tema editorial.
-- Tema e memoria editorial; nao e Dossie, pacote, fonte ou operacao de producao.

do $preflight$
begin
  if pg_catalog.to_regclass('public.newsroom_articles') is null then
    raise exception 'editorial-theme-preflight-newsroom-articles-missing';
  end if;

  if pg_catalog.to_regclass('public.editorial_articles') is null then
    raise exception 'editorial-theme-preflight-editorial-articles-missing';
  end if;

  if pg_catalog.to_regclass('public.competitions') is null
    or pg_catalog.to_regclass('public.seasons') is null
    or pg_catalog.to_regclass('public.matchdays') is null
    or pg_catalog.to_regclass('public.matches') is null
  then
    raise exception 'editorial-theme-preflight-context-authority-missing';
  end if;

  if pg_catalog.to_regclass('public.newsroom_editorial_themes') is not null
    or pg_catalog.to_regclass('public.newsroom_editorial_theme_sources') is not null
    or pg_catalog.to_regclass('public.newsroom_editorial_theme_articles') is not null
  then
    raise exception 'editorial-theme-preflight-target-conflict';
  end if;
end;
$preflight$;

create table public.newsroom_editorial_themes (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  classification_key text not null,
  status text not null default 'open',
  context_text text,
  competition_id uuid,
  season_id uuid,
  matchday_id uuid,
  match_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsroom_editorial_themes_title_not_blank
    check (pg_catalog.btrim(title) <> ''),
  constraint newsroom_editorial_themes_classification_check
    check (
      classification_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    ),
  constraint newsroom_editorial_themes_status_check
    check (status in ('open', 'archived')),
  constraint newsroom_editorial_themes_context_not_blank
    check (context_text is null or pg_catalog.btrim(context_text) <> ''),
  constraint newsroom_editorial_themes_competition_fkey
    foreign key (competition_id)
    references public.competitions(id)
    on delete set null,
  constraint newsroom_editorial_themes_season_fkey
    foreign key (season_id)
    references public.seasons(id)
    on delete set null,
  constraint newsroom_editorial_themes_matchday_fkey
    foreign key (matchday_id)
    references public.matchdays(id)
    on delete set null,
  constraint newsroom_editorial_themes_match_fkey
    foreign key (match_id)
    references public.matches(id)
    on delete set null
);

create table public.newsroom_editorial_theme_sources (
  theme_id uuid not null,
  newsroom_article_id uuid not null,
  added_at timestamptz not null default now(),
  constraint newsroom_editorial_theme_sources_pkey
    primary key (theme_id, newsroom_article_id),
  constraint newsroom_editorial_theme_sources_theme_fkey
    foreign key (theme_id)
    references public.newsroom_editorial_themes(id)
    on delete cascade,
  constraint newsroom_editorial_theme_sources_article_fkey
    foreign key (newsroom_article_id)
    references public.newsroom_articles(id)
    on delete cascade
);

create table public.newsroom_editorial_theme_articles (
  theme_id uuid not null,
  editorial_article_id uuid not null,
  added_at timestamptz not null default now(),
  constraint newsroom_editorial_theme_articles_pkey
    primary key (theme_id, editorial_article_id),
  constraint newsroom_editorial_theme_articles_theme_fkey
    foreign key (theme_id)
    references public.newsroom_editorial_themes(id)
    on delete cascade,
  constraint newsroom_editorial_theme_articles_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete cascade
);

create index newsroom_editorial_themes_classification_status_idx
  on public.newsroom_editorial_themes (
    classification_key,
    status,
    updated_at desc,
    id
  );

create index newsroom_editorial_themes_competition_idx
  on public.newsroom_editorial_themes (competition_id)
  where competition_id is not null;

create index newsroom_editorial_themes_season_idx
  on public.newsroom_editorial_themes (season_id)
  where season_id is not null;

create index newsroom_editorial_themes_matchday_idx
  on public.newsroom_editorial_themes (matchday_id)
  where matchday_id is not null;

create index newsroom_editorial_themes_match_idx
  on public.newsroom_editorial_themes (match_id)
  where match_id is not null;

create index newsroom_editorial_theme_sources_article_idx
  on public.newsroom_editorial_theme_sources (
    newsroom_article_id,
    theme_id
  );

create index newsroom_editorial_theme_articles_article_idx
  on public.newsroom_editorial_theme_articles (
    editorial_article_id,
    theme_id
  );

create function public.newsroom_prepare_editorial_theme_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.title := pg_catalog.btrim(new.title);
  new.context_text := nullif(
    pg_catalog.btrim(new.context_text),
    ''
  );

  if new.competition_id is not null
    and new.season_id is not null
    and not exists (
      select 1
      from public.seasons as season_row
      where season_row.id = new.season_id
        and season_row.competition_id = new.competition_id
    )
  then
    raise exception 'editorial_theme_context_mismatch'
      using errcode = '23514';
  end if;

  if new.matchday_id is not null
    and not exists (
      select 1
      from public.matchdays as matchday_row
      join public.seasons as season_row
        on season_row.id = matchday_row.season_id
      where matchday_row.id = new.matchday_id
        and (
          new.season_id is null
          or matchday_row.season_id = new.season_id
        )
        and (
          new.competition_id is null
          or season_row.competition_id = new.competition_id
        )
    )
  then
    raise exception 'editorial_theme_context_mismatch'
      using errcode = '23514';
  end if;

  if new.match_id is not null
    and not exists (
      select 1
      from public.matches as match_row
      where match_row.id = new.match_id
        and (
          new.competition_id is null
          or match_row.competition_id = new.competition_id
        )
        and (
          new.season_id is null
          or match_row.season_id = new.season_id
        )
        and (
          new.matchday_id is null
          or match_row.matchday_id = new.matchday_id
        )
    )
  then
    raise exception 'editorial_theme_context_mismatch'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger newsroom_editorial_themes_prepare_v1
before insert or update of
  title,
  context_text,
  competition_id,
  season_id,
  matchday_id,
  match_id
on public.newsroom_editorial_themes
for each row
execute function public.newsroom_prepare_editorial_theme_v1();

create function public.newsroom_set_editorial_theme_updated_at_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  new.updated_at := pg_catalog.statement_timestamp();
  return new;
end;
$function$;

create trigger newsroom_editorial_themes_set_updated_at_v1
before update on public.newsroom_editorial_themes
for each row
execute function public.newsroom_set_editorial_theme_updated_at_v1();

alter table public.newsroom_editorial_themes enable row level security;
alter table public.newsroom_editorial_themes force row level security;
alter table public.newsroom_editorial_theme_sources enable row level security;
alter table public.newsroom_editorial_theme_sources force row level security;
alter table public.newsroom_editorial_theme_articles enable row level security;
alter table public.newsroom_editorial_theme_articles force row level security;

revoke all privileges
on table public.newsroom_editorial_themes
from public, anon, authenticated, service_role;

revoke all privileges
on table public.newsroom_editorial_theme_sources
from public, anon, authenticated, service_role;

revoke all privileges
on table public.newsroom_editorial_theme_articles
from public, anon, authenticated, service_role;

grant select, insert, update
on table public.newsroom_editorial_themes
to service_role;

grant select, insert, delete
on table public.newsroom_editorial_theme_sources
to service_role;

grant select, insert, delete
on table public.newsroom_editorial_theme_articles
to service_role;

create function public.newsroom_create_editorial_theme_v1(
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
begin
  if p_title is null
    or pg_catalog.btrim(p_title) = ''
    or p_classification_key is null
  then
    raise exception 'editorial_theme_invalid_input'
      using errcode = '22023';
  end if;

  return query
  insert into public.newsroom_editorial_themes (
    title,
    classification_key,
    context_text,
    competition_id,
    season_id,
    matchday_id,
    match_id
  ) values (
    pg_catalog.btrim(p_title),
    p_classification_key,
    nullif(pg_catalog.btrim(p_context_text), ''),
    p_competition_id,
    p_season_id,
    p_matchday_id,
    p_match_id
  )
  returning *;
end;
$function$;

create function public.newsroom_update_editorial_theme_v1(
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
begin
  if p_theme_id is null
    or v_title is null
    or v_title = ''
    or p_classification_key is null
  then
    raise exception 'editorial_theme_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_themes as theme_row
    where theme_row.id = p_theme_id
  )
  then
    raise exception 'editorial_theme_not_found'
      using errcode = 'P0002';
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

  return query
  select theme_row.*
  from public.newsroom_editorial_themes as theme_row
  where theme_row.id = p_theme_id;
end;
$function$;

create function public.newsroom_set_editorial_theme_status_v1(
  p_theme_id uuid,
  p_status text
)
returns setof public.newsroom_editorial_themes
language plpgsql
volatile
security invoker
set search_path = ''
as $function$
begin
  if p_theme_id is null
    or p_status is null
    or p_status not in ('open', 'archived')
  then
    raise exception 'editorial_theme_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_themes as theme_row
    where theme_row.id = p_theme_id
  )
  then
    raise exception 'editorial_theme_not_found'
      using errcode = 'P0002';
  end if;

  update public.newsroom_editorial_themes as theme_row
  set status = p_status
  where theme_row.id = p_theme_id
    and theme_row.status is distinct from p_status;

  return query
  select theme_row.*
  from public.newsroom_editorial_themes as theme_row
  where theme_row.id = p_theme_id;
end;
$function$;

create function public.newsroom_set_editorial_theme_source_membership_v1(
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
begin
  if p_theme_id is null
    or p_newsroom_article_id is null
    or p_associated is null
  then
    raise exception 'editorial_theme_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_themes as theme_row
    where theme_row.id = p_theme_id
  )
  then
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

create function public.newsroom_set_editorial_theme_article_membership_v1(
  p_theme_id uuid,
  p_editorial_article_id uuid,
  p_associated boolean
)
returns table (
  theme_id uuid,
  editorial_article_id uuid,
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
begin
  if p_theme_id is null
    or p_editorial_article_id is null
    or p_associated is null
  then
    raise exception 'editorial_theme_invalid_input'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_themes as theme_row
    where theme_row.id = p_theme_id
  )
  then
    raise exception 'editorial_theme_not_found'
      using errcode = 'P0002';
  end if;

  if not exists (
    select 1
    from public.editorial_articles as article_row
    where article_row.id = p_editorial_article_id
  )
  then
    raise exception 'editorial_theme_article_not_found'
      using errcode = 'P0002';
  end if;

  if p_associated then
    insert into public.newsroom_editorial_theme_articles (
      theme_id,
      editorial_article_id
    ) values (
      p_theme_id,
      p_editorial_article_id
    )
    on conflict on constraint newsroom_editorial_theme_articles_pkey
    do nothing;

    get diagnostics v_row_count = row_count;

    select relation_row.added_at
    into v_added_at
    from public.newsroom_editorial_theme_articles as relation_row
    where relation_row.theme_id = p_theme_id
      and relation_row.editorial_article_id = p_editorial_article_id;
  else
    delete from public.newsroom_editorial_theme_articles as relation_row
    where relation_row.theme_id = p_theme_id
      and relation_row.editorial_article_id = p_editorial_article_id;

    get diagnostics v_row_count = row_count;
  end if;

  return query
  select
    p_theme_id,
    p_editorial_article_id,
    p_associated,
    v_row_count > 0,
    v_added_at;
end;
$function$;

revoke all
on function public.newsroom_prepare_editorial_theme_v1()
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_set_editorial_theme_updated_at_v1()
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_create_editorial_theme_v1(
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated;

revoke all
on function public.newsroom_update_editorial_theme_v1(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid
)
from public, anon, authenticated;

revoke all
on function public.newsroom_set_editorial_theme_status_v1(uuid, text)
from public, anon, authenticated;

revoke all
on function public.newsroom_set_editorial_theme_source_membership_v1(
  uuid,
  uuid,
  boolean
)
from public, anon, authenticated;

revoke all
on function public.newsroom_set_editorial_theme_article_membership_v1(
  uuid,
  uuid,
  boolean
)
from public, anon, authenticated;

grant execute
on function public.newsroom_create_editorial_theme_v1(
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid
)
to service_role;

grant execute
on function public.newsroom_update_editorial_theme_v1(
  uuid,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid,
  uuid
)
to service_role;

grant execute
on function public.newsroom_set_editorial_theme_status_v1(uuid, text)
to service_role;

grant execute
on function public.newsroom_set_editorial_theme_source_membership_v1(
  uuid,
  uuid,
  boolean
)
to service_role;

grant execute
on function public.newsroom_set_editorial_theme_article_membership_v1(
  uuid,
  uuid,
  boolean
)
to service_role;

comment on table public.newsroom_editorial_themes is
  'Optional, open-ended editorial memory. A Theme is not a Dossier, package, source or production operation.';

comment on column public.newsroom_editorial_themes.classification_key is
  'Pre-publication editorial context using exactly the five canonical contextual classification keys.';

comment on table public.newsroom_editorial_theme_sources is
  'Theme membership for concrete newsroom source identities. Membership never means used, consumed or processed.';

comment on table public.newsroom_editorial_theme_articles is
  'Permanent Theme membership for canonical editorial_articles identities; article fields remain canonical on editorial_articles.';

comment on constraint newsroom_editorial_theme_sources_article_fkey
  on public.newsroom_editorial_theme_sources is
  'Cascade avoids making an optional Theme a blocker for an existing canonical source deletion flow.';

comment on constraint newsroom_editorial_theme_articles_article_fkey
  on public.newsroom_editorial_theme_articles is
  'Cascade avoids making an optional Theme a blocker for the existing canonical article deletion flow.';

notify pgrst, 'reload schema';

commit;
