-- Forward-only. Apply only after explicit authorization.
-- Existing slot values, storage bucket, grants and RLS remain unchanged.
begin;

alter table public.site_advertising_slots
  add column display_format text not null default 'slim'
  constraint site_advertising_slots_display_format_check check (display_format in ('slim', 'tall'));

commit;
