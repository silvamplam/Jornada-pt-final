begin;

-- Legacy and future matchdays without physical workspace settings are exposed
-- by v13 as the JSONB scalar null, not SQL NULL. Treat both representations
-- as absence before enriching the physical v22 settings payload, otherwise
-- jsonb concatenation turns JSON null into an array and creates false physical
-- evidence on public pages without a physical cutover.
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
      when base_row.workspace_settings is null
        or pg_catalog.jsonb_typeof(base_row.workspace_settings) = 'null'
      then 'null'::jsonb
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

comment on function
  public.read_matchday_live_layout_workspace_v22(uuid, text)
is
  'Physical workspace v22 reader. Preserves JSONB null settings for matchdays without physical authority and enriches only real physical settings with Faixa and video public titles.';

notify pgrst, 'reload schema';

commit;
