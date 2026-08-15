begin;

create table if not exists public.site_advertising_slots (
  slot_key text primary key,
  name text not null default 'Publicidade lateral',
  image_url text,
  target_url text,
  alt_text text,
  is_active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.site_advertising_slots
  add column if not exists name text not null default 'Publicidade lateral',
  add column if not exists image_url text,
  add column if not exists target_url text,
  add column if not exists alt_text text,
  add column if not exists is_active boolean not null default false,
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists updated_at timestamptz not null default now();

alter table public.site_advertising_slots enable row level security;

revoke all on table public.site_advertising_slots from anon;
revoke all on table public.site_advertising_slots from authenticated;
grant all on table public.site_advertising_slots to service_role;

insert into public.site_advertising_slots (
  slot_key,
  name,
  image_url,
  target_url,
  alt_text,
  is_active
)
values (
  'lateral_primary',
  'Startup Madeira NOW',
  '/ads/startup-madeira-now-sidebar.png',
  'https://now.startupmadeira.eu/',
  'Startup Madeira NOW',
  true
)
on conflict (slot_key) do nothing;

commit;