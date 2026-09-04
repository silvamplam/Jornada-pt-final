begin;

-- ============================================================
-- LOTE 7E / PASSO 6B PREREQUISITE
--
-- Keep the validated v14 implementation intact, but move it behind a
-- private entrypoint so the public facade can enforce the legacy video
-- publication invariant in the same PostgreSQL transaction.
-- ============================================================

alter function public.apply_matchday_live_layout_physical_workspace_v14(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
rename to apply_matchday_live_layout_physical_workspace_v14_core;

alter function public.apply_matchday_live_layout_physical_workspace_v14_core(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
set schema jornada_private;

revoke all on function
  jornada_private.apply_matchday_live_layout_physical_workspace_v14_core(
    uuid,
    text,
    text,
    jsonb,
    jsonb,
    jsonb,
    integer,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.apply_matchday_live_layout_physical_workspace_v14_core(
    uuid,
    text,
    text,
    jsonb,
    jsonb,
    jsonb,
    integer,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb,
    jsonb
  )
is
  'Private validated v14 physical apply core. The public service-role facade owns the transactional video publication guard.';


create function public.apply_matchday_live_layout_physical_workspace_v14(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_physical_state_token text,
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
  v_video_module_active boolean := false;
  v_roundup_item_id uuid;
  v_highlight_bank_item_id uuid;
begin
  -- Malformed presentation payloads remain the core's responsibility, so the
  -- wrapper preserves the existing validation codes and ordering for them.
  if pg_catalog.jsonb_typeof(p_presentation) = 'object'
    and pg_catalog.jsonb_typeof(
      p_presentation -> 'video_module_active'
    ) = 'boolean'
  then
    v_video_module_active :=
      (p_presentation ->> 'video_module_active')::boolean;
  end if;

  if v_video_module_active then
    -- Use the exact v14/core lock order. The locks are transaction-scoped and
    -- re-entrant when the private core acquires them again.
    perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

    perform 1
    from public.matchdays as matchday_row
    where matchday_row.id = p_matchday_id
    for update;

    if not found then
      raise exception 'matchday-live-layout-physical-v14-matchday-not-found';
    end if;

    -- FOR UPDATE prevents status/video_url changes or deletion of the row
    -- selected as proof until the physical Apply commits or rolls back.
    select roundup_row.id
    into v_roundup_item_id
    from public.matchday_roundup_items as roundup_row
    where roundup_row.matchday_id = p_matchday_id
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(roundup_row.status, ''))
      ) = 'published'
      and nullif(pg_catalog.btrim(roundup_row.video_url), '') is not null
    order by roundup_row.id
    limit 1
    for update;

    if v_roundup_item_id is null then
      raise exception 'matchday-live-layout-physical-v14-video-required';
    end if;

    -- A requested physical highlight is publishable only when its canonical
    -- Bank participation is active and carries the link required by the v14
    -- downstream projector. Lock that row against concurrent mutation too.
    select bank_row.id
    into v_highlight_bank_item_id
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where placement_row.placement_type = 'video_highlight'
      and pg_catalog.lower(pg_catalog.btrim(bank_row.status)) = 'active'
      and nullif(pg_catalog.btrim(bank_row.link_url), '') is not null
    order by bank_row.id
    limit 1
    for update of bank_row;

    if v_highlight_bank_item_id is null then
      raise exception 'matchday-live-layout-physical-v14-highlight-required';
    end if;
  end if;

  return query
  select
    applied.state_token,
    applied.applied_zone_count,
    applied.applied_block_count,
    applied.applied_placement_count,
    applied.explicit_bank_item_count,
    applied.displaced_bank_item_count,
    applied.worked_bank_item_count
  from jornada_private.apply_matchday_live_layout_physical_workspace_v14_core(
    p_matchday_id,
    p_profile_key,
    p_expected_physical_state_token,
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
  ) as applied;

  -- The core has now materialized the physical highlight downstream. This
  -- postcondition proves that the legacy reader sees the same published,
  -- non-empty highlight before the public facade returns. A failure rolls the
  -- core, marker, settings, placements, clocks and downstream rows back.
  if v_video_module_active and not exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
      and editorial_row.complementary_mode = 'roundup_video'
      and editorial_row.complementary_status = 'published'
      and pg_catalog.num_nonnulls(
        nullif(pg_catalog.btrim(editorial_row.complementary_title), ''),
        nullif(pg_catalog.btrim(editorial_row.complementary_text), ''),
        nullif(pg_catalog.btrim(editorial_row.complementary_image_url), ''),
        nullif(pg_catalog.btrim(editorial_row.complementary_link_url), '')
      ) > 0
  ) then
    raise exception 'matchday-live-layout-physical-v14-highlight-required';
  end if;
end;
$function$;

revoke all on function public.apply_matchday_live_layout_physical_workspace_v14(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated, service_role;

grant execute on function public.apply_matchday_live_layout_physical_workspace_v14(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
to service_role;

comment on function public.apply_matchday_live_layout_physical_workspace_v14(
  uuid,
  text,
  text,
  jsonb,
  jsonb,
  jsonb,
  integer,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
is
  'Single service-role physical workspace Apply facade. It locks and validates published roundup video plus the physical highlight before atomically delegating to the private v14 core.';

notify pgrst, 'reload schema';

commit;
