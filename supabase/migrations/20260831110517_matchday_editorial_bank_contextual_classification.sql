begin;

-- ============================================================
-- LOTE 2
-- Classificação editorial contextual por participação/jornada.
--
-- Autoridade contextual:
-- public.matchday_editorial_bank_items.id
--
-- A classificação não pertence ao editorial_articles global.
-- ============================================================


-- ============================================================
-- 1. PERSISTÊNCIA
-- ============================================================

alter table public.matchday_editorial_bank_items
  add column classification_key text,
  add column classification_source text,
  add column classified_at timestamptz,

  add constraint matchday_editorial_bank_items_classification_key_check
    check (
      classification_key is null
      or classification_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    ),

  add constraint matchday_editorial_bank_items_classification_source_check
    check (
      classification_source is null
      or classification_source in (
        'automatic',
        'continuity_assisted',
        'manual'
      )
    ),

  add constraint matchday_editorial_bank_items_classification_triplet_check
    check (
      pg_catalog.num_nonnulls(
        classification_key,
        classification_source,
        classified_at
      ) in (0, 3)
    ),

  add constraint matchday_editorial_bank_items_classification_article_only_check
    check (
      classification_key is null
      or pg_catalog.lower(
        pg_catalog.btrim(coalesce(source_type, ''))
      ) = 'editorial_article'
    );


comment on column
  public.matchday_editorial_bank_items.classification_key
is
  'Classificação semântica contextual desta participação editorial na jornada. Não é propriedade global do artigo.';


comment on column
  public.matchday_editorial_bank_items.classification_source
is
  'Autoridade da classificação contextual: automatic, continuity_assisted ou manual.';


comment on column
  public.matchday_editorial_bank_items.classified_at
is
  'Instante em que a classificação contextual atual foi materializada.';


-- ============================================================
-- 2. BACKFILL
--
-- Durante o backfill não queremos:
-- - refresh de distribuição;
-- - sincronização artificial da seleção live;
-- - reescrever updated_at da bank.
--
-- Os triggers são repostos dentro da mesma transação.
-- ============================================================

alter table public.matchday_editorial_bank_items
  disable trigger refresh_matchday_editorial_profile_distribution_from_bank;

alter table public.matchday_editorial_bank_items
  disable trigger sync_matchday_editorial_selection_from_bank;

alter table public.matchday_editorial_bank_items
  disable trigger set_matchday_editorial_bank_items_updated_at;


-- 2A. Participações automáticas.
--
-- Usa deliberadamente o classifier público atual ANTES de o contrato
-- público passar a ler a classificação persistida.

with eligible_matchdays as materialized (
  select distinct bank_row.matchday_id
  from public.matchday_editorial_bank_items as bank_row
  where pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.status, ''))
        ) = 'active'
    and pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.source_type, ''))
        ) = 'editorial_article'
    and bank_row.automatic_eligible = true
),
classified as materialized (
  select
    matchday_row.matchday_id,
    classifier_row.source_type,
    classifier_row.source_id,
    classifier_row.classified_zone_key
  from eligible_matchdays as matchday_row
  cross join lateral
    public.matchday_editorial_profile_classification_plan(
      matchday_row.matchday_id
    ) as classifier_row
  join public.editorial_articles as article_row
    on article_row.id::text = pg_catalog.lower(
      pg_catalog.btrim(classifier_row.source_id)
    )
   and article_row.status = 'published'
)
update public.matchday_editorial_bank_items as bank_row
set
  classification_key = classified_row.classified_zone_key,
  classification_source = 'automatic',
  classified_at = pg_catalog.transaction_timestamp()
from classified as classified_row
where bank_row.matchday_id = classified_row.matchday_id
  and pg_catalog.lower(
        pg_catalog.btrim(coalesce(bank_row.source_type, ''))
      ) = pg_catalog.lower(
        pg_catalog.btrim(classified_row.source_type)
      )
  and pg_catalog.lower(
        pg_catalog.btrim(coalesce(bank_row.source_id, ''))
      ) = pg_catalog.lower(
        pg_catalog.btrim(classified_row.source_id)
      )
  and bank_row.classification_key is null
  and bank_row.classification_source is null
  and bank_row.classified_at is null;


-- 2B. Participações herdadas.
--
-- Materializa exatamente a semântica atualmente apresentada pelo
-- continuity classification plan. A partir deste ponto J05 deixa
-- de depender semanticamente de uma leitura viva de J04.

with continuity_matchdays as materialized (
  select distinct bank_row.matchday_id
  from public.matchday_editorial_bank_items as bank_row
  where pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.status, ''))
        ) = 'active'
    and pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.source_type, ''))
        ) = 'editorial_article'
    and bank_row.automatic_eligible = false
    and bank_row.continuity_source_matchday_id is not null
    and bank_row.continuity_source_composition_id is not null
),
classified as materialized (
  select
    matchday_row.matchday_id,
    classifier_row.source_type,
    classifier_row.source_id,
    classifier_row.classified_zone_key
  from continuity_matchdays as matchday_row
  cross join lateral
    public.matchday_editorial_profile_continuity_classification_plan(
      matchday_row.matchday_id
    ) as classifier_row
)
update public.matchday_editorial_bank_items as bank_row
set
  classification_key = classified_row.classified_zone_key,
  classification_source = 'continuity_assisted',
  classified_at = pg_catalog.transaction_timestamp()
from classified as classified_row
where bank_row.matchday_id = classified_row.matchday_id
  and pg_catalog.lower(
        pg_catalog.btrim(coalesce(bank_row.source_type, ''))
      ) = pg_catalog.lower(
        pg_catalog.btrim(classified_row.source_type)
      )
  and pg_catalog.lower(
        pg_catalog.btrim(coalesce(bank_row.source_id, ''))
      ) = pg_catalog.lower(
        pg_catalog.btrim(classified_row.source_id)
      )
  and bank_row.automatic_eligible = false
  and bank_row.classification_key is null
  and bank_row.classification_source is null
  and bank_row.classified_at is null;


-- O conjunto automático publicável atualmente conhecido não pode
-- ficar sem classificação depois da materialização.

do $block$
declare
  v_missing_automatic bigint;
  v_missing_continuity bigint;
begin
  select pg_catalog.count(*)
  into v_missing_automatic
  from public.matchday_editorial_bank_items as bank_row
  join public.editorial_articles as article_row
    on article_row.id::text =
      pg_catalog.lower(
        pg_catalog.btrim(coalesce(bank_row.source_id, ''))
      )
   and article_row.status = 'published'
  where pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.status, ''))
        ) = 'active'
    and pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.source_type, ''))
        ) = 'editorial_article'
    and bank_row.automatic_eligible = true
    and bank_row.classification_key is null;

  if v_missing_automatic <> 0 then
    raise exception
      'contextual-classification-backfill-missing-automatic:%',
      v_missing_automatic;
  end if;

  with continuity_matchdays as materialized (
    select distinct bank_row.matchday_id
    from public.matchday_editorial_bank_items as bank_row
    where pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.status, ''))
          ) = 'active'
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_type, ''))
          ) = 'editorial_article'
      and bank_row.automatic_eligible = false
      and bank_row.continuity_source_matchday_id is not null
      and bank_row.continuity_source_composition_id is not null
  ),
  resolved as materialized (
    select
      matchday_row.matchday_id,
      classifier_row.source_type,
      classifier_row.source_id
    from continuity_matchdays as matchday_row
    cross join lateral
      public.matchday_editorial_profile_continuity_classification_plan(
        matchday_row.matchday_id
      ) as classifier_row
  )
  select pg_catalog.count(*)
  into v_missing_continuity
  from resolved as resolved_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.matchday_id = resolved_row.matchday_id
   and pg_catalog.lower(
         pg_catalog.btrim(coalesce(bank_row.source_type, ''))
       ) = pg_catalog.lower(
         pg_catalog.btrim(resolved_row.source_type)
       )
   and pg_catalog.lower(
         pg_catalog.btrim(coalesce(bank_row.source_id, ''))
       ) = pg_catalog.lower(
         pg_catalog.btrim(resolved_row.source_id)
       )
  where bank_row.automatic_eligible = false
    and bank_row.classification_key is null;

  if v_missing_continuity <> 0 then
    raise exception
      'contextual-classification-backfill-missing-continuity:%',
      v_missing_continuity;
  end if;
end;
$block$;


alter table public.matchday_editorial_bank_items
  enable trigger set_matchday_editorial_bank_items_updated_at;

alter table public.matchday_editorial_bank_items
  enable trigger sync_matchday_editorial_selection_from_bank;

alter table public.matchday_editorial_bank_items
  enable trigger refresh_matchday_editorial_profile_distribution_from_bank;


-- ============================================================
-- 3. CLASSIFIER DERIVADO INTERNO
--
-- O contrato público passará a ler a classificação persistida.
-- Mantemos separadamente o motor que calcula uma classificação
-- automática quando uma participação nova/alterada precisa dela.
-- ============================================================

create or replace function
public.matchday_editorial_profile_derived_classification_plan_v1(
  p_matchday_id uuid
)
returns table(
  source_type text,
  source_id text,
  classified_zone_key text,
  actuality_order integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    derived_row.source_type,
    derived_row.source_id,
    derived_row.classified_zone_key,
    derived_row.actuality_order
  from public.matchday_editorial_profile_classification_plan_actuality_v1(
    p_matchday_id
  ) as derived_row;
$function$;


revoke all on function
  public.matchday_editorial_profile_derived_classification_plan_v1(uuid)
from public, anon, authenticated, service_role;


-- ============================================================
-- 4. AUTORIZAÇÃO INTERNA PRIVADA
--
-- Uma autorização interna não é estado de sessão controlável pelo caller.
-- Existe apenas para o backend, transação e Bank item exatos durante o
-- UPDATE interno protegido e é removida imediatamente depois do write.
-- ============================================================

create schema jornada_private authorization postgres;

revoke all on schema jornada_private
from public, anon, authenticated, service_role;

alter default privileges in schema jornada_private
  revoke execute on functions from public;

create table
jornada_private.matchday_editorial_bank_classification_authorizations (
  backend_pid integer not null,
  transaction_id xid8 not null,
  bank_item_id uuid not null,
  primary key (backend_pid, transaction_id, bank_item_id)
);

revoke all on table
  jornada_private.matchday_editorial_bank_classification_authorizations
from public, anon, authenticated, service_role;

create function
jornada_private.authorize_matchday_editorial_bank_classification_writes(
  p_bank_item_ids uuid[]
)
returns void
language sql
volatile
security definer
set search_path = ''
as $function$
  insert into
    jornada_private.matchday_editorial_bank_classification_authorizations (
      backend_pid,
      transaction_id,
      bank_item_id
    )
  select
    pg_catalog.pg_backend_pid(),
    pg_catalog.pg_current_xact_id(),
    authorized_id.bank_item_id
  from (
    select distinct bank_item_id
    from pg_catalog.unnest(
      coalesce(p_bank_item_ids, '{}'::uuid[])
    ) as authorized_row(bank_item_id)
    where bank_item_id is not null
  ) as authorized_id
  on conflict (backend_pid, transaction_id, bank_item_id)
  do nothing;
$function$;

create function
jornada_private.revoke_matchday_editorial_bank_classification_writes(
  p_bank_item_ids uuid[]
)
returns void
language sql
volatile
security definer
set search_path = ''
as $function$
  delete from
    jornada_private.matchday_editorial_bank_classification_authorizations
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.pg_current_xact_id()
    and bank_item_id = any(
      coalesce(p_bank_item_ids, '{}'::uuid[])
    );
$function$;


-- ============================================================
-- 5. GUARDA UNIVERSAL
--
-- - classificação manual sobrevive a writes normais;
-- - uma mudança real de source identity invalida a classificação;
-- - editorial_content nunca leva esta taxonomia;
-- - writers normais não podem escrever diretamente a tripla;
-- - mudança de eligibility/proveniência força nova decisão automática
--   exceto quando a autoridade é manual.
-- ============================================================

create or replace function
public.guard_matchday_editorial_bank_contextual_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_internal boolean;

  v_old_source_type text;
  v_new_source_type text;
  v_old_source_id text;
  v_new_source_id text;
begin
  v_internal := exists (
    select 1
    from jornada_private
      .matchday_editorial_bank_classification_authorizations
      as authorization_row
    where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
      and authorization_row.transaction_id =
        pg_catalog.pg_current_xact_id()
      and authorization_row.bank_item_id = new.id
  );

  v_new_source_type :=
    pg_catalog.lower(
      pg_catalog.btrim(coalesce(new.source_type, ''))
    );

  v_new_source_id :=
    pg_catalog.lower(
      pg_catalog.btrim(coalesce(new.source_id, ''))
    );

  if tg_op = 'INSERT' then
    if v_new_source_type <> 'editorial_article'
      or not v_internal
    then
      new.classification_key := null;
      new.classification_source := null;
      new.classified_at := null;
    end if;

    return new;
  end if;

  v_old_source_type :=
    pg_catalog.lower(
      pg_catalog.btrim(coalesce(old.source_type, ''))
    );

  v_old_source_id :=
    pg_catalog.lower(
      pg_catalog.btrim(coalesce(old.source_id, ''))
    );

  -- Taxonomia válida apenas para artigos.
  if v_new_source_type <> 'editorial_article' then
    new.classification_key := null;
    new.classification_source := null;
    new.classified_at := null;
    return new;
  end if;

  -- A classificação morre quando muda a jornada ou a source.
  if old.id is distinct from new.id
    or old.matchday_id is distinct from new.matchday_id
    or v_old_source_type is distinct from v_new_source_type
    or v_old_source_id is distinct from v_new_source_id
  then
    new.classification_key := null;
    new.classification_source := null;
    new.classified_at := null;
    return new;
  end if;

  -- Autoridade manual não é apagada por writers normais.
  if old.classification_source = 'manual'
    and not v_internal
  then
    new.classification_key := old.classification_key;
    new.classification_source := old.classification_source;
    new.classified_at := old.classified_at;
    return new;
  end if;

  -- Alterar o modo de participação/proveniência exige nova
  -- materialização, exceto para autoridade manual.
  if not v_internal
    and (
      old.automatic_eligible is distinct from new.automatic_eligible
      or old.continuity_source_matchday_id
          is distinct from new.continuity_source_matchday_id
      or old.continuity_source_composition_id
          is distinct from new.continuity_source_composition_id
    )
  then
    new.classification_key := null;
    new.classification_source := null;
    new.classified_at := null;
    return new;
  end if;

  -- Nenhum writer normal altera diretamente a autoridade.
  if not v_internal
    and (
      new.classification_key
        is distinct from old.classification_key
      or new.classification_source
        is distinct from old.classification_source
      or new.classified_at
        is distinct from old.classified_at
    )
  then
    new.classification_key := old.classification_key;
    new.classification_source := old.classification_source;
    new.classified_at := old.classified_at;
  end if;

  return new;
end;
$function$;


revoke all on function
  public.guard_matchday_editorial_bank_contextual_classification()
from public, anon, authenticated, service_role;


drop trigger if exists
  guard_matchday_editorial_bank_contextual_classification
on public.matchday_editorial_bank_items;


create trigger
  guard_matchday_editorial_bank_contextual_classification
before insert or update of
  id,
  matchday_id,
  source_type,
  source_id,
  automatic_eligible,
  continuity_source_matchday_id,
  continuity_source_composition_id,
  classification_key,
  classification_source,
  classified_at
on public.matchday_editorial_bank_items
for each row
execute function
  public.guard_matchday_editorial_bank_contextual_classification();


-- ============================================================
-- 5. MATERIALIZADOR CENTRAL
--
-- Automatic:
--   calcula no contexto da própria jornada.
--
-- Continuity assisted:
--   lê a classificação já materializada no ancestral mais próximo
--   UMA VEZ e materializa-a na participação alvo.
--
-- Depois disso o alvo deixa de depender semanticamente do ancestral.
-- ============================================================

create function
jornada_private.write_matchday_editorial_bank_contextual_classification(
  p_bank_item_id uuid,
  p_classification_key text,
  p_classification_source text
)
returns boolean
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_bank record;
  v_changed boolean := false;
begin
  if (p_classification_key is null) <>
     (p_classification_source is null)
  then
    raise exception 'contextual-classification-incomplete-triplet';
  end if;

  if p_classification_key is not null
    and p_classification_key not in (
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other'
    )
  then
    raise exception 'contextual-classification-invalid-key:%',
      p_classification_key;
  end if;

  if p_classification_source is not null
    and p_classification_source not in (
      'automatic',
      'continuity_assisted',
      'manual'
    )
  then
    raise exception 'contextual-classification-invalid-source:%',
      p_classification_source;
  end if;

  select bank_row.*
  into v_bank
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = p_bank_item_id
  for update;

  if not found then
    return false;
  end if;

  if pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_bank.source_type, ''))
     ) <> 'editorial_article'
    and p_classification_key is not null
  then
    raise exception 'contextual-classification-non-article:%',
      p_bank_item_id;
  end if;

  if v_bank.classification_source = 'manual'
    and p_classification_source is distinct from 'manual'
  then
    return false;
  end if;

  if v_bank.classification_source = 'continuity_assisted'
    and p_classification_source is distinct from 'continuity_assisted'
  then
    return false;
  end if;

  if v_bank.classification_key is not distinct from p_classification_key
    and v_bank.classification_source
      is not distinct from p_classification_source
  then
    return false;
  end if;

  perform
    jornada_private.authorize_matchday_editorial_bank_classification_writes(
      array[p_bank_item_id]
    );

  begin
    update public.matchday_editorial_bank_items as bank_row
    set
      classification_key = p_classification_key,
      classification_source = p_classification_source,
      classified_at = case
        when p_classification_key is null then null
        else pg_catalog.statement_timestamp()
      end
    where bank_row.id = p_bank_item_id;

    v_changed := found;

    perform
      jornada_private.revoke_matchday_editorial_bank_classification_writes(
        array[p_bank_item_id]
      );
  exception
    when others then
      perform
        jornada_private.revoke_matchday_editorial_bank_classification_writes(
          array[p_bank_item_id]
        );
      raise;
  end;

  return v_changed;
end;
$function$;


create function
jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
  p_matchday_ids uuid[] default null,
  p_bank_item_ids uuid[] default null,
  p_source_ids text[] default null,
  p_refresh_distribution boolean default true
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_ids text[];
  v_bank_item_ids uuid[];
  v_changed_matchday_ids uuid[] := '{}'::uuid[];
  v_updated_count integer := 0;
  v_matchday_id uuid;
begin
  if p_source_ids is not null then
    select coalesce(
      pg_catalog.array_agg(distinct normalized_source.source_id),
      '{}'::text[]
    )
    into v_source_ids
    from (
      select pg_catalog.lower(
        pg_catalog.btrim(source_row.source_id)
      ) as source_id
      from pg_catalog.unnest(p_source_ids) as source_row(source_id)
      where nullif(pg_catalog.btrim(source_row.source_id), '') is not null
    ) as normalized_source;
  end if;

  select coalesce(
    pg_catalog.array_agg(target_row.id order by target_row.id),
    '{}'::uuid[]
  )
  into v_bank_item_ids
  from (
    select bank_row.id
    from public.matchday_editorial_bank_items as bank_row
    where pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.status, ''))
          ) = 'active'
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_type, ''))
          ) = 'editorial_article'
      and bank_row.automatic_eligible = true
      and bank_row.classification_source is distinct from 'manual'
      and bank_row.classification_source
        is distinct from 'continuity_assisted'
      and (
        p_matchday_ids is null
        or bank_row.matchday_id = any(p_matchday_ids)
      )
      and (
        p_bank_item_ids is null
        or bank_row.id = any(p_bank_item_ids)
      )
      and (
        p_source_ids is null
        or pg_catalog.lower(
             pg_catalog.btrim(coalesce(bank_row.source_id, ''))
           ) = any(v_source_ids)
      )
    order by bank_row.id
    for update
  ) as target_row;

  if pg_catalog.cardinality(v_bank_item_ids) = 0 then
    return 0;
  end if;

  perform
    jornada_private.authorize_matchday_editorial_bank_classification_writes(
      v_bank_item_ids
    );

  begin
    with targets as materialized (
      select
        bank_row.id,
        bank_row.matchday_id,
        pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.source_id, ''))
        ) as source_id
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.id = any(v_bank_item_ids)
        and pg_catalog.lower(
              pg_catalog.btrim(coalesce(bank_row.status, ''))
            ) = 'active'
        and pg_catalog.lower(
              pg_catalog.btrim(coalesce(bank_row.source_type, ''))
            ) = 'editorial_article'
        and bank_row.automatic_eligible = true
        and bank_row.classification_source is distinct from 'manual'
        and bank_row.classification_source
          is distinct from 'continuity_assisted'
    ),
    target_matchdays as materialized (
      select distinct target_row.matchday_id
      from targets as target_row
    ),
    derived_raw as materialized (
      select
        target_matchday.matchday_id,
        pg_catalog.lower(
          pg_catalog.btrim(derived_row.source_type)
        ) as source_type,
        pg_catalog.lower(
          pg_catalog.btrim(derived_row.source_id)
        ) as source_id,
        derived_row.classified_zone_key as classification_key,
        derived_row.actuality_order
      from target_matchdays as target_matchday
      cross join lateral
        public.matchday_editorial_profile_derived_classification_plan_v1(
          target_matchday.matchday_id
        ) as derived_row
    ),
    derived as materialized (
      select distinct on (
        derived_row.matchday_id,
        derived_row.source_type,
        derived_row.source_id
      )
        derived_row.matchday_id,
        derived_row.source_type,
        derived_row.source_id,
        derived_row.classification_key
      from derived_raw as derived_row
      join public.editorial_articles as article_row
        on article_row.id::text = derived_row.source_id
       and article_row.status = 'published'
      where derived_row.source_type = 'editorial_article'
      order by
        derived_row.matchday_id,
        derived_row.source_type,
        derived_row.source_id,
        derived_row.actuality_order nulls last
    ),
    resolved as materialized (
      select
        target_row.id,
        target_row.matchday_id,
        derived_row.classification_key,
        case
          when derived_row.classification_key is null then null
          else 'automatic'::text
        end as classification_source
      from targets as target_row
      left join derived as derived_row
        on derived_row.matchday_id = target_row.matchday_id
       and derived_row.source_type = 'editorial_article'
       and derived_row.source_id = target_row.source_id
    ),
    updated as (
      update public.matchday_editorial_bank_items as bank_row
      set
        classification_key = resolved_row.classification_key,
        classification_source = resolved_row.classification_source,
        classified_at = case
          when resolved_row.classification_key is null then null
          else pg_catalog.statement_timestamp()
        end
      from resolved as resolved_row
      where bank_row.id = resolved_row.id
        and bank_row.classification_source is distinct from 'manual'
        and bank_row.classification_source
          is distinct from 'continuity_assisted'
        and (
          bank_row.classification_key
            is distinct from resolved_row.classification_key
          or bank_row.classification_source
            is distinct from resolved_row.classification_source
        )
      returning bank_row.matchday_id
    )
    select
      pg_catalog.count(*)::integer,
      coalesce(
        pg_catalog.array_agg(distinct updated_row.matchday_id),
        '{}'::uuid[]
      )
    into v_updated_count, v_changed_matchday_ids
    from updated as updated_row;

    perform
      jornada_private.revoke_matchday_editorial_bank_classification_writes(
        v_bank_item_ids
      );
  exception
    when others then
      perform
        jornada_private.revoke_matchday_editorial_bank_classification_writes(
          v_bank_item_ids
        );
      raise;
  end;

  if p_refresh_distribution then
    foreach v_matchday_id in array v_changed_matchday_ids loop
      if exists (
        select 1
        from public.matchday_editorial_profile_assignments
          as assignment_row
        where assignment_row.matchday_id = v_matchday_id
      )
      then
        perform public.refresh_matchday_editorial_profile_distribution(
          v_matchday_id
        );
      end if;
    end loop;
  end if;

  return v_updated_count;
end;
$function$;


create or replace function
public.refresh_matchday_editorial_bank_contextual_classification(
  p_bank_item_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_bank record;
  v_classification_key text;
  v_classification_source text;
begin
  select bank_row.*
  into v_bank
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = p_bank_item_id
  for update;

  if not found then
    return;
  end if;

  -- Classificação manual é autoridade máxima para a mesma
  -- participação/source identity.
  if v_bank.classification_source = 'manual' then
    return;
  end if;

  -- Sources não-artigo nunca entram nesta taxonomia.
  if pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_bank.source_type, ''))
     ) <> 'editorial_article'
  then
    v_classification_key := null;
    v_classification_source := null;

  -- Arquivar não apaga a classificação que a participação já tinha.
  elsif pg_catalog.lower(
          pg_catalog.btrim(coalesce(v_bank.status, ''))
        ) <> 'active'
  then
    return;

  -- Participação automática da própria jornada.
  elsif v_bank.automatic_eligible then
    perform
      jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
        p_bank_item_ids => array[p_bank_item_id],
        p_refresh_distribution => false
      );
    return;

  -- Uma continuidade já materializada fica congelada no alvo.
  elsif v_bank.classification_source = 'continuity_assisted'
    and v_bank.classification_key is not null
  then
    return;

  -- Nova continuidade: usar a classificação persistida no ancestral
  -- mais próximo e materializá-la agora na participação alvo.
  elsif v_bank.continuity_source_matchday_id is not null
    and v_bank.continuity_source_composition_id is not null
  then
    with recursive matchday_chain as (
      select
        transition_row.source_matchday_id as lookup_matchday_id,
        1 as depth
      from public.matchday_editorial_continuity_transitions
        as transition_row
      where transition_row.target_matchday_id = v_bank.matchday_id
        and transition_row.source_matchday_id =
          v_bank.continuity_source_matchday_id
        and transition_row.source_composition_id =
          v_bank.continuity_source_composition_id

      union all

      select
        transition_row.source_matchday_id,
        chain.depth + 1
      from matchday_chain as chain
      join public.matchday_editorial_continuity_transitions
        as transition_row
        on transition_row.target_matchday_id =
          chain.lookup_matchday_id
      where chain.depth < 100
    )
    select ancestor_row.classification_key
    into v_classification_key
    from matchday_chain as chain
    join public.matchday_editorial_bank_items as ancestor_row
      on ancestor_row.matchday_id = chain.lookup_matchday_id
     and pg_catalog.lower(
           pg_catalog.btrim(coalesce(ancestor_row.source_type, ''))
         ) = 'editorial_article'
     and pg_catalog.lower(
           pg_catalog.btrim(coalesce(ancestor_row.source_id, ''))
         ) = pg_catalog.lower(
           pg_catalog.btrim(coalesce(v_bank.source_id, ''))
         )
    where ancestor_row.classification_key is not null
    order by
      chain.depth,
      ancestor_row.created_at,
      ancestor_row.id
    limit 1;

    if v_classification_key is not null then
      v_classification_source := 'continuity_assisted';
    end if;
  end if;

  -- Idempotência: não tocar em timestamp nem updated_at sem mudança
  -- real de key/source.
  if v_classification_key is null then
    if v_bank.classification_key is null
      and v_bank.classification_source is null
      and v_bank.classified_at is null
    then
      return;
    end if;
  elsif v_bank.classification_key = v_classification_key
    and v_bank.classification_source = v_classification_source
    and v_bank.classified_at is not null
  then
    return;
  end if;

  perform
    jornada_private.write_matchday_editorial_bank_contextual_classification(
      p_bank_item_id,
      v_classification_key,
      v_classification_source
    );
end;
$function$;


revoke all on function
  public.refresh_matchday_editorial_bank_contextual_classification(uuid)
from public, anon, authenticated, service_role;


create or replace function
public.materialize_matchday_editorial_bank_contextual_classification()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_bank_item_ids uuid[];
  v_automatic_bank_item_ids uuid[];
  v_bank_item_id uuid;
begin
  if tg_op = 'INSERT' then
    select coalesce(
      pg_catalog.array_agg(new_row.id order by new_row.id),
      '{}'::uuid[]
    )
    into v_bank_item_ids
    from new_rows as new_row;
  else
    with changed_rows as (
      select new_row.id
      from old_rows as old_row
      full join new_rows as new_row
        on new_row.id = old_row.id
      where new_row.id is not null
        and (
          old_row.id is null
          or old_row.matchday_id is distinct from new_row.matchday_id
          or old_row.source_type is distinct from new_row.source_type
          or old_row.source_id is distinct from new_row.source_id
          or old_row.status is distinct from new_row.status
          or old_row.automatic_eligible
            is distinct from new_row.automatic_eligible
          or old_row.continuity_source_matchday_id
            is distinct from new_row.continuity_source_matchday_id
          or old_row.continuity_source_composition_id
            is distinct from new_row.continuity_source_composition_id
        )
    )
    select coalesce(
      pg_catalog.array_agg(changed_row.id order by changed_row.id),
      '{}'::uuid[]
    )
    into v_bank_item_ids
    from changed_rows as changed_row;
  end if;

  if pg_catalog.cardinality(v_bank_item_ids) = 0 then
    return null;
  end if;

  select coalesce(
    pg_catalog.array_agg(bank_row.id order by bank_row.id),
    '{}'::uuid[]
  )
  into v_automatic_bank_item_ids
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = any(v_bank_item_ids)
    and pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.status, ''))
        ) = 'active'
    and pg_catalog.lower(
          pg_catalog.btrim(coalesce(bank_row.source_type, ''))
        ) = 'editorial_article'
    and bank_row.automatic_eligible = true
    and bank_row.classification_source is distinct from 'manual'
    and bank_row.classification_source
      is distinct from 'continuity_assisted';

  perform
    jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
      p_bank_item_ids => v_automatic_bank_item_ids,
      p_refresh_distribution => false
    );

  for v_bank_item_id in
    select bank_row.id
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.id = any(v_bank_item_ids)
      and not (
        bank_row.id = any(v_automatic_bank_item_ids)
      )
    order by bank_row.id
  loop
    perform public.refresh_matchday_editorial_bank_contextual_classification(
      v_bank_item_id
    );
  end loop;

  return null;
end;
$function$;


revoke all on function
  public.materialize_matchday_editorial_bank_contextual_classification()
from public, anon, authenticated, service_role;


drop trigger if exists
  materialize_matchday_editorial_bank_contextual_classification
on public.matchday_editorial_bank_items;


create trigger materialize_contextual_classification_from_bank_insert
after insert on public.matchday_editorial_bank_items
referencing new table as new_rows
for each statement
execute function
  public.materialize_matchday_editorial_bank_contextual_classification();

create trigger materialize_contextual_classification_from_bank_update
after update on public.matchday_editorial_bank_items
referencing old table as old_rows new table as new_rows
for each statement
execute function
  public.materialize_matchday_editorial_bank_contextual_classification();


-- ============================================================
-- 6. EVITAR SEGUNDO REFRESH/SYNC NO UPDATE INTERNO
--
-- O write da classificação acontece dentro da mesma transação.
-- Não deve executar uma segunda distribuição nem regravar snapshots
-- da seleção live. O write original continua a executar ambos.
-- ============================================================

-- ============================================================
-- 8. INVALIDACAO DOS INPUTS SEMANTICOS
--
-- Triggers statement-level recolhem o conjunto afetado. Alteracoes globais
-- (teams e aliases) continuam a fazer um unico refresh set-based.
-- ============================================================

create function
jornada_private.refresh_automatic_classifications_for_seasons(
  p_season_ids uuid[]
)
returns integer
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_matchday_ids uuid[];
begin
  select coalesce(
    pg_catalog.array_agg(matchday_row.id order by matchday_row.id),
    '{}'::uuid[]
  )
  into v_matchday_ids
  from public.matchdays as matchday_row
  where matchday_row.season_id = any(
    coalesce(p_season_ids, '{}'::uuid[])
  );

  if pg_catalog.cardinality(v_matchday_ids) = 0 then
    return 0;
  end if;

  return
    jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
      p_matchday_ids => v_matchday_ids,
      p_refresh_distribution => true
    );
end;
$function$;


create function
jornada_private.refresh_all_automatic_classifications_from_statement()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform
    jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
      p_refresh_distribution => true
    );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_articles_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_ids text[];
begin
  select coalesce(
    pg_catalog.array_agg(new_row.id::text),
    '{}'::text[]
  )
  into v_source_ids
  from new_rows as new_row;

  perform
    jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
      p_source_ids => v_source_ids,
      p_refresh_distribution => true
    );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_articles_delete()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_ids text[];
begin
  select coalesce(
    pg_catalog.array_agg(old_row.id::text),
    '{}'::text[]
  )
  into v_source_ids
  from old_rows as old_row;

  perform
    jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
      p_source_ids => v_source_ids,
      p_refresh_distribution => true
    );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_articles_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_ids text[];
begin
  with changed_rows as (
    select
      old_row.id as old_id,
      new_row.id as new_id
    from old_rows as old_row
    full join new_rows as new_row
      on new_row.id = old_row.id
    where old_row.id is null
      or new_row.id is null
      or old_row.label is distinct from new_row.label
      or old_row.title is distinct from new_row.title
      or old_row.subtitle is distinct from new_row.subtitle
      or old_row.body is distinct from new_row.body
      or old_row.status is distinct from new_row.status
  ),
  changed_ids as (
    select changed_row.old_id as id
    from changed_rows as changed_row
    where changed_row.old_id is not null

    union

    select changed_row.new_id
    from changed_rows as changed_row
    where changed_row.new_id is not null
  )
  select coalesce(
    pg_catalog.array_agg(changed_id.id::text),
    '{}'::text[]
  )
  into v_source_ids
  from changed_ids as changed_id;

  perform
    jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
      p_source_ids => v_source_ids,
      p_refresh_distribution => true
    );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_teams_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from old_rows as old_row
    full join new_rows as new_row
      on new_row.id = old_row.id
    where old_row.id is null
      or new_row.id is null
      or old_row.slug is distinct from new_row.slug
      or old_row.name is distinct from new_row.name
      or old_row.short_name is distinct from new_row.short_name
      or old_row.public_name is distinct from new_row.public_name
  )
  then
    perform
      jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
        p_refresh_distribution => true
      );
  end if;
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_aliases_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from new_rows as new_row
    where new_row.status = 'active'
  )
  then
    perform
      jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
        p_refresh_distribution => true
      );
  end if;
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_aliases_delete()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from old_rows as old_row
    where old_row.status = 'active'
  )
  then
    perform
      jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
        p_refresh_distribution => true
      );
  end if;
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_aliases_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from old_rows as old_row
    full join new_rows as new_row
      on new_row.id = old_row.id
    where (
        old_row.id is null
        or new_row.id is null
        or old_row.team_id is distinct from new_row.team_id
        or old_row.alias is distinct from new_row.alias
        or old_row.normalized_alias
          is distinct from new_row.normalized_alias
        or old_row.status is distinct from new_row.status
      )
      and (
        old_row.status = 'active'
        or new_row.status = 'active'
      )
  )
  then
    perform
      jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
        p_refresh_distribution => true
      );
  end if;
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_season_teams_insert()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_season_ids uuid[];
begin
  select coalesce(
    pg_catalog.array_agg(distinct new_row.season_id),
    '{}'::uuid[]
  )
  into v_season_ids
  from new_rows as new_row
  where new_row.status = 'active';

  perform jornada_private.refresh_automatic_classifications_for_seasons(
    v_season_ids
  );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_season_teams_delete()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_season_ids uuid[];
begin
  select coalesce(
    pg_catalog.array_agg(distinct old_row.season_id),
    '{}'::uuid[]
  )
  into v_season_ids
  from old_rows as old_row
  where old_row.status = 'active';

  perform jornada_private.refresh_automatic_classifications_for_seasons(
    v_season_ids
  );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_season_teams_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_season_ids uuid[];
begin
  with changed_rows as (
    select
      old_row.season_id as old_season_id,
      new_row.season_id as new_season_id
    from old_rows as old_row
    full join new_rows as new_row
      on new_row.id = old_row.id
    where (
        old_row.id is null
        or new_row.id is null
        or old_row.season_id is distinct from new_row.season_id
        or old_row.team_id is distinct from new_row.team_id
        or old_row.status is distinct from new_row.status
      )
      and (
        old_row.status = 'active'
        or new_row.status = 'active'
      )
  ),
  changed_seasons as (
    select changed_row.old_season_id as season_id
    from changed_rows as changed_row
    where changed_row.old_season_id is not null

    union

    select changed_row.new_season_id
    from changed_rows as changed_row
    where changed_row.new_season_id is not null
  )
  select coalesce(
    pg_catalog.array_agg(changed_season.season_id),
    '{}'::uuid[]
  )
  into v_season_ids
  from changed_seasons as changed_season;

  perform jornada_private.refresh_automatic_classifications_for_seasons(
    v_season_ids
  );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_competitions_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_season_ids uuid[];
begin
  select coalesce(
    pg_catalog.array_agg(season_row.id),
    '{}'::uuid[]
  )
  into v_season_ids
  from public.seasons as season_row
  where season_row.competition_id in (
    select changed_competition.id
    from (
      select old_row.id
      from old_rows as old_row
      join new_rows as new_row on new_row.id = old_row.id
      where old_row.name is distinct from new_row.name
        or old_row.slug is distinct from new_row.slug
    ) as changed_competition
  );

  perform jornada_private.refresh_automatic_classifications_for_seasons(
    v_season_ids
  );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_seasons_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_season_ids uuid[];
begin
  with changed_rows as (
    select
      old_row.id as old_id,
      new_row.id as new_id
    from old_rows as old_row
    full join new_rows as new_row
      on new_row.id = old_row.id
    where old_row.id is null
      or new_row.id is null
      or old_row.competition_id is distinct from new_row.competition_id
  ),
  changed_seasons as (
    select changed_row.old_id as id
    from changed_rows as changed_row
    where changed_row.old_id is not null

    union

    select changed_row.new_id
    from changed_rows as changed_row
    where changed_row.new_id is not null
  )
  select coalesce(
    pg_catalog.array_agg(changed_season.id),
    '{}'::uuid[]
  )
  into v_season_ids
  from changed_seasons as changed_season;

  perform jornada_private.refresh_automatic_classifications_for_seasons(
    v_season_ids
  );
  return null;
end;
$function$;


create function
jornada_private.refresh_automatic_classifications_from_matchdays_update()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_matchday_ids uuid[];
begin
  with changed_rows as (
    select
      old_row.id as old_id,
      new_row.id as new_id
    from old_rows as old_row
    full join new_rows as new_row
      on new_row.id = old_row.id
    where old_row.id is null
      or new_row.id is null
      or old_row.season_id is distinct from new_row.season_id
  ),
  changed_matchdays as (
    select changed_row.old_id as id
    from changed_rows as changed_row
    where changed_row.old_id is not null

    union

    select changed_row.new_id
    from changed_rows as changed_row
    where changed_row.new_id is not null
  )
  select coalesce(
    pg_catalog.array_agg(changed_matchday.id),
    '{}'::uuid[]
  )
  into v_matchday_ids
  from changed_matchdays as changed_matchday;

  perform
    jornada_private.refresh_matchday_editorial_bank_automatic_classifications(
      p_matchday_ids => v_matchday_ids,
      p_refresh_distribution => true
    );
  return null;
end;
$function$;


create trigger refresh_contextual_classification_from_articles_insert
after insert on public.editorial_articles
referencing new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_articles_insert();

create trigger refresh_contextual_classification_from_articles_update
after update on public.editorial_articles
referencing old table as old_rows new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_articles_update();

create trigger refresh_contextual_classification_from_articles_delete
after delete on public.editorial_articles
referencing old table as old_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_articles_delete();

create trigger refresh_contextual_classification_from_teams_insert
after insert on public.teams
for each statement
execute function
  jornada_private.refresh_all_automatic_classifications_from_statement();

create trigger refresh_contextual_classification_from_teams_update
after update on public.teams
referencing old table as old_rows new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_teams_update();

create trigger refresh_contextual_classification_from_teams_delete
after delete on public.teams
for each statement
execute function
  jornada_private.refresh_all_automatic_classifications_from_statement();

create trigger refresh_contextual_classification_from_aliases_insert
after insert on public.team_aliases
referencing new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_aliases_insert();

create trigger refresh_contextual_classification_from_aliases_update
after update on public.team_aliases
referencing old table as old_rows new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_aliases_update();

create trigger refresh_contextual_classification_from_aliases_delete
after delete on public.team_aliases
referencing old table as old_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_aliases_delete();

create trigger refresh_contextual_classification_from_season_teams_insert
after insert on public.season_teams
referencing new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_season_teams_insert();

create trigger refresh_contextual_classification_from_season_teams_update
after update on public.season_teams
referencing old table as old_rows new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_season_teams_update();

create trigger refresh_contextual_classification_from_season_teams_delete
after delete on public.season_teams
referencing old table as old_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_season_teams_delete();

create trigger refresh_contextual_classification_from_competitions_update
after update on public.competitions
referencing old table as old_rows new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_competitions_update();

create trigger refresh_contextual_classification_from_seasons_update
after update on public.seasons
referencing old table as old_rows new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_seasons_update();

create trigger refresh_contextual_classification_from_matchdays_update
after update on public.matchdays
referencing old table as old_rows new table as new_rows
for each statement
execute function
  jornada_private.refresh_automatic_classifications_from_matchdays_update();


create or replace function
public.refresh_matchday_editorial_profile_distribution_from_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_matchday_ids uuid[];
  v_matchday_id uuid;
begin
  if tg_op = 'UPDATE'
    and not exists (
      select 1
      from new_rows as new_row
      where not exists (
        select 1
        from jornada_private
          .matchday_editorial_bank_classification_authorizations
          as authorization_row
        where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
          and authorization_row.transaction_id =
            pg_catalog.pg_current_xact_id()
          and authorization_row.bank_item_id = new_row.id
      )
    )
  then
    return null;
  end if;

  if pg_catalog.current_setting(
    'jornada.thematic_continuity_initialize',
    true
  ) = 'on' then
    return null;
  end if;

  if tg_op = 'DELETE' then
    select coalesce(
      pg_catalog.array_agg(distinct old_row.matchday_id),
      '{}'::uuid[]
    )
    into v_matchday_ids
    from old_rows as old_row
    where old_row.automatic_eligible = true;
  elsif tg_op = 'INSERT' then
    select coalesce(
      pg_catalog.array_agg(distinct new_row.matchday_id),
      '{}'::uuid[]
    )
    into v_matchday_ids
    from new_rows as new_row
    where new_row.automatic_eligible = true;
  else
    with changed_rows as (
      select
        old_row.matchday_id as old_matchday_id,
        new_row.matchday_id as new_matchday_id,
        old_row.automatic_eligible as old_automatic_eligible,
        new_row.automatic_eligible as new_automatic_eligible
      from old_rows as old_row
      full join new_rows as new_row
        on new_row.id = old_row.id
      where old_row.id is null
        or new_row.id is null
        or old_row.matchday_id is distinct from new_row.matchday_id
        or pg_catalog.lower(
             pg_catalog.btrim(coalesce(old_row.source_type, ''))
           ) is distinct from pg_catalog.lower(
             pg_catalog.btrim(coalesce(new_row.source_type, ''))
           )
        or pg_catalog.lower(
             pg_catalog.btrim(coalesce(old_row.source_id, ''))
           ) is distinct from pg_catalog.lower(
             pg_catalog.btrim(coalesce(new_row.source_id, ''))
           )
        or pg_catalog.lower(
             pg_catalog.btrim(coalesce(old_row.status, ''))
           ) is distinct from pg_catalog.lower(
             pg_catalog.btrim(coalesce(new_row.status, ''))
           )
        or old_row.automatic_eligible
          is distinct from new_row.automatic_eligible
    ),
    changed_matchdays as (
      select changed_row.old_matchday_id as matchday_id
      from changed_rows as changed_row
      where changed_row.old_automatic_eligible = true
        and changed_row.old_matchday_id is not null

      union

      select changed_row.new_matchday_id
      from changed_rows as changed_row
      where changed_row.new_automatic_eligible = true
        and changed_row.new_matchday_id is not null
    )
    select coalesce(
      pg_catalog.array_agg(changed_matchday.matchday_id),
      '{}'::uuid[]
    )
    into v_matchday_ids
    from changed_matchdays as changed_matchday;
  end if;

  foreach v_matchday_id in array v_matchday_ids loop
    if exists (
      select 1
      from public.matchday_editorial_profile_assignments
        as assignment_row
      where assignment_row.matchday_id = v_matchday_id
    )
    then
      perform public.refresh_matchday_editorial_profile_distribution(
        v_matchday_id
      );
    end if;
  end loop;

  return null;
end;
$function$;


revoke all on function
  public.refresh_matchday_editorial_profile_distribution_from_bank()
from public, anon, authenticated, service_role;


drop trigger if exists
  refresh_matchday_editorial_profile_distribution_from_bank
on public.matchday_editorial_bank_items;

create trigger refresh_profile_distribution_from_bank_insert
after insert on public.matchday_editorial_bank_items
referencing new table as new_rows
for each statement
execute function
  public.refresh_matchday_editorial_profile_distribution_from_bank();

create trigger refresh_profile_distribution_from_bank_update
after update on public.matchday_editorial_bank_items
referencing old table as old_rows new table as new_rows
for each statement
execute function
  public.refresh_matchday_editorial_profile_distribution_from_bank();

create trigger refresh_profile_distribution_from_bank_delete
after delete on public.matchday_editorial_bank_items
referencing old table as old_rows
for each statement
execute function
  public.refresh_matchday_editorial_profile_distribution_from_bank();


create or replace function
public.sync_matchday_editorial_selection_from_bank()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_source_type text;
  v_source_id text;
begin
  if tg_op not in ('INSERT', 'UPDATE') then
    return new;
  end if;

  if exists (
    select 1
    from jornada_private
      .matchday_editorial_bank_classification_authorizations
      as authorization_row
    where authorization_row.backend_pid = pg_catalog.pg_backend_pid()
      and authorization_row.transaction_id =
        pg_catalog.pg_current_xact_id()
      and authorization_row.bank_item_id = new.id
  )
  then
    return new;
  end if;

  v_source_type :=
    pg_catalog.lower(
      pg_catalog.btrim(coalesce(new.source_type, ''))
    );

  v_source_id :=
    pg_catalog.btrim(coalesce(new.source_id, ''));

  if v_source_type not in (
    'editorial_article',
    'editorial_content'
  )
    or v_source_id = ''
  then
    return new;
  end if;

  update public.matchday_live_layout_items as live_row
  set
    article_id = case
      when v_source_type = 'editorial_article'
       and v_source_id ~*
         '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then v_source_id::uuid
      else null
    end,
    label = nullif(pg_catalog.btrim(new.label), ''),
    title = nullif(pg_catalog.btrim(new.title), ''),
    subtitle = nullif(pg_catalog.btrim(new.subtitle), ''),
    image_url = nullif(pg_catalog.btrim(new.image_url), ''),
    link_url = nullif(pg_catalog.btrim(new.link_url), ''),
    updated_at = pg_catalog.now()
  where live_row.matchday_id = new.matchday_id
    and live_row.slot_type in (
      'live_four_news:1',
      'live_four_news:2',
      'live_four_news:3',
      'live_four_news:4'
    )
    and pg_catalog.lower(
          pg_catalog.btrim(coalesce(live_row.source_type, ''))
        ) = v_source_type
    and pg_catalog.btrim(
          coalesce(live_row.source_id, '')
        ) = v_source_id;

  return new;
end;
$function$;


revoke all on function
  public.sync_matchday_editorial_selection_from_bank()
from public, anon, authenticated, service_role;


-- ============================================================
-- 7. AUTORIDADE PÚBLICA DA CLASSIFICAÇÃO
--
-- A assinatura permanece igual para não alterar Mesa, Apply,
-- readers ou TypeScript.
--
-- O classified_zone_key externo continua temporariamente por
-- compatibilidade; a sua origem passa a ser classification_key.
-- ============================================================

create or replace function
public.matchday_editorial_profile_classification_plan(
  p_matchday_id uuid
)
returns table(
  source_type text,
  source_id text,
  classified_zone_key text,
  actuality_order integer
)
language sql
stable
security definer
set search_path = ''
as $function$
  with classified as materialized (
    select
      pg_catalog.lower(
        pg_catalog.btrim(bank_row.source_type)
      ) as source_type,
      pg_catalog.lower(
        pg_catalog.btrim(bank_row.source_id)
      ) as source_id,
      bank_row.classification_key as classified_zone_key
    from public.matchday_editorial_bank_items as bank_row
    join public.editorial_articles as article_row
      on article_row.id::text =
        pg_catalog.lower(
          pg_catalog.btrim(bank_row.source_id)
        )
     and article_row.status = 'published'
    where bank_row.matchday_id = p_matchday_id
      and pg_catalog.lower(
            pg_catalog.btrim(bank_row.status)
          ) = 'active'
      and pg_catalog.lower(
            pg_catalog.btrim(bank_row.source_type)
          ) = 'editorial_article'
      and bank_row.automatic_eligible = true
      and bank_row.classification_key is not null
  ),
  entered as (
    select
      classified_row.*,
      (
        select pg_catalog.min(state_row.created_at)
        from public.matchday_editorial_profile_state_items
          as state_row
        where state_row.matchday_id = p_matchday_id
          and pg_catalog.lower(
                pg_catalog.btrim(state_row.source_type)
              ) = classified_row.source_type
          and pg_catalog.lower(
                pg_catalog.btrim(state_row.source_id)
              ) = classified_row.source_id
      ) as entered_at
    from classified as classified_row
  )
  select
    entered_row.source_type,
    entered_row.source_id,
    entered_row.classified_zone_key,
    pg_catalog.row_number() over (
      order by
        entered_row.entered_at asc nulls last,
        entered_row.source_type asc,
        entered_row.source_id asc
    )::integer as actuality_order
  from entered as entered_row
  order by
    actuality_order,
    entered_row.source_type,
    entered_row.source_id;
$function$;


comment on function
  public.matchday_editorial_profile_classification_plan(uuid)
is
  'Compatibility projection of the persisted contextual classification for active automatic editorial_article participations. classified_zone_key is a legacy output name; authority is matchday_editorial_bank_items.classification_key.';


-- Continuidade deixa de percorrer J04/J03/... em cada leitura.
-- A participação de J05 já tem a sua classificação materializada.

create or replace function
public.matchday_editorial_profile_continuity_classification_plan(
  p_matchday_id uuid
)
returns table(
  source_type text,
  source_id text,
  classified_zone_key text
)
language sql
stable
security definer
set search_path = ''
as $function$
  select
    pg_catalog.lower(
      pg_catalog.btrim(bank_row.source_type)
    ) as source_type,
    pg_catalog.lower(
      pg_catalog.btrim(bank_row.source_id)
    ) as source_id,
    bank_row.classification_key as classified_zone_key
  from public.matchday_editorial_bank_items as bank_row
  join public.editorial_articles as article_row
    on article_row.id::text =
      pg_catalog.lower(
        pg_catalog.btrim(bank_row.source_id)
      )
   and article_row.status = 'published'
  join public.matchday_editorial_continuity_transitions
    as transition_row
    on transition_row.target_matchday_id = bank_row.matchday_id
   and transition_row.source_matchday_id =
      bank_row.continuity_source_matchday_id
   and transition_row.source_composition_id =
      bank_row.continuity_source_composition_id
  where bank_row.matchday_id = p_matchday_id
    and pg_catalog.lower(
          pg_catalog.btrim(bank_row.status)
        ) = 'active'
    and pg_catalog.lower(
          pg_catalog.btrim(bank_row.source_type)
        ) = 'editorial_article'
    and bank_row.automatic_eligible = false
    and bank_row.classification_key is not null
  order by
    pg_catalog.lower(
      pg_catalog.btrim(bank_row.source_type)
    ),
    pg_catalog.lower(
      pg_catalog.btrim(bank_row.source_id)
    );
$function$;


comment on function
  public.matchday_editorial_profile_continuity_classification_plan(uuid)
is
  'Compatibility projection of the classification already materialized on continuity bank participations. It no longer uses an ancestor matchday as live semantic authority.';


-- ============================================================
-- 8. TOKEN / CONCORRÊNCIA
--
-- Mantemos a assinatura, wrappers e caches v10.
--
-- O reconcile token passa também a observar:
-- - bank_item.id;
-- - classification_key;
-- - classification_source.
--
-- classified_at fica fora do hash para um write idempotente não
-- criar conflito apenas por timestamp.
-- ============================================================

create or replace function
public.matchday_editorial_profile_reconcile_token_uncached(
  p_matchday_id uuid,
  p_profile_key text
)
returns table(state_token text)
language sql
stable
security definer
set search_path = ''
as $function$
  with classification as materialized (
    select classified_row.*
    from public.matchday_editorial_profile_classification_plan(
      p_matchday_id
    ) as classified_row
  ),
  contextual_classification as materialized (
    select
      bank_row.id as bank_item_id,
      pg_catalog.lower(
        pg_catalog.btrim(bank_row.source_type)
      ) as source_type,
      pg_catalog.lower(
        pg_catalog.btrim(bank_row.source_id)
      ) as source_id,
      bank_row.classification_key,
      bank_row.classification_source
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.matchday_id = p_matchday_id
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.status, ''))
          ) = 'active'
      and pg_catalog.lower(
            pg_catalog.btrim(coalesce(bank_row.source_type, ''))
          ) = 'editorial_article'
  )
  select pg_catalog.md5(
    pg_catalog.jsonb_build_object(
      'assignment', coalesce(
        (
          select pg_catalog.to_jsonb(assignment_row)
          from public.matchday_editorial_profile_assignments
            as assignment_row
          where assignment_row.matchday_id = p_matchday_id
        ),
        'null'::jsonb
      ),

      'classification', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(classified_row)
            order by
              classified_row.source_type,
              classified_row.source_id
          )
          from classification as classified_row
        ),
        '[]'::jsonb
      ),

      'contextual_classification', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(contextual_row)
            order by
              contextual_row.source_type,
              contextual_row.source_id,
              contextual_row.bank_item_id
          )
          from contextual_classification as contextual_row
        ),
        '[]'::jsonb
      ),

      'automatic_state', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(state_row)
            order by
              state_row.source_type,
              state_row.source_id
          )
          from public.matchday_editorial_profile_state_items
            as state_row
          where state_row.matchday_id = p_matchday_id
            and state_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),

      'articles', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(article_row)
            order by article_row.id
          )
          from public.editorial_articles as article_row
          where article_row.id = any(
            array(
              select case
                when classified_row.source_id ~*
                  '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
                then classified_row.source_id::uuid
                else null
              end
              from classification as classified_row
            )
          )
        ),
        '[]'::jsonb
      ),

      'overrides', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(override_row)
            order by
              override_row.source_type,
              override_row.source_id
          )
          from public.matchday_editorial_profile_manual_overrides
            as override_row
          where override_row.matchday_id = p_matchday_id
            and override_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),

      'zone_items', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(zone_row)
            order by
              zone_row.zone_key,
              zone_row.sort_order,
              zone_row.source_id
          )
          from public.matchday_editorial_profile_zone_items
            as zone_row
          where zone_row.matchday_id = p_matchday_id
            and zone_row.profile_key = p_profile_key
        ),
        '[]'::jsonb
      ),

      'control', coalesce(
        (
          select pg_catalog.to_jsonb(control_row)
          from public.matchday_editorial_profile_reconcile_control
            as control_row
          where control_row.matchday_id = p_matchday_id
            and control_row.profile_key = p_profile_key
        ),
        'null'::jsonb
      ),

      'faixa', coalesce(
        (
          select pg_catalog.jsonb_agg(
            pg_catalog.to_jsonb(faixa_row)
            order by
              faixa_row.sort_order,
              faixa_row.id
          )
          from public.matchday_horizontal_news as faixa_row
          where faixa_row.matchday_id = p_matchday_id
        ),
        '[]'::jsonb
      )
    )::text
  ) as state_token;
$function$;


-- ============================================================
-- 9. SEGURANÇA / POSTGREST
-- ============================================================

revoke all on all functions in schema jornada_private
from public, anon, authenticated, service_role;

revoke all on all tables in schema jornada_private
from public, anon, authenticated, service_role;

revoke all on schema jornada_private
from public, anon, authenticated, service_role;

notify pgrst, 'reload schema';

commit;
