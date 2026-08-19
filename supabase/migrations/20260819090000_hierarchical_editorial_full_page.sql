begin;

alter table public.matchday_reference_compositions
  add column if not exists hierarchical_editorial_excerpt text;

update public.matchday_reference_compositions
set hierarchical_editorial_excerpt =
  left(
    nullif(
      btrim(
        split_part(
          replace(hierarchical_editorial_text, E'\r', ''),
          E'\n\n',
          1
        )
      ),
      ''
    ),
    360
  )
where presentation_mode = 'hierarchical'
  and hierarchical_editorial_excerpt is null
  and nullif(btrim(hierarchical_editorial_text), '') is not null;

alter table public.matchday_reference_compositions
  drop constraint if exists
    matchday_reference_compositions_hierarchical_editorial_complete_check;

alter table public.matchday_reference_compositions
  add constraint
    matchday_reference_compositions_hierarchical_editorial_complete_check
  check (
    presentation_mode <> 'hierarchical'
    or status <> 'published'
    or (
      nullif(btrim(hierarchical_editorial_title), '') is not null
      and nullif(btrim(hierarchical_editorial_excerpt), '') is not null
      and nullif(btrim(hierarchical_editorial_text), '') is not null
      and nullif(btrim(hierarchical_editorial_author), '') is not null
    )
  ) not valid;

alter table public.matchday_reference_compositions
  drop constraint if exists
    matchday_reference_compositions_hierarchical_editorial_excerpt_length_check;

alter table public.matchday_reference_compositions
  add constraint
    matchday_reference_compositions_hierarchical_editorial_excerpt_length_check
  check (
    hierarchical_editorial_excerpt is null
    or char_length(hierarchical_editorial_excerpt) <= 360
  ) not valid;

comment on column
  public.matchday_reference_compositions.hierarchical_editorial_excerpt
is
  'Excerto controlado do Editorial da Jornada apresentado na capa.';

notify pgrst, 'reload schema';

commit;
