-- Jornada.pt - esquema inicial para futura base de dados Supabase/Postgres.
-- Este ficheiro e uma base de trabalho. Antes de aplicar em producao,
-- deve ser revisto com as necessidades reais do backoffice.

create extension if not exists pgcrypto;

create table if not exists countries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  iso2 text,
  flag_emoji text,
  is_active boolean not null default true,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists competitions (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  country_id uuid references countries(id) on delete set null,
  country text,
  logo_url text,
  accent_color text,
  is_active boolean not null default true,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  label text not null,
  starts_on date,
  ends_on date,
  is_current boolean not null default false,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  short_name text not null,
  slug text not null unique,
  country text,
  logo_url text,
  primary_color text,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists matchdays (
  id uuid primary key default gen_random_uuid(),
  season_id uuid not null references seasons(id) on delete cascade,
  number integer not null,
  label text not null,
  starts_on date,
  ends_on date,
  status text not null default 'scheduled',
  context_summary text,
  editorial_title text,
  editorial_summary text,
  hero_image_url text,
  video_url text,
  display_order integer,
  is_featured boolean not null default false,
  memory_note text,
  seo_title text,
  seo_description text,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  created_at timestamptz not null default now(),
  unique (season_id, number)
);

create table if not exists broadcast_channels (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  platform text,
  country text,
  logo_url text,
  created_at timestamptz not null default now()
);

create table if not exists matches (
  id uuid primary key default gen_random_uuid(),
  source_key text unique,
  competition_id uuid not null references competitions(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  matchday_id uuid references matchdays(id) on delete set null,
  home_team_id uuid not null references teams(id),
  away_team_id uuid not null references teams(id),
  status text not null default 'scheduled',
  minute integer,
  scheduled_date date,
  kickoff_at timestamptz,
  home_score integer,
  away_score integer,
  venue text,
  broadcast_channel_id uuid references broadcast_channels(id) on delete set null,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  external_match_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function public.sync_match_scheduled_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kickoff_at is not null then
    new.scheduled_date := (new.kickoff_at at time zone 'Europe/Lisbon')::date;
  end if;

  return new;
end
$$;

drop trigger if exists sync_match_scheduled_date_before_write on public.matches;

create trigger sync_match_scheduled_date_before_write
before insert or update of kickoff_at, scheduled_date on public.matches
for each row
execute function public.sync_match_scheduled_date();

create table if not exists standings (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid not null references competitions(id) on delete cascade,
  season_id uuid not null references seasons(id) on delete cascade,
  matchday_id uuid references matchdays(id) on delete set null,
  moment_label text,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  generated_at timestamptz not null default now()
);

create table if not exists standing_rows (
  id uuid primary key default gen_random_uuid(),
  standing_id uuid not null references standings(id) on delete cascade,
  team_id uuid not null references teams(id),
  position integer not null,
  played integer not null default 0,
  wins integer not null default 0,
  draws integer not null default 0,
  losses integer not null default 0,
  goals_for integer not null default 0,
  goals_against integer not null default 0,
  goal_difference integer not null default 0,
  points integer not null default 0,
  home_played integer not null default 0,
  home_wins integer not null default 0,
  home_draws integer not null default 0,
  home_losses integer not null default 0,
  away_played integer not null default 0,
  away_wins integer not null default 0,
  away_draws integer not null default 0,
  away_losses integer not null default 0,
  data_source text not null default 'manual',
  external_provider text,
  external_id text,
  last_synced_at timestamptz,
  sync_status text not null default 'manual',
  manual_override boolean not null default false,
  unique (standing_id, team_id)
);

create table if not exists players (
  id uuid primary key default gen_random_uuid(),
  team_id uuid references teams(id) on delete set null,
  name text not null,
  slug text not null unique,
  position text,
  created_at timestamptz not null default now()
);

create table if not exists articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  body text,
  image_url text,
  source_url text,
  status text not null default 'draft',
  competition_id uuid references competitions(id) on delete set null,
  season_id uuid references seasons(id) on delete set null,
  matchday_id uuid references matchdays(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists headlines (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  summary text,
  image_url text,
  status text not null default 'draft',
  priority integer not null default 0,
  competition_id uuid references competitions(id) on delete set null,
  season_id uuid references seasons(id) on delete set null,
  matchday_id uuid references matchdays(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  article_id uuid references articles(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists match_events (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  minute integer,
  type text not null,
  title text not null,
  team_id uuid references teams(id) on delete set null,
  player_id uuid references players(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists goals (
  id uuid primary key default gen_random_uuid(),
  match_id uuid not null references matches(id) on delete cascade,
  team_id uuid not null references teams(id),
  player_id uuid references players(id) on delete set null,
  minute integer,
  is_penalty boolean not null default false,
  is_own_goal boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists live_updates (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references competitions(id) on delete set null,
  season_id uuid references seasons(id) on delete set null,
  matchday_id uuid references matchdays(id) on delete set null,
  match_id uuid references matches(id) on delete set null,
  minute_label text,
  title text not null,
  tone text not null default 'live',
  created_at timestamptz not null default now()
);

create index if not exists countries_external_lookup_idx on countries (external_provider, external_id);
create index if not exists competitions_country_id_idx on competitions (country_id);
create index if not exists competitions_external_lookup_idx on competitions (external_provider, external_id);
create index if not exists seasons_external_lookup_idx on seasons (external_provider, external_id);
create index if not exists matchdays_external_lookup_idx on matchdays (external_provider, external_id);
create index if not exists matchdays_featured_idx on matchdays (is_featured, display_order);
create index if not exists matchdays_season_order_idx on matchdays (season_id, display_order, number);
create index if not exists teams_external_lookup_idx on teams (external_provider, external_id);
create index if not exists matches_external_lookup_idx on matches (external_provider, external_id);
create index if not exists matches_external_match_lookup_idx on matches (external_provider, external_match_id);
create index if not exists standings_context_idx on standings (competition_id, season_id, matchday_id, generated_at desc);
create index if not exists standings_external_lookup_idx on standings (external_provider, external_id);
create index if not exists standing_rows_order_idx on standing_rows (standing_id, position);
create index if not exists standing_rows_external_lookup_idx on standing_rows (external_provider, external_id);
