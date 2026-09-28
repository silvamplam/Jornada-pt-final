-- Independent five-slot columns; only this family publishes partial zones.
-- Title colour is zone state. No persistent run/group model is introduced.
-- Existing function OIDs, ACLs, SECURITY and search_path are retained.
begin;

alter table public.matchday_live_layout_zones add column public_title_color text;
alter table public.matchday_historical_composition_zones add column public_title_color text;
alter table public.matchday_live_layout_zones add constraint matchday_live_layout_zones_title_color_check
  check (public_title_color is null or public_title_color ~ '^#[0-9A-F]{6}$');
alter table public.matchday_historical_composition_zones add constraint matchday_historical_composition_zones_title_color_check
  check (public_title_color is null or public_title_color ~ '^#[0-9A-F]{6}$');

create function jornada_private.normalize_editorial_zone_title_color(p_color text)
returns text language plpgsql immutable parallel safe set search_path = '' as $function$
begin
  if p_color is not null and p_color !~* '^#[0-9a-f]{6}$' then
    raise exception 'editorial-zone-title-color-invalid';
  end if;
  return pg_catalog.upper(p_color);
end;
$function$;
revoke all on function jornada_private.normalize_editorial_zone_title_color(text) from public, anon, authenticated, service_role;

create function jornada_private.normalize_editorial_zone_title_color_row()
returns trigger language plpgsql set search_path = '' as $function$
begin
  new.public_title_color := jornada_private.normalize_editorial_zone_title_color(new.public_title_color);
  return new;
end;
$function$;
revoke all on function jornada_private.normalize_editorial_zone_title_color_row() from public, anon, authenticated, service_role;
create trigger normalize_zone_title_color before insert or update of public_title_color
  on public.matchday_live_layout_zones for each row
  execute function jornada_private.normalize_editorial_zone_title_color_row();
create trigger normalize_zone_title_color before insert or update of public_title_color
  on public.matchday_historical_composition_zones for each row
  execute function jornada_private.normalize_editorial_zone_title_color_row();

-- Versioned return type avoids dropping the legacy normalizer or its dependencies.
create function jornada_private.normalize_matchday_live_layout_zones_v30(p_zones jsonb)
returns table(operation_order bigint, zone_id uuid, public_title text, visual_family text, public_title_color text)
language sql immutable set search_path = '' as $function$
  select normalized.*,
    jornada_private.normalize_editorial_zone_title_color(raw_row.payload ->> 'public_title_color')
  from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones) as normalized
  join pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(p_zones) = 'array' then p_zones else '[]'::jsonb end
  ) with ordinality as raw_row(payload, ordinality)
    on raw_row.ordinality = normalized.operation_order;
$function$;
revoke all on function jornada_private.normalize_matchday_live_layout_zones_v30(jsonb) from public, anon, authenticated, service_role;

-- SQL counterpart of editorial-visual-families.canHostLatest.
create function jornada_private.matchday_live_layout_can_host_latest(p_family text)
returns boolean language sql immutable parallel safe set search_path = '' as $function$
  select jornada_private.matchday_live_layout_layout_capacity_v20(p_family) is not null
    and coalesce(p_family <> 'five_news_column', false);
$function$;
revoke all on function jornada_private.matchday_live_layout_can_host_latest(text) from public, anon, authenticated, service_role;

alter table public.matchday_historical_composition_zones
  drop constraint matchday_historical_composition_zones_visual_family_check,
  add constraint matchday_historical_composition_zones_visual_family_check
    check (visual_family in ('six_news', 'six_news_1_2_3', 'five_news_balanced', 'five_news_secondary', 'five_news_column'));
-- The historical item position BETWEEN 1 AND 6 constraint intentionally remains unchanged.
alter table public.matchday_editorial_profile_reconcile_control
  drop constraint matchday_editorial_profile_reconcile_control_zone_layouts_check,
  add constraint matchday_editorial_profile_reconcile_control_zone_layouts_check check (
    pg_catalog.jsonb_typeof(thematic_zone_layouts) = 'object'
    and thematic_zone_layouts ?& array['benfica', 'sporting', 'fc_porto', 'other_liga_clubs', 'outside_liga_other']
    and thematic_zone_layouts - array['benfica', 'sporting', 'fc_porto', 'other_liga_clubs', 'outside_liga_other'] = '{}'::jsonb
    and thematic_zone_layouts ->> 'benfica' in ('six_news', 'six_news_1_2_3', 'five_news_balanced', 'five_news_secondary', 'four_news', 'five_news_column')
    and thematic_zone_layouts ->> 'sporting' in ('six_news', 'six_news_1_2_3', 'five_news_balanced', 'five_news_secondary', 'four_news', 'five_news_column')
    and thematic_zone_layouts ->> 'fc_porto' in ('six_news', 'six_news_1_2_3', 'five_news_balanced', 'five_news_secondary', 'four_news', 'five_news_column')
    and thematic_zone_layouts ->> 'other_liga_clubs' in ('six_news', 'six_news_1_2_3', 'five_news_balanced', 'five_news_secondary', 'four_news', 'five_news_column')
    and thematic_zone_layouts ->> 'outside_liga_other' in ('six_news', 'six_news_1_2_3', 'five_news_balanced', 'five_news_secondary', 'four_news', 'five_news_column')
  );

-- Bounded source edits fail closed if an upstream definition has drifted.
-- The null-colour branches preserve already issued archive/carryover hashes.
do $migration$
declare
  change record;
  definition text;
  occurrences integer;
begin
  for change in select * from (values
    ('jornada_private.matchday_live_layout_layout_capacity_v20(text)', 1,
     $before_0$    when 'six_news_1_2_3' then 6$before_0$,
     $after_0$    when 'six_news_1_2_3' then 6
    when 'five_news_column' then 5$after_0$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_1$) <> 3$before_1$,
     $after_1$) <> case when raw_row.payload ? 'public_title_color' then 4 else 3 end$after_1$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_2$) <> 3$before_2$,
     $after_2$) <> case when raw_row.payload ? 'public_title_color' then 4 else 3 end$after_2$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 16,
     $before_3$jornada_private.normalize_matchday_live_layout_zones_v14($before_3$,
     $after_3$jornada_private.normalize_matchday_live_layout_zones_v30($after_3$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_4$    public_title,
    visual_family
$before_4$,
     $after_4$    public_title,
    public_title_color,
    visual_family
$after_4$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_5$    desired_row.public_title,
    desired_row.visual_family
$before_5$,
     $after_5$    desired_row.public_title,
    desired_row.public_title_color,
    desired_row.visual_family
$after_5$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_6$  set public_title = desired_row.public_title,$before_6$,
     $after_6$  set public_title = desired_row.public_title,
      public_title_color = desired_row.public_title_color,$after_6$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_7$      zone_row.public_title,
      zone_row.visual_family$before_7$,
     $after_7$      zone_row.public_title,
      zone_row.public_title_color,
      zone_row.visual_family$after_7$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_8$      desired_row.public_title,
      desired_row.visual_family$before_8$,
     $after_8$      desired_row.public_title,
      desired_row.public_title_color,
      desired_row.visual_family$after_8$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_9$select desired_row.zone_id as id, desired_row.public_title,
             desired_row.visual_family$before_9$,
     $after_9$select desired_row.zone_id as id, desired_row.public_title,
             desired_row.public_title_color, desired_row.visual_family$after_9$),
    ('jornada_private.apply_matchday_live_layout_physical_workspace_v20_core_impl(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_10$select zone_row.id, zone_row.public_title, zone_row.visual_family$before_10$,
     $after_10$select zone_row.id, zone_row.public_title, zone_row.public_title_color, zone_row.visual_family$after_10$),
    ('jornada_private.read_live_layout_workspace_v13_pre_facade(uuid,text)', 1,
     $before_11$'public_title', zone_row.public_title,$before_11$,
     $after_11$'public_title', zone_row.public_title,
            'public_title_color', zone_row.public_title_color,$after_11$),
    ('public.matchday_editorial_profile_workspace_token_v13(uuid,text)', 1,
     $before_12$'public_title', zone_row.public_title,$before_12$,
     $after_12$'public_title', zone_row.public_title,
            'public_title_color', zone_row.public_title_color,$after_12$),
    ('public.apply_matchday_live_layout_physical_v22(uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)', 1,
     $before_13$  delete from public.matchday_live_layout_latest_companion$before_13$,
     $after_13$  -- Check the requested FINAL family and destination before any mutation.
  if p_latest_companion_zone_id is not null and exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones) as zone_row
    where zone_row.zone_id = p_latest_companion_zone_id
      and not jornada_private.matchday_live_layout_can_host_latest(zone_row.visual_family)
  ) then
    raise exception 'matchday-live-layout-latest-companion-v22-host-ineligible';
  end if;

  delete from public.matchday_live_layout_latest_companion$after_13$),
    ('jornada_private.materialize_matchday_live_layout_physical_topology_v17_impl(uuid,uuid)', 1,
     $before_14$(id,matchday_id,public_title,visual_family)
  select zone_map.target_zone_id,p_target_matchday_id,source_zone.public_title,source_zone.visual_family$before_14$,
     $after_14$(id,matchday_id,public_title,public_title_color,visual_family)
  select zone_map.target_zone_id,p_target_matchday_id,source_zone.public_title,source_zone.public_title_color,source_zone.visual_family$after_14$),
    ('jornada_private.materialize_matchday_live_layout_physical_topology_v17_impl(uuid,uuid)', 1,
     $before_15$row(source_zone.public_title,source_zone.visual_family)$before_15$,
     $after_15$row(source_zone.public_title,source_zone.public_title_color,source_zone.visual_family)$after_15$),
    ('jornada_private.materialize_matchday_live_layout_physical_topology_v17_impl(uuid,uuid)', 1,
     $before_16$row(target_zone.public_title,target_zone.visual_family)$before_16$,
     $after_16$row(target_zone.public_title,target_zone.public_title_color,target_zone.visual_family)$after_16$),
    ('jornada_private.assert_matchday_live_layout_physical_carryover_v18(uuid,uuid,uuid,uuid,text)', 1,
     $before_17$target_zone.public_title is distinct from source_zone.public_title$before_17$,
     $after_17$target_zone.public_title is distinct from source_zone.public_title
        or target_zone.public_title_color is distinct from source_zone.public_title_color$after_17$),
    ('jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(uuid,uuid,uuid,uuid,uuid)', 1,
     $before_18$target_zone.public_title is distinct from source_zone.public_title$before_18$,
     $after_18$target_zone.public_title is distinct from source_zone.public_title
        or target_zone.public_title_color is distinct from source_zone.public_title_color$after_18$),
    ('jornada_private.matchday_historical_physical_archive_components_v20(uuid)', 1,
     $before_19$'visual_family', zone_row.visual_family
        ) order by zone_row.id$before_19$,
     $after_19$'visual_family', zone_row.visual_family
        ) || case when zone_row.public_title_color is null then '{}'::jsonb
          else pg_catalog.jsonb_build_object('public_title_color', zone_row.public_title_color) end
        order by zone_row.id$after_19$),
    ('jornada_private.matchday_live_layout_carryover_source_hash_v18(uuid)', 1,
     $before_20$pg_catalog.to_jsonb(zone_row)$before_20$,
     $after_20$(pg_catalog.to_jsonb(zone_row) - 'public_title_color'
        || case when zone_row.public_title_color is null then '{}'::jsonb
          else pg_catalog.jsonb_build_object('public_title_color', zone_row.public_title_color) end)$after_20$),
    ('jornada_private.matchday_live_layout_physical_archive_hash_v19(uuid)', 1,
     $before_21$pg_catalog.jsonb_agg(pg_catalog.to_jsonb(row_value)
        order by row_value.id)
      from public.matchday_live_layout_zones$before_21$,
     $after_21$pg_catalog.jsonb_agg((pg_catalog.to_jsonb(row_value) - 'public_title_color'
        || case when row_value.public_title_color is null then '{}'::jsonb
          else pg_catalog.jsonb_build_object('public_title_color', row_value.public_title_color) end)
        order by row_value.id)
      from public.matchday_live_layout_zones$after_21$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)', 1,
     $before_22$         'six_news', 'six_news_1_2_3',$before_22$,
     $after_22$         'six_news', 'six_news_1_2_3', 'five_news_column',$after_22$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)', 1,
     $before_23$       or pg_catalog.char_length(zone.value ->> 'publicTitle') > 120$before_23$,
     $after_23$       or pg_catalog.char_length(zone.value ->> 'publicTitle') > 120
       or (zone.value -> 'publicTitleColor' is not null
         and zone.value -> 'publicTitleColor' <> 'null'::jsonb
         and (pg_catalog.jsonb_typeof(zone.value -> 'publicTitleColor') <> 'string'
           or (zone.value ->> 'publicTitleColor') !~* '^#[0-9a-f]{6}$'))$after_23$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)', 1,
     $before_24$      public_title,
      visual_family$before_24$,
     $after_24$      public_title,
      public_title_color,
      visual_family$after_24$),
    ('public.replace_historical_composition_dynamic_zones(uuid,uuid,jsonb)', 1,
     $before_25$      v_title,
      v_family$before_25$,
     $after_25$      v_title,
      jornada_private.normalize_editorial_zone_title_color(v_zone ->> 'publicTitleColor'),
      v_family$after_25$),
    ('public.activate_matchday_reference_composition(uuid,uuid,boolean)', 1,
     $before_26$            when 'five_news_secondary' then 5$before_26$,
     $after_26$            when 'five_news_secondary' then 5
            when 'five_news_column' then 5$after_26$),
    ('public.activate_matchday_reference_composition(uuid,uuid,boolean)', 1,
     $before_27$         or item_count <> capacity
         or complete_item_count <> capacity
         or position_count <> capacity
         or min_position <> 1
         or max_position <> capacity;$before_27$,
     $after_27$         or case when visual_family = 'five_news_column' then
           item_count > capacity
           or complete_item_count <> item_count
           or position_count <> item_count
           or (item_count > 0 and (min_position < 1 or max_position > capacity))
         else
           item_count <> capacity
           or complete_item_count <> capacity
           or position_count <> capacity
           or min_position <> 1
           or max_position <> capacity
         end;$after_27$),
    ('public.reopen_matchday_reference_composition(uuid,uuid)', 1,
     $before_28$      public_title,
      visual_family,$before_28$,
     $after_28$      public_title,
      public_title_color,
      visual_family,$after_28$),
    ('public.reopen_matchday_reference_composition(uuid,uuid)', 1,
     $before_29$      v_zone.public_title,
      v_zone.visual_family,$before_29$,
     $after_29$      v_zone.public_title,
      v_zone.public_title_color,
      v_zone.visual_family,$after_29$)
  ) as changes(signature, expected_occurrences, before_text, after_text)
  loop
    select pg_catalog.pg_get_functiondef(change.signature::regprocedure) into definition;
    occurrences := (pg_catalog.length(definition) - pg_catalog.length(
      pg_catalog.replace(definition, change.before_text, '')
    )) / pg_catalog.length(change.before_text);
    if occurrences <> change.expected_occurrences then
      raise exception 'five-news-column-migration-source-drift: % (expected %, found %)',
        change.signature, change.expected_occurrences, occurrences;
    end if;
    execute pg_catalog.replace(definition, change.before_text, change.after_text);
  end loop;
end;
$migration$;

commit;
