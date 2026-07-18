-- JORNADA-BACKOFFICE-CLUBES-ALIASES-AUDITAVEIS-SCHEMA-RPC-1
-- SQL 4/4 - SMOKE TRANSACIONAL
--
-- Todos os dados de teste, incluindo os audit events, sao revertidos pelo
-- ROLLBACK final. Executar apenas depois de APLICAR e POSTFLIGHT.

begin;

do $smoke$
declare
  v_team_a uuid;
  v_team_b uuid;
  v_canonical_alias text;
  v_create_alias text := 'Smoke alias ' || replace(gen_random_uuid()::text, '-', '');
  v_update_alias text := 'Smoke updated alias ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_id uuid;
  v_result record;
  v_count bigint;
  v_blocked boolean;
  v_error text;
begin
  -- Escolhe uma identidade canonica de outro clube que nao esteja ja ocupada
  -- em team_aliases e que nao coincida com uma identidade do clube alvo.
  select target.id, other_team.id, identity_value.field_value
  into v_team_a, v_team_b, v_canonical_alias
  from public.teams target
  join public.teams other_team on other_team.id <> target.id
  cross join lateral (
    values
      (other_team.name),
      (other_team.short_name),
      (other_team.slug),
      (other_team.code)
  ) identity_value(field_value)
  where identity_value.field_value is not null
    and public.normalize_team_identity_v1(identity_value.field_value) <> ''
    and not exists (
      select 1
      from public.team_aliases a
      where a.normalized_alias =
        public.normalize_team_identity_v1(identity_value.field_value)
    )
    and not exists (
      select 1
      from (values
        (target.name),
        (target.short_name),
        (target.slug),
        (target.code)
      ) target_identity(field_value)
      where public.normalize_team_identity_v1(target_identity.field_value) =
        public.normalize_team_identity_v1(identity_value.field_value)
    )
  order by target.id, other_team.id, identity_value.field_value
  limit 1;

  if v_team_a is null or v_team_b is null or v_canonical_alias is null then
    raise exception 'smoke_requires_two_teams_and_an_available_cross_team_canonical_identity'
      using errcode = '55000';
  end if;

  -- CREATE valido: uma linha e exatamente um audit event.
  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'create',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_id => v_team_a,
    p_alias => v_create_alias,
    p_request_reference => 'smoke-create'
  );

  if not v_result.result_changed
     or v_result.result_code <> 'created'
     or v_result.result_team_id <> v_team_a
     or v_result.result_status <> 'active'
     or v_result.result_normalized_alias <>
       public.normalize_team_identity_v1(v_create_alias) then
    raise exception 'smoke_create_result_unexpected' using errcode = '55000';
  end if;

  v_alias_id := v_result.result_team_alias_id;

  select count(*) into v_count
  from public.team_alias_audit_events e
  where e.team_alias_id = v_alias_id;

  if v_count <> 1 then
    raise exception 'smoke_create_expected_1_audit_event_observed_%', v_count
      using errcode = '55000';
  end if;

  -- CREATE repetido para o mesmo clube e chave e idempotente.
  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'create',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_id => v_team_a,
    p_alias => v_create_alias,
    p_request_reference => 'smoke-create-repeat'
  );

  if v_result.result_changed
     or v_result.result_code <> 'noop_existing_active'
     or v_result.result_team_alias_id <> v_alias_id then
    raise exception 'smoke_repeated_create_not_idempotent' using errcode = '55000';
  end if;

  select count(*) into v_count
  from public.team_alias_audit_events e
  where e.team_alias_id = v_alias_id;

  if v_count <> 1 then
    raise exception 'smoke_repeated_create_created_audit_event'
      using errcode = '55000';
  end if;

  -- A mesma normalized_alias nao pode ser criada para outro clube.
  v_blocked := false;
  begin
    perform 1
    from public.manage_team_alias(
      p_action => 'create',
      p_actor_type => 'smoke_test',
      p_actor_reference => 'smoke_actor',
      p_source => 'smoke',
      p_team_id => v_team_b,
      p_alias => v_create_alias,
      p_request_reference => 'smoke-alias-conflict'
    );
  exception
    when unique_violation then
      v_error := sqlerrm;
      if position('team_alias_conflict_alias_other_team' in v_error) = 0 then
        raise;
      end if;
      v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'smoke_cross_team_alias_collision_not_blocked'
      using errcode = '55000';
  end if;

  -- Uma identidade canonica de outro clube tambem bloqueia a criacao.
  v_blocked := false;
  begin
    perform 1
    from public.manage_team_alias(
      p_action => 'create',
      p_actor_type => 'smoke_test',
      p_actor_reference => 'smoke_actor',
      p_source => 'smoke',
      p_team_id => v_team_a,
      p_alias => v_canonical_alias,
      p_request_reference => 'smoke-canonical-conflict'
    );
  exception
    when unique_violation then
      v_error := sqlerrm;
      if position('team_alias_conflict_canonical_other_team' in v_error) = 0 then
        raise;
      end if;
      v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'smoke_cross_team_canonical_collision_not_blocked'
      using errcode = '55000';
  end if;

  -- UPDATE valido conserva id e team_id e cria um unico evento.
  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'update',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_alias_id => v_alias_id,
    p_team_id => v_team_a,
    p_alias => v_update_alias,
    p_request_reference => 'smoke-update'
  );

  if not v_result.result_changed
     or v_result.result_code <> 'updated'
     or v_result.result_team_alias_id <> v_alias_id
     or v_result.result_team_id <> v_team_a
     or v_result.result_normalized_alias <>
       public.normalize_team_identity_v1(v_update_alias) then
    raise exception 'smoke_update_result_unexpected' using errcode = '55000';
  end if;

  -- UPDATE repetido sem alteracao e no-op e nao audita.
  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'update',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_alias_id => v_alias_id,
    p_alias => v_update_alias,
    p_request_reference => 'smoke-update-repeat'
  );

  if v_result.result_changed or v_result.result_code <> 'noop_unchanged' then
    raise exception 'smoke_repeated_update_not_idempotent' using errcode = '55000';
  end if;

  -- DEACTIVATE efetivo seguido de DEACTIVATE idempotente.
  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'deactivate',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_alias_id => v_alias_id,
    p_request_reference => 'smoke-deactivate'
  );

  if not v_result.result_changed
     or v_result.result_code <> 'deactivated'
     or v_result.result_status <> 'inactive' then
    raise exception 'smoke_deactivate_result_unexpected' using errcode = '55000';
  end if;

  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'deactivate',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_alias_id => v_alias_id,
    p_request_reference => 'smoke-deactivate-repeat'
  );

  if v_result.result_changed
     or v_result.result_code <> 'noop_already_inactive' then
    raise exception 'smoke_repeated_deactivate_not_idempotent'
      using errcode = '55000';
  end if;

  -- REACTIVATE efetivo seguido de REACTIVATE idempotente.
  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'reactivate',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_alias_id => v_alias_id,
    p_request_reference => 'smoke-reactivate'
  );

  if not v_result.result_changed
     or v_result.result_code <> 'reactivated'
     or v_result.result_status <> 'active' then
    raise exception 'smoke_reactivate_result_unexpected' using errcode = '55000';
  end if;

  select *
  into strict v_result
  from public.manage_team_alias(
    p_action => 'reactivate',
    p_actor_type => 'smoke_test',
    p_actor_reference => 'smoke_actor',
    p_source => 'smoke',
    p_team_alias_id => v_alias_id,
    p_request_reference => 'smoke-reactivate-repeat'
  );

  if v_result.result_changed
     or v_result.result_code <> 'noop_already_active' then
    raise exception 'smoke_repeated_reactivate_not_idempotent'
      using errcode = '55000';
  end if;

  -- A RPC nao oferece DELETE.
  v_blocked := false;
  begin
    perform 1
    from public.manage_team_alias(
      p_action => 'delete',
      p_actor_type => 'smoke_test',
      p_actor_reference => 'smoke_actor',
      p_source => 'smoke',
      p_team_alias_id => v_alias_id,
      p_request_reference => 'smoke-delete'
    );
  exception
    when invalid_parameter_value then
      v_error := sqlerrm;
      if position('team_alias_action_invalid' in v_error) = 0 then
        raise;
      end if;
      v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'smoke_delete_action_not_blocked' using errcode = '55000';
  end if;

  -- Um id existente nunca pode ser reatribuido a outro team_id.
  v_blocked := false;
  begin
    perform 1
    from public.manage_team_alias(
      p_action => 'update',
      p_actor_type => 'smoke_test',
      p_actor_reference => 'smoke_actor',
      p_source => 'smoke',
      p_team_alias_id => v_alias_id,
      p_team_id => v_team_b,
      p_alias => v_update_alias,
      p_request_reference => 'smoke-reassignment'
    );
  exception
    when sqlstate '23001' then
      v_error := sqlerrm;
      if position('team_alias_reassignment_forbidden' in v_error) = 0 then
        raise;
      end if;
      v_blocked := true;
  end;

  if not v_blocked then
    raise exception 'smoke_team_alias_reassignment_not_blocked'
      using errcode = '55000';
  end if;

  select count(*) into v_count
  from public.team_alias_audit_events e
  where e.team_alias_id = v_alias_id;

  if v_count <> 4 then
    raise exception 'smoke_expected_4_effective_mutations_and_events_observed_%', v_count
      using errcode = '55000';
  end if;

  if (
    select count(distinct e.action)
    from public.team_alias_audit_events e
    where e.team_alias_id = v_alias_id
  ) <> 4 or exists (
    select e.action
    from public.team_alias_audit_events e
    where e.team_alias_id = v_alias_id
    group by e.action
    having count(*) <> 1
  ) then
    raise exception 'smoke_expected_exactly_one_event_per_mutation'
      using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.team_alias_audit_events e
    where e.team_alias_id = v_alias_id
      and (
        e.actor_type <> 'smoke_test'
        or e.actor_reference <> 'smoke_actor'
        or e.source <> 'smoke'
        or e.after_state is null
        or (e.action = 'create' and e.before_state is not null)
        or (e.action <> 'create' and e.before_state is null)
      )
  ) then
    raise exception 'smoke_audit_payload_unexpected' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.team_alias_audit_events e
    where e.team_alias_id = v_alias_id
      and e.action = 'update'
      and e.before_state ->> 'alias' = btrim(v_create_alias)
      and e.after_state ->> 'alias' = btrim(v_update_alias)
  ) or not exists (
    select 1
    from public.team_alias_audit_events e
    where e.team_alias_id = v_alias_id
      and e.action = 'deactivate'
      and e.before_state ->> 'status' = 'active'
      and e.after_state ->> 'status' = 'inactive'
  ) or not exists (
    select 1
    from public.team_alias_audit_events e
    where e.team_alias_id = v_alias_id
      and e.action = 'reactivate'
      and e.before_state ->> 'status' = 'inactive'
      and e.after_state ->> 'status' = 'active'
  ) then
    raise exception 'smoke_audit_before_after_state_unexpected'
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.team_aliases a
    where a.id = v_alias_id
      and a.team_id = v_team_a
      and a.alias = btrim(v_update_alias)
      and a.status = 'active'
  ) then
    raise exception 'smoke_final_alias_state_unexpected' using errcode = '55000';
  end if;

  raise notice 'smoke_ok: create/update/deactivate/reactivate, no-ops, conflicts, no delete, no reassignment and 4 audit events verified; rollback follows';
end
$smoke$;

rollback;
