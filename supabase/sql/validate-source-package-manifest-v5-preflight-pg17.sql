\set ON_ERROR_STOP on

-- Run only on a disposable PostgreSQL 17 database before applying
-- 20260912173257_allow_mesa_v2_source_package_manifest_v5.sql.
do $roles$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end;
$roles$;

create table public.newsroom_editorial_source_packages (
  id uuid primary key,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  package_year text not null check (package_year ~ '^\d{4}$'),
  package_month text not null check (package_month ~ '^(0[1-9]|1[0-2])$'),
  manifest jsonb not null,
  markdown text not null check (btrim(markdown) <> ''),
  constraint newsroom_editorial_source_packages_manifest_check
    check (
      jsonb_typeof(manifest) = 'object'
      and manifest ->> 'version' in ('2', '4')
      and manifest ->> 'packageId' = id::text
      and manifest ->> 'year' = package_year
      and manifest ->> 'month' = package_month
      and jsonb_typeof(manifest -> 'entries') = 'array'
      and (
        manifest ->> 'version' = '2'
        or (
          manifest ->> 'version' = '4'
          and jsonb_typeof(manifest -> 'outputs') = 'array'
          and jsonb_array_length(manifest -> 'outputs') between 1 and 30
        )
      )
    )
);

insert into public.newsroom_editorial_source_packages(
  id,package_year,package_month,manifest,markdown
) values
  (
    'a1000000-0000-4000-8000-000000000001','2026','09',
    jsonb_build_object(
      'version',2,'packageId','a1000000-0000-4000-8000-000000000001',
      'year','2026','month','09','entries','[]'::jsonb
    ),'manifest v2'
  ),
  (
    'a1000000-0000-4000-8000-000000000002','2026','09',
    jsonb_build_object(
      'version',4,'packageId','a1000000-0000-4000-8000-000000000002',
      'year','2026','month','09','entries','[]'::jsonb,
      'outputs',jsonb_build_array(jsonb_build_object('position',1))
    ),'manifest v4'
  );

do $assert_preflight$
declare v_definition text;
begin
  select pg_get_constraintdef(oid) into strict v_definition
  from pg_constraint
  where conrelid='public.newsroom_editorial_source_packages'::regclass
    and conname='newsroom_editorial_source_packages_manifest_check';
  if v_definition not like '%version%2%4%'
    or exists(select 1 from public.newsroom_editorial_source_packages where manifest->>'version' not in ('2','4'))
  then
    raise exception 'source-package-manifest-v5-preflight-invalid';
  end if;
end;
$assert_preflight$;

select 'source-package-manifest-v5-preflight-ok' as result;
