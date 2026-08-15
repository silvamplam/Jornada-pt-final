begin;

create table if not exists public.matchday_live_layout_items (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  slot_type text not null,
  article_id uuid references public.editorial_articles(id) on delete set null,
  label text,
  title text,
  subtitle text,
  image_url text,
  link_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_live_layout_items_slot_type_check check (
    slot_type in (
      'live_hierarchical:secondary_strong_1',
      'live_hierarchical:secondary_strong_2',
      'live_hierarchical:secondary_1',
      'live_hierarchical:secondary_2',
      'live_hierarchical:dominant_side_top',
      'live_hierarchical:dominant_side_bottom',
      'live_hierarchical:secondary_3',
      'live_hierarchical:secondary_4',
      'live_hierarchical:closing_1',
      'live_hierarchical:closing_2',
      'live_hierarchical:closing_3',
      'live_beyond_matchday:1',
      'live_beyond_matchday:2',
      'live_beyond_matchday:3',
      'live_beyond_matchday:4',
      'live_beyond_matchday:5'
    )
  ),
  constraint matchday_live_layout_items_matchday_slot_unique unique (matchday_id, slot_type)
);

create index if not exists matchday_live_layout_items_matchday_idx
on public.matchday_live_layout_items (matchday_id);

create index if not exists matchday_live_layout_items_article_idx
on public.matchday_live_layout_items (article_id)
where article_id is not null;

alter table public.matchday_live_layout_items enable row level security;

comment on table public.matchday_live_layout_items is
  'Posições editoriais adicionais da Jornada viva. Independentes das composições de referência e do respetivo arquivo.';

comment on column public.matchday_live_layout_items.slot_type is
  'Posição visual reutilizada pelos três layouts vivos: Arbitragem e reações, Outros jogos da jornada e Para Lá da Jornada.';

revoke all on table public.matchday_live_layout_items from anon, authenticated;
grant all on table public.matchday_live_layout_items to service_role;

notify pgrst, 'reload schema';

commit;
