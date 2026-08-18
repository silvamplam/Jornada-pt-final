begin;

create or replace function public.build_matchday_live_carryover_snapshot(
  p_matchday_id uuid,
  p_source_composition_id uuid
)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select jsonb_build_object(
    'version', 2,
    'source_matchday_id', p_matchday_id,
    'source_composition_id', p_source_composition_id,

    'headline', coalesce(
      (
        select jsonb_build_object(
          'title', e.title,
          'summary', e.summary,
          'image_url', e.image_url,
          'link_url', e.headline_link_url
        )
        from public.matchday_editorials e
        where e.matchday_id = p_matchday_id
          and e.status = 'published'
        limit 1
      ),
      'null'::jsonb
    ),

    'side_block', coalesce(
      (
        select jsonb_build_object(
          'label', e.side_block_label,
          'label_color', e.side_block_label_color,
          'title', e.side_block_title,
          'title_color', e.side_block_title_color,
          'author', e.side_block_author,
          'text', e.side_block_text,
          'image_url', e.side_block_image_url,
          'link_url', e.side_block_link_url
        )
        from public.matchday_editorials e
        where e.matchday_id = p_matchday_id
          and e.side_block_status = 'published'
        limit 1
      ),
      'null'::jsonb
    ),

    'highlights', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', h.id,
            'sort_order', h.sort_order,
            'label', h.label,
            'label_color', h.label_color,
            'title', h.title,
            'subtitle', h.subtitle,
            'image_url', h.image_url,
            'link_url', h.link_url
          )
          order by h.sort_order, h.id
        )
        from public.matchday_highlights h
        where h.matchday_id = p_matchday_id
          and h.status = 'published'
      ),
      '[]'::jsonb
    ),

    'live_layout_items', coalesce(
      (
        select jsonb_agg(
          jsonb_build_object(
            'id', l.id,
            'matchday_id', p_matchday_id,
            'slot_type', l.slot_type,
            'article_id', null,
            'label', l.label,
            'title', l.title,
            'subtitle', l.subtitle,
            'image_url', l.image_url,
            'link_url', l.link_url,
            'created_at', l.created_at,
            'updated_at', l.updated_at
          )
          order by l.created_at, l.slot_type, l.id
        )
        from public.matchday_live_layout_items l
        where l.matchday_id = p_matchday_id
      ),
      '[]'::jsonb
    )
  );
$$;

revoke all
on function public.build_matchday_live_carryover_snapshot(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.build_matchday_live_carryover_snapshot(uuid, uuid)
to service_role;

create or replace function public.publish_matchday_reference_composition_with_continuity(
  p_matchday_id uuid,
  p_composition_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_matchday public.matchdays%rowtype;
  v_published_id uuid;
  v_next_matchday_id uuid;
  v_snapshot jsonb;
  v_now timestamptz := now();
  v_applied boolean := false;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions
    where id = p_composition_id
      and matchday_id = p_matchday_id
  ) then
    raise exception 'composition_not_found';
  end if;

  /*
   * A fotografia ? tirada ANTES da composi??o assumir a p?gina p?blica.
   * A origem ? exclusivamente a Mesa/p?gina viva da pr?pria Jornada.
   */
  v_snapshot :=
    public.build_matchday_live_carryover_snapshot(
      p_matchday_id,
      p_composition_id
    );

  v_published_id :=
    public.activate_matchday_reference_composition(
      p_matchday_id,
      p_composition_id,
      true
    );

  select *
  into v_matchday
  from public.matchdays
  where id = p_matchday_id;

  insert into public.matchday_editorial_desk_control (
    matchday_id,
    is_managed,
    faixa_visible,
    revision,
    carryover_source_composition_id,
    carryover_snapshot,
    updated_at
  )
  values (
    p_matchday_id,
    false,
    true,
    0,
    null,
    null,
    v_now
  )
  on conflict (matchday_id) do update set
    is_managed = false,
    carryover_source_composition_id = null,
    carryover_snapshot = null,
    updated_at = excluded.updated_at;

  select next_matchday.id
  into v_next_matchday_id
  from public.matchdays next_matchday
  where next_matchday.season_id = v_matchday.season_id
    and next_matchday.number > v_matchday.number
  order by next_matchday.number asc, next_matchday.id asc
  limit 1;

  if
    v_next_matchday_id is not null
    and not exists (
      select 1
      from public.matchday_reference_compositions next_composition
      where next_composition.matchday_id = v_next_matchday_id
        and next_composition.status = 'published'
        and next_composition.is_current = true
    )
  then
    insert into public.matchday_editorial_desk_control (
      matchday_id,
      is_managed,
      faixa_visible,
      revision,
      carryover_source_composition_id,
      carryover_snapshot,
      updated_at
    )
    values (
      v_next_matchday_id,
      true,
      true,
      0,
      v_published_id,
      v_snapshot,
      v_now
    )
    on conflict (matchday_id) do update set
      carryover_source_composition_id =
        excluded.carryover_source_composition_id,
      carryover_snapshot =
        excluded.carryover_snapshot,
      updated_at =
        excluded.updated_at
    where public.matchday_editorial_desk_control.is_managed = true
    returning true into v_applied;

    v_applied := coalesce(v_applied, false);
  end if;

  return jsonb_build_object(
    'publishedCompositionId', v_published_id,
    'sourceMatchdayId', p_matchday_id,
    'nextMatchdayId', v_next_matchday_id,
    'carryoverApplied', v_applied
  );
end;
$$;

revoke all
on function public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
from public, anon, authenticated;

grant execute
on function public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
to service_role;

/*
 * Corrige os carryovers j? criados pela primeira vers?o.
 * A composi??o serve apenas como prova da transi??o.
 * O conte?do visual volta a ser constru?do a partir da p?gina viva da origem.
 */
update public.matchday_editorial_desk_control c
set
  carryover_snapshot =
    public.build_matchday_live_carryover_snapshot(
      source_composition.matchday_id,
      source_composition.id
    ),
  updated_at = now()
from public.matchday_reference_compositions source_composition
where c.carryover_source_composition_id = source_composition.id
  and c.is_managed = true;

notify pgrst, 'reload schema';

commit;
