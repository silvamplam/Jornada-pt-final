begin;

alter table public.matchday_hierarchical_composition_slots
  add column if not exists media_kind_snapshot text,
  add column if not exists media_embed_url_snapshot text,
  add column if not exists media_video_url_snapshot text;

alter table public.matchday_reference_composition_items
  add column if not exists media_kind_snapshot text,
  add column if not exists media_embed_url_snapshot text,
  add column if not exists media_video_url_snapshot text;

alter table public.matchday_hierarchical_composition_slots
  drop constraint if exists matchday_hierarchical_composition_slots_media_kind_check,
  drop constraint if exists matchday_hierarchical_composition_slots_media_payload_check,
  drop constraint if exists matchday_hierarchical_composition_slots_media_position_check;

alter table public.matchday_hierarchical_composition_slots
  add constraint matchday_hierarchical_composition_slots_media_kind_check
    check (media_kind_snapshot is null or media_kind_snapshot in ('embed', 'direct_video')),
  add constraint matchday_hierarchical_composition_slots_media_payload_check
    check (
      (media_kind_snapshot is null
        and media_embed_url_snapshot is null
        and media_video_url_snapshot is null)
      or (media_kind_snapshot = 'embed'
        and nullif(btrim(media_embed_url_snapshot), '') is not null)
      or (media_kind_snapshot = 'direct_video'
        and nullif(btrim(media_video_url_snapshot), '') is not null)
    ),
  add constraint matchday_hierarchical_composition_slots_media_position_check
    check (media_kind_snapshot is null or slot_key = 'dominant_main');

alter table public.matchday_reference_composition_items
  drop constraint if exists matchday_reference_composition_items_media_kind_check,
  drop constraint if exists matchday_reference_composition_items_media_payload_check,
  drop constraint if exists matchday_reference_composition_items_media_position_check;

alter table public.matchday_reference_composition_items
  add constraint matchday_reference_composition_items_media_kind_check
    check (media_kind_snapshot is null or media_kind_snapshot in ('embed', 'direct_video')),
  add constraint matchday_reference_composition_items_media_payload_check
    check (
      (media_kind_snapshot is null
        and media_embed_url_snapshot is null
        and media_video_url_snapshot is null)
      or (media_kind_snapshot = 'embed'
        and nullif(btrim(media_embed_url_snapshot), '') is not null)
      or (media_kind_snapshot = 'direct_video'
        and nullif(btrim(media_video_url_snapshot), '') is not null)
    ),
  add constraint matchday_reference_composition_items_media_position_check
    check (media_kind_snapshot is null or slot_type in ('headline', 'complement'));

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

comment on column public.matchday_hierarchical_composition_slots.media_kind_snapshot is
  'Snapshot audiovisual opcional; nos 15 lugares só dominant_main pode guardar embed ou vídeo direto.';
comment on column public.matchday_reference_composition_items.media_kind_snapshot is
  'Snapshot audiovisual opcional para posições capazes de apresentar media sem alterar a origem canónica.';
comment on function public.activate_matchday_reference_composition(uuid, uuid, boolean) is
  'Publica ou reativa uma composição; hierarchical aceita dominant_main com imagem ou snapshot audiovisual válido e mantém os restantes requisitos.';

notify pgrst, 'reload schema';

commit;
