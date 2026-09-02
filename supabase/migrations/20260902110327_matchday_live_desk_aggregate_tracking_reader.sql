begin;

-- A Mesa administrativa recebe uma linha compacta por participacao ativa.
-- A maquina de estados permanece exclusivamente na projecao privada do Lote 5;
-- este wrapper limita-se a acrescentar os metadados necessarios ao reader e a
-- tornar conflitos de memoria fail-closed no estado editorial exposto.

create function public.read_matchday_live_desk_aggregate_tracking(
  p_matchday_id uuid,
  p_profile_key text
)
returns table (
  bank_item_id uuid,
  source_type text,
  source_id text,
  label text,
  title text,
  subtitle text,
  image_url text,
  link_url text,
  bank_status text,
  automatic_eligible boolean,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  article_id uuid,
  article_published_at timestamptz,
  article_updated_at timestamptz,
  has_automatic_state boolean,
  automatic_zone_key text,
  automatic_sort_order integer,
  placement_count bigint,
  transversal_conflict boolean,
  memory_kind text,
  history_unknown boolean,
  memory_placement_conflict boolean,
  editorial_state text,
  placement_id uuid,
  placement_type text,
  zone_id uuid,
  placement_zone_key text,
  slot_position integer,
  inactive_historical_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  with projected as materialized (
    select state_row.*
    from jornada_private.project_matchday_live_layout_bank_item_states(
      array[p_matchday_id]
    ) as state_row
  ),
  inactive_historical as materialized (
    select pg_catalog.count(*)::bigint as item_count
    from public.matchday_editorial_profile_state_items as state_row
    where state_row.matchday_id = p_matchday_id
      and state_row.profile_key = p_profile_key
      and not exists (
        select 1
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.matchday_id = state_row.matchday_id
          and pg_catalog.lower(
                pg_catalog.btrim(coalesce(bank_row.status, ''))
              ) = 'active'
          and pg_catalog.lower(
                pg_catalog.btrim(coalesce(bank_row.source_type, ''))
              ) = pg_catalog.lower(
                pg_catalog.btrim(state_row.source_type)
              )
          and pg_catalog.lower(
                pg_catalog.btrim(coalesce(bank_row.source_id, ''))
              ) = pg_catalog.lower(
                pg_catalog.btrim(state_row.source_id)
              )
      )
  )
  select
    bank_row.id as bank_item_id,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
    bank_row.label,
    bank_row.title,
    bank_row.subtitle,
    bank_row.image_url,
    bank_row.link_url,
    projected_row.bank_status,
    bank_row.automatic_eligible,
    projected_row.classification_key,
    projected_row.classification_source,
    projected_row.classified_at,
    article_row.id as article_id,
    article_row.published_at as article_published_at,
    article_row.updated_at as article_updated_at,
    state_row.id is not null as has_automatic_state,
    state_row.zone_key as automatic_zone_key,
    state_row.sort_order as automatic_sort_order,
    projected_row.placement_count,
    projected_row.transversal_conflict,
    projected_row.memory_kind,
    projected_row.history_unknown,
    projected_row.memory_placement_conflict,
    case
      when projected_row.transversal_conflict
        or projected_row.memory_placement_conflict
        then null::text
      else projected_row.editorial_state
    end as editorial_state,
    placement_row.id as placement_id,
    placement_row.placement_type,
    placement_row.zone_id,
    zone_projection.legacy_zone_key as placement_zone_key,
    placement_row.slot_position,
    inactive_historical.item_count as inactive_historical_count
  from projected as projected_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.matchday_id = projected_row.matchday_id
   and bank_row.id = projected_row.bank_item_id
  left join public.editorial_articles as article_row
    on pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
       'editorial_article'
   and article_row.id::text =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  left join public.matchday_editorial_profile_state_items as state_row
    on state_row.matchday_id = projected_row.matchday_id
   and state_row.profile_key = p_profile_key
   and pg_catalog.lower(pg_catalog.btrim(state_row.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
   and pg_catalog.lower(pg_catalog.btrim(state_row.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  left join public.matchday_live_layout_placements as placement_row
    on placement_row.matchday_id = projected_row.matchday_id
   and placement_row.bank_item_id = projected_row.bank_item_id
   and projected_row.placement_count = 1
  left join jornada_private.matchday_live_layout_zone_legacy_projection
    as zone_projection
    on zone_projection.matchday_id = placement_row.matchday_id
   and zone_projection.zone_id = placement_row.zone_id
  cross join inactive_historical
  where pg_catalog.lower(
          pg_catalog.btrim(coalesce(projected_row.bank_status, ''))
        ) = 'active'
     or projected_row.placement_count > 0
  order by
    bank_row.updated_at desc,
    bank_row.id;
$function$;

revoke all on function
  public.read_matchday_live_desk_aggregate_tracking(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_matchday_live_desk_aggregate_tracking(uuid, text)
to service_role;

comment on function
  public.read_matchday_live_desk_aggregate_tracking(uuid, text)
is
  'Read-only service-role reader for the live desk. It reuses the private authoritative placement/memory projection and returns compact active Bank metadata without article bodies.';

notify pgrst, 'reload schema';

commit;
