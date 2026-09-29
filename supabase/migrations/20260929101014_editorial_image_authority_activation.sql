begin;

-- ACTIVATION: apply only after the compatible application is confirmed live.
-- No runtime flag or permanent fallback: all writers share this final guard.
create function public.editorial_require_local_image_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status <> 'published' then return new; end if;
  -- Identity-bound grandfathering, including ordinary text edits and preserve.
  -- Draft -> published, NEW and changed references never enter this exception.
  if tg_op='UPDATE' and old.status='published' and new.image_url is not distinct from old.image_url then return new; end if;
  if not exists(select 1 from public.editorial_image_assets a
    join storage.objects o on o.bucket_id='editorial-images' and o.name=a.storage_path
    where a.public_url=new.image_url) then raise exception 'image-materialization-required'; end if;
  return new;
end $$;
revoke all on function public.editorial_require_local_image_v1() from public,anon,authenticated,service_role;
create trigger editorial_require_local_image before insert or update on public.editorial_articles
  for each row execute function public.editorial_require_local_image_v1();

commit;
