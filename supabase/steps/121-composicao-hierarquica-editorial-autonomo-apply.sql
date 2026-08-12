begin;

alter table public.matchday_reference_compositions
  add column if not exists hierarchical_editorial_title text,
  add column if not exists hierarchical_editorial_text text,
  add column if not exists hierarchical_editorial_author text;

alter table public.matchday_reference_compositions
  drop constraint if exists matchday_reference_compositions_hierarchical_editorial_complete_check;

alter table public.matchday_reference_compositions
  add constraint matchday_reference_compositions_hierarchical_editorial_complete_check
  check (
    presentation_mode <> 'hierarchical'
    or status <> 'published'
    or (
      nullif(btrim(hierarchical_editorial_title), '') is not null
      and nullif(btrim(hierarchical_editorial_text), '') is not null
      and nullif(btrim(hierarchical_editorial_author), '') is not null
    )
  ) not valid;

comment on column public.matchday_reference_compositions.hierarchical_editorial_title is
  'Título do Editorial da Jornada pertencente exclusivamente à composição hierarchical.';
comment on column public.matchday_reference_compositions.hierarchical_editorial_text is
  'Texto do Editorial da Jornada pertencente exclusivamente à composição hierarchical.';
comment on column public.matchday_reference_compositions.hierarchical_editorial_author is
  'Autor do Editorial da Jornada pertencente exclusivamente à composição hierarchical.';
comment on constraint matchday_reference_compositions_hierarchical_editorial_complete_check
  on public.matchday_reference_compositions is
  'Novas publicações hierarchical exigem Editorial da Jornada completo; versões legacy já publicadas são toleradas até serem regravadas.';

notify pgrst, 'reload schema';

commit;
