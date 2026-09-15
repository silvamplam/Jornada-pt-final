begin;

-- Private operational tables are only reached through owner-executed database
-- functions. Enabling RLS adds a second boundary without changing those
-- SECURITY DEFINER flows because the owning role remains exempt from RLS
-- unless FORCE ROW LEVEL SECURITY is enabled.
alter table jornada_private.matchday_editorial_bank_classification_authorizations
  enable row level security;
alter table jornada_private.matchday_live_layout_cutover_control
  enable row level security;
alter table jornada_private.matchday_live_layout_placement_shadow_sync_queue
  enable row level security;
alter table jornada_private.matchday_live_layout_shadow_sync_queue
  enable row level security;
alter table jornada_private.matchday_live_layout_zone_legacy_projection
  enable row level security;

-- Event-trigger functions do not need to be callable through the API.
revoke execute on function public.rls_auto_enable() from public;

-- This helper is required by authenticated Portal RLS policies, but anon
-- users have no policy path that needs to execute it. Remove the implicit
-- PUBLIC grant and preserve the roles that legitimately use it.
revoke execute on function public.portal_can_select_scope(uuid, uuid, uuid) from public;
grant execute on function public.portal_can_select_scope(uuid, uuid, uuid)
  to authenticated, service_role;

commit;
