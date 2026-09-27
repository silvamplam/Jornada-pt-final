begin;

-- ============================================================
-- LOTE 3 — ZONAS E BLOCOS DATA-DRIVEN EM SHADOW
--
-- A Mesa legacy continua a autoridade funcional. Estas tabelas são apenas
-- uma projeção shadow da configuração persistida em
-- matchday_editorial_profile_reconcile_control.
-- ============================================================

-- ============================================================
-- 1. PREFLIGHT LEGACY
-- ============================================================

create function jornada_private.validate_matchday_live_layout_shadow_inputs(
  p_matchday_ids uuid[]
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where (
      p_matchday_ids is null
      or control_row.matchday_id = any(p_matchday_ids)
    )
      and (
        control_row.profile_key <> 'liga_portugal_v1'
        or pg_catalog.cardinality(control_row.thematic_zone_order) <> 5
        or not (
          control_row.thematic_zone_order <@ array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other'
          ]::text[]
          and control_row.thematic_zone_order @> array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other'
          ]::text[]
        )
      )
  ) then
    raise exception 'matchday-live-layout-shadow-invalid-zone-order';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where (
      p_matchday_ids is null
      or control_row.matchday_id = any(p_matchday_ids)
    )
      and (
        pg_catalog.jsonb_typeof(control_row.thematic_zone_layouts) <> 'object'
        or not (
          control_row.thematic_zone_layouts ?& array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other'
          ]
        )
        or (
          control_row.thematic_zone_layouts - array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other'
          ]::text[]
        ) <> '{}'::jsonb
        or coalesce(
          control_row.thematic_zone_layouts ->> 'benfica',
          ''
        ) not in (
          'six_news',
          'five_news_balanced',
          'five_news_secondary'
        )
        or coalesce(
          control_row.thematic_zone_layouts ->> 'sporting',
          ''
        ) not in (
          'six_news',
          'five_news_balanced',
          'five_news_secondary'
        )
        or coalesce(
          control_row.thematic_zone_layouts ->> 'fc_porto',
          ''
        ) not in (
          'six_news',
          'five_news_balanced',
          'five_news_secondary'
        )
        or coalesce(
          control_row.thematic_zone_layouts ->> 'other_liga_clubs',
          ''
        ) not in (
          'six_news',
          'five_news_balanced',
          'five_news_secondary'
        )
        or coalesce(
          control_row.thematic_zone_layouts ->> 'outside_liga_other',
          ''
        ) not in (
          'six_news',
          'five_news_balanced',
          'five_news_secondary'
        )
      )
  ) then
    raise exception 'matchday-live-layout-shadow-invalid-zone-layouts';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where (
      p_matchday_ids is null
      or control_row.matchday_id = any(p_matchday_ids)
    )
      and (
        pg_catalog.jsonb_typeof(control_row.thematic_zone_titles) <> 'object'
        or not (
          control_row.thematic_zone_titles ?& array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other'
          ]
        )
        or (
          control_row.thematic_zone_titles - array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other'
          ]::text[]
        ) <> '{}'::jsonb
        or pg_catalog.jsonb_typeof(
          control_row.thematic_zone_titles -> 'benfica'
        ) <> 'string'
        or pg_catalog.jsonb_typeof(
          control_row.thematic_zone_titles -> 'sporting'
        ) <> 'string'
        or pg_catalog.jsonb_typeof(
          control_row.thematic_zone_titles -> 'fc_porto'
        ) <> 'string'
        or pg_catalog.jsonb_typeof(
          control_row.thematic_zone_titles -> 'other_liga_clubs'
        ) <> 'string'
        or pg_catalog.jsonb_typeof(
          control_row.thematic_zone_titles -> 'outside_liga_other'
        ) <> 'string'
        or pg_catalog.char_length(
          pg_catalog.btrim(control_row.thematic_zone_titles ->> 'benfica')
        ) > 120
        or pg_catalog.char_length(
          pg_catalog.btrim(control_row.thematic_zone_titles ->> 'sporting')
        ) > 120
        or pg_catalog.char_length(
          pg_catalog.btrim(control_row.thematic_zone_titles ->> 'fc_porto')
        ) > 120
        or pg_catalog.char_length(
          pg_catalog.btrim(control_row.thematic_zone_titles ->> 'other_liga_clubs')
        ) > 120
        or pg_catalog.char_length(
          pg_catalog.btrim(control_row.thematic_zone_titles ->> 'outside_liga_other')
        ) > 120
      )
  ) then
    raise exception 'matchday-live-layout-shadow-invalid-zone-titles';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where (
      p_matchday_ids is null
      or control_row.matchday_id = any(p_matchday_ids)
    )
      and (
        pg_catalog.cardinality(control_row.thematic_block_order) not in (6, 7)
        or not (
          control_row.thematic_block_order <@ array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other',
            'latest',
            'video'
          ]::text[]
        )
        or not (
          control_row.thematic_block_order @> array[
            'benfica',
            'sporting',
            'fc_porto',
            'other_liga_clubs',
            'outside_liga_other',
            'latest'
          ]::text[]
        )
        or (
          pg_catalog.cardinality(control_row.thematic_block_order) = 7
          and not control_row.thematic_block_order @> array['video']::text[]
        )
      )
  ) then
    raise exception 'matchday-live-layout-shadow-invalid-block-order';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where (
      p_matchday_ids is null
      or control_row.matchday_id = any(p_matchday_ids)
    )
      and control_row.thematic_zone_order is distinct from (
        select pg_catalog.array_agg(
          block_row.block_key
          order by block_row.sort_order
        )
        from pg_catalog.unnest(
          control_row.thematic_block_order
        ) with ordinality as block_row(block_key, sort_order)
        where block_row.block_key not in ('latest', 'video')
      )
  ) then
    raise exception 'matchday-live-layout-shadow-zone-block-order-mismatch';
  end if;
end;
$function$;

revoke all on function
  jornada_private.validate_matchday_live_layout_shadow_inputs(uuid[])
from public, anon, authenticated, service_role;

select jornada_private.validate_matchday_live_layout_shadow_inputs(null::uuid[]);

-- ============================================================
-- 2. TABELAS PÚBLICAS SHADOW
-- ============================================================

create table public.matchday_live_layout_zones (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null
    references public.matchdays(id)
    on delete cascade,
  public_title text not null default '',
  visual_family text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matchday_live_layout_zones_identity_context_key
    unique (id, matchday_id),

  constraint matchday_live_layout_zones_public_title_check
    check (
      pg_catalog.char_length(pg_catalog.btrim(public_title)) <= 120
    ),

  constraint matchday_live_layout_zones_visual_family_check
    check (
      visual_family in (
        'six_news',
        'five_news_balanced',
        'five_news_secondary'
      )
    )
);

create index matchday_live_layout_zones_matchday_idx
on public.matchday_live_layout_zones(matchday_id);

create table public.matchday_live_layout_blocks (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null
    references public.matchdays(id)
    on delete cascade,
  block_type text not null,
  zone_id uuid,
  sort_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint matchday_live_layout_blocks_type_check
    check (
      block_type in ('zone', 'latest', 'video')
    ),

  constraint matchday_live_layout_blocks_zone_shape_check
    check (
      (
        block_type = 'zone'
        and zone_id is not null
      )
      or (
        block_type in ('latest', 'video')
        and zone_id is null
      )
    ),

  constraint matchday_live_layout_blocks_sort_order_check
    check (sort_order > 0),

  constraint matchday_live_layout_blocks_matchday_sort_order_key
    unique (matchday_id, sort_order),

  constraint matchday_live_layout_blocks_zone_context_fk
    foreign key (zone_id, matchday_id)
    references public.matchday_live_layout_zones(id, matchday_id)
    on delete cascade
);

create unique index matchday_live_layout_blocks_zone_once_idx
on public.matchday_live_layout_blocks(zone_id)
where block_type = 'zone';

create unique index matchday_live_layout_blocks_latest_once_idx
on public.matchday_live_layout_blocks(matchday_id)
where block_type = 'latest';

create unique index matchday_live_layout_blocks_video_once_idx
on public.matchday_live_layout_blocks(matchday_id)
where block_type = 'video';

alter table public.matchday_live_layout_zones
  enable row level security;

alter table public.matchday_live_layout_blocks
  enable row level security;

revoke all on table public.matchday_live_layout_zones
from public, anon, authenticated, service_role;

revoke all on table public.matchday_live_layout_blocks
from public, anon, authenticated, service_role;

grant select on table public.matchday_live_layout_zones
to service_role;

grant select on table public.matchday_live_layout_blocks
to service_role;

comment on table public.matchday_live_layout_zones is
  'Shadow data-driven live editorial zones. UUID is the zone identity; semantic classification is intentionally absent.';

comment on table public.matchday_live_layout_blocks is
  'Shadow vertical block order for data-driven live editorial zones plus Latest and Video. Legacy remains authoritative in Lote 3.';

-- ============================================================
-- 3. PONTE LEGACY PRIVADA E FILA TRANSACIONAL
-- ============================================================

create table jornada_private.matchday_live_layout_zone_legacy_projection (
  matchday_id uuid not null,
  legacy_zone_key text not null,
  zone_id uuid not null default gen_random_uuid(),
  created_at timestamptz not null default now(),

  primary key (matchday_id, legacy_zone_key),
  unique (zone_id),

  constraint matchday_live_layout_zone_legacy_projection_key_check
    check (
      legacy_zone_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    ),

  constraint matchday_live_layout_zone_legacy_projection_zone_fk
    foreign key (zone_id, matchday_id)
    references public.matchday_live_layout_zones(id, matchday_id)
    on delete cascade
    deferrable initially deferred
);

create table jornada_private.matchday_live_layout_shadow_sync_queue (
  backend_pid integer not null,
  transaction_id xid8 not null,
  matchday_id uuid not null,
  primary key (backend_pid, transaction_id, matchday_id)
);

revoke all on table
  jornada_private.matchday_live_layout_zone_legacy_projection
from public, anon, authenticated, service_role;

revoke all on table
  jornada_private.matchday_live_layout_shadow_sync_queue
from public, anon, authenticated, service_role;

-- ============================================================
-- 4. PROJEÇÃO CENTRAL SET-BASED
-- ============================================================

create function jornada_private.sync_matchday_live_layout_shadow(
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

  perform jornada_private.validate_matchday_live_layout_shadow_inputs(
    p_matchday_ids
  );

  -- Se a autoridade legacy deixou de existir, o shadow dessa jornada deixa
  -- também de existir. Latest/Video precisam de remoção explícita porque não
  -- dependem de zone_id.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  removed as materialized (
    select target_row.matchday_id
    from targets as target_row
    where not exists (
      select 1
      from public.matchday_editorial_profile_reconcile_control as control_row
      where control_row.matchday_id = target_row.matchday_id
        and control_row.profile_key = 'liga_portugal_v1'
    )
  )
  delete from public.matchday_live_layout_blocks as block_row
  using removed as removed_row
  where block_row.matchday_id = removed_row.matchday_id;

  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  removed as materialized (
    select target_row.matchday_id
    from targets as target_row
    where not exists (
      select 1
      from public.matchday_editorial_profile_reconcile_control as control_row
      where control_row.matchday_id = target_row.matchday_id
        and control_row.profile_key = 'liga_portugal_v1'
    )
  )
  delete from public.matchday_live_layout_zones as zone_row
  using removed as removed_row
  where zone_row.matchday_id = removed_row.matchday_id;

  -- Cria apenas correspondências em falta. A chave legacy nunca sai do
  -- schema privado e nunca participa na identidade pública da zona.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  )
  insert into jornada_private.matchday_live_layout_zone_legacy_projection (
    matchday_id,
    legacy_zone_key
  )
  select
    control_row.matchday_id,
    zone_row.legacy_zone_key
  from controls as control_row
  cross join lateral pg_catalog.unnest(
    control_row.thematic_zone_order
  ) as zone_row(legacy_zone_key)
  on conflict (matchday_id, legacy_zone_key)
  do nothing;

  -- Materializa/atualiza as zonas sem substituir IDs existentes.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  )
  insert into public.matchday_live_layout_zones as zone_row (
    id,
    matchday_id,
    public_title,
    visual_family
  )
  select
    projection_row.zone_id,
    projection_row.matchday_id,
    coalesce(
      control_row.thematic_zone_titles ->> projection_row.legacy_zone_key,
      ''
    ),
    control_row.thematic_zone_layouts ->> projection_row.legacy_zone_key
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
  join controls as control_row
    on control_row.matchday_id = projection_row.matchday_id
  where projection_row.legacy_zone_key = any(
    control_row.thematic_zone_order
  )
  on conflict (id)
  do update
  set public_title = excluded.public_title,
      visual_family = excluded.visual_family,
      updated_at = pg_catalog.now()
  where zone_row.matchday_id = excluded.matchday_id
    and (
      zone_row.public_title is distinct from excluded.public_title
      or zone_row.visual_family is distinct from excluded.visual_family
    );

  -- Remove qualquer projeção privada obsoleta de jornadas ainda existentes.
  -- No contrato atual das cinco zonas isto é normalmente no-op, mas mantém a
  -- ponte removível e coerente sem transformar legacy_zone_key em autoridade.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  ),
  obsolete as materialized (
    select projection_row.zone_id
    from jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
    join controls as control_row
      on control_row.matchday_id = projection_row.matchday_id
    where not (
      projection_row.legacy_zone_key = any(
        control_row.thematic_zone_order
      )
    )
  )
  delete from public.matchday_live_layout_zones as zone_row
  using obsolete as obsolete_row
  where zone_row.id = obsolete_row.zone_id;

  -- Antes de reordenar, desloca apenas rows cujo destino real mudou ou deixou
  -- de existir. Rows já corretas não mexem, preservando updated_at num sync
  -- idempotente. O offset é calculado acima do máximo atual de cada jornada.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  ),
  normalized_blocks as materialized (
    select
      control_row.matchday_id,
      block_row.block_key,
      block_row.sort_order::integer as sort_order
    from controls as control_row
    cross join lateral pg_catalog.unnest(
      case
        when pg_catalog.cardinality(control_row.thematic_block_order) = 6
          then control_row.thematic_block_order || array['video']::text[]
        else control_row.thematic_block_order
      end
    ) with ordinality as block_row(block_key, sort_order)
  ),
  desired as materialized (
    select
      block_row.matchday_id,
      case
        when block_row.block_key in ('latest', 'video')
          then block_row.block_key
        else 'zone'
      end as block_type,
      case
        when block_row.block_key in ('latest', 'video')
          then null::uuid
        else projection_row.zone_id
      end as zone_id,
      block_row.sort_order
    from normalized_blocks as block_row
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = block_row.matchday_id
     and projection_row.legacy_zone_key = block_row.block_key
  ),
  offsets as materialized (
    select
      control_row.matchday_id,
      coalesce(pg_catalog.max(existing_row.sort_order), 0) + 100
        as sort_offset
    from controls as control_row
    left join public.matchday_live_layout_blocks as existing_row
      on existing_row.matchday_id = control_row.matchday_id
    group by control_row.matchday_id
  )
  update public.matchday_live_layout_blocks as existing_row
  set sort_order = existing_row.sort_order + offset_row.sort_offset
  from offsets as offset_row
  where existing_row.matchday_id = offset_row.matchday_id
    and not exists (
      select 1
      from desired as desired_row
      where desired_row.matchday_id = existing_row.matchday_id
        and desired_row.block_type = existing_row.block_type
        and (
          (
            desired_row.block_type = 'zone'
            and desired_row.zone_id = existing_row.zone_id
          )
          or desired_row.block_type in ('latest', 'video')
        )
        and desired_row.sort_order = existing_row.sort_order
    );

  -- Zone blocks: identidade = zone_id.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  ),
  normalized_blocks as materialized (
    select
      control_row.matchday_id,
      block_row.block_key,
      block_row.sort_order::integer as sort_order
    from controls as control_row
    cross join lateral pg_catalog.unnest(
      case
        when pg_catalog.cardinality(control_row.thematic_block_order) = 6
          then control_row.thematic_block_order || array['video']::text[]
        else control_row.thematic_block_order
      end
    ) with ordinality as block_row(block_key, sort_order)
  )
  insert into public.matchday_live_layout_blocks as block_row (
    matchday_id,
    block_type,
    zone_id,
    sort_order
  )
  select
    normalized_row.matchday_id,
    'zone',
    projection_row.zone_id,
    normalized_row.sort_order
  from normalized_blocks as normalized_row
  join jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
    on projection_row.matchday_id = normalized_row.matchday_id
   and projection_row.legacy_zone_key = normalized_row.block_key
  where normalized_row.block_key not in ('latest', 'video')
  on conflict (zone_id) where block_type = 'zone'
  do update
  set sort_order = excluded.sort_order,
      updated_at = pg_catalog.now()
  where block_row.matchday_id = excluded.matchday_id
    and block_row.sort_order is distinct from excluded.sort_order;

  -- Latest: identidade estável dentro da jornada.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  ),
  normalized_blocks as materialized (
    select
      control_row.matchday_id,
      block_row.block_key,
      block_row.sort_order::integer as sort_order
    from controls as control_row
    cross join lateral pg_catalog.unnest(
      case
        when pg_catalog.cardinality(control_row.thematic_block_order) = 6
          then control_row.thematic_block_order || array['video']::text[]
        else control_row.thematic_block_order
      end
    ) with ordinality as block_row(block_key, sort_order)
  )
  insert into public.matchday_live_layout_blocks as block_row (
    matchday_id,
    block_type,
    zone_id,
    sort_order
  )
  select
    normalized_row.matchday_id,
    'latest',
    null,
    normalized_row.sort_order
  from normalized_blocks as normalized_row
  where normalized_row.block_key = 'latest'
  on conflict (matchday_id) where block_type = 'latest'
  do update
  set sort_order = excluded.sort_order,
      updated_at = pg_catalog.now()
  where block_row.sort_order is distinct from excluded.sort_order;

  -- Video: identidade estável dentro da jornada.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  ),
  normalized_blocks as materialized (
    select
      control_row.matchday_id,
      block_row.block_key,
      block_row.sort_order::integer as sort_order
    from controls as control_row
    cross join lateral pg_catalog.unnest(
      case
        when pg_catalog.cardinality(control_row.thematic_block_order) = 6
          then control_row.thematic_block_order || array['video']::text[]
        else control_row.thematic_block_order
      end
    ) with ordinality as block_row(block_key, sort_order)
  )
  insert into public.matchday_live_layout_blocks as block_row (
    matchday_id,
    block_type,
    zone_id,
    sort_order
  )
  select
    normalized_row.matchday_id,
    'video',
    null,
    normalized_row.sort_order
  from normalized_blocks as normalized_row
  where normalized_row.block_key = 'video'
  on conflict (matchday_id) where block_type = 'video'
  do update
  set sort_order = excluded.sort_order,
      updated_at = pg_catalog.now()
  where block_row.sort_order is distinct from excluded.sort_order;

  -- Elimina apenas blocks cuja identidade deixou de fazer parte do estado
  -- desejado. O contrato atual mantém sempre as cinco zones + Latest + Video.
  with targets as materialized (
    select distinct target_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as target_row(matchday_id)
    where target_row.matchday_id is not null
  ),
  controls as materialized (
    select control_row.*
    from public.matchday_editorial_profile_reconcile_control as control_row
    join targets as target_row
      on target_row.matchday_id = control_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
  ),
  normalized_blocks as materialized (
    select
      control_row.matchday_id,
      block_row.block_key,
      block_row.sort_order::integer as sort_order
    from controls as control_row
    cross join lateral pg_catalog.unnest(
      case
        when pg_catalog.cardinality(control_row.thematic_block_order) = 6
          then control_row.thematic_block_order || array['video']::text[]
        else control_row.thematic_block_order
      end
    ) with ordinality as block_row(block_key, sort_order)
  ),
  desired as materialized (
    select
      normalized_row.matchday_id,
      case
        when normalized_row.block_key in ('latest', 'video')
          then normalized_row.block_key
        else 'zone'
      end as block_type,
      case
        when normalized_row.block_key in ('latest', 'video')
          then null::uuid
        else projection_row.zone_id
      end as zone_id
    from normalized_blocks as normalized_row
    left join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = normalized_row.matchday_id
     and projection_row.legacy_zone_key = normalized_row.block_key
  )
  delete from public.matchday_live_layout_blocks as block_row
  using controls as control_row
  where block_row.matchday_id = control_row.matchday_id
    and not exists (
      select 1
      from desired as desired_row
      where desired_row.matchday_id = block_row.matchday_id
        and desired_row.block_type = block_row.block_type
        and (
          (
            desired_row.block_type = 'zone'
            and desired_row.zone_id = block_row.zone_id
          )
          or desired_row.block_type in ('latest', 'video')
        )
    );
end;
$function$;

revoke all on function
  jornada_private.sync_matchday_live_layout_shadow(uuid[])
from public, anon, authenticated, service_role;

-- ============================================================
-- 5. COALESCING TRANSACIONAL
-- ============================================================

create function jornada_private.enqueue_matchday_live_layout_shadow_sync()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_matchday_id uuid;
begin
  if tg_op = 'DELETE' then
    v_matchday_id := old.matchday_id;
  else
    v_matchday_id := new.matchday_id;
  end if;

  insert into jornada_private.matchday_live_layout_shadow_sync_queue (
    backend_pid,
    transaction_id,
    matchday_id
  )
  values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.pg_current_xact_id(),
    v_matchday_id
  )
  on conflict (backend_pid, transaction_id, matchday_id)
  do nothing;

  return null;
end;
$function$;

revoke all on function
  jornada_private.enqueue_matchday_live_layout_shadow_sync()
from public, anon, authenticated, service_role;

create function jornada_private.flush_matchday_live_layout_shadow_sync_queue()
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
  from jornada_private.matchday_live_layout_shadow_sync_queue as queue_row
  where queue_row.backend_pid = pg_catalog.pg_backend_pid()
    and queue_row.transaction_id = pg_catalog.pg_current_xact_id();

  if v_matchday_ids is null
    or pg_catalog.cardinality(v_matchday_ids) = 0
  then
    return null;
  end if;

  perform jornada_private.sync_matchday_live_layout_shadow(
    v_matchday_ids
  );

  delete from jornada_private.matchday_live_layout_shadow_sync_queue
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.pg_current_xact_id();

  return null;
end;
$function$;

revoke all on function
  jornada_private.flush_matchday_live_layout_shadow_sync_queue()
from public, anon, authenticated, service_role;

create trigger matchday_live_layout_shadow_enqueue
  after insert
    or update of
      thematic_zone_order,
      thematic_zone_layouts,
      thematic_zone_titles,
      thematic_block_order
    or delete
  on public.matchday_editorial_profile_reconcile_control
  for each row
  execute function jornada_private.enqueue_matchday_live_layout_shadow_sync();

create constraint trigger matchday_live_layout_shadow_flush
  after insert
  on jornada_private.matchday_live_layout_shadow_sync_queue
  deferrable initially deferred
  for each row
  execute function jornada_private.flush_matchday_live_layout_shadow_sync_queue();

-- ============================================================
-- 6. BACKFILL PELA MESMA PROJEÇÃO CENTRAL
-- ============================================================

select jornada_private.sync_matchday_live_layout_shadow(
  coalesce(
    (
      select pg_catalog.array_agg(
        control_row.matchday_id
        order by control_row.matchday_id
      )
      from public.matchday_editorial_profile_reconcile_control as control_row
      where control_row.profile_key = 'liga_portugal_v1'
    ),
    '{}'::uuid[]
  )
);

-- Postcondições: toda a autoridade legacy tem exatamente cinco zonas shadow e
-- sete blocks normalizados; títulos/famílias/ordem coincidem e não há cross-
-- matchday entre zone e block.
do $postconditions$
begin
  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where control_row.profile_key = 'liga_portugal_v1'
      and (
        select pg_catalog.count(*)
        from public.matchday_live_layout_zones as zone_row
        where zone_row.matchday_id = control_row.matchday_id
      ) <> 5
  ) then
    raise exception 'matchday-live-layout-shadow-backfill-zone-count-mismatch';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where control_row.profile_key = 'liga_portugal_v1'
      and (
        select pg_catalog.count(*)
        from public.matchday_live_layout_blocks as block_row
        where block_row.matchday_id = control_row.matchday_id
      ) <> 7
  ) then
    raise exception 'matchday-live-layout-shadow-backfill-block-count-mismatch';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    cross join lateral pg_catalog.unnest(
      control_row.thematic_zone_order
    ) as legacy_zone(legacy_zone_key)
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = control_row.matchday_id
     and projection_row.legacy_zone_key = legacy_zone.legacy_zone_key
    join public.matchday_live_layout_zones as zone_row
      on zone_row.id = projection_row.zone_id
     and zone_row.matchday_id = projection_row.matchday_id
    where control_row.profile_key = 'liga_portugal_v1'
      and (
        zone_row.public_title is distinct from coalesce(
          control_row.thematic_zone_titles ->> legacy_zone.legacy_zone_key,
          ''
        )
        or zone_row.visual_family is distinct from
          control_row.thematic_zone_layouts ->> legacy_zone.legacy_zone_key
      )
  ) then
    raise exception 'matchday-live-layout-shadow-backfill-zone-data-mismatch';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where control_row.profile_key = 'liga_portugal_v1'
      and (
        select pg_catalog.array_agg(
          case
            when block_row.block_type = 'zone'
              then projection_row.legacy_zone_key
            else block_row.block_type
          end
          order by block_row.sort_order
        )
        from public.matchday_live_layout_blocks as block_row
        left join jornada_private.matchday_live_layout_zone_legacy_projection
          as projection_row
          on projection_row.matchday_id = block_row.matchday_id
         and projection_row.zone_id = block_row.zone_id
        where block_row.matchday_id = control_row.matchday_id
      ) is distinct from (
        case
          when pg_catalog.cardinality(control_row.thematic_block_order) = 6
            then control_row.thematic_block_order || array['video']::text[]
          else control_row.thematic_block_order
        end
      )
  ) then
    raise exception 'matchday-live-layout-shadow-backfill-block-order-mismatch';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    join public.matchday_live_layout_zones as zone_row
      on zone_row.id = block_row.zone_id
    where block_row.block_type = 'zone'
      and block_row.matchday_id <> zone_row.matchday_id
  ) then
    raise exception 'matchday-live-layout-shadow-backfill-cross-matchday';
  end if;
end;
$postconditions$;

-- ============================================================
-- 7. FECHO DE SEGURANÇA
-- ============================================================

revoke all on all functions in schema jornada_private
from public, anon, authenticated, service_role;

revoke all on all tables in schema jornada_private
from public, anon, authenticated, service_role;

revoke all on schema jornada_private
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
