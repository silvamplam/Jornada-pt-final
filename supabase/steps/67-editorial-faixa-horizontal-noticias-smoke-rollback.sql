begin;

do $$
declare
  home_editorial_id uuid;
  home_sort_order integer;
  sample_matchday_id uuid;
  matchday_sort_order integer;
  home_row_id uuid := gen_random_uuid();
  matchday_row_id uuid := gen_random_uuid();
begin
  select editorial.id, position.value
    into home_editorial_id, home_sort_order
  from public.site_editorials editorial
  cross join generate_series(1, 4) as position(value)
  where editorial.slug = 'home'
    and not exists (
      select 1
      from public.site_editorial_horizontal_news item
      where item.site_editorial_id = editorial.id
        and item.sort_order = position.value
    )
  order by editorial.created_at asc nulls last, editorial.id asc, position.value asc
  limit 1;

  select matchday.id, position.value
    into sample_matchday_id, matchday_sort_order
  from public.matchdays matchday
  cross join generate_series(1, 4) as position(value)
  where not exists (
    select 1
    from public.matchday_horizontal_news item
    where item.matchday_id = matchday.id
      and item.sort_order = position.value
  )
  order by matchday.id asc, position.value asc
  limit 1;

  if home_editorial_id is null or home_sort_order is null then
    raise exception 'Smoke falhou: a Home nao tem qualquer posicao livre entre 1 e 4';
  end if;

  if sample_matchday_id is null or matchday_sort_order is null then
    raise exception 'Smoke falhou: nao existe uma jornada com posicao livre entre 1 e 4';
  end if;

  insert into public.site_editorial_horizontal_news (
    id, site_editorial_id, label, title, subtitle, image_url, link_url, sort_order, status
  ) values (
    home_row_id, home_editorial_id, 'Teste', 'Notícia de teste Home', 'Rollback', null, '/noticias/teste-home', home_sort_order, 'draft'
  );

  insert into public.matchday_horizontal_news (
    id, matchday_id, label, title, subtitle, image_url, link_url, sort_order, status
  ) values (
    matchday_row_id, sample_matchday_id, 'Teste', 'Notícia de teste Jornada', 'Rollback', null, '/noticias/teste-jornada', matchday_sort_order, 'draft'
  );

  if not exists (select 1 from public.site_editorial_horizontal_news where id = home_row_id)
    or not exists (select 1 from public.matchday_horizontal_news where id = matchday_row_id) then
    raise exception 'Smoke falhou: nao foi possivel validar as duas insercoes';
  end if;
end
$$;

select 'Smoke test concluído: as duas faixas aceitaram uma notícia e o rollback preservará os dados' as resultado;

rollback;
