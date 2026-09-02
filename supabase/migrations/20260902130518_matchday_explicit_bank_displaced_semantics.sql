begin;

-- Banco is an explicit workspace destination, not a tracking state. The
-- existing override already records that editorial intent. Keep the memory
-- trigger focused on genuinely unintentional placement loss and expose the
-- distinction through the existing aggregate reader without another request.

lock table
  public.matchday_editorial_profile_manual_overrides,
  public.matchday_editorial_bank_items,
  public.matchday_live_layout_placements,
  public.matchday_live_layout_bank_item_state_memory
in share row exclusive mode;

create or replace function
jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    with affected as materialized (
      select distinct
        placement_row.matchday_id,
        placement_row.bank_item_id
      from new_placement_rows as placement_row
    )
    delete from public.matchday_live_layout_bank_item_state_memory
      as memory_row
    using affected as affected_row
    where memory_row.matchday_id = affected_row.matchday_id
      and memory_row.bank_item_id = affected_row.bank_item_id
      and exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      );

    return null;
  end if;

  if tg_op = 'UPDATE' then
    with affected as materialized (
      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row

      union

      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from new_placement_rows as placement_row
    )
    delete from public.matchday_live_layout_bank_item_state_memory
      as memory_row
    using affected as affected_row
    where memory_row.matchday_id = affected_row.matchday_id
      and memory_row.bank_item_id = affected_row.bank_item_id
      and exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      );

    with affected as materialized (
      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row

      union

      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from new_placement_rows as placement_row
    ),
    unplaced as materialized (
      select
        affected_row.matchday_id,
        affected_row.bank_item_id
      from affected as affected_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id = affected_row.bank_item_id
       and bank_row.matchday_id = affected_row.matchday_id
      where not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      )
      and not exists (
        select 1
        from public.matchday_editorial_profile_assignments as assignment_row
        join public.matchday_editorial_profile_manual_overrides as override_row
          on override_row.matchday_id = assignment_row.matchday_id
         and override_row.profile_key = assignment_row.profile_key
        where assignment_row.matchday_id = affected_row.matchday_id
          and override_row.placement_target = 'bank'
          and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
          and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
      )
    )
    insert into public.matchday_live_layout_bank_item_state_memory as memory_row (
      matchday_id,
      bank_item_id,
      memory_kind,
      recorded_at
    )
    select
      unplaced_row.matchday_id,
      unplaced_row.bank_item_id,
      'displaced',
      statement_timestamp()
    from unplaced as unplaced_row
    on conflict (matchday_id, bank_item_id)
    do update
    set memory_kind = 'displaced',
        recorded_at = excluded.recorded_at
    where memory_row.memory_kind <> 'displaced';

    return null;
  end if;

  if tg_op = 'DELETE' then
    with affected as materialized (
      select distinct
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row
    )
    delete from public.matchday_live_layout_bank_item_state_memory
      as memory_row
    using affected as affected_row
    where memory_row.matchday_id = affected_row.matchday_id
      and memory_row.bank_item_id = affected_row.bank_item_id
      and exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      );

    with affected as materialized (
      select distinct
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row
    ),
    unplaced as materialized (
      select
        affected_row.matchday_id,
        affected_row.bank_item_id
      from affected as affected_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id = affected_row.bank_item_id
       and bank_row.matchday_id = affected_row.matchday_id
      where not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      )
      and not exists (
        select 1
        from public.matchday_editorial_profile_assignments as assignment_row
        join public.matchday_editorial_profile_manual_overrides as override_row
          on override_row.matchday_id = assignment_row.matchday_id
         and override_row.profile_key = assignment_row.profile_key
        where assignment_row.matchday_id = affected_row.matchday_id
          and override_row.placement_target = 'bank'
          and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
          and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
      )
    )
    insert into public.matchday_live_layout_bank_item_state_memory as memory_row (
      matchday_id,
      bank_item_id,
      memory_kind,
      recorded_at
    )
    select
      unplaced_row.matchday_id,
      unplaced_row.bank_item_id,
      'displaced',
      statement_timestamp()
    from unplaced as unplaced_row
    on conflict (matchday_id, bank_item_id)
    do update
    set memory_kind = 'displaced',
        recorded_at = excluded.recorded_at
    where memory_row.memory_kind <> 'displaced';

    return null;
  end if;

  return null;
end;
$function$;

revoke all on function
  jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()
from public, anon, authenticated, service_role;

-- An item can already be unplaced when the editor explicitly parks it in the
-- Banco. In that case no placement statement is required, so clear stale
-- memory directly when the full override set is inserted or updated.
create function
jornada_private.clear_matchday_live_layout_memory_for_explicit_bank()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  with explicit_bank as materialized (
    select distinct
      override_row.matchday_id,
      bank_row.id as bank_item_id
    from new_override_rows as override_row
    join public.matchday_editorial_profile_assignments as assignment_row
      on assignment_row.matchday_id = override_row.matchday_id
     and assignment_row.profile_key = override_row.profile_key
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = override_row.matchday_id
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(override_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(override_row.source_id))
    where override_row.placement_target = 'bank'
  )
  delete from public.matchday_live_layout_bank_item_state_memory as memory_row
  using explicit_bank as explicit_row
  where memory_row.matchday_id = explicit_row.matchday_id
    and memory_row.bank_item_id = explicit_row.bank_item_id;

  return null;
end;
$function$;

revoke all on function
  jornada_private.clear_matchday_live_layout_memory_for_explicit_bank()
from public, anon, authenticated, service_role;

create trigger matchday_explicit_bank_memory_after_insert
  after insert
  on public.matchday_editorial_profile_manual_overrides
  referencing new table as new_override_rows
  for each statement
  execute function
    jornada_private.clear_matchday_live_layout_memory_for_explicit_bank();

create trigger matchday_explicit_bank_memory_after_update
  after update
  on public.matchday_editorial_profile_manual_overrides
  referencing new table as new_override_rows
  for each statement
  execute function
    jornada_private.clear_matchday_live_layout_memory_for_explicit_bank();

-- Generic and idempotent repair: explicit Banco is durable editorial intent.
-- Only memory that points to an active assignment's exact contextual Bank
-- identity and currently has no authoritative placement is removed.
delete from public.matchday_live_layout_bank_item_state_memory as memory_row
using public.matchday_editorial_bank_items as bank_row,
      public.matchday_editorial_profile_assignments as assignment_row,
      public.matchday_editorial_profile_manual_overrides as override_row
where bank_row.matchday_id = memory_row.matchday_id
  and bank_row.id = memory_row.bank_item_id
  and assignment_row.matchday_id = bank_row.matchday_id
  and override_row.matchday_id = assignment_row.matchday_id
  and override_row.profile_key = assignment_row.profile_key
  and override_row.placement_target = 'bank'
  and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
  and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  and not exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = memory_row.matchday_id
      and placement_row.bank_item_id = memory_row.bank_item_id
  );

drop function public.read_matchday_live_desk_aggregate_tracking(uuid, text);

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
  'Read-only service-role reader for the live desk. Explicit Banco is exposed separately from tracking states; placement/Bank conflicts remain fail-closed.';

do $postconditions$
begin
  if exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = memory_row.matchday_id
     and bank_row.id = memory_row.bank_item_id
    join public.matchday_editorial_profile_assignments as assignment_row
      on assignment_row.matchday_id = bank_row.matchday_id
    join public.matchday_editorial_profile_manual_overrides as override_row
      on override_row.matchday_id = assignment_row.matchday_id
     and override_row.profile_key = assignment_row.profile_key
     and override_row.placement_target = 'bank'
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
    where not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = memory_row.matchday_id
        and placement_row.bank_item_id = memory_row.bank_item_id
    )
  ) then
    raise exception 'matchday-explicit-bank-memory-repair-incomplete';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'matchday-explicit-bank-reader-grant-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
