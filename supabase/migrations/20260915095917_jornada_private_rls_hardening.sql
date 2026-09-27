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

revoke execute on function public.rls_auto_enable() from public;

revoke execute on function public.portal_can_select_scope(uuid, uuid, uuid) from public;
grant execute on function public.portal_can_select_scope(uuid, uuid, uuid)
  to authenticated, service_role;
;
