create or replace function public.sync_matchday_zone_row_to_bank()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_table_name = 'matchday_latest_news' then
    if tg_op = 'UPDATE'
      and (
        new.id,
        new.matchday_id,
        new.time_label,
        new.title,
        new.link_url,
        new.image_url,
        new.status,
        new.created_at,
        new.subtitle,
        new.article_id,
        new.time_label_color
      ) is not distinct from (
        old.id,
        old.matchday_id,
        old.time_label,
        old.title,
        old.link_url,
        old.image_url,
        old.status,
        old.created_at,
        old.subtitle,
        old.article_id,
        old.time_label_color
      )
    then
      return new;
    end if;

    if lower(btrim(coalesce(new.status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.link_url
      );
    end if;
  elsif tg_table_name = 'matchday_highlights' then
    if lower(btrim(coalesce(new.status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.link_url
      );
    end if;
  elsif tg_table_name = 'matchday_horizontal_news' then
    if lower(btrim(coalesce(new.status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.link_url
      );
    end if;
  elsif tg_table_name = 'matchday_editorials' then
    perform public.sync_matchday_zone_publication_to_bank(
      new.matchday_id,
      new.headline_link_url
    );

    if lower(btrim(coalesce(new.complementary_status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.complementary_link_url
      );
    end if;

    if lower(btrim(coalesce(new.side_block_status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(
        new.matchday_id,
        new.side_block_link_url
      );
    end if;
  end if;

  return new;
end
$function$;

create or replace function public.normalize_matchday_latest_news_order(
  p_matchday_id uuid
)
returns integer
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_updated integer := 0;
begin
  if p_matchday_id is null then
    raise exception
      'normalize-matchday-latest-news-order-invalid-input';
  end if;

  if not exists (
    select 1
    from public.matchdays as matchday_row
    where matchday_row.id = p_matchday_id
  ) then
    raise exception
      'normalize-matchday-latest-news-order-matchday-not-found';
  end if;

  with resolved as (
    select
      latest_row.id,
      latest_row.sort_order,
      latest_row.created_at,
      coalesce(
        canonical_row.order_time,
        '1970-01-01 00:00:00+00'::timestamptz
      ) as order_time
    from public.matchday_latest_news as latest_row
    left join lateral (
      select
        coalesce(
          article_row.published_at,
          article_row.created_at
        ) as order_time
      from public.editorial_articles as article_row
      where article_row.matchday_id = p_matchday_id
        and article_row.status = 'published'
        and (
          article_row.id = latest_row.article_id
          or '/noticias/' || article_row.slug
            = latest_row.link_url
        )
      order by
        case
          when article_row.id = latest_row.article_id
            then 0
          else 1
        end,
        article_row.published_at desc nulls last,
        article_row.created_at desc nulls last,
        article_row.id
      limit 1
    ) as canonical_row on true
    where latest_row.matchday_id = p_matchday_id
  ),
  ranked as (
    select
      resolved.id,
      row_number() over (
        order by
          resolved.order_time desc,
          resolved.sort_order asc,
          resolved.created_at asc,
          resolved.id asc
      )::integer as next_sort_order
    from resolved
  )
  update public.matchday_latest_news as latest_row
  set sort_order = ranked.next_sort_order,
      updated_at = pg_catalog.now()
  from ranked
  where latest_row.id = ranked.id
    and latest_row.matchday_id = p_matchday_id
    and latest_row.sort_order
      is distinct from ranked.next_sort_order;

  get diagnostics v_updated = row_count;

  return v_updated;
end;
$function$;

revoke all
on function public.normalize_matchday_latest_news_order(uuid)
from public;

revoke all
on function public.normalize_matchday_latest_news_order(uuid)
from anon;

revoke all
on function public.normalize_matchday_latest_news_order(uuid)
from authenticated;

grant execute
on function public.normalize_matchday_latest_news_order(uuid)
to service_role;