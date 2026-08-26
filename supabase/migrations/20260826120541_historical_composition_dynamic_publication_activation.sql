create or replace function public.activate_matchday_reference_composition(
  p_matchday_id uuid,
  p_composition_id uuid,
  p_publish_draft boolean default false
)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_target public.matchday_reference_compositions%rowtype;
  v_slot_count integer;
  v_complete_slot_count integer;
  v_beyond_count integer;
  v_complete_beyond_count integer;
  v_beyond_position_count integer;
  v_dynamic_zone_count integer;
  v_invalid_dynamic_zone_count integer;
  v_opening_count integer;
  v_complete_opening_count integer;
  v_now timestamptz := now();
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  perform 1
  from public.matchday_reference_compositions
  where matchday_id = p_matchday_id
  for update;

  select *
  into v_target
  from public.matchday_reference_compositions
  where id = p_composition_id
    and matchday_id = p_matchday_id
  for update;

  if v_target.id is null then
    raise exception 'composition_not_found';
  end if;

  if v_target.status = 'draft' then
    if not p_publish_draft then
      raise exception 'composition_not_published';
    end if;
  elsif v_target.status <> 'published' then
    raise exception 'composition_not_published';
  end if;

  if v_target.presentation_mode = 'hierarchical' then
    select count(*)
    into v_dynamic_zone_count
    from public.matchday_historical_composition_zones
    where composition_id = v_target.id;

    if v_dynamic_zone_count > 0 then
      if v_dynamic_zone_count > 24 then
        raise exception 'historical_dynamic_zones_incomplete';
      end if;

      select
        count(*) filter (
          where slot_key in (
            'dominant_main',
            'other_chronicle_1',
            'other_chronicle_2',
            'other_chronicle_3'
          )
        ),
        count(*) filter (
          where slot_key in (
            'dominant_main',
            'other_chronicle_1',
            'other_chronicle_2',
            'other_chronicle_3'
          )
            and nullif(btrim(label_snapshot), '') is not null
            and nullif(btrim(title_snapshot), '') is not null
            and nullif(btrim(subtitle_snapshot), '') is not null
            and nullif(btrim(image_url_snapshot), '') is not null
            and nullif(btrim(link_url_snapshot), '') is not null
        )
      into v_opening_count, v_complete_opening_count
      from public.matchday_hierarchical_composition_slots
      where composition_id = v_target.id;

      if v_opening_count <> 4 or v_complete_opening_count <> 4 then
        raise exception 'historical_dynamic_opening_incomplete';
      end if;

      with ordered_zones as (
        select
          z.id,
          z.sort_order,
          z.public_title,
          z.visual_family,
          row_number() over (
            order by z.sort_order, z.id
          )::integer as expected_order,
          case z.visual_family
            when 'six_news' then 6
            when 'five_news_balanced' then 5
            when 'five_news_secondary' then 5
            else null
          end as capacity
        from public.matchday_historical_composition_zones z
        where z.composition_id = v_target.id
      ),
      checked_zones as (
        select
          z.id,
          z.sort_order,
          z.public_title,
          z.visual_family,
          z.expected_order,
          z.capacity,
          count(i.id)::integer as item_count,
          count(i.id) filter (
            where nullif(btrim(i.label_snapshot), '') is not null
              and nullif(btrim(i.title_snapshot), '') is not null
              and nullif(btrim(i.subtitle_snapshot), '') is not null
              and nullif(btrim(i.image_url_snapshot), '') is not null
              and nullif(btrim(i.link_url_snapshot), '') is not null
          )::integer as complete_item_count,
          count(distinct i.position)::integer as position_count,
          min(i.position) as min_position,
          max(i.position) as max_position
        from ordered_zones z
        left join public.matchday_historical_composition_zone_items i
          on i.zone_id = z.id
         and i.composition_id = v_target.id
        group by
          z.id,
          z.sort_order,
          z.public_title,
          z.visual_family,
          z.expected_order,
          z.capacity
      )
      select count(*)
      into v_invalid_dynamic_zone_count
      from checked_zones
      where capacity is null
         or nullif(btrim(public_title), '') is null
         or char_length(public_title) > 120
         or sort_order <> expected_order
         or item_count <> capacity
         or complete_item_count <> capacity
         or position_count <> capacity
         or min_position <> 1
         or max_position <> capacity;

      if v_invalid_dynamic_zone_count <> 0 then
        raise exception 'historical_dynamic_zones_incomplete';
      end if;

      if v_target.hierarchical_video_position is null
         or v_target.hierarchical_video_position < 0
         or v_target.hierarchical_video_position > v_dynamic_zone_count then
        raise exception 'historical_dynamic_body_order_invalid';
      end if;

      if nullif(btrim(v_target.hierarchical_editorial_title), '') is null
         or nullif(btrim(v_target.hierarchical_editorial_excerpt), '') is null
         or nullif(btrim(v_target.hierarchical_editorial_text), '') is null
         or nullif(btrim(v_target.hierarchical_editorial_author), '') is null then
        raise exception 'historical_dynamic_editorial_incomplete';
      end if;
    else
      select count(*), count(*) filter (
        where nullif(btrim(label_snapshot), '') is not null
          and nullif(btrim(title_snapshot), '') is not null
          and nullif(btrim(subtitle_snapshot), '') is not null
          and (
            nullif(btrim(image_url_snapshot), '') is not null
            or (
              slot_key = 'dominant_main'
              and (
                (media_kind_snapshot = 'embed' and nullif(btrim(media_embed_url_snapshot), '') is not null)
                or (media_kind_snapshot = 'direct_video' and nullif(btrim(media_video_url_snapshot), '') is not null)
              )
            )
          )
      )
      into v_slot_count, v_complete_slot_count
      from public.matchday_hierarchical_composition_slots
      where composition_id = v_target.id;

      if v_slot_count <> 15 or v_complete_slot_count <> 15 then
        raise exception 'hierarchical_composition_incomplete';
      end if;

      select
        count(*),
        count(*) filter (
          where nullif(btrim(label_snapshot), '') is not null
            and nullif(btrim(title_snapshot), '') is not null
            and nullif(btrim(subtitle_snapshot), '') is not null
            and nullif(btrim(image_url_snapshot), '') is not null
            and nullif(btrim(link_url_snapshot), '') is not null
        ),
        count(distinct sort_order) filter (where sort_order between 1 and 5)
      into v_beyond_count, v_complete_beyond_count, v_beyond_position_count
      from public.matchday_reference_composition_items
      where composition_id = v_target.id
        and slot_type = 'beyond_matchday';

      if v_beyond_count <> 5
         or v_complete_beyond_count <> 5
         or v_beyond_position_count <> 5 then
        raise exception 'hierarchical_beyond_matchday_incomplete';
      end if;
    end if;
  end if;

  update public.matchday_reference_compositions
  set is_current = false,
      updated_at = v_now
  where matchday_id = p_matchday_id
    and is_current = true;

  update public.matchday_reference_compositions
  set status = case when status = 'draft' then 'published' else status end,
      is_current = true,
      published_at = case when status = 'draft' then v_now else published_at end,
      updated_at = v_now
  where id = v_target.id
    and matchday_id = p_matchday_id;

  return v_target.id;
end
$function$;
