do $migration$
declare
  v_definition text;
  v_fixed text;
begin
  -- Roundup/resumos s?o conte?do pr?prio da jornada.
  -- V18 continua a transportar Bank, placements, mem?ria, ?ltimas e restantes
  -- superf?cies, mas deixa definitivamente de transportar roundup items.
  select pg_catalog.pg_get_functiondef(
    'jornada_private.materialize_matchday_live_layout_physical_carryover_v18(uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure
  )
  into v_definition;

  v_fixed := v_definition;

  v_fixed := pg_catalog.replace(
    v_fixed,
    '  select pg_catalog.count(*)::integer into v_roundup_count
  from public.matchday_roundup_items as roundup_row
  where roundup_row.matchday_id = p_source_matchday_id;',
    '  v_roundup_count := 0;'
  );

  -- Neutraliza tanto o mapa de UUIDs como a c?pia f?sica dos roundups.
  v_fixed := pg_catalog.replace(
    v_fixed,
    '    from public.matchday_roundup_items as source_row
    where source_row.matchday_id = p_source_matchday_id',
    '    from public.matchday_roundup_items as source_row
    where source_row.matchday_id = p_source_matchday_id
      and false'
  );

  -- Roundup deixa tamb?m de participar na prova de equival?ncia N -> N+1.
  v_fixed := pg_catalog.replace(
    v_fixed,
    '      from public.matchday_roundup_items
      where matchday_id = p_source_matchday_id',
    '      from public.matchday_roundup_items
      where matchday_id = p_source_matchday_id
        and false'
  );

  v_fixed := pg_catalog.replace(
    v_fixed,
    '      from public.matchday_roundup_items
      where matchday_id = p_target_matchday_id',
    '      from public.matchday_roundup_items
      where matchday_id = p_target_matchday_id
        and false'
  );

  if v_fixed = v_definition
     or v_fixed not like '%v_roundup_count := 0;%'
     or v_fixed not like '%source_row.matchday_id = p_source_matchday_id
      and false%'
  then
    raise exception 'matchday-roundup-context-v28-carryover-patch-failed';
  end if;

  execute v_fixed;

  -- V19 n?o pode exigir que os v?deos de N sejam id?nticos aos de N+1.
  select pg_catalog.pg_get_functiondef(
    'jornada_private.assert_matchday_live_layout_physical_handoff_ready_v19(uuid,uuid,uuid,uuid,uuid)'::pg_catalog.regprocedure
  )
  into v_definition;

  v_fixed := v_definition;

  v_fixed := pg_catalog.replace(
    v_fixed,
    '    from public.matchday_roundup_items as roundup_row
    where roundup_row.matchday_id = p_target_matchday_id',
    '    from public.matchday_roundup_items as roundup_row
    where roundup_row.matchday_id = p_target_matchday_id
      and false'
  );

  v_fixed := pg_catalog.replace(
    v_fixed,
    '      from public.matchday_roundup_items
      where matchday_id = p_source_matchday_id',
    '      from public.matchday_roundup_items
      where matchday_id = p_source_matchday_id
        and false'
  );

  v_fixed := pg_catalog.replace(
    v_fixed,
    '      from public.matchday_roundup_items
      where matchday_id = p_target_matchday_id',
    '      from public.matchday_roundup_items
      where matchday_id = p_target_matchday_id
        and false'
  );

  if v_fixed = v_definition
     or v_fixed not like '%roundup_row.matchday_id = p_target_matchday_id
      and false%'
  then
    raise exception 'matchday-roundup-context-v28-handoff-patch-failed';
  end if;

  execute v_fixed;
end;
$migration$;

create or replace function
jornada_private.guard_matchday_roundup_context_v28()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.match_id is not null
    and not exists (
      select 1
      from public.matches as match_row
      where match_row.id = new.match_id
        and match_row.matchday_id = new.matchday_id
    )
  then
    raise exception 'matchday-roundup-match-context-mismatch';
  end if;

  if new.source_candidate_id is not null
    and not exists (
      select 1
      from public.match_video_summary_candidates as candidate_row
      where candidate_row.id = new.source_candidate_id
        and candidate_row.matchday_id = new.matchday_id
    )
  then
    raise exception 'matchday-roundup-candidate-context-mismatch';
  end if;

  return new;
end;
$function$;

revoke all on function
  jornada_private.guard_matchday_roundup_context_v28()
from public, anon, authenticated, service_role;

drop trigger if exists
  matchday_roundup_context_v28
on public.matchday_roundup_items;

create trigger matchday_roundup_context_v28
before insert or update of matchday_id, match_id, source_candidate_id
on public.matchday_roundup_items
for each row
execute function
  jornada_private.guard_matchday_roundup_context_v28();

-- Limpeza gen?rica. S? elimina um roundup quando a rela??o que ele declara
-- com jogo ou candidato pertence objetivamente a outra jornada.
delete from public.matchday_roundup_items as roundup_row
where (
  roundup_row.match_id is not null
  and not exists (
    select 1
    from public.matches as match_row
    where match_row.id = roundup_row.match_id
      and match_row.matchday_id = roundup_row.matchday_id
  )
) or (
  roundup_row.source_candidate_id is not null
  and not exists (
    select 1
    from public.match_video_summary_candidates as candidate_row
    where candidate_row.id = roundup_row.source_candidate_id
      and candidate_row.matchday_id = roundup_row.matchday_id
  )
);

-- O certificado passa a declarar corretamente que roundup n?o ? carryover.
update jornada_private.matchday_live_layout_physical_carryovers
set inherited_roundup_count = 0
where inherited_roundup_count <> 0;

comment on function
  jornada_private.guard_matchday_roundup_context_v28()
is
  'Impede que um resumo associado a jogo ou candidato seja armazenado noutra jornada. Roundup ? conte?do contextual da pr?pria jornada e n?o participa no handoff N para N+1.';
