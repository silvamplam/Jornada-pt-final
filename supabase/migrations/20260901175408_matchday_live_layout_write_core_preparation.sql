begin;

-- ============================================================
-- LOTE 6 / PASSO 1 - PREPARACAO DO WRITE CORE TRANSVERSAL
--
-- Nenhum caller atual e alterado nesta migration. O reverse sync do Lote 4
-- permanece ativo, nao existe UNIQUE transversal e as funcoes abaixo ficam
-- privadas. O cutover, os manifests J03/J04 e os guards legacy pertencem ao
-- Passo 2.
-- ============================================================

-- ============================================================
-- 1. JORNADA VIVA CONTEXTUAL A EPOCA
-- ============================================================

alter table public.matchdays
  add constraint matchdays_id_season_key
  unique (id, season_id);

alter table public.matchday_editorial_desk_control
  add column season_id uuid;

update public.matchday_editorial_desk_control as desk_row
set season_id = matchday_row.season_id
from public.matchdays as matchday_row
where matchday_row.id = desk_row.matchday_id;

alter table public.matchday_editorial_desk_control
  alter column season_id set not null,
  add constraint matchday_editorial_desk_control_matchday_season_fk
    foreign key (matchday_id, season_id)
    references public.matchdays(id, season_id)
    on delete cascade
    deferrable initially deferred;

create function jornada_private.set_matchday_editorial_desk_control_season()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_season_id uuid;
begin
  select matchday_row.season_id
  into v_season_id
  from public.matchdays as matchday_row
  where matchday_row.id = new.matchday_id;

  if not found then
    raise exception 'matchday-live-desk-control-matchday-not-found';
  end if;

  if new.season_id is not null
    and new.season_id is distinct from v_season_id
  then
    raise exception 'matchday-live-desk-control-season-mismatch';
  end if;

  new.season_id := v_season_id;
  return new;
end;
$function$;

revoke all on function
  jornada_private.set_matchday_editorial_desk_control_season()
from public, anon, authenticated, service_role;

create trigger matchday_editorial_desk_control_set_season
before insert or update of matchday_id, season_id
on public.matchday_editorial_desk_control
for each row
execute function jornada_private.set_matchday_editorial_desk_control_season();

create unique index matchday_editorial_desk_control_one_live_per_season_idx
on public.matchday_editorial_desk_control(season_id)
where is_managed = true;

comment on column public.matchday_editorial_desk_control.season_id is
  'Contexto permanente da Jornada na epoca. Suporta no maximo uma Jornada viva por epoca sem criar uma autoridade current_matchday paralela.';

-- Roundup e contextual a Jornada. Estas duas identidades funcionais podem ser
-- herdadas entre Jornadas, mas continuam unicas dentro de cada Jornada.
drop index if exists public.matchday_roundup_items_youtube_video_id_uidx;
drop index if exists public.matchday_roundup_items_source_candidate_id_uidx;

create unique index matchday_roundup_items_matchday_youtube_video_id_uidx
on public.matchday_roundup_items(matchday_id, youtube_video_id)
where youtube_video_id is not null;

create unique index matchday_roundup_items_matchday_source_candidate_id_uidx
on public.matchday_roundup_items(matchday_id, source_candidate_id)
where source_candidate_id is not null;

-- ============================================================
-- 2. FORWARD PROJECTION PRIVADA: PLACEMENTS -> LEGACY
--
-- Nao existe trigger placements -> legacy neste passo. A funcao so corre
-- quando chamada explicitamente pelo core privado ou pelo materializador de
-- continuidade. Os triggers deferidos do Lote 4 observam o legacy final e
-- convergem para o mesmo estado; nao existe ciclo de triggers.
-- ============================================================

create function jornada_private.project_matchday_live_layout_placements_to_legacy(
  p_matchday_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_matchday_ids uuid[];
begin
  select pg_catalog.array_agg(target_row.matchday_id order by target_row.matchday_id)
  into v_matchday_ids
  from (
    select distinct input_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as input_row(matchday_id)
    where input_row.matchday_id is not null
  ) as target_row;

  if v_matchday_ids is null
    or pg_catalog.cardinality(v_matchday_ids) = 0
  then
    return;
  end if;

  if (
    select pg_catalog.count(*)
    from public.matchdays as matchday_row
    where matchday_row.id = any(v_matchday_ids)
  ) <> pg_catalog.cardinality(v_matchday_ids) then
    raise exception 'matchday-live-layout-forward-matchday-not-found';
  end if;

  -- A mesma row lock usada pelo core serializa calls privados por Jornada.
  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = any(v_matchday_ids)
  order by matchday_row.id
  for update;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = placement_row.matchday_id
     and projection_row.zone_id = placement_row.zone_id
    where placement_row.matchday_id = any(v_matchday_ids)
      and placement_row.placement_type = 'zone'
      and projection_row.zone_id is null
  ) then
    raise exception 'matchday-live-layout-forward-unresolved-zone';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = any(v_matchday_ids)
      and placement_row.placement_type in (
        'opening',
        'faixa',
        'video_highlight'
      )
      and nullif(pg_catalog.btrim(bank_row.link_url), '') is null
  ) then
    raise exception 'matchday-live-layout-forward-link-required';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = any(v_matchday_ids)
      and placement_row.placement_type in ('selection', 'zone')
      and (
        nullif(pg_catalog.btrim(bank_row.source_type), '') is null
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) then
    raise exception 'matchday-live-layout-forward-source-required';
  end if;

  perform pg_catalog.set_config(
    'jornada.live_layout_forward_projection',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_faixa_reconcile',
    'on',
    true
  );

  insert into public.matchday_editorials (matchday_id, updated_at)
  select target_row.matchday_id, pg_catalog.now()
  from pg_catalog.unnest(v_matchday_ids) as target_row(matchday_id)
  on conflict (matchday_id) do nothing;

  with placement_snapshots as materialized (
    select
      placement_row.matchday_id,
      pg_catalog.max(bank_row.title)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 1
        ) as headline_title,
      pg_catalog.max(bank_row.subtitle)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 1
        ) as headline_summary,
      pg_catalog.max(bank_row.image_url)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 1
        ) as headline_image_url,
      pg_catalog.max(bank_row.link_url)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 1
        ) as headline_link_url,
      pg_catalog.max(bank_row.label)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 5
        ) as context_label,
      pg_catalog.max(bank_row.label_color)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 5
        ) as context_label_color,
      pg_catalog.max(bank_row.title)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 5
        ) as context_title,
      pg_catalog.max(bank_row.subtitle)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 5
        ) as context_text,
      pg_catalog.max(bank_row.image_url)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 5
        ) as context_image_url,
      pg_catalog.max(bank_row.link_url)
        filter (
          where placement_row.placement_type = 'opening'
            and placement_row.slot_position = 5
        ) as context_link_url,
      pg_catalog.max(bank_row.label)
        filter (where placement_row.placement_type = 'video_highlight')
        as video_label,
      pg_catalog.max(bank_row.title)
        filter (where placement_row.placement_type = 'video_highlight')
        as video_title,
      pg_catalog.max(bank_row.subtitle)
        filter (where placement_row.placement_type = 'video_highlight')
        as video_text,
      pg_catalog.max(bank_row.image_url)
        filter (where placement_row.placement_type = 'video_highlight')
        as video_image_url,
      pg_catalog.max(bank_row.link_url)
        filter (where placement_row.placement_type = 'video_highlight')
        as video_link_url
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = any(v_matchday_ids)
      and placement_row.placement_type in ('opening', 'video_highlight')
    group by placement_row.matchday_id
  ),
  targets as materialized (
    select target_row.matchday_id
    from pg_catalog.unnest(v_matchday_ids) as target_row(matchday_id)
  )
  update public.matchday_editorials as editorial_row
  set title = snapshot_row.headline_title,
      summary = snapshot_row.headline_summary,
      image_url = snapshot_row.headline_image_url,
      headline_link_url = snapshot_row.headline_link_url,
      status = case
        when snapshot_row.headline_link_url is null then 'draft'
        else 'published'
      end,
      side_block_status = case
        when snapshot_row.context_link_url is null then 'draft'
        else 'published'
      end,
      side_block_type = case
        when snapshot_row.context_link_url is null then null
        else 'article'
      end,
      side_block_label = snapshot_row.context_label,
      side_block_label_color = snapshot_row.context_label_color,
      side_block_title = snapshot_row.context_title,
      side_block_author = null,
      side_block_text = snapshot_row.context_text,
      side_block_image_url = snapshot_row.context_image_url,
      side_block_link_url = snapshot_row.context_link_url,
      complementary_mode = case
        when snapshot_row.video_link_url is null then 'none'
        else 'roundup_video'
      end,
      complementary_status = case
        when snapshot_row.video_link_url is null then 'draft'
        else 'published'
      end,
      complementary_label = snapshot_row.video_label,
      complementary_title = snapshot_row.video_title,
      complementary_text = snapshot_row.video_text,
      complementary_image_url = snapshot_row.video_image_url,
      complementary_link_url = snapshot_row.video_link_url,
      updated_at = pg_catalog.now()
  from targets as target_row
  left join placement_snapshots as snapshot_row
    on snapshot_row.matchday_id = target_row.matchday_id
  where editorial_row.matchday_id = target_row.matchday_id;

  delete from public.matchday_highlights as highlight_row
  where highlight_row.matchday_id = any(v_matchday_ids);

  insert into public.matchday_highlights (
    matchday_id,
    label,
    label_color,
    title,
    subtitle,
    image_url,
    link_url,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    placement_row.matchday_id,
    bank_row.label,
    bank_row.label_color,
    bank_row.title,
    bank_row.subtitle,
    bank_row.image_url,
    bank_row.link_url,
    placement_row.slot_position - 1,
    'published',
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_live_layout_placements as placement_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.id = placement_row.bank_item_id
   and bank_row.matchday_id = placement_row.matchday_id
  where placement_row.matchday_id = any(v_matchday_ids)
    and placement_row.placement_type = 'opening'
    and placement_row.slot_position between 2 and 4
  order by placement_row.matchday_id, placement_row.slot_position;

  delete from public.matchday_horizontal_news as faixa_row
  where faixa_row.matchday_id = any(v_matchday_ids);

  insert into public.matchday_horizontal_news (
    matchday_id,
    label,
    label_color,
    title,
    subtitle,
    image_url,
    link_url,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    placement_row.matchday_id,
    bank_row.label,
    bank_row.label_color,
    bank_row.title,
    bank_row.subtitle,
    bank_row.image_url,
    bank_row.link_url,
    placement_row.slot_position,
    'published',
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_live_layout_placements as placement_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.id = placement_row.bank_item_id
   and bank_row.matchday_id = placement_row.matchday_id
  where placement_row.matchday_id = any(v_matchday_ids)
    and placement_row.placement_type = 'faixa'
  order by placement_row.matchday_id, placement_row.slot_position;

  delete from public.matchday_live_layout_items as selection_row
  where selection_row.matchday_id = any(v_matchday_ids)
    and selection_row.slot_type in (
      'live_four_news:1',
      'live_four_news:2',
      'live_four_news:3',
      'live_four_news:4'
    );

  insert into public.matchday_live_layout_items (
    matchday_id,
    slot_type,
    article_id,
    label,
    title,
    subtitle,
    image_url,
    link_url,
    source_type,
    source_id,
    created_at,
    updated_at
  )
  select
    placement_row.matchday_id,
    'live_four_news:' || placement_row.slot_position::text,
    case
      when pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
        'editorial_article'
       and bank_row.source_id ~*
        '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then bank_row.source_id::uuid
      else null
    end,
    bank_row.label,
    bank_row.title,
    bank_row.subtitle,
    bank_row.image_url,
    bank_row.link_url,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)),
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_live_layout_placements as placement_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.id = placement_row.bank_item_id
   and bank_row.matchday_id = placement_row.matchday_id
  where placement_row.matchday_id = any(v_matchday_ids)
    and placement_row.placement_type = 'selection'
  order by placement_row.matchday_id, placement_row.slot_position;

  delete from public.matchday_editorial_profile_zone_items as zone_item_row
  where zone_item_row.matchday_id = any(v_matchday_ids)
    and zone_item_row.profile_key = 'liga_portugal_v1';

  insert into public.matchday_editorial_profile_zone_items (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    zone_key,
    sort_order,
    created_at,
    updated_at
  )
  select
    placement_row.matchday_id,
    'liga_portugal_v1',
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)),
    projection_row.legacy_zone_key,
    placement_row.slot_position,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_live_layout_placements as placement_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.id = placement_row.bank_item_id
   and bank_row.matchday_id = placement_row.matchday_id
  join jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
    on projection_row.matchday_id = placement_row.matchday_id
   and projection_row.zone_id = placement_row.zone_id
  where placement_row.matchday_id = any(v_matchday_ids)
    and placement_row.placement_type = 'zone'
  order by
    placement_row.matchday_id,
    projection_row.legacy_zone_key,
    placement_row.slot_position;
end;
$function$;

revoke all on function
  jornada_private.project_matchday_live_layout_placements_to_legacy(uuid[])
from public, anon, authenticated, service_role;

comment on function
  jornada_private.project_matchday_live_layout_placements_to_legacy(uuid[])
is
  'Prepared forward compatibility projection. It is private and has no trigger or current production caller in Lote 6 Passo 1.';

-- ============================================================
-- 3. PLANO NORMALIZADO E CORE TRANSVERSAL ATOMICO
-- ============================================================

create function jornada_private.normalize_matchday_live_layout_placement_plan(
  p_plan jsonb
)
returns table (
  operation_order bigint,
  action text,
  bank_item_id uuid,
  placement_type text,
  zone_id uuid,
  slot_position integer
)
language sql
immutable
set search_path = ''
as $function$
  select
    plan_row.operation_order,
    pg_catalog.lower(pg_catalog.btrim(plan_row.payload ->> 'action')),
    nullif(pg_catalog.btrim(plan_row.payload ->> 'bank_item_id'), '')::uuid,
    pg_catalog.lower(pg_catalog.btrim(plan_row.payload ->> 'placement_type')),
    nullif(pg_catalog.btrim(plan_row.payload ->> 'zone_id'), '')::uuid,
    (plan_row.payload ->> 'slot_position')::integer
  from pg_catalog.jsonb_array_elements(p_plan)
    with ordinality as plan_row(payload, operation_order);
$function$;

revoke all on function
  jornada_private.normalize_matchday_live_layout_placement_plan(jsonb)
from public, anon, authenticated, service_role;

create function jornada_private.apply_matchday_live_layout_placement_plan(
  p_matchday_id uuid,
  p_plan jsonb,
  p_project_legacy boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_deleted_count integer := 0;
  v_inserted_count integer := 0;
begin
  if p_matchday_id is null
    or p_plan is null
    or pg_catalog.jsonb_typeof(p_plan) <> 'array'
  then
    raise exception 'matchday-live-layout-plan-invalid-envelope';
  end if;

  if not exists (
    select 1
    from public.matchdays as matchday_row
    where matchday_row.id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-plan-matchday-not-found';
  end if;

  -- Uma row lock por Jornada e suficiente enquanto o core e o unico writer do
  -- cutover. Calls concorrentes seguem a mesma ordem sem bloquear a tabela.
  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_plan) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
  ) then
    raise exception 'matchday-live-layout-plan-operation-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
      as plan_row
    where plan_row.action is null
      or plan_row.action not in ('place', 'clear')
      or plan_row.placement_type is null
      or plan_row.placement_type not in (
        'opening',
        'faixa',
        'selection',
        'video_highlight',
        'zone'
      )
      or plan_row.slot_position is null
      or (
        plan_row.action = 'place'
        and plan_row.bank_item_id is null
      )
      or (
        plan_row.action = 'clear'
        and plan_row.bank_item_id is not null
      )
      or not (
        (
          plan_row.placement_type = 'opening'
          and plan_row.zone_id is null
          and plan_row.slot_position between 1 and 5
        )
        or (
          plan_row.placement_type = 'faixa'
          and plan_row.zone_id is null
          and plan_row.slot_position > 0
        )
        or (
          plan_row.placement_type = 'selection'
          and plan_row.zone_id is null
          and plan_row.slot_position between 1 and 4
        )
        or (
          plan_row.placement_type = 'video_highlight'
          and plan_row.zone_id is null
          and plan_row.slot_position = 1
        )
        or (
          plan_row.placement_type = 'zone'
          and plan_row.zone_id is not null
          and plan_row.slot_position > 0
        )
      )
  ) then
    raise exception 'matchday-live-layout-plan-target-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
      as plan_row
    group by
      plan_row.placement_type,
      plan_row.zone_id,
      plan_row.slot_position
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-plan-duplicate-target';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
      as plan_row
    where plan_row.action = 'place'
    group by plan_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-plan-duplicate-bank-item';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
      as plan_row
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = plan_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where plan_row.action = 'place'
      and bank_row.id is null
  ) then
    raise exception 'matchday-live-layout-plan-bank-context-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
      as plan_row
    left join public.matchday_live_layout_zones as zone_row
      on zone_row.id = plan_row.zone_id
     and zone_row.matchday_id = p_matchday_id
    where plan_row.placement_type = 'zone'
      and zone_row.id is null
  ) then
    raise exception 'matchday-live-layout-plan-zone-context-invalid';
  end if;

  -- Lock de Bank e placements em ordem deterministica. Nao existe winner para
  -- um X ja ambiguamente duplicado no shadow legacy: o plano falha inteiro.
  perform 1
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id
    and bank_row.id in (
      select plan_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
        as plan_row
      where plan_row.action = 'place'
    )
  order by bank_row.id
  for key share;

  perform 1
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
  order by placement_row.id
  for update;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
      as plan_row
    join public.matchday_live_layout_placements as placement_row
      on placement_row.matchday_id = p_matchday_id
     and placement_row.bank_item_id = plan_row.bank_item_id
    where plan_row.action = 'place'
    group by plan_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-plan-existing-transversal-conflict';
  end if;

  with plan_rows as materialized (
    select *
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
  )
  delete from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and (
      exists (
        select 1
        from plan_rows as plan_row
        where plan_row.action = 'place'
          and plan_row.bank_item_id = placement_row.bank_item_id
      )
      or exists (
        select 1
        from plan_rows as plan_row
        where plan_row.placement_type = placement_row.placement_type
          and plan_row.slot_position = placement_row.slot_position
          and plan_row.zone_id is not distinct from placement_row.zone_id
      )
    );

  get diagnostics v_deleted_count = row_count;

  insert into public.matchday_live_layout_placements (
    matchday_id,
    bank_item_id,
    placement_type,
    zone_id,
    slot_position,
    created_at,
    updated_at
  )
  select
    p_matchday_id,
    plan_row.bank_item_id,
    plan_row.placement_type,
    plan_row.zone_id,
    plan_row.slot_position,
    pg_catalog.now(),
    pg_catalog.now()
  from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
    as plan_row
  where plan_row.action = 'place'
  order by
    plan_row.placement_type,
    plan_row.zone_id nulls first,
    plan_row.slot_position,
    plan_row.bank_item_id;

  get diagnostics v_inserted_count = row_count;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_placement_plan(p_plan)
      as plan_row
    left join lateral (
      select pg_catalog.count(*) as placement_count
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = plan_row.bank_item_id
    ) as current_row on true
    where plan_row.action = 'place'
      and current_row.placement_count <> 1
  ) then
    raise exception 'matchday-live-layout-plan-postcondition-failed';
  end if;

  if p_project_legacy then
    perform
      jornada_private.project_matchday_live_layout_placements_to_legacy(
        array[p_matchday_id]::uuid[]
      );
  end if;

  return pg_catalog.jsonb_build_object(
    'matchday_id', p_matchday_id,
    'operation_count', pg_catalog.jsonb_array_length(p_plan),
    'deleted_placement_count', v_deleted_count,
    'inserted_placement_count', v_inserted_count,
    'legacy_projected', p_project_legacy
  );
end;
$function$;

revoke all on function
  jornada_private.apply_matchday_live_layout_placement_plan(
    uuid,
    jsonb,
    boolean
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.apply_matchday_live_layout_placement_plan(
    uuid,
    jsonb,
    boolean
  )
is
  'Prepared atomic transversal movement/clear core. Private and inactive until the Lote 6 Passo 2 caller cutover.';

-- ============================================================
-- 4. MATERIALIZACAO PRIVADA DE CONTINUIDADE N -> N+1
--
-- Esta funcao prepara a operacao interna que o publicador do Passo 2 chamara
-- dentro da sua propria transacao. Nao publica composicoes, nao muda is_managed
-- e nao tem EXECUTE externo. A source composition publicada e somente a prova
-- congelada da transicao; nunca e reconstruida a partir de placements live.
-- ============================================================

create function jornada_private.materialize_matchday_live_layout_continuity(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns table (
  materialized boolean,
  source_matchday_id uuid,
  target_matchday_id uuid,
  source_composition_id uuid,
  inherited_bank_count integer,
  inherited_zone_count integer,
  inherited_placement_count integer,
  inherited_latest_count integer,
  inherited_roundup_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_target_season_id uuid;
  v_source_number integer;
  v_target_number integer;
  v_plan jsonb := '[]'::jsonb;
  v_roundup_map jsonb := '{}'::jsonb;
  v_bank_count integer := 0;
  v_zone_count integer := 0;
  v_placement_count integer := 0;
  v_latest_count integer := 0;
  v_roundup_count integer := 0;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception 'matchday-live-continuity-invalid-envelope';
  end if;

  -- Lock order is deterministic for normal publication and approved recovery.
  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id in (
    p_source_matchday_id,
    p_target_matchday_id
  )
  order by matchday_row.id
  for update;

  select
    source_row.season_id,
    target_row.season_id,
    source_row.number,
    target_row.number
  into
    v_source_season_id,
    v_target_season_id,
    v_source_number,
    v_target_number
  from public.matchdays as source_row
  cross join public.matchdays as target_row
  where source_row.id = p_source_matchday_id
    and target_row.id = p_target_matchday_id;

  if not found then
    raise exception 'matchday-live-continuity-matchday-not-found';
  end if;

  if v_source_season_id is distinct from v_target_season_id then
    raise exception 'matchday-live-continuity-season-mismatch';
  end if;

  if v_target_number <> v_source_number + 1 then
    raise exception 'matchday-live-continuity-target-not-consecutive';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = p_source_composition_id
      and composition_row.matchday_id = p_source_matchday_id
      and composition_row.status = 'published'
      and composition_row.is_current = true
  ) then
    raise exception 'matchday-live-continuity-composition-not-published';
  end if;

  -- A via normal observa a source ainda viva. A via de recovery exige que o
  -- target vivo aponte explicitamente para esta composicao carryover. Assim,
  -- uma Jornada historica como J03 nao pode ser reaberta por residuos live.
  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_source_matchday_id
      and desk_row.is_managed = true
  ) and not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_target_matchday_id
      and desk_row.is_managed = true
      and desk_row.carryover_source_composition_id = p_source_composition_id
  ) then
    raise exception 'matchday-live-continuity-source-not-live';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
       or transition_row.target_matchday_id = p_target_matchday_id
  ) then
    return query
    select
      false,
      p_source_matchday_id,
      p_target_matchday_id,
      p_source_composition_id,
      0,
      0,
      0,
      0,
      0;
    return;
  end if;

  -- Bank rows podem ser reutilizadas por identidade forte. Qualquer estrutura
  -- publica/compatibility target ja materializada torna o target incompativel.
  if exists (
    select 1
    from public.matchday_live_layout_placements as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_zones as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_blocks as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorials as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_highlights as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_horizontal_news as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_live_layout_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_zone_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_latest_news as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) or exists (
    select 1
    from public.matchday_roundup_items as row_value
    where row_value.matchday_id = p_target_matchday_id
  ) then
    raise exception 'matchday-live-continuity-target-incompatible';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_source_matchday_id
    group by placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-continuity-source-transversal-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_source_matchday_id
      and (
        nullif(pg_catalog.btrim(bank_row.source_type), '') is null
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) then
    raise exception 'matchday-live-continuity-source-identity-required';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = placement_row.matchday_id
     and projection_row.zone_id = placement_row.zone_id
    where placement_row.matchday_id = p_source_matchday_id
      and placement_row.placement_type = 'zone'
      and projection_row.zone_id is null
  ) then
    raise exception 'matchday-live-continuity-source-zone-unresolved';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.id = placement_row.bank_item_id
     and source_bank.matchday_id = placement_row.matchday_id
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
     and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
    where placement_row.matchday_id = p_source_matchday_id
      and (
        target_bank.continuity_source_matchday_id is not null
        and target_bank.continuity_source_matchday_id <>
          p_source_matchday_id
        or target_bank.continuity_source_composition_id is not null
        and target_bank.continuity_source_composition_id <>
          p_source_composition_id
      )
  ) then
    raise exception 'matchday-live-continuity-bank-provenance-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as source_bank
      on source_bank.id = placement_row.bank_item_id
     and source_bank.matchday_id = placement_row.matchday_id
    join public.matchday_editorial_bank_items as target_bank
      on target_bank.matchday_id = p_target_matchday_id
     and nullif(pg_catalog.btrim(target_bank.link_url), '') is not null
     and pg_catalog.lower(pg_catalog.btrim(target_bank.link_url)) =
       pg_catalog.lower(pg_catalog.btrim(source_bank.link_url))
    where placement_row.matchday_id = p_source_matchday_id
      and (
        pg_catalog.lower(pg_catalog.btrim(target_bank.source_type))
          is distinct from
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
        or pg_catalog.lower(pg_catalog.btrim(target_bank.source_id))
          is distinct from
            pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
      )
  ) then
    raise exception 'matchday-live-continuity-bank-link-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_source_matchday_id
      and editorial_row.complementary_roundup_item_id is not null
      and not exists (
        select 1
        from public.matchday_roundup_items as roundup_row
        where roundup_row.id = editorial_row.complementary_roundup_item_id
          and roundup_row.matchday_id = p_source_matchday_id
      )
  ) then
    raise exception 'matchday-live-continuity-roundup-reference-invalid';
  end if;

  insert into public.matchday_editorial_continuity_transitions (
    source_matchday_id,
    target_matchday_id,
    source_composition_id,
    continuity_version
  ) values (
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    6
  );

  perform pg_catalog.set_config(
    'jornada.thematic_continuity_initialize',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_faixa_reconcile',
    'on',
    true
  );

  insert into public.matchday_editorial_desk_control (
    matchday_id,
    is_managed,
    updated_at
  ) values (
    p_target_matchday_id,
    false,
    pg_catalog.now()
  )
  on conflict (matchday_id) do nothing;

  insert into public.matchday_editorial_profile_assignments (
    matchday_id,
    profile_key,
    created_at,
    updated_at
  ) values (
    p_target_matchday_id,
    'liga_portugal_v1',
    pg_catalog.now(),
    pg_catalog.now()
  )
  on conflict (matchday_id) do nothing;

  insert into public.matchday_editorial_profile_reconcile_control (
    matchday_id,
    profile_key,
    revision,
    last_applied_at,
    thematic_zone_order,
    thematic_zone_layouts,
    thematic_block_order,
    thematic_zone_titles,
    updated_at
  )
  select
    p_target_matchday_id,
    'liga_portugal_v1',
    0,
    null,
    coalesce(
      source_row.thematic_zone_order,
      array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ),
    coalesce(
      source_row.thematic_zone_layouts,
      '{"benfica":"six_news","sporting":"five_news_balanced","fc_porto":"five_news_balanced","other_liga_clubs":"six_news","outside_liga_other":"five_news_secondary"}'::jsonb
    ),
    coalesce(
      source_row.thematic_block_order,
      array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other',
        'latest',
        'video'
      ]::text[]
    ),
    coalesce(
      source_row.thematic_zone_titles,
      '{"benfica":"","sporting":"","fc_porto":"","other_liga_clubs":"","outside_liga_other":""}'::jsonb
    ),
    pg_catalog.now()
  from (values (1)) as singleton_row(dummy)
  left join public.matchday_editorial_profile_reconcile_control as source_row
    on source_row.matchday_id = p_source_matchday_id
   and source_row.profile_key = 'liga_portugal_v1';

  -- O Lote 3 ja e o construtor set-based das zonas/blocks e da ponte privada.
  perform jornada_private.sync_matchday_live_layout_shadow(
    array[p_target_matchday_id]::uuid[]
  );

  select pg_catalog.count(*)::integer
  into v_zone_count
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = p_target_matchday_id;

  with source_bank as materialized (
    select distinct
      bank_row.label,
      bank_row.label_color,
      bank_row.title,
      bank_row.subtitle,
      bank_row.image_url,
      bank_row.link_url,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
      bank_row.source_slug,
      bank_row.origin_slot_type,
      bank_row.sort_order,
      bank_row.status
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_source_matchday_id
  )
  insert into public.matchday_editorial_bank_items (
    matchday_id,
    label,
    label_color,
    title,
    subtitle,
    image_url,
    link_url,
    source_type,
    source_id,
    source_slug,
    origin_slot_type,
    sort_order,
    status,
    automatic_eligible,
    continuity_source_matchday_id,
    continuity_source_composition_id,
    created_at,
    updated_at
  )
  select
    p_target_matchday_id,
    source_row.label,
    source_row.label_color,
    source_row.title,
    source_row.subtitle,
    source_row.image_url,
    source_row.link_url,
    source_row.source_type,
    source_row.source_id,
    source_row.source_slug,
    source_row.origin_slot_type,
    source_row.sort_order,
    source_row.status,
    false,
    p_source_matchday_id,
    p_source_composition_id,
    pg_catalog.now(),
    pg_catalog.now()
  from source_bank as source_row
  where not exists (
    select 1
    from public.matchday_editorial_bank_items as target_bank
    where target_bank.matchday_id = p_target_matchday_id
      and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
        source_row.source_type
      and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
        source_row.source_id
  );

  with source_bank as materialized (
    select distinct
      bank_row.label,
      bank_row.label_color,
      bank_row.title,
      bank_row.subtitle,
      bank_row.image_url,
      bank_row.link_url,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
      bank_row.source_slug,
      bank_row.origin_slot_type,
      bank_row.sort_order,
      bank_row.status
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_source_matchday_id
  )
  update public.matchday_editorial_bank_items as target_bank
  set label = source_row.label,
      label_color = source_row.label_color,
      title = source_row.title,
      subtitle = source_row.subtitle,
      image_url = source_row.image_url,
      link_url = source_row.link_url,
      source_slug = source_row.source_slug,
      origin_slot_type = source_row.origin_slot_type,
      sort_order = source_row.sort_order,
      status = source_row.status,
      automatic_eligible = false,
      continuity_source_matchday_id = p_source_matchday_id,
      continuity_source_composition_id = p_source_composition_id,
      updated_at = pg_catalog.now()
  from source_bank as source_row
  where target_bank.matchday_id = p_target_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
      source_row.source_type
    and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
      source_row.source_id;

  select pg_catalog.count(distinct placement_row.bank_item_id)::integer
  into v_bank_count
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_source_matchday_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'action', 'place',
        'bank_item_id', target_bank.id,
        'placement_type', placement_row.placement_type,
        'zone_id', target_projection.zone_id,
        'slot_position', placement_row.slot_position
      )
      order by
        placement_row.placement_type,
        target_projection.zone_id nulls first,
        placement_row.slot_position,
        target_bank.id
    ),
    '[]'::jsonb
  )
  into v_plan
  from public.matchday_live_layout_placements as placement_row
  join public.matchday_editorial_bank_items as source_bank
    on source_bank.id = placement_row.bank_item_id
   and source_bank.matchday_id = placement_row.matchday_id
  join public.matchday_editorial_bank_items as target_bank
    on target_bank.matchday_id = p_target_matchday_id
   and pg_catalog.lower(pg_catalog.btrim(target_bank.source_type)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_type))
   and pg_catalog.lower(pg_catalog.btrim(target_bank.source_id)) =
     pg_catalog.lower(pg_catalog.btrim(source_bank.source_id))
  left join jornada_private.matchday_live_layout_zone_legacy_projection
    as source_projection
    on source_projection.matchday_id = p_source_matchday_id
   and source_projection.zone_id = placement_row.zone_id
  left join jornada_private.matchday_live_layout_zone_legacy_projection
    as target_projection
    on target_projection.matchday_id = p_target_matchday_id
   and target_projection.legacy_zone_key =
     source_projection.legacy_zone_key
  where placement_row.matchday_id = p_source_matchday_id;

  v_placement_count := pg_catalog.jsonb_array_length(v_plan);

  if v_placement_count > 0 then
    perform jornada_private.apply_matchday_live_layout_placement_plan(
      p_target_matchday_id,
      v_plan,
      false
    );
  end if;

  insert into public.matchday_latest_news (
    id,
    matchday_id,
    time_label,
    time_label_color,
    title,
    subtitle,
    link_url,
    image_url,
    article_id,
    sort_order,
    status,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    p_target_matchday_id,
    source_row.time_label,
    source_row.time_label_color,
    source_row.title,
    source_row.subtitle,
    source_row.link_url,
    source_row.image_url,
    source_row.article_id,
    source_row.sort_order,
    source_row.status,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_latest_news as source_row
  where source_row.matchday_id = p_source_matchday_id
  order by source_row.sort_order, source_row.id;

  get diagnostics v_latest_count = row_count;

  select coalesce(
    pg_catalog.jsonb_object_agg(
      source_row.id::text,
      gen_random_uuid()
    ),
    '{}'::jsonb
  )
  into v_roundup_map
  from public.matchday_roundup_items as source_row
  where source_row.matchday_id = p_source_matchday_id;

  insert into public.matchday_roundup_items (
    id,
    matchday_id,
    label,
    title,
    subtitle,
    image_url,
    video_url,
    duration,
    type,
    sort_order,
    status,
    match_id,
    youtube_video_id,
    youtube_channel_id,
    is_embeddable,
    source_candidate_id,
    created_at,
    updated_at
  )
  select
    (v_roundup_map ->> source_row.id::text)::uuid,
    p_target_matchday_id,
    source_row.label,
    source_row.title,
    source_row.subtitle,
    source_row.image_url,
    source_row.video_url,
    source_row.duration,
    source_row.type,
    source_row.sort_order,
    source_row.status,
    source_row.match_id,
    source_row.youtube_video_id,
    source_row.youtube_channel_id,
    source_row.is_embeddable,
    source_row.source_candidate_id,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_roundup_items as source_row
  where source_row.matchday_id = p_source_matchday_id
  order by source_row.sort_order, source_row.id;

  get diagnostics v_roundup_count = row_count;

  -- Estruturas compatibility que nao sao placements continuam materializadas
  -- para os readers atuais. live_four e sempre projetado a partir de placements.
  insert into public.matchday_live_layout_items (
    id,
    matchday_id,
    slot_type,
    article_id,
    label,
    title,
    subtitle,
    image_url,
    link_url,
    source_type,
    source_id,
    created_at,
    updated_at
  )
  select
    gen_random_uuid(),
    p_target_matchday_id,
    source_row.slot_type,
    source_row.article_id,
    source_row.label,
    source_row.title,
    source_row.subtitle,
    source_row.image_url,
    source_row.link_url,
    source_row.source_type,
    source_row.source_id,
    pg_catalog.now(),
    pg_catalog.now()
  from public.matchday_live_layout_items as source_row
  where source_row.matchday_id = p_source_matchday_id
    and source_row.slot_type not in (
      'live_four_news:1',
      'live_four_news:2',
      'live_four_news:3',
      'live_four_news:4'
    )
  order by source_row.slot_type, source_row.id;

  perform
    jornada_private.project_matchday_live_layout_placements_to_legacy(
      array[p_target_matchday_id]::uuid[]
    );

  -- Apenas apresentacao/estrutura funcional vem da editorial source. A
  -- identidade e os snapshots de ocupacao ja vieram do Bank/placements.
  update public.matchday_editorials as target_row
  set title_color = source_row.title_color,
      below_headline_mode = source_row.below_headline_mode,
      complementary_roundup_item_id = case
        when source_row.complementary_roundup_item_id is null then null
        else (
          v_roundup_map ->> source_row.complementary_roundup_item_id::text
        )::uuid
      end,
      complementary_text_color = source_row.complementary_text_color,
      roundup_video_heading = source_row.roundup_video_heading,
      roundup_video_heading_color = source_row.roundup_video_heading_color,
      below_headline_heading = source_row.below_headline_heading,
      below_headline_heading_color = source_row.below_headline_heading_color,
      latest_zone_mode = source_row.latest_zone_mode,
      latest_zone_title = source_row.latest_zone_title,
      below_headline_subtitle = source_row.below_headline_subtitle,
      latest_zone_title_color = source_row.latest_zone_title_color,
      latest_zone_placement = source_row.latest_zone_placement,
      side_block_type = case
        when target_row.side_block_status = 'published'
          then source_row.side_block_type
        else target_row.side_block_type
      end,
      side_block_title_color = source_row.side_block_title_color,
      side_block_author = source_row.side_block_author,
      updated_at = pg_catalog.now()
  from public.matchday_editorials as source_row
  where source_row.matchday_id = p_source_matchday_id
    and target_row.matchday_id = p_target_matchday_id;

  return query
  select
    true,
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id,
    v_bank_count,
    v_zone_count,
    v_placement_count,
    v_latest_count,
    v_roundup_count;
end;
$function$;

revoke all on function
  jornada_private.materialize_matchday_live_layout_continuity(
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.materialize_matchday_live_layout_continuity(
    uuid,
    uuid,
    uuid
  )
is
  'Prepared, private and atomic N to N+1 materializer. It neither publishes nor switches the live matchday in Lote 6 Passo 1.';

-- ============================================================
-- 5. POSTCONDITIONS DE PREPARACAO SEM CUTOVER
-- ============================================================

do $postconditions$
begin
  if exists (
    select 1
    from pg_catalog.pg_index as index_row
    join pg_catalog.pg_class as table_row
      on table_row.oid = index_row.indrelid
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = table_row.relnamespace
    where namespace_row.nspname = 'public'
      and table_row.relname = 'matchday_live_layout_placements'
      and index_row.indisunique
      and pg_catalog.pg_get_indexdef(index_row.indexrelid)
        ~* '\(matchday_id, bank_item_id\)'
  ) then
    raise exception 'matchday-live-layout-preparation-transversal-unique-forbidden';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_trigger as trigger_row
    join pg_catalog.pg_class as table_row
      on table_row.oid = trigger_row.tgrelid
    join pg_catalog.pg_namespace as namespace_row
      on namespace_row.oid = table_row.relnamespace
    where not trigger_row.tgisinternal
      and namespace_row.nspname = 'public'
      and table_row.relname = 'matchday_live_layout_placements'
      and pg_catalog.pg_get_triggerdef(trigger_row.oid)
        ~* 'project_matchday_live_layout_placements_to_legacy'
  ) then
    raise exception 'matchday-live-layout-preparation-forward-trigger-forbidden';
  end if;
end;
$postconditions$;

revoke all on function
  jornada_private.project_matchday_live_layout_placements_to_legacy(uuid[])
from public, anon, authenticated, service_role;

revoke all on function
  jornada_private.normalize_matchday_live_layout_placement_plan(jsonb)
from public, anon, authenticated, service_role;

revoke all on function
  jornada_private.apply_matchday_live_layout_placement_plan(
    uuid,
    jsonb,
    boolean
  )
from public, anon, authenticated, service_role;

revoke all on function
  jornada_private.materialize_matchday_live_layout_continuity(
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
