begin;

-- ============================================================
-- LOTE 4 — PLACEMENTS TRANSVERSAIS EM SHADOW
--
-- As tabelas legacy continuam autoritativas. Esta fundação observa o estado
-- público efetivo, resolve a participação contextual no Banco e materializa
-- apenas slots unívocos. Diagnósticos ficam privados e nunca escolhem winner.
-- ============================================================

-- ============================================================
-- 1. CANDIDATE KEY CONTEXTUAL DO BANCO
-- ============================================================

alter table public.matchday_editorial_bank_items
  add constraint matchday_editorial_bank_items_id_matchday_key
  unique (id, matchday_id);

-- ============================================================
-- 2. TABELA PÚBLICA SHADOW
-- ============================================================

create table public.matchday_live_layout_placements (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null,
  bank_item_id uuid not null,
  placement_type text not null,
  zone_id uuid,
  slot_position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matchday_live_layout_placements_matchday_fk
    foreign key (matchday_id)
    references public.matchdays(id)
    on delete cascade,

  constraint matchday_live_layout_placements_bank_context_fk
    foreign key (bank_item_id, matchday_id)
    references public.matchday_editorial_bank_items(id, matchday_id)
    on delete cascade
    deferrable initially deferred,

  constraint matchday_live_layout_placements_zone_context_fk
    foreign key (zone_id, matchday_id)
    references public.matchday_live_layout_zones(id, matchday_id)
    on delete cascade
    deferrable initially deferred,

  constraint matchday_live_layout_placements_type_check
    check (
      placement_type in (
        'opening',
        'faixa',
        'selection',
        'video_highlight',
        'zone'
      )
    ),

  constraint matchday_live_layout_placements_shape_check
    check (
      (
        placement_type = 'opening'
        and zone_id is null
        and slot_position between 1 and 5
      )
      or (
        placement_type = 'faixa'
        and zone_id is null
        and slot_position > 0
      )
      or (
        placement_type = 'selection'
        and zone_id is null
        and slot_position between 1 and 4
      )
      or (
        placement_type = 'video_highlight'
        and zone_id is null
        and slot_position = 1
      )
      or (
        placement_type = 'zone'
        and zone_id is not null
        and slot_position > 0
      )
    )
);

create unique index matchday_live_layout_placements_non_zone_slot_key
on public.matchday_live_layout_placements(
  matchday_id,
  placement_type,
  slot_position
)
where zone_id is null;

create unique index matchday_live_layout_placements_zone_slot_key
on public.matchday_live_layout_placements(
  matchday_id,
  zone_id,
  slot_position
)
where placement_type = 'zone';

create index matchday_live_layout_placements_matchday_idx
on public.matchday_live_layout_placements(matchday_id);

create index matchday_live_layout_placements_bank_context_idx
on public.matchday_live_layout_placements(bank_item_id, matchday_id);

create index matchday_live_layout_placements_zone_context_idx
on public.matchday_live_layout_placements(zone_id, matchday_id)
where zone_id is not null;

alter table public.matchday_live_layout_placements
  enable row level security;

revoke all on table public.matchday_live_layout_placements
from public, anon, authenticated, service_role;

grant select on table public.matchday_live_layout_placements
to service_role;

comment on table public.matchday_live_layout_placements is
  'Shadow transversal placements for the live matchday desk. Legacy remains authoritative until the write cutover.';

comment on column public.matchday_live_layout_placements.placement_type is
  'Exactly opening, faixa, selection, video_highlight or zone. Context is opening slot 5, never an independent type.';

-- ============================================================
-- 3. FILA TRANSACIONAL PRIVADA
-- ============================================================

create table jornada_private.matchday_live_layout_placement_shadow_sync_queue (
  backend_pid integer not null,
  transaction_id xid8 not null,
  matchday_id uuid not null,
  primary key (backend_pid, transaction_id, matchday_id)
);

revoke all on table
  jornada_private.matchday_live_layout_placement_shadow_sync_queue
from public, anon, authenticated, service_role;

-- ============================================================
-- 4. DERIVAÇÃO SET-BASED DAS AUTORIDADES LEGACY
-- ============================================================

create function jornada_private.derive_matchday_live_layout_placement_shadow(
  p_matchday_ids uuid[]
)
returns table (
  raw_source_key text,
  matchday_id uuid,
  placement_type text,
  legacy_zone_key text,
  zone_id uuid,
  slot_position integer,
  source_relation text,
  source_row_id uuid,
  source_slot_key text,
  source_type text,
  source_id text,
  source_link_url text,
  normalized_link_url text,
  bank_item_id uuid,
  bank_status text,
  bank_candidate_count bigint,
  zone_candidate_count bigint,
  slot_source_count bigint,
  invalid_slot_position boolean
)
language sql
stable
security definer
set search_path = ''
as $function$
  with raw_sources as materialized (
    -- Abertura 1: Manchete.
    select
      'matchday_editorials:' || editorial_row.id::text || ':headline'
        as raw_source_key,
      editorial_row.matchday_id,
      'opening'::text as placement_type,
      null::text as legacy_zone_key,
      1::integer as slot_position,
      'matchday_editorials'::text as source_relation,
      editorial_row.id as source_row_id,
      'headline'::text as source_slot_key,
      null::text as source_type,
      null::text as source_id,
      editorial_row.headline_link_url as source_link_url
    from public.matchday_editorials as editorial_row
    where (
      p_matchday_ids is null
      or editorial_row.matchday_id = any(p_matchday_ids)
    )
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(editorial_row.status, ''))
      ) = 'published'

    union all

    -- Abertura 2..4: três notícias abaixo da Manchete.
    select
      'matchday_highlights:' || highlight_row.id::text,
      highlight_row.matchday_id,
      'opening',
      null,
      highlight_row.sort_order + 1,
      'matchday_highlights',
      highlight_row.id,
      'highlight_' || highlight_row.sort_order::text,
      null,
      null,
      highlight_row.link_url
    from public.matchday_highlights as highlight_row
    where (
      p_matchday_ids is null
      or highlight_row.matchday_id = any(p_matchday_ids)
    )
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(highlight_row.status, ''))
      ) = 'published'
      and highlight_row.sort_order between 1 and 3

    union all

    -- Abertura 5: Contexto. side_block nunca vira placement_type próprio.
    select
      'matchday_editorials:' || editorial_row.id::text || ':context',
      editorial_row.matchday_id,
      'opening',
      null,
      5,
      'matchday_editorials',
      editorial_row.id,
      'context',
      null,
      null,
      editorial_row.side_block_link_url
    from public.matchday_editorials as editorial_row
    where (
      p_matchday_ids is null
      or editorial_row.matchday_id = any(p_matchday_ids)
    )
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(editorial_row.side_block_status, ''))
      ) = 'published'

    union all

    -- Faixa: posições esparsas positivas, sem limite artificial.
    select
      'matchday_horizontal_news:' || faixa_row.id::text,
      faixa_row.matchday_id,
      'faixa',
      null,
      faixa_row.sort_order,
      'matchday_horizontal_news',
      faixa_row.id,
      'faixa:' || faixa_row.sort_order::text,
      null,
      null,
      faixa_row.link_url
    from public.matchday_horizontal_news as faixa_row
    where (
      p_matchday_ids is null
      or faixa_row.matchday_id = any(p_matchday_ids)
    )
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(faixa_row.status, ''))
      ) = 'published'

    union all

    -- Seleção manual. Todo live_hierarchical:* e live_beyond_matchday:* fica
    -- deliberadamente excluído até ao Lote 13.
    select
      'matchday_live_layout_items:' || live_row.id::text,
      live_row.matchday_id,
      'selection',
      null,
      pg_catalog.split_part(live_row.slot_type, ':', 2)::integer,
      'matchday_live_layout_items',
      live_row.id,
      live_row.slot_type,
      pg_catalog.lower(
        pg_catalog.btrim(nullif(live_row.source_type, ''))
      ),
      pg_catalog.lower(
        pg_catalog.btrim(nullif(live_row.source_id, ''))
      ),
      live_row.link_url
    from public.matchday_live_layout_items as live_row
    where (
      p_matchday_ids is null
      or live_row.matchday_id = any(p_matchday_ids)
    )
      and live_row.slot_type ~ '^live_four_news:[1-4]$'

    union all

    -- Zonas temáticas. zone_key só atravessa a ponte privada do Lote 3.
    select
      'matchday_editorial_profile_zone_items:' || zone_item.id::text,
      zone_item.matchday_id,
      'zone',
      zone_item.zone_key,
      zone_item.sort_order,
      'matchday_editorial_profile_zone_items',
      zone_item.id,
      'zone:' || zone_item.zone_key || ':' || zone_item.sort_order::text,
      pg_catalog.lower(
        pg_catalog.btrim(nullif(zone_item.source_type, ''))
      ),
      pg_catalog.lower(
        pg_catalog.btrim(nullif(zone_item.source_id, ''))
      ),
      null::text
    from public.matchday_editorial_profile_zone_items as zone_item
    where (
      p_matchday_ids is null
      or zone_item.matchday_id = any(p_matchday_ids)
    )
      and zone_item.profile_key = 'liga_portugal_v1'

    union all

    -- Destaque de Vídeo: a notícia pública ao lado do módulo. Os vídeos de
    -- matchday_roundup_items são fonte funcional, não placement.
    select
      'matchday_editorials:' || editorial_row.id::text || ':video_highlight',
      editorial_row.matchday_id,
      'video_highlight',
      null,
      1,
      'matchday_editorials',
      editorial_row.id,
      'video_highlight',
      null,
      null,
      editorial_row.complementary_link_url
    from public.matchday_editorials as editorial_row
    where (
      p_matchday_ids is null
      or editorial_row.matchday_id = any(p_matchday_ids)
    )
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(editorial_row.complementary_mode, ''))
      ) = 'roundup_video'
      and pg_catalog.lower(
        pg_catalog.btrim(coalesce(editorial_row.complementary_status, ''))
      ) = 'published'
  ),
  normalized_sources as materialized (
    select
      raw_row.*,
      nullif(
        pg_catalog.lower(
          pg_catalog.regexp_replace(
            pg_catalog.split_part(
              pg_catalog.split_part(
                pg_catalog.btrim(coalesce(raw_row.source_link_url, '')),
                '?',
                1
              ),
              '#',
              1
            ),
            '/+$',
            ''
          )
        ),
        ''
      ) as normalized_link_url,
      case
        when raw_row.placement_type = 'opening'
          then raw_row.slot_position not between 1 and 5
        when raw_row.placement_type = 'selection'
          then raw_row.slot_position not between 1 and 4
        when raw_row.placement_type = 'video_highlight'
          then raw_row.slot_position <> 1
        else coalesce(raw_row.slot_position <= 0, true)
      end as invalid_slot_position
    from raw_sources as raw_row
  ),
  bank_candidates as materialized (
    select
      source_row.raw_source_key,
      bank_row.id as bank_item_id,
      pg_catalog.lower(
        pg_catalog.btrim(coalesce(bank_row.status, ''))
      ) as bank_status
    from normalized_sources as source_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.matchday_id = source_row.matchday_id
     and (
       (
         source_row.source_type is not null
         and source_row.source_id is not null
         and pg_catalog.lower(
           pg_catalog.btrim(coalesce(bank_row.source_type, ''))
         ) = source_row.source_type
         and pg_catalog.lower(
           pg_catalog.btrim(coalesce(bank_row.source_id, ''))
         ) = source_row.source_id
       )
       or (
         (
           source_row.source_type is null
           or source_row.source_id is null
         )
         and source_row.normalized_link_url is not null
         and nullif(
           pg_catalog.lower(
             pg_catalog.regexp_replace(
               pg_catalog.split_part(
                 pg_catalog.split_part(
                   pg_catalog.btrim(coalesce(bank_row.link_url, '')),
                   '?',
                   1
                 ),
                 '#',
                 1
               ),
               '/+$',
               ''
             )
           ),
           ''
         ) = source_row.normalized_link_url
       )
     )
  ),
  bank_resolution as materialized (
    select
      source_row.raw_source_key,
      pg_catalog.count(candidate_row.bank_item_id) as candidate_count,
      case
        when pg_catalog.count(candidate_row.bank_item_id) = 1
          then (
            pg_catalog.array_agg(candidate_row.bank_item_id)
              filter (where candidate_row.bank_item_id is not null)
          )[1]
        else null::uuid
      end as bank_item_id,
      case
        when pg_catalog.count(candidate_row.bank_item_id) = 1
          then (
            pg_catalog.array_agg(candidate_row.bank_status)
              filter (where candidate_row.bank_item_id is not null)
          )[1]
        else null::text
      end as bank_status
    from normalized_sources as source_row
    left join bank_candidates as candidate_row
      on candidate_row.raw_source_key = source_row.raw_source_key
    group by source_row.raw_source_key
  ),
  zone_candidates as materialized (
    select
      source_row.raw_source_key,
      projection_row.zone_id
    from normalized_sources as source_row
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = source_row.matchday_id
     and projection_row.legacy_zone_key = source_row.legacy_zone_key
    where source_row.placement_type = 'zone'
  ),
  zone_resolution as materialized (
    select
      source_row.raw_source_key,
      pg_catalog.count(candidate_row.zone_id) as candidate_count,
      case
        when pg_catalog.count(candidate_row.zone_id) = 1
          then (
            pg_catalog.array_agg(candidate_row.zone_id)
              filter (where candidate_row.zone_id is not null)
          )[1]
        else null::uuid
      end as zone_id
    from normalized_sources as source_row
    left join zone_candidates as candidate_row
      on candidate_row.raw_source_key = source_row.raw_source_key
    group by source_row.raw_source_key
  ),
  slot_counts as materialized (
    select
      source_row.matchday_id,
      source_row.placement_type,
      source_row.legacy_zone_key,
      source_row.slot_position,
      pg_catalog.count(*) as source_count
    from normalized_sources as source_row
    group by
      source_row.matchday_id,
      source_row.placement_type,
      source_row.legacy_zone_key,
      source_row.slot_position
  )
  select
    source_row.raw_source_key,
    source_row.matchday_id,
    source_row.placement_type,
    source_row.legacy_zone_key,
    zone_row.zone_id,
    source_row.slot_position,
    source_row.source_relation,
    source_row.source_row_id,
    source_row.source_slot_key,
    source_row.source_type,
    source_row.source_id,
    source_row.source_link_url,
    source_row.normalized_link_url,
    bank_row.bank_item_id,
    bank_row.bank_status,
    bank_row.candidate_count as bank_candidate_count,
    zone_row.candidate_count as zone_candidate_count,
    slot_row.source_count as slot_source_count,
    source_row.invalid_slot_position
  from normalized_sources as source_row
  join bank_resolution as bank_row
    on bank_row.raw_source_key = source_row.raw_source_key
  join zone_resolution as zone_row
    on zone_row.raw_source_key = source_row.raw_source_key
  join slot_counts as slot_row
    on slot_row.matchday_id = source_row.matchday_id
   and slot_row.placement_type = source_row.placement_type
   and slot_row.legacy_zone_key is not distinct from source_row.legacy_zone_key
   and slot_row.slot_position is not distinct from source_row.slot_position;
$function$;

revoke all on function
  jornada_private.derive_matchday_live_layout_placement_shadow(uuid[])
from public, anon, authenticated, service_role;

-- ============================================================
-- 5. PROJETOR CENTRAL SET-BASED
-- ============================================================

create function jornada_private.sync_matchday_live_layout_placement_shadow(
  p_matchday_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_matchday_ids is null
    or pg_catalog.cardinality(p_matchday_ids) = 0
  then
    return;
  end if;

  -- Não-zonas: a identidade estável é Jornada + tipo + posição.
  with desired as materialized (
    select derived_row.*
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      p_matchday_ids
    ) as derived_row
    where derived_row.placement_type <> 'zone'
      and derived_row.bank_candidate_count = 1
      and derived_row.slot_source_count = 1
      and not derived_row.invalid_slot_position
  )
  insert into public.matchday_live_layout_placements as placement_row (
    matchday_id,
    bank_item_id,
    placement_type,
    zone_id,
    slot_position
  )
  select
    desired_row.matchday_id,
    desired_row.bank_item_id,
    desired_row.placement_type,
    null,
    desired_row.slot_position
  from desired as desired_row
  on conflict (
    matchday_id,
    placement_type,
    slot_position
  ) where zone_id is null
  do update
  set bank_item_id = excluded.bank_item_id,
      updated_at = pg_catalog.now()
  where placement_row.bank_item_id is distinct from excluded.bank_item_id;

  -- Zonas: zone_id vem exclusivamente da ponte privada do Lote 3.
  with desired as materialized (
    select derived_row.*
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      p_matchday_ids
    ) as derived_row
    where derived_row.placement_type = 'zone'
      and derived_row.zone_candidate_count = 1
      and derived_row.bank_candidate_count = 1
      and derived_row.slot_source_count = 1
      and not derived_row.invalid_slot_position
  )
  insert into public.matchday_live_layout_placements as placement_row (
    matchday_id,
    bank_item_id,
    placement_type,
    zone_id,
    slot_position
  )
  select
    desired_row.matchday_id,
    desired_row.bank_item_id,
    'zone',
    desired_row.zone_id,
    desired_row.slot_position
  from desired as desired_row
  on conflict (
    matchday_id,
    zone_id,
    slot_position
  ) where placement_type = 'zone'
  do update
  set bank_item_id = excluded.bank_item_id,
      updated_at = pg_catalog.now()
  where placement_row.bank_item_id is distinct from excluded.bank_item_id;

  -- Um source inválido, ambíguo, arquivado ou duplicado não é corrigido. Rows
  -- arquivadas continuam desejadas; os restantes gaps ficam nos diagnósticos.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  desired as materialized (
    select derived_row.*
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      p_matchday_ids
    ) as derived_row
    where derived_row.bank_candidate_count = 1
      and derived_row.slot_source_count = 1
      and not derived_row.invalid_slot_position
      and (
        derived_row.placement_type <> 'zone'
        or derived_row.zone_candidate_count = 1
      )
  )
  delete from public.matchday_live_layout_placements as placement_row
  using targets as target_row
  where placement_row.matchday_id = target_row.matchday_id
    and not exists (
      select 1
      from desired as desired_row
      where desired_row.matchday_id = placement_row.matchday_id
        and desired_row.placement_type = placement_row.placement_type
        and desired_row.slot_position = placement_row.slot_position
        and desired_row.zone_id is not distinct from placement_row.zone_id
    );
end;
$function$;

revoke all on function
  jornada_private.sync_matchday_live_layout_placement_shadow(uuid[])
from public, anon, authenticated, service_role;

-- ============================================================
-- 6. DIAGNÓSTICOS PRIVADOS DERIVADOS
-- ============================================================

create view jornada_private.matchday_live_layout_placement_shadow_diagnostics
with (security_invoker = true)
as
with derived as materialized (
  select *
  from jornada_private.derive_matchday_live_layout_placement_shadow(
    null::uuid[]
  )
),
source_diagnostics as (
  select
    derived_row.matchday_id,
    'unresolved_bank_item'::text as diagnostic_code,
    derived_row.placement_type,
    derived_row.zone_id,
    derived_row.slot_position,
    null::uuid as bank_item_id,
    pg_catalog.jsonb_build_object(
      'source_relation', derived_row.source_relation,
      'source_row_id', derived_row.source_row_id,
      'source_slot_key', derived_row.source_slot_key,
      'normalized_link_url', derived_row.normalized_link_url,
      'source_type', derived_row.source_type,
      'source_id', derived_row.source_id,
      'candidate_count', derived_row.bank_candidate_count
    ) as details
  from derived as derived_row
  where derived_row.bank_candidate_count = 0

  union all

  select
    derived_row.matchday_id,
    'ambiguous_bank_item',
    derived_row.placement_type,
    derived_row.zone_id,
    derived_row.slot_position,
    null,
    pg_catalog.jsonb_build_object(
      'source_relation', derived_row.source_relation,
      'source_row_id', derived_row.source_row_id,
      'source_slot_key', derived_row.source_slot_key,
      'normalized_link_url', derived_row.normalized_link_url,
      'source_type', derived_row.source_type,
      'source_id', derived_row.source_id,
      'candidate_count', derived_row.bank_candidate_count
    )
  from derived as derived_row
  where derived_row.bank_candidate_count > 1

  union all

  select
    derived_row.matchday_id,
    'inactive_bank_item',
    derived_row.placement_type,
    derived_row.zone_id,
    derived_row.slot_position,
    derived_row.bank_item_id,
    pg_catalog.jsonb_build_object(
      'source_relation', derived_row.source_relation,
      'source_row_id', derived_row.source_row_id,
      'source_slot_key', derived_row.source_slot_key,
      'bank_status', derived_row.bank_status
    )
  from derived as derived_row
  where derived_row.bank_candidate_count = 1
    and derived_row.bank_status <> 'active'

  union all

  select
    derived_row.matchday_id,
    'unresolved_zone',
    derived_row.placement_type,
    null,
    derived_row.slot_position,
    derived_row.bank_item_id,
    pg_catalog.jsonb_build_object(
      'source_relation', derived_row.source_relation,
      'source_row_id', derived_row.source_row_id,
      'source_slot_key', derived_row.source_slot_key,
      'legacy_zone_key', derived_row.legacy_zone_key,
      'candidate_count', derived_row.zone_candidate_count
    )
  from derived as derived_row
  where derived_row.placement_type = 'zone'
    and derived_row.zone_candidate_count <> 1

  union all

  select
    derived_row.matchday_id,
    'invalid_slot_position',
    derived_row.placement_type,
    derived_row.zone_id,
    derived_row.slot_position,
    derived_row.bank_item_id,
    pg_catalog.jsonb_build_object(
      'source_relation', derived_row.source_relation,
      'source_row_id', derived_row.source_row_id,
      'source_slot_key', derived_row.source_slot_key
    )
  from derived as derived_row
  where derived_row.invalid_slot_position
),
slot_diagnostics as (
  select
    derived_row.matchday_id,
    'slot_conflict'::text as diagnostic_code,
    derived_row.placement_type,
    derived_row.zone_id,
    derived_row.slot_position,
    null::uuid as bank_item_id,
    pg_catalog.jsonb_build_object(
      'legacy_zone_key', derived_row.legacy_zone_key,
      'source_count', pg_catalog.max(derived_row.slot_source_count),
      'sources', pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'source_relation', derived_row.source_relation,
          'source_row_id', derived_row.source_row_id,
          'source_slot_key', derived_row.source_slot_key
        )
        order by derived_row.raw_source_key
      )
    ) as details
  from derived as derived_row
  where derived_row.slot_source_count > 1
  group by
    derived_row.matchday_id,
    derived_row.placement_type,
    derived_row.legacy_zone_key,
    derived_row.zone_id,
    derived_row.slot_position
),
transversal_diagnostics as (
  select
    placement_row.matchday_id,
    'transversal_duplicate'::text as diagnostic_code,
    null::text as placement_type,
    null::uuid as zone_id,
    null::integer as slot_position,
    placement_row.bank_item_id,
    pg_catalog.jsonb_build_object(
      'placement_count', pg_catalog.count(*),
      'slots', pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'placement_type', placement_row.placement_type,
          'zone_id', placement_row.zone_id,
          'slot_position', placement_row.slot_position
        )
        order by
          placement_row.placement_type,
          placement_row.zone_id,
          placement_row.slot_position
      )
    ) as details
  from public.matchday_live_layout_placements as placement_row
  group by placement_row.matchday_id, placement_row.bank_item_id
  having pg_catalog.count(*) > 1
)
select * from source_diagnostics
union all
select * from slot_diagnostics
union all
select * from transversal_diagnostics;

revoke all on table
  jornada_private.matchday_live_layout_placement_shadow_diagnostics
from public, anon, authenticated, service_role;

comment on view
  jornada_private.matchday_live_layout_placement_shadow_diagnostics
is
  'Private derived diagnostics for unresolved, ambiguous, inactive, invalid, conflicting and transversally duplicated legacy placements. No winner is selected.';

-- ============================================================
-- 7. COALESCING TRANSACIONAL
-- ============================================================

create function jornada_private.enqueue_matchday_live_layout_placement_shadow_sync()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if tg_op in ('UPDATE', 'DELETE') then
    insert into jornada_private.matchday_live_layout_placement_shadow_sync_queue (
      backend_pid,
      transaction_id,
      matchday_id
    )
    values (
      pg_catalog.pg_backend_pid(),
      pg_catalog.pg_current_xact_id(),
      old.matchday_id
    )
    on conflict (backend_pid, transaction_id, matchday_id)
    do nothing;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    insert into jornada_private.matchday_live_layout_placement_shadow_sync_queue (
      backend_pid,
      transaction_id,
      matchday_id
    )
    values (
      pg_catalog.pg_backend_pid(),
      pg_catalog.pg_current_xact_id(),
      new.matchday_id
    )
    on conflict (backend_pid, transaction_id, matchday_id)
    do nothing;
  end if;

  return null;
end;
$function$;

revoke all on function
  jornada_private.enqueue_matchday_live_layout_placement_shadow_sync()
from public, anon, authenticated, service_role;

create function jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_matchday_ids uuid[];
begin
  select pg_catalog.array_agg(
    queue_row.matchday_id
    order by queue_row.matchday_id
  )
  into v_matchday_ids
  from jornada_private.matchday_live_layout_placement_shadow_sync_queue
    as queue_row
  where queue_row.backend_pid = pg_catalog.pg_backend_pid()
    and queue_row.transaction_id = pg_catalog.pg_current_xact_id();

  if v_matchday_ids is null
    or pg_catalog.cardinality(v_matchday_ids) = 0
  then
    return null;
  end if;

  perform jornada_private.sync_matchday_live_layout_placement_shadow(
    v_matchday_ids
  );

  delete from
    jornada_private.matchday_live_layout_placement_shadow_sync_queue
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.pg_current_xact_id();

  return null;
end;
$function$;

revoke all on function
  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
from public, anon, authenticated, service_role;

create trigger matchday_live_layout_placement_editorials_enqueue
  after insert
    or update of
      matchday_id,
      status,
      headline_link_url,
      side_block_status,
      side_block_link_url,
      complementary_mode,
      complementary_status,
      complementary_link_url
    or delete
  on public.matchday_editorials
  for each row
  execute function
    jornada_private.enqueue_matchday_live_layout_placement_shadow_sync();

create trigger matchday_live_layout_placement_highlights_enqueue
  after insert
    or update of matchday_id, status, link_url, sort_order
    or delete
  on public.matchday_highlights
  for each row
  execute function
    jornada_private.enqueue_matchday_live_layout_placement_shadow_sync();

create trigger matchday_live_layout_placement_faixa_enqueue
  after insert
    or update of matchday_id, status, link_url, sort_order
    or delete
  on public.matchday_horizontal_news
  for each row
  execute function
    jornada_private.enqueue_matchday_live_layout_placement_shadow_sync();

create trigger matchday_live_layout_placement_selection_enqueue
  after insert
    or update of matchday_id, slot_type, source_type, source_id
    or delete
  on public.matchday_live_layout_items
  for each row
  execute function
    jornada_private.enqueue_matchday_live_layout_placement_shadow_sync();

create trigger matchday_live_layout_placement_zone_items_enqueue
  after insert
    or update of
      matchday_id,
      profile_key,
      source_type,
      source_id,
      zone_key,
      sort_order
    or delete
  on public.matchday_editorial_profile_zone_items
  for each row
  execute function
    jornada_private.enqueue_matchday_live_layout_placement_shadow_sync();

create trigger matchday_live_layout_placement_bank_enqueue
  after insert
    or update of
      matchday_id,
      source_type,
      source_id,
      link_url,
      status
    or delete
  on public.matchday_editorial_bank_items
  for each row
  execute function
    jornada_private.enqueue_matchday_live_layout_placement_shadow_sync();

create trigger matchday_live_layout_placement_zone_bridge_enqueue
  after insert
    or update of matchday_id, legacy_zone_key, zone_id
    or delete
  on jornada_private.matchday_live_layout_zone_legacy_projection
  for each row
  execute function
    jornada_private.enqueue_matchday_live_layout_placement_shadow_sync();

create constraint trigger matchday_live_layout_placement_shadow_flush
  after insert
  on jornada_private.matchday_live_layout_placement_shadow_sync_queue
  deferrable initially deferred
  for each row
  execute function
    jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue();

-- ============================================================
-- 8. BACKFILL PELA MESMA PROJEÇÃO CENTRAL
-- ============================================================

select jornada_private.sync_matchday_live_layout_placement_shadow(
  coalesce(
    (
      select pg_catalog.array_agg(
        target_row.matchday_id
        order by target_row.matchday_id
      )
      from (
        select editorial_row.matchday_id
        from public.matchday_editorials as editorial_row

        union

        select highlight_row.matchday_id
        from public.matchday_highlights as highlight_row

        union

        select faixa_row.matchday_id
        from public.matchday_horizontal_news as faixa_row

        union

        select live_row.matchday_id
        from public.matchday_live_layout_items as live_row
        where live_row.slot_type ~ '^live_four_news:[1-4]$'

        union

        select zone_item.matchday_id
        from public.matchday_editorial_profile_zone_items as zone_item
        where zone_item.profile_key = 'liga_portugal_v1'

        union

        select bank_row.matchday_id
        from public.matchday_editorial_bank_items as bank_row
      ) as target_row
    ),
    '{}'::uuid[]
  )
);

-- Postcondição genérica: a tabela contém exatamente os slots projetáveis e
-- nenhum dado hardcoded de Jornadas/counts participa na migração.
do $postconditions$
begin
  if exists (
    with targets as materialized (
      select distinct placement_row.matchday_id
      from public.matchday_live_layout_placements as placement_row

      union

      select derived_row.matchday_id
      from jornada_private.derive_matchday_live_layout_placement_shadow(
        null::uuid[]
      ) as derived_row
    ),
    desired as materialized (
      select derived_row.*
      from jornada_private.derive_matchday_live_layout_placement_shadow(
        null::uuid[]
      ) as derived_row
      where derived_row.bank_candidate_count = 1
        and derived_row.slot_source_count = 1
        and not derived_row.invalid_slot_position
        and (
          derived_row.placement_type <> 'zone'
          or derived_row.zone_candidate_count = 1
        )
    )
    select 1
    from targets as target_row
    where exists (
      select 1
      from desired as desired_row
      where desired_row.matchday_id = target_row.matchday_id
        and not exists (
          select 1
          from public.matchday_live_layout_placements as placement_row
          where placement_row.matchday_id = desired_row.matchday_id
            and placement_row.placement_type = desired_row.placement_type
            and placement_row.zone_id is not distinct from desired_row.zone_id
            and placement_row.slot_position = desired_row.slot_position
            and placement_row.bank_item_id = desired_row.bank_item_id
        )
    )
      or exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = target_row.matchday_id
          and not exists (
            select 1
            from desired as desired_row
            where desired_row.matchday_id = placement_row.matchday_id
              and desired_row.placement_type = placement_row.placement_type
              and desired_row.zone_id is not distinct from placement_row.zone_id
              and desired_row.slot_position = placement_row.slot_position
              and desired_row.bank_item_id = placement_row.bank_item_id
          )
      )
  ) then
    raise exception
      'matchday-live-layout-placement-shadow-backfill-mismatch';
  end if;
end;
$postconditions$;

-- ============================================================
-- 9. FECHO DE SEGURANÇA
-- ============================================================

revoke all on function
  jornada_private.derive_matchday_live_layout_placement_shadow(uuid[])
from public, anon, authenticated, service_role;

revoke all on function
  jornada_private.sync_matchday_live_layout_placement_shadow(uuid[])
from public, anon, authenticated, service_role;

revoke all on function
  jornada_private.enqueue_matchday_live_layout_placement_shadow_sync()
from public, anon, authenticated, service_role;

revoke all on function
  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
from public, anon, authenticated, service_role;

revoke all on table
  jornada_private.matchday_live_layout_placement_shadow_sync_queue
from public, anon, authenticated, service_role;

revoke all on table
  jornada_private.matchday_live_layout_placement_shadow_diagnostics
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
