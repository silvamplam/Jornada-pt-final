begin;

-- The video heading keeps using matchday_editorials.roundup_video_heading.
-- Only the missing public title for the Highlight section needs new storage.
alter table public.matchday_editorials
  add column video_highlight_section_title text;

alter table public.matchday_editorials
  add constraint matchday_editorials_video_highlight_section_title_check
  check (
    video_highlight_section_title is null
    or (
      video_highlight_section_title =
        pg_catalog.btrim(video_highlight_section_title)
      and pg_catalog.char_length(video_highlight_section_title) <= 120
    )
  );

comment on column
  public.matchday_editorials.video_highlight_section_title
is
  'Public heading of the video Highlight section. It is distinct from complementary_label, which belongs to the highlighted article.';


-- The physical workspace owns editing and OCC. Its reader projects the two
-- existing editorial presentation values into the workspace settings JSON;
-- no duplicate title column or second draft is introduced.
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
-- physical topology/content payload to v22, then writes both titles in the
-- same transaction and returns the final title-aware OCC token.
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
  v_roundup_video_heading :=
    p_presentation ->> 'roundup_video_heading';
  v_video_highlight_section_title :=
    p_presentation ->> 'video_highlight_section_title';

  if v_roundup_video_heading is null
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


-- Continuity already copies roundup_video_heading. Copy the new sibling title
-- when the existing continuity certificate is written, without a backfill.
create function jornada_private.carry_matchday_video_highlight_title_v30()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_previous_workspace_apply text;
begin
  v_previous_workspace_apply := pg_catalog.current_setting(
    'jornada.thematic_workspace_apply',
    true
  );
  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    'on',
    true
  );

  insert into public.matchday_editorials (
    matchday_id,
    video_highlight_section_title,
    updated_at
  )
  select
    new.target_matchday_id,
    source_row.video_highlight_section_title,
    pg_catalog.statement_timestamp()
  from public.matchday_editorials as source_row
  where source_row.matchday_id = new.source_matchday_id
  on conflict (matchday_id)
  do update
  set video_highlight_section_title =
        excluded.video_highlight_section_title,
      updated_at = pg_catalog.statement_timestamp();

  perform pg_catalog.set_config(
    'jornada.thematic_workspace_apply',
    coalesce(v_previous_workspace_apply, ''),
    true
  );

  return new;
end;
$function$;

revoke all on function
  jornada_private.carry_matchday_video_highlight_title_v30()
from public, anon, authenticated, service_role;

create trigger carry_matchday_video_highlight_title_v30
after insert on public.matchday_editorial_continuity_transitions
for each row
execute function
  jornada_private.carry_matchday_video_highlight_title_v30();

commit;
