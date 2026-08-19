begin;

alter table public.matchday_reference_compositions
  drop constraint if exists
    matchday_reference_compositions_hierarchical_editorial_excerpt_length_check;

alter table public.matchday_reference_compositions
  add constraint
    matchday_reference_compositions_hierarchical_editorial_excerpt_length_check
  check (
    hierarchical_editorial_excerpt is null
    or char_length(hierarchical_editorial_excerpt) <= 600
  ) not valid;

update public.matchday_reference_compositions
set hierarchical_editorial_excerpt =
  split_part(
    replace(hierarchical_editorial_text, E'\r', ''),
    E'\n\n',
    1
  )
where presentation_mode = 'hierarchical'
  and hierarchical_editorial_text is not null
  and char_length(
    split_part(
      replace(hierarchical_editorial_text, E'\r', ''),
      E'\n\n',
      1
    )
  ) <= 600
  and hierarchical_editorial_excerpt =
    left(
      split_part(
        replace(hierarchical_editorial_text, E'\r', ''),
        E'\n\n',
        1
      ),
      360
    );

comment on column
  public.matchday_reference_compositions.hierarchical_editorial_excerpt
is
  'Parágrafo completo e editorialmente controlado apresentado na capa. Nunca é truncado automaticamente.';

notify pgrst, 'reload schema';

commit;