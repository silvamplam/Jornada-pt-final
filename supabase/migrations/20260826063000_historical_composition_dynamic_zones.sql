begin;

create table if not exists public.matchday_historical_composition_zones (
  id uuid primary key default gen_random_uuid(),
  composition_id uuid not null
    references public.matchday_reference_compositions(id)
    on delete cascade,
  sort_order integer not null
    check (sort_order > 0),
  public_title text not null
    check (
      nullif(pg_catalog.btrim(public_title), '') is not null
      and pg_catalog.char_length(public_title) <= 120
    ),
  visual_family text not null
    check (
      visual_family in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    ),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  unique (composition_id, sort_order),
  unique (id, composition_id)
);

create table if not exists public.matchday_historical_composition_zone_items (
  id uuid primary key default gen_random_uuid(),

  composition_id uuid not null
    references public.matchday_reference_compositions(id)
    on delete cascade,

  zone_id uuid not null,

  position integer not null
    check (position between 1 and 6),

  bank_item_id uuid,

  source_identity text not null
    check (
      nullif(pg_catalog.btrim(source_identity), '') is not null
    ),

  label_snapshot text,
  title_snapshot text not null,
  subtitle_snapshot text,
  image_url_snapshot text,
  link_url_snapshot text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matchday_historical_zone_items_zone_fk
    foreign key (zone_id, composition_id)
    references public.matchday_historical_composition_zones(
      id,
      composition_id
    )
    on delete cascade,

  unique (zone_id, position),
  unique (composition_id, source_identity)
);

create index if not exists
  matchday_historical_composition_zones_composition_order_idx
on public.matchday_historical_composition_zones (
  composition_id,
  sort_order
);

create index if not exists
  matchday_historical_composition_zone_items_zone_position_idx
on public.matchday_historical_composition_zone_items (
  zone_id,
  position
);

alter table public.matchday_historical_composition_zones
  enable row level security;

alter table public.matchday_historical_composition_zone_items
  enable row level security;

revoke all
on table public.matchday_historical_composition_zones
from public, anon, authenticated;

revoke all
on table public.matchday_historical_composition_zone_items
from public, anon, authenticated;

grant select, insert, update, delete
on table public.matchday_historical_composition_zones
to service_role;

grant select, insert, update, delete
on table public.matchday_historical_composition_zone_items
to service_role;

comment on table public.matchday_historical_composition_zones is
  'Zonas editoriais variáveis da composição histórica. O título editorial e o layout são independentes do assunto.';

comment on column public.matchday_historical_composition_zones.visual_family is
  'Família visual reutilizada diretamente do catálogo da Mesa viva: six_news, five_news_balanced ou five_news_secondary.';

comment on table public.matchday_historical_composition_zone_items is
  'Artigos posicionados dentro das zonas editoriais variáveis, preservados por snapshot.';

notify pgrst, 'reload schema';

commit;