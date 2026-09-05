begin;

-- LOTE 2 / v16
-- Contextual classification remains authoritative on Bank.classification_*.
-- The former thematic automatic distribution is legacy-only after the
-- explicit per-matchday physical cutover marker exists.

-- ============================================================
-- 1. LEGACY DISTRIBUTION PLAN: EMPTY FOR PHYSICAL MATCHDAYS
-- ============================================================

create or replace function public.matchday_editorial_profile_distribution_plan(
  p_matchday_id uuid
)
returns table (
  source_type text,
  source_id text,
  zone_key text,
  sort_order integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with legacy_authority as materialized (
    select not exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = p_matchday_id
    ) as enabled
  ),
  capacities(zone_key, capacity) as (
    values
      ('benfica'::text, 6),
      ('sporting'::text, 5),
      ('fc_porto'::text, 5),
      ('other_liga_clubs'::text, 6),
      ('outside_liga_other'::text, 5)
  ),
  classified as (
    select
      classification_row.source_type,
      classification_row.source_id,
      classification_row.classified_zone_key,
      classification_row.actuality_order,
      capacity_row.capacity
    from legacy_authority
    cross join public.matchday_editorial_profile_classification_plan(
      p_matchday_id
    ) as classification_row
    join capacities as capacity_row
      on capacity_row.zone_key = classification_row.classified_zone_key
    where legacy_authority.enabled
  ),
  ranked as (
    select
      classified_row.*,
      pg_catalog.row_number() over (
        partition by classified_row.classified_zone_key
        order by
          classified_row.actuality_order,
          classified_row.source_type,
          classified_row.source_id
      )::integer as zone_order
    from classified as classified_row
  )
  select
    ranked_row.source_type,
    ranked_row.source_id,
    case
      when ranked_row.zone_order <= ranked_row.capacity
        then ranked_row.classified_zone_key
      else null
    end as zone_key,
    case
      when ranked_row.zone_order <= ranked_row.capacity
        then ranked_row.zone_order
      else null
    end as sort_order
  from ranked as ranked_row;
$function$;

revoke all on function
  public.matchday_editorial_profile_distribution_plan(uuid)
from public, anon, authenticated, service_role;

comment on function
  public.matchday_editorial_profile_distribution_plan(uuid)
is
  'Legacy five-key automatic placement plan. It returns no rows after the explicit physical cutover marker and never plans physical occupancy.';


-- ============================================================
-- 2. LEGACY DISTRIBUTION WRITER: TRANSACTIONALLY MARKER-AWARE
-- ============================================================

create or replace function public.refresh_matchday_editorial_profile_distribution(
  p_matchday_id uuid
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_profile_key text;
  v_competition_slug text;
  v_now timestamptz := pg_catalog.now();
  v_placed_count integer;
begin
  if p_matchday_id is null then
    raise exception 'matchday-editorial-profile-distribution-invalid-input';
  end if;

  -- Serialize the authority decision with the physical facade. Re-checking
  -- the marker after the matchday row lock closes the pre-cutover/cutover
  -- race without weakening any v14/v15 legacy-writer fence.
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-editorial-profile-distribution-matchday-not-found';
  end if;

  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers
      as cutover_row
    where cutover_row.matchday_id = p_matchday_id
  ) then
    return 0;
  end if;

  select assignment_row.profile_key, competition_row.slug
  into v_profile_key, v_competition_slug
  from public.matchday_editorial_profile_assignments as assignment_row
  join public.matchdays as matchday_row
    on matchday_row.id = assignment_row.matchday_id
  join public.seasons as season_row
    on season_row.id = matchday_row.season_id
  join public.competitions as competition_row
    on competition_row.id = season_row.competition_id
  where assignment_row.matchday_id = p_matchday_id
  for update of assignment_row;

  if not found then
    return 0;
  end if;

  if v_profile_key is distinct from 'liga_portugal_v1' then
    raise exception 'matchday-editorial-profile-distribution-invalid-profile';
  end if;

  if v_competition_slug is distinct from 'liga-portugal' then
    raise exception 'matchday-editorial-profile-distribution-incompatible-competition';
  end if;

  insert into public.matchday_editorial_profile_state_items (
    matchday_id,
    profile_key,
    source_type,
    source_id
  )
  select
    p_matchday_id,
    v_profile_key,
    plan_row.source_type,
    plan_row.source_id
  from public.matchday_editorial_profile_distribution_plan(p_matchday_id)
    as plan_row
  on conflict (matchday_id, profile_key, source_type, source_id) do nothing;

  update public.matchday_editorial_profile_state_items as state_row
  set zone_key = null,
      sort_order = null,
      updated_at = v_now
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and (state_row.zone_key is not null or state_row.sort_order is not null)
    and not exists (
      select 1
      from public.matchday_editorial_profile_distribution_plan(p_matchday_id)
        as plan_row
      where plan_row.source_type = state_row.source_type
        and plan_row.source_id = state_row.source_id
    );

  with desired_state as materialized (
    select *
    from public.matchday_editorial_profile_distribution_plan(p_matchday_id)
  )
  update public.matchday_editorial_profile_state_items as state_row
  set zone_key = null,
      sort_order = null,
      updated_at = v_now
  from desired_state as desired_row
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and state_row.source_type = desired_row.source_type
    and state_row.source_id = desired_row.source_id
    and state_row.zone_key is not null
    and (state_row.zone_key, state_row.sort_order)
      is distinct from (desired_row.zone_key, desired_row.sort_order);

  with desired_state as materialized (
    select *
    from public.matchday_editorial_profile_distribution_plan(p_matchday_id)
  )
  update public.matchday_editorial_profile_state_items as state_row
  set zone_key = desired_row.zone_key,
      sort_order = desired_row.sort_order,
      updated_at = v_now
  from desired_state as desired_row
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and state_row.source_type = desired_row.source_type
    and state_row.source_id = desired_row.source_id
    and (state_row.zone_key, state_row.sort_order)
      is distinct from (desired_row.zone_key, desired_row.sort_order);

  select pg_catalog.count(*)::integer
  into v_placed_count
  from public.matchday_editorial_profile_state_items as state_row
  where state_row.matchday_id = p_matchday_id
    and state_row.profile_key = v_profile_key
    and state_row.zone_key is not null;

  return v_placed_count;
end;
$function$;

revoke all on function
  public.refresh_matchday_editorial_profile_distribution(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.refresh_matchday_editorial_profile_distribution(uuid)
to service_role;

comment on function
  public.refresh_matchday_editorial_profile_distribution(uuid)
is
  'Legacy automatic positional distribution writer. It is serialized with physical cutover and returns 0 without DML once the per-matchday physical marker exists.';


-- ============================================================
-- 3. BANK AND ASSIGNMENT TRIGGERS: CLASSIFICATION IS NOT PLACEMENT
-- ============================================================

create or replace function
public.refresh_matchday_editorial_profile_distribution_from_bank()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_matchday_ids uuid[];
  v_matchday_id uuid;
begin
  if tg_op = 'UPDATE'
    and not exists (
      select 1
      from new_rows as new_row
      where not exists (
        select 1
        from jornada_private
          .matchday_editorial_bank_classification_authorizations
          as authorization_row
        where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
          and authorization_row.transaction_id =
            pg_catalog.pg_current_xact_id()
          and authorization_row.bank_item_id = new_row.id
      )
    )
  then
    return null;
  end if;

  if pg_catalog.current_setting(
    'jornada.thematic_continuity_initialize',
    true
  ) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    select coalesce(
      pg_catalog.array_agg(distinct old_row.matchday_id),
      '{}'::uuid[]
    )
    into v_matchday_ids
    from old_rows as old_row
    where old_row.automatic_eligible = true;
  elsif tg_op = 'INSERT' then
    select coalesce(
      pg_catalog.array_agg(distinct new_row.matchday_id),
      '{}'::uuid[]
    )
    into v_matchday_ids
    from new_rows as new_row
    where new_row.automatic_eligible = true;
  else
    with changed_rows as (
      select
        old_row.matchday_id as old_matchday_id,
        new_row.matchday_id as new_matchday_id,
        old_row.automatic_eligible as old_automatic_eligible,
        new_row.automatic_eligible as new_automatic_eligible
      from old_rows as old_row
      full join new_rows as new_row
        on new_row.id = old_row.id
      where old_row.id is null
        or new_row.id is null
        or old_row.matchday_id is distinct from new_row.matchday_id
        or pg_catalog.lower(
             pg_catalog.btrim(coalesce(old_row.source_type, ''))
           ) is distinct from pg_catalog.lower(
             pg_catalog.btrim(coalesce(new_row.source_type, ''))
           )
        or pg_catalog.lower(
             pg_catalog.btrim(coalesce(old_row.source_id, ''))
           ) is distinct from pg_catalog.lower(
             pg_catalog.btrim(coalesce(new_row.source_id, ''))
           )
        or pg_catalog.lower(
             pg_catalog.btrim(coalesce(old_row.status, ''))
           ) is distinct from pg_catalog.lower(
             pg_catalog.btrim(coalesce(new_row.status, ''))
           )
        or old_row.automatic_eligible
          is distinct from new_row.automatic_eligible
    ),
    changed_matchdays as (
      select changed_row.old_matchday_id as matchday_id
      from changed_rows as changed_row
      where changed_row.old_automatic_eligible = true
        and changed_row.old_matchday_id is not null

      union

      select changed_row.new_matchday_id
      from changed_rows as changed_row
      where changed_row.new_automatic_eligible = true
        and changed_row.new_matchday_id is not null
    )
    select coalesce(
      pg_catalog.array_agg(changed_matchday.matchday_id),
      '{}'::uuid[]
    )
    into v_matchday_ids
    from changed_matchdays as changed_matchday;
  end if;

  foreach v_matchday_id in array v_matchday_ids loop
    if not exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = v_matchday_id
    )
      and exists (
        select 1
        from public.matchday_editorial_profile_assignments
          as assignment_row
        where assignment_row.matchday_id = v_matchday_id
      )
    then
      perform public.refresh_matchday_editorial_profile_distribution(
        v_matchday_id
      );
    end if;
  end loop;

  return null;
end;
$function$;

revoke all on function
  public.refresh_matchday_editorial_profile_distribution_from_bank()
from public, anon, authenticated, service_role;

comment on function
  public.refresh_matchday_editorial_profile_distribution_from_bank()
is
  'Bank trigger dispatcher for legacy automatic distribution only. Physical matchdays keep Bank classification changes but skip state_items distribution.';


create or replace function
public.refresh_matchday_editorial_profile_distribution_from_assignment()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers
      as cutover_row
    where cutover_row.matchday_id = new.matchday_id
  ) then
    perform public.refresh_matchday_editorial_profile_distribution(
      new.matchday_id
    );
  end if;

  return new;
end;
$function$;

revoke all on function
  public.refresh_matchday_editorial_profile_distribution_from_assignment()
from public, anon, authenticated, service_role;

comment on function
  public.refresh_matchday_editorial_profile_distribution_from_assignment()
is
  'Assignment remains contextual. It requests legacy distribution only before the explicit physical cutover marker exists.';


-- ============================================================
-- 4. PHYSICAL OCC: EXCLUDE LEGACY POSITIONAL STATE
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
  with authority as materialized (
    select exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = p_matchday_id
    ) as is_physical
  )
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      -- Preserve the historical token only while legacy authority is active.
      -- In physical mode this branch is deliberately not evaluated.
      'legacy_workspace', case
        when authority.is_physical then ''
        else coalesce(
          (
            select legacy_row.state_token
            from public.matchday_editorial_profile_workspace_token_uncached(
              p_matchday_id,
              p_profile_key
            ) as legacy_row
          ),
          ''
        )
      end,
      'assignment', coalesce(
        (
          select pg_catalog.to_jsonb(assignment_row)
          from public.matchday_editorial_profile_assignments as assignment_row
          where assignment_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
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
      'explicit_bank', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.jsonb_build_object(
              'source_type',
                pg_catalog.lower(pg_catalog.btrim(override_row.source_type)),
              'source_id',
                pg_catalog.lower(pg_catalog.btrim(override_row.source_id)),
              'updated_at', override_row.updated_at
            )
            order by
              pg_catalog.lower(pg_catalog.btrim(override_row.source_type)),
              pg_catalog.lower(pg_catalog.btrim(override_row.source_id))
          )
          from public.matchday_editorial_profile_manual_overrides
            as override_row
          where override_row.matchday_id = p_matchday_id
            and override_row.profile_key = p_profile_key
            and override_row.placement_target = 'bank'
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
          from public.matchday_live_layout_bank_item_state_memory
            as memory_row
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
             'latest_zone_mode', settings_row.latest_zone_mode,
             'latest_zone_title_color',
               settings_row.latest_zone_title_color,
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
  ) as state_token
  from authority;
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
  'Physical workspace OCC token. After cutover it observes assignment, Bank, explicit Banco, physical zones/blocks/placements/settings, physical memory and the marker; legacy automatic state and legacy occupancy are excluded.';


-- The administrative desk still uses the historical public token name for
-- its coherent-read fence. Preserve the pre-cutover token, but return the
-- physical OCC token after cutover so residual state_items are not current
-- state by another name.
create or replace function
public.matchday_editorial_profile_workspace_token(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_cache_enabled boolean :=
    pg_catalog.current_setting(
      'jornada.thematic_apply_token_cache_mode',
      true
    ) = 'v10';
  v_token text;
begin
  if exists (
    select 1
    from jornada_private.matchday_live_layout_physical_cutovers
      as cutover_row
    where cutover_row.matchday_id = p_matchday_id
  ) then
    return query
    select physical_row.state_token
    from public.matchday_editorial_profile_workspace_token_v13(
      p_matchday_id,
      p_profile_key
    ) as physical_row;
    return;
  end if;

  if v_cache_enabled then
    v_token := nullif(
      pg_catalog.current_setting(
        'jornada.thematic_workspace_token_cache',
        true
      ),
      ''
    );

    if v_token is not null then
      return query select v_token;
      return;
    end if;
  end if;

  select token_row.state_token
  into v_token
  from public.matchday_editorial_profile_workspace_token_uncached(
    p_matchday_id,
    p_profile_key
  ) as token_row;

  if v_cache_enabled then
    perform pg_catalog.set_config(
      'jornada.thematic_workspace_token_cache',
      v_token,
      true
    );
  end if;

  return query select v_token;
end;
$function$;

revoke all on function
  public.matchday_editorial_profile_workspace_token(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_editorial_profile_workspace_token(uuid, text)
to service_role;

comment on function
  public.matchday_editorial_profile_workspace_token(uuid, text)
is
  'Marker-aware desk read token. It preserves the cached legacy workspace token before cutover and delegates to the physical OCC token after cutover.';


-- ============================================================
-- 5. ADMIN/TRACKING READER: RESIDUAL STATE IS HISTORY, NOT CURRENT
-- ============================================================

create or replace function public.read_matchday_live_desk_aggregate_tracking(
  p_matchday_id uuid,
  p_profile_key text
)
returns table (
  bank_item_id uuid,
  source_type text,
  source_id text,
  label text,
  title text,
  subtitle text,
  image_url text,
  link_url text,
  bank_status text,
  automatic_eligible boolean,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  article_id uuid,
  article_published_at timestamptz,
  article_updated_at timestamptz,
  has_automatic_state boolean,
  automatic_zone_key text,
  automatic_sort_order integer,
  placement_count bigint,
  transversal_conflict boolean,
  memory_kind text,
  history_unknown boolean,
  memory_placement_conflict boolean,
  is_explicit_bank boolean,
  bank_placement_conflict boolean,
  editorial_state text,
  placement_id uuid,
  placement_type text,
  zone_id uuid,
  placement_zone_key text,
  slot_position integer,
  placement_created_at timestamptz,
  state_recorded_at timestamptz,
  inactive_historical_count bigint
)
language sql
stable
security definer
set search_path = ''
as $function$
  with physical_authority as materialized (
    select exists (
      select 1
      from jornada_private.matchday_live_layout_physical_cutovers
        as cutover_row
      where cutover_row.matchday_id = p_matchday_id
    ) as enabled
  ),
  projected as materialized (
    select state_row.*
    from jornada_private.project_matchday_live_layout_bank_item_states(
      array[p_matchday_id]
    ) as state_row
  ),
  explicit_bank as materialized (
    select distinct
      bank_row.id as bank_item_id
    from public.matchday_editorial_bank_items as bank_row
    join public.matchday_editorial_profile_manual_overrides as override_row
      on override_row.matchday_id = bank_row.matchday_id
     and override_row.profile_key = p_profile_key
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
     and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
         pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
     and override_row.placement_target = 'bank'
    where bank_row.matchday_id = p_matchday_id
  ),
  inactive_historical as materialized (
    select pg_catalog.count(*)::bigint as item_count
    from public.matchday_editorial_profile_state_items as state_row
    cross join physical_authority
    where not physical_authority.enabled
      and state_row.matchday_id = p_matchday_id
      and state_row.profile_key = p_profile_key
      and not exists (
        select 1
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.matchday_id = state_row.matchday_id
          and pg_catalog.lower(
                pg_catalog.btrim(coalesce(bank_row.status, ''))
              ) = 'active'
          and pg_catalog.lower(
                pg_catalog.btrim(coalesce(bank_row.source_type, ''))
              ) = pg_catalog.lower(
                pg_catalog.btrim(state_row.source_type)
              )
          and pg_catalog.lower(
                pg_catalog.btrim(coalesce(bank_row.source_id, ''))
              ) = pg_catalog.lower(
                pg_catalog.btrim(state_row.source_id)
              )
      )
  )
  select
    bank_row.id as bank_item_id,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) as source_type,
    pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)) as source_id,
    bank_row.label,
    bank_row.title,
    bank_row.subtitle,
    bank_row.image_url,
    bank_row.link_url,
    projected_row.bank_status,
    bank_row.automatic_eligible,
    projected_row.classification_key,
    projected_row.classification_source,
    projected_row.classified_at,
    article_row.id as article_id,
    article_row.published_at as article_published_at,
    article_row.updated_at as article_updated_at,
    state_row.id is not null as has_automatic_state,
    state_row.zone_key as automatic_zone_key,
    state_row.sort_order as automatic_sort_order,
    projected_row.placement_count,
    projected_row.transversal_conflict,
    projected_row.memory_kind,
    projected_row.history_unknown,
    projected_row.memory_placement_conflict,
    explicit_bank.bank_item_id is not null as is_explicit_bank,
    explicit_bank.bank_item_id is not null
      and projected_row.placement_count > 0 as bank_placement_conflict,
    case
      when projected_row.transversal_conflict
        or projected_row.memory_placement_conflict
        or (
          explicit_bank.bank_item_id is not null
          and projected_row.placement_count > 0
        )
        then null::text
      when explicit_bank.bank_item_id is not null
        then null::text
      when explicit_bank.bank_item_id is null
        then projected_row.editorial_state
    end as editorial_state,
    placement_row.id as placement_id,
    placement_row.placement_type,
    placement_row.zone_id,
    zone_projection.legacy_zone_key as placement_zone_key,
    placement_row.slot_position,
    placement_row.created_at as placement_created_at,
    memory_row.recorded_at as state_recorded_at,
    inactive_historical.item_count as inactive_historical_count
  from projected as projected_row
  cross join physical_authority
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.matchday_id = projected_row.matchday_id
   and bank_row.id = projected_row.bank_item_id
  left join explicit_bank
    on explicit_bank.bank_item_id = projected_row.bank_item_id
  left join public.editorial_articles as article_row
    on pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)) =
       'editorial_article'
   and article_row.id::text =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  left join public.matchday_editorial_profile_state_items as state_row
    on not physical_authority.enabled
   and state_row.matchday_id = projected_row.matchday_id
   and state_row.profile_key = p_profile_key
   and pg_catalog.lower(pg_catalog.btrim(state_row.source_type)) =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
   and pg_catalog.lower(pg_catalog.btrim(state_row.source_id)) =
       pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
  left join public.matchday_live_layout_placements as placement_row
    on placement_row.matchday_id = projected_row.matchday_id
   and placement_row.bank_item_id = projected_row.bank_item_id
   and projected_row.placement_count = 1
  left join public.matchday_live_layout_bank_item_state_memory as memory_row
    on memory_row.matchday_id = projected_row.matchday_id
   and memory_row.bank_item_id = projected_row.bank_item_id
  left join jornada_private.matchday_live_layout_zone_legacy_projection
    as zone_projection
    on zone_projection.matchday_id = placement_row.matchday_id
   and zone_projection.zone_id = placement_row.zone_id
  cross join inactive_historical
  where pg_catalog.lower(
          pg_catalog.btrim(coalesce(projected_row.bank_status, ''))
        ) = 'active'
     or projected_row.placement_count > 0
  order by
    bank_row.updated_at desc,
    bank_row.id;
$function$;

revoke all on function
  public.read_matchday_live_desk_aggregate_tracking(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_matchday_live_desk_aggregate_tracking(uuid, text)
to service_role;

comment on function
  public.read_matchday_live_desk_aggregate_tracking(uuid, text)
is
  'Marker-aware live desk reader. Bank.classification_* and physical placements remain current after cutover; residual automatic state is exposed only before cutover.';


-- ============================================================
-- 6. CONTRACT AND PRIVILEGE POSTCONDITIONS
-- ============================================================

do $postconditions$
begin
  if pg_catalog.has_function_privilege(
    'anon',
    'public.refresh_matchday_editorial_profile_distribution(uuid)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.refresh_matchday_editorial_profile_distribution(uuid)',
    'EXECUTE'
  ) then
    raise exception 'matchday-profile-distribution-v16-public-execute-invalid';
  end if;

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.refresh_matchday_editorial_profile_distribution(uuid)',
    'EXECUTE'
  ) then
    raise exception 'matchday-profile-distribution-v16-service-role-missing';
  end if;

  if pg_catalog.has_function_privilege(
    'service_role',
    'public.matchday_editorial_profile_distribution_plan(uuid)',
    'EXECUTE'
  ) then
    raise exception 'matchday-profile-distribution-plan-v16-execute-invalid';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.read_matchday_live_desk_aggregate_tracking(uuid,text)',
    'EXECUTE'
  ) then
    raise exception 'matchday-profile-distribution-reader-v16-grant-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
