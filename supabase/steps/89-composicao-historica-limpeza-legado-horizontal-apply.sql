begin;

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

commit;
