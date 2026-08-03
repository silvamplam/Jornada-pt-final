begin;

do $$
declare
  first_matchday_id uuid;
  second_matchday_id uuid;
  article_id uuid := gen_random_uuid();
  content_id uuid := gen_random_uuid();
  legacy_bank_id uuid := gen_random_uuid();
  article_bank_id uuid;
  content_bank_id uuid;
  test_suffix text := replace(gen_random_uuid()::text, '-', '');
  article_slug text;
  content_slug text;
begin
  article_slug := 'smoke-banco-artigo-' || test_suffix;
  content_slug := 'smoke-banco-conteudo-' || test_suffix;

  select id
    into first_matchday_id
  from public.matchdays
  order by id asc
  limit 1;

  select id
    into second_matchday_id
  from public.matchdays
  where id <> first_matchday_id
  order by id asc
  limit 1;

  if first_matchday_id is null then
    raise exception 'Smoke falhou: não existe jornada para testar';
  end if;

  insert into public.matchday_editorial_bank_items (
    id,
    matchday_id,
    label,
    title,
    subtitle,
    image_url,
    link_url,
    source_type,
    source_id,
    source_slug,
    origin_slot_type,
    sort_order,
    status
  ) values (
    legacy_bank_id,
    first_matchday_id,
    'Legado',
    'Título legado a reconciliar',
    'Antes do trigger',
    null,
    '/noticias/' || article_slug,
    'matchday_highlight',
    gen_random_uuid()::text,
    article_slug,
    'highlight',
    1,
    'active'
  );

  insert into public.editorial_articles (
    id,
    title,
    slug,
    status,
    scope,
    label,
    subtitle,
    body,
    image_url,
    published_at,
    matchday_id,
    created_at,
    updated_at
  ) values (
    article_id,
    'Artigo automático de teste',
    article_slug,
    'published',
    'matchday',
    'Teste',
    'Subtítulo automático',
    'Corpo automático de teste',
    '/images/smoke-artigo.jpg',
    now(),
    first_matchday_id,
    now(),
    now()
  );

  select id
    into article_bank_id
  from public.matchday_editorial_bank_items
  where source_type = 'editorial_article'
    and source_id = article_id::text;

  if article_bank_id is null or article_bank_id <> legacy_bank_id then
    raise exception 'Smoke falhou: artigo publicado não reconciliou a entrada legada';
  end if;

  if (
    select count(*)
    from public.matchday_editorial_bank_items
    where lower(regexp_replace(split_part(split_part(coalesce(link_url, ''), '?', 1), '#', 1), '/$', '')) = lower('/noticias/' || article_slug)
  ) <> 1 then
    raise exception 'Smoke falhou: artigo gerou duplicação pelo mesmo link';
  end if;

  update public.matchday_editorial_bank_items
  set status = 'archived'
  where id = article_bank_id;

  update public.editorial_articles
  set title = 'Artigo automático atualizado',
      updated_at = now()
  where id = article_id;

  if not exists (
    select 1
    from public.matchday_editorial_bank_items
    where id = article_bank_id
      and title = 'Artigo automático atualizado'
      and status = 'archived'
  ) then
    raise exception 'Smoke falhou: atualização não preservou o estado arquivado';
  end if;

  insert into public.editorial_contents (
    id,
    slug,
    status,
    scope,
    content_type,
    label,
    title,
    subtitle,
    summary,
    body,
    image_url,
    thumbnail_url,
    is_embeddable,
    published_at,
    matchday_id,
    created_at,
    updated_at
  ) values (
    content_id,
    content_slug,
    'published',
    'matchday',
    'video',
    'Vídeo',
    'Conteúdo automático de teste',
    'Subtítulo do conteúdo',
    'Resumo do conteúdo',
    'Corpo do conteúdo',
    '/images/smoke-conteudo.jpg',
    '/images/smoke-conteudo-thumb.jpg',
    false,
    now(),
    first_matchday_id,
    now(),
    now()
  );

  select id
    into content_bank_id
  from public.matchday_editorial_bank_items
  where source_type = 'editorial_content'
    and source_id = content_id::text;

  if content_bank_id is null or not exists (
    select 1
    from public.matchday_editorial_bank_items
    where id = content_bank_id
      and matchday_id = first_matchday_id
      and subtitle = 'Resumo do conteúdo'
      and image_url = '/images/smoke-conteudo-thumb.jpg'
      and link_url = '/conteudos/' || content_slug
  ) then
    raise exception 'Smoke falhou: conteúdo publicado não entrou corretamente no banco';
  end if;

  if second_matchday_id is not null then
    update public.editorial_articles
    set matchday_id = second_matchday_id,
        updated_at = now()
    where id = article_id;

    if not exists (
      select 1
      from public.matchday_editorial_bank_items
      where id = article_bank_id
        and matchday_id = second_matchday_id
        and status = 'archived'
    ) then
      raise exception 'Smoke falhou: alteração de jornada não moveu a entrada automática';
    end if;

    if (
      select count(*)
      from public.matchday_editorial_bank_items
      where source_type = 'editorial_article'
        and source_id = article_id::text
    ) <> 1 then
      raise exception 'Smoke falhou: alteração de jornada duplicou o artigo';
    end if;
  end if;
end
$$;

select 'Smoke test concluído: entrada automática, reconciliação, atualização, arquivo e mudança de jornada validados; rollback preservará os dados' as resultado;

rollback;
