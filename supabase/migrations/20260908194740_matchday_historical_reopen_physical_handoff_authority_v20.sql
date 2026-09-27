begin;

-- A historical composition is retired by the durable physical handoff and
-- desk ownership switch. Physical placements and state memory remain valid
-- archive rows and therefore do not participate in the retirement decision.
create or replace function public.reopen_matchday_reference_composition(
  p_matchday_id uuid,
  p_composition_id uuid
)
returns uuid
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source public.matchday_reference_compositions%rowtype;
  v_existing_draft_id uuid;
  v_draft_id uuid := pg_catalog.gen_random_uuid();
  v_now timestamptz := pg_catalog.now();
  v_item public.matchday_reference_composition_items%rowtype;
  v_slot public.matchday_hierarchical_composition_slots%rowtype;
  v_zone public.matchday_historical_composition_zones%rowtype;
  v_zone_item public.matchday_historical_composition_zone_items%rowtype;
  v_draft_zone_id uuid;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'composition_matchday_not_found';
  end if;

  perform 1
  from public.matchday_reference_compositions as composition_row
  where composition_row.matchday_id = p_matchday_id
  for update;

  select composition_row.*
  into v_source
  from public.matchday_reference_compositions as composition_row
  where composition_row.id = p_composition_id
    and composition_row.matchday_id = p_matchday_id
    and composition_row.status = 'published'
    and composition_row.is_current = true;

  if not found then
    raise exception 'composition_current_published_not_found';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = p_matchday_id
      and source_desk.is_managed = false
      and source_desk.carryover_source_composition_id is null
      and source_desk.carryover_snapshot is null
  ) then
    raise exception 'composition_historical_source_not_retired';
  end if;

  -- A handoff row is written only after v17 topology, v18 carryover, public
  -- transition, target activation and the source ownership switch complete in
  -- the same transaction. Validate the persisted certificate graph, but never
  -- compare with the target's current live state. The composition being
  -- reopened is deliberately independent from the original handoff source.
  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
    join jornada_private.matchday_live_layout_physical_topology_transitions
      as topology_row
      on topology_row.id = handoff_row.topology_transition_id
     and topology_row.source_matchday_id = handoff_row.source_matchday_id
     and topology_row.target_matchday_id = handoff_row.target_matchday_id
     and topology_row.profile_key = handoff_row.profile_key
    join jornada_private.matchday_live_layout_physical_carryovers
      as carryover_row
      on carryover_row.id = handoff_row.carryover_id
     and carryover_row.topology_transition_id =
         handoff_row.topology_transition_id
     and carryover_row.source_matchday_id = handoff_row.source_matchday_id
     and carryover_row.target_matchday_id = handoff_row.target_matchday_id
     and carryover_row.source_composition_id =
         handoff_row.source_composition_id
     and carryover_row.profile_key = handoff_row.profile_key
     and carryover_row.state_token_after = handoff_row.target_state_token
    join public.matchday_editorial_continuity_transitions as transition_row
      on transition_row.source_matchday_id = handoff_row.source_matchday_id
     and transition_row.target_matchday_id = handoff_row.target_matchday_id
     and transition_row.source_composition_id =
         handoff_row.source_composition_id
    join public.matchday_reference_compositions as original_composition
      on original_composition.id = handoff_row.source_composition_id
     and original_composition.matchday_id = handoff_row.source_matchday_id
     and original_composition.status = 'published'
    where handoff_row.source_matchday_id = p_matchday_id
      and handoff_row.completed_at is not null
  ) then
    raise exception 'composition_historical_physical_handoff_not_found';
  end if;

  -- Repeating reopen is idempotent while a draft of this presentation exists.
  select draft_row.id
  into v_existing_draft_id
  from public.matchday_reference_compositions as draft_row
  where draft_row.matchday_id = p_matchday_id
    and draft_row.presentation_mode = v_source.presentation_mode
    and draft_row.status = 'draft'
  order by draft_row.created_at desc, draft_row.id
  limit 1;

  if found then
    return v_existing_draft_id;
  end if;

  insert into public.matchday_reference_compositions (
    id,
    matchday_id,
    status,
    is_current,
    internal_name,
    use_roundup_items,
    created_at,
    updated_at,
    published_at,
    presentation_mode,
    hierarchical_editorial_title,
    hierarchical_editorial_text,
    hierarchical_editorial_author,
    hierarchical_editorial_excerpt,
    hierarchical_headline_title_color,
    hierarchical_zone_1_title,
    hierarchical_zone_2_title,
    hierarchical_block_order,
    hierarchical_editorial_source_type,
    hierarchical_editorial_source_id,
    hierarchical_video_position
  )
  values (
    v_draft_id,
    v_source.matchday_id,
    'draft',
    false,
    v_source.internal_name,
    v_source.use_roundup_items,
    v_now,
    v_now,
    null,
    v_source.presentation_mode,
    v_source.hierarchical_editorial_title,
    v_source.hierarchical_editorial_text,
    v_source.hierarchical_editorial_author,
    v_source.hierarchical_editorial_excerpt,
    v_source.hierarchical_headline_title_color,
    v_source.hierarchical_zone_1_title,
    v_source.hierarchical_zone_2_title,
    v_source.hierarchical_block_order,
    v_source.hierarchical_editorial_source_type,
    v_source.hierarchical_editorial_source_id,
    v_source.hierarchical_video_position
  );

  for v_item in
    select item_row.*
    from public.matchday_reference_composition_items as item_row
    where item_row.composition_id = p_composition_id
    order by item_row.id
  loop
    insert into public.matchday_reference_composition_items (
      id,
      composition_id,
      slot_type,
      source_type,
      source_id,
      article_id,
      sort_order,
      title_snapshot,
      subtitle_snapshot,
      image_url_snapshot,
      link_url_snapshot,
      label_snapshot,
      status,
      created_at,
      updated_at,
      label_color_snapshot,
      media_kind_snapshot,
      media_embed_url_snapshot,
      media_video_url_snapshot
    )
    values (
      pg_catalog.gen_random_uuid(),
      v_draft_id,
      v_item.slot_type,
      v_item.source_type,
      v_item.source_id,
      v_item.article_id,
      v_item.sort_order,
      v_item.title_snapshot,
      v_item.subtitle_snapshot,
      v_item.image_url_snapshot,
      v_item.link_url_snapshot,
      v_item.label_snapshot,
      v_item.status,
      v_now,
      v_now,
      v_item.label_color_snapshot,
      v_item.media_kind_snapshot,
      v_item.media_embed_url_snapshot,
      v_item.media_video_url_snapshot
    );
  end loop;

  for v_slot in
    select slot_row.*
    from public.matchday_hierarchical_composition_slots as slot_row
    where slot_row.composition_id = p_composition_id
    order by slot_row.id
  loop
    insert into public.matchday_hierarchical_composition_slots (
      id,
      composition_id,
      slot_key,
      bank_item_id,
      source_identity,
      label_snapshot,
      title_snapshot,
      subtitle_snapshot,
      image_url_snapshot,
      link_url_snapshot,
      created_at,
      updated_at,
      media_kind_snapshot,
      media_embed_url_snapshot,
      media_video_url_snapshot
    )
    values (
      pg_catalog.gen_random_uuid(),
      v_draft_id,
      v_slot.slot_key,
      v_slot.bank_item_id,
      v_slot.source_identity,
      v_slot.label_snapshot,
      v_slot.title_snapshot,
      v_slot.subtitle_snapshot,
      v_slot.image_url_snapshot,
      v_slot.link_url_snapshot,
      v_now,
      v_now,
      v_slot.media_kind_snapshot,
      v_slot.media_embed_url_snapshot,
      v_slot.media_video_url_snapshot
    );
  end loop;

  for v_zone in
    select zone_row.*
    from public.matchday_historical_composition_zones as zone_row
    where zone_row.composition_id = p_composition_id
    order by zone_row.sort_order, zone_row.id
  loop
    v_draft_zone_id := pg_catalog.gen_random_uuid();

    insert into public.matchday_historical_composition_zones (
      id,
      composition_id,
      sort_order,
      public_title,
      visual_family,
      created_at,
      updated_at
    )
    values (
      v_draft_zone_id,
      v_draft_id,
      v_zone.sort_order,
      v_zone.public_title,
      v_zone.visual_family,
      v_now,
      v_now
    );

    for v_zone_item in
      select zone_item_row.*
      from public.matchday_historical_composition_zone_items as zone_item_row
      where zone_item_row.composition_id = p_composition_id
        and zone_item_row.zone_id = v_zone.id
      order by zone_item_row.position, zone_item_row.id
    loop
      insert into public.matchday_historical_composition_zone_items (
        id,
        composition_id,
        zone_id,
        position,
        bank_item_id,
        source_identity,
        label_snapshot,
        title_snapshot,
        subtitle_snapshot,
        image_url_snapshot,
        link_url_snapshot,
        created_at,
        updated_at
      )
      values (
        pg_catalog.gen_random_uuid(),
        v_draft_id,
        v_draft_zone_id,
        v_zone_item.position,
        v_zone_item.bank_item_id,
        v_zone_item.source_identity,
        v_zone_item.label_snapshot,
        v_zone_item.title_snapshot,
        v_zone_item.subtitle_snapshot,
        v_zone_item.image_url_snapshot,
        v_zone_item.link_url_snapshot,
        v_now,
        v_now
      );
    end loop;
  end loop;

  return v_draft_id;
end;
$function$;

revoke all on function
  public.reopen_matchday_reference_composition(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.reopen_matchday_reference_composition(uuid, uuid)
to service_role;

comment on function
  public.reopen_matchday_reference_composition(uuid, uuid)
is
  'Clones the current published composition of a source retired by a coherent durable physical handoff into an independent draft. Archived physical source rows and the target current state are not retirement authorities.';

notify pgrst, 'reload schema';

commit;
