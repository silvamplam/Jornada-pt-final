-- Step 52 - preflight da persistência privada dos pacotes Markdown.

do $$
begin
  if to_regclass('public.newsroom_editorial_source_packages') is not null then
    raise exception 'newsroom_editorial_source_packages_already_exists';
  end if;

  if not exists (
    select 1
    from pg_roles
    where rolname = 'service_role'
  ) then
    raise exception 'service_role_missing';
  end if;
end;
$$;

select 'Preflight concluído: tabela ausente e service_role disponível' as resultado;
