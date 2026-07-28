-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-SCHEMA-1
-- SQL 2/4 — APLICAÇÃO PERSISTENTE MANUAL
-- Cria apenas a fundação persistente do Dossiê de redação e das suas fontes congeladas.

begin;

alter table public.newsroom_article_snapshots
  add constraint newsroom_article_snapshots_article_id_id_key
  unique (article_id, id);

create table public.newsroom_editorial_dossiers (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  status text not null default 'draft',
  editorial_instructions text not null default '',
  context_instructions text not null default '',
  output_mode text not null default 'single',
  output_count smallint not null default 1,
  length_mode text not null default 'standard',
  article_kind text not null default 'news',
  output_language text not null default 'pt-PT',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsroom_editorial_dossiers_title_not_blank
    check (btrim(title) <> ''),
  constraint newsroom_editorial_dossiers_status_check
    check (status in ('draft', 'ready_for_generation', 'completed', 'archived')),
  constraint newsroom_editorial_dossiers_output_mode_check
    check (output_mode in ('single', 'multiple')),
  constraint newsroom_editorial_dossiers_output_count_check
    check (
      (output_mode = 'single' and output_count = 1)
      or (output_mode = 'multiple' and output_count between 2 and 5)
    ),
  constraint newsroom_editorial_dossiers_length_mode_check
    check (length_mode in ('brief', 'standard', 'developed')),
  constraint newsroom_editorial_dossiers_article_kind_check
    check (article_kind in ('news', 'analysis', 'preview', 'summary')),
  constraint newsroom_editorial_dossiers_output_language_not_blank
    check (btrim(output_language) <> '')
);

create table public.newsroom_editorial_dossier_sources (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  newsroom_article_id uuid not null,
  newsroom_snapshot_id uuid not null,
  source_role text not null default 'complementary',
  sort_order integer not null default 10,
  editorial_note text,
  included boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsroom_editorial_dossier_sources_dossier_fkey
    foreign key (dossier_id)
    references public.newsroom_editorial_dossiers(id)
    on delete cascade,
  constraint newsroom_editorial_dossier_sources_article_fkey
    foreign key (newsroom_article_id)
    references public.newsroom_articles(id)
    on delete restrict,
  constraint newsroom_editorial_dossier_sources_snapshot_identity_fkey
    foreign key (newsroom_article_id, newsroom_snapshot_id)
    references public.newsroom_article_snapshots(article_id, id)
    on delete restrict,
  constraint newsroom_editorial_dossier_sources_dossier_article_key
    unique (dossier_id, newsroom_article_id),
  constraint newsroom_editorial_dossier_sources_role_check
    check (source_role in ('primary', 'corroboration', 'context', 'complementary')),
  constraint newsroom_editorial_dossier_sources_sort_order_check
    check (sort_order >= 0),
  constraint newsroom_editorial_dossier_sources_note_not_blank
    check (editorial_note is null or btrim(editorial_note) <> '')
);

create index newsroom_editorial_dossiers_status_updated_idx
  on public.newsroom_editorial_dossiers (status, updated_at desc, id desc);

create index newsroom_editorial_dossier_sources_dossier_order_idx
  on public.newsroom_editorial_dossier_sources (dossier_id, included desc, sort_order asc, id asc);

create index newsroom_editorial_dossier_sources_article_idx
  on public.newsroom_editorial_dossier_sources (newsroom_article_id, dossier_id);

create index newsroom_editorial_dossier_sources_snapshot_idx
  on public.newsroom_editorial_dossier_sources (newsroom_snapshot_id);

create function public.newsroom_set_editorial_dossier_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger newsroom_editorial_dossiers_set_updated_at
before update on public.newsroom_editorial_dossiers
for each row
execute function public.newsroom_set_editorial_dossier_updated_at();

create trigger newsroom_editorial_dossier_sources_set_updated_at
before update on public.newsroom_editorial_dossier_sources
for each row
execute function public.newsroom_set_editorial_dossier_updated_at();

alter table public.newsroom_editorial_dossiers enable row level security;
alter table public.newsroom_editorial_dossiers force row level security;
alter table public.newsroom_editorial_dossier_sources enable row level security;
alter table public.newsroom_editorial_dossier_sources force row level security;

revoke all privileges on table public.newsroom_editorial_dossiers from public, anon, authenticated;
revoke all privileges on table public.newsroom_editorial_dossier_sources from public, anon, authenticated;

grant select, insert, update, delete on table public.newsroom_editorial_dossiers to service_role;
grant select, insert, update, delete on table public.newsroom_editorial_dossier_sources to service_role;

revoke all on function public.newsroom_set_editorial_dossier_updated_at() from public, anon, authenticated;
grant execute on function public.newsroom_set_editorial_dossier_updated_at() to service_role;

comment on table public.newsroom_editorial_dossiers is
  'Persistent editorial workspaces that combine source snapshots and human instructions before any AI generation.';

comment on table public.newsroom_editorial_dossier_sources is
  'Ordered, role-aware and snapshot-frozen source articles selected for an editorial dossier.';

comment on column public.newsroom_editorial_dossiers.editorial_instructions is
  'Human instructions that define relevance, order, angle and expected editorial reconstruction.';

comment on column public.newsroom_editorial_dossiers.context_instructions is
  'Human context that may be introduced into the reconstructed article without external factual enrichment.';

comment on column public.newsroom_editorial_dossier_sources.newsroom_snapshot_id is
  'Immutable snapshot selected for this dossier; later re-extractions do not silently replace it.';

commit;
