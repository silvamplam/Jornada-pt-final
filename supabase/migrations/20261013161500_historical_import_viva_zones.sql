begin;

-- Deterministic identity for a Viva zone imported into one historical composition.
-- The same removed zone can be imported again without creating duplicate copies,
-- while different historical compositions never compete for the live zone UUID.
create function jornada_private.historical_viva_import_zone_id_v32(
  p_composition_id uuid,
  p_live_zone_id uuid
) returns uuid
language sql
immutable
strict
set search_path = ''
as $$
  select (
    substr(h, 1, 8) || '-' ||
    substr(h, 9, 4) || '-' ||
    '5' || substr(h, 14, 3) || '-' ||
    'a' || substr(h, 18, 3) || '-' ||
    substr(h, 21, 12)
  )::uuid
  from (
    select md5(p_composition_id::text || ':' || p_live_zone_id::text || ':jornada-viva-v32') as h
  ) value;
$$;

revoke all on function jornada_private.historical_viva_import_zone_id_v32(uuid,uuid)
  from public, anon, authenticated;
grant execute on function jornada_private.historical_viva_import_zone_id_v32(uuid,uuid)
  to service_role;

-- Explicitly appends the Viva zones that are still absent from an editable
-- historical composition. Existing historical zones are never replaced or
-- reordered. Five-column groups remain atomic editorial units.
create function public.import_historical_viva_zones_v32(
  p_matchday_id uuid,
  p_composition_id uuid,
  p_expected_column_groups jsonb
) returns table(imported_zone_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  unit record;
  z record;
  target_zone uuid;
  next_order integer;
  expected jsonb;
  v_imported integer := 0;
  unit_size integer;
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays
  where id = p_matchday_id
  for update;
  if not found then
    raise exception 'editorial-viva-import-matchday-not-found';
  end if;

  perform 1
  from public.matchday_reference_compositions
  where id = p_composition_id
    and matchday_id = p_matchday_id
    and status = 'draft'
    and presentation_mode = 'hierarchical'
  for update;
  if not found then
    raise exception 'editorial-viva-import-historical-not-editable';
  end if;

  if jsonb_typeof(p_expected_column_groups) is distinct from 'array' then
    raise exception 'editorial-column-group-payload-invalid';
  end if;

  select coalesce(jsonb_agg(value order by value->>'id'), '[]'::jsonb)
  into expected
  from jsonb_array_elements(p_expected_column_groups);

  if expected is distinct from jornada_private.historical_column_groups_json(p_composition_id) then
    raise exception 'editorial-column-group-concurrent-write';
  end if;

  select coalesce(max(sort_order), 0)
  into next_order
  from public.matchday_historical_composition_zones
  where composition_id = p_composition_id;

  -- One row per independent Viva zone or per five-column group anchor, always
  -- in Viva order. Non-anchor members are imported with their group below.
  for unit in
    select
      live_zone.id as live_zone_id,
      live_block.sort_order,
      member.group_id,
      member.member_position,
      column_group.public_title as group_public_title,
      column_group.is_enabled as group_enabled
    from public.matchday_live_layout_zones live_zone
    join public.matchday_live_layout_blocks live_block
      on live_block.matchday_id = live_zone.matchday_id
     and live_block.zone_id = live_zone.id
    left join public.matchday_live_layout_column_group_members member
      on member.matchday_id = live_zone.matchday_id
     and member.zone_id = live_zone.id
    left join public.matchday_live_layout_column_groups column_group
      on column_group.matchday_id = member.matchday_id
     and column_group.id = member.group_id
    where live_zone.matchday_id = p_matchday_id
      and (member.group_id is null or member.member_position = 1)
    order by live_block.sort_order
  loop
    if unit.group_id is not null then
      -- A group already present in the historical composition is already fully
      -- represented by the integrity constraints, so there is nothing to add.
      if exists (
        select 1
        from public.matchday_historical_column_groups existing_group
        where existing_group.composition_id = p_composition_id
          and existing_group.id = unit.group_id
      ) then
        continue;
      end if;

      -- Do not silently turn a partially copied set of five columns into a
      -- group. That would change existing historical structure unexpectedly.
      if exists (
        select 1
        from public.matchday_live_layout_column_group_members live_member
        join public.matchday_historical_composition_zones historical_zone
          on historical_zone.composition_id = p_composition_id
         and historical_zone.id in (
           live_member.zone_id,
           jornada_private.historical_viva_import_zone_id_v32(
             p_composition_id,
             live_member.zone_id
           )
         )
        where live_member.matchday_id = p_matchday_id
          and live_member.group_id = unit.group_id
      ) then
        raise exception 'editorial-viva-import-group-partial';
      end if;

      unit_size := 5;
    else
      target_zone := jornada_private.historical_viva_import_zone_id_v32(
        p_composition_id,
        unit.live_zone_id
      );

      -- Accept both the deterministic v32 identity and a legacy copy that kept
      -- the original Viva UUID. Either means this Viva zone is already here.
      if exists (
        select 1
        from public.matchday_historical_composition_zones historical_zone
        where historical_zone.composition_id = p_composition_id
          and historical_zone.id in (unit.live_zone_id, target_zone)
      ) then
        continue;
      end if;

      unit_size := 1;
    end if;

    if next_order + unit_size > 24 then
      raise exception 'editorial-viva-import-historical-capacity';
    end if;

    for z in
      select
        live_zone.*,
        member.member_position
      from public.matchday_live_layout_zones live_zone
      left join public.matchday_live_layout_column_group_members member
        on member.matchday_id = live_zone.matchday_id
       and member.zone_id = live_zone.id
      where live_zone.matchday_id = p_matchday_id
        and (
          (unit.group_id is null and live_zone.id = unit.live_zone_id)
          or
          (unit.group_id is not null and member.group_id = unit.group_id)
        )
      order by coalesce(member.member_position, 1)
    loop
      -- Preserve the no-duplicate-story rule already used by the previous
      -- group-only importer, across every placement family in the composition.
      if exists (
        select 1
        from public.matchday_live_layout_placements placement
        join public.matchday_editorial_bank_items bank_item
          on bank_item.id = placement.bank_item_id
        where placement.matchday_id = p_matchday_id
          and placement.zone_id = z.id
          and placement.placement_type = 'zone'
          and (
            exists (
              select 1
              from public.matchday_historical_composition_zone_items item
              where item.composition_id = p_composition_id
                and (
                  item.bank_item_id = placement.bank_item_id
                  or lower(btrim(item.source_identity)) = lower(bank_item.source_type || ':' || bank_item.source_id)
                )
            )
            or exists (
              select 1
              from public.matchday_hierarchical_composition_slots slot
              where slot.composition_id = p_composition_id
                and (
                  slot.bank_item_id = placement.bank_item_id
                  or lower(btrim(slot.source_identity)) = lower(bank_item.source_type || ':' || bank_item.source_id)
                )
            )
            or exists (
              select 1
              from public.matchday_reference_composition_items item
              where item.composition_id = p_composition_id
                and (
                  (item.source_type = 'matchday_editorial_bank_item' and item.source_id = placement.bank_item_id)
                  or (item.source_type = bank_item.source_type and item.source_id::text = bank_item.source_id)
                )
            )
            or exists (
              select 1
              from public.matchday_reference_compositions composition
              where composition.id = p_composition_id
                and composition.hierarchical_editorial_source_type = bank_item.source_type
                and composition.hierarchical_editorial_source_id::text = bank_item.source_id
            )
          )
      ) then
        raise exception 'editorial-viva-import-story-already-used';
      end if;

      target_zone := jornada_private.historical_viva_import_zone_id_v32(
        p_composition_id,
        z.id
      );
      next_order := next_order + 1;

      insert into public.matchday_historical_composition_zones(
        id,
        composition_id,
        sort_order,
        public_title,
        public_title_color,
        visual_family
      ) values (
        target_zone,
        p_composition_id,
        next_order,
        z.public_title,
        z.public_title_color,
        z.visual_family
      );

      if unit.group_id is not null and z.member_position = 1 then
        insert into public.matchday_historical_column_groups(
          composition_id,
          id,
          public_title,
          is_enabled,
          anchor_zone_id
        ) values (
          p_composition_id,
          unit.group_id,
          unit.group_public_title,
          unit.group_enabled,
          target_zone
        );
      end if;

      if unit.group_id is not null then
        insert into public.matchday_historical_column_group_members(
          composition_id,
          group_id,
          zone_id,
          member_position
        ) values (
          p_composition_id,
          unit.group_id,
          target_zone,
          z.member_position
        );
      end if;

      insert into public.matchday_historical_composition_zone_items(
        composition_id,
        zone_id,
        position,
        bank_item_id,
        source_identity,
        label_snapshot,
        title_snapshot,
        subtitle_snapshot,
        image_url_snapshot,
        link_url_snapshot
      )
      select
        p_composition_id,
        target_zone,
        placement.slot_position,
        bank_item.id,
        bank_item.source_type || ':' || bank_item.source_id,
        bank_item.label,
        bank_item.title,
        bank_item.subtitle,
        bank_item.image_url,
        bank_item.link_url
      from public.matchday_live_layout_placements placement
      join public.matchday_editorial_bank_items bank_item
        on bank_item.id = placement.bank_item_id
      where placement.matchday_id = p_matchday_id
        and placement.zone_id = z.id
        and placement.placement_type = 'zone';

      v_imported := v_imported + 1;
    end loop;
  end loop;

  perform jornada_private.assert_historical_column_groups(p_composition_id);
  return query select v_imported;
end $$;

revoke all on function public.import_historical_viva_zones_v32(uuid,uuid,jsonb)
  from public, anon, authenticated;
grant execute on function public.import_historical_viva_zones_v32(uuid,uuid,jsonb)
  to service_role;

comment on function public.import_historical_viva_zones_v32(uuid,uuid,jsonb)
  is 'Append only the Viva zones still absent from an editable hierarchical historical composition; grouped columns remain atomic and existing historical structure is preserved.';

commit;
