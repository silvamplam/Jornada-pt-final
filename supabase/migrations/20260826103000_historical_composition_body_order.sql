alter table public.matchday_reference_compositions
  add column if not exists hierarchical_video_position integer;

alter table public.matchday_reference_compositions
  drop constraint if exists matchday_reference_compositions_hierarchical_video_position_check;

alter table public.matchday_reference_compositions
  add constraint matchday_reference_compositions_hierarchical_video_position_check
  check (
    hierarchical_video_position is null
    or hierarchical_video_position between 0 and 24
  );

create or replace function public.apply_historical_composition_workspace_plan_v3(
  p_matchday_id uuid,
  p_composition_id uuid,
  p_operations jsonb,
  p_settings jsonb,
  p_dynamic_zones jsonb
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_total integer;
  v_video_position integer;
  v_zone_count integer;
  v_has_video_position boolean;
begin
  v_has_video_position :=
    p_settings is not null
    and p_settings ? 'videoPosition';

  if v_has_video_position then
    if pg_catalog.jsonb_typeof(p_settings -> 'videoPosition') <> 'number'
       or (p_settings ->> 'videoPosition') !~ '^[0-9]+$' then
      raise exception 'historical_video_position_invalid';
    end if;

    v_video_position := (p_settings ->> 'videoPosition')::integer;

    if v_video_position < 0 or v_video_position > 24 then
      raise exception 'historical_video_position_invalid';
    end if;
  end if;

  v_total := public.apply_historical_composition_workspace_plan_v2(
    p_matchday_id,
    p_composition_id,
    p_operations,
    case
      when p_settings is null then null
      else p_settings - 'videoPosition'
    end,
    p_dynamic_zones
  );

  if v_has_video_position then
    select pg_catalog.count(*)::integer
    into v_zone_count
    from public.matchday_historical_composition_zones
    where composition_id = p_composition_id;

    if v_video_position > v_zone_count then
      raise exception 'historical_video_position_out_of_range';
    end if;

    update public.matchday_reference_compositions
    set
      hierarchical_video_position = v_video_position,
      updated_at = now()
    where id = p_composition_id
      and matchday_id = p_matchday_id
      and status = 'draft'
      and presentation_mode = 'hierarchical';

    if not found then
      raise exception 'historical_video_position_not_editable';
    end if;
  end if;

  return coalesce(v_total, 0)
    + case when v_has_video_position then 1 else 0 end;
end
$$;

revoke all
on function public.apply_historical_composition_workspace_plan_v3(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated;

grant execute
on function public.apply_historical_composition_workspace_plan_v3(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb
)
to service_role;

comment on column public.matchday_reference_compositions.hierarchical_video_position is
  'Posição do bloco Vídeo + Destaque dentro do corpo editorial variável. 0 significa antes da primeira zona; N significa depois de N zonas.';

comment on function public.apply_historical_composition_workspace_plan_v3(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb
) is
  'Aplica atomicamente a montagem histórica, as zonas dinâmicas e a posição do bloco Vídeo + Destaque.';

notify pgrst, 'reload schema';