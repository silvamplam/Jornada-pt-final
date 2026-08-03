create table if not exists public.site_editorial_horizontal_news (
  id uuid primary key default gen_random_uuid(),
  site_editorial_id uuid not null references public.site_editorials(id) on delete cascade,
  label text,
  title text,
  subtitle text,
  image_url text,
  link_url text,
  sort_order integer not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint site_editorial_horizontal_news_sort_order_check check (sort_order between 1 and 4),
  constraint site_editorial_horizontal_news_status_check check (status in ('draft', 'published')),
  constraint site_editorial_horizontal_news_editorial_sort_unique unique (site_editorial_id, sort_order)
);

create table if not exists public.matchday_horizontal_news (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null references public.matchdays(id) on delete cascade,
  label text,
  title text,
  subtitle text,
  image_url text,
  link_url text,
  sort_order integer not null,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_horizontal_news_sort_order_check check (sort_order between 1 and 4),
  constraint matchday_horizontal_news_status_check check (status in ('draft', 'published')),
  constraint matchday_horizontal_news_matchday_sort_unique unique (matchday_id, sort_order)
);

create index if not exists site_editorial_horizontal_news_public_idx
  on public.site_editorial_horizontal_news (site_editorial_id, status, sort_order);

create index if not exists matchday_horizontal_news_public_idx
  on public.matchday_horizontal_news (matchday_id, status, sort_order);

comment on table public.site_editorial_horizontal_news is
  'Até quatro notícias da faixa horizontal publicada no fundo da Home.';

comment on table public.matchday_horizontal_news is
  'Até quatro notícias da faixa horizontal publicada antes da classificação de cada jornada.';

notify pgrst, 'reload schema';
