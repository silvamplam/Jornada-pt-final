begin;

do $$
declare
  v_matchday_id uuid;
  v_deleted_article_id uuid := gen_random_uuid();
  v_deleted_content_id uuid := gen_random_uuid();
  v_surviving_article_id uuid := gen_random_uuid();
  v_article_bank_id uuid;
  v_content_bank_id uuid;
  v_surviving_bank_id uuid;
  v_article_composition_id uuid := gen_random_uuid();
  v_content_composition_id uuid := gen_random_uuid();
  v_article_composition_item_id uuid;
  v_content_composition_item_id uuid;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
begin
  select matchday.id
  into v_matchday_id
  from public.matchdays matchday
  order by matchday.id asc
  limit 1;

  if v_matchday_id is null then
    raise exception 'Smoke falhou: não existe jornada para testar';
  end if;

  insert into public.editorial_articles (
    id, title, slug, status, scope, label, subtitle, body, image_url,
    published_at, matchday_id, created_at, updated_at
  ) values
  (
    v_deleted_article_id,
    'Artigo descartável ligado a composição interna',
    'smoke-limpeza-total-artigo-' || v_suffix,
    'published', 'matchday', 'Teste', 'Subtítulo descartável',
    'Corpo descartável', '/images/smoke-limpeza-total-artigo.jpg',
    now(), v_matchday_id, now(), now()
  ),
  (
    v_surviving_article_id,
    'Artigo arquivado que deve permanecer',
    'smoke-limpeza-total-sobrevivente-' || v_suffix,
    'published', 'matchday', 'Teste', 'Subtítulo preservado',
    'Corpo preservado', '/images/smoke-limpeza-total-sobrevivente.jpg',
    now(), v_matchday_id, now(), now()
  );

  select bank.id
  into v_article_bank_id
  from public.matchday_editorial_bank_items bank
  where bank.source_type = 'editorial_article'
    and bank.source_id = v_deleted_article_id::text;

  select bank.id
  into v_surviving_bank_id
  from public.matchday_editorial_bank_items bank
  where bank.source_type = 'editorial_article'
    and bank.source_id = v_surviving_article_id::text;

  if v_article_bank_id is null or v_surviving_bank_id is null then
    raise exception 'Smoke falhou: os artigos não entraram automaticamente no banco';
  end if;

  update public.matchday_editorial_bank_items
  set status = 'archived'
  where id in (v_article_bank_id, v_surviving_bank_id);

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, use_roundup_items
  ) values (
    v_article_composition_id,
    v_matchday_id,
    'draft',
    false,
    'Smoke limpeza total de artigo',
    false
  );

  insert into public.matchday_reference_composition_items (
    composition_id, slot_type, source_type, source_id, sort_order,
    title_snapshot, link_url_snapshot, status
  ) values (
    v_article_composition_id,
    'highlight',
    'matchday_editorial_bank_item',
    v_article_bank_id,
    1,
    'Artigo descartável ligado a composição interna',
    null,
    'draft'
  ) returning id into v_article_composition_item_id;

  delete from public.editorial_articles
  where id = v_deleted_article_id;

  if exists (
    select 1
    from public.matchday_reference_composition_items item
    where item.id = v_article_composition_item_id
  ) then
    raise exception 'Smoke falhou: o item interno do artigo eliminado permaneceu na composição';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where bank.id = v_article_bank_id
  ) then
    raise exception 'Smoke falhou: o artigo eliminado permaneceu arquivado no banco';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where bank.id = v_surviving_bank_id
      and bank.status = 'archived'
  ) then
    raise exception 'Smoke falhou: uma notícia ainda existente foi removida do banco';
  end if;

  insert into public.editorial_contents (
    id, slug, status, scope, content_type, label, title, subtitle, summary,
    body, image_url, thumbnail_url, is_embeddable, published_at,
    matchday_id, created_at, updated_at
  ) values (
    v_deleted_content_id,
    'smoke-limpeza-total-conteudo-' || v_suffix,
    'published', 'matchday', 'video', 'Teste',
    'Conteúdo descartável ligado a composição interna',
    'Subtítulo descartável', 'Resumo descartável', 'Corpo descartável',
    '/images/smoke-limpeza-total-conteudo.jpg',
    '/images/smoke-limpeza-total-conteudo-thumb.jpg',
    false, now(), v_matchday_id, now(), now()
  );

  select bank.id
  into v_content_bank_id
  from public.matchday_editorial_bank_items bank
  where bank.source_type = 'editorial_content'
    and bank.source_id = v_deleted_content_id::text;

  if v_content_bank_id is null then
    raise exception 'Smoke falhou: o conteúdo não entrou automaticamente no banco';
  end if;

  update public.matchday_editorial_bank_items
  set status = 'archived'
  where id = v_content_bank_id;

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, use_roundup_items
  ) values (
    v_content_composition_id,
    v_matchday_id,
    'draft',
    false,
    'Smoke limpeza total de conteúdo',
    false
  );

  insert into public.matchday_reference_composition_items (
    composition_id, slot_type, source_type, source_id, sort_order,
    title_snapshot, link_url_snapshot, status
  ) values (
    v_content_composition_id,
    'important_item',
    'matchday_editorial_bank_item',
    v_content_bank_id,
    1,
    'Conteúdo descartável ligado a composição interna',
    null,
    'draft'
  ) returning id into v_content_composition_item_id;

  delete from public.editorial_contents
  where id = v_deleted_content_id;

  if exists (
    select 1
    from public.matchday_reference_composition_items item
    where item.id = v_content_composition_item_id
  ) then
    raise exception 'Smoke falhou: o item interno do conteúdo eliminado permaneceu na composição';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where bank.id = v_content_bank_id
  ) then
    raise exception 'Smoke falhou: o conteúdo eliminado permaneceu arquivado no banco';
  end if;
end
$$;

select 'Smoke test concluído: artigos e conteúdos eliminados desaparecem das composições internas e do banco; notícias arquivadas ainda existentes permanecem; rollback preservará os dados' as resultado;

rollback;
