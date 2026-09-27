
    alter table public.site_advertising_slots
      add column display_format text not null default 'slim';

    alter table public.site_advertising_slots
      add constraint site_advertising_slots_display_format_check
      check (display_format in ('slim', 'tall'));
  
;
