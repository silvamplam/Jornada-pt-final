begin;

-- ============================================================
-- LOTE 5B1-A / V22
--
-- Physical authority for the optional Latest companion relation.
--
-- The relation is explicit by physical zone UUID:
--   * no title inference;
--   * no block-order inference;
--   * no classification inference;
--   * host zone must use four_news;
--   * deleting or changing the host to another layout is blocked
--     until the relation is explicitly removed.
--
-- Existing selection placements remain untouched in this lot.
-- Existing Latest presentation settings remain compatibility state.
-- ============================================================

create table public.matchday_live_layout_latest_companion (
  matchday_id uuid primary key,
  zone_id uuid not null,
  created_at timestamptz not null
    default pg_catalog.statement_timestamp(),
  updated_at timestamptz not null
    default pg_catalog.statement_timestamp(),

  constraint matchday_live_layout_latest_companion_matchday_fk
    foreign key (matchday_id)
    references public.matchdays(id)
    on delete cascade,

  constraint matchday_live_layout_latest_companion_zone_context_fk
    foreign key (zone_id, matchday_id)
    references public.matchday_live_layout_zones(id, matchday_id)
    on delete no action
    deferrable initially deferred
);

create index matchday_live_layout_latest_companion_zone_idx
on public.matchday_live_layout_latest_companion(zone_id);

alter table public.matchday_live_layout_latest_companion
  enable row level security;

revoke all on table public.matchday_live_layout_latest_companion
from public, anon, authenticated, service_role;

comment on table public.matchday_live_layout_latest_companion
is
  'Optional physical Latest companion relation. The host is identified only by physical zone UUID and must be a four_news zone.';


-- ============================================================
-- 1. RELATION INVARIANTS
-- ============================================================

create function
jornada_private.assert_matchday_live_layout_latest_companion_row_v22()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.id = new.zone_id
      and zone_row.matchday_id = new.matchday_id
      and zone_row.visual_family = 'four_news'
  ) then
    raise exception
      'matchday-live-layout-latest-companion-v22-host-invalid';
  end if;

  return new;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_latest_companion_row_v22()
from public, anon, authenticated, service_role;

create trigger matchday_live_layout_latest_companion_row_guard
before insert or update
on public.matchday_live_layout_latest_companion
for each row
execute function
  jornada_private.assert_matchday_live_layout_latest_companion_row_v22();


create function
jornada_private.prevent_matchday_live_layout_latest_companion_host_change_v22()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if new.visual_family is distinct from 'four_news'
    and exists (
      select 1
      from public.matchday_live_layout_latest_companion as companion_row
      where companion_row.zone_id = old.id
        and companion_row.matchday_id = old.matchday_id
    )
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-host-layout-required';
  end if;

  return new;
end;
$function$;

revoke all on function
  jornada_private.prevent_matchday_live_layout_latest_companion_host_change_v22()
from public, anon, authenticated, service_role;

create trigger matchday_live_layout_latest_companion_host_guard
before update of visual_family
on public.matchday_live_layout_zones
for each row
execute function
  jornada_private.prevent_matchday_live_layout_latest_companion_host_change_v22();


-- ============================================================
-- 2. V22 OCC TOKEN
--
-- v20/v13 remain untouched.
-- v22 adds only the companion relation to the existing physical token.
-- ============================================================

create function
jornada_private.matchday_live_layout_workspace_token_v22(
  p_matchday_id uuid,
  p_profile_key text
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.md5(
    token_row.state_token
    || '|latest_companion='
    || coalesce(companion_row.zone_id::text, '')
  )
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row
  left join public.matchday_live_layout_latest_companion
    as companion_row
    on companion_row.matchday_id = p_matchday_id;
$function$;

revoke all on function
  jornada_private.matchday_live_layout_workspace_token_v22(uuid, text)
from public, anon, authenticated, service_role;

comment on function
  jornada_private.matchday_live_layout_workspace_token_v22(uuid, text)
is
  'V22 OCC token: existing physical v13 token plus the explicit Latest companion physical zone UUID.';


-- ============================================================
-- 3. READ-ONLY V22 WORKSPACE READER
--
-- The v13 reader remains intact and reusable.
-- ============================================================

create function public.read_matchday_live_layout_workspace_v22(
  p_matchday_id uuid,
  p_profile_key text
)
returns table (
  state_token text,
  zones jsonb,
  blocks jsonb,
  placements jsonb,
  bank_items jsonb,
  state_memory jsonb,
  explicit_bank_item_ids jsonb,
  displaced_bank_item_ids jsonb,
  worked_bank_item_ids jsonb,
  legacy_zone_projection jsonb,
  workspace_settings jsonb,
  physical_cutover jsonb,
  latest_companion jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    jornada_private.matchday_live_layout_workspace_token_v22(
      p_matchday_id,
      p_profile_key
    ) as state_token,
    base_row.zones,
    base_row.blocks,
    base_row.placements,
    base_row.bank_items,
    base_row.state_memory,
    base_row.explicit_bank_item_ids,
    base_row.displaced_bank_item_ids,
    base_row.worked_bank_item_ids,
    base_row.legacy_zone_projection,
    base_row.workspace_settings,
    base_row.physical_cutover,
    coalesce(
      (
        select pg_catalog.jsonb_build_object(
          'matchday_id', companion_row.matchday_id,
          'zone_id', companion_row.zone_id,
          'created_at', companion_row.created_at,
          'updated_at', companion_row.updated_at
        )
        from public.matchday_live_layout_latest_companion
          as companion_row
        where companion_row.matchday_id = p_matchday_id
      ),
      'null'::jsonb
    ) as latest_companion
  from public.read_matchday_live_layout_workspace_v13(
    p_matchday_id,
    p_profile_key
  ) as base_row;
$function$;

revoke all on function
  public.read_matchday_live_layout_workspace_v22(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_matchday_live_layout_workspace_v22(uuid, text)
to service_role;

comment on function
  public.read_matchday_live_layout_workspace_v22(uuid, text)
is
  'Read-only v22 physical workspace snapshot. Extends v13 only with the explicit Latest companion relation and a companion-aware OCC token.';


-- ============================================================
-- 4. SINGLE-TRANSACTION V22 APPLY
--
-- The v20 facade remains the topology/content authority and retains
-- all video, displacement, classification and downstream guards.
-- V22 owns only the companion relation around that existing Apply.
-- ============================================================

create function public.apply_matchday_live_layout_physical_v22(
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
    raise exception 'matchday-live-layout-physical-v20-matchday-not-found';
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
        and zone_row.visual_family = 'four_news'
    )
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-host-invalid';
  end if;

  -- Remove the previous relation first only when the requested host changes.
  -- This allows v20 to delete or change the former host in the same transaction.
  delete from public.matchday_live_layout_latest_companion as companion_row
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
      from public.matchday_live_layout_latest_companion as companion_row
      where companion_row.matchday_id = p_matchday_id
    )
  ) or (
    p_latest_companion_zone_id is not null
    and not exists (
      select 1
      from public.matchday_live_layout_latest_companion as companion_row
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
  'Single-transaction v22 physical Apply. Reuses v20 unchanged and adds only the explicit optional Latest companion relation by physical four_news zone UUID.';


-- ============================================================
-- 5. ACL POSTCONDITIONS
-- ============================================================

do $postconditions$
begin
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.read_matchday_live_layout_workspace_v22(uuid,text)',
    'EXECUTE'
  )
    or pg_catalog.has_function_privilege(
      'anon',
      'public.read_matchday_live_layout_workspace_v22(uuid,text)',
      'EXECUTE'
    )
    or pg_catalog.has_function_privilege(
      'authenticated',
      'public.read_matchday_live_layout_workspace_v22(uuid,text)',
      'EXECUTE'
    )
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-reader-acl-invalid';
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
    or pg_catalog.has_function_privilege(
      'service_role',
      'jornada_private.matchday_live_layout_workspace_token_v22(uuid,text)',
      'EXECUTE'
    )
  then
    raise exception
      'matchday-live-layout-latest-companion-v22-apply-acl-invalid';
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
      'matchday-live-layout-latest-companion-v22-table-acl-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;