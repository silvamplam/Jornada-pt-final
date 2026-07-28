-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-ARTIGOS-PLANEADOS-SCHEMA-1
-- SQL 2/4 — APLICAÇÃO PERSISTENTE MANUAL
-- Cria apenas a estrutura persistente dos artigos planeados e das respetivas fontes congeladas.

begin;

alter table public.newsroom_editorial_dossier_sources
  add constraint newsroom_editorial_dossier_sources_dossier_id_id_key
  unique (dossier_id, id);

create table public.newsroom_editorial_dossier_article_plans (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  working_title text not null,
  status text not null default 'planned',
  sort_order integer not null default 10,
  article_kind text not null default 'news',
  length_mode text not null default 'standard',
  editorial_instructions text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsroom_editorial_dossier_article_plans_dossier_fkey
    foreign key (dossier_id)
    references public.newsroom_editorial_dossiers(id)
    on delete cascade,
  constraint newsroom_editorial_dossier_article_plans_dossier_id_id_key
    unique (dossier_id, id),
  constraint newsroom_editorial_dossier_article_plans_title_not_blank
    check (btrim(working_title) <> ''),
  constraint newsroom_editorial_dossier_article_plans_status_check
    check (status in ('planned', 'ready', 'cancelled')),
  constraint newsroom_editorial_dossier_article_plans_sort_order_check
    check (sort_order >= 0),
  constraint newsroom_editorial_dossier_article_plans_article_kind_check
    check (article_kind in ('news', 'analysis', 'preview', 'summary')),
  constraint newsroom_editorial_dossier_article_plans_length_mode_check
    check (length_mode in ('brief', 'standard', 'developed'))
);

create table public.newsroom_editorial_dossier_article_plan_sources (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  article_plan_id uuid not null,
  dossier_source_id uuid not null,
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsroom_editorial_dossier_article_plan_sources_plan_identity_fkey
    foreign key (dossier_id, article_plan_id)
    references public.newsroom_editorial_dossier_article_plans(dossier_id, id)
    on delete cascade,
  constraint newsroom_editorial_dossier_article_plan_sources_source_identity_fkey
    foreign key (dossier_id, dossier_source_id)
    references public.newsroom_editorial_dossier_sources(dossier_id, id)
    on delete cascade,
  constraint newsroom_editorial_dossier_article_plan_sources_plan_source_key
    unique (article_plan_id, dossier_source_id),
  constraint newsroom_editorial_dossier_article_plan_sources_sort_order_check
    check (sort_order >= 0)
);

create index newsroom_editorial_dossier_article_plans_dossier_order_idx
  on public.newsroom_editorial_dossier_article_plans (
    dossier_id,
    status,
    sort_order asc,
    id asc
  );

create index newsroom_editorial_dossier_article_plan_sources_plan_order_idx
  on public.newsroom_editorial_dossier_article_plan_sources (
    article_plan_id,
    sort_order asc,
    id asc
  );

create index newsroom_editorial_dossier_article_plan_sources_source_idx
  on public.newsroom_editorial_dossier_article_plan_sources (
    dossier_source_id,
    article_plan_id
  );

create function public.newsroom_validate_editorial_dossier_article_plan_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_active_plan_count integer;
begin
  if new.status = 'cancelled' then
    return new;
  end if;

  perform 1
  from public.newsroom_editorial_dossiers dossier
  where dossier.id = new.dossier_id
  for update;

  select count(*)
  into v_active_plan_count
  from public.newsroom_editorial_dossier_article_plans plan
  where plan.dossier_id = new.dossier_id
    and plan.status <> 'cancelled'
    and plan.id <> new.id;

  if v_active_plan_count >= 4 then
    raise exception 'editorial_dossier_article_plan_limit_exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

create trigger newsroom_editorial_dossier_article_plans_validate_limit
before insert or update of dossier_id, status
on public.newsroom_editorial_dossier_article_plans
for each row
execute function public.newsroom_validate_editorial_dossier_article_plan_limit();

create trigger newsroom_editorial_dossier_article_plans_set_updated_at
before update on public.newsroom_editorial_dossier_article_plans
for each row
execute function public.newsroom_set_editorial_dossier_updated_at();

create trigger newsroom_editorial_dossier_article_plan_sources_set_updated_at
before update on public.newsroom_editorial_dossier_article_plan_sources
for each row
execute function public.newsroom_set_editorial_dossier_updated_at();

alter table public.newsroom_editorial_dossier_article_plans enable row level security;
alter table public.newsroom_editorial_dossier_article_plans force row level security;
alter table public.newsroom_editorial_dossier_article_plan_sources enable row level security;
alter table public.newsroom_editorial_dossier_article_plan_sources force row level security;

revoke all privileges on table public.newsroom_editorial_dossier_article_plans
  from public, anon, authenticated;
revoke all privileges on table public.newsroom_editorial_dossier_article_plan_sources
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.newsroom_editorial_dossier_article_plans
  to service_role;
grant select, insert, update, delete
  on table public.newsroom_editorial_dossier_article_plan_sources
  to service_role;

revoke all on function public.newsroom_validate_editorial_dossier_article_plan_limit()
  from public, anon, authenticated;
grant execute on function public.newsroom_validate_editorial_dossier_article_plan_limit()
  to service_role;

comment on table public.newsroom_editorial_dossier_article_plans is
  'Human-defined article plans inside an editorial dossier; no text generation occurs here.';

comment on table public.newsroom_editorial_dossier_article_plan_sources is
  'Assignments between an article plan and the dossier sources whose snapshots are already frozen.';

comment on column public.newsroom_editorial_dossier_article_plans.working_title is
  'Internal working title defined by the editor before any draft generation.';

comment on column public.newsroom_editorial_dossier_article_plans.status is
  'Planning lifecycle: planned, ready or cancelled. Draft linkage belongs to a later phase.';

comment on column public.newsroom_editorial_dossier_article_plan_sources.dossier_source_id is
  'References the frozen source entry inside the same dossier rather than a mutable current snapshot.';

commit;
