begin;

-- LOTE 7E - PASSO 4
-- Coherent read-only physical workspace snapshot. The legacy projection is
-- exposed only as explicit compatibility metadata and never inferred.

create function public.read_matchday_live_layout_workspace_v13(
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
  legacy_zone_projection jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  with token_state as materialized (
    select token_row.state_token
    from public.matchday_editorial_profile_workspace_token_v13(
      p_matchday_id,
      p_profile_key
    ) as token_row
  ),
  explicit_bank as materialized (
    select distinct bank_row.id as bank_item_id
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
  )
  select
    token_state.state_token,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', zone_row.id,
            'matchday_id', zone_row.matchday_id,
            'public_title', zone_row.public_title,
            'visual_family', zone_row.visual_family
          )
          order by zone_row.id
        )
        from public.matchday_live_layout_zones as zone_row
        where zone_row.matchday_id = p_matchday_id
      ),
      '[]'::jsonb
    ) as zones,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', block_row.id,
            'matchday_id', block_row.matchday_id,
            'block_type', block_row.block_type,
            'zone_id', block_row.zone_id,
            'sort_order', block_row.sort_order
          )
          order by block_row.sort_order, block_row.id
        )
        from public.matchday_live_layout_blocks as block_row
        where block_row.matchday_id = p_matchday_id
      ),
      '[]'::jsonb
    ) as blocks,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', placement_row.id,
            'matchday_id', placement_row.matchday_id,
            'bank_item_id', placement_row.bank_item_id,
            'placement_type', placement_row.placement_type,
            'zone_id', placement_row.zone_id,
            'slot_position', placement_row.slot_position,
            'created_at', placement_row.created_at,
            'updated_at', placement_row.updated_at
          )
          order by
            placement_row.placement_type,
            placement_row.zone_id nulls first,
            placement_row.slot_position,
            placement_row.bank_item_id,
            placement_row.id
        )
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = p_matchday_id
      ),
      '[]'::jsonb
    ) as placements,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'id', bank_row.id,
            'matchday_id', bank_row.matchday_id,
            'source_type', bank_row.source_type,
            'source_id', bank_row.source_id,
            'status', bank_row.status,
            'label', bank_row.label,
            'title', bank_row.title,
            'subtitle', bank_row.subtitle,
            'image_url', bank_row.image_url,
            'link_url', bank_row.link_url,
            'automatic_eligible', bank_row.automatic_eligible,
            'editorially_worked_at', bank_row.editorially_worked_at,
            'classification_key', bank_row.classification_key,
            'classification_source', bank_row.classification_source,
            'classified_at', bank_row.classified_at,
            'continuity_source_matchday_id',
              bank_row.continuity_source_matchday_id,
            'continuity_source_composition_id',
              bank_row.continuity_source_composition_id,
            'is_explicit_bank', explicit_row.bank_item_id is not null
          )
          order by bank_row.id
        )
        from public.matchday_editorial_bank_items as bank_row
        left join explicit_bank as explicit_row
          on explicit_row.bank_item_id = bank_row.id
        where bank_row.matchday_id = p_matchday_id
      ),
      '[]'::jsonb
    ) as bank_items,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'matchday_id', memory_row.matchday_id,
            'bank_item_id', memory_row.bank_item_id,
            'memory_kind', memory_row.memory_kind,
            'recorded_at', memory_row.recorded_at
          )
          order by memory_row.bank_item_id
        )
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
      ),
      '[]'::jsonb
    ) as state_memory,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          explicit_row.bank_item_id
          order by explicit_row.bank_item_id
        )
        from explicit_bank as explicit_row
      ),
      '[]'::jsonb
    ) as explicit_bank_item_ids,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          memory_row.bank_item_id
          order by memory_row.bank_item_id
        )
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.memory_kind = 'displaced'
      ),
      '[]'::jsonb
    ) as displaced_bank_item_ids,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          bank_row.id
          order by bank_row.id
        )
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.matchday_id = p_matchday_id
          and bank_row.editorially_worked_at is not null
      ),
      '[]'::jsonb
    ) as worked_bank_item_ids,
    coalesce(
      (
        select pg_catalog.jsonb_agg(
          pg_catalog.jsonb_build_object(
            'matchday_id', projection_row.matchday_id,
            'legacy_zone_key', projection_row.legacy_zone_key,
            'zone_id', projection_row.zone_id
          )
          order by projection_row.legacy_zone_key
        )
        from jornada_private.matchday_live_layout_zone_legacy_projection
          as projection_row
        where projection_row.matchday_id = p_matchday_id
      ),
      '[]'::jsonb
    ) as legacy_zone_projection
  from token_state;
$function$;

revoke all on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
to service_role;

comment on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
is
  'Read-only coherent v13 physical workspace snapshot. Legacy zone projection is explicit compatibility metadata and is never inferred.';

do $postconditions$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-workspace-v13-reader-grant-invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.read_matchday_live_layout_workspace_v13(uuid,text)',
    'EXECUTE'
  ) then
    raise exception
      'matchday-live-layout-workspace-v13-reader-service-role-missing';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
