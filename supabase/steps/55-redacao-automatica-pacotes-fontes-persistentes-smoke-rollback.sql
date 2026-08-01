-- Step 55 - smoke test transacional, sem persistência, dos pacotes Markdown.

begin;

set local role service_role;

insert into public.newsroom_editorial_source_packages (
  id,
  created_at,
  updated_at,
  package_year,
  package_month,
  manifest,
  markdown
)
values (
  '00000000-0000-4000-8000-000000000053'::uuid,
  now(),
  now(),
  '2026',
  '08',
  jsonb_build_object(
    'version', 2,
    'packageId', '00000000-0000-4000-8000-000000000053',
    'year', '2026',
    'month', '08',
    'entries', jsonb_build_array()
  ),
  '# Teste controlado'
);

update public.newsroom_editorial_source_packages
set markdown = '# Teste controlado atualizado',
    updated_at = now()
where id = '00000000-0000-4000-8000-000000000053'::uuid;

delete from public.newsroom_editorial_source_packages
where id = '00000000-0000-4000-8000-000000000053'::uuid;

rollback;

select 'Smoke test concluído com INSERT, UPDATE e DELETE revertidos' as resultado;
