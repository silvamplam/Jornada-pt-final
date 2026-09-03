begin;

-- LOTE 7C
-- Tracking order is derived from the event that defines each lane:
-- NOVA        -> article publication
-- FAIXA       -> current entry into Faixa
-- DESALOJADA  -> start of the current displaced period
--
-- No placement, classification or article is mutated here.

drop function
  public.read_matchday_live_desk_aggregate_tracking(uuid, text);

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
  is_explicit_bank boolean,
  bank_placement_conflict boolean,
  editorial_state text,
  placement_id uuid,
  placement_type text,
  zone_id uuid,
  placement_zone_key text,
  slot_position integer,
  placement_created_at timestamptz,
  state_recorded_at timestamptz,
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
  explicit_bank as materialized (
    select distinct
      bank_row.id as bank_item_id
    from public.matchday_editorial_bank_items as bank_row
    join public.matchday_editorial_profile_manual_overrides as override_row
      on override_row.matchday_id = bank_row.matchday_id
     and override_row.profile_key = p_profile_key
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
     and override_row.placement_target = 'bank'
    where bank_row.matchday_id = p_matchday_id
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
    explicit_bank.bank_item_id is not null as is_explicit_bank,
    explicit_bank.bank_item_id is not null
      and projected_row.placement_count > 0 as bank_placement_conflict,
    case
      when projected_row.transversal_conflict
        or projected_row.memory_placement_conflict
        or (
          explicit_bank.bank_item_id is not null
          and projected_row.placement_count > 0
        )
        then null::text
      when explicit_bank.bank_item_id is not null
        then null::text
      when explicit_bank.bank_item_id is null
        then projected_row.editorial_state
    end as editorial_state,
    placement_row.id as placement_id,
    placement_row.placement_type,
    placement_row.zone_id,
    zone_projection.legacy_zone_key as placement_zone_key,
    placement_row.slot_position,
    placement_row.created_at as placement_created_at,
    memory_row.recorded_at as state_recorded_at,
    inactive_historical.item_count as inactive_historical_count
  from projected as projected_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.matchday_id = projected_row.matchday_id
   and bank_row.id = projected_row.bank_item_id
  left join explicit_bank
    on explicit_bank.bank_item_id = projected_row.bank_item_id
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
  left join public.matchday_live_layout_bank_item_state_memory as memory_row
    on memory_row.matchday_id = projected_row.matchday_id
   and memory_row.bank_item_id = projected_row.bank_item_id
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
  'Read-only live desk reader. Exposes article publication, current Faixa entry and current displacement event timestamps so each tracking lane can use its own editorial order.';

do $postconditions$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-desk-tracking-order-grant-invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-desk-tracking-order-service-role-missing';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
