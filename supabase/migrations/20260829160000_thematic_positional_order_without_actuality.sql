begin;

alter function public.matchday_editorial_profile_classification_plan(uuid)
rename to matchday_editorial_profile_classification_plan_actuality_v1;

comment on function
  public.matchday_editorial_profile_classification_plan_actuality_v1(uuid)
is
  'Implementação histórica preservada apenas como classificador de destino. A ordem cronológica devolvida por esta função deixa de comandar a Mesa.';

create function public.matchday_editorial_profile_classification_plan(
  p_matchday_id uuid
)
returns table (
  source_type text,
  source_id text,
  classified_zone_key text,
  actuality_order integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  with classified as (
    select
      previous_row.source_type,
      previous_row.source_id,
      previous_row.classified_zone_key
    from public.matchday_editorial_profile_classification_plan_actuality_v1(
      p_matchday_id
    ) as previous_row
  ),
  entered as (
    select
      classified_row.*,
      (
        select pg_catalog.min(
          state_row.created_at
        )
        from public.matchday_editorial_profile_state_items as state_row
        where state_row.matchday_id = p_matchday_id
          and pg_catalog.lower(
            pg_catalog.btrim(state_row.source_type)
          ) = classified_row.source_type
          and pg_catalog.lower(
            pg_catalog.btrim(state_row.source_id)
          ) = pg_catalog.lower(
            pg_catalog.btrim(classified_row.source_id)
          )
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

revoke all on function
  public.matchday_editorial_profile_classification_plan(uuid)
from public, anon, authenticated;

grant execute on function
  public.matchday_editorial_profile_classification_plan(uuid)
to service_role;

comment on function
  public.matchday_editorial_profile_classification_plan(uuid)
is
  'Classifica o destino temático. A coluna actuality_order é mantida por compatibilidade da API, mas representa a sequência global estável de entrada no estado da Mesa por state_items.created_at; não usa datas editoriais para ordenar a Mesa.';

create or replace function public.matchday_editorial_profile_distribution_plan(
  p_matchday_id uuid
)
returns table (
  source_type text,
  source_id text,
  zone_key text,
  sort_order integer
)
language sql
stable
security definer
set search_path to ''
as $function$
  with capacities(zone_key, capacity) as (
    values
      ('benfica'::text, 6),
      ('sporting'::text, 5),
      ('fc_porto'::text, 5),
      ('other_liga_clubs'::text, 6),
      ('outside_liga_other'::text, 5)
  ),
  classified as (
    select
      classification_row.source_type,
      classification_row.source_id,
      classification_row.classified_zone_key,
      classification_row.actuality_order,
      capacity_row.capacity
    from public.matchday_editorial_profile_classification_plan(
      p_matchday_id
    ) as classification_row
    join capacities as capacity_row
      on capacity_row.zone_key =
        classification_row.classified_zone_key
  ),
  ranked as (
    select
      classified_row.*,
      pg_catalog.row_number() over (
        partition by classified_row.classified_zone_key
        order by
          classified_row.actuality_order,
          classified_row.source_type,
          classified_row.source_id
      )::integer as zone_order
    from classified as classified_row
  )
  select
    ranked_row.source_type,
    ranked_row.source_id,
    case
      when ranked_row.zone_order <=
        ranked_row.capacity
      then ranked_row.classified_zone_key
      else null
    end as zone_key,
    case
      when ranked_row.zone_order <=
        ranked_row.capacity
      then ranked_row.zone_order
      else null
    end as sort_order
  from ranked as ranked_row;
$function$;

comment on function
  public.matchday_editorial_profile_distribution_plan(uuid)
is
  'Materializa a classificação temática pela ordem estável de entrada no circuito. A data de publicação deixou de decidir posições de Zona ou Faixa.';

comment on column
  public.matchday_editorial_profile_state_items.sort_order
is
  'Posição automática estável dentro da zona. Não representa atualidade cronológica.';

commit;
