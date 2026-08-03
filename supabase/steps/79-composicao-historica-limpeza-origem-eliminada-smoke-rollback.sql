begin;

do $$
declare
  matchday_id uuid;
  article_id uuid := gen_random_uuid();
  content_id uuid := gen_random_uuid();
  protected_article_id uuid := gen_random_uuid();
  article_bank_id uuid;
  content_bank_id uuid;
  protected_bank_id uuid;
  composition_id uuid := gen_random_uuid();
  test_suffix text := replace(gen_random_uuid()::text, '-', '');
begin
  select id
    into matchday_id
  from public.matchdays
  order by id asc
  limit 1;

  if matchday_id is null then
    raise exception 'Smoke falhou: não existe jornada para testar';
  end if;

  insert into public.editorial_articles (
    id, title, slug, status, scope, label, subtitle, body, image_url,
    published_at, matchday_id, created_at, updated_at
  ) values (
    article_id,
    'Artigo descartável de teste',
    'smoke-eliminar-artigo-' || test_suffix,
    'published',
    'matchday',
    'Teste',
    'Subtítulo descartável',
    'Corpo descartável',
    '/images/smoke-eliminar-artigo.jpg',
    now(),
    matchday_id,
    now(),
    now()
  );

  select id
    into article_bank_id
  from public.matchday_editorial_bank_items
  where source_type = 'editorial_article'
    and source_id = article_id::text;

  if article_bank_id is null then
    raise exception 'Smoke falhou: artigo não entrou automaticamente no banco';
  end if;

  update public.matchday_editorial_bank_items
  set status = 'archived'
  where id = article_bank_id;

  delete from public.editorial_articles
  where id = article_id;

  if exists (
    select 1
    from public.matchday_editorial_bank_items
    where id = article_bank_id
  ) then
    raise exception 'Smoke falhou: artigo apagado permaneceu arquivado no banco';
  end if;

  insert into public.editorial_contents (
    id, slug, status, scope, content_type, label, title, subtitle, summary,
    body, image_url, thumbnail_url, is_embeddable, published_at,
    matchday_id, created_at, updated_at
  ) values (
    content_id,
    'smoke-eliminar-conteudo-' || test_suffix,
    'published',
    'matchday',
    'video',
    'Teste',
    'Conteúdo descartável de teste',
    'Subtítulo descartável',
    'Resumo descartável',
    'Corpo descartável',
    '/images/smoke-eliminar-conteudo.jpg',
    '/images/smoke-eliminar-conteudo-thumb.jpg',
    false,
    now(),
    matchday_id,
    now(),
    now()
  );

  select id
    into content_bank_id
  from public.matchday_editorial_bank_items
  where source_type = 'editorial_content'
    and source_id = content_id::text;

  update public.matchday_editorial_bank_items
  set status = 'archived'
  where id = content_bank_id;

  delete from public.editorial_contents
  where id = content_id;

  if content_bank_id is null or exists (
    select 1
    from public.matchday_editorial_bank_items
    where id = content_bank_id
  ) then
    raise exception 'Smoke falhou: conteúdo apagado permaneceu no banco';
  end if;

  insert into public.editorial_articles (
    id, title, slug, status, scope, label, subtitle, body, image_url,
    published_at, matchday_id, created_at, updated_at
  ) values (
    protected_article_id,
    'Artigo protegido por composição',
    'smoke-artigo-protegido-' || test_suffix,
    'published',
    'matchday',
    'Teste',
    'Subtítulo protegido',
    'Corpo protegido',
    '/images/smoke-artigo-protegido.jpg',
    now(),
    matchday_id,
    now(),
    now()
  );

  select id
    into protected_bank_id
  from public.matchday_editorial_bank_items
  where source_type = 'editorial_article'
    and source_id = protected_article_id::text;

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, use_roundup_items
  ) values (
    composition_id,
    matchday_id,
    'draft',
    false,
    'Smoke proteção de banco',
    false
  );

  insert into public.matchday_reference_composition_items (
    composition_id,
    slot_type,
    source_type,
    source_id,
    sort_order,
    title_snapshot,
    link_url_snapshot,
    status
  ) values (
    composition_id,
    'highlight',
    'matchday_editorial_bank_item',
    protected_bank_id,
    1,
    'Artigo protegido por composição',
    '/noticias/smoke-artigo-protegido-' || test_suffix,
    'draft'
  );

  delete from public.editorial_articles
  where id = protected_article_id;

  if not exists (
    select 1
    from public.matchday_editorial_bank_items
    where id = protected_bank_id
  ) then
    raise exception 'Smoke falhou: item usado numa composição foi apagado do banco';
  end if;
end
$$;

select 'Smoke test concluído: artigos e conteúdos apagados saem do banco livre ou arquivado; itens usados em composição permanecem protegidos; rollback preservará os dados' as resultado;

rollback;
