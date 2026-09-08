begin;

-- A completed physical handoff is a durable historical fact. Historical
-- republication validates that fact and the frozen source archive, never the
-- target's current live workspace.
create function
jornada_private.assert_matchday_live_layout_historical_republish_v19(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns void
language plpgsql
stable
security definer
set search_path = ''
as $function$
declare
  v_handoff
    jornada_private.matchday_live_layout_physical_handoffs%rowtype;
begin
  if p_source_matchday_id is null
    or p_target_matchday_id is null
    or p_source_composition_id is null
    or p_source_matchday_id = p_target_matchday_id
  then
    raise exception
      'matchday-live-layout-historical-v19-invalid-envelope';
  end if;

  select handoff_row.*
  into v_handoff
  from jornada_private.matchday_live_layout_physical_handoffs as handoff_row
  where handoff_row.source_matchday_id = p_source_matchday_id
    and handoff_row.target_matchday_id = p_target_matchday_id
    and handoff_row.source_composition_id = p_source_composition_id;

  if not found then
    raise exception
      'matchday-live-layout-historical-v19-certificate-missing';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_topology_transitions
      as topology_row
    where topology_row.id = v_handoff.topology_transition_id
      and topology_row.source_matchday_id = p_source_matchday_id
      and topology_row.target_matchday_id = p_target_matchday_id
      and topology_row.profile_key = v_handoff.profile_key
  ) then
    raise exception
      'matchday-live-layout-historical-v19-topology-certificate-invalid';
  end if;

  if not exists (
    select 1
    from jornada_private.matchday_live_layout_physical_carryovers
      as carryover_row
    where carryover_row.id = v_handoff.carryover_id
      and carryover_row.topology_transition_id =
          v_handoff.topology_transition_id
      and carryover_row.source_matchday_id = p_source_matchday_id
      and carryover_row.target_matchday_id = p_target_matchday_id
      and carryover_row.source_composition_id = p_source_composition_id
      and carryover_row.profile_key = v_handoff.profile_key
      and carryover_row.state_token_after = v_handoff.target_state_token
  ) then
    raise exception
      'matchday-live-layout-historical-v19-carryover-certificate-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_continuity_transitions as transition_row
    where transition_row.source_matchday_id = p_source_matchday_id
      and transition_row.target_matchday_id = p_target_matchday_id
      and transition_row.source_composition_id = p_source_composition_id
      and transition_row.continuity_version = 19
  ) then
    raise exception
      'matchday-live-layout-historical-v19-public-transition-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = p_source_composition_id
      and composition_row.matchday_id = p_source_matchday_id
      and composition_row.status = 'published'
  ) then
    raise exception
      'matchday-live-layout-historical-v19-source-composition-invalid';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as source_desk
    where source_desk.matchday_id = p_source_matchday_id
      and not source_desk.is_managed
      and source_desk.carryover_source_composition_id is null
      and source_desk.carryover_snapshot is null
  ) then
    raise exception
      'matchday-live-layout-historical-v19-source-not-retired';
  end if;

  if jornada_private.matchday_live_layout_physical_archive_hash_v19(
       p_source_matchday_id
     ) is distinct from v_handoff.source_archive_hash
  then
    raise exception
      'matchday-live-layout-historical-v19-source-archive-changed';
  end if;
end;
$function$;

revoke all on function
  jornada_private.assert_matchday_live_layout_historical_republish_v19(
    uuid,
    uuid,
    uuid
  )
from public, anon, authenticated, service_role;

comment on function
  jornada_private.assert_matchday_live_layout_historical_republish_v19(
    uuid,
    uuid,
    uuid
  )
is
  'Validates the immutable v19 certificate chain, retired source desk and frozen source archive for historical republication. It deliberately does not inspect current target live state.';


-- The current entrypoint contains exactly two strong completion assertions,
-- both inside its historical v19 branch. Replace only those calls. The
-- materializer and recovery definitions are not rewritten.
do $patch$
declare
  v_definition text;
  v_fixed text;
  v_old_name constant text :=
    'jornada_private.assert_matchday_live_layout_physical_handoff_complete_v19';
  v_new_name constant text :=
    'jornada_private.assert_matchday_live_layout_historical_republish_v19';
  v_occurrences integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.publish_matchday_reference_composition(uuid,uuid)'
      ::pg_catalog.regprocedure
  )
  into v_definition;

  v_occurrences := (
    pg_catalog.char_length(v_definition)
    - pg_catalog.char_length(
        pg_catalog.replace(v_definition, v_old_name, '')
      )
  ) / pg_catalog.char_length(v_old_name);

  if v_occurrences <> 2 then
    raise exception
      'matchday-live-layout-historical-v19-publish-contract-unexpected:%',
      v_occurrences;
  end if;

  v_fixed := pg_catalog.replace(v_definition, v_old_name, v_new_name);

  if pg_catalog.strpos(v_fixed, v_old_name) <> 0 or (
    (
      pg_catalog.char_length(v_fixed)
      - pg_catalog.char_length(
          pg_catalog.replace(v_fixed, v_new_name, '')
        )
    ) / pg_catalog.char_length(v_new_name)
  ) <> 2 then
    raise exception
      'matchday-live-layout-historical-v19-publish-patch-failed';
  end if;

  execute v_fixed;
end;
$patch$;

revoke all on function
  public.publish_matchday_reference_composition(uuid, uuid)
from public, anon, authenticated, service_role;

grant execute on function
  public.publish_matchday_reference_composition(uuid, uuid)
to service_role;


do $postconditions$
declare
  v_publish_definition text;
  v_core_definition text;
  v_recovery_definition text;
begin
  select pg_catalog.pg_get_functiondef(
    'public.publish_matchday_reference_composition(uuid,uuid)'
      ::pg_catalog.regprocedure
  )
  into v_publish_definition;

  select pg_catalog.pg_get_functiondef(
    'jornada_private.materialize_matchday_live_layout_physical_handoff_v19(uuid,uuid,uuid,text)'
      ::pg_catalog.regprocedure
  )
  into v_core_definition;

  select pg_catalog.pg_get_functiondef(
    'public.recover_matchday_live_layout_continuity(uuid,uuid,uuid)'
      ::pg_catalog.regprocedure
  )
  into v_recovery_definition;

  if pg_catalog.strpos(
       v_publish_definition,
       'assert_matchday_live_layout_physical_handoff_complete_v19'
     ) <> 0
    or pg_catalog.strpos(
       v_publish_definition,
       'assert_matchday_live_layout_historical_republish_v19'
     ) = 0
    or pg_catalog.strpos(
       v_core_definition,
       'assert_matchday_live_layout_physical_handoff_complete_v19'
     ) = 0
    or pg_catalog.strpos(
       v_core_definition,
       'assert_matchday_live_layout_historical_republish_v19'
     ) <> 0
    or pg_catalog.strpos(
       v_recovery_definition,
       'materialize_matchday_live_layout_physical_handoff_v19'
     ) = 0
    or pg_catalog.strpos(
       v_recovery_definition,
       'assert_matchday_live_layout_historical_republish_v19'
     ) <> 0
  then
    raise exception
      'matchday-live-layout-historical-v19-function-boundary-invalid';
  end if;

  if pg_catalog.has_function_privilege(
       'anon',
       'jornada_private.assert_matchday_live_layout_historical_republish_v19(uuid,uuid,uuid)',
       'EXECUTE'
     )
    or pg_catalog.has_function_privilege(
       'authenticated',
       'jornada_private.assert_matchday_live_layout_historical_republish_v19(uuid,uuid,uuid)',
       'EXECUTE'
     )
    or pg_catalog.has_function_privilege(
       'service_role',
       'jornada_private.assert_matchday_live_layout_historical_republish_v19(uuid,uuid,uuid)',
       'EXECUTE'
     )
    or pg_catalog.has_function_privilege(
       'anon',
       'public.publish_matchday_reference_composition(uuid,uuid)',
       'EXECUTE'
     )
    or pg_catalog.has_function_privilege(
       'authenticated',
       'public.publish_matchday_reference_composition(uuid,uuid)',
       'EXECUTE'
     )
    or not pg_catalog.has_function_privilege(
       'service_role',
       'public.publish_matchday_reference_composition(uuid,uuid)',
       'EXECUTE'
     )
  then
    raise exception
      'matchday-live-layout-historical-v19-privileges-invalid';
  end if;
end;
$postconditions$;

notify pgrst, 'reload schema';

commit;
