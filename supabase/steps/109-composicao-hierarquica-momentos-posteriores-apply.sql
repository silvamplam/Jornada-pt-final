begin;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.matchday_reference_composition_items'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%slot_type%'
  loop
    execute format(
      'alter table public.matchday_reference_composition_items drop constraint %I',
      constraint_name
    );
  end loop;

  alter table public.matchday_reference_composition_items
    add constraint matchday_reference_composition_items_slot_type_check
    check (
      slot_type in (
        'headline',
        'side_block',
        'complement',
        'highlight',
        'editorial_line_item',
        'related_article',
        'roundup',
        'custom_card',
        'important_item',
        'beyond_matchday'
      )
    );

  for constraint_name in
    select constraint_row.conname
    from pg_constraint constraint_row
    where constraint_row.conrelid = 'public.matchday_reference_composition_items'::regclass
      and constraint_row.contype = 'c'
      and pg_get_constraintdef(constraint_row.oid) ilike '%source_type%'
  loop
    execute format(
      'alter table public.matchday_reference_composition_items drop constraint %I',
      constraint_name
    );
  end loop;

  alter table public.matchday_reference_composition_items
    add constraint matchday_reference_composition_items_source_type_check
    check (
      source_type in (
        'matchday_editorial',
        'matchday_editorial_headline',
        'matchday_editorial_complement',
        'matchday_editorial_side_block',
        'matchday_highlight',
        'matchday_latest_news',
        'matchday_roundup_item',
        'matchday_horizontal_news',
        'matchday_reference_composition_item',
        'matchday_editorial_bank_item',
        'article',
        'editorial_article',
        'editorial_content',
        'manual_link'
      )
    );
end
$$;

alter table public.matchday_reference_composition_items
  drop constraint if exists matchday_reference_composition_items_beyond_position_check;

alter table public.matchday_reference_composition_items
  add constraint matchday_reference_composition_items_beyond_position_check
  check (slot_type <> 'beyond_matchday' or sort_order between 1 and 5);

create unique index if not exists matchday_reference_composition_beyond_position_unique_idx
on public.matchday_reference_composition_items (composition_id, sort_order)
where slot_type = 'beyond_matchday';

create or replace function public.activate_matchday_reference_composition(
  p_matchday_id uuid,
  p_composition_id uuid,
  p_publish_draft boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_target public.matchday_reference_compositions%rowtype;
  v_slot_count integer;
  v_complete_slot_count integer;
  v_beyond_count integer;
  v_complete_beyond_count integer;
  v_beyond_position_count integer;
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
    select count(*), count(*) filter (
      where nullif(btrim(label_snapshot), '') is not null
        and nullif(btrim(title_snapshot), '') is not null
        and nullif(btrim(subtitle_snapshot), '') is not null
        and nullif(btrim(image_url_snapshot), '') is not null
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
$$;

revoke all on function public.activate_matchday_reference_composition(uuid, uuid, boolean)
from public, anon, authenticated;
grant execute on function public.activate_matchday_reference_composition(uuid, uuid, boolean)
to service_role;

comment on constraint matchday_reference_composition_items_slot_type_check
on public.matchday_reference_composition_items is
  'Mantém as zonas históricas e acrescenta Para Lá da Jornada sem reinterpretar os 15 slots nucleares.';

comment on constraint matchday_reference_composition_items_beyond_position_check
on public.matchday_reference_composition_items is
  'Para Lá da Jornada usa exclusivamente as posições editoriais 1 a 5.';

comment on function public.activate_matchday_reference_composition(uuid, uuid, boolean) is
  'Publica ou reativa uma composição; hierarchical exige sempre 15 slots e cinco posições posteriores completas.';

notify pgrst, 'reload schema';

commit;
