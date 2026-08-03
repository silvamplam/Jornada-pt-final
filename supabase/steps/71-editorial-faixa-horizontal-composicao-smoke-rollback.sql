begin;

do $$
declare
  home_editorial_id uuid;
  sample_matchday_id uuid;
  home_row_id uuid := gen_random_uuid();
  matchday_row_id uuid := gen_random_uuid();
  bank_row_id uuid := gen_random_uuid();
  composition_id uuid := gen_random_uuid();
  composition_item_id uuid := gen_random_uuid();
  home_sort_order integer;
  matchday_sort_order integer;
begin
  select id
    into home_editorial_id
  from public.site_editorials
  where slug = 'home'
  order by created_at asc nulls last, id asc
  limit 1;

  select id
    into sample_matchday_id
  from public.matchdays
  order by id asc
  limit 1;

  if home_editorial_id is null or sample_matchday_id is null then
    raise exception 'Smoke falhou: Home ou jornada de teste indisponivel';
  end if;

  select coalesce(max(sort_order), 0) + 10
    into home_sort_order
  from public.site_editorial_horizontal_news
  where site_editorial_id = home_editorial_id;

  select coalesce(max(sort_order), 0) + 10
    into matchday_sort_order
  from public.matchday_horizontal_news
  where matchday_id = sample_matchday_id;

  insert into public.site_editorial_horizontal_news (
    id, site_editorial_id, label, label_color, title, subtitle, image_url, link_url, sort_order, status
  ) values (
    home_row_id, home_editorial_id, 'Teste Home', '#123456', 'Notícia dinâmica Home', 'Rollback', null,
    '/noticias/teste-home-dinamica', home_sort_order, 'draft'
  );

  insert into public.matchday_horizontal_news (
    id, matchday_id, label, label_color, title, subtitle, image_url, link_url, sort_order, status
  ) values (
    matchday_row_id, sample_matchday_id, 'Teste Jornada', '#654321', 'Notícia dinâmica Jornada', 'Rollback', null,
    '/noticias/teste-jornada-dinamica', matchday_sort_order, 'draft'
  );

  insert into public.matchday_editorial_bank_items (
    id, matchday_id, label, label_color, title, subtitle, link_url, source_type, source_id,
    origin_slot_type, sort_order, status
  ) values (
    bank_row_id, sample_matchday_id, 'Teste Banco', '#abcdef', 'Notícia de teste do banco', 'Rollback',
    '/noticias/teste-banco-faixa', 'matchday_horizontal_news', matchday_row_id::text,
    'important_item', matchday_sort_order, 'active'
  );

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, use_roundup_items
  ) values (
    composition_id, sample_matchday_id, 'draft', false, 'Smoke faixa horizontal', false
  );

  insert into public.matchday_reference_composition_items (
    id, composition_id, slot_type, source_type, source_id, sort_order,
    title_snapshot, subtitle_snapshot, link_url_snapshot, label_snapshot, label_color_snapshot, status
  ) values (
    composition_item_id, composition_id, 'important_item', 'matchday_horizontal_news', matchday_row_id,
    matchday_sort_order, 'Notícia dinâmica Jornada', 'Rollback', '/noticias/teste-jornada-dinamica',
    'Teste Jornada', '#654321', 'draft'
  );

  if not exists (
    select 1 from public.site_editorial_horizontal_news
    where id = home_row_id and sort_order > 4 and label_color = '#123456'
  ) then
    raise exception 'Smoke falhou: a faixa da Home nao aceitou posicao dinamica e cor';
  end if;

  if not exists (
    select 1 from public.matchday_horizontal_news
    where id = matchday_row_id and sort_order > 4 and label_color = '#654321'
  ) then
    raise exception 'Smoke falhou: a faixa da jornada nao aceitou posicao dinamica e cor';
  end if;

  if not exists (
    select 1 from public.matchday_reference_composition_items
    where id = composition_item_id
      and slot_type = 'important_item'
      and source_type = 'matchday_horizontal_news'
      and label_color_snapshot = '#654321'
  ) then
    raise exception 'Smoke falhou: a composição nao preservou a noticia e a cor da faixa';
  end if;
end
$$;

select 'Smoke test concluído: mais de quatro notícias, cor do antetítulo e composição validados; rollback preservará os dados' as resultado;

rollback;
