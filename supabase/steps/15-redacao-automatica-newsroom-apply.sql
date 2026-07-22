-- Redação Automática — caixa de entrada persistente read-only.
-- SQL 2/4 — APLICAÇÃO MANUAL. Não executar automaticamente.

begin;

create table public.newsroom_articles (
  id uuid primary key default gen_random_uuid(),
  source_code text not null,
  original_url text not null,
  normalized_url text not null,
  external_id text,
  title text not null,
  subtitle text,
  summary text,
  author text,
  published_at timestamptz,
  modified_at timestamptz,
  detected_at timestamptz not null,
  image_url text,
  processing_status text not null,
  first_detected_at timestamptz not null,
  last_detected_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsroom_articles_source_url_key unique (source_code, normalized_url),
  constraint newsroom_articles_source_code_not_blank check (btrim(source_code) <> ''),
  constraint newsroom_articles_original_url_not_blank check (btrim(original_url) <> ''),
  constraint newsroom_articles_normalized_url_not_blank check (btrim(normalized_url) <> ''),
  constraint newsroom_articles_title_not_blank check (btrim(title) <> ''),
  constraint newsroom_articles_processing_status_check check (
    processing_status in (
      'detected',
      'normalized',
      'duplicate',
      'rejected',
      'ready_for_review',
      'failed'
    )
  ),
  constraint newsroom_articles_detection_window_check check (first_detected_at <= last_detected_at)
);

create table public.newsroom_article_snapshots (
  id uuid primary key default gen_random_uuid(),
  article_id uuid not null,
  content_hash text not null,
  body jsonb not null,
  source_metadata jsonb not null,
  extracted_at timestamptz not null,
  created_at timestamptz not null default now(),
  constraint newsroom_article_snapshots_article_fkey
    foreign key (article_id)
    references public.newsroom_articles(id)
    on delete restrict,
  constraint newsroom_article_snapshots_article_hash_key unique (article_id, content_hash),
  constraint newsroom_article_snapshots_content_hash_not_blank check (btrim(content_hash) <> ''),
  constraint newsroom_article_snapshots_body_array_check check (jsonb_typeof(body) = 'array'),
  constraint newsroom_article_snapshots_metadata_object_check check (jsonb_typeof(source_metadata) = 'object')
);

create index newsroom_articles_last_detected_idx
  on public.newsroom_articles (last_detected_at desc, id desc);

create index newsroom_articles_status_last_detected_idx
  on public.newsroom_articles (processing_status, last_detected_at desc);

create index newsroom_articles_source_last_detected_idx
  on public.newsroom_articles (source_code, last_detected_at desc);

create index newsroom_article_snapshots_latest_idx
  on public.newsroom_article_snapshots (article_id, extracted_at desc, created_at desc);

create function public.newsroom_set_article_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger newsroom_articles_set_updated_at
before update on public.newsroom_articles
for each row
execute function public.newsroom_set_article_updated_at();

create function public.newsroom_reject_snapshot_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'newsroom article snapshots are immutable';
end;
$$;

create trigger newsroom_article_snapshots_immutable
before update or delete on public.newsroom_article_snapshots
for each row
execute function public.newsroom_reject_snapshot_mutation();

alter table public.newsroom_articles enable row level security;
alter table public.newsroom_articles force row level security;
alter table public.newsroom_article_snapshots enable row level security;
alter table public.newsroom_article_snapshots force row level security;

revoke all privileges on table public.newsroom_articles from public, anon, authenticated;
revoke all privileges on table public.newsroom_article_snapshots from public, anon, authenticated;

grant usage on schema public to service_role;
grant select, insert, update on table public.newsroom_articles to service_role;
grant select, insert on table public.newsroom_article_snapshots to service_role;

revoke all on function public.newsroom_set_article_updated_at() from public, anon, authenticated;
revoke all on function public.newsroom_reject_snapshot_mutation() from public, anon, authenticated;
grant execute on function public.newsroom_set_article_updated_at() to service_role;
grant execute on function public.newsroom_reject_snapshot_mutation() to service_role;

comment on table public.newsroom_articles is
  'Persistent source-article identities and current metadata for the Automatic Newsroom.';
comment on table public.newsroom_article_snapshots is
  'Immutable normalized extraction snapshots for Automatic Newsroom source articles.';

commit;
