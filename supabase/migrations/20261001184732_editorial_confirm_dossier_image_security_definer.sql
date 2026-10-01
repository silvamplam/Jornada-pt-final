-- Keep dossier-image confirmation narrowly privileged.
-- The application calls this RPC as service_role, which intentionally has no
-- table-wide UPDATE privilege on newsroom_editorial_dossier_images.
-- SECURITY DEFINER lets only this validated function perform the two-column
-- confirmation update under its owner, while callers retain no direct UPDATE.

alter function public.editorial_confirm_dossier_image_v1(uuid, text)
  security definer;

alter function public.editorial_confirm_dossier_image_v1(uuid, text)
  set search_path to '';

revoke all on function public.editorial_confirm_dossier_image_v1(uuid, text)
  from public, anon, authenticated;

grant execute on function public.editorial_confirm_dossier_image_v1(uuid, text)
  to service_role;
