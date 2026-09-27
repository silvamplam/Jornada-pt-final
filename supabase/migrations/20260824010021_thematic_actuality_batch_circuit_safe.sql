begin;

-- Manual zone placement is always an exact editorial slot.
-- Legacy zone-only overrides are preserved at their currently applied slot when possible;
-- any unresolved legacy override is released to the automatic circuit.
with resolvable as (
  select
    override_row.id,
    zone_row.sort_order
  from public.matchday_editorial_profile_manual_overrides as override_row
  join public.matchday_editorial_profile_zone_items as zone_row
    on zone_row.matchday_id = override_row.matchday_id
   and zone_row.profile_key = override_row.profile_key
   and zone_row.source_type = override_row.source_type
   and zone_row.source_id = override_row.source_id
   and zone_row.zone_key = override_row.zone_key
  where override_row.placement_target = 'zone'
    and override_row.sort_order is null
    and not exists (
      select 1
      from public.matchday_editorial_profile_manual_overrides as occupied
      where occupied.id <> override_row.id
        and occupied.matchday_id = override_row.matchday_id
        and occupied.profile_key = override_row.profile_key
        and occupied.placement_target = 'zone'
        and occupied.zone_key = override_row.zone_key
        and occupied.sort_order = zone_row.sort_order
    )
)
update public.matchday_editorial_profile_manual_overrides as override_row
set sort_order = resolvable.sort_order,
    updated_at = pg_catalog.now()
from resolvable
where override_row.id = resolvable.id;

delete from public.matchday_editorial_profile_manual_overrides
where placement_target = 'zone'
  and sort_order is null;

comment on table public.matchday_editorial_profile_manual_overrides is
  'Manual placement state. New Mesa code persists zone and Faixa decisions as exact positions; historical zone-only rows are normalized by the thematic actuality circuit.';

-- Latest is an editorial projection of the already-published canonical article.
-- If the canonical bank row is already synchronized, do not touch it again and
-- therefore do not trigger a second profile refresh for the same publication.
create or replace function public.sync_matchday_zone_publication_to_bank(
  p_matchday_id uuid,
  p_link_url text
)
returns uuid
language plpgsql
security definer
set search_path = 'public'
as $$
declare
  v_path text := regexp_replace(split_part(split_part(coalesce(btrim(p_link_url), ''), '?', 1), '#', 1), '/$', '');
  v_slug text;
  v_article public.editorial_articles%rowtype;
  v_content public.editorial_contents%rowtype;
  v_existing_bank_id uuid;
  v_candidate_count integer;
  v_exact_count integer;
begin
  if p_matchday_id is null or v_path = '' then
    return null;
  end if;

  if v_path like '/noticias/%' then
    v_slug := nullif(substring(v_path from char_length('/noticias/') + 1), '');
    if v_slug is null then return null; end if;

    select * into v_article
    from public.editorial_articles article
    where article.slug = v_slug
      and article.status = 'published'
      and (article.matchday_id is null or article.matchday_id = p_matchday_id)
    order by case when article.matchday_id = p_matchday_id then 0 else 1 end,
             article.published_at desc nulls last,
             article.updated_at desc nulls last,
             article.id
    limit 1;

    if v_article.id is null then return null; end if;

    select
      min(bank.id) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_article.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_article.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from nullif(btrim(v_article.label), '')
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_article.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from nullif(btrim(v_article.subtitle), '')
          and nullif(btrim(bank.image_url), '') is not distinct from nullif(btrim(v_article.image_url), '')
          and nullif(btrim(bank.link_url), '') is not distinct from '/noticias/' || btrim(v_article.slug)
      ),
      count(*)::integer,
      count(*) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_article.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_article.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from nullif(btrim(v_article.label), '')
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_article.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from nullif(btrim(v_article.subtitle), '')
          and nullif(btrim(bank.image_url), '') is not distinct from nullif(btrim(v_article.image_url), '')
          and nullif(btrim(bank.link_url), '') is not distinct from '/noticias/' || btrim(v_article.slug)
      )::integer
    into v_existing_bank_id, v_candidate_count, v_exact_count
    from public.matchday_editorial_bank_items as bank
    where bank.matchday_id = p_matchday_id
      and (
        (
          lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_article.id::text)
        )
        or lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', ''))
          = lower('/noticias/' || btrim(v_article.slug))
      );

    if v_candidate_count = 1 and v_exact_count = 1 then
      return v_existing_bank_id;
    end if;

    return public.upsert_matchday_editorial_bank_publication(
      p_matchday_id,
      'editorial_article',
      v_article.id::text,
      v_article.slug,
      v_article.label,
      v_article.title,
      v_article.subtitle,
      v_article.image_url,
      '/noticias/' || v_article.slug
    );
  end if;

  if v_path like '/conteudos/%' then
    v_slug := nullif(substring(v_path from char_length('/conteudos/') + 1), '');
    if v_slug is null then return null; end if;

    select * into v_content
    from public.editorial_contents content
    where content.slug = v_slug
      and content.status = 'published'
      and (content.matchday_id is null or content.matchday_id = p_matchday_id)
    order by case when content.matchday_id = p_matchday_id then 0 else 1 end,
             content.published_at desc nulls last,
             content.updated_at desc nulls last,
             content.id
    limit 1;

    if v_content.id is null then return null; end if;

    select
      min(bank.id) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_content.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_content.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from coalesce(nullif(btrim(v_content.label), ''), nullif(btrim(v_content.content_type), ''))
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_content.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from coalesce(nullif(btrim(v_content.summary), ''), nullif(btrim(v_content.subtitle), ''))
          and nullif(btrim(bank.image_url), '') is not distinct from coalesce(nullif(btrim(v_content.thumbnail_url), ''), nullif(btrim(v_content.image_url), ''))
          and nullif(btrim(bank.link_url), '') is not distinct from '/conteudos/' || btrim(v_content.slug)
      ),
      count(*)::integer,
      count(*) filter (
        where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_content.id::text)
          and nullif(btrim(bank.source_slug), '') is not distinct from nullif(btrim(v_content.slug), '')
          and nullif(btrim(bank.label), '') is not distinct from coalesce(nullif(btrim(v_content.label), ''), nullif(btrim(v_content.content_type), ''))
          and nullif(btrim(bank.title), '') is not distinct from nullif(btrim(v_content.title), '')
          and nullif(btrim(bank.subtitle), '') is not distinct from coalesce(nullif(btrim(v_content.summary), ''), nullif(btrim(v_content.subtitle), ''))
          and nullif(btrim(bank.image_url), '') is not distinct from coalesce(nullif(btrim(v_content.thumbnail_url), ''), nullif(btrim(v_content.image_url), ''))
          and nullif(btrim(bank.link_url), '') is not distinct from '/conteudos/' || btrim(v_content.slug)
      )::integer
    into v_existing_bank_id, v_candidate_count, v_exact_count
    from public.matchday_editorial_bank_items as bank
    where bank.matchday_id = p_matchday_id
      and (
        (
          lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_content.id::text)
        )
        or lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', ''))
          = lower('/conteudos/' || btrim(v_content.slug))
      );

    if v_candidate_count = 1 and v_exact_count = 1 then
      return v_existing_bank_id;
    end if;

    return public.upsert_matchday_editorial_bank_publication(
      p_matchday_id,
      'editorial_content',
      v_content.id::text,
      v_content.slug,
      coalesce(nullif(btrim(v_content.label), ''), nullif(btrim(v_content.content_type), '')),
      v_content.title,
      coalesce(nullif(btrim(v_content.summary), ''), nullif(btrim(v_content.subtitle), '')),
      coalesce(nullif(btrim(v_content.thumbnail_url), ''), nullif(btrim(v_content.image_url), '')),
      '/conteudos/' || v_content.slug
    );
  end if;

  return null;
end
$$;

-- One-time normalization of already-applied thematic Faixa rows.
-- Exact manual Faixa slots remain fixed. Every other row is ordered globally by
-- canonical publication actuality, filling the free positions around them.
select pg_catalog.set_config(
  'jornada.thematic_faixa_reconcile',
  'on',
  true
);

with resolved as (
  select
    faixa_row.id as faixa_id,
    faixa_row.matchday_id,
    article_row.id::text as source_id,
    article_row.published_at,
    article_row.updated_at,
    pg_catalog.count(*) over (
      partition by faixa_row.id
    ) as article_match_count
  from public.matchday_horizontal_news as faixa_row
  join public.matchday_editorial_profile_assignments as assignment_row
    on assignment_row.matchday_id = faixa_row.matchday_id
   and assignment_row.profile_key = 'liga_portugal_v1'
  join public.editorial_articles as article_row
    on article_row.status = 'published'
   and '/noticias/' || pg_catalog.btrim(article_row.slug)
     = pg_catalog.btrim(faixa_row.link_url)
),
unique_resolved as (
  select *
  from resolved
  where article_match_count = 1
),
faixa_totals as (
  select faixa_row.matchday_id, pg_catalog.count(*)::integer as total_count
  from public.matchday_horizontal_news as faixa_row
  join public.matchday_editorial_profile_assignments as assignment_row
    on assignment_row.matchday_id = faixa_row.matchday_id
   and assignment_row.profile_key = 'liga_portugal_v1'
  group by faixa_row.matchday_id
),
resolved_totals as (
  select matchday_id, pg_catalog.count(*)::integer as resolved_count,
         pg_catalog.count(distinct source_id)::integer as distinct_source_count
  from unique_resolved
  group by matchday_id
),
manual_fixed as (
  select
    override_row.matchday_id,
    override_row.source_id,
    override_row.sort_order
  from public.matchday_editorial_profile_manual_overrides as override_row
  where override_row.profile_key = 'liga_portugal_v1'
    and override_row.placement_target = 'faixa'
    and override_row.sort_order is not null
),
manual_fixed_totals as (
  select
    fixed.matchday_id,
    pg_catalog.count(*)::integer as fixed_count,
    pg_catalog.count(distinct fixed.sort_order)::integer as distinct_fixed_count,
    pg_catalog.count(resolved.faixa_id)::integer as resolved_fixed_count
  from manual_fixed as fixed
  left join unique_resolved as resolved
    on resolved.matchday_id = fixed.matchday_id
   and resolved.source_id = fixed.source_id
  group by fixed.matchday_id
),
eligible_matchdays as (
  select totals.matchday_id, totals.total_count
  from faixa_totals as totals
  join resolved_totals as resolved
    on resolved.matchday_id = totals.matchday_id
  left join manual_fixed_totals as fixed
    on fixed.matchday_id = totals.matchday_id
  where resolved.resolved_count = totals.total_count
    and resolved.distinct_source_count = totals.total_count
    and coalesce(fixed.fixed_count, 0) = coalesce(fixed.distinct_fixed_count, 0)
    and coalesce(fixed.fixed_count, 0) = coalesce(fixed.resolved_fixed_count, 0)
    and not exists (
      select 1
      from manual_fixed as invalid_fixed
      where invalid_fixed.matchday_id = totals.matchday_id
        and (
          invalid_fixed.sort_order < 1
          or invalid_fixed.sort_order > totals.total_count
        )
    )
),
offsets as (
  select
    eligible.matchday_id,
    eligible.total_count + 2048 as offset_value
  from eligible_matchdays as eligible
)
update public.matchday_horizontal_news as faixa_row
set sort_order = faixa_row.sort_order + offsets.offset_value
from offsets
where faixa_row.matchday_id = offsets.matchday_id;

with resolved as (
  select
    faixa_row.id as faixa_id,
    faixa_row.matchday_id,
    article_row.id::text as source_id,
    article_row.published_at,
    article_row.updated_at,
    pg_catalog.count(*) over (
      partition by faixa_row.id
    ) as article_match_count
  from public.matchday_horizontal_news as faixa_row
  join public.matchday_editorial_profile_assignments as assignment_row
    on assignment_row.matchday_id = faixa_row.matchday_id
   and assignment_row.profile_key = 'liga_portugal_v1'
  join public.editorial_articles as article_row
    on article_row.status = 'published'
   and '/noticias/' || pg_catalog.btrim(article_row.slug)
     = pg_catalog.btrim(faixa_row.link_url)
),
unique_resolved as (
  select * from resolved where article_match_count = 1
),
faixa_totals as (
  select faixa_row.matchday_id, pg_catalog.count(*)::integer as total_count
  from public.matchday_horizontal_news as faixa_row
  join public.matchday_editorial_profile_assignments as assignment_row
    on assignment_row.matchday_id = faixa_row.matchday_id
   and assignment_row.profile_key = 'liga_portugal_v1'
  group by faixa_row.matchday_id
),
resolved_totals as (
  select matchday_id, pg_catalog.count(*)::integer as resolved_count,
         pg_catalog.count(distinct source_id)::integer as distinct_source_count
  from unique_resolved
  group by matchday_id
),
manual_fixed as (
  select matchday_id, source_id, sort_order
  from public.matchday_editorial_profile_manual_overrides
  where profile_key = 'liga_portugal_v1'
    and placement_target = 'faixa'
    and sort_order is not null
),
manual_fixed_totals as (
  select
    fixed.matchday_id,
    pg_catalog.count(*)::integer as fixed_count,
    pg_catalog.count(distinct fixed.sort_order)::integer as distinct_fixed_count,
    pg_catalog.count(resolved.faixa_id)::integer as resolved_fixed_count
  from manual_fixed as fixed
  left join unique_resolved as resolved
    on resolved.matchday_id = fixed.matchday_id
   and resolved.source_id = fixed.source_id
  group by fixed.matchday_id
),
eligible_matchdays as (
  select totals.matchday_id, totals.total_count
  from faixa_totals as totals
  join resolved_totals as resolved
    on resolved.matchday_id = totals.matchday_id
  left join manual_fixed_totals as fixed
    on fixed.matchday_id = totals.matchday_id
  where resolved.resolved_count = totals.total_count
    and resolved.distinct_source_count = totals.total_count
    and coalesce(fixed.fixed_count, 0) = coalesce(fixed.distinct_fixed_count, 0)
    and coalesce(fixed.fixed_count, 0) = coalesce(fixed.resolved_fixed_count, 0)
    and not exists (
      select 1
      from manual_fixed as invalid_fixed
      where invalid_fixed.matchday_id = totals.matchday_id
        and (
          invalid_fixed.sort_order < 1
          or invalid_fixed.sort_order > totals.total_count
        )
    )
),
fixed_positions as (
  select fixed.matchday_id, fixed.source_id, fixed.sort_order
  from manual_fixed as fixed
  join eligible_matchdays as eligible
    on eligible.matchday_id = fixed.matchday_id
),
automatic_ranked as (
  select
    resolved.faixa_id,
    resolved.matchday_id,
    resolved.source_id,
    pg_catalog.row_number() over (
      partition by resolved.matchday_id
      order by
        resolved.published_at desc nulls last,
        resolved.updated_at desc nulls last,
        resolved.source_id asc
    )::integer as automatic_rank
  from unique_resolved as resolved
  join eligible_matchdays as eligible
    on eligible.matchday_id = resolved.matchday_id
  left join fixed_positions as fixed
    on fixed.matchday_id = resolved.matchday_id
   and fixed.source_id = resolved.source_id
  where fixed.source_id is null
),
free_positions as (
  select
    eligible.matchday_id,
    position_value,
    pg_catalog.row_number() over (
      partition by eligible.matchday_id
      order by position_value
    )::integer as automatic_rank
  from eligible_matchdays as eligible
  cross join lateral pg_catalog.generate_series(
    1,
    eligible.total_count
  ) as position_value
  left join fixed_positions as fixed
    on fixed.matchday_id = eligible.matchday_id
   and fixed.sort_order = position_value
  where fixed.source_id is null
),
desired as (
  select resolved.faixa_id, fixed.sort_order as desired_sort_order
  from unique_resolved as resolved
  join fixed_positions as fixed
    on fixed.matchday_id = resolved.matchday_id
   and fixed.source_id = resolved.source_id

  union all

  select automatic.faixa_id, free.position_value as desired_sort_order
  from automatic_ranked as automatic
  join free_positions as free
    on free.matchday_id = automatic.matchday_id
   and free.automatic_rank = automatic.automatic_rank
)
update public.matchday_horizontal_news as faixa_row
set sort_order = desired.desired_sort_order,
    updated_at = pg_catalog.now()
from desired
where faixa_row.id = desired.faixa_id;

commit;
