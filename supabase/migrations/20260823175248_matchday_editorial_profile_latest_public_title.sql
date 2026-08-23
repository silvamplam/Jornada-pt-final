create or replace function public.apply_matchday_editorial_profile_workspace_v4(
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
  v_requested_latest_title text;
  v_current_latest_title text;
  v_title_changed boolean := false;
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
        'latest_zone_title',
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
        'latest_zone_title',
        'thematic_zone_order',
        'thematic_zone_layouts',
        'thematic_block_order',
        'thematic_zone_titles'
      ]::text[]
    ) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(
      p_page_controls -> 'latest_zone_title'
    ) <> 'string'
    or pg_catalog.char_length(
      pg_catalog.btrim(
        p_page_controls ->> 'latest_zone_title'
      )
    ) > 120
  then
    raise exception
      'matchday-editorial-profile-workspace-v4-invalid-page-controls';
  end if;

  v_requested_latest_title :=
    pg_catalog.btrim(
      p_page_controls ->> 'latest_zone_title'
    );

  select editorial.latest_zone_title
  into v_current_latest_title
  from public.matchday_editorials as editorial
  where editorial.matchday_id = p_matchday_id;

  if not found then
    raise exception
      'matchday-editorial-profile-workspace-v4-editorial-not-found';
  end if;

  v_title_changed :=
    coalesce(
      pg_catalog.btrim(v_current_latest_title),
      ''
    )
    is distinct from v_requested_latest_title;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v3(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls - 'latest_zone_title'
  );

  update public.matchday_editorials as editorial
  set latest_zone_title =
        nullif(v_requested_latest_title, ''),
      updated_at = v_now
  where editorial.matchday_id = p_matchday_id;

  if not found then
    raise exception
      'matchday-editorial-profile-workspace-v4-editorial-not-found';
  end if;

  v_final_revision := v_apply.revision;

  if v_title_changed
    and v_final_revision = p_expected_revision
  then
    update public.matchday_editorial_profile_reconcile_control
      as control_row
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

revoke all on function public.apply_matchday_editorial_profile_workspace_v4(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from public;

revoke all on function public.apply_matchday_editorial_profile_workspace_v4(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from anon;

revoke all on function public.apply_matchday_editorial_profile_workspace_v4(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from authenticated;

grant execute on function public.apply_matchday_editorial_profile_workspace_v4(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb
) to service_role;