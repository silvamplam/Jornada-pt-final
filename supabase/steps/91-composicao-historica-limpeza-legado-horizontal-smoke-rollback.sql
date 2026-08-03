begin;

do $$
declare
  v_matchday_id uuid;
  v_bank_id uuid := gen_random_uuid();
  v_composition_id uuid := gen_random_uuid();
  v_composition_item_id uuid;
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
    v_bank_id,
    v_matchday_id,
    'Teste',
    'Resíduo legado descartável',
    'Entrada antiga sem artigo existente',
    null,
    '/noticias/smoke-legado-horizontal-' || v_suffix,
    'matchday_horizontal_news',
    gen_random_uuid()::text,
    'smoke-legado-horizontal-' || v_suffix,
    null,
    null,
    'archived'
  );

  insert into public.matchday_reference_compositions (
    id,
    matchday_id,
    status,
    is_current,
    internal_name,
    use_roundup_items
  ) values (
    v_composition_id,
    v_matchday_id,
    'draft',
    false,
    'Smoke limpeza de legado horizontal',
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
    v_composition_id,
    'highlight',
    'matchday_editorial_bank_item',
    v_bank_id,
    1,
    'Resíduo legado descartável',
    '/noticias/smoke-legado-horizontal-' || v_suffix,
    'draft'
  )
  returning id into v_composition_item_id;

  create temporary table legacy_matchday_horizontal_news_orphans
  on commit drop
  as
  with normalized_bank as (
    select
      bank.*,
      lower(
        btrim(
          coalesce(
            nullif(bank.source_slug, ''),
            regexp_replace(
              regexp_replace(
                split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1),
                '/+$',
                ''
              ),
              '^.*/',
              ''
            )
          )
        )
      ) as normalized_slug
    from public.matchday_editorial_bank_items bank
    where lower(btrim(coalesce(bank.source_type, ''))) = 'matchday_horizontal_news'
      and coalesce(bank.link_url, '') like '/noticias/%'
  )
  select bank.id
  from normalized_bank bank
  where bank.normalized_slug <> ''
    and not exists (
      select 1
      from public.editorial_articles article
      where lower(article.id::text) = lower(btrim(coalesce(bank.source_id, '')))
         or lower(btrim(article.slug)) = bank.normalized_slug
    )
    and not exists (
      select 1
      from public.editorial_contents content
      where lower(content.id::text) = lower(btrim(coalesce(bank.source_id, '')))
         or lower(btrim(content.slug)) = bank.normalized_slug
    );

  delete from public.matchday_reference_composition_items composition_item
  using legacy_matchday_horizontal_news_orphans orphan
  where composition_item.source_id = orphan.id
    and lower(btrim(coalesce(composition_item.source_type, ''))) in (
      'manual_link',
      'matchday_editorial_bank_item'
    );

  delete from public.matchday_editorial_bank_items bank
  using legacy_matchday_horizontal_news_orphans orphan
  where bank.id = orphan.id;

  if exists (
    select 1
    from public.matchday_reference_composition_items composition_item
    where composition_item.id = v_composition_item_id
  ) then
    raise exception 'Smoke falhou: o item de composição legado permaneceu';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where bank.id = v_bank_id
  ) then
    raise exception 'Smoke falhou: a entrada de banco legado permaneceu';
  end if;
end
$$;

select 'Smoke test concluído: resíduos órfãos de matchday_horizontal_news são removidos das composições e do banco; rollback preservará os dados' as resultado;

rollback;
