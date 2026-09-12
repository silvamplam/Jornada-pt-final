\set ON_ERROR_STOP on

-- Disposable PostgreSQL 17 fixture foundation.
-- This is not a migration and must never be applied to Supabase. It supplies
-- only the pre-existing authorities that are older than this repository's
-- Mesa migrations, so the real repository SQL can be compiled and exercised.

do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$roles$;

create extension if not exists pgcrypto;

create table public.competitions (id uuid primary key default gen_random_uuid());
create table public.seasons (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions(id)
);
create table public.matchdays (
  id uuid primary key default gen_random_uuid(),
  season_id uuid references public.seasons(id)
);
create table public.matches (
  id uuid primary key default gen_random_uuid(),
  competition_id uuid references public.competitions(id),
  season_id uuid references public.seasons(id),
  matchday_id uuid references public.matchdays(id)
);

create table public.editorial_articles (
  id uuid primary key default gen_random_uuid(),
  newsroom_article_id uuid,
  status text not null default 'draft',
  scope text not null default 'matchday',
  author text,
  label text,
  title text not null,
  subtitle text,
  body text not null,
  slug text not null unique,
  image_url text,
  image_caption text,
  published_at timestamptz,
  competition_id uuid,
  season_id uuid,
  matchday_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- The workspace publication path only invokes this existing authority for an
-- explicit UPDATE. CREATE-path validation still compiles against its real
-- signature without recreating the unrelated matchday snapshot subsystem.
create function public.sync_editorial_article_live_snapshots_v15(
  p_article_id uuid,
  p_previous_slug text
)
returns void
language plpgsql
as $function$
begin
  return;
end;
$function$;

select 'mesa-workspace-v2-fixture-foundation-ok' as result;
