begin;

-- LOTE 7D
-- Correcao manual da classificacao contextual.
-- Nao altera placements editoriais nem Agenda/TV.

create or replace function
public.apply_matchday_editorial_bank_manual_classification_v1(
  p_matchday_id uuid,
  p_bank_item_id uuid,
  p_classification_key text
)
returns table(
  bank_item_id uuid,
  classification_key text,
  classification_source text,
  classified_at timestamptz
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_bank record;
  v_changed boolean;
begin
  if p_matchday_id is null
    or p_bank_item_id is null
    or p_classification_key is null
  then
    raise exception
      'contextual-classification-manual-invalid-input';
  end if;

  if p_classification_key not in (
    'benfica',
    'sporting',
    'fc_porto',
    'other_liga_clubs',
    'outside_liga_other'
  )
  then
    raise exception
      'contextual-classification-manual-invalid-key:%',
      p_classification_key;
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as control_row
    where control_row.matchday_id = p_matchday_id
      and control_row.is_managed = true
  )
  then
    raise exception
      'contextual-classification-manual-not-live';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_profile_assignments as assignment_row
    where assignment_row.matchday_id = p_matchday_id
      and assignment_row.profile_key = 'liga_portugal_v1'
  )
  then
    raise exception
      'contextual-classification-manual-profile-not-supported';
  end if;

  select bank_row.*
  into v_bank
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = p_bank_item_id
  for update;

  if not found then
    raise exception
      'contextual-classification-manual-bank-item-not-found';
  end if;

  if v_bank.matchday_id is distinct from p_matchday_id then
    raise exception
      'contextual-classification-manual-matchday-mismatch';
  end if;

  if pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_bank.status, ''))
     ) <> 'active'
  then
    raise exception
      'contextual-classification-manual-bank-item-inactive';
  end if;

  if pg_catalog.lower(
       pg_catalog.btrim(coalesce(v_bank.source_type, ''))
     ) <> 'editorial_article'
  then
    raise exception
      'contextual-classification-manual-non-article';
  end if;

  v_changed :=
    v_bank.classification_key
      is distinct from p_classification_key
    or v_bank.classification_source
      is distinct from 'manual';

  if v_changed then
    perform
      jornada_private
        .authorize_matchday_editorial_bank_classification_writes(
          array[p_bank_item_id]
        );

    begin
      update public.matchday_editorial_bank_items as bank_row
      set
        classification_key = p_classification_key,
        classification_source = 'manual',
        classified_at = pg_catalog.statement_timestamp()
      where bank_row.id = p_bank_item_id;

      perform
        jornada_private
          .revoke_matchday_editorial_bank_classification_writes(
            array[p_bank_item_id]
          );
    exception
      when others then
        perform
          jornada_private
            .revoke_matchday_editorial_bank_classification_writes(
              array[p_bank_item_id]
            );
        raise;
    end;

    perform
      public.refresh_matchday_editorial_profile_distribution(
        p_matchday_id
      );
  end if;

  return query
  select
    bank_row.id,
    bank_row.classification_key,
    bank_row.classification_source,
    bank_row.classified_at
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = p_bank_item_id;
end;
$function$;

revoke all
on function
public.apply_matchday_editorial_bank_manual_classification_v1(
  uuid,
  uuid,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function
public.apply_matchday_editorial_bank_manual_classification_v1(
  uuid,
  uuid,
  text
)
to service_role;

comment on function
public.apply_matchday_editorial_bank_manual_classification_v1(
  uuid,
  uuid,
  text
)
is
  'Corrige a classificacao contextual de uma participacao ativa. Nao altera placements editoriais.';

commit;