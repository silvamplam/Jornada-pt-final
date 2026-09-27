begin;

create table if not exists public.match_video_summary_candidates (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  match_id uuid references public.matches(id) on delete set null,
  provider text not null default 'youtube',
  provider_video_id text not null,
  canonical_url text not null,
  title text not null,
  channel_id text,
  channel_title text,
  video_published_at timestamptz,
  thumbnail_url text,
  duration_seconds integer,
  is_embeddable boolean,
  availability_status text,
  source_key text,
  status text not null default 'candidate',
  match_confidence integer,
  discovered_at timestamptz not null default now(),
  last_synced_at timestamptz not null default now(),
  constraint match_video_summary_candidates_provider_check
    check (provider = 'youtube'),
  constraint match_video_summary_candidates_provider_video_id_check
    check (btrim(provider_video_id) <> ''),
  constraint match_video_summary_candidates_status_check
    check (status in ('candidate', 'used', 'rejected')),
  constraint match_video_summary_candidates_confidence_check
    check (match_confidence is null or (match_confidence between 0 and 100)),
  constraint match_video_summary_candidates_duration_check
    check (duration_seconds is null or duration_seconds >= 0)
);

create unique index if not exists match_video_summary_candidates_provider_video_uidx
  on public.match_video_summary_candidates (provider, provider_video_id);

create index if not exists match_video_summary_candidates_matchday_status_idx
  on public.match_video_summary_candidates (matchday_id, status, video_published_at);

create index if not exists match_video_summary_candidates_match_idx
  on public.match_video_summary_candidates (match_id, status)
  where match_id is not null;

alter table public.match_video_summary_candidates enable row level security;
revoke all on table public.match_video_summary_candidates from anon, authenticated;
grant select, insert, update, delete on table public.match_video_summary_candidates to service_role;

alter table public.matchday_roundup_items
  add column if not exists match_id uuid,
  add column if not exists youtube_video_id text,
  add column if not exists youtube_channel_id text,
  add column if not exists is_embeddable boolean,
  add column if not exists source_candidate_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'matchday_roundup_items_match_id_fkey'
      and conrelid = 'public.matchday_roundup_items'::regclass
  ) then
    alter table public.matchday_roundup_items
      add constraint matchday_roundup_items_match_id_fkey
      foreign key (match_id) references public.matches(id) on delete set null;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'matchday_roundup_items_source_candidate_id_fkey'
      and conrelid = 'public.matchday_roundup_items'::regclass
  ) then
    alter table public.matchday_roundup_items
      add constraint matchday_roundup_items_source_candidate_id_fkey
      foreign key (source_candidate_id) references public.match_video_summary_candidates(id) on delete set null;
  end if;
end
$$;

create index if not exists matchday_roundup_items_match_id_idx
  on public.matchday_roundup_items (match_id)
  where match_id is not null;

create unique index if not exists matchday_roundup_items_youtube_video_id_uidx
  on public.matchday_roundup_items (youtube_video_id)
  where youtube_video_id is not null;

create unique index if not exists matchday_roundup_items_source_candidate_id_uidx
  on public.matchday_roundup_items (source_candidate_id)
  where source_candidate_id is not null;

commit;
