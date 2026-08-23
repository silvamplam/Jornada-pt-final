alter table public.matchday_editorial_profile_reconcile_control
  add column thematic_zone_titles jsonb not null
  default '{"benfica":"","sporting":"","fc_porto":"","other_liga_clubs":"","outside_liga_other":""}'::jsonb;

alter table public.matchday_editorial_profile_reconcile_control
  add constraint matchday_editorial_profile_reconcile_control_zone_titles_check
  check (
    pg_catalog.jsonb_typeof(thematic_zone_titles) = 'object'
    and thematic_zone_titles ?& array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    ]
    and (
      thematic_zone_titles - array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ) = '{}'::jsonb
    and pg_catalog.jsonb_typeof(thematic_zone_titles -> 'benfica') = 'string'
    and pg_catalog.jsonb_typeof(thematic_zone_titles -> 'sporting') = 'string'
    and pg_catalog.jsonb_typeof(thematic_zone_titles -> 'fc_porto') = 'string'
    and pg_catalog.jsonb_typeof(thematic_zone_titles -> 'other_liga_clubs') = 'string'
    and pg_catalog.jsonb_typeof(thematic_zone_titles -> 'outside_liga_other') = 'string'
    and pg_catalog.char_length(pg_catalog.btrim(thematic_zone_titles ->> 'benfica')) <= 120
    and pg_catalog.char_length(pg_catalog.btrim(thematic_zone_titles ->> 'sporting')) <= 120
    and pg_catalog.char_length(pg_catalog.btrim(thematic_zone_titles ->> 'fc_porto')) <= 120
    and pg_catalog.char_length(pg_catalog.btrim(thematic_zone_titles ->> 'other_liga_clubs')) <= 120
    and pg_catalog.char_length(pg_catalog.btrim(thematic_zone_titles ->> 'outside_liga_other')) <= 120
  );

create or replace function public.apply_matchday_editorial_profile_workspace_v3(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb
)
returns table(
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_requested_titles jsonb;
  v_current_titles jsonb;
  v_titles_changed boolean := false;
  v_apply record;
  v_final_revision bigint;
  v_now timestamptz := pg_catalog.now();
begin
  if p_page_controls is null
    or pg_catalog.jsonb_typeof(p_page_controls) <> 'object'
    or not (
      p_page_controls ?& array[
        'headline_title_color',
        'latest_zone_placement',
        'thematic_zone_order',
        'thematic_zone_layouts',
        'thematic_block_order',
        'thematic_zone_titles'
      ]
    )
    or (
      p_page_controls - array[
        'headline_title_color',
        'latest_zone_placement',
        'thematic_zone_order',
        'thematic_zone_layouts',
        'thematic_block_order',
        'thematic_zone_titles'
      ]::text[]
    ) <> '{}'::jsonb
  then
    raise exception
      'matchday-editorial-profile-workspace-v3-invalid-page-controls';
  end if;

  v_requested_titles :=
    p_page_controls -> 'thematic_zone_titles';

  if pg_catalog.jsonb_typeof(v_requested_titles) <> 'object'
    or not (
      v_requested_titles ?& array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]
    )
    or (
      v_requested_titles - array[
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      ]::text[]
    ) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(v_requested_titles -> 'benfica') <> 'string'
    or pg_catalog.jsonb_typeof(v_requested_titles -> 'sporting') <> 'string'
    or pg_catalog.jsonb_typeof(v_requested_titles -> 'fc_porto') <> 'string'
    or pg_catalog.jsonb_typeof(v_requested_titles -> 'other_liga_clubs') <> 'string'
    or pg_catalog.jsonb_typeof(v_requested_titles -> 'outside_liga_other') <> 'string'
    or pg_catalog.char_length(pg_catalog.btrim(v_requested_titles ->> 'benfica')) > 120
    or pg_catalog.char_length(pg_catalog.btrim(v_requested_titles ->> 'sporting')) > 120
    or pg_catalog.char_length(pg_catalog.btrim(v_requested_titles ->> 'fc_porto')) > 120
    or pg_catalog.char_length(pg_catalog.btrim(v_requested_titles ->> 'other_liga_clubs')) > 120
    or pg_catalog.char_length(pg_catalog.btrim(v_requested_titles ->> 'outside_liga_other')) > 120
  then
    raise exception
      'matchday-editorial-profile-workspace-v3-invalid-zone-titles';
  end if;

  v_requested_titles := pg_catalog.jsonb_build_object(
    'benfica', pg_catalog.btrim(v_requested_titles ->> 'benfica'),
    'sporting', pg_catalog.btrim(v_requested_titles ->> 'sporting'),
    'fc_porto', pg_catalog.btrim(v_requested_titles ->> 'fc_porto'),
    'other_liga_clubs', pg_catalog.btrim(v_requested_titles ->> 'other_liga_clubs'),
    'outside_liga_other', pg_catalog.btrim(v_requested_titles ->> 'outside_liga_other')
  );

  select control_row.thematic_zone_titles
  into v_current_titles
  from public.matchday_editorial_profile_reconcile_control as control_row
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key;

  if not found then
    raise exception
      'matchday-editorial-profile-workspace-v3-control-not-found';
  end if;

  v_titles_changed :=
    v_current_titles is distinct from v_requested_titles;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v2(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls - 'thematic_zone_titles'
  );

  update public.matchday_editorial_profile_reconcile_control as control_row
  set thematic_zone_titles = v_requested_titles,
      updated_at = v_now
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key;

  if not found then
    raise exception
      'matchday-editorial-profile-workspace-v3-control-not-found';
  end if;

  v_final_revision := v_apply.revision;

  if v_titles_changed
    and v_final_revision = p_expected_revision
  then
    update public.matchday_editorial_profile_reconcile_control as control_row
    set revision = control_row.revision + 1,
        last_applied_at = v_now,
        updated_at = v_now
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key
    returning control_row.revision
    into v_final_revision;
  end if;

  return query
  select
    v_final_revision,
    token_row.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
end;
$function$;

revoke all on function public.apply_matchday_editorial_profile_workspace_v3(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public;

revoke all on function public.apply_matchday_editorial_profile_workspace_v3(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from anon;

revoke all on function public.apply_matchday_editorial_profile_workspace_v3(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from authenticated;

grant execute on function public.apply_matchday_editorial_profile_workspace_v3(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to service_role;