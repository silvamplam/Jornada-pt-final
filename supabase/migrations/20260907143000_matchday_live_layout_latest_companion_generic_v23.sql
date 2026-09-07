begin;

-- ============================================================
-- V23
--
-- Forward-only semantic correction of the physical Latest
-- companion relation introduced by V22.
--
-- The relation is by physical zone UUID only:
--   * no title inference;
--   * no block-order inference;
--   * no classification inference;
--   * no layout restriction.
--
-- The existing contextual FK remains the authority proving that
-- the companion references a zone from the same matchday.
--
-- The public v22 reader/token and Apply signature are preserved
-- for backward compatibility. Only the runtime host semantics
-- are widened from four_news to any existing physical zone.
-- ============================================================


-- ============================================================
-- 1. REMOVE V22 LAYOUT COUPLING
-- ============================================================

drop trigger if exists
  matchday_live_layout_latest_companion_row_guard
on public.matchday_live_layout_latest_companion;

drop trigger if exists
  matchday_live_layout_latest_companion_host_guard
on public.matchday_live_layout_zones;

drop function if exists
  jornada_private.assert_matchday_live_layout_latest_companion_row_v22();

drop function if exists
  jornada_private.prevent_matchday_live_layout_latest_companion_host_change_v22();

comment on table public.matchday_live_layout_latest_companion
is
  'Optional physical Latest companion relation. The host is identified only by physical zone UUID and is independent of zone layout. The contextual FK enforces same-matchday zone identity.';


-- ============================================================
-- 2. BACKWARD-COMPATIBLE APPLY WITH GENERIC HOST
-- ============================================================

create or replace function public.apply_matchday_live_layout_physical_v22(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_physical_state_token text,
  p_latest_companion_zone_id uuid,
  p_zones jsonb,
  p_blocks jsonb,
  p_placements jsonb,
  p_faixa_slot_count integer,
  p_explicit_bank_item_ids jsonb,
  p_displaced_bank_item_ids jsonb,
  p_worked_bank_item_ids jsonb,
  p_faixa_arrival_bank_item_ids jsonb,
  p_displaced_arrival_bank_item_ids jsonb,
  p_presentation jsonb
)
returns table (
  state_token text,
  applied_zone_count integer,
  applied_block_count integer,
  applied_placement_count integer,
  explicit_bank_item_count integer,
  displaced_bank_item_count integer,
  worked_bank_item_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_current_v22_token text;
  v_v13_token text;
  v_final_v22_token text;
  v_applied record;
begin
  if p_matchday_id is null
    or p_profile_key is null
    or pg_catalog.btrim(p_profile_key) = ''
    or p_expected_physical_state_token is null
    or pg_catalog.btrim(p_expected_physical_state_token) !~
       '^[0-9a-f]{32}$'
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-invalid-input';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception
      'matchday-live-layout-physical-v20-matchday-not-found';
  end if;

  select
    jornada_private.matchday_live_layout_workspace_token_v22(
      p_matchday_id,
      p_profile_key
    )
  into v_current_v22_token;

  if v_current_v22_token is distinct from
     p_expected_physical_state_token
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-concurrent-write';
  end if;

  if p_latest_companion_zone_id is not null
    and not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_zones_v14(
        p_zones
      ) as zone_row
      where zone_row.zone_id = p_latest_companion_zone_id
    )
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-host-invalid';
  end if;

  -- Remove the old relation before V20 only when the requested
  -- host changes or becomes null. This lets V20 freely relayout
  -- or delete the former host in the same transaction.
  delete from public.matchday_live_layout_latest_companion
    as companion_row
  where companion_row.matchday_id = p_matchday_id
    and companion_row.zone_id is distinct from
        p_latest_companion_zone_id;

  select token_row.state_token
  into v_v13_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  select *
  into v_applied
  from public.apply_matchday_live_layout_physical_v20(
    p_matchday_id,
    p_profile_key,
    v_v13_token,
    p_zones,
    p_blocks,
    p_placements,
    p_faixa_slot_count,
    p_explicit_bank_item_ids,
    p_displaced_bank_item_ids,
    p_worked_bank_item_ids,
    p_faixa_arrival_bank_item_ids,
    p_displaced_arrival_bank_item_ids,
    p_presentation
  );

  if not found then
    raise exception
      'matchday-live-layout-latest-companion-v22-apply-result-missing';
  end if;

  if p_latest_companion_zone_id is not null then
    insert into public.matchday_live_layout_latest_companion
      as companion_row (
        matchday_id,
        zone_id,
        created_at,
        updated_at
      )
    values (
      p_matchday_id,
      p_latest_companion_zone_id,
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    )
    on conflict (matchday_id)
    do update
    set zone_id = excluded.zone_id,
        updated_at = pg_catalog.statement_timestamp()
    where companion_row.zone_id is distinct from excluded.zone_id;
  end if;

  if (
    p_latest_companion_zone_id is null
    and exists (
      select 1
      from public.matchday_live_layout_latest_companion
        as companion_row
      where companion_row.matchday_id = p_matchday_id
    )
  ) or (
    p_latest_companion_zone_id is not null
    and not exists (
      select 1
      from public.matchday_live_layout_latest_companion
        as companion_row
      where companion_row.matchday_id = p_matchday_id
        and companion_row.zone_id = p_latest_companion_zone_id
    )
  ) then
    raise exception
      'matchday-live-layout-latest-companion-v22-postcondition';
  end if;

  select
    jornada_private.matchday_live_layout_workspace_token_v22(
      p_matchday_id,
      p_profile_key
    )
  into v_final_v22_token;

  if v_final_v22_token is null
    or v_final_v22_token !~ '^[0-9a-f]{32}$'
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-token-invalid';
  end if;

  return query
  select
    v_final_v22_token,
    v_applied.applied_zone_count,
    v_applied.applied_block_count,
    v_applied.applied_placement_count,
    v_applied.explicit_bank_item_count,
    v_applied.displaced_bank_item_count,
    v_applied.worked_bank_item_count;
end;
$function$;

revoke all on function
  public.apply_matchday_live_layout_physical_v22(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_live_layout_physical_v22(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;

comment on function
  public.apply_matchday_live_layout_physical_v22(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
is
  'Backward-compatible v22 Apply after V23. Latest companion is an optional generic physical zone UUID, independent of visual_family. Reuses V20 unchanged for topology, placements, displacement and classification invariants.';


-- ============================================================
-- 3. POSTCONDITIONS
-- ============================================================

do $postconditions$
declare
  v_apply_definition text;
begin
  if exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as relation_row
      on relation_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = relation_row.relnamespace
    where not trigger_row.tgisinternal
      and namespace_row.nspname = 'public'
      and trigger_row.tgname in (
        'matchday_live_layout_latest_companion_row_guard',
        'matchday_live_layout_latest_companion_host_guard'
      )
  ) then
    raise exception
      'matchday-live-layout-latest-companion-v23-layout-guard-still-present';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc as function_row
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = function_row.pronamespace
    where namespace_row.nspname = 'jornada_private'
      and function_row.proname in (
        'assert_matchday_live_layout_latest_companion_row_v22',
        'prevent_matchday_live_layout_latest_companion_host_change_v22'
      )
  ) then
    raise exception
      'matchday-live-layout-latest-companion-v23-layout-function-still-present';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
      'public.matchday_live_layout_latest_companion'::pg_catalog.regclass
      and constraint_row.conname =
        'matchday_live_layout_latest_companion_zone_context_fk'
  ) then
    raise exception
      'matchday-live-layout-latest-companion-v23-context-fk-missing';
  end if;

  select pg_catalog.pg_get_functiondef(
    pg_catalog.to_regprocedure(
      'public.apply_matchday_live_layout_physical_v22(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'
    )::oid
  )
  into v_apply_definition;

  if v_apply_definition is null
    or pg_catalog.strpos(
      v_apply_definition,
      'visual_family = ''four_news'''
    ) > 0
  then
    raise exception
      'matchday-live-layout-latest-companion-v23-apply-still-layout-coupled';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.apply_matchday_live_layout_physical_v22(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.apply_matchday_live_layout_physical_v22(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.apply_matchday_live_layout_physical_v22(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
      'EXECUTE'
    )
  then
    raise exception
      'matchday-live-layout-latest-companion-v23-apply-acl-invalid';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'public.matchday_live_layout_latest_companion',
    'INSERT'
  )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.matchday_live_layout_latest_companion',
      'UPDATE'
    )
    or pg_catalog.has_table_privilege(
      'service_role',
      'public.matchday_live_layout_latest_companion',
      'DELETE'
    )
  then
    raise exception
      'matchday-live-layout-latest-companion-v23-table-acl-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;