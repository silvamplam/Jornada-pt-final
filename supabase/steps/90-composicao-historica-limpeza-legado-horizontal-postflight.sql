begin;
set local transaction_read_only = on;

do $$
begin
  if exists (
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
    select 1
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
      )
  ) then
    raise exception 'Postflight falhou: persistem resíduos órfãos de matchday_horizontal_news';
  end if;
end
$$;

select 'Postflight concluído: não persistem resíduos órfãos de matchday_horizontal_news' as resultado;

rollback;
