begin;

-- apply_historical_composition_workspace_plan_v4 is the service-role entrypoint
-- for historical saves that carry five-column group metadata. It calls
-- jornada_private helpers directly and through the v3/v2 dynamic-zone path.
-- Keep jornada_private itself private: execute this entrypoint as its owner
-- instead of granting service_role USAGE on the whole private schema.
alter function public.apply_historical_composition_workspace_plan_v4(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) security definer;

alter function public.apply_historical_composition_workspace_plan_v4(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) set search_path = '';

revoke all on function public.apply_historical_composition_workspace_plan_v4(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) from public, anon, authenticated;

grant execute on function public.apply_historical_composition_workspace_plan_v4(
  uuid,
  uuid,
  jsonb,
  jsonb,
  jsonb,
  jsonb
) to service_role;

commit;
