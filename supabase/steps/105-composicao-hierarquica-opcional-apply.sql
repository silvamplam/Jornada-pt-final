begin;

alter table public.matchday_reference_compositions
  add column if not exists presentation_mode text not null default 'standard';

alter table public.matchday_reference_compositions
  alter column presentation_mode set default 'standard',
  alter column presentation_mode set not null;

alter table public.matchday_reference_compositions
  drop constraint if exists matchday_reference_compositions_presentation_mode_check;

alter table public.matchday_reference_compositions
  add constraint matchday_reference_compositions_presentation_mode_check
  check (presentation_mode in ('standard', 'hierarchical'));

create unique index if not exists matchday_reference_compositions_draft_mode_unique_idx
on public.matchday_reference_compositions (matchday_id, presentation_mode)
where status = 'draft';

create table if not exists public.matchday_hierarchical_composition_slots (
  id uuid primary key default gen_random_uuid(),
  composition_id uuid not null references public.matchday_reference_compositions(id) on delete cascade,
  slot_key text not null,
  bank_item_id uuid references public.matchday_editorial_bank_items(id) on delete set null,
  source_identity text not null,
  label_snapshot text,
  title_snapshot text,
  subtitle_snapshot text,
  image_url_snapshot text,
  link_url_snapshot text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_hierarchical_composition_slots_slot_key_check check (
    slot_key in (
      'dominant_main',
      'dominant_side_top',
      'dominant_side_bottom',
      'other_chronicle_1',
      'other_chronicle_2',
      'other_chronicle_3',
      'secondary_strong_1',
      'secondary_strong_2',
      'secondary_1',
      'secondary_2',
      'secondary_3',
      'secondary_4',
      'closing_1',
      'closing_2',
      'closing_3'
    )
  ),
  constraint matchday_hierarchical_composition_slots_source_identity_check
    check (btrim(source_identity) <> ''),
  constraint matchday_hierarchical_composition_slots_composition_slot_unique
    unique (composition_id, slot_key),
  constraint matchday_hierarchical_composition_slots_composition_source_unique
    unique (composition_id, source_identity)
);

create unique index if not exists matchday_hierarchical_composition_slots_bank_unique_idx
on public.matchday_hierarchical_composition_slots (composition_id, bank_item_id)
where bank_item_id is not null;

create index if not exists matchday_hierarchical_composition_slots_composition_idx
on public.matchday_hierarchical_composition_slots (composition_id);

create or replace function public.set_matchday_hierarchical_composition_slots_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end
$$;

drop trigger if exists set_matchday_hierarchical_composition_slots_updated_at
on public.matchday_hierarchical_composition_slots;

create trigger set_matchday_hierarchical_composition_slots_updated_at
before update on public.matchday_hierarchical_composition_slots
for each row
execute function public.set_matchday_hierarchical_composition_slots_updated_at();

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
    end if;
  elsif v_target.status <> 'published' then
    raise exception 'composition_not_published';
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

comment on column public.matchday_reference_compositions.presentation_mode is
  'Renderer da versão: standard preserva a composição existente; hierarchical usa os 15 slots próprios.';

comment on table public.matchday_hierarchical_composition_slots is
  'Slots fixos e snapshots independentes da composição hierárquica opcional.';

comment on column public.matchday_hierarchical_composition_slots.bank_item_id is
  'Origem no banco da Jornada; ON DELETE SET NULL preserva os snapshots e evita cascade destrutivo.';

comment on function public.activate_matchday_reference_composition(uuid, uuid, boolean) is
  'Publica opcionalmente e troca atomicamente a única composição current da Jornada.';

notify pgrst, 'reload schema';

commit;
