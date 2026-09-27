begin;

-- LOTE 8A / LOTE 1
-- Close the post-cutover publication/placement boundary without weakening the
-- v14 sentinels. Physical occupancy remains authoritative; legacy occupation
-- rows are only written while the private downstream context is active.

-- ============================================================
-- 1. LATEST SETTINGS: PHYSICAL AFTER CUTOVER, LEGACY BEFORE IT
-- ============================================================

alter table public.matchday_live_layout_workspace_settings
  add column latest_zone_mode text,
  add column latest_zone_title_color text;

alter table public.matchday_live_layout_workspace_settings
  add constraint matchday_live_layout_workspace_settings_latest_mode_check
    check (latest_zone_mode in ('latest_news', 'editorial_line')),
  add constraint matchday_live_layout_workspace_settings_latest_color_check
    check (
      latest_zone_title_color is null
      or latest_zone_title_color ~ '^#[0-9A-Fa-f]{6}$'
    );

update public.matchday_live_layout_workspace_settings as settings_row
set latest_zone_mode = coalesce(editorial_row.latest_zone_mode, 'latest_news'),
    latest_zone_title_color = editorial_row.latest_zone_title_color
from public.matchday_editorials as editorial_row
where editorial_row.matchday_id = settings_row.matchday_id;

update public.matchday_live_layout_workspace_settings
set latest_zone_mode = 'latest_news'
where latest_zone_mode is null;

create function jornada_private.initialize_matchday_live_layout_latest_settings_v15()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if new.latest_zone_mode is null then
    select coalesce(editorial_row.latest_zone_mode, 'latest_news'),
           editorial_row.latest_zone_title_color
    into new.latest_zone_mode, new.latest_zone_title_color
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = new.matchday_id;

    new.latest_zone_mode := coalesce(new.latest_zone_mode, 'latest_news');
  end if;

  return new;
end;
$function$;

revoke all on function
  jornada_private.initialize_matchday_live_layout_latest_settings_v15()
from public, anon, authenticated, service_role;

create trigger matchday_live_layout_latest_settings_initialize_v15
before insert on public.matchday_live_layout_workspace_settings
for each row
execute function
  jornada_private.initialize_matchday_live_layout_latest_settings_v15();

alter table public.matchday_live_layout_workspace_settings
  alter column latest_zone_mode set not null;

comment on column
  public.matchday_live_layout_workspace_settings.latest_zone_mode
is
  'Functional Latest content mode. Authoritative here after physical cutover; matchday_editorials is downstream compatibility only.';

comment on column
  public.matchday_live_layout_workspace_settings.latest_zone_title_color
is
  'Latest title presentation color. Authoritative here after physical cutover and projected to compatibility readers.';


create function public.set_matchday_latest_news_settings_v15(
  p_matchday_id uuid,
  p_latest_zone_mode text,
  p_latest_zone_title text default null,
  p_latest_zone_title_color text default null,
  p_write_title boolean default false
)
returns table (
  is_physical boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_is_physical boolean;
  v_profile_key text;
  v_changed boolean := false;
begin
  if p_matchday_id is null
    or p_latest_zone_mode not in ('latest_news', 'editorial_line')
    or (
      p_latest_zone_title_color is not null
      and p_latest_zone_title_color !~ '^#[0-9A-Fa-f]{6}$'
    )
    or (
      p_write_title
      and pg_catalog.char_length(
        pg_catalog.btrim(coalesce(p_latest_zone_title, ''))
      ) > 120
    )
  then
    raise exception 'matchday-latest-settings-v15-invalid-input';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-latest-settings-v15-matchday-not-found';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_matchday_id;

  v_is_physical := v_profile_key is not null;

  if v_is_physical then
    if not exists (
      select 1
      from public.matchday_editorial_profile_assignments as assignment_row
      where assignment_row.matchday_id = p_matchday_id
        and assignment_row.profile_key = v_profile_key
    ) or not exists (
      select 1
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_matchday_id
    ) then
      raise exception 'matchday-latest-settings-v15-physical-state-incoherent';
    end if;

    update public.matchday_live_layout_workspace_settings as settings_row
    set latest_zone_mode = p_latest_zone_mode,
        latest_zone_title = case
          when p_write_title
            then pg_catalog.btrim(coalesce(p_latest_zone_title, ''))
          else settings_row.latest_zone_title
        end,
        latest_zone_title_color = case
          when p_write_title
            then pg_catalog.upper(p_latest_zone_title_color)
          else settings_row.latest_zone_title_color
        end,
        updated_at = pg_catalog.statement_timestamp()
    where settings_row.matchday_id = p_matchday_id
      and row(
        settings_row.latest_zone_mode,
        settings_row.latest_zone_title,
        settings_row.latest_zone_title_color
      ) is distinct from row(
        p_latest_zone_mode,
        case when p_write_title
          then pg_catalog.btrim(coalesce(p_latest_zone_title, ''))
          else settings_row.latest_zone_title end,
        case when p_write_title
          then pg_catalog.upper(p_latest_zone_title_color)
          else settings_row.latest_zone_title_color end
      );
    v_changed := found;

    perform jornada_private.begin_matchday_live_layout_downstream_v14(
      p_matchday_id
    );

    begin
      insert into public.matchday_editorials as editorial_row (
        matchday_id,
        latest_zone_mode,
        latest_zone_title,
        latest_zone_title_color,
        updated_at
      ) values (
        p_matchday_id,
        p_latest_zone_mode,
        case when p_write_title
          then nullif(pg_catalog.btrim(coalesce(p_latest_zone_title, '')), '')
          else (
            select nullif(settings_row.latest_zone_title, '')
            from public.matchday_live_layout_workspace_settings
              as settings_row
            where settings_row.matchday_id = p_matchday_id
          ) end,
        case when p_write_title
          then pg_catalog.upper(p_latest_zone_title_color)
          else (
            select settings_row.latest_zone_title_color
            from public.matchday_live_layout_workspace_settings
              as settings_row
            where settings_row.matchday_id = p_matchday_id
          ) end,
        pg_catalog.statement_timestamp()
      )
      on conflict (matchday_id) do update
      set latest_zone_mode = excluded.latest_zone_mode,
          latest_zone_title = excluded.latest_zone_title,
          latest_zone_title_color = excluded.latest_zone_title_color,
          updated_at = pg_catalog.statement_timestamp()
      where row(
        editorial_row.latest_zone_mode,
        editorial_row.latest_zone_title,
        editorial_row.latest_zone_title_color
      ) is distinct from row(
        excluded.latest_zone_mode,
        excluded.latest_zone_title,
        excluded.latest_zone_title_color
      );
      v_changed := v_changed or found;

    exception when others then
      perform jornada_private.end_matchday_live_layout_downstream_v14(
        p_matchday_id
      );
      raise;
    end;

    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
  else
    insert into public.matchday_editorials as editorial_row (
      matchday_id,
      latest_zone_mode,
      latest_zone_title,
      latest_zone_title_color,
      updated_at
    ) values (
      p_matchday_id,
      p_latest_zone_mode,
      case when p_write_title
        then nullif(pg_catalog.btrim(coalesce(p_latest_zone_title, '')), '')
        else null end,
      case when p_write_title
        then pg_catalog.upper(p_latest_zone_title_color)
        else null end,
      pg_catalog.statement_timestamp()
    )
    on conflict (matchday_id) do update
    set latest_zone_mode = excluded.latest_zone_mode,
        latest_zone_title = case when p_write_title
          then excluded.latest_zone_title
          else editorial_row.latest_zone_title end,
        latest_zone_title_color = case when p_write_title
          then excluded.latest_zone_title_color
          else editorial_row.latest_zone_title_color end,
        updated_at = pg_catalog.statement_timestamp()
    where row(
      editorial_row.latest_zone_mode,
      editorial_row.latest_zone_title,
      editorial_row.latest_zone_title_color
    ) is distinct from row(
      excluded.latest_zone_mode,
      case when p_write_title
        then excluded.latest_zone_title
        else editorial_row.latest_zone_title end,
      case when p_write_title
        then excluded.latest_zone_title_color
        else editorial_row.latest_zone_title_color end
    );
    v_changed := found;
  end if;

  return query select v_is_physical, v_changed;
end;
$function$;

revoke all on function public.set_matchday_latest_news_settings_v15(
  uuid, text, text, text, boolean
)
from public, anon, authenticated, service_role;

grant execute on function public.set_matchday_latest_news_settings_v15(
  uuid, text, text, text, boolean
)
to service_role;

comment on function public.set_matchday_latest_news_settings_v15(
  uuid, text, text, text, boolean
)
is
  'Single Latest settings entrypoint. Before cutover it preserves the legacy row; after cutover it writes physical settings and projects matchday_editorials only inside the authorized downstream context.';


create function public.set_matchday_latest_zone_placement_v15(
  p_matchday_id uuid,
  p_latest_zone_placement text
)
returns table (
  is_physical boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_is_physical boolean;
  v_profile_key text;
  v_changed boolean := false;
begin
  if p_matchday_id is null
    or p_latest_zone_placement not in ('top', 'four_news', 'hidden')
  then
    raise exception 'matchday-latest-placement-v15-invalid-input';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-latest-placement-v15-matchday-not-found';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_matchday_id;

  v_is_physical := v_profile_key is not null;

  if v_is_physical then
    if not exists (
      select 1
      from public.matchday_editorial_profile_assignments as assignment_row
      where assignment_row.matchday_id = p_matchday_id
        and assignment_row.profile_key = v_profile_key
    ) or not exists (
      select 1
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_matchday_id
    ) then
      raise exception 'matchday-latest-placement-v15-physical-state-incoherent';
    end if;

    update public.matchday_live_layout_workspace_settings as settings_row
    set latest_zone_placement = p_latest_zone_placement,
        updated_at = pg_catalog.statement_timestamp()
    where settings_row.matchday_id = p_matchday_id
      and settings_row.latest_zone_placement is distinct from
          p_latest_zone_placement;
    v_changed := found;

    perform jornada_private.begin_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
    begin
      insert into public.matchday_editorials as editorial_row (
        matchday_id,
        latest_zone_placement,
        updated_at
      ) values (
        p_matchday_id,
        p_latest_zone_placement,
        pg_catalog.statement_timestamp()
      )
      on conflict (matchday_id) do update
      set latest_zone_placement = excluded.latest_zone_placement,
          updated_at = pg_catalog.statement_timestamp()
      where editorial_row.latest_zone_placement is distinct from
            excluded.latest_zone_placement;
      v_changed := v_changed or found;
    exception when others then
      perform jornada_private.end_matchday_live_layout_downstream_v14(
        p_matchday_id
      );
      raise;
    end;
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
  else
    insert into public.matchday_editorials as editorial_row (
      matchday_id,
      latest_zone_placement,
      updated_at
    ) values (
      p_matchday_id,
      p_latest_zone_placement,
      pg_catalog.statement_timestamp()
    )
    on conflict (matchday_id) do update
    set latest_zone_placement = excluded.latest_zone_placement,
        updated_at = pg_catalog.statement_timestamp()
    where editorial_row.latest_zone_placement is distinct from
          excluded.latest_zone_placement;
    v_changed := found;
  end if;

  return query select v_is_physical, v_changed;
end;
$function$;

revoke all on function public.set_matchday_latest_zone_placement_v15(
  uuid, text
)
from public, anon, authenticated, service_role;

grant execute on function public.set_matchday_latest_zone_placement_v15(
  uuid, text
)
to service_role;


create function public.set_matchday_roundup_presentation_v15(
  p_matchday_id uuid,
  p_complementary_mode text,
  p_complementary_roundup_item_id uuid default null,
  p_roundup_video_heading text default null,
  p_roundup_video_heading_color text default null
)
returns table (
  is_physical boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_is_physical boolean;
  v_profile_key text;
  v_changed boolean := false;
begin
  if p_matchday_id is null
    or p_complementary_mode not in ('none', 'roundup_video')
  then
    raise exception 'matchday-roundup-presentation-v15-invalid-input';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-roundup-presentation-v15-matchday-not-found';
  end if;

  if p_complementary_roundup_item_id is not null
    and not exists (
      select 1
      from public.matchday_roundup_items as roundup_row
      where roundup_row.id = p_complementary_roundup_item_id
        and roundup_row.matchday_id = p_matchday_id
    )
  then
    raise exception 'matchday-roundup-presentation-v15-item-invalid';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_matchday_id;

  v_is_physical := v_profile_key is not null;

  if v_is_physical then
    if not exists (
      select 1
      from public.matchday_editorial_profile_assignments as assignment_row
      where assignment_row.matchday_id = p_matchday_id
        and assignment_row.profile_key = v_profile_key
    ) or not exists (
      select 1
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_matchday_id
    ) then
      raise exception 'matchday-roundup-presentation-v15-physical-state-incoherent';
    end if;

    update public.matchday_live_layout_workspace_settings as settings_row
    set video_module_active = (p_complementary_mode = 'roundup_video'),
        updated_at = pg_catalog.statement_timestamp()
    where settings_row.matchday_id = p_matchday_id
      and settings_row.video_module_active is distinct from
          (p_complementary_mode = 'roundup_video');
    v_changed := found;

    perform jornada_private.begin_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
  end if;

  begin
    insert into public.matchday_editorials as editorial_row (
      matchday_id,
      complementary_mode,
      complementary_roundup_item_id,
      roundup_video_heading,
      roundup_video_heading_color,
      updated_at
    ) values (
      p_matchday_id,
      p_complementary_mode,
      p_complementary_roundup_item_id,
      p_roundup_video_heading,
      p_roundup_video_heading_color,
      pg_catalog.statement_timestamp()
    )
    on conflict (matchday_id) do update
    set complementary_mode = excluded.complementary_mode,
        complementary_roundup_item_id = excluded.complementary_roundup_item_id,
        roundup_video_heading = excluded.roundup_video_heading,
        roundup_video_heading_color = excluded.roundup_video_heading_color,
        updated_at = pg_catalog.statement_timestamp()
    where row(
      editorial_row.complementary_mode,
      editorial_row.complementary_roundup_item_id,
      editorial_row.roundup_video_heading,
      editorial_row.roundup_video_heading_color
    ) is distinct from row(
      excluded.complementary_mode,
      excluded.complementary_roundup_item_id,
      excluded.roundup_video_heading,
      excluded.roundup_video_heading_color
    );
    v_changed := v_changed or found;
  exception when others then
    if v_is_physical then
      perform jornada_private.end_matchday_live_layout_downstream_v14(
        p_matchday_id
      );
    end if;
    raise;
  end;

  if v_is_physical then
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
  end if;

  return query select v_is_physical, v_changed;
end;
$function$;

revoke all on function public.set_matchday_roundup_presentation_v15(
  uuid, text, uuid, text, text
)
from public, anon, authenticated, service_role;

grant execute on function public.set_matchday_roundup_presentation_v15(
  uuid, text, uuid, text, text
)
to service_role;


create function public.set_matchday_below_headline_presentation_v15(
  p_matchday_id uuid,
  p_below_headline_mode text,
  p_below_headline_heading text default null,
  p_below_headline_heading_color text default null
)
returns table (
  is_physical boolean,
  changed boolean
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_is_physical boolean;
  v_profile_key text;
  v_changed boolean := false;
begin
  if p_matchday_id is null
    or p_below_headline_mode not in ('highlights', 'roundup')
  then
    raise exception 'matchday-below-headline-presentation-v15-invalid-input';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-below-headline-presentation-v15-matchday-not-found';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_matchday_id;

  v_is_physical := v_profile_key is not null;

  if v_is_physical then
    if not exists (
      select 1
      from public.matchday_editorial_profile_assignments as assignment_row
      where assignment_row.matchday_id = p_matchday_id
        and assignment_row.profile_key = v_profile_key
    ) or not exists (
      select 1
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_matchday_id
    ) then
      raise exception 'matchday-below-headline-presentation-v15-physical-state-incoherent';
    end if;

    perform jornada_private.begin_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
  end if;

  begin
    insert into public.matchday_editorials as editorial_row (
      matchday_id,
      below_headline_mode,
      below_headline_heading,
      below_headline_heading_color,
      updated_at
    ) values (
      p_matchday_id,
      p_below_headline_mode,
      p_below_headline_heading,
      p_below_headline_heading_color,
      pg_catalog.statement_timestamp()
    )
    on conflict (matchday_id) do update
    set below_headline_mode = excluded.below_headline_mode,
        below_headline_heading = excluded.below_headline_heading,
        below_headline_heading_color = excluded.below_headline_heading_color,
        updated_at = pg_catalog.statement_timestamp()
    where row(
      editorial_row.below_headline_mode,
      editorial_row.below_headline_heading,
      editorial_row.below_headline_heading_color
    ) is distinct from row(
      excluded.below_headline_mode,
      excluded.below_headline_heading,
      excluded.below_headline_heading_color
    );
    v_changed := found;
  exception when others then
    if v_is_physical then
      perform jornada_private.end_matchday_live_layout_downstream_v14(
        p_matchday_id
      );
    end if;
    raise;
  end;

  if v_is_physical then
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
  end if;

  return query select v_is_physical, v_changed;
end;
$function$;

revoke all on function public.set_matchday_below_headline_presentation_v15(
  uuid, text, text, text
)
from public, anon, authenticated, service_role;

grant execute on function public.set_matchday_below_headline_presentation_v15(
  uuid, text, text, text
)
to service_role;


-- ============================================================
-- 2. ONE PHYSICAL SINGLE-PLACEMENT COMMAND FOR EVERY SURFACE
-- ============================================================

create function public.matchday_live_layout_single_placement_authority_v15(
  p_matchday_id uuid
)
returns table (
  is_physical boolean,
  profile_key text,
  state_token text
)
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_profile_key text;
  v_has_marker boolean;
begin
  if p_matchday_id is null then
    raise exception 'matchday-live-layout-single-v15-invalid-matchday';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_matchday_id;

  v_has_marker := v_profile_key is not null;

  if v_has_marker and (
    not exists (
      select 1
      from public.matchday_editorial_profile_assignments as assignment_row
      where assignment_row.matchday_id = p_matchday_id
        and assignment_row.profile_key = v_profile_key
    )
    or not exists (
      select 1
      from public.matchday_live_layout_workspace_settings as settings_row
      where settings_row.matchday_id = p_matchday_id
    )
  ) then
    raise exception 'matchday-live-layout-single-v15-physical-state-incoherent';
  end if;

  return query
  select
    v_has_marker,
    v_profile_key,
    case when v_has_marker then (
      select token_row.state_token
      from public.matchday_editorial_profile_workspace_token_v13(
        p_matchday_id,
        v_profile_key
      ) as token_row
    ) else null end;
end;
$function$;

revoke all on function
  public.matchday_live_layout_single_placement_authority_v15(uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.matchday_live_layout_single_placement_authority_v15(uuid)
to service_role;


create function public.apply_matchday_live_layout_single_placement_v15(
  p_matchday_id uuid,
  p_expected_physical_state_token text,
  p_action text,
  p_bank_item_id uuid,
  p_placement_type text default null,
  p_zone_id uuid default null,
  p_slot_position integer default null,
  p_expected_target_bank_item_id uuid default null,
  p_expect_target_empty boolean default false
)
returns table (
  state_token text,
  no_op boolean,
  placement_id uuid,
  displaced_bank_item_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_action text := pg_catalog.lower(pg_catalog.btrim(p_action));
  v_profile_key text;
  v_current_state_token text;
  v_final_state_token text;
  v_classification_before text;
  v_current_placement public.matchday_live_layout_placements%rowtype;
  v_target_occupant uuid;
  v_final_placement_id uuid;
  v_is_no_op boolean := false;
  v_plan jsonb;
begin
  if p_matchday_id is null
    or p_bank_item_id is null
    or p_action is null
    or p_expected_physical_state_token is null
    or pg_catalog.btrim(p_expected_physical_state_token) !~ '^[0-9a-f]{32}$'
    or v_action not in ('place', 'displace', 'bank')
    or p_expect_target_empty is null
  then
    raise exception 'matchday-live-layout-single-v15-invalid-input';
  end if;

  if (v_action = 'place' and p_placement_type is null)
    or (
      v_action <> 'place'
      and p_placement_type is null
      and (p_zone_id is not null or p_slot_position is not null)
    )
    or (p_placement_type is not null and (
      p_placement_type not in (
      'opening', 'faixa', 'selection', 'video_highlight', 'zone'
      )
      or p_slot_position is null
      or not (
        (p_placement_type = 'opening' and p_zone_id is null
          and p_slot_position between 1 and 5)
        or (p_placement_type = 'faixa' and p_zone_id is null
          and p_slot_position > 0)
        or (p_placement_type = 'selection' and p_zone_id is null
          and p_slot_position between 1 and 4)
        or (p_placement_type = 'video_highlight' and p_zone_id is null
          and p_slot_position = 1)
        or (p_placement_type = 'zone' and p_zone_id is not null
          and p_slot_position > 0)
      )
    ))
  then
    raise exception 'matchday-live-layout-single-v15-target-invalid';
  end if;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-live-layout-single-v15-matchday-not-found';
  end if;

  select marker_row.profile_key
  into v_profile_key
  from jornada_private.matchday_live_layout_physical_cutovers as marker_row
  where marker_row.matchday_id = p_matchday_id;

  if v_profile_key is null then
    raise exception 'matchday-live-layout-single-v15-physical-cutover-required';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-live-layout-single-v15-matchday-not-live';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = p_matchday_id
      and assignment_row.profile_key = v_profile_key
  ) or not exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-single-v15-physical-state-incoherent';
  end if;

  select token_row.state_token
  into v_current_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    v_profile_key
  ) as token_row;

  if v_current_state_token is distinct from
     pg_catalog.btrim(p_expected_physical_state_token)
  then
    raise exception 'matchday-live-layout-single-v15-stale';
  end if;

  perform 1
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = p_bank_item_id
    and bank_row.matchday_id = p_matchday_id
    and pg_catalog.lower(pg_catalog.btrim(coalesce(bank_row.status, ''))) =
        'active'
  for update;

  if not found then
    raise exception 'matchday-live-layout-single-v15-bank-item-not-active';
  end if;

  if p_placement_type = 'zone' and not exists (
    select 1
    from public.matchday_live_layout_zones as zone_row
    where zone_row.id = p_zone_id
      and zone_row.matchday_id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-single-v15-zone-invalid';
  end if;

  if p_placement_type = 'faixa' and p_slot_position > (
    select settings_row.faixa_slot_count
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-single-v15-faixa-slot-invalid';
  end if;

  if p_placement_type = 'video_highlight' and not (
    select settings_row.video_module_active
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
  ) then
    raise exception 'matchday-live-layout-single-v15-video-inactive';
  end if;

  perform 1
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
  order by placement_row.id
  for update;

  select placement_row.*
  into v_current_placement
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.bank_item_id = p_bank_item_id;

  if found and v_action in ('displace', 'bank')
    and p_placement_type is not null
    and (
    v_current_placement.placement_type is distinct from p_placement_type
    or v_current_placement.zone_id is distinct from p_zone_id
    or v_current_placement.slot_position is distinct from p_slot_position
  ) then
    raise exception 'matchday-live-layout-single-v15-source-stale';
  end if;

  if v_action = 'place' then
    select placement_row.bank_item_id
    into v_target_occupant
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and placement_row.placement_type = p_placement_type
      and placement_row.zone_id is not distinct from p_zone_id
      and placement_row.slot_position = p_slot_position;

    if p_expect_target_empty
      and v_target_occupant is not null
      and v_target_occupant is distinct from p_bank_item_id
    then
      raise exception 'matchday-live-layout-single-v15-target-changed';
    end if;

    if p_expected_target_bank_item_id is not null
      and v_target_occupant is distinct from p_expected_target_bank_item_id
    then
      raise exception 'matchday-live-layout-single-v15-target-changed';
    end if;

    v_is_no_op := v_current_placement.id is not null
      and v_current_placement.placement_type = p_placement_type
      and v_current_placement.zone_id is not distinct from p_zone_id
      and v_current_placement.slot_position = p_slot_position
      and not exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = p_bank_item_id
      )
      and not exists (
        select 1
        from public.matchday_editorial_bank_items as bank_row
        join public.matchday_editorial_profile_manual_overrides as override_row
          on override_row.matchday_id = bank_row.matchday_id
         and override_row.profile_key = v_profile_key
         and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
             pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
         and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
             pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
        where bank_row.id = p_bank_item_id
          and bank_row.matchday_id = p_matchday_id
          and override_row.placement_target = 'bank'
      );
  elsif v_action = 'bank' then
    v_is_no_op := v_current_placement.id is null
      and not exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = p_bank_item_id
      )
      and exists (
        select 1
        from public.matchday_editorial_bank_items as bank_row
        join public.matchday_editorial_profile_manual_overrides as override_row
          on override_row.matchday_id = bank_row.matchday_id
         and override_row.profile_key = v_profile_key
         and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
             pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
         and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
             pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
        where bank_row.id = p_bank_item_id
          and bank_row.matchday_id = p_matchday_id
          and override_row.placement_target = 'bank'
      );
  else
    v_is_no_op := v_current_placement.id is null
      and exists (
        select 1
        from public.matchday_live_layout_bank_item_state_memory as memory_row
        where memory_row.matchday_id = p_matchday_id
          and memory_row.bank_item_id = p_bank_item_id
          and memory_row.memory_kind = 'displaced'
      )
      and not exists (
        select 1
        from public.matchday_editorial_bank_items as bank_row
        join public.matchday_editorial_profile_manual_overrides as override_row
          on override_row.matchday_id = bank_row.matchday_id
         and override_row.profile_key = v_profile_key
         and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
             pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
         and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
             pg_catalog.lower(pg_catalog.btrim(bank_row.source_id))
        where bank_row.id = p_bank_item_id
          and bank_row.matchday_id = p_matchday_id
          and override_row.placement_target = 'bank'
      );
  end if;

  if v_is_no_op then
    return query select
      v_current_state_token,
      true,
      v_current_placement.id,
      null::uuid;
    return;
  end if;

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

  perform jornada_private.begin_matchday_live_layout_downstream_v14(
    p_matchday_id
  );

  begin
    if v_action = 'bank' then
      if coalesce(pg_catalog.lower(pg_catalog.btrim((
        select bank_row.source_type
        from public.matchday_editorial_bank_items as bank_row
        where bank_row.id = p_bank_item_id
      ))), '') <> 'editorial_article' then
        raise exception 'matchday-live-layout-single-v15-explicit-bank-unsupported';
      end if;

      insert into public.matchday_editorial_profile_manual_overrides
        as override_row (
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
        v_profile_key,
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
        pg_catalog.lower(pg_catalog.btrim(bank_row.source_id)),
        'bank',
        null,
        null
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.id = p_bank_item_id
        and bank_row.matchday_id = p_matchday_id
      on conflict (matchday_id, profile_key, source_type, source_id)
      do update
      set placement_target = 'bank',
          zone_key = null,
          sort_order = null,
          updated_at = pg_catalog.statement_timestamp()
      where override_row.placement_target is distinct from 'bank'
        or override_row.zone_key is not null
        or override_row.sort_order is not null;
    else
      delete from public.matchday_editorial_profile_manual_overrides
        as override_row
      using public.matchday_editorial_bank_items as bank_row
      where bank_row.id = p_bank_item_id
        and bank_row.matchday_id = p_matchday_id
        and override_row.matchday_id = p_matchday_id
        and override_row.profile_key = v_profile_key
        and override_row.placement_target = 'bank'
        and pg_catalog.lower(pg_catalog.btrim(override_row.source_type)) =
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_type))
        and pg_catalog.lower(pg_catalog.btrim(override_row.source_id)) =
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_id));
    end if;

    if v_action = 'place' then
      v_plan := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'action', 'place',
          'bank_item_id', p_bank_item_id,
          'placement_type', p_placement_type,
          'zone_id', p_zone_id,
          'slot_position', p_slot_position
        )
      );
    elsif v_current_placement.id is not null then
      v_plan := pg_catalog.jsonb_build_array(
        pg_catalog.jsonb_build_object(
          'action', 'clear',
          'bank_item_id', null,
          'placement_type', v_current_placement.placement_type,
          'zone_id', v_current_placement.zone_id,
          'slot_position', v_current_placement.slot_position
        )
      );
    else
      v_plan := '[]'::jsonb;
    end if;

    perform jornada_private.apply_matchday_live_layout_placement_plan(
      p_matchday_id,
      v_plan,
      false
    );

    if v_action = 'bank' then
      delete from public.matchday_live_layout_bank_item_state_memory
        as memory_row
      where memory_row.matchday_id = p_matchday_id
        and memory_row.bank_item_id = p_bank_item_id;
    elsif v_action = 'displace' then
      insert into public.matchday_live_layout_bank_item_state_memory
        as memory_row (
          matchday_id,
          bank_item_id,
          memory_kind,
          recorded_at
        ) values (
          p_matchday_id,
          p_bank_item_id,
          'displaced',
          pg_catalog.statement_timestamp()
        )
      on conflict (matchday_id, bank_item_id) do update
      set memory_kind = 'displaced',
          recorded_at = excluded.recorded_at
      where memory_row.memory_kind is distinct from 'displaced';
    end if;

    update public.matchday_editorial_bank_items as bank_row
    set editorially_worked_at = pg_catalog.statement_timestamp()
    where bank_row.id = p_bank_item_id
      and bank_row.matchday_id = p_matchday_id
      and bank_row.editorially_worked_at is null;

    perform jornada_private.project_matchday_live_layout_placements_downstream_v14(
      p_matchday_id,
      v_profile_key
    );

  exception when others then
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      p_matchday_id
    );
    raise;
  end;

  perform jornada_private.end_matchday_live_layout_downstream_v14(
    p_matchday_id
  );

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
    raise exception 'matchday-live-layout-single-v15-classification-changed';
  end if;

  perform jornada_private.assert_matchday_live_layout_downstream_v14(
    p_matchday_id,
    v_profile_key
  );

  select placement_row.id
  into v_final_placement_id
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.bank_item_id = p_bank_item_id;

  select token_row.state_token
  into v_final_state_token
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    v_profile_key
  ) as token_row;

  return query select
    v_final_state_token,
    false,
    v_final_placement_id,
    case when v_action = 'place' and v_target_occupant is distinct from
      p_bank_item_id then v_target_occupant else null end;
end;
$function$;

revoke all on function public.apply_matchday_live_layout_single_placement_v15(
  uuid, text, text, uuid, text, uuid, integer, uuid, boolean
)
from public, anon, authenticated, service_role;

grant execute on function public.apply_matchday_live_layout_single_placement_v15(
  uuid, text, text, uuid, text, uuid, integer, uuid, boolean
)
to service_role;

comment on function public.apply_matchday_live_layout_single_placement_v15(
  uuid, text, text, uuid, text, uuid, integer, uuid, boolean
)
is
  'Physical-only single placement command shared by every editorial surface. It uses full workspace OCC, preserves real no-ops, Bank/displaced semantics and classification, and projects legacy only downstream in the same transaction.';


-- ============================================================
-- 3. ATOMIC CANONICAL ARTICLE SNAPSHOT PROJECTION
-- ============================================================

create function jornada_private.refresh_editorial_article_carryover_snapshot_v15(
  p_snapshot jsonb,
  p_links text[],
  p_current_link text,
  p_label text,
  p_title text,
  p_subtitle text,
  p_image_url text,
  p_author text,
  p_latest_label text,
  p_updated_at timestamptz
)
returns jsonb
language plpgsql
immutable
security definer
set search_path = ''
as $function$
declare
  v_result jsonb := p_snapshot;
  v_value jsonb;
begin
  if p_snapshot is null
    or pg_catalog.jsonb_typeof(p_snapshot) <> 'object'
    or p_snapshot ->> 'version' <> '2'
  then
    return p_snapshot;
  end if;

  v_value := p_snapshot -> 'headline';
  if pg_catalog.jsonb_typeof(v_value) = 'object'
    and pg_catalog.btrim(coalesce(v_value ->> 'link_url', '')) = any(p_links)
  then
    v_result := pg_catalog.jsonb_set(
      v_result,
      '{headline}',
      v_value || pg_catalog.jsonb_build_object(
        'title', p_title,
        'summary', p_subtitle,
        'image_url', p_image_url,
        'link_url', p_current_link
      )
    );
  end if;

  v_value := p_snapshot -> 'side_block';
  if pg_catalog.jsonb_typeof(v_value) = 'object'
    and pg_catalog.btrim(coalesce(v_value ->> 'link_url', '')) = any(p_links)
  then
    v_result := pg_catalog.jsonb_set(
      v_result,
      '{side_block}',
      v_value || pg_catalog.jsonb_build_object(
        'label', p_label,
        'title', p_title,
        'author', p_author,
        'text', pg_catalog.left(p_subtitle, 500),
        'image_url', p_image_url,
        'link_url', p_current_link
      )
    );
  end if;

  if pg_catalog.jsonb_typeof(p_snapshot -> 'highlights') = 'array' then
    select pg_catalog.jsonb_agg(
      case
        when pg_catalog.jsonb_typeof(item_row.item) = 'object'
          and pg_catalog.btrim(coalesce(item_row.item ->> 'link_url', '')) =
              any(p_links)
        then item_row.item || pg_catalog.jsonb_build_object(
          'title', p_title,
          'subtitle', p_subtitle,
          'image_url', p_image_url,
          'link_url', p_current_link
        )
        else item_row.item
      end
      order by item_row.ordinality
    )
    into v_value
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'highlights')
      with ordinality as item_row(item, ordinality);

    v_result := pg_catalog.jsonb_set(
      v_result,
      '{highlights}',
      coalesce(v_value, '[]'::jsonb)
    );
  end if;

  if pg_catalog.jsonb_typeof(p_snapshot -> 'live_layout_items') = 'array' then
    select pg_catalog.jsonb_agg(
      case
        when pg_catalog.jsonb_typeof(item_row.item) = 'object'
          and pg_catalog.jsonb_typeof(item_row.item -> 'link_url') = 'string'
          and pg_catalog.btrim(item_row.item ->> 'link_url') = any(p_links)
        then item_row.item || pg_catalog.jsonb_build_object(
          'label', case
            when coalesce(item_row.item ->> 'slot_type', '') ~
                 '^live_four_news:[1-4]$'
              then p_latest_label
            else p_label
          end,
          'title', p_title,
          'subtitle', p_subtitle,
          'image_url', p_image_url,
          'link_url', p_current_link,
          'updated_at', p_updated_at
        )
        else item_row.item
      end
      order by item_row.ordinality
    )
    into v_value
    from pg_catalog.jsonb_array_elements(p_snapshot -> 'live_layout_items')
      with ordinality as item_row(item, ordinality);

    v_result := pg_catalog.jsonb_set(
      v_result,
      '{live_layout_items}',
      coalesce(v_value, '[]'::jsonb)
    );
  end if;

  return v_result;
end;
$function$;

revoke all on function
  jornada_private.refresh_editorial_article_carryover_snapshot_v15(
    jsonb, text[], text, text, text, text, text, text, text, timestamptz
  )
from public, anon, authenticated, service_role;


create function public.sync_editorial_article_live_snapshots_v15(
  p_article_id uuid,
  p_previous_slug text default null
)
returns table (
  affected_matchday_ids uuid[],
  updated_live_layout_item_ids uuid[],
  updated_carryover_matchday_ids uuid[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_slug text;
  v_label text;
  v_title text;
  v_subtitle text;
  v_image_url text;
  v_author text;
  v_published_at timestamptz;
  v_current_link text;
  v_links text[];
  v_latest_label text;
  v_updated_at timestamptz := pg_catalog.statement_timestamp();
  v_matchday_ids uuid[] := '{}'::uuid[];
  v_physical_matchday_ids uuid[] := '{}'::uuid[];
  v_live_item_ids uuid[] := '{}'::uuid[];
  v_carryover_matchday_ids uuid[] := '{}'::uuid[];
  v_matchday_id uuid;
begin
  if p_article_id is null then
    raise exception 'editorial-article-live-snapshot-v15-article-required';
  end if;

  select
    nullif(pg_catalog.btrim(article_row.slug), ''),
    nullif(pg_catalog.btrim(article_row.label), ''),
    nullif(pg_catalog.btrim(article_row.title), ''),
    nullif(pg_catalog.btrim(article_row.subtitle), ''),
    nullif(pg_catalog.btrim(article_row.image_url), ''),
    nullif(pg_catalog.btrim(article_row.author), ''),
    article_row.published_at
  into
    v_slug,
    v_label,
    v_title,
    v_subtitle,
    v_image_url,
    v_author,
    v_published_at
  from public.editorial_articles as article_row
  where article_row.id = p_article_id
  for key share;

  if not found or v_slug is null then
    raise exception 'editorial-article-live-snapshot-v15-article-invalid';
  end if;

  v_current_link := '/noticias/' || v_slug;
  select pg_catalog.array_agg(link_row.link order by link_row.link)
  into v_links
  from (
    select distinct candidate.link
    from pg_catalog.unnest(array[
      case when nullif(pg_catalog.btrim(p_previous_slug), '') is null
        then null
        else '/noticias/' || pg_catalog.btrim(p_previous_slug) end,
      v_current_link
    ]) as candidate(link)
    where candidate.link is not null
  ) as link_row;

  v_latest_label := nullif(pg_catalog.concat_ws(
    ' · ',
    case when v_published_at is null then null else pg_catalog.to_char(
      v_published_at at time zone 'Europe/Lisbon',
      'HH24:MI'
    ) end,
    v_label
  ), '');

  select coalesce(pg_catalog.array_agg(distinct affected.matchday_id),
                  '{}'::uuid[])
  into v_matchday_ids
  from (
    select bank_row.matchday_id
    from public.matchday_editorial_bank_items as bank_row
    where pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_type, ''))
          ) = 'editorial_article'
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_id, ''))
          ) = pg_catalog.lower(p_article_id::text)
    union all
    select editorial_row.matchday_id
    from public.matchday_editorials as editorial_row
    where editorial_row.headline_link_url = any(v_links)
       or editorial_row.side_block_link_url = any(v_links)
       or editorial_row.complementary_link_url = any(v_links)
    union all
    select highlight_row.matchday_id
    from public.matchday_highlights as highlight_row
    where highlight_row.link_url = any(v_links)
    union all
    select latest_row.matchday_id
    from public.matchday_latest_news as latest_row
    where latest_row.link_url = any(v_links)
    union all
    select horizontal_row.matchday_id
    from public.matchday_horizontal_news as horizontal_row
    where horizontal_row.link_url = any(v_links)
    union all
    select live_row.matchday_id
    from public.matchday_live_layout_items as live_row
    where live_row.link_url = any(v_links)
  ) as affected;

  select coalesce(pg_catalog.array_agg(matchday_row.matchday_id),
                  '{}'::uuid[])
  into v_physical_matchday_ids
  from (
    select distinct marker_row.matchday_id
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id = any(v_matchday_ids)
    order by marker_row.matchday_id
  ) as matchday_row;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = any(v_matchday_ids)
  order by matchday_row.id
  for update;

  foreach v_matchday_id in array v_physical_matchday_ids loop
    perform jornada_private.begin_matchday_live_layout_downstream_v14(
      v_matchday_id
    );
  end loop;

  begin
    update public.matchday_editorial_bank_items as bank_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        source_slug = v_slug,
        updated_at = v_updated_at
    where pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_type, ''))
          ) = 'editorial_article'
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_id, ''))
          ) = pg_catalog.lower(p_article_id::text)
      and row(
        bank_row.label,
        bank_row.title,
        bank_row.subtitle,
        bank_row.image_url,
        bank_row.link_url,
        bank_row.source_slug
      ) is distinct from row(
        v_label,
        v_title,
        v_subtitle,
        v_image_url,
        v_current_link,
        v_slug
      );

    update public.matchday_editorials as editorial_row
    set title = v_title,
        summary = v_subtitle,
        image_url = v_image_url,
        headline_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.headline_link_url = any(v_links);

    update public.matchday_editorials as editorial_row
    set side_block_label = v_label,
        side_block_title = v_title,
        side_block_author = v_author,
        side_block_text = pg_catalog.left(v_subtitle, 500),
        side_block_image_url = v_image_url,
        side_block_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.side_block_link_url = any(v_links);

    update public.matchday_editorials as editorial_row
    set complementary_label = v_label,
        complementary_title = v_title,
        complementary_text = v_subtitle,
        complementary_image_url = v_image_url,
        complementary_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.complementary_link_url = any(v_links);

    update public.matchday_highlights as highlight_row
    set title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where highlight_row.link_url = any(v_links);

    update public.matchday_latest_news as latest_row
    set time_label = v_latest_label,
        title = v_title,
        subtitle = null,
        image_url = null,
        link_url = v_current_link,
        updated_at = v_updated_at
    where latest_row.link_url = any(v_links);

    update public.matchday_horizontal_news as horizontal_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where horizontal_row.link_url = any(v_links);

    update public.site_editorials as editorial_row
    set headline_title = v_title,
        headline_subtitle = v_subtitle,
        headline_image_url = v_image_url,
        headline_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.headline_link_url = any(v_links);

    update public.site_editorials as editorial_row
    set side_block_label = v_label,
        side_block_title = v_title,
        side_block_author = v_author,
        side_block_text = pg_catalog.left(v_subtitle, 500),
        side_block_image_url = v_image_url,
        side_block_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.side_block_link_url = any(v_links);

    update public.site_editorials as editorial_row
    set complementary_label = v_label,
        complementary_title = v_title,
        complementary_text = v_subtitle,
        complementary_image_url = v_image_url,
        complementary_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.complementary_link_url = any(v_links);

    update public.site_editorial_highlights as highlight_row
    set title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where highlight_row.link_url = any(v_links);

    update public.site_editorial_latest_news as latest_row
    set time_label = v_latest_label,
        title = v_title,
        subtitle = null,
        image_url = null,
        link_url = v_current_link,
        updated_at = v_updated_at
    where latest_row.link_url = any(v_links);

    update public.site_editorial_horizontal_news as horizontal_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where horizontal_row.link_url = any(v_links);

    with updated as (
      update public.matchday_live_layout_items as live_row
      set label = v_label,
          title = v_title,
          subtitle = v_subtitle,
          image_url = v_image_url,
          link_url = v_current_link,
          updated_at = v_updated_at
      where live_row.link_url = any(v_links)
        and live_row.slot_type !~ '^live_four_news:[1-4]$'
      returning live_row.id
    )
    select coalesce(pg_catalog.array_agg(updated.id order by updated.id),
                    '{}'::uuid[])
    into v_live_item_ids
    from updated;

    with refreshed as materialized (
      select
        desk_row.matchday_id,
        desk_row.carryover_source_composition_id,
        jornada_private.refresh_editorial_article_carryover_snapshot_v15(
          desk_row.carryover_snapshot,
          v_links,
          v_current_link,
          v_label,
          v_title,
          v_subtitle,
          v_image_url,
          v_author,
          v_latest_label,
          v_updated_at
        ) as next_snapshot
      from public.matchday_editorial_desk_control as desk_row
      where desk_row.carryover_snapshot ->> 'version' = '2'
    ),
    updated as (
      update public.matchday_editorial_desk_control as desk_row
      set carryover_snapshot = refreshed.next_snapshot,
          updated_at = v_updated_at
      from refreshed
      where desk_row.matchday_id = refreshed.matchday_id
        and desk_row.carryover_source_composition_id is not distinct from
            refreshed.carryover_source_composition_id
        and desk_row.carryover_snapshot is distinct from refreshed.next_snapshot
      returning desk_row.matchday_id
    )
    select coalesce(pg_catalog.array_agg(distinct updated.matchday_id),
                    '{}'::uuid[])
    into v_carryover_matchday_ids
    from updated;

    foreach v_matchday_id in array v_matchday_ids loop
      if exists (
        select 1
        from jornada_private.matchday_live_layout_physical_cutovers
          as marker_row
        where marker_row.matchday_id = v_matchday_id
      ) or exists (
        select 1
        from public.matchday_editorial_profile_assignments as assignment_row
        where assignment_row.matchday_id = v_matchday_id
      ) then
        perform public.refresh_matchday_live_layout_legacy(v_matchday_id);
      end if;
    end loop;

  exception when others then
    foreach v_matchday_id in array v_physical_matchday_ids loop
      perform jornada_private.end_matchday_live_layout_downstream_v14(
        v_matchday_id
      );
    end loop;
    raise;
  end;

  foreach v_matchday_id in array v_physical_matchday_ids loop
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      v_matchday_id
    );
  end loop;

  return query select
    v_matchday_ids,
    v_live_item_ids,
    v_carryover_matchday_ids;
end;
$function$;

revoke all on function public.sync_editorial_article_live_snapshots_v15(
  uuid, text
)
from public, anon, authenticated, service_role;

grant execute on function public.sync_editorial_article_live_snapshots_v15(
  uuid, text
)
to service_role;

comment on function public.sync_editorial_article_live_snapshots_v15(
  uuid, text
)
is
  'Atomic live snapshot refresh. Physical occupation compatibility is updated only under the downstream context; placement rows and contextual classification are not modified.';


create function public.sync_editorial_content_live_snapshots_v15(
  p_content_id uuid,
  p_previous_slug text default null
)
returns table (
  affected_matchday_ids uuid[]
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_slug text;
  v_label text;
  v_title text;
  v_subtitle text;
  v_image_url text;
  v_author text;
  v_current_link text;
  v_links text[];
  v_updated_at timestamptz := pg_catalog.statement_timestamp();
  v_matchday_ids uuid[] := '{}'::uuid[];
  v_physical_matchday_ids uuid[] := '{}'::uuid[];
  v_matchday_id uuid;
begin
  if p_content_id is null then
    raise exception 'editorial-content-live-snapshot-v15-content-required';
  end if;

  select
    nullif(pg_catalog.btrim(content_row.slug), ''),
    coalesce(
      nullif(pg_catalog.btrim(content_row.label), ''),
      nullif(pg_catalog.btrim(content_row.content_type), ''),
      'Conteudo'
    ),
    nullif(pg_catalog.btrim(content_row.title), ''),
    coalesce(
      nullif(pg_catalog.btrim(content_row.subtitle), ''),
      nullif(pg_catalog.btrim(content_row.summary), '')
    ),
    coalesce(
      nullif(pg_catalog.btrim(content_row.thumbnail_url), ''),
      nullif(pg_catalog.btrim(content_row.image_url), '')
    ),
    nullif(pg_catalog.btrim(content_row.author), '')
  into
    v_slug,
    v_label,
    v_title,
    v_subtitle,
    v_image_url,
    v_author
  from public.editorial_contents as content_row
  where content_row.id = p_content_id
  for key share;

  if not found or v_slug is null or v_title is null then
    raise exception 'editorial-content-live-snapshot-v15-content-invalid';
  end if;

  v_current_link := '/conteudos/' || v_slug;
  select pg_catalog.array_agg(link_row.link order by link_row.link)
  into v_links
  from (
    select distinct candidate.link
    from pg_catalog.unnest(array[
      case when nullif(pg_catalog.btrim(p_previous_slug), '') is null
        then null
        else '/conteudos/' || pg_catalog.btrim(p_previous_slug) end,
      v_current_link
    ]) as candidate(link)
    where candidate.link is not null
  ) as link_row;

  select coalesce(pg_catalog.array_agg(distinct affected.matchday_id),
                  '{}'::uuid[])
  into v_matchday_ids
  from (
    select bank_row.matchday_id
    from public.matchday_editorial_bank_items as bank_row
    where pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_type, ''))
          ) = 'editorial_content'
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_id, ''))
          ) = pg_catalog.lower(p_content_id::text)
    union all
    select editorial_row.matchday_id
    from public.matchday_editorials as editorial_row
    where editorial_row.headline_link_url = any(v_links)
       or editorial_row.side_block_link_url = any(v_links)
       or editorial_row.complementary_link_url = any(v_links)
    union all
    select highlight_row.matchday_id
    from public.matchday_highlights as highlight_row
    where highlight_row.link_url = any(v_links)
    union all
    select latest_row.matchday_id
    from public.matchday_latest_news as latest_row
    where latest_row.link_url = any(v_links)
    union all
    select horizontal_row.matchday_id
    from public.matchday_horizontal_news as horizontal_row
    where horizontal_row.link_url = any(v_links)
    union all
    select live_row.matchday_id
    from public.matchday_live_layout_items as live_row
    where live_row.link_url = any(v_links)
  ) as affected;

  select coalesce(pg_catalog.array_agg(matchday_row.matchday_id),
                  '{}'::uuid[])
  into v_physical_matchday_ids
  from (
    select distinct marker_row.matchday_id
    from jornada_private.matchday_live_layout_physical_cutovers as marker_row
    where marker_row.matchday_id = any(v_matchday_ids)
    order by marker_row.matchday_id
  ) as matchday_row;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = any(v_matchday_ids)
  order by matchday_row.id
  for update;

  foreach v_matchday_id in array v_physical_matchday_ids loop
    perform jornada_private.begin_matchday_live_layout_downstream_v14(
      v_matchday_id
    );
  end loop;

  begin
    update public.matchday_editorial_bank_items as bank_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        source_slug = v_slug,
        updated_at = v_updated_at
    where pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_type, ''))
          ) = 'editorial_content'
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_id, ''))
          ) = pg_catalog.lower(p_content_id::text)
      and row(
        bank_row.label,
        bank_row.title,
        bank_row.subtitle,
        bank_row.image_url,
        bank_row.link_url,
        bank_row.source_slug
      ) is distinct from row(
        v_label,
        v_title,
        v_subtitle,
        v_image_url,
        v_current_link,
        v_slug
      );

    update public.matchday_editorials as editorial_row
    set title = v_title,
        summary = v_subtitle,
        image_url = v_image_url,
        headline_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.headline_link_url = any(v_links);

    update public.matchday_editorials as editorial_row
    set side_block_label = v_label,
        side_block_title = v_title,
        side_block_author = v_author,
        side_block_text = pg_catalog.left(v_subtitle, 500),
        side_block_image_url = v_image_url,
        side_block_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.side_block_link_url = any(v_links);

    update public.matchday_editorials as editorial_row
    set complementary_label = v_label,
        complementary_title = v_title,
        complementary_text = v_subtitle,
        complementary_image_url = v_image_url,
        complementary_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.complementary_link_url = any(v_links);

    update public.matchday_highlights as highlight_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where highlight_row.link_url = any(v_links);

    update public.matchday_latest_news as latest_row
    set title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where latest_row.link_url = any(v_links);

    update public.matchday_horizontal_news as horizontal_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where horizontal_row.link_url = any(v_links);

    update public.matchday_live_layout_items as live_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where live_row.link_url = any(v_links)
      and live_row.slot_type !~ '^live_four_news:[1-4]$';

    update public.site_editorials as editorial_row
    set headline_title = v_title,
        headline_subtitle = v_subtitle,
        headline_image_url = v_image_url,
        headline_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.headline_link_url = any(v_links);

    update public.site_editorials as editorial_row
    set side_block_label = v_label,
        side_block_title = v_title,
        side_block_author = v_author,
        side_block_text = pg_catalog.left(v_subtitle, 500),
        side_block_image_url = v_image_url,
        side_block_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.side_block_link_url = any(v_links);

    update public.site_editorials as editorial_row
    set complementary_label = v_label,
        complementary_title = v_title,
        complementary_text = v_subtitle,
        complementary_image_url = v_image_url,
        complementary_link_url = v_current_link,
        updated_at = v_updated_at
    where editorial_row.complementary_link_url = any(v_links);

    update public.site_editorial_highlights as highlight_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where highlight_row.link_url = any(v_links);

    update public.site_editorial_latest_news as latest_row
    set title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where latest_row.link_url = any(v_links);

    update public.site_editorial_horizontal_news as horizontal_row
    set label = v_label,
        title = v_title,
        subtitle = v_subtitle,
        image_url = v_image_url,
        link_url = v_current_link,
        updated_at = v_updated_at
    where horizontal_row.link_url = any(v_links);

    update public.matchday_reference_composition_items as item_row
    set label_snapshot = v_label,
        title_snapshot = v_title,
        subtitle_snapshot = v_subtitle,
        image_url_snapshot = v_image_url,
        link_url_snapshot = v_current_link,
        updated_at = v_updated_at
    where item_row.link_url_snapshot = any(v_links);

    update public.matchday_hierarchical_composition_slots as slot_row
    set label_snapshot = v_label,
        title_snapshot = v_title,
        subtitle_snapshot = v_subtitle,
        image_url_snapshot = v_image_url,
        link_url_snapshot = v_current_link,
        updated_at = v_updated_at
    where slot_row.link_url_snapshot = any(v_links);

    foreach v_matchday_id in array v_matchday_ids loop
      if exists (
        select 1
        from jornada_private.matchday_live_layout_physical_cutovers
          as marker_row
        where marker_row.matchday_id = v_matchday_id
      ) or exists (
        select 1
        from public.matchday_editorial_profile_assignments as assignment_row
        where assignment_row.matchday_id = v_matchday_id
      ) then
        perform public.refresh_matchday_live_layout_legacy(v_matchday_id);
      end if;
    end loop;

  exception when others then
    foreach v_matchday_id in array v_physical_matchday_ids loop
      perform jornada_private.end_matchday_live_layout_downstream_v14(
        v_matchday_id
      );
    end loop;
    raise;
  end;

  foreach v_matchday_id in array v_physical_matchday_ids loop
    perform jornada_private.end_matchday_live_layout_downstream_v14(
      v_matchday_id
    );
  end loop;

  return query select v_matchday_ids;
end;
$function$;

revoke all on function public.sync_editorial_content_live_snapshots_v15(
  uuid, text
)
from public, anon, authenticated, service_role;

grant execute on function public.sync_editorial_content_live_snapshots_v15(
  uuid, text
)
to service_role;

comment on function public.sync_editorial_content_live_snapshots_v15(
  uuid, text
)
is
  'Atomic canonical content snapshot refresh with physical-to-legacy projection only downstream after cutover.';

notify pgrst, 'reload schema';

commit;
