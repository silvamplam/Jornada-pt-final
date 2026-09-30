alter table public.site_advertising_slots
  add column image_width integer,
  add column image_height integer;

create function public.guard_site_advertising_image_dimensions()
returns trigger
language plpgsql
as $$
begin
  if new.image_url is null then
    if new.image_width is null and new.image_height is null then
      return new;
    end if;
  elsif new.image_width > 0 and new.image_height > 0 then
    return new;
  elsif tg_op = 'UPDATE' then
    if old.image_url is not null
      and old.image_width is null
      and old.image_height is null
      and new.image_url = old.image_url
      and new.image_width is null
      and new.image_height is null then
      -- Preserve an existing legacy image only when the URL is unchanged.
      return new;
    end if;
  end if;

  raise exception 'Advertising image URL and dimensions must change together'
    using errcode = '23514',
          constraint = 'site_advertising_slots_image_dimensions_guard';
end;
$$;

create trigger site_advertising_slots_image_dimensions_guard
before insert or update on public.site_advertising_slots
for each row execute function public.guard_site_advertising_image_dimensions();

-- This exact versioned public asset was decoded locally: 701 x 2048.
-- SHA-256: 66ce8ca4026cfa45789b6755e79c30d28ff9496375ea02d8ed6acb7620f2f7e6
-- No dimensions are inferred from the slot or from the display format.
update public.site_advertising_slots
set image_width = 701,
    image_height = 2048
where slot_key = 'lateral_primary'
  and image_url = '/ads/coral-lateral-v2.webp'
  and image_width is null
  and image_height is null;

-- Existing complete or legacy pairs stay coherent. The trigger above rejects
-- new incomplete pairs, including when an UPDATE changes an image URL.
alter table public.site_advertising_slots
  add constraint site_advertising_slots_image_dimensions_check
  check (
    (
      image_url is null
      and image_width is null
      and image_height is null
    )
    or (
      image_url is not null
      and (
        (image_width is null and image_height is null)
        or (
          image_width is not null
          and image_height is not null
          and image_width > 0
          and image_height > 0
        )
      )
    )
  ) not valid;
