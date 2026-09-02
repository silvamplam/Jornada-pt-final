begin;

-- A continuity source may be placed in every public surface owned by the
-- workspace.  V7 used to count only opening, thematic zones, Faixa and an
-- explicit Bank override, so a perfectly valid Selection or Vídeo placement
-- was rejected before the authoritative cutover adapter could run.
create or replace function public.apply_matchday_editorial_profile_workspace_v7(
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
  p_video_module jsonb
)
returns table(
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
declare
  v_apply record;
begin
  if p_matchday_id is null
    or p_overrides is null
    or pg_catalog.jsonb_typeof(p_overrides) <> 'array'
    or p_zone_items is null
    or pg_catalog.jsonb_typeof(p_zone_items) <> 'array'
    or p_faixa_source_ids is null
    or pg_catalog.jsonb_typeof(p_faixa_source_ids) <> 'array'
    or p_opening is null
    or pg_catalog.jsonb_typeof(p_opening) <> 'object'
  then
    raise exception
      'matchday-editorial-profile-workspace-v7-invalid-input';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_profile_workspace_sources(
      p_matchday_id
    ) as source_row
    where source_row.is_continuity
      and (
        with requested_placements(source_type, source_id) as materialized (
          select
            'editorial_article'::text,
            pg_catalog.lower(
              pg_catalog.btrim(opening_row.value #>> '{}')
            )
          from pg_catalog.jsonb_each(p_opening)
            as opening_row(slot_key, value)
          where pg_catalog.jsonb_typeof(opening_row.value) = 'string'

          union all

          select
            pg_catalog.lower(
              pg_catalog.btrim(zone_row.value ->> 'source_type')
            ),
            pg_catalog.lower(
              pg_catalog.btrim(zone_row.value ->> 'source_id')
            )
          from pg_catalog.jsonb_array_elements(p_zone_items)
            as zone_row(value)

          union all

          select
            'editorial_article'::text,
            pg_catalog.lower(
              pg_catalog.btrim(faixa_row.value #>> '{}')
            )
          from pg_catalog.jsonb_array_elements(p_faixa_source_ids)
            as faixa_row(value)

          union all

          select
            pg_catalog.lower(
              pg_catalog.btrim(override_row.value ->> 'source_type')
            ),
            pg_catalog.lower(
              pg_catalog.btrim(override_row.value ->> 'source_id')
            )
          from pg_catalog.jsonb_array_elements(p_overrides)
            as override_row(value)
          where override_row.value ->> 'placement_target' = 'bank'

          union all

          select
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_id::text))
          from pg_catalog.jsonb_array_elements(
            p_selection_bank_item_ids
          ) as selection_row(value)
          join public.matchday_editorial_bank_items as bank_row
            on bank_row.matchday_id = p_matchday_id
           and bank_row.id::text = pg_catalog.lower(
             pg_catalog.btrim(selection_row.value #>> '{}')
           )

          union all

          select
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_type)),
            pg_catalog.lower(pg_catalog.btrim(bank_row.source_id::text))
          from public.matchday_editorial_bank_items as bank_row
          where bank_row.matchday_id = p_matchday_id
            and (
              (
                p_video_module ->> 'highlight_action' = 'replace'
                and bank_row.id::text = pg_catalog.lower(
                  pg_catalog.btrim(
                    p_video_module ->> 'highlight_bank_item_id'
                  )
                )
              )
              or (
                p_video_module ->> 'highlight_action' = 'preserve'
                and exists (
                  select 1
                  from public.matchday_live_layout_placements
                    as video_placement
                  where video_placement.matchday_id = p_matchday_id
                    and video_placement.placement_type = 'video_highlight'
                    and video_placement.bank_item_id = bank_row.id
                )
              )
            )
        )
        select pg_catalog.count(*)
        from requested_placements as requested
        where requested.source_type = pg_catalog.lower(
            pg_catalog.btrim(source_row.source_type)
          )
          and requested.source_id = pg_catalog.lower(
            pg_catalog.btrim(source_row.source_id)
          )
      ) <> 1
  ) then
    raise exception
      'matchday-editorial-profile-workspace-v7-continuity-placement-incomplete';
  end if;

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v6(
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
    p_video_module
  );

  return query
  select
    v_apply.revision,
    v_apply.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_apply.applied_selection_count;
end;
$function$;

comment on function public.apply_matchday_editorial_profile_workspace_v7(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) is
  'Internal continuity completeness guard. Counts authoritative opening, zones, Faixa, explicit Bank, Selection and effective video-highlight placements exactly once.';

revoke all on function public.apply_matchday_editorial_profile_workspace_v7(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated, service_role;

commit;
