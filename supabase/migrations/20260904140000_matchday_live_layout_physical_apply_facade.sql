begin;

-- LOTE 7E / PASSO 6A
-- Transactional physical workspace facade. The administrative route is not
-- switched by this migration. Until the first successful facade call for a
-- matchday, the existing legacy writers keep their current behavior.

-- ============================================================
-- 1. PHYSICAL SETTINGS, PER-MATCHDAY CUTOVER AND PRIVATE CONTEXT
-- ============================================================

create table public.matchday_live_layout_workspace_settings (
  matchday_id uuid primary key
    references public.matchdays(id)
    on delete cascade,
  faixa_slot_count integer not null,
  headline_title_color text,
  latest_zone_placement text not null,
  latest_zone_title text not null,
  video_module_active boolean not null,
  created_at timestamptz not null default pg_catalog.now(),
  updated_at timestamptz not null default pg_catalog.now(),

  constraint matchday_live_layout_workspace_settings_faixa_count_check
    check (faixa_slot_count >= 0),
  constraint matchday_live_layout_workspace_settings_headline_color_check
    check (
      headline_title_color is null
      or headline_title_color ~ '^#[0-9A-Fa-f]{6}$'
    ),
  constraint matchday_live_layout_workspace_settings_latest_placement_check
    check (latest_zone_placement in ('top', 'four_news', 'hidden')),
  constraint matchday_live_layout_workspace_settings_latest_title_check
    check (
      pg_catalog.char_length(pg_catalog.btrim(latest_zone_title)) <= 120
    )
);

alter table public.matchday_live_layout_workspace_settings
  enable row level security;

revoke all on table public.matchday_live_layout_workspace_settings
from public, anon, authenticated, service_role;

grant select on table public.matchday_live_layout_workspace_settings
to service_role;

comment on table public.matchday_live_layout_workspace_settings is
  'Authoritative physical live-desk settings. A Faixa vacancy is the absence of a placement inside faixa_slot_count; the extent is never inferred from the last occupied slot.';


create table jornada_private.matchday_live_layout_physical_cutovers (
  matchday_id uuid primary key
    references public.matchdays(id)
    on delete cascade,
  profile_key text not null,
  cutover_at timestamptz not null default pg_catalog.statement_timestamp(),
  constraint matchday_live_layout_physical_cutovers_profile_check
    check (pg_catalog.btrim(profile_key) <> '')
);

alter table jornada_private.matchday_live_layout_physical_cutovers
  enable row level security;

revoke all on table jornada_private.matchday_live_layout_physical_cutovers
from public, anon, authenticated, service_role;

comment on table jornada_private.matchday_live_layout_physical_cutovers is
  'Private per-matchday authority marker. Only the physical facade inserts it, after locked OCC and complete pre-DML validation.';


create table jornada_private.matchday_live_layout_downstream_context (
  backend_pid integer not null,
  transaction_id xid8 not null,
  matchday_id uuid not null,
  nesting_depth integer not null,
  primary key (backend_pid, transaction_id, matchday_id),
  constraint matchday_live_layout_downstream_context_depth_check
    check (nesting_depth > 0)
);

alter table jornada_private.matchday_live_layout_downstream_context
  enable row level security;

revoke all on table jornada_private.matchday_live_layout_downstream_context
from public, anon, authenticated, service_role;


create function jornada_private.begin_matchday_live_layout_downstream_v14(
  p_matchday_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_matchday_id is null then
    raise exception 'matchday-live-layout-downstream-v14-matchday-required';
  end if;

  insert into jornada_private.matchday_live_layout_downstream_context (
    backend_pid,
    transaction_id,
    matchday_id,
    nesting_depth
  ) values (
    pg_catalog.pg_backend_pid(),
    pg_catalog.pg_current_xact_id(),
    p_matchday_id,
    1
  )
  on conflict (backend_pid, transaction_id, matchday_id)
  do update set nesting_depth =
    jornada_private.matchday_live_layout_downstream_context.nesting_depth + 1;
end;
$function$;

revoke all on function
  jornada_private.begin_matchday_live_layout_downstream_v14(uuid)
from public, anon, authenticated, service_role;


create function jornada_private.end_matchday_live_layout_downstream_v14(
  p_matchday_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  update jornada_private.matchday_live_layout_downstream_context
  set nesting_depth = nesting_depth - 1
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.pg_current_xact_id()
    and matchday_id = p_matchday_id
    and nesting_depth > 1;

  if not found then
    delete from jornada_private.matchday_live_layout_downstream_context
    where backend_pid = pg_catalog.pg_backend_pid()
      and transaction_id = pg_catalog.pg_current_xact_id()
      and matchday_id = p_matchday_id;
  end if;
end;
$function$;

revoke all on function
  jornada_private.end_matchday_live_layout_downstream_v14(uuid)
from public, anon, authenticated, service_role;


create function jornada_private.is_matchday_live_layout_downstream_v14(
  p_matchday_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from jornada_private.matchday_live_layout_downstream_context as context_row
    where context_row.backend_pid = pg_catalog.pg_backend_pid()
      and context_row.transaction_id = pg_catalog.pg_current_xact_id()
      and context_row.matchday_id = p_matchday_id
      and context_row.nesting_depth > 0
  );
$function$;

revoke all on function
  jornada_private.is_matchday_live_layout_downstream_v14(uuid)
from public, anon, authenticated, service_role;


create function jornada_private.is_matchday_live_layout_physical_v14(
  p_matchday_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = p_matchday_id
  );
$function$;

revoke all on function
  jornada_private.is_matchday_live_layout_physical_v14(uuid)
from public, anon, authenticated, service_role;


-- ============================================================
-- 2. STRICT PHYSICAL PAYLOAD NORMALIZERS
-- ============================================================

create function jornada_private.normalize_matchday_live_layout_zones_v14(
  p_zones jsonb
)
returns table (
  operation_order bigint,
  zone_id uuid,
  public_title text,
  visual_family text
)
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    raw_row.ordinality,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'id') = 'string'
       and pg_catalog.btrim(raw_row.payload ->> 'id') ~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.btrim(raw_row.payload ->> 'id')::uuid
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'public_title') = 'string'
      then pg_catalog.btrim(raw_row.payload ->> 'public_title')
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'visual_family') = 'string'
      then pg_catalog.lower(pg_catalog.btrim(raw_row.payload ->> 'visual_family'))
      else null
    end
  from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(p_zones) = 'array'
      then p_zones else '[]'::jsonb end
  ) with ordinality as raw_row(payload, ordinality);
$function$;

revoke all on function
  jornada_private.normalize_matchday_live_layout_zones_v14(jsonb)
from public, anon, authenticated, service_role;


create function jornada_private.normalize_matchday_live_layout_blocks_v14(
  p_blocks jsonb
)
returns table (
  operation_order bigint,
  block_id uuid,
  block_type text,
  zone_id uuid,
  sort_order integer
)
language sql
immutable
security invoker
set search_path = ''
as $function$
  select
    raw_row.ordinality,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'id') = 'string'
       and pg_catalog.btrim(raw_row.payload ->> 'id') ~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.btrim(raw_row.payload ->> 'id')::uuid
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'block_type') = 'string'
      then pg_catalog.lower(pg_catalog.btrim(raw_row.payload ->> 'block_type'))
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'zone_id') = 'string'
       and pg_catalog.btrim(raw_row.payload ->> 'zone_id') ~*
           '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then pg_catalog.btrim(raw_row.payload ->> 'zone_id')::uuid
      else null
    end,
    case
      when pg_catalog.jsonb_typeof(raw_row.payload -> 'sort_order') = 'number'
       and raw_row.payload ->> 'sort_order' ~ '^[0-9]+$'
       and (raw_row.payload ->> 'sort_order')::numeric <= 2147483647
      then (raw_row.payload ->> 'sort_order')::integer
      else null
    end
  from pg_catalog.jsonb_array_elements(
    case when pg_catalog.jsonb_typeof(p_blocks) = 'array'
      then p_blocks else '[]'::jsonb end
  ) with ordinality as raw_row(payload, ordinality);
$function$;

revoke all on function
  jornada_private.normalize_matchday_live_layout_blocks_v14(jsonb)
from public, anon, authenticated, service_role;


create function jornada_private.validate_matchday_live_layout_legacy_projection_v14(
  p_matchday_id uuid,
  p_profile_key text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_keys text[];
begin
  if p_profile_key is distinct from 'liga_portugal_v1' then
    raise exception 'matchday-live-layout-physical-v14-profile-unsupported';
  end if;

  select pg_catalog.array_agg(
    projection_row.legacy_zone_key
    order by projection_row.legacy_zone_key
  )
  into v_keys
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
  join public.matchday_live_layout_zones as zone_row
    on zone_row.id = projection_row.zone_id
   and zone_row.matchday_id = projection_row.matchday_id
  where projection_row.matchday_id = p_matchday_id;

  if v_keys is distinct from array[
    'benfica',
    'fc_porto',
    'other_liga_clubs',
    'outside_liga_other',
    'sporting'
  ]::text[] then
    raise exception 'matchday-live-layout-physical-v14-legacy-projection-invalid';
  end if;
end;
$function$;

revoke all on function
  jornada_private.validate_matchday_live_layout_legacy_projection_v14(uuid, text)
from public, anon, authenticated, service_role;


-- ============================================================
-- 3. ADDITIVE V13 TOKEN: EXISTING COMPONENTS PLUS SETTINGS/MARKER
-- ============================================================

create or replace function public.matchday_editorial_profile_workspace_token_v13(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'legacy_workspace', coalesce(
        (
          select legacy_row.state_token
          from public.matchday_editorial_profile_workspace_token_uncached(
            p_matchday_id,
            p_profile_key
          ) as legacy_row
        ),
        ''
      ),
      'bank', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', bank_row.id,
              'source_type', bank_row.source_type,
              'source_id', bank_row.source_id,
              'status', bank_row.status,
              'automatic_eligible', bank_row.automatic_eligible,
              'editorially_worked_at', bank_row.editorially_worked_at,
              'classification_key', bank_row.classification_key,
              'classification_source', bank_row.classification_source,
              'classified_at', bank_row.classified_at,
              'continuity_source_matchday_id',
                bank_row.continuity_source_matchday_id,
              'continuity_source_composition_id',
                bank_row.continuity_source_composition_id
            )
            order by bank_row.id
          )
          from public.matchday_editorial_bank_items as bank_row
          where bank_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'zones', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', zone_row.id,
              'public_title', zone_row.public_title,
              'visual_family', zone_row.visual_family
            )
            order by zone_row.id
          )
          from public.matchday_live_layout_zones as zone_row
          where zone_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'blocks', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', block_row.id,
              'block_type', block_row.block_type,
              'zone_id', block_row.zone_id,
              'sort_order', block_row.sort_order
            )
            order by block_row.sort_order, block_row.id
          )
          from public.matchday_live_layout_blocks as block_row
          where block_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'placements', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'id', placement_row.id,
              'bank_item_id', placement_row.bank_item_id,
              'placement_type', placement_row.placement_type,
              'zone_id', placement_row.zone_id,
              'slot_position', placement_row.slot_position,
              'created_at', placement_row.created_at,
              'updated_at', placement_row.updated_at
            )
            order by
              placement_row.placement_type,
              placement_row.zone_id nulls first,
              placement_row.slot_position,
              placement_row.bank_item_id,
              placement_row.id
          )
          from public.matchday_live_layout_placements as placement_row
          where placement_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'state_memory', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'bank_item_id', memory_row.bank_item_id,
              'memory_kind', memory_row.memory_kind,
              'recorded_at', memory_row.recorded_at
            )
            order by memory_row.bank_item_id
          )
          from public.matchday_live_layout_bank_item_state_memory as memory_row
          where memory_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      ),
      'workspace_settings', coalesce(
        (
          select pg_catalog.jsonb_build_object(
            'matchday_id', settings_row.matchday_id,
            'faixa_slot_count', settings_row.faixa_slot_count,
            'headline_title_color', settings_row.headline_title_color,
            'latest_zone_placement', settings_row.latest_zone_placement,
            'latest_zone_title', settings_row.latest_zone_title,
            'video_module_active', settings_row.video_module_active,
            'created_at', settings_row.created_at,
            'updated_at', settings_row.updated_at
          )
          from public.matchday_live_layout_workspace_settings as settings_row
          where settings_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),
      'physical_cutover', coalesce(
        (
          select pg_catalog.jsonb_build_object(
            'matchday_id', cutover_row.matchday_id,
            'profile_key', cutover_row.profile_key,
            'cutover_at', cutover_row.cutover_at
          )
          from jornada_private.matchday_live_layout_physical_cutovers
            as cutover_row
          where cutover_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      )
    )::text
  ) as state_token;
$function$;

revoke all on function
  public.matchday_editorial_profile_workspace_token_v13(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_editorial_profile_workspace_token_v13(uuid, text)
to service_role;

comment on function
  public.matchday_editorial_profile_workspace_token_v13(uuid, text)
is
  'Physical workspace OCC token. Preserves every v13 component and adds physical settings plus the per-matchday cutover marker, including placement created_at/updated_at, memory recorded_at, settings timestamps and cutover_at.';


-- ============================================================
-- 4. READER V13 EXTENSION (READ-ONLY, SERVICE-ROLE ONLY)
-- ============================================================

alter function public.read_matchday_live_layout_workspace_v13(uuid, text)
rename to read_live_layout_workspace_v13_pre_facade;

alter function public.read_live_layout_workspace_v13_pre_facade(uuid, text)
set schema jornada_private;

revoke all on function
  jornada_private.read_live_layout_workspace_v13_pre_facade(uuid, text)
from public, anon, authenticated, service_role;

create function public.read_matchday_live_layout_workspace_v13(
  p_matchday_id uuid,
  p_profile_key text
)
returns table (
  state_token text,
  zones jsonb,
  blocks jsonb,
  placements jsonb,
  bank_items jsonb,
  state_memory jsonb,
  explicit_bank_item_ids jsonb,
  displaced_bank_item_ids jsonb,
  worked_bank_item_ids jsonb,
  legacy_zone_projection jsonb,
  workspace_settings jsonb,
  physical_cutover jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    base_row.state_token,
    base_row.zones,
    base_row.blocks,
    base_row.placements,
    base_row.bank_items,
    base_row.state_memory,
    base_row.explicit_bank_item_ids,
    base_row.displaced_bank_item_ids,
    base_row.worked_bank_item_ids,
    base_row.legacy_zone_projection,
    coalesce(
      (
        select pg_catalog.jsonb_build_object(
          'matchday_id', settings_row.matchday_id,
          'faixa_slot_count', settings_row.faixa_slot_count,
          'headline_title_color', settings_row.headline_title_color,
          'latest_zone_placement', settings_row.latest_zone_placement,
          'latest_zone_title', settings_row.latest_zone_title,
          'video_module_active', settings_row.video_module_active,
          'created_at', settings_row.created_at,
          'updated_at', settings_row.updated_at
        )
        from public.matchday_live_layout_workspace_settings as settings_row
        where settings_row.matchday_id = p_matchday_id
      ),
      'null'::jsonb
    ) as workspace_settings,
    coalesce(
      (
        select pg_catalog.jsonb_build_object(
          'matchday_id', cutover_row.matchday_id,
          'profile_key', cutover_row.profile_key,
          'cutover_at', cutover_row.cutover_at
        )
        from jornada_private.matchday_live_layout_physical_cutovers
          as cutover_row
        where cutover_row.matchday_id = p_matchday_id
      ),
      'null'::jsonb
    ) as physical_cutover
  from jornada_private.read_live_layout_workspace_v13_pre_facade(
    p_matchday_id,
    p_profile_key
  ) as base_row;
$function$;

revoke all on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
to service_role;

comment on function
  public.read_matchday_live_layout_workspace_v13(uuid, text)
is
  'Coherent read-only v13 physical workspace snapshot extended with authoritative physical settings and the explicit per-matchday cutover marker.';


-- ============================================================
-- 5. LEGACY WRITER FENCE: SAME MATCHDAY ROW LOCK, THEN MARKER
-- ============================================================

create function jornada_private.assert_matchday_live_layout_legacy_writer_v14(
  p_matchday_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_matchday_id is null then
    raise exception 'matchday-live-layout-legacy-v14-matchday-required';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-live-layout-legacy-v14-matchday-not-found';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-legacy-writer-after-physical-cutover';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_legacy_writer_v14(uuid)
from public, anon, authenticated, service_role;


alter function public.apply_matchday_editorial_profile_workspace_v12(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb,jsonb,jsonb
)
rename to apply_profile_workspace_v12_pre_physical_facade;

alter function public.apply_profile_workspace_v12_pre_physical_facade(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb,jsonb,jsonb
)
set schema jornada_private;

revoke all on function
  jornada_private.apply_profile_workspace_v12_pre_physical_facade(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

create function public.apply_matchday_editorial_profile_workspace_v12(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb,
  p_worked_source_ids jsonb,
  p_authoritative_zone_items jsonb,
  p_authoritative_faixa_items jsonb,
  p_displaced_bank_item_ids jsonb,
  p_faixa_arrival_bank_item_ids jsonb,
  p_displaced_arrival_bank_item_ids jsonb
)
returns table (
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.assert_matchday_live_layout_legacy_writer_v14(
    p_matchday_id
  );

  return query
  select *
  from jornada_private.apply_profile_workspace_v12_pre_physical_facade(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls,
    p_selection_bank_item_ids,
    p_video_module,
    p_worked_source_ids,
    p_authoritative_zone_items,
    p_authoritative_faixa_items,
    p_displaced_bank_item_ids,
    p_faixa_arrival_bank_item_ids,
    p_displaced_arrival_bank_item_ids
  );
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_profile_workspace_v12(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v12(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;


alter function public.apply_matchday_editorial_profile_workspace_v11(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb
)
rename to apply_profile_workspace_v11_pre_physical_facade;

alter function public.apply_profile_workspace_v11_pre_physical_facade(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
  jsonb,jsonb,jsonb
)
set schema jornada_private;

revoke all on function
  jornada_private.apply_profile_workspace_v11_pre_physical_facade(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

create function public.apply_matchday_editorial_profile_workspace_v11(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb,
  p_worked_source_ids jsonb,
  p_authoritative_zone_items jsonb,
  p_authoritative_faixa_items jsonb,
  p_displaced_bank_item_ids jsonb
)
returns table (
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.assert_matchday_live_layout_legacy_writer_v14(
    p_matchday_id
  );

  return query
  select *
  from jornada_private.apply_profile_workspace_v11_pre_physical_facade(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls,
    p_selection_bank_item_ids,
    p_video_module,
    p_worked_source_ids,
    p_authoritative_zone_items,
    p_authoritative_faixa_items,
    p_displaced_bank_item_ids
  );
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_profile_workspace_v11(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_editorial_profile_workspace_v11(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,
    jsonb,jsonb,jsonb
  )
to service_role;


alter function public.apply_matchday_editorial_desk_state_v2(
  uuid,bigint,text,boolean,jsonb
)
rename to apply_editorial_desk_v2_pre_physical_facade;

alter function public.apply_editorial_desk_v2_pre_physical_facade(
  uuid,bigint,text,boolean,jsonb
)
set schema jornada_private;

revoke all on function
  jornada_private.apply_editorial_desk_v2_pre_physical_facade(
    uuid,bigint,text,boolean,jsonb
  )
from public, anon, authenticated, service_role;

create function public.apply_matchday_editorial_desk_state_v2(
  p_matchday_id uuid,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_faixa_visible boolean,
  p_articles jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.assert_matchday_live_layout_legacy_writer_v14(
    p_matchday_id
  );

  return jornada_private.apply_editorial_desk_v2_pre_physical_facade(
    p_matchday_id,
    p_expected_revision,
    p_expected_state_token,
    p_faixa_visible,
    p_articles
  );
end;
$function$;

revoke all on function
  public.apply_matchday_editorial_desk_state_v2(
    uuid,bigint,text,boolean,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_editorial_desk_state_v2(
    uuid,bigint,text,boolean,jsonb
  )
to service_role;


-- ============================================================
-- 6. MARKER-AWARE TOPOLOGY SHADOW
-- ============================================================

alter function jornada_private.sync_matchday_live_layout_shadow(uuid[])
rename to sync_live_layout_shadow_pre_physical_facade;

revoke all on function
  jornada_private.sync_live_layout_shadow_pre_physical_facade(uuid[])
from public, anon, authenticated, service_role;

create function jornada_private.sync_matchday_live_layout_shadow(
  p_matchday_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_legacy_matchday_ids uuid[];
begin
  select pg_catalog.array_agg(input_row.matchday_id order by input_row.matchday_id)
  into v_legacy_matchday_ids
  from (
    select distinct raw_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as raw_row(matchday_id)
    where raw_row.matchday_id is not null
      and not exists (
        select 1
        from jornada_private.matchday_live_layout_physical_cutovers
          as cutover_row
        where cutover_row.matchday_id = raw_row.matchday_id
      )
  ) as input_row;

  if v_legacy_matchday_ids is not null then
    perform jornada_private.sync_live_layout_shadow_pre_physical_facade(
      v_legacy_matchday_ids
    );
  end if;
end;
$function$;

revoke all on function
  jornada_private.sync_matchday_live_layout_shadow(uuid[])
from public, anon, authenticated, service_role;


create or replace function
  jornada_private.enqueue_matchday_live_layout_shadow_sync()
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

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = v_matchday_id
  for update;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = v_matchday_id
  ) then
    if not jornada_private.is_matchday_live_layout_downstream_v14(
      v_matchday_id
    ) then
      raise exception 'matchday-live-layout-legacy-topology-after-physical-cutover';
    end if;

    -- Authorized downstream materialization never queues a reverse sync.
    return null;
  end if;

  insert into jornada_private.matchday_live_layout_shadow_sync_queue (
    backend_pid,
    transaction_id,
    matchday_id
  ) values (
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


-- ============================================================
-- 7. MARKER-AWARE LEGACY PLACEMENT FENCE AND SUBSET DRIFT GUARD
-- ============================================================

create function jornada_private.assert_matchday_live_layout_projection_write_v14(
  p_matchday_id uuid,
  p_legacy_changed boolean
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if p_matchday_id is null then
    return;
  end if;

  -- Serializes direct legacy DML with the facade even though both use the
  -- shared rollout advisory lock. The facade already owns this row reentrantly.
  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if coalesce(p_legacy_changed, false)
    and exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = p_matchday_id
    )
    and not jornada_private.is_matchday_live_layout_downstream_v14(
      p_matchday_id
    )
  then
    raise exception 'matchday-live-layout-legacy-placement-after-physical-cutover';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_projection_write_v14(uuid, boolean)
from public, anon, authenticated, service_role;


create or replace function
  jornada_private.enqueue_matchday_live_layout_placement_shadow_sync()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_legacy_changed boolean := true;
  v_bank_changed boolean := false;
  v_matchday_id uuid;
begin
  if tg_table_schema = 'public'
    and tg_table_name = 'matchday_editorial_bank_items'
  then
    v_legacy_changed := false;
    v_bank_changed := tg_op = 'DELETE';

    if tg_op in ('INSERT', 'UPDATE') then
      v_bank_changed := v_bank_changed or exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = new.matchday_id
          and placement_row.bank_item_id = new.id
      );
    end if;

    if tg_op = 'UPDATE' then
      v_bank_changed := v_bank_changed or exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = old.matchday_id
          and placement_row.bank_item_id = old.id
      );
    end if;

    if not v_bank_changed then
      return null;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_matchday_id := old.matchday_id;

    perform jornada_private.assert_matchday_live_layout_projection_write_v14(
      v_matchday_id,
      v_legacy_changed
    );

    if not (
      jornada_private.is_matchday_live_layout_physical_v14(v_matchday_id)
      and jornada_private.is_matchday_live_layout_downstream_v14(v_matchday_id)
    ) then
      insert into jornada_private.matchday_live_layout_placement_shadow_sync_queue (
        backend_pid,
        transaction_id,
        matchday_id,
        legacy_changed,
        bank_changed
      ) values (
        pg_catalog.pg_backend_pid(),
        pg_catalog.pg_current_xact_id(),
        v_matchday_id,
        v_legacy_changed,
        v_bank_changed
      )
      on conflict (backend_pid, transaction_id, matchday_id)
      do update set
        legacy_changed =
          jornada_private.matchday_live_layout_placement_shadow_sync_queue.legacy_changed
          or excluded.legacy_changed,
        bank_changed =
          jornada_private.matchday_live_layout_placement_shadow_sync_queue.bank_changed
          or excluded.bank_changed;
    end if;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_matchday_id := new.matchday_id;

    perform jornada_private.assert_matchday_live_layout_projection_write_v14(
      v_matchday_id,
      v_legacy_changed
    );

    if not (
      jornada_private.is_matchday_live_layout_physical_v14(v_matchday_id)
      and jornada_private.is_matchday_live_layout_downstream_v14(v_matchday_id)
    ) then
      insert into jornada_private.matchday_live_layout_placement_shadow_sync_queue (
        backend_pid,
        transaction_id,
        matchday_id,
        legacy_changed,
        bank_changed
      ) values (
        pg_catalog.pg_backend_pid(),
        pg_catalog.pg_current_xact_id(),
        v_matchday_id,
        v_legacy_changed,
        v_bank_changed
      )
      on conflict (backend_pid, transaction_id, matchday_id)
      do update set
        legacy_changed =
          jornada_private.matchday_live_layout_placement_shadow_sync_queue.legacy_changed
          or excluded.legacy_changed,
        bank_changed =
          jornada_private.matchday_live_layout_placement_shadow_sync_queue.bank_changed
          or excluded.bank_changed;
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function
  jornada_private.enqueue_matchday_live_layout_placement_shadow_sync()
from public, anon, authenticated, service_role;


create or replace function
  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_legacy_matchday_ids uuid[];
  v_bank_only_matchday_ids uuid[];
  v_all_matchday_ids uuid[];
begin
  select
    pg_catalog.array_agg(queue_row.matchday_id order by queue_row.matchday_id),
    pg_catalog.array_agg(queue_row.matchday_id order by queue_row.matchday_id)
      filter (where queue_row.legacy_changed),
    pg_catalog.array_agg(queue_row.matchday_id order by queue_row.matchday_id)
      filter (where queue_row.bank_changed and not queue_row.legacy_changed)
  into
    v_all_matchday_ids,
    v_legacy_matchday_ids,
    v_bank_only_matchday_ids
  from jornada_private.matchday_live_layout_placement_shadow_sync_queue
    as queue_row
  where queue_row.backend_pid = pg_catalog.pg_backend_pid()
    and queue_row.transaction_id = pg_catalog.pg_current_xact_id();

  if v_all_matchday_ids is null
    or pg_catalog.cardinality(v_all_matchday_ids) = 0
  then
    return null;
  end if;

  if v_legacy_matchday_ids is not null and exists (
    select 1
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      v_legacy_matchday_ids
    ) as derived_row
    where derived_row.bank_candidate_count <> 1
      or derived_row.slot_source_count <> 1
      or derived_row.invalid_slot_position
      or (
        derived_row.placement_type = 'zone'
        and derived_row.zone_candidate_count <> 1
      )
  ) then
    raise exception 'matchday-live-layout-legacy-write-drift';
  end if;

  -- Before per-matchday cutover, equality remains the complete legacy/physical
  -- equality. Afterwards, extra physical zones are outside the compatibility
  -- representation and therefore outside this drift comparison only.
  if v_legacy_matchday_ids is not null and (
    exists (
      select
        placement_row.matchday_id,
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = any(v_legacy_matchday_ids)
        and (
          not exists (
            select 1
            from jornada_private.matchday_live_layout_physical_cutovers
              as cutover_row
            where cutover_row.matchday_id = placement_row.matchday_id
          )
          or placement_row.placement_type <> 'zone'
          or exists (
            select 1
            from jornada_private.matchday_live_layout_zone_legacy_projection
              as projection_row
            where projection_row.matchday_id = placement_row.matchday_id
              and projection_row.zone_id = placement_row.zone_id
          )
        )

      except

      select
        derived_row.matchday_id,
        derived_row.bank_item_id,
        derived_row.placement_type,
        derived_row.zone_id,
        derived_row.slot_position
      from jornada_private.derive_matchday_live_layout_placement_shadow(
        v_legacy_matchday_ids
      ) as derived_row
      where derived_row.bank_candidate_count = 1
        and derived_row.slot_source_count = 1
        and not derived_row.invalid_slot_position
        and (
          derived_row.placement_type <> 'zone'
          or derived_row.zone_candidate_count = 1
        )
    )
    or exists (
      select
        derived_row.matchday_id,
        derived_row.bank_item_id,
        derived_row.placement_type,
        derived_row.zone_id,
        derived_row.slot_position
      from jornada_private.derive_matchday_live_layout_placement_shadow(
        v_legacy_matchday_ids
      ) as derived_row
      where derived_row.bank_candidate_count = 1
        and derived_row.slot_source_count = 1
        and not derived_row.invalid_slot_position
        and (
          derived_row.placement_type <> 'zone'
          or derived_row.zone_candidate_count = 1
        )

      except

      select
        placement_row.matchday_id,
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = any(v_legacy_matchday_ids)
        and (
          not exists (
            select 1
            from jornada_private.matchday_live_layout_physical_cutovers
              as cutover_row
            where cutover_row.matchday_id = placement_row.matchday_id
          )
          or placement_row.placement_type <> 'zone'
          or exists (
            select 1
            from jornada_private.matchday_live_layout_zone_legacy_projection
              as projection_row
            where projection_row.matchday_id = placement_row.matchday_id
              and projection_row.zone_id = placement_row.zone_id
          )
        )
    )
  ) then
    raise exception 'matchday-live-layout-legacy-write-rejected';
  end if;

  if v_bank_only_matchday_ids is not null then
    perform jornada_private.project_matchday_live_layout_placements_to_legacy(
      v_bank_only_matchday_ids
    );
  end if;

  delete from jornada_private.matchday_live_layout_placement_shadow_sync_queue
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.pg_current_xact_id();

  return null;
end;
$function$;

revoke all on function
  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
from public, anon, authenticated, service_role;


-- ============================================================
-- 8. DIFFERENTIAL PHYSICAL -> LEGACY PLACEMENT MATERIALIZATION
-- ============================================================

create function
jornada_private.project_matchday_live_layout_placements_downstream_v14(
  p_matchday_id uuid,
  p_profile_key text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_previous_workspace_apply text;
  v_previous_faixa_reconcile text;
begin
  perform jornada_private.validate_matchday_live_layout_legacy_projection_v14(
    p_matchday_id,
    p_profile_key
  );

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-live-layout-downstream-v14-matchday-not-found';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type in (
        'opening',
        'faixa',
        'video_highlight'
      )
      and nullif(pg_catalog.btrim(bank_row.link_url), '') is null
  ) then
    raise exception 'matchday-live-layout-downstream-v14-link-required';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and (
        placement_row.placement_type = 'selection'
        or (
          placement_row.placement_type = 'zone'
          and exists (
            select 1
            from jornada_private.matchday_live_layout_zone_legacy_projection
              as projection_row
            where projection_row.matchday_id = placement_row.matchday_id
              and projection_row.zone_id = placement_row.zone_id
          )
        )
      )
      and (
        nullif(pg_catalog.btrim(bank_row.source_type), '') is null
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) then
    raise exception 'matchday-live-layout-downstream-v14-source-required';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = placement_row.matchday_id
     and projection_row.zone_id = placement_row.zone_id
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'zone'
      and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) <>
          'editorial_article'
  ) then
    raise exception 'matchday-live-layout-downstream-v14-zone-source-unsupported';
  end if;

  v_previous_workspace_apply := pg_catalog.current_setting(
    'jornada.thematic_workspace_apply',
    true
  );
  v_previous_faixa_reconcile := pg_catalog.current_setting(
    'jornada.thematic_faixa_reconcile',
    true
  );

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    p_matchday_id
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

  begin
    insert into public.matchday_editorials (matchday_id, updated_at)
    values (p_matchday_id, pg_catalog.statement_timestamp())
    on conflict (matchday_id) do nothing;

    with desired as materialized (
      select
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
      where placement_row.matchday_id = p_matchday_id
        and placement_row.placement_type in ('opening', 'video_highlight')
    )
    update public.matchday_editorials as editorial_row
    set title = desired.headline_title,
        summary = desired.headline_summary,
        image_url = desired.headline_image_url,
        headline_link_url = desired.headline_link_url,
        status = case
          when desired.headline_link_url is null then 'draft'
          else 'published'
        end,
        side_block_status = case
          when desired.context_link_url is null then 'draft'
          else 'published'
        end,
        side_block_type = case
          when desired.context_link_url is null then null
          else 'article'
        end,
        side_block_label = desired.context_label,
        side_block_label_color = desired.context_label_color,
        side_block_title = desired.context_title,
        side_block_author = null,
        side_block_text = desired.context_text,
        side_block_image_url = desired.context_image_url,
        side_block_link_url = desired.context_link_url,
        complementary_mode = case
          when coalesce(settings_row.video_module_active,
            desired.video_link_url is not null)
          then 'roundup_video'
          else 'none'
        end,
        complementary_status = case
          when desired.video_link_url is null then 'draft'
          else 'published'
        end,
        complementary_label = desired.video_label,
        complementary_title = desired.video_title,
        complementary_text = desired.video_text,
        complementary_image_url = desired.video_image_url,
        complementary_link_url = desired.video_link_url,
        updated_at = pg_catalog.statement_timestamp()
    from desired
    left join public.matchday_live_layout_workspace_settings as settings_row
      on settings_row.matchday_id = p_matchday_id
    where editorial_row.matchday_id = p_matchday_id
      and row(
        editorial_row.title,
        editorial_row.summary,
        editorial_row.image_url,
        editorial_row.headline_link_url,
        editorial_row.status,
        editorial_row.side_block_status,
        editorial_row.side_block_type,
        editorial_row.side_block_label,
        editorial_row.side_block_label_color,
        editorial_row.side_block_title,
        editorial_row.side_block_author,
        editorial_row.side_block_text,
        editorial_row.side_block_image_url,
        editorial_row.side_block_link_url,
        editorial_row.complementary_mode,
        editorial_row.complementary_status,
        editorial_row.complementary_label,
        editorial_row.complementary_title,
        editorial_row.complementary_text,
        editorial_row.complementary_image_url,
        editorial_row.complementary_link_url
      ) is distinct from row(
        desired.headline_title,
        desired.headline_summary,
        desired.headline_image_url,
        desired.headline_link_url,
        case when desired.headline_link_url is null
          then 'draft' else 'published' end,
        case when desired.context_link_url is null
          then 'draft' else 'published' end,
        case when desired.context_link_url is null
          then null else 'article' end,
        desired.context_label,
        desired.context_label_color,
        desired.context_title,
        null,
        desired.context_text,
        desired.context_image_url,
        desired.context_link_url,
        case when coalesce(settings_row.video_module_active,
          desired.video_link_url is not null)
          then 'roundup_video' else 'none' end,
        case when desired.video_link_url is null
          then 'draft' else 'published' end,
        desired.video_label,
        desired.video_title,
        desired.video_text,
        desired.video_image_url,
        desired.video_link_url
      );

    -- Opening highlights: slot identity is sort_order = physical slot - 1.
    delete from public.matchday_highlights as current_row
    where current_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = p_matchday_id
          and placement_row.placement_type = 'opening'
          and placement_row.slot_position between 2 and 4
          and placement_row.slot_position - 1 = current_row.sort_order
      );

    with desired as materialized (
      select
        placement_row.slot_position - 1 as sort_order,
        bank_row.label,
        bank_row.label_color,
        bank_row.title,
        bank_row.subtitle,
        bank_row.image_url,
        bank_row.link_url
      from public.matchday_live_layout_placements as placement_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id = placement_row.bank_item_id
       and bank_row.matchday_id = placement_row.matchday_id
      where placement_row.matchday_id = p_matchday_id
        and placement_row.placement_type = 'opening'
        and placement_row.slot_position between 2 and 4
    )
    update public.matchday_highlights as current_row
    set label = desired.label,
        label_color = desired.label_color,
        title = desired.title,
        subtitle = desired.subtitle,
        image_url = desired.image_url,
        link_url = desired.link_url,
        status = 'published',
        updated_at = pg_catalog.statement_timestamp()
    from desired
    where current_row.matchday_id = p_matchday_id
      and current_row.sort_order = desired.sort_order
      and row(
        current_row.label,
        current_row.label_color,
        current_row.title,
        current_row.subtitle,
        current_row.image_url,
        current_row.link_url,
        current_row.status
      ) is distinct from row(
        desired.label,
        desired.label_color,
        desired.title,
        desired.subtitle,
        desired.image_url,
        desired.link_url,
        'published'
      );

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
      p_matchday_id,
      bank_row.label,
      bank_row.label_color,
      bank_row.title,
      bank_row.subtitle,
      bank_row.image_url,
      bank_row.link_url,
      placement_row.slot_position - 1,
      'published',
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'opening'
      and placement_row.slot_position between 2 and 4
      and not exists (
        select 1
        from public.matchday_highlights as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.sort_order = placement_row.slot_position - 1
      )
    order by placement_row.slot_position;

    -- Faixa slots remain sparse: sort_order is the exact physical slot.
    delete from public.matchday_horizontal_news as current_row
    where current_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = p_matchday_id
          and placement_row.placement_type = 'faixa'
          and placement_row.slot_position = current_row.sort_order
      );

    with desired as materialized (
      select
        placement_row.slot_position as sort_order,
        bank_row.label,
        bank_row.label_color,
        bank_row.title,
        bank_row.subtitle,
        bank_row.image_url,
        bank_row.link_url
      from public.matchday_live_layout_placements as placement_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id = placement_row.bank_item_id
       and bank_row.matchday_id = placement_row.matchday_id
      where placement_row.matchday_id = p_matchday_id
        and placement_row.placement_type = 'faixa'
    )
    update public.matchday_horizontal_news as current_row
    set label = desired.label,
        label_color = desired.label_color,
        title = desired.title,
        subtitle = desired.subtitle,
        image_url = desired.image_url,
        link_url = desired.link_url,
        status = 'published',
        updated_at = pg_catalog.statement_timestamp()
    from desired
    where current_row.matchday_id = p_matchday_id
      and current_row.sort_order = desired.sort_order
      and row(
        current_row.label,
        current_row.label_color,
        current_row.title,
        current_row.subtitle,
        current_row.image_url,
        current_row.link_url,
        current_row.status
      ) is distinct from row(
        desired.label,
        desired.label_color,
        desired.title,
        desired.subtitle,
        desired.image_url,
        desired.link_url,
        'published'
      );

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
      p_matchday_id,
      bank_row.label,
      bank_row.label_color,
      bank_row.title,
      bank_row.subtitle,
      bank_row.image_url,
      bank_row.link_url,
      placement_row.slot_position,
      'published',
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'faixa'
      and not exists (
        select 1
        from public.matchday_horizontal_news as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.sort_order = placement_row.slot_position
      )
    order by placement_row.slot_position;

    delete from public.matchday_live_layout_items as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.slot_type in (
        'live_four_news:1',
        'live_four_news:2',
        'live_four_news:3',
        'live_four_news:4'
      )
      and not exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = p_matchday_id
          and placement_row.placement_type = 'selection'
          and 'live_four_news:' || placement_row.slot_position::text =
              current_row.slot_type
      );

    with desired as materialized (
      select
        'live_four_news:' || placement_row.slot_position::text as slot_type,
        case
          when pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
               'editorial_article'
           and bank_row.source_id ~*
               '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then bank_row.source_id::uuid
          else null
        end as article_id,
        bank_row.label,
        bank_row.title,
        bank_row.subtitle,
        bank_row.image_url,
        bank_row.link_url,
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id
      from public.matchday_live_layout_placements as placement_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id = placement_row.bank_item_id
       and bank_row.matchday_id = placement_row.matchday_id
      where placement_row.matchday_id = p_matchday_id
        and placement_row.placement_type = 'selection'
    )
    update public.matchday_live_layout_items as current_row
    set article_id = desired.article_id,
        label = desired.label,
        title = desired.title,
        subtitle = desired.subtitle,
        image_url = desired.image_url,
        link_url = desired.link_url,
        source_type = desired.source_type,
        source_id = desired.source_id,
        updated_at = pg_catalog.statement_timestamp()
    from desired
    where current_row.matchday_id = p_matchday_id
      and current_row.slot_type = desired.slot_type
      and row(
        current_row.article_id,
        current_row.label,
        current_row.title,
        current_row.subtitle,
        current_row.image_url,
        current_row.link_url,
        current_row.source_type,
        current_row.source_id
      ) is distinct from row(
        desired.article_id,
        desired.label,
        desired.title,
        desired.subtitle,
        desired.image_url,
        desired.link_url,
        desired.source_type,
        desired.source_id
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
      p_matchday_id,
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
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_live_layout_placements as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'selection'
      and not exists (
        select 1
        from public.matchday_live_layout_items as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.slot_type =
              'live_four_news:' || placement_row.slot_position::text
      )
    order by placement_row.slot_position;

    -- Zone compatibility is intentionally a strict subset. Additional zones
    -- have no legacy row and remain untouched in the physical tables.
    delete from public.matchday_editorial_profile_zone_items as current_row
    where current_row.matchday_id = p_matchday_id
      and current_row.profile_key = p_profile_key
      and not exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        join jornada_private.matchday_live_layout_zone_legacy_projection
          as projection_row
          on projection_row.matchday_id = placement_row.matchday_id
         and projection_row.zone_id = placement_row.zone_id
        join public.matchday_editorial_bank_items as bank_row
          on bank_row.id = placement_row.bank_item_id
         and bank_row.matchday_id = placement_row.matchday_id
        where placement_row.matchday_id = p_matchday_id
          and placement_row.placement_type = 'zone'
          and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
              current_row.source_type
          and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
              current_row.source_id
          and projection_row.legacy_zone_key = current_row.zone_key
          and placement_row.slot_position = current_row.sort_order
      );

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
      p_matchday_id,
      p_profile_key,
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
      pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)),
      projection_row.legacy_zone_key,
      placement_row.slot_position,
      pg_catalog.statement_timestamp(),
      pg_catalog.statement_timestamp()
    from public.matchday_live_layout_placements as placement_row
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = placement_row.matchday_id
     and projection_row.zone_id = placement_row.zone_id
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = 'zone'
      and not exists (
        select 1
        from public.matchday_editorial_profile_zone_items as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.profile_key = p_profile_key
          and current_row.source_type =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
          and current_row.source_id =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
          and current_row.zone_key = projection_row.legacy_zone_key
          and current_row.sort_order = placement_row.slot_position
      )
    order by projection_row.legacy_zone_key, placement_row.slot_position;

  exception when others then
    perform pg_catalog.set_config(
      'jornada.thematic_workspace_apply',
      coalesce(v_previous_workspace_apply, ''),
      true
    );
    perform pg_catalog.set_config(
      'jornada.thematic_faixa_reconcile',
      coalesce(v_previous_faixa_reconcile, ''),
      true
    );
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
    raise;
  end;

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    coalesce(v_previous_workspace_apply, ''),
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_faixa_reconcile',
    coalesce(v_previous_faixa_reconcile, ''),
    true
  );
  perform jornada_private.end_matchday_live_layout_downstream_v14(
    p_matchday_id
  );
end;
$function$;

revoke all on function
  jornada_private.project_matchday_live_layout_placements_downstream_v14(
    uuid,
    text
  )
from public, anon, authenticated, service_role;


create or replace function
jornada_private.project_matchday_live_layout_placements_to_legacy(
  p_matchday_ids uuid[]
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_matchday_id uuid;
  v_profile_key text;
begin
  for v_matchday_id in
    select distinct input_row.matchday_id
    from pg_catalog.unnest(p_matchday_ids) as input_row(matchday_id)
    where input_row.matchday_id is not null
    order by input_row.matchday_id
  loop
    select assignment_row.profile_key
    into v_profile_key
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = v_matchday_id;

    if v_profile_key is null then
      raise exception 'matchday-live-layout-downstream-v14-assignment-missing';
    end if;

    perform
      jornada_private.project_matchday_live_layout_placements_downstream_v14(
        v_matchday_id,
        v_profile_key
      );
  end loop;
end;
$function$;

revoke all on function
  jornada_private.project_matchday_live_layout_placements_to_legacy(uuid[])
from public, anon, authenticated, service_role;


create function jornada_private.project_matchday_live_layout_workspace_v14(
  p_matchday_id uuid,
  p_profile_key text
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_zone_order text[];
  v_zone_layouts jsonb;
  v_zone_titles jsonb;
  v_block_order text[];
  v_previous_workspace_apply text;
begin
  perform jornada_private.validate_matchday_live_layout_legacy_projection_v14(
    p_matchday_id,
    p_profile_key
  );

  perform
    jornada_private.project_matchday_live_layout_placements_downstream_v14(
      p_matchday_id,
      p_profile_key
    );

  select pg_catalog.array_agg(
    projection_row.legacy_zone_key
    order by block_row.sort_order, block_row.id
  )
  into v_zone_order
  from public.matchday_live_layout_blocks as block_row
  join jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
    on projection_row.matchday_id = block_row.matchday_id
   and projection_row.zone_id = block_row.zone_id
  where block_row.matchday_id = p_matchday_id
    and block_row.block_type = 'zone';

  select
    pg_catalog.jsonb_object_agg(
      projection_row.legacy_zone_key,
      zone_row.visual_family
    ),
    pg_catalog.jsonb_object_agg(
      projection_row.legacy_zone_key,
      zone_row.public_title
    )
  into v_zone_layouts, v_zone_titles
  from jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
  join public.matchday_live_layout_zones as zone_row
    on zone_row.id = projection_row.zone_id
   and zone_row.matchday_id = projection_row.matchday_id
  where projection_row.matchday_id = p_matchday_id;

  select pg_catalog.array_agg(
    case
      when block_row.block_type = 'zone'
        then projection_row.legacy_zone_key
      else block_row.block_type
    end
    order by block_row.sort_order, block_row.id
  )
  into v_block_order
  from public.matchday_live_layout_blocks as block_row
  left join jornada_private.matchday_live_layout_zone_legacy_projection
    as projection_row
    on projection_row.matchday_id = block_row.matchday_id
   and projection_row.zone_id = block_row.zone_id
  where block_row.matchday_id = p_matchday_id
    and (
      block_row.block_type <> 'zone'
      or projection_row.zone_id is not null
    );

  if pg_catalog.cardinality(v_zone_order) <> 5
    or pg_catalog.cardinality(v_block_order) not in (6, 7)
    or not v_block_order @> array['latest']::text[]
  then
    raise exception 'matchday-live-layout-downstream-v14-topology-invalid';
  end if;

  v_previous_workspace_apply := pg_catalog.current_setting(
    'jornada.thematic_workspace_apply',
    true
  );

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    p_matchday_id
  );
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );

  begin
    update public.matchday_editorial_profile_reconcile_control as control_row
    set thematic_zone_order = v_zone_order,
        thematic_zone_layouts = v_zone_layouts,
        thematic_zone_titles = v_zone_titles,
        thematic_block_order = v_block_order,
        updated_at = pg_catalog.statement_timestamp()
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key
      and row(
        control_row.thematic_zone_order,
        control_row.thematic_zone_layouts,
        control_row.thematic_zone_titles,
        control_row.thematic_block_order
      ) is distinct from row(
        v_zone_order,
        v_zone_layouts,
        v_zone_titles,
        v_block_order
      );

    if not exists (
      select 1
      from public.matchday_editorial_profile_reconcile_control as control_row
      where control_row.matchday_id = p_matchday_id
        and control_row.profile_key = p_profile_key
    ) then
      raise exception 'matchday-live-layout-downstream-v14-control-missing';
    end if;

    update public.matchday_editorials as editorial_row
    set title_color = settings_row.headline_title_color,
        latest_zone_placement = settings_row.latest_zone_placement,
        latest_zone_title = nullif(settings_row.latest_zone_title, ''),
        complementary_mode = case
          when settings_row.video_module_active then 'roundup_video'
          else 'none'
        end,
        updated_at = pg_catalog.statement_timestamp()
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
      and editorial_row.matchday_id = p_matchday_id
      and row(
        editorial_row.title_color,
        editorial_row.latest_zone_placement,
        coalesce(editorial_row.latest_zone_title, ''),
        editorial_row.complementary_mode
      ) is distinct from row(
        settings_row.headline_title_color,
        settings_row.latest_zone_placement,
        settings_row.latest_zone_title,
        case when settings_row.video_module_active
          then 'roundup_video' else 'none' end
      );

  exception when others then
    perform pg_catalog.set_config(
      'jornada.thematic_workspace_apply',
      coalesce(v_previous_workspace_apply, ''),
      true
    );
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
    raise;
  end;

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    coalesce(v_previous_workspace_apply, ''),
    true
  );
  perform jornada_private.end_matchday_live_layout_downstream_v14(
    p_matchday_id
  );

  if exists (
    select 1
    from public.matchday_editorial_profile_reconcile_control as control_row
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key
      and row(
        control_row.thematic_zone_order,
        control_row.thematic_zone_layouts,
        control_row.thematic_zone_titles,
        control_row.thematic_block_order
      ) is distinct from row(
        v_zone_order,
        v_zone_layouts,
        v_zone_titles,
        v_block_order
      )
  ) then
    raise exception 'matchday-live-layout-downstream-v14-topology-postcondition';
  end if;
end;
$function$;

revoke all on function
  jornada_private.project_matchday_live_layout_workspace_v14(uuid, text)
from public, anon, authenticated, service_role;


create function jornada_private.assert_matchday_live_layout_downstream_v14(
  p_matchday_id uuid,
  p_profile_key text
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.validate_matchday_live_layout_legacy_projection_v14(
    p_matchday_id,
    p_profile_key
  );

  if exists (
    select 1
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      array[p_matchday_id]::uuid[]
    ) as derived_row
    where derived_row.bank_candidate_count <> 1
      or derived_row.slot_source_count <> 1
      or derived_row.invalid_slot_position
      or (
        derived_row.placement_type = 'zone'
        and derived_row.zone_candidate_count <> 1
      )
  ) then
    raise exception 'matchday-live-layout-downstream-v14-derived-invalid';
  end if;

  if exists (
    select
      placement_row.matchday_id,
      placement_row.bank_item_id,
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and (
        placement_row.placement_type <> 'zone'
        or exists (
          select 1
          from jornada_private.matchday_live_layout_zone_legacy_projection
            as projection_row
          where projection_row.matchday_id = placement_row.matchday_id
            and projection_row.zone_id = placement_row.zone_id
        )
      )

    except

    select
      derived_row.matchday_id,
      derived_row.bank_item_id,
      derived_row.placement_type,
      derived_row.zone_id,
      derived_row.slot_position
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      array[p_matchday_id]::uuid[]
    ) as derived_row
    where derived_row.bank_candidate_count = 1
      and derived_row.slot_source_count = 1
      and not derived_row.invalid_slot_position
      and (
        derived_row.placement_type <> 'zone'
        or derived_row.zone_candidate_count = 1
      )
  ) or exists (
    select
      derived_row.matchday_id,
      derived_row.bank_item_id,
      derived_row.placement_type,
      derived_row.zone_id,
      derived_row.slot_position
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      array[p_matchday_id]::uuid[]
    ) as derived_row
    where derived_row.bank_candidate_count = 1
      and derived_row.slot_source_count = 1
      and not derived_row.invalid_slot_position
      and (
        derived_row.placement_type <> 'zone'
        or derived_row.zone_candidate_count = 1
      )

    except

    select
      placement_row.matchday_id,
      placement_row.bank_item_id,
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and (
        placement_row.placement_type <> 'zone'
        or exists (
          select 1
          from jornada_private.matchday_live_layout_zone_legacy_projection
            as projection_row
          where projection_row.matchday_id = placement_row.matchday_id
            and projection_row.zone_id = placement_row.zone_id
        )
      )
  ) then
    raise exception 'matchday-live-layout-downstream-v14-postcondition';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_downstream_v14(uuid, text)
from public, anon, authenticated, service_role;


-- ============================================================
-- 9. SINGLE TRANSACTIONAL PHYSICAL WORKSPACE FACADE
-- ============================================================

create function public.apply_matchday_live_layout_physical_workspace_v14(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_physical_state_token text,
  p_zones jsonb,
  p_blocks jsonb,
  p_placements jsonb,
  p_faixa_slot_count integer,
  p_explicit_bank_item_ids jsonb,
  p_displaced_bank_item_ids jsonb,
  p_worked_bank_item_ids jsonb,
  p_faixa_arrival_bank_item_ids jsonb,
  p_displaced_arrival_bank_item_ids jsonb,
  p_presentation jsonb
)
returns table (
  state_token text,
  applied_zone_count integer,
  applied_block_count integer,
  applied_placement_count integer,
  explicit_bank_item_count integer,
  displaced_bank_item_count integer,
  worked_bank_item_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_assignment_profile_key text;
  v_current_state_token text;
  v_final_state_token text;
  v_plan jsonb := '[]'::jsonb;
  v_placements_before jsonb := '[]'::jsonb;
  v_faixa_before jsonb := '[]'::jsonb;
  v_displaced_before jsonb := '[]'::jsonb;
  v_zones_before jsonb := '[]'::jsonb;
  v_blocks_before jsonb := '[]'::jsonb;
  v_settings_before jsonb := 'null'::jsonb;
  v_classification_before text;
  v_faixa_anchor timestamptz;
  v_displaced_anchor timestamptz;
  v_block_offset integer;
  v_had_cutover boolean;
  v_had_settings boolean;
begin
  -- Envelope validation is deliberately before locks. It performs no DML and
  -- does not attempt to repair or normalize a malformed request.
  if p_matchday_id is null
    or p_profile_key is null
    or pg_catalog.btrim(p_profile_key) = ''
    or p_expected_physical_state_token is null
    or pg_catalog.btrim(p_expected_physical_state_token) = ''
    or pg_catalog.btrim(p_expected_physical_state_token) !~
       '^[0-9a-f]{32}$'
    or p_zones is null
    or pg_catalog.jsonb_typeof(p_zones) <> 'array'
    or p_blocks is null
    or pg_catalog.jsonb_typeof(p_blocks) <> 'array'
    or p_placements is null
    or pg_catalog.jsonb_typeof(p_placements) <> 'array'
    or p_faixa_slot_count is null
    or p_faixa_slot_count < 0
    or p_explicit_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_explicit_bank_item_ids) <> 'array'
    or p_displaced_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_displaced_bank_item_ids) <> 'array'
    or p_worked_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_worked_bank_item_ids) <> 'array'
    or p_faixa_arrival_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_faixa_arrival_bank_item_ids) <> 'array'
    or p_displaced_arrival_bank_item_ids is null
    or pg_catalog.jsonb_typeof(p_displaced_arrival_bank_item_ids) <> 'array'
    or p_presentation is null
    or pg_catalog.jsonb_typeof(p_presentation) <> 'object'
  then
    raise exception 'matchday-live-layout-physical-v14-invalid-input';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_zones) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(raw_row.payload) as key_row(key_name)
      ) <> 3
      or not raw_row.payload ?& array[
        'id', 'public_title', 'visual_family'
      ]
  ) then
    raise exception 'matchday-live-layout-physical-v14-zone-shape-invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_blocks) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(raw_row.payload) as key_row(key_name)
      ) <> 4
      or not raw_row.payload ?& array[
        'id', 'block_type', 'zone_id', 'sort_order'
      ]
  ) then
    raise exception 'matchday-live-layout-physical-v14-block-shape-invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_placements) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload) <> 'object'
      or (
        select pg_catalog.count(*)
        from pg_catalog.jsonb_object_keys(raw_row.payload) as key_row(key_name)
      ) <> 4
      or not raw_row.payload ?& array[
        'bank_item_id', 'placement_type', 'zone_id', 'slot_position'
      ]
  ) then
    raise exception 'matchday-live-layout-physical-v14-placement-shape-invalid';
  end if;

  if not p_presentation ?& array[
    'headline_title_color',
    'latest_zone_placement',
    'latest_zone_title',
    'video_module_active'
  ] or (
    p_presentation - array[
      'headline_title_color',
      'latest_zone_placement',
      'latest_zone_title',
      'video_module_active'
    ]::text[]
  ) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'headline_title_color'
    ) not in ('null', 'string')
    or (
      pg_catalog.jsonb_typeof(
        p_presentation -> 'headline_title_color'
      ) = 'string'
      and pg_catalog.btrim(
        p_presentation ->> 'headline_title_color'
      ) !~ '^#[0-9A-Fa-f]{6}$'
    )
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'latest_zone_placement'
    ) <> 'string'
    or p_presentation ->> 'latest_zone_placement' not in (
      'top', 'four_news', 'hidden'
    )
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'latest_zone_title'
    ) <> 'string'
    or pg_catalog.char_length(
      pg_catalog.btrim(p_presentation ->> 'latest_zone_title')
    ) > 120
    or pg_catalog.jsonb_typeof(
      p_presentation -> 'video_module_active'
    ) <> 'boolean'
  then
    raise exception 'matchday-live-layout-physical-v14-presentation-invalid';
  end if;

  if exists (
    select 1
    from (
      select p_explicit_bank_item_ids as payload
      union all select p_displaced_bank_item_ids
      union all select p_worked_bank_item_ids
      union all select p_faixa_arrival_bank_item_ids
      union all select p_displaced_arrival_bank_item_ids
    ) as list_row
    cross join lateral pg_catalog.jsonb_array_elements(list_row.payload)
      as raw_row(value)
    where pg_catalog.jsonb_typeof(raw_row.value) <> 'string'
      or pg_catalog.btrim(raw_row.value #>> '{}') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ) then
    raise exception 'matchday-live-layout-physical-v14-bank-list-invalid';
  end if;

  -- Lock order is the same as existing physical/legacy entrypoints. The
  -- external token is checked after both locks and before the first DML.
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-live-layout-physical-v14-matchday-not-found';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-live-layout-physical-v14-matchday-not-live';
  end if;

  select assignment_row.profile_key
  into v_assignment_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id;

  if v_assignment_profile_key is distinct from p_profile_key then
    raise exception 'matchday-live-layout-physical-v14-profile-mismatch';
  end if;

  select token_row.state_token
  into v_current_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  if v_current_state_token is distinct from
     p_expected_physical_state_token
  then
    raise exception 'matchday-live-layout-physical-v14-concurrent-write';
  end if;

  -- Everything below this point and above the marker insert remains read-only.
  select exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = p_matchday_id
  ) into v_had_cutover;

  select exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
  ) into v_had_settings;

  if v_had_cutover is distinct from v_had_settings then
    raise exception 'matchday-live-layout-physical-v14-authority-state-corrupt';
  end if;

  if v_had_cutover and exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as cutover_row
    where cutover_row.matchday_id = p_matchday_id
      and cutover_row.profile_key is distinct from p_profile_key
  ) then
    raise exception 'matchday-live-layout-physical-v14-cutover-profile-mismatch';
  end if;

  perform jornada_private.validate_matchday_live_layout_legacy_projection_v14(
    p_matchday_id,
    p_profile_key
  );

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
    where zone_row.zone_id is null
      or zone_row.public_title is null
      or zone_row.public_title = ''
      or pg_catalog.char_length(zone_row.public_title) > 120
      or zone_row.visual_family not in (
        'six_news', 'five_news_balanced', 'five_news_secondary'
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-zone-value-invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
  ) <> (
    select pg_catalog.count(distinct zone_row.zone_id)
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
  ) then
    raise exception 'matchday-live-layout-physical-v14-zone-duplicate';
  end if;

  if exists (
    (
      select zone_row.id
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id = p_matchday_id
      except
      select desired_row.zone_id
      from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
        as desired_row
    )
    union all
    (
      select desired_row.zone_id
      from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
        as desired_row
      except
      select zone_row.id
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id = p_matchday_id
    )
  ) then
    raise exception 'matchday-live-layout-physical-v14-zone-set-mismatch';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_id is null
      or block_row.block_type not in ('zone', 'latest', 'video')
      or block_row.sort_order is null
      or block_row.sort_order <= 0
      or block_row.sort_order > 1000000000
      or not (
        (block_row.block_type = 'zone' and block_row.zone_id is not null)
        or (
          block_row.block_type in ('latest', 'video')
          and block_row.zone_id is null
        )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-block-value-invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
  ) <> (
    select pg_catalog.count(distinct block_row.block_id)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    group by block_row.sort_order
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-physical-v14-block-duplicate';
  end if;

  if exists (
    (
      select block_row.id
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
      except
      select desired_row.block_id
      from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
        as desired_row
    )
    union all
    (
      select desired_row.block_id
      from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
        as desired_row
      except
      select block_row.id
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
    )
  ) then
    raise exception 'matchday-live-layout-physical-v14-block-set-mismatch';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as desired_row
    join public.matchday_live_layout_blocks as current_row
      on current_row.id = desired_row.block_id
     and current_row.matchday_id = p_matchday_id
    where current_row.block_type is distinct from desired_row.block_type
      or current_row.zone_id is distinct from desired_row.zone_id
  ) then
    raise exception 'matchday-live-layout-physical-v14-block-identity-mismatch';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
    where (
      select pg_catalog.count(*)
      from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
        as block_row
      where block_row.block_type = 'zone'
        and block_row.zone_id = zone_row.zone_id
    ) <> 1
  ) or (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_type = 'latest'
  ) <> 1 or (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_type = 'video'
  ) > 1 then
    raise exception 'matchday-live-layout-physical-v14-block-topology-invalid';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_array_elements(p_placements) as raw_row(payload)
    where pg_catalog.jsonb_typeof(raw_row.payload -> 'bank_item_id') <> 'string'
      or pg_catalog.btrim(raw_row.payload ->> 'bank_item_id') !~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      or pg_catalog.jsonb_typeof(raw_row.payload -> 'placement_type') <>
         'string'
      or pg_catalog.lower(
           pg_catalog.btrim(raw_row.payload ->> 'placement_type')
         ) not in ('opening', 'faixa', 'selection', 'video_highlight', 'zone')
      or pg_catalog.jsonb_typeof(raw_row.payload -> 'slot_position') <>
         'number'
      or raw_row.payload ->> 'slot_position' !~ '^[0-9]+$'
      or (raw_row.payload ->> 'slot_position')::numeric > 2147483647
      or not (
        (
          pg_catalog.lower(
            pg_catalog.btrim(raw_row.payload ->> 'placement_type')
          ) = 'zone'
          and pg_catalog.jsonb_typeof(raw_row.payload -> 'zone_id') =
              'string'
          and pg_catalog.btrim(raw_row.payload ->> 'zone_id') ~*
              '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        )
        or (
          pg_catalog.lower(
            pg_catalog.btrim(raw_row.payload ->> 'placement_type')
          ) <> 'zone'
          and pg_catalog.jsonb_typeof(raw_row.payload -> 'zone_id') = 'null'
        )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-placement-value-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    where placement_row.bank_item_id is null
      or placement_row.slot_position is null
      or placement_row.slot_position <= 0
      or not (
        (
          placement_row.placement_type = 'opening'
          and placement_row.zone_id is null
          and placement_row.slot_position between 1 and 5
        )
        or (
          placement_row.placement_type = 'faixa'
          and placement_row.zone_id is null
          and placement_row.slot_position <= p_faixa_slot_count
        )
        or (
          placement_row.placement_type = 'selection'
          and placement_row.zone_id is null
          and placement_row.slot_position between 1 and 4
        )
        or (
          placement_row.placement_type = 'video_highlight'
          and placement_row.zone_id is null
          and placement_row.slot_position = 1
        )
        or (
          placement_row.placement_type = 'zone'
          and placement_row.zone_id is not null
        )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-placement-target-invalid';
  end if;

  if (
    select pg_catalog.count(*)
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    )
  ) <> (
    select pg_catalog.count(distinct placement_row.bank_item_id)
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    group by
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-physical-v14-placement-duplicate';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
      as zone_row
      on zone_row.zone_id = placement_row.zone_id
    where placement_row.placement_type = 'zone'
      and placement_row.slot_position > jornada_private
          .matchday_live_layout_visual_family_capacity_v13(
            zone_row.visual_family
          )
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    where placement_row.placement_type = 'zone'
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_zones_v14(p_zones)
          as zone_row
        where zone_row.zone_id = placement_row.zone_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-zone-capacity-invalid';
  end if;

  if not (p_presentation ->> 'video_module_active')::boolean
    and exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as placement_row
      where placement_row.placement_type = 'video_highlight'
    )
  then
    raise exception 'matchday-live-layout-physical-v14-video-state-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    where placement_row.placement_type = 'video_highlight'
  ) and not exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_blocks_v14(p_blocks)
      as block_row
    where block_row.block_type = 'video'
  ) then
    raise exception 'matchday-live-layout-physical-v14-video-block-missing';
  end if;

  if exists (
    select 1
    from (
      select p_explicit_bank_item_ids as payload
      union all select p_displaced_bank_item_ids
      union all select p_worked_bank_item_ids
      union all select p_faixa_arrival_bank_item_ids
      union all select p_displaced_arrival_bank_item_ids
    ) as list_row
    cross join lateral (
      select
        pg_catalog.count(*) as item_count,
        pg_catalog.count(distinct normalized_row.bank_item_id) as unique_count
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        list_row.payload
      ) as normalized_row
    ) as count_row
    where count_row.item_count <> count_row.unique_count
  ) then
    raise exception 'matchday-live-layout-physical-v14-bank-list-duplicate';
  end if;

  if exists (
    with requested as materialized (
      select placement_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as placement_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_explicit_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_worked_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_faixa_arrival_bank_item_ids
      ) as list_row
      union
      select list_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_arrival_bank_item_ids
      ) as list_row
    )
    select 1
    from requested as requested_row
    left join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = requested_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
     and pg_catalog.lower(pg_catalog.btrim(coalesce(bank_row.status, ''))) =
         'active'
    where bank_row.id is null
  ) then
    raise exception 'matchday-live-layout-physical-v14-bank-item-not-active';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = explicit_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) <>
          'editorial_article'
  ) then
    raise exception 'matchday-live-layout-physical-v14-explicit-bank-unsupported';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as state_row
    join jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
      on placement_row.bank_item_id = state_row.bank_item_id
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as state_row
    join jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
      on placement_row.bank_item_id = state_row.bank_item_id
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    join jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
      on displaced_row.bank_item_id = explicit_row.bank_item_id
  ) then
    raise exception 'matchday-live-layout-physical-v14-state-conflict';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as current_row
    where current_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
          p_placements
        ) as desired_row
        where desired_row.bank_item_id = current_row.bank_item_id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_explicit_bank_item_ids
        ) as explicit_row
        where explicit_row.bank_item_id = current_row.bank_item_id
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_displaced_bank_item_ids
        ) as displaced_row
        where displaced_row.bank_item_id = current_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-removed-item-state-missing';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_matchday_id
      and bank_row.editorially_worked_at is not null
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_worked_bank_item_ids
        ) as worked_row
        where worked_row.bank_item_id = bank_row.id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-worked-regression';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as faixa_row
    join jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_arrival_bank_item_ids
    ) as displaced_row
      on displaced_row.bank_item_id = faixa_row.bank_item_id
  ) then
    raise exception 'matchday-live-layout-physical-v14-event-conflict';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as arrival_row
    where not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as desired_row
      where desired_row.bank_item_id = arrival_row.bank_item_id
        and desired_row.placement_type = 'faixa'
    )
      or exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.bank_item_id = arrival_row.bank_item_id
          and current_row.placement_type = 'faixa'
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-faixa-event-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as desired_row
    where desired_row.placement_type = 'faixa'
      and not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = p_matchday_id
          and current_row.bank_item_id = desired_row.bank_item_id
          and current_row.placement_type = 'faixa'
      )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_faixa_arrival_bank_item_ids
        ) as arrival_row
        where arrival_row.bank_item_id = desired_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-faixa-event-incomplete';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_arrival_bank_item_ids
    ) as arrival_row
    where not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_bank_item_ids
      ) as displaced_row
      where displaced_row.bank_item_id = arrival_row.bank_item_id
    )
      or exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = arrival_row.bank_item_id
          and memory_row.memory_kind = 'displaced'
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-displaced-event-invalid';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
    where not exists (
      select 1
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id = p_matchday_id
        and memory_row.bank_item_id = displaced_row.bank_item_id
        and memory_row.memory_kind = 'displaced'
    )
      and not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_displaced_arrival_bank_item_ids
        ) as arrival_row
        where arrival_row.bank_item_id = displaced_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-displaced-event-incomplete';
  end if;

  -- The downstream compatibility rows must be constructible before authority
  -- is marked. Extra-zone placements are intentionally excluded here.
  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where placement_row.placement_type in (
      'opening', 'faixa', 'video_highlight'
    )
      and nullif(pg_catalog.btrim(bank_row.link_url), '') is null
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where placement_row.placement_type = 'selection'
      and (
        nullif(pg_catalog.btrim(bank_row.source_type), '') is null
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    ) as placement_row
    join jornada_private.matchday_live_layout_zone_legacy_projection
      as projection_row
      on projection_row.matchday_id = p_matchday_id
     and projection_row.zone_id = placement_row.zone_id
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = placement_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where placement_row.placement_type = 'zone'
      and (
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) <>
          'editorial_article'
        or nullif(pg_catalog.btrim(bank_row.source_id), '') is null
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-downstream-input-invalid';
  end if;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', placement_row.id,
        'bank_item_id', placement_row.bank_item_id,
        'placement_type', placement_row.placement_type,
        'zone_id', placement_row.zone_id,
        'slot_position', placement_row.slot_position,
        'created_at', placement_row.created_at,
        'updated_at', placement_row.updated_at
      ) order by placement_row.id
    ),
    '[]'::jsonb
  )
  into v_placements_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bank_item_id', placement_row.bank_item_id,
        'created_at', placement_row.created_at
      ) order by placement_row.bank_item_id
    ),
    '[]'::jsonb
  )
  into v_faixa_before
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'faixa';

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'bank_item_id', memory_row.bank_item_id,
        'recorded_at', memory_row.recorded_at
      ) order by memory_row.bank_item_id
    ),
    '[]'::jsonb
  )
  into v_displaced_before
  from public.matchday_live_layout_bank_item_state_memory as memory_row
  where memory_row.matchday_id = p_matchday_id
    and memory_row.memory_kind = 'displaced';

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(zone_row) order by zone_row.id),
    '[]'::jsonb
  )
  into v_zones_before
  from public.matchday_live_layout_zones as zone_row
  where zone_row.matchday_id = p_matchday_id;

  select coalesce(
    pg_catalog.jsonb_agg(pg_catalog.to_jsonb(block_row) order by block_row.id),
    '[]'::jsonb
  )
  into v_blocks_before
  from public.matchday_live_layout_blocks as block_row
  where block_row.matchday_id = p_matchday_id;

  select coalesce(pg_catalog.to_jsonb(settings_row), 'null'::jsonb)
  into v_settings_before
  from public.matchday_live_layout_workspace_settings as settings_row
  where settings_row.matchday_id = p_matchday_id;

  select pg_catalog.md5(coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', bank_row.id,
        'automatic_eligible', bank_row.automatic_eligible,
        'classification_key', bank_row.classification_key,
        'classification_source', bank_row.classification_source,
        'classified_at', bank_row.classified_at
      ) order by bank_row.id
    ),
    '[]'::jsonb
  )::text)
  into v_classification_before
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id;

  if exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    where block_row.matchday_id = p_matchday_id
      and block_row.sort_order > 1000000000
  ) then
    raise exception 'matchday-live-layout-physical-v14-current-block-order-invalid';
  end if;

  -- FIRST DML: authority is marked only after the complete validation above.
  insert into jornada_private.matchday_live_layout_physical_cutovers (
    matchday_id,
    profile_key
  ) values (
    p_matchday_id,
    p_profile_key
  )
  on conflict (matchday_id) do nothing;

  insert into public.matchday_live_layout_workspace_settings as settings_row (
    matchday_id,
    faixa_slot_count,
    headline_title_color,
    latest_zone_placement,
    latest_zone_title,
    video_module_active
  ) values (
    p_matchday_id,
    p_faixa_slot_count,
    case
      when pg_catalog.jsonb_typeof(
        p_presentation -> 'headline_title_color'
      ) = 'null' then null
      else pg_catalog.upper(pg_catalog.btrim(
        p_presentation ->> 'headline_title_color'
      ))
    end,
    p_presentation ->> 'latest_zone_placement',
    pg_catalog.btrim(p_presentation ->> 'latest_zone_title'),
    (p_presentation ->> 'video_module_active')::boolean
  )
  on conflict (matchday_id) do update
  set faixa_slot_count = excluded.faixa_slot_count,
      headline_title_color = excluded.headline_title_color,
      latest_zone_placement = excluded.latest_zone_placement,
      latest_zone_title = excluded.latest_zone_title,
      video_module_active = excluded.video_module_active,
      updated_at = pg_catalog.statement_timestamp()
  where (
    settings_row.faixa_slot_count,
    settings_row.headline_title_color,
    settings_row.latest_zone_placement,
    settings_row.latest_zone_title,
    settings_row.video_module_active
  ) is distinct from (
    excluded.faixa_slot_count,
    excluded.headline_title_color,
    excluded.latest_zone_placement,
    excluded.latest_zone_title,
    excluded.video_module_active
  );

  update public.matchday_live_layout_zones as zone_row
  set public_title = desired_row.public_title,
      visual_family = desired_row.visual_family,
      updated_at = pg_catalog.statement_timestamp()
  from jornada_private.normalize_matchday_live_layout_zones_v14(
    p_zones
  ) as desired_row
  where zone_row.matchday_id = p_matchday_id
    and zone_row.id = desired_row.zone_id
    and (
      zone_row.public_title,
      zone_row.visual_family
    ) is distinct from (
      desired_row.public_title,
      desired_row.visual_family
    );

  -- Move every order into a collision-free range before assigning the exact
  -- requested order. Rows whose final order did not change keep their clock.
  if exists (
    select 1
    from public.matchday_live_layout_blocks as block_row
    join jornada_private.normalize_matchday_live_layout_blocks_v14(
      p_blocks
    ) as desired_row
      on desired_row.block_id = block_row.id
    where block_row.matchday_id = p_matchday_id
      and block_row.sort_order is distinct from desired_row.sort_order
  ) then
    v_block_offset := 1100000000;

    update public.matchday_live_layout_blocks as block_row
    set sort_order = block_row.sort_order + v_block_offset
    where block_row.matchday_id = p_matchday_id;

    update public.matchday_live_layout_blocks as block_row
    set sort_order = desired_row.sort_order,
        updated_at = case
          when block_row.sort_order - v_block_offset
               is distinct from desired_row.sort_order
            then pg_catalog.statement_timestamp()
          else block_row.updated_at
        end
    from jornada_private.normalize_matchday_live_layout_blocks_v14(
      p_blocks
    ) as desired_row
    where block_row.matchday_id = p_matchday_id
      and block_row.id = desired_row.block_id;
  end if;

  -- From this point on, legacy rows are downstream materialization only. The
  -- transaction-local context is held in a private table and cannot be forged
  -- through a client-controlled GUC.
  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    p_matchday_id
  );

  delete from public.matchday_editorial_profile_manual_overrides
    as override_row
  where override_row.matchday_id = p_matchday_id
    and override_row.profile_key = p_profile_key
    and (
      override_row.placement_target is distinct from 'bank'
      or not exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_explicit_bank_item_ids
        ) as explicit_row
        join public.matchday_editorial_bank_items as bank_row
          on bank_row.id = explicit_row.bank_item_id
         and bank_row.matchday_id = p_matchday_id
        where pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
          and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
              pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
      )
    );

  update public.matchday_editorial_profile_manual_overrides as override_row
  set placement_target = 'bank',
      zone_key = null,
      sort_order = null,
      updated_at = pg_catalog.statement_timestamp()
  from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
    p_explicit_bank_item_ids
  ) as explicit_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.id = explicit_row.bank_item_id
   and bank_row.matchday_id = p_matchday_id
  where override_row.matchday_id = p_matchday_id
    and override_row.profile_key = p_profile_key
    and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
    and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
    and (
      override_row.placement_target is distinct from 'bank'
      or override_row.zone_key is not null
      or override_row.sort_order is not null
    );

  insert into public.matchday_editorial_profile_manual_overrides (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    placement_target,
    zone_key,
    sort_order
  )
  select
    p_matchday_id,
    p_profile_key,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)),
    'bank',
    null,
    null
  from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
    p_explicit_bank_item_ids
  ) as explicit_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.id = explicit_row.bank_item_id
   and bank_row.matchday_id = p_matchday_id
  where not exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = p_matchday_id
      and override_row.profile_key = p_profile_key
      and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
          pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
      and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
          pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  )
  order by explicit_row.operation_order;

  with desired as materialized (
    select *
    from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
      p_placements
    )
  ),
  clear_operations as (
    select
      0 as phase,
      current_row.placement_type,
      current_row.zone_id,
      current_row.slot_position,
      current_row.bank_item_id,
      pg_catalog.jsonb_build_object(
        'action', 'clear',
        'bank_item_id', null,
        'placement_type', current_row.placement_type,
        'zone_id', current_row.zone_id,
        'slot_position', current_row.slot_position
      ) as payload
    from public.matchday_live_layout_placements as current_row
    where current_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from desired as desired_row
        where desired_row.bank_item_id = current_row.bank_item_id
          and desired_row.placement_type = current_row.placement_type
          and desired_row.zone_id is not distinct from current_row.zone_id
          and desired_row.slot_position = current_row.slot_position
      )
      and not exists (
        select 1
        from desired as desired_row
        where desired_row.bank_item_id = current_row.bank_item_id
      )
      and not exists (
        select 1
        from desired as desired_row
        where desired_row.placement_type = current_row.placement_type
          and desired_row.zone_id is not distinct from current_row.zone_id
          and desired_row.slot_position = current_row.slot_position
      )
  ),
  place_operations as (
    select
      1 as phase,
      desired_row.placement_type,
      desired_row.zone_id,
      desired_row.slot_position,
      desired_row.bank_item_id,
      pg_catalog.jsonb_build_object(
        'action', 'place',
        'bank_item_id', desired_row.bank_item_id,
        'placement_type', desired_row.placement_type,
        'zone_id', desired_row.zone_id,
        'slot_position', desired_row.slot_position
      ) as payload
    from desired as desired_row
    where not exists (
      select 1
      from public.matchday_live_layout_placements as current_row
      where current_row.matchday_id = p_matchday_id
        and current_row.bank_item_id = desired_row.bank_item_id
        and current_row.placement_type = desired_row.placement_type
        and current_row.zone_id is not distinct from desired_row.zone_id
        and current_row.slot_position = desired_row.slot_position
    )
  ),
  operations as (
    select * from clear_operations
    union all
    select * from place_operations
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      operation_row.payload
      order by
        operation_row.phase,
        operation_row.placement_type,
        operation_row.zone_id nulls first,
        operation_row.slot_position,
        operation_row.bank_item_id
    ),
    '[]'::jsonb
  )
  into v_plan
  from operations as operation_row;

  perform jornada_private.apply_matchday_live_layout_placement_plan(
    p_matchday_id,
    v_plan,
    false
  );

  -- A move that leaves and returns to Faixa is not a new arrival. Preserve its
  -- clock unless the caller explicitly supplied it in the arrival event list.
  with previous as materialized (
    select
      previous_row.bank_item_id,
      previous_row.created_at
    from pg_catalog.jsonb_to_recordset(v_faixa_before) as previous_row(
      bank_item_id uuid,
      created_at timestamptz
    )
  )
  update public.matchday_live_layout_placements as placement_row
  set created_at = previous.created_at
  from previous
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'faixa'
    and placement_row.bank_item_id = previous.bank_item_id
    and placement_row.created_at is distinct from previous.created_at
    and not exists (
      select 1
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_faixa_arrival_bank_item_ids
      ) as arrival_row
      where arrival_row.bank_item_id = placement_row.bank_item_id
    );

  v_faixa_anchor := pg_catalog.clock_timestamp();

  update public.matchday_live_layout_placements as placement_row
  set created_at = v_faixa_anchor
      - ((arrival_row.operation_order - 1) * interval '1 microsecond')
  from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
    p_faixa_arrival_bank_item_ids
  ) as arrival_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = 'faixa'
    and placement_row.bank_item_id = arrival_row.bank_item_id;

  delete from public.matchday_live_layout_bank_item_state_memory as memory_row
  where memory_row.matchday_id = p_matchday_id
    and (
      exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = p_matchday_id
          and placement_row.bank_item_id = memory_row.bank_item_id
      )
      or exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_explicit_bank_item_ids
        ) as explicit_row
        where explicit_row.bank_item_id = memory_row.bank_item_id
      )
      or (
        memory_row.memory_kind = 'displaced'
        and not exists (
          select 1
          from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
            p_displaced_bank_item_ids
          ) as displaced_row
          where displaced_row.bank_item_id = memory_row.bank_item_id
        )
      )
    );

  insert into public.matchday_live_layout_bank_item_state_memory
    as memory_row (
      matchday_id,
      bank_item_id,
      memory_kind,
      recorded_at
    )
  select
    p_matchday_id,
    displaced_row.bank_item_id,
    'displaced',
    pg_catalog.statement_timestamp()
  from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
    p_displaced_bank_item_ids
  ) as displaced_row
  on conflict (matchday_id, bank_item_id)
  do update
  set memory_kind = 'displaced',
      recorded_at = excluded.recorded_at
  where memory_row.memory_kind is distinct from 'displaced';

  v_displaced_anchor := pg_catalog.clock_timestamp();

  update public.matchday_live_layout_bank_item_state_memory as memory_row
  set memory_kind = 'displaced',
      recorded_at = v_displaced_anchor
        - ((arrival_row.operation_order - 1) * interval '1 microsecond')
  from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
    p_displaced_arrival_bank_item_ids
  ) as arrival_row
  where memory_row.matchday_id = p_matchday_id
    and memory_row.bank_item_id = arrival_row.bank_item_id;

  update public.matchday_editorial_bank_items as bank_row
  set editorially_worked_at = pg_catalog.statement_timestamp()
  from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
    p_worked_bank_item_ids
  ) as worked_row
  where bank_row.matchday_id = p_matchday_id
    and bank_row.id = worked_row.bank_item_id
    and bank_row.editorially_worked_at is null;

  perform jornada_private.project_matchday_live_layout_workspace_v14(
    p_matchday_id,
    p_profile_key
  );

  perform jornada_private.end_matchday_live_layout_downstream_v14(
    p_matchday_id
  );

  -- Physical postconditions compare the exact requested state. They are
  -- intentionally independent from the five-zone compatibility projection.
  if exists (
    with desired as materialized (
      select
        desired_row.zone_id as id,
        desired_row.public_title,
        desired_row.visual_family
      from jornada_private.normalize_matchday_live_layout_zones_v14(
        p_zones
      ) as desired_row
    ),
    current_state as materialized (
      select zone_row.id, zone_row.public_title, zone_row.visual_family
      from public.matchday_live_layout_zones as zone_row
      where zone_row.matchday_id = p_matchday_id
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v14-zone-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select
        desired_row.block_id as id,
        desired_row.block_type,
        desired_row.zone_id,
        desired_row.sort_order
      from jornada_private.normalize_matchday_live_layout_blocks_v14(
        p_blocks
      ) as desired_row
    ),
    current_state as materialized (
      select
        block_row.id,
        block_row.block_type,
        block_row.zone_id,
        block_row.sort_order
      from public.matchday_live_layout_blocks as block_row
      where block_row.matchday_id = p_matchday_id
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v14-block-postcondition';
  end if;

  if not exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
      and settings_row.faixa_slot_count = p_faixa_slot_count
      and settings_row.headline_title_color is not distinct from case
        when pg_catalog.jsonb_typeof(
          p_presentation -> 'headline_title_color'
        ) = 'null' then null
        else pg_catalog.upper(pg_catalog.btrim(
          p_presentation ->> 'headline_title_color'
        ))
      end
      and settings_row.latest_zone_placement =
          p_presentation ->> 'latest_zone_placement'
      and settings_row.latest_zone_title =
          pg_catalog.btrim(p_presentation ->> 'latest_zone_title')
      and settings_row.video_module_active =
          (p_presentation ->> 'video_module_active')::boolean
  ) then
    raise exception 'matchday-live-layout-physical-v14-settings-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from jornada_private.normalize_matchday_live_layout_physical_placements_v13(
        p_placements
      ) as placement_row
    ),
    current_state as materialized (
      select
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v14-placement-postcondition';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
    group by placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) or exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
    group by
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-physical-v14-unique-postcondition';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    left join public.matchday_live_layout_zones as zone_row
      on zone_row.id = placement_row.zone_id
     and zone_row.matchday_id = placement_row.matchday_id
    where placement_row.matchday_id = p_matchday_id
      and (
        (
          placement_row.placement_type = 'faixa'
          and placement_row.slot_position > p_faixa_slot_count
        )
        or (
          placement_row.placement_type = 'zone'
          and (
            zone_row.id is null
            or placement_row.slot_position > jornada_private
                 .matchday_live_layout_visual_family_capacity_v13(
                   zone_row.visual_family
                 )
          )
        )
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-capacity-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select displaced_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_displaced_bank_item_ids
      ) as displaced_row
    ),
    current_state as materialized (
      select memory_row.bank_item_id
      from public.matchday_live_layout_bank_item_state_memory as memory_row
      where memory_row.matchday_id = p_matchday_id
        and memory_row.memory_kind = 'displaced'
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) then
    raise exception 'matchday-live-layout-physical-v14-displaced-postcondition';
  end if;

  if exists (
    with desired as materialized (
      select explicit_row.bank_item_id
      from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
        p_explicit_bank_item_ids
      ) as explicit_row
    ),
    current_state as materialized (
      select bank_row.id as bank_item_id
      from public.matchday_editorial_profile_manual_overrides as override_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.matchday_id = p_matchday_id
       and pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
           pg_catalog.lower(pg_catalog.btrim(override_row.source_type))
       and pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) =
           pg_catalog.lower(pg_catalog.btrim(override_row.source_id))
      where override_row.matchday_id = p_matchday_id
        and override_row.profile_key = p_profile_key
        and override_row.placement_target = 'bank'
    ),
    differences as (
      (select * from current_state except select * from desired)
      union all
      (select * from desired except select * from current_state)
    )
    select 1 from differences
  ) or exists (
    select 1
    from public.matchday_editorial_profile_manual_overrides as override_row
    where override_row.matchday_id = p_matchday_id
      and override_row.profile_key = p_profile_key
      and (
        override_row.placement_target is distinct from 'bank'
        or override_row.zone_key is not null
        or override_row.sort_order is not null
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-bank-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_explicit_bank_item_ids
    ) as explicit_row
    where exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = explicit_row.bank_item_id
    )
      or exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = explicit_row.bank_item_id
      )
  ) or exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_bank_item_ids
    ) as displaced_row
    where exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = displaced_row.bank_item_id
    )
      or exists (
        select 1
        from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
          p_explicit_bank_item_ids
        ) as explicit_row
        where explicit_row.bank_item_id = displaced_row.bank_item_id
      )
  ) then
    raise exception 'matchday-live-layout-physical-v14-state-conflict-postcondition';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_placements_before) as previous_row(
      id uuid,
      bank_item_id uuid,
      placement_type text,
      zone_id uuid,
      slot_position integer,
      created_at timestamptz,
      updated_at timestamptz
    )
    join public.matchday_live_layout_placements as placement_row
      on placement_row.matchday_id = p_matchday_id
     and placement_row.bank_item_id = previous_row.bank_item_id
     and placement_row.placement_type = previous_row.placement_type
     and placement_row.zone_id is not distinct from previous_row.zone_id
     and placement_row.slot_position = previous_row.slot_position
    where placement_row.id is distinct from previous_row.id
      or placement_row.created_at is distinct from previous_row.created_at
      or placement_row.updated_at is distinct from previous_row.updated_at
  ) then
    raise exception 'matchday-live-layout-physical-v14-unchanged-clock-postcondition';
  end if;

  if exists (
    select 1
    from pg_catalog.jsonb_to_recordset(v_displaced_before) as previous_row(
      bank_item_id uuid,
      recorded_at timestamptz
    )
    join public.matchday_live_layout_bank_item_state_memory as memory_row
      on memory_row.matchday_id = p_matchday_id
     and memory_row.bank_item_id = previous_row.bank_item_id
     and memory_row.memory_kind = 'displaced'
    where memory_row.recorded_at is distinct from previous_row.recorded_at
  ) then
    raise exception 'matchday-live-layout-physical-v14-displaced-clock-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_faixa_arrival_bank_item_ids
    ) as arrival_row
    left join public.matchday_live_layout_placements as placement_row
      on placement_row.matchday_id = p_matchday_id
     and placement_row.bank_item_id = arrival_row.bank_item_id
     and placement_row.placement_type = 'faixa'
    where placement_row.id is null
      or placement_row.created_at is distinct from
         v_faixa_anchor
         - ((arrival_row.operation_order - 1) * interval '1 microsecond')
  ) then
    raise exception 'matchday-live-layout-physical-v14-faixa-clock-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_displaced_arrival_bank_item_ids
    ) as arrival_row
    left join public.matchday_live_layout_bank_item_state_memory as memory_row
      on memory_row.matchday_id = p_matchday_id
     and memory_row.bank_item_id = arrival_row.bank_item_id
     and memory_row.memory_kind = 'displaced'
    where memory_row.bank_item_id is null
      or memory_row.recorded_at is distinct from
         v_displaced_anchor
         - ((arrival_row.operation_order - 1) * interval '1 microsecond')
  ) then
    raise exception 'matchday-live-layout-physical-v14-displaced-arrival-postcondition';
  end if;

  if exists (
    select 1
    from jornada_private.normalize_matchday_live_layout_bank_item_ids_v13(
      p_worked_bank_item_ids
    ) as worked_row
    join public.matchday_editorial_bank_items as bank_row
      on bank_row.id = worked_row.bank_item_id
     and bank_row.matchday_id = p_matchday_id
    where bank_row.editorially_worked_at is null
  ) then
    raise exception 'matchday-live-layout-physical-v14-worked-postcondition';
  end if;

  if v_classification_before is distinct from (
    select pg_catalog.md5(coalesce(
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'id', bank_row.id,
          'automatic_eligible', bank_row.automatic_eligible,
          'classification_key', bank_row.classification_key,
          'classification_source', bank_row.classification_source,
          'classified_at', bank_row.classified_at
        ) order by bank_row.id
      ),
      '[]'::jsonb
    )::text)
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-physical-v14-classification-changed';
  end if;

  perform jornada_private.assert_matchday_live_layout_downstream_v14(
    p_matchday_id,
    p_profile_key
  );

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id = p_matchday_id
      and marker_row.profile_key = p_profile_key
  ) then
    raise exception 'matchday-live-layout-physical-v14-marker-postcondition';
  end if;

  select token_row.state_token
  into v_final_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  return query
  select
    v_final_state_token,
    pg_catalog.jsonb_array_length(p_zones),
    pg_catalog.jsonb_array_length(p_blocks),
    pg_catalog.jsonb_array_length(p_placements),
    pg_catalog.jsonb_array_length(p_explicit_bank_item_ids),
    pg_catalog.jsonb_array_length(p_displaced_bank_item_ids),
    pg_catalog.jsonb_array_length(p_worked_bank_item_ids);
end;
$function$;

revoke all on function public.apply_matchday_live_layout_physical_workspace_v14(
  uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
)
from public, anon, authenticated, service_role;

grant execute on function public.apply_matchday_live_layout_physical_workspace_v14(
  uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
)
to service_role;

comment on function public.apply_matchday_live_layout_physical_workspace_v14(
  uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
)
is
  'Single-transaction service-role facade for the physical live desk. It validates physical OCC under the shared writer lock, marks per-matchday cutover, writes physical authority and materializes legacy downstream.';

-- The v13 shadow writer remains a private implementation detail.
revoke all on function
  jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(
    uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

do $postconditions$
begin
  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'anon',
    'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) or exists (
    select 1
    from pg_catalog.pg_proc as procedure_row
    cross join lateral pg_catalog.aclexplode(coalesce(
      procedure_row.proacl,
      pg_catalog.acldefault('f', procedure_row.proowner)
    )) as acl_row
    where procedure_row.oid =
      'public.apply_matchday_live_layout_physical_workspace_v14(uuid,text,text,jsonb,jsonb,jsonb,integer,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
      and acl_row.grantee = 0
      and acl_row.privilege_type = 'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-physical-v14-facade-acl-invalid';
  end if;

  if pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.apply_matchday_live_layout_physical_state_v13_shadow(uuid,text,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'service_role',
    'jornada_private.apply_matchday_live_layout_placement_plan(uuid,jsonb,boolean)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-physical-v14-private-writer-exposed';
  end if;

  if pg_catalog.has_table_privilege(
    'service_role',
    'jornada_private.matchday_live_layout_physical_cutovers',
    'INSERT,UPDATE,DELETE'
  ) or pg_catalog.has_table_privilege(
    'service_role',
    'public.matchday_live_layout_workspace_settings',
    'INSERT,UPDATE,DELETE'
  ) then
    raise exception 'matchday-live-layout-physical-v14-table-acl-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
