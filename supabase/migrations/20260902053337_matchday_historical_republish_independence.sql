begin;

-- ============================================================
-- LOTE 6 / CORRECAO FINAL - HISTORICO INDEPENDENTE
--
-- A transition v6 e o certificado duravel da unica transferencia live.
-- Depois dessa transferencia, a composicao historica volta a poder abrir,
-- guardar e publicar sem escrever em qualquer superficie de N+1.
-- ============================================================

-- A Activation congelou por engano a linha publicada e todos os seus filhos.
-- A correcao e forward-only: a migration aplicada permanece byte-identica.
drop trigger if exists
  matchday_reference_compositions_published_immutable
on public.matchday_reference_compositions;

drop trigger if exists
  matchday_reference_composition_items_published_immutable
on public.matchday_reference_composition_items;

drop trigger if exists
  matchday_hierarchical_composition_slots_published_immutable
on public.matchday_hierarchical_composition_slots;

drop trigger if exists
  matchday_historical_composition_zones_published_immutable
on public.matchday_historical_composition_zones;

drop trigger if exists
  matchday_historical_composition_zone_items_published_immutable
on public.matchday_historical_composition_zone_items;

drop function if exists
  jornada_private.guard_published_reference_composition();

drop function if exists
  jornada_private.guard_published_reference_composition_child();

-- Reabrir nao retira a versao publica. O current publicado e copiado para a
-- estrutura draft ja existente; nenhuma tabela live e consultada como origem.
create function public.reopen_matchday_reference_composition(
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
  v_target_matchday_id uuid;
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

  select transition_row.target_matchday_id
  into v_target_matchday_id
  from public.matchday_editorial_continuity_transitions as transition_row
  join public.matchdays as source_matchday
    on source_matchday.id = transition_row.source_matchday_id
  join public.matchdays as target_matchday
    on target_matchday.id = transition_row.target_matchday_id
   and target_matchday.season_id = source_matchday.season_id
   and target_matchday.number = source_matchday.number + 1
  where transition_row.source_matchday_id = p_matchday_id
    and transition_row.continuity_version = 6
  for key share of transition_row;

  if not found then
    raise exception 'composition_historical_transition_v6_not_found';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_cutover_control as control_row
    where control_row.scope = 'live_layout'
      and control_row.authority_mode = 'authoritative'
  ) then
    raise exception 'composition_historical_authority_not_active';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = p_matchday_id
      and source_desk.is_managed = false
  ) or exists (
    select 1
    from public.matchday_live_layout_placements as source_placement
    where source_placement.matchday_id = p_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as source_memory
    where source_memory.matchday_id = p_matchday_id
  ) then
    raise exception 'composition_historical_source_not_retired';
  end if;

  -- Repetir a acao de abrir e idempotente enquanto o mesmo draft existir.
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
from public, anon, authenticated;
grant execute on function
  public.reopen_matchday_reference_composition(uuid, uuid)
to service_role;

comment on function
  public.reopen_matchday_reference_composition(uuid, uuid)
is
  'Clones the current public historical composition into an independent draft after a valid v6 transition; the public composition and every live surface remain unchanged.';

-- Fronteira unica de publicacao. A decisao nao depende de status=published:
-- transition v6 + source retirada significa republicacao historica; sem
-- transition e source live significa a primeira publicacao com continuidade.
create function public.publish_matchday_reference_composition(
  p_matchday_id uuid,
  p_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_source_number integer;
  v_next_matchday_id uuid;
  v_source_is_managed boolean;
  v_transition public.matchday_editorial_continuity_transitions%rowtype;
  v_has_transition boolean := false;
  v_transition_before jsonb;
  v_transition_after jsonb;
  v_published_id uuid;
  v_first_publication jsonb;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  select matchday_row.season_id, matchday_row.number
  into v_source_season_id, v_source_number
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id;

  if not found then
    raise exception 'composition_matchday_not_found';
  end if;

  select target_row.id
  into v_next_matchday_id
  from public.matchdays as target_row
  where target_row.season_id = v_source_season_id
    and target_row.number = v_source_number + 1;

  perform 1
  from public.matchdays as lock_row
  where lock_row.id = p_matchday_id
     or lock_row.id = v_next_matchday_id
  order by lock_row.id
  for update;

  select transition_row.*
  into v_transition
  from public.matchday_editorial_continuity_transitions as transition_row
  where transition_row.source_matchday_id = p_matchday_id
  for key share;

  v_has_transition := found;

  select source_desk.is_managed
  into v_source_is_managed
  from public.matchday_editorial_desk_control as source_desk
  where source_desk.matchday_id = p_matchday_id
  for update;

  if not found then
    raise exception 'composition_source_matchday_control_missing';
  end if;

  if v_has_transition then
    if v_transition.continuity_version <> 6
      or v_next_matchday_id is null
      or v_transition.target_matchday_id <> v_next_matchday_id
    then
      raise exception 'composition_historical_transition_v6_invalid';
    end if;

    if v_source_is_managed then
      raise exception 'composition_historical_source_still_live';
    end if;

    if not exists (
      select 1
      from jornada_private.matchday_live_layout_cutover_control as control_row
      where control_row.scope = 'live_layout'
        and control_row.authority_mode = 'authoritative'
    ) then
      raise exception 'composition_historical_authority_not_active';
    end if;

    if exists (
      select 1
      from public.matchday_live_layout_placements as source_placement
      where source_placement.matchday_id = p_matchday_id
    ) or exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as source_memory
      where source_memory.matchday_id = p_matchday_id
    ) then
      raise exception 'composition_historical_source_not_retired';
    end if;

    v_transition_before := pg_catalog.to_jsonb(v_transition);

    v_published_id := public.activate_matchday_reference_composition(
      p_matchday_id,
      p_composition_id,
      true
    );

    select pg_catalog.to_jsonb(transition_row)
    into v_transition_after
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_matchday_id;

    if v_transition_after is distinct from v_transition_before then
      raise exception 'composition_historical_transition_changed';
    end if;

    if exists (
      select 1
      from public.matchday_editorial_desk_control as source_desk
      where source_desk.matchday_id = p_matchday_id
        and source_desk.is_managed = true
    ) or exists (
      select 1
      from public.matchday_live_layout_placements as source_placement
      where source_placement.matchday_id = p_matchday_id
    ) or exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as source_memory
      where source_memory.matchday_id = p_matchday_id
    ) then
      raise exception 'composition_historical_republish_postcondition_failed';
    end if;

    return pg_catalog.jsonb_build_object(
      'publicationKind', 'historical_republish',
      'publishedCompositionId', v_published_id,
      'sourceMatchdayId', p_matchday_id,
      'nextMatchdayId', v_transition.target_matchday_id,
      'carryoverApplied', false,
      'materialized', false,
      'sourceRetired', true,
      'transitionPreserved', true
    );
  end if;

  if not v_source_is_managed then
    raise exception 'composition_first_publication_source_not_live';
  end if;

  v_first_publication :=
    public.publish_matchday_reference_composition_with_continuity(
      p_matchday_id,
      p_composition_id
    );

  return v_first_publication || pg_catalog.jsonb_build_object(
    'publicationKind', 'first_publication'
  );
end;
$function$;

revoke all on function
  public.publish_matchday_reference_composition(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_matchday_reference_composition(uuid, uuid)
to service_role;

comment on function
  public.publish_matchday_reference_composition(uuid, uuid)
is
  'Dispatches atomically between first live publication with v6 continuity and later historical-only republication certified by the existing v6 transition.';

notify pgrst, 'reload schema';

commit;
