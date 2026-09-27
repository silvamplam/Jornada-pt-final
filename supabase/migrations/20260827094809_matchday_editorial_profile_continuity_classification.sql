begin;

create or replace function public.matchday_editorial_profile_continuity_classification_plan(
  p_matchday_id uuid
)
returns table (
  source_type text,
  source_id text,
  classified_zone_key text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with recursive matchday_chain as (
    select
      transition_row.source_matchday_id as lookup_matchday_id,
      1 as depth
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.target_matchday_id = p_matchday_id

    union all

    select
      transition_row.source_matchday_id,
      chain.depth + 1
    from matchday_chain as chain
    join public.matchday_editorial_continuity_transitions as transition_row
      on transition_row.target_matchday_id = chain.lookup_matchday_id
    where chain.depth < 100
  ),
  current_continuity_sources as materialized (
    select
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id
    from public.matchday_editorial_bank_items as bank_row
    join public.editorial_articles as article_row
      on article_row.id::text =
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
     and article_row.status = 'published'
    join public.matchday_editorial_continuity_transitions as transition_row
      on transition_row.target_matchday_id = bank_row.matchday_id
     and transition_row.source_matchday_id =
        bank_row.continuity_source_matchday_id
     and transition_row.source_composition_id =
        bank_row.continuity_source_composition_id
    where bank_row.matchday_id = p_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
      and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
        'editorial_article'
      and bank_row.automatic_eligible = false
      and nullif(pg_catalog.btrim(bank_row.source_id), '') is not null
  ),
  classified_lookup as materialized (
    select
      chain.depth,
      classified_row.source_type,
      classified_row.source_id,
      classified_row.classified_zone_key
    from matchday_chain as chain
    cross join lateral public.matchday_editorial_profile_classification_plan(
      chain.lookup_matchday_id
    ) as classified_row
  ),
  resolved as (
    select distinct on (
      current_row.source_type,
      current_row.source_id
    )
      current_row.source_type,
      current_row.source_id,
      classified_row.classified_zone_key,
      classified_row.depth
    from current_continuity_sources as current_row
    join classified_lookup as classified_row
      on classified_row.source_type = current_row.source_type
     and classified_row.source_id = current_row.source_id
    order by
      current_row.source_type,
      current_row.source_id,
      classified_row.depth
  )
  select
    resolved_row.source_type,
    resolved_row.source_id,
    resolved_row.classified_zone_key
  from resolved as resolved_row
  order by
    resolved_row.source_type,
    resolved_row.source_id;
$function$;

comment on function public.matchday_editorial_profile_continuity_classification_plan(
  uuid
) is
  'Resolves the natural thematic zone of active continuity-only sources from the closest ancestor matchday where the validated automatic classifier knew the source. It never grants current automatic actuality eligibility.';

revoke all on function
  public.matchday_editorial_profile_continuity_classification_plan(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_editorial_profile_continuity_classification_plan(uuid)
to service_role;

notify pgrst, 'reload schema';

commit;
