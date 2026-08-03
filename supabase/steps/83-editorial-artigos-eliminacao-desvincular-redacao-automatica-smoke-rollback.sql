begin;

do $$
declare
  v_article_id uuid := gen_random_uuid();
  v_plan_id uuid := gen_random_uuid();
  v_generation_id uuid := gen_random_uuid();
  v_request_id uuid;
  v_dossier_id uuid;
  v_matchday_id uuid;
  v_bank_id uuid;
  v_suffix text := replace(gen_random_uuid()::text, '-', '');
begin
  select dossier.id
  into v_dossier_id
  from public.newsroom_editorial_dossiers dossier
  order by dossier.created_at asc, dossier.id asc
  limit 1;

  if v_dossier_id is null then
    raise exception 'Smoke falhou: não existe dossiê editorial para testar';
  end if;

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
  ) values (
    v_article_id,
    'Artigo descartável ligado à redação automática',
    'smoke-eliminar-artigo-redacao-' || v_suffix,
    'published',
    'matchday',
    'Teste',
    'Subtítulo descartável',
    'Corpo descartável para validar a eliminação integrada do artigo.',
    '/images/smoke-eliminar-artigo-redacao.jpg',
    now(),
    v_matchday_id,
    now(),
    now()
  );

  select bank.id
  into v_bank_id
  from public.matchday_editorial_bank_items bank
  where bank.source_type = 'editorial_article'
    and bank.source_id = v_article_id::text
  limit 1;

  if v_bank_id is null then
    raise exception 'Smoke falhou: o artigo não entrou no banco histórico';
  end if;

  update public.matchday_editorial_bank_items
  set status = 'archived'
  where id = v_bank_id;

  insert into public.newsroom_editorial_dossier_article_plans (
    id,
    dossier_id,
    working_title,
    status,
    sort_order,
    article_kind,
    length_mode,
    editorial_instructions,
    editorial_article_id
  ) values (
    v_plan_id,
    v_dossier_id,
    'Plano descartável para eliminação de artigo',
    'cancelled',
    9990,
    'news',
    'brief',
    'Teste transacional.',
    v_article_id
  );

  insert into public.newsroom_editorial_dossier_article_plan_generations (
    id,
    dossier_id,
    article_plan_id,
    editorial_article_id,
    provider,
    model,
    prompt_version,
    input_hash,
    input_snapshot,
    generated_body
  ) values (
    v_generation_id,
    v_dossier_id,
    v_plan_id,
    v_article_id,
    'smoke',
    'smoke-model',
    'smoke-v1',
    repeat('a', 64),
    jsonb_build_object('version', '1', 'sources', jsonb_build_array()),
    repeat('Texto gerado descartável. ', 6)
  );

  begin
    delete from public.newsroom_editorial_dossier_article_plan_generations
    where id = v_generation_id;

    raise exception 'Smoke falhou: uma geração ainda ligada ao artigo pôde ser eliminada diretamente';
  exception
    when sqlstate '55000' then
      null;
  end;

  select request.submission_id
  into v_request_id
  from public.newsroom_editorial_compose_requests request
  order by request.created_at asc, request.submission_id asc
  limit 1
  for update;

  if v_request_id is null then
    v_request_id := gen_random_uuid();

    insert into public.newsroom_editorial_compose_requests (
      submission_id,
      request_fingerprint,
      dossier_id,
      article_plan_id,
      editorial_article_id,
      generation_status
    ) values (
      v_request_id,
      repeat('b', 64),
      v_dossier_id,
      v_plan_id,
      v_article_id,
      'completed'
    );
  else
    update public.newsroom_editorial_compose_requests
    set editorial_article_id = v_article_id
    where submission_id = v_request_id;
  end if;

  delete from public.editorial_articles
  where id = v_article_id;

  if exists (
    select 1
    from public.editorial_articles article
    where article.id = v_article_id
  ) then
    raise exception 'Smoke falhou: o artigo não foi eliminado';
  end if;

  if not exists (
    select 1
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.id = v_plan_id
      and plan.editorial_article_id is null
  ) then
    raise exception 'Smoke falhou: o plano não foi preservado e desvinculado';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_dossier_article_plan_generations generation
    where generation.id = v_generation_id
  ) then
    raise exception 'Smoke falhou: a geração ligada ao artigo não foi removida';
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_compose_requests request
    where request.submission_id = v_request_id
  ) then
    raise exception 'Smoke falhou: o pedido interno ligado ao artigo não foi removido';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where bank.id = v_bank_id
  ) then
    raise exception 'Smoke falhou: o artigo eliminado permaneceu arquivado no banco histórico';
  end if;
end
$$;

select 'Smoke test concluído: eliminar um artigo arquivado desvincula o plano, remove geração e pedido internos, mantém a proteção normal e o rollback preservará os dados' as resultado;

rollback;
