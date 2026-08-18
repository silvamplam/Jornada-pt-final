-- Redação Automática
-- Compatibilidade dos pacotes persistentes com manifest V4.
-- Mantém pacotes V2 existentes válidos.

begin;

alter table public.newsroom_editorial_source_packages
  drop constraint if exists
  newsroom_editorial_source_packages_manifest_check;

alter table public.newsroom_editorial_source_packages
  add constraint newsroom_editorial_source_packages_manifest_check
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
        and jsonb_array_length(manifest -> 'outputs')
          between 1 and 30
      )
    )
  );

commit;

notify pgrst, 'reload schema';
