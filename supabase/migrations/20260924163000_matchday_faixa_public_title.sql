begin;

-- The Faixa is a fixed physical workspace surface, so its public title lives
-- beside faixa_slot_count instead of creating a parallel editorial authority.
alter table public.matchday_live_layout_workspace_settings
  add column faixa_public_title text;

alter table public.matchday_live_layout_workspace_settings
  add constraint matchday_live_layout_workspace_settings_faixa_title_check
  check (
    faixa_public_title is null
    or (
      faixa_public_title = pg_catalog.btrim(faixa_public_title)
      and pg_catalog.char_length(faixa_public_title) <= 120
    )
  );

comment on column
  public.matchday_live_layout_workspace_settings.faixa_public_title
is
  'Optional public heading of the fixed Faixa. Null or empty means that no heading is rendered.';


-- The physical workspace owns editing and OCC. The reader projects the new
-- setting while preserving the existing video presentation projections.
create or replace function
jornada_private.matchday_live_layout_workspace_token_v22(
  p_matchday_id uuid,
  p_profile_key text
)
returns text
language sql
stable
security definer
set search_path = ''
as $function$
  select pg_catalog.md5(
    token_row.state_token
    || '|latest_companion='
    || coalesce(companion_row.zone_id::text, '')
    || '|faixa_public_title='
    || coalesce(settings_row.faixa_public_title, '')
    || '|roundup_video_heading='
    || coalesce(editorial_row.roundup_video_heading, '')
    || '|video_highlight_section_title='
    || coalesce(editorial_row.video_highlight_section_title, '')
  )
  from public.matchday_editorial_profile_workspace_token_v13(
    p_matchday_id,
    p_profile_key
  ) as token_row
  left join public.matchday_live_layout_latest_companion
    as companion_row
    on companion_row.matchday_id = p_matchday_id
  left join public.matchday_live_layout_workspace_settings as settings_row
    on settings_row.matchday_id = p_matchday_id
  left join public.matchday_editorials as editorial_row
    on editorial_row.matchday_id = p_matchday_id;
$function$;

revoke all on function
  jornada_private.matchday_live_layout_workspace_token_v22(uuid, text)
from public, anon, authenticated, service_role;


create or replace function public.read_matchday_live_layout_workspace_v22(
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
  physical_cutover jsonb,
  latest_companion jsonb
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    jornada_private.matchday_live_layout_workspace_token_v22(
      p_matchday_id,
      p_profile_key
    ) as state_token,
    base_row.zones,
    base_row.blocks,
    base_row.placements,
    base_row.bank_items,
    base_row.state_memory,
    base_row.explicit_bank_item_ids,
    base_row.displaced_bank_item_ids,
    base_row.worked_bank_item_ids,
    base_row.legacy_zone_projection,
    case
      when base_row.workspace_settings is null then null
      else base_row.workspace_settings || pg_catalog.jsonb_build_object(
        'faixa_public_title',
          coalesce(settings_row.faixa_public_title, ''),
        'roundup_video_heading',
          coalesce(editorial_row.roundup_video_heading, ''),
        'video_highlight_section_title',
          coalesce(editorial_row.video_highlight_section_title, '')
      )
    end as workspace_settings,
    base_row.physical_cutover,
    coalesce(
      (
        select pg_catalog.jsonb_build_object(
          'matchday_id', companion_row.matchday_id,
          'zone_id', companion_row.zone_id,
          'created_at', companion_row.created_at,
          'updated_at', companion_row.updated_at
        )
        from public.matchday_live_layout_latest_companion
          as companion_row
        where companion_row.matchday_id = p_matchday_id
      ),
      'null'::jsonb
    ) as latest_companion
  from public.read_matchday_live_layout_workspace_v13(
    p_matchday_id,
    p_profile_key
  ) as base_row
  left join public.matchday_live_layout_workspace_settings as settings_row
    on settings_row.matchday_id = p_matchday_id
  left join public.matchday_editorials as editorial_row
    on editorial_row.matchday_id = p_matchday_id;
$function$;

revoke all on function
  public.read_matchday_live_layout_workspace_v22(uuid, text)
from public, anon, authenticated, service_role;

grant execute on function
  public.read_matchday_live_layout_workspace_v22(uuid, text)
to service_role;


-- V29 remains the single HTTP write authority. It delegates the unchanged
-- physical topology/content payload to v22, then writes the Faixa title and
-- the existing video titles in the same transaction.
create or replace function public.apply_matchday_live_layout_physical_v29(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_physical_state_token text,
  p_latest_companion_zone_id uuid,
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
  v_faixa_public_title text;
  v_latest_zone_placement text;
  v_roundup_video_heading text;
  v_video_highlight_section_title text;
  v_final_state_token text;
  v_previous_workspace_apply text;
  v_applied record;
begin
  if pg_catalog.jsonb_typeof(p_presentation) is distinct from 'object'
    or (
      select pg_catalog.array_agg(key_name order by key_name)
      from pg_catalog.jsonb_object_keys(p_presentation) as keys(key_name)
    ) is distinct from array[
      'faixa_public_title',
      'headline_title_color',
      'latest_zone_placement',
      'latest_zone_title',
      'roundup_video_heading',
      'video_highlight_section_title',
      'video_module_active'
    ]::text[]
  then
    raise exception
      'matchday-live-layout-video-section-titles-presentation-invalid';
  end if;

  v_latest_zone_placement :=
    p_presentation ->> 'latest_zone_placement';
  v_faixa_public_title :=
    p_presentation ->> 'faixa_public_title';
  v_roundup_video_heading :=
    p_presentation ->> 'roundup_video_heading';
  v_video_highlight_section_title :=
    p_presentation ->> 'video_highlight_section_title';

  if v_faixa_public_title is null
    or v_faixa_public_title <> pg_catalog.btrim(v_faixa_public_title)
    or pg_catalog.char_length(v_faixa_public_title) > 120
    or v_roundup_video_heading is null
    or v_roundup_video_heading <> pg_catalog.btrim(v_roundup_video_heading)
    or pg_catalog.char_length(v_roundup_video_heading) > 120
    or v_video_highlight_section_title is null
    or v_video_highlight_section_title <>
       pg_catalog.btrim(v_video_highlight_section_title)
    or pg_catalog.char_length(v_video_highlight_section_title) > 120
  then
    raise exception
      'matchday-live-layout-video-section-titles-value-invalid';
  end if;

  if (
    (
      v_latest_zone_placement in ('top', 'hidden')
      and p_latest_companion_zone_id is null
    )
    or (
      v_latest_zone_placement = 'four_news'
      and p_latest_companion_zone_id is not null
    )
  ) is not true then
    raise exception
      'matchday-live-layout-latest-destination-v29-incomplete';
  end if;

  select *
  into v_applied
  from public.apply_matchday_live_layout_physical_v22(
    p_matchday_id,
    p_profile_key,
    p_expected_physical_state_token,
    p_latest_companion_zone_id,
    p_zones,
    p_blocks,
    p_placements,
    p_faixa_slot_count,
    p_explicit_bank_item_ids,
    p_displaced_bank_item_ids,
    p_worked_bank_item_ids,
    p_faixa_arrival_bank_item_ids,
    p_displaced_arrival_bank_item_ids,
    p_presentation
      - 'faixa_public_title'
      - 'roundup_video_heading'
      - 'video_highlight_section_title'
  );

  if not found then
    raise exception
      'matchday-live-layout-video-section-titles-apply-result-missing';
  end if;

  v_previous_workspace_apply := pg_catalog.current_setting(
    'jornada.thematic_workspace_apply',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );

  update public.matchday_editorials as editorial_row
  set roundup_video_heading = nullif(v_roundup_video_heading, ''),
      video_highlight_section_title =
        nullif(v_video_highlight_section_title, ''),
      updated_at = pg_catalog.statement_timestamp()
  where editorial_row.matchday_id = p_matchday_id
    and row(
      editorial_row.roundup_video_heading,
      editorial_row.video_highlight_section_title
    ) is distinct from row(
      nullif(v_roundup_video_heading, ''),
      nullif(v_video_highlight_section_title, '')
    );

  if not exists (
    select 1
    from public.matchday_editorials as editorial_row
    where editorial_row.matchday_id = p_matchday_id
  ) then
    raise exception
      'matchday-live-layout-video-section-titles-editorial-missing';
  end if;

  update public.matchday_live_layout_workspace_settings as settings_row
  set faixa_public_title = nullif(v_faixa_public_title, ''),
      updated_at = pg_catalog.statement_timestamp()
  where settings_row.matchday_id = p_matchday_id
    and settings_row.faixa_public_title is distinct from
      nullif(v_faixa_public_title, '');

  if not exists (
    select 1
    from public.matchday_live_layout_workspace_settings as settings_row
    where settings_row.matchday_id = p_matchday_id
  ) then
    raise exception
      'matchday-live-layout-faixa-public-title-settings-missing';
  end if;

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    coalesce(v_previous_workspace_apply, ''),
    true
  );

  select jornada_private.matchday_live_layout_workspace_token_v22(
    p_matchday_id,
    p_profile_key
  ) into v_final_state_token;

  if v_final_state_token is null
    or v_final_state_token !~ '^[0-9a-f]{32}$'
  then
    raise exception
      'matchday-live-layout-video-section-titles-token-invalid';
  end if;

  return query
  select
    v_final_state_token,
    v_applied.applied_zone_count,
    v_applied.applied_block_count,
    v_applied.applied_placement_count,
    v_applied.explicit_bank_item_count,
    v_applied.displaced_bank_item_count,
    v_applied.worked_bank_item_count;
end;
$function$;

revoke all on function
  public.apply_matchday_live_layout_physical_v29(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

grant execute on function
  public.apply_matchday_live_layout_physical_v29(
    uuid,text,text,uuid,jsonb,jsonb,jsonb,integer,
    jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
to service_role;


-- Physical handoff creates the target settings before recording the existing
-- continuity certificate. Copy the optional title at that same boundary.
create function jornada_private.carry_matchday_faixa_public_title_v31()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  update public.matchday_live_layout_workspace_settings as target_row
  set faixa_public_title = source_row.faixa_public_title,
      updated_at = pg_catalog.statement_timestamp()
  from public.matchday_live_layout_workspace_settings as source_row
  where source_row.matchday_id = new.source_matchday_id
    and target_row.matchday_id = new.target_matchday_id
    and target_row.faixa_public_title is distinct from
      source_row.faixa_public_title;

  return new;
end;
$function$;

revoke all on function
  jornada_private.carry_matchday_faixa_public_title_v31()
from public, anon, authenticated, service_role;

create trigger carry_matchday_faixa_public_title_v31
after insert on public.matchday_editorial_continuity_transitions
for each row
execute function
  jornada_private.carry_matchday_faixa_public_title_v31();

commit;
