do $$
declare
  missing_tables text[] := array[]::text[];
  existing_tables text[] := array[]::text[];
begin
  if to_regclass('public.site_editorials') is null then
    missing_tables := array_append(missing_tables, 'public.site_editorials');
  end if;

  if to_regclass('public.matchdays') is null then
    missing_tables := array_append(missing_tables, 'public.matchdays');
  end if;

  if array_length(missing_tables, 1) is not null then
    raise exception 'Preflight falhou: faltam dependencias %', array_to_string(missing_tables, ', ');
  end if;

  if to_regclass('public.site_editorial_horizontal_news') is not null then
    existing_tables := array_append(existing_tables, 'public.site_editorial_horizontal_news');
  end if;

  if to_regclass('public.matchday_horizontal_news') is not null then
    existing_tables := array_append(existing_tables, 'public.matchday_horizontal_news');
  end if;

  if array_length(existing_tables, 1) is not null then
    raise exception 'Preflight falhou: tabelas ja existentes %', array_to_string(existing_tables, ', ');
  end if;
end
$$;

select 'Preflight concluído: dependências disponíveis e duas tabelas ainda ausentes' as resultado;
