begin;

alter table public.matchday_editorial_desk_control
  add column if not exists carryover_source_composition_id uuid
    references public.matchday_reference_compositions(id)
    on delete set null,
  add column if not exists carryover_snapshot jsonb;

alter table public.matchday_editorial_desk_control
  drop constraint if exists matchday_editorial_desk_control_carryover_snapshot_check;

alter table public.matchday_editorial_desk_control
  add constraint matchday_editorial_desk_control_carryover_snapshot_check
  check (
    carryover_snapshot is null
    or jsonb_typeof(carryover_snapshot) = 'object'
  );

create index if not exists matchday_editorial_desk_control_carryover_idx
on public.matchday_editorial_desk_control (carryover_source_composition_id)
where carryover_source_composition_id is not null;

comment on column public.matchday_editorial_desk_control.carryover_source_composition_id is
  'Composi??o publicada da Jornada imediatamente anterior que originou o fundo visual tempor?rio.';

comment on column public.matchday_editorial_desk_control.carryover_snapshot is
  'Snapshot visual congelado, n?o recursivo e sem transfer?ncia de propriedade editorial.';

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
  v_source public.matchday_reference_compositions%rowtype;
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

  select *
  into v_source
  from public.matchday_reference_compositions
  where id = p_composition_id
    and matchday_id = p_matchday_id
  for update;

  if v_source.id is null then
    raise exception 'composition_not_found';
  end if;

  v_published_id := public.activate_matchday_reference_composition(
    p_matchday_id,
    p_composition_id,
    true
  );

  select *
  into v_source
  from public.matchday_reference_compositions
  where id = v_published_id;

  select *
  into v_matchday
  from public.matchdays
  where id = p_matchday_id;

  -- A Jornada acabada deixa imediatamente de usar a Mesa viva.
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

  if v_source.presentation_mode = 'hierarchical' then
    -- Snapshot exclusivamente da composi??o publicada real.
    -- Nunca l? carryover da pr?pria Jornada, impedindo heran?a recursiva.
    select jsonb_build_object(
      'version', 1,
      'source_matchday_id', p_matchday_id,
      'source_composition_id', v_published_id,

      'editorial', jsonb_build_object(
        'title', v_source.hierarchical_editorial_title,
        'text', v_source.hierarchical_editorial_text,
        'author', v_source.hierarchical_editorial_author
      ),

      'slots', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', slot_row.id,
              'composition_id', v_published_id,
              'slot_key', slot_row.slot_key,
              'bank_item_id', null,
              'source_identity', 'carryover:' || slot_row.slot_key,
              'label_snapshot', slot_row.label_snapshot,
              'title_snapshot', slot_row.title_snapshot,
              'subtitle_snapshot', slot_row.subtitle_snapshot,
              'image_url_snapshot', slot_row.image_url_snapshot,
              'link_url_snapshot', slot_row.link_url_snapshot,
              'media_kind_snapshot', slot_row.media_kind_snapshot,
              'media_embed_url_snapshot', slot_row.media_embed_url_snapshot,
              'media_video_url_snapshot', slot_row.media_video_url_snapshot,
              'created_at', slot_row.created_at,
              'updated_at', slot_row.updated_at
            )
            order by slot_row.slot_key
          )
          from public.matchday_hierarchical_composition_slots as slot_row
          where slot_row.composition_id = v_published_id
        ),
        '[]'::jsonb
      ),

      'beyond_matchday', coalesce(
        (
          select jsonb_agg(
            jsonb_build_object(
              'id', item_row.id,
              'composition_id', v_published_id,
              'slot_type', 'beyond_matchday',
              'source_type', null,
              'source_id', null,
              'article_id', null,
              'sort_order', item_row.sort_order,
              'title_snapshot', item_row.title_snapshot,
              'subtitle_snapshot', item_row.subtitle_snapshot,
              'image_url_snapshot', item_row.image_url_snapshot,
              'link_url_snapshot', item_row.link_url_snapshot,
              'label_snapshot', item_row.label_snapshot,
              'label_color_snapshot', item_row.label_color_snapshot,
              'status', 'published'
            )
            order by item_row.sort_order
          )
          from public.matchday_reference_composition_items as item_row
          where item_row.composition_id = v_published_id
            and item_row.slot_type = 'beyond_matchday'
        ),
        '[]'::jsonb
      )
    )
    into v_snapshot;

    select next_matchday.id
    into v_next_matchday_id
    from public.matchdays as next_matchday
    where next_matchday.season_id = v_matchday.season_id
      and next_matchday.number > v_matchday.number
    order by next_matchday.number asc, next_matchday.id asc
    limit 1;

    if
      v_next_matchday_id is not null
      and not exists (
        select 1
        from public.matchday_reference_compositions as next_composition
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

comment on function public.publish_matchday_reference_composition_with_continuity(uuid, uuid) is
  'Publica a Jornada, encerra a respetiva Mesa e entrega ? Jornada seguinte apenas uma apresenta??o visual congelada.';

notify pgrst, 'reload schema';

commit;
