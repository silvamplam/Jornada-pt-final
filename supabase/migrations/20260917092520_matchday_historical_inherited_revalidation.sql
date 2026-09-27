begin;

alter table public.matchday_editorial_bank_items
  add column if not exists continuity_revalidated_at timestamptz;

alter table public.matchday_editorial_bank_items
  drop constraint if exists matchday_editorial_bank_items_continuity_revalidation_check;

alter table public.matchday_editorial_bank_items
  add constraint matchday_editorial_bank_items_continuity_revalidation_check
  check (
    continuity_revalidated_at is null
    or continuity_source_matchday_id is not null
  );

create index if not exists matchday_editorial_bank_inherited_pending_idx
on public.matchday_editorial_bank_items(matchday_id, continuity_source_matchday_id)
where continuity_source_matchday_id is not null
  and continuity_revalidated_at is null
  and status = 'active';

comment on column public.matchday_editorial_bank_items.continuity_revalidated_at is
  'Decisão editorial explícita que torna uma notícia herdada elegível para a composição histórica da jornada que a recebeu. Não é copiada na passagem para a jornada seguinte.';

commit;
