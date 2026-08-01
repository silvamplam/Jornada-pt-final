-- Step 53 - persistência privada dos pacotes Markdown da redação automática.

begin;

create table public.newsroom_editorial_source_packages (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  package_year text not null,
  package_month text not null,
  manifest jsonb not null,
  markdown text not null,
  constraint newsroom_editorial_source_packages_year_check
    check (package_year ~ '^\d{4}$'),
  constraint newsroom_editorial_source_packages_month_check
    check (package_month ~ '^(0[1-9]|1[0-2])$'),
  constraint newsroom_editorial_source_packages_time_check
    check (updated_at >= created_at),
  constraint newsroom_editorial_source_packages_markdown_check
    check (btrim(markdown) <> ''),
  constraint newsroom_editorial_source_packages_manifest_check
    check (
      jsonb_typeof(manifest) = 'object'
      and manifest ->> 'version' = '2'
      and manifest ->> 'packageId' = id::text
      and manifest ->> 'year' = package_year
      and manifest ->> 'month' = package_month
      and jsonb_typeof(manifest -> 'entries') = 'array'
    )
);

create index newsroom_editorial_source_packages_created_idx
  on public.newsroom_editorial_source_packages (created_at desc, id desc);

alter table public.newsroom_editorial_source_packages enable row level security;
alter table public.newsroom_editorial_source_packages force row level security;

revoke all on table public.newsroom_editorial_source_packages
  from public, anon, authenticated;

grant select, insert, update, delete
  on table public.newsroom_editorial_source_packages
  to service_role;

comment on table public.newsroom_editorial_source_packages is
  'Private persistent Markdown packages assembled from selected newsroom snapshots; accessed only by server-side editorial routes.';

comment on column public.newsroom_editorial_source_packages.manifest is
  'Validated package metadata. Local image archive information is optional and may be null in hosted environments.';

comment on column public.newsroom_editorial_source_packages.markdown is
  'Complete Markdown returned to the authenticated backoffice for clipboard copy or download.';

commit;

notify pgrst, 'reload schema';
