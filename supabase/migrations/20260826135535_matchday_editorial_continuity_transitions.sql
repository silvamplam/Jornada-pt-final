begin;

create table public.matchday_editorial_continuity_transitions (
  source_matchday_id uuid primary key
    references public.matchdays(id)
    on delete restrict,
  target_matchday_id uuid not null unique
    references public.matchdays(id)
    on delete restrict,
  source_composition_id uuid not null
    references public.matchday_reference_compositions(id)
    on delete restrict,
  continuity_version integer not null,
  initialized_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_continuity_transitions_distinct_matchdays_check
    check (source_matchday_id <> target_matchday_id),
  constraint matchday_continuity_transitions_version_check
    check (continuity_version >= 3)
);

alter table public.matchday_editorial_continuity_transitions
  enable row level security;

revoke all on table public.matchday_editorial_continuity_transitions
  from public, anon, authenticated, service_role;

grant select on table public.matchday_editorial_continuity_transitions
  to service_role;

comment on table public.matchday_editorial_continuity_transitions is
  'Marcador transacional e idempotente da primeira inicialização de continuidade entre duas jornadas.';

comment on column public.matchday_editorial_continuity_transitions.source_composition_id is
  'Composição publicada da jornada de origem observada na primeira transição; serve apenas para auditoria e não participa na chave de idempotência.';

commit;
