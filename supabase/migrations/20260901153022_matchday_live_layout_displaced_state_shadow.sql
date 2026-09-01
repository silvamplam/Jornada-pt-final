begin;

-- ============================================================
-- LOTE 5 - DESALOJADAS + STATE PROJECTION EM SHADOW
--
-- Placements continuam a representar exclusivamente a localizacao atual.
-- Esta tabela guarda apenas memoria que nao pode ser derivada do presente:
-- um baseline historicamente indeterminado ou o atual periodo desalojado.
-- Nenhum writer legacy ou reader publico faz cutover nesta migration.
-- ============================================================

-- ============================================================
-- 1. MEMORIA CONTEXTUAL MINIMA
-- ============================================================

create table public.matchday_live_layout_bank_item_state_memory (
  matchday_id uuid not null,
  bank_item_id uuid not null,
  memory_kind text not null,
  recorded_at timestamptz not null default statement_timestamp(),

  constraint matchday_live_layout_bank_item_state_memory_pkey
    primary key (matchday_id, bank_item_id),

  constraint matchday_live_layout_bank_item_state_memory_kind_check
    check (memory_kind in ('legacy_unknown', 'displaced')),

  constraint matchday_live_layout_bank_item_state_memory_bank_context_fk
    foreign key (bank_item_id, matchday_id)
    references public.matchday_editorial_bank_items(id, matchday_id)
    on delete cascade
    deferrable initially deferred
);

alter table public.matchday_live_layout_bank_item_state_memory
  enable row level security;

revoke all on table public.matchday_live_layout_bank_item_state_memory
from public, anon, authenticated, service_role;

grant select on table public.matchday_live_layout_bank_item_state_memory
to service_role;

comment on table public.matchday_live_layout_bank_item_state_memory is
  'Shadow memory for contextual Bank items whose unplaced meaning cannot be derived from current placements. It stores no placement or classification authority.';

comment on column
  public.matchday_live_layout_bank_item_state_memory.memory_kind
is
  'legacy_unknown marks the consistent Lote 5 baseline; displaced marks the current unplaced period observed after that baseline.';

comment on column
  public.matchday_live_layout_bank_item_state_memory.recorded_at
is
  'Baseline instant for legacy_unknown, or start of the current displaced period. Repeated reconciliation does not renew it.';

-- ============================================================
-- 2. CORTE TRANSACIONAL DO BASELINE
--
-- Lock order is Bank then placements. SHARE ROW EXCLUSIVE waits for earlier
-- writers and blocks later INSERT/UPDATE/DELETE until this migration commits.
-- Triggers are installed while the lock is held, before the baseline snapshot.
-- ============================================================

lock table
  public.matchday_editorial_bank_items,
  public.matchday_live_layout_placements
in share row exclusive mode;

-- ============================================================
-- 3. RECONCILIACAO SET-BASED DO ESTADO FINAL
--
-- Transition tables contain every OLD/NEW contextual participation affected by
-- the statement. Each branch deduplicates that set and queries the final state
-- of placements after the statement; no placement is selected as a winner.
-- ============================================================

create function
jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'INSERT' then
    with affected as materialized (
      select distinct
        placement_row.matchday_id,
        placement_row.bank_item_id
      from new_placement_rows as placement_row
    )
    delete from public.matchday_live_layout_bank_item_state_memory
      as memory_row
    using affected as affected_row
    where memory_row.matchday_id = affected_row.matchday_id
      and memory_row.bank_item_id = affected_row.bank_item_id
      and exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      );

    return null;
  end if;

  if tg_op = 'UPDATE' then
    with affected as materialized (
      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row

      union

      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from new_placement_rows as placement_row
    )
    delete from public.matchday_live_layout_bank_item_state_memory
      as memory_row
    using affected as affected_row
    where memory_row.matchday_id = affected_row.matchday_id
      and memory_row.bank_item_id = affected_row.bank_item_id
      and exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      );

    with affected as materialized (
      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row

      union

      select
        placement_row.matchday_id,
        placement_row.bank_item_id
      from new_placement_rows as placement_row
    ),
    unplaced as materialized (
      select
        affected_row.matchday_id,
        affected_row.bank_item_id
      from affected as affected_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id = affected_row.bank_item_id
       and bank_row.matchday_id = affected_row.matchday_id
      where not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      )
    )
    insert into public.matchday_live_layout_bank_item_state_memory as memory_row (
      matchday_id,
      bank_item_id,
      memory_kind,
      recorded_at
    )
    select
      unplaced_row.matchday_id,
      unplaced_row.bank_item_id,
      'displaced',
      statement_timestamp()
    from unplaced as unplaced_row
    on conflict (matchday_id, bank_item_id)
    do update
    set memory_kind = 'displaced',
        recorded_at = excluded.recorded_at
    where memory_row.memory_kind <> 'displaced';

    return null;
  end if;

  if tg_op = 'DELETE' then
    with affected as materialized (
      select distinct
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row
    )
    delete from public.matchday_live_layout_bank_item_state_memory
      as memory_row
    using affected as affected_row
    where memory_row.matchday_id = affected_row.matchday_id
      and memory_row.bank_item_id = affected_row.bank_item_id
      and exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      );

    with affected as materialized (
      select distinct
        placement_row.matchday_id,
        placement_row.bank_item_id
      from old_placement_rows as placement_row
    ),
    unplaced as materialized (
      select
        affected_row.matchday_id,
        affected_row.bank_item_id
      from affected as affected_row
      join public.matchday_editorial_bank_items as bank_row
        on bank_row.id = affected_row.bank_item_id
       and bank_row.matchday_id = affected_row.matchday_id
      where not exists (
        select 1
        from public.matchday_live_layout_placements as current_row
        where current_row.matchday_id = affected_row.matchday_id
          and current_row.bank_item_id = affected_row.bank_item_id
      )
    )
    insert into public.matchday_live_layout_bank_item_state_memory as memory_row (
      matchday_id,
      bank_item_id,
      memory_kind,
      recorded_at
    )
    select
      unplaced_row.matchday_id,
      unplaced_row.bank_item_id,
      'displaced',
      statement_timestamp()
    from unplaced as unplaced_row
    on conflict (matchday_id, bank_item_id)
    do update
    set memory_kind = 'displaced',
        recorded_at = excluded.recorded_at
    where memory_row.memory_kind <> 'displaced';

    return null;
  end if;

  return null;
end;
$function$;

revoke all on function
  jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()
from public, anon, authenticated, service_role;

create trigger matchday_live_layout_bank_item_memory_after_insert
  after insert
  on public.matchday_live_layout_placements
  referencing new table as new_placement_rows
  for each statement
  execute function
    jornada_private.reconcile_matchday_live_layout_bank_item_state_memory();

create trigger matchday_live_layout_bank_item_memory_after_update
  after update
  on public.matchday_live_layout_placements
  referencing old table as old_placement_rows
              new table as new_placement_rows
  for each statement
  execute function
    jornada_private.reconcile_matchday_live_layout_bank_item_state_memory();

create trigger matchday_live_layout_bank_item_memory_after_delete
  after delete
  on public.matchday_live_layout_placements
  referencing old table as old_placement_rows
  for each statement
  execute function
    jornada_private.reconcile_matchday_live_layout_bank_item_state_memory();

-- ============================================================
-- 4. PROJECAO PRIVADA, DERIVADA E SET-BASED
-- ============================================================

create function
jornada_private.project_matchday_live_layout_bank_item_states(
  p_matchday_ids uuid[]
)
returns table (
  matchday_id uuid,
  bank_item_id uuid,
  bank_status text,
  classification_key text,
  classification_source text,
  classified_at timestamptz,
  placement_count bigint,
  placements jsonb,
  has_faixa boolean,
  has_non_faixa_placement boolean,
  transversal_conflict boolean,
  memory_kind text,
  history_unknown boolean,
  memory_placement_conflict boolean,
  editorial_state text
)
language sql
stable
security definer
set search_path = ''
as $function$
  with bank_rows as materialized (
    select
      bank_row.matchday_id,
      bank_row.id as bank_item_id,
      bank_row.status as bank_status,
      bank_row.classification_key,
      bank_row.classification_source,
      bank_row.classified_at
    from public.matchday_editorial_bank_items as bank_row
    where p_matchday_ids is null
      or bank_row.matchday_id = any(p_matchday_ids)
  ),
  placement_rollup as materialized (
    select
      placement_row.matchday_id,
      placement_row.bank_item_id,
      pg_catalog.count(*) as placement_count,
      pg_catalog.jsonb_agg(
        pg_catalog.jsonb_build_object(
          'placement_id', placement_row.id,
          'placement_type', placement_row.placement_type,
          'zone_id', placement_row.zone_id,
          'slot_position', placement_row.slot_position
        )
        order by
          placement_row.placement_type,
          placement_row.zone_id,
          placement_row.slot_position,
          placement_row.id
      ) as placements,
      pg_catalog.bool_or(
        placement_row.placement_type = 'faixa'
      ) as has_faixa,
      pg_catalog.bool_or(
        placement_row.placement_type <> 'faixa'
      ) as has_non_faixa_placement
    from public.matchday_live_layout_placements as placement_row
    join bank_rows as bank_row
      on bank_row.matchday_id = placement_row.matchday_id
     and bank_row.bank_item_id = placement_row.bank_item_id
    group by
      placement_row.matchday_id,
      placement_row.bank_item_id
  )
  select
    bank_row.matchday_id,
    bank_row.bank_item_id,
    bank_row.bank_status,
    bank_row.classification_key,
    bank_row.classification_source,
    bank_row.classified_at,
    coalesce(placement_row.placement_count, 0::bigint),
    coalesce(placement_row.placements, '[]'::jsonb),
    coalesce(placement_row.has_faixa, false),
    coalesce(placement_row.has_non_faixa_placement, false),
    coalesce(placement_row.placement_count, 0::bigint) > 1,
    memory_row.memory_kind,
    coalesce(placement_row.placement_count, 0::bigint) = 0
      and coalesce(memory_row.memory_kind = 'legacy_unknown', false),
    coalesce(placement_row.placement_count, 0::bigint) > 0
      and memory_row.bank_item_id is not null,
    case
      when coalesce(placement_row.placement_count, 0::bigint) > 1
        then null::text
      when coalesce(placement_row.placement_count, 0::bigint) = 1
        and placement_row.has_faixa
        then 'FAIXA'::text
      when coalesce(placement_row.placement_count, 0::bigint) = 1
        then 'COLOCADA'::text
      when memory_row.memory_kind = 'displaced'
        then 'DESALOJADA'::text
      when memory_row.memory_kind = 'legacy_unknown'
        then null::text
      else 'NOVA'::text
    end
  from bank_rows as bank_row
  left join placement_rollup as placement_row
    on placement_row.matchday_id = bank_row.matchday_id
   and placement_row.bank_item_id = bank_row.bank_item_id
  left join public.matchday_live_layout_bank_item_state_memory as memory_row
    on memory_row.matchday_id = bank_row.matchday_id
   and memory_row.bank_item_id = bank_row.bank_item_id;
$function$;

revoke all on function
  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])
from public, anon, authenticated, service_role;

comment on function
  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])
is
  'Private set-based state projection. Duplicate placements remain unresolved and all slot identities are preserved.';

-- ============================================================
-- 5. BASELINE CONSISTENTE E NEUTRO
--
-- Both source tables remain locked until COMMIT. The statement timestamp is a
-- single baseline instant shared by every legacy_unknown row.
-- ============================================================

insert into public.matchday_live_layout_bank_item_state_memory (
  matchday_id,
  bank_item_id,
  memory_kind,
  recorded_at
)
select
  bank_row.matchday_id,
  bank_row.id,
  'legacy_unknown',
  statement_timestamp()
from public.matchday_editorial_bank_items as bank_row
where not exists (
  select 1
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = bank_row.matchday_id
    and placement_row.bank_item_id = bank_row.id
)
on conflict (matchday_id, bank_item_id)
do nothing;

do $postconditions$
begin
  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    left join public.matchday_live_layout_bank_item_state_memory as memory_row
      on memory_row.matchday_id = bank_row.matchday_id
     and memory_row.bank_item_id = bank_row.id
    where not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = bank_row.matchday_id
        and placement_row.bank_item_id = bank_row.id
    )
      and memory_row.memory_kind is distinct from 'legacy_unknown'
  ) then
    raise exception
      'matchday-live-layout-bank-item-state-memory-baseline-missing';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_bank_item_state_memory as memory_row
    where exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = memory_row.matchday_id
        and placement_row.bank_item_id = memory_row.bank_item_id
    )
  ) then
    raise exception
      'matchday-live-layout-bank-item-state-memory-baseline-conflict';
  end if;
end;
$postconditions$;

-- ============================================================
-- 6. FECHO DE SEGURANCA
-- ============================================================

revoke all on function
  jornada_private.reconcile_matchday_live_layout_bank_item_state_memory()
from public, anon, authenticated, service_role;

revoke all on function
  jornada_private.project_matchday_live_layout_bank_item_states(uuid[])
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
