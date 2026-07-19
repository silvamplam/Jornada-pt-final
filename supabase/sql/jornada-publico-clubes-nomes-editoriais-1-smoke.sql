-- JORNADA-PUBLICO-CLUBES-NOMES-EDITORIAIS-1
-- SQL 4/4 - SMOKE TRANSACIONAL
--
-- Testa set, no-op, update, clear, rejeicoes e privilegios. O ROLLBACK final
-- garante que nenhum nome publico ou audit event persiste.

begin;

do $smoke$
declare
  v_team public.teams%rowtype;
  v_result_team_id uuid;
  v_result_public_name text;
  v_result_changed boolean;
  v_result_audit_event_id uuid;
  v_audit_count_before bigint;
  v_audit_count_after bigint;
  v_missing_team_id uuid;
  v_manage_oid oid := to_regprocedure('public.manage_team_public_name(uuid,text,text,text,text,text)');
begin
  select t.*
  into v_team
  from public.teams t
  order by t.id
  limit 1;

  if not found then
    raise exception 'smoke_requires_existing_team' using errcode = '55000';
  end if;

  if v_team.public_name is not null then
    raise exception 'smoke_requires_null_original_public_name' using errcode = '55000';
  end if;

  select count(*)
  into v_audit_count_before
  from public.team_public_name_audit_events;

  select
    result_team_id,
    result_public_name,
    result_changed,
    result_audit_event_id
  into
    v_result_team_id,
    v_result_public_name,
    v_result_changed,
    v_result_audit_event_id
  from public.manage_team_public_name(
    v_team.id,
    'Smoke Nome Público A',
    'smoke_test',
    'jornada_sql_smoke',
    'public_name_smoke',
    'team-public-name:smoke:set'
  );

  if v_result_team_id is distinct from v_team.id
     or v_result_public_name is distinct from 'Smoke Nome Público A'
     or not v_result_changed
     or v_result_audit_event_id is null then
    raise exception 'smoke_set_result_unexpected' using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.team_public_name_audit_events a
    where a.id = v_result_audit_event_id
      and a.team_id = v_team.id
      and a.action = 'set'
      and a.before_state @> jsonb_build_object(
        'team_id', v_team.id,
        'name', v_team.name,
        'public_name', null
      )
      and a.after_state @> jsonb_build_object(
        'team_id', v_team.id,
        'name', v_team.name,
        'public_name', 'Smoke Nome Público A'
      )
  ) then
    raise exception 'smoke_set_audit_unexpected' using errcode = '55000';
  end if;

  select
    result_team_id,
    result_public_name,
    result_changed,
    result_audit_event_id
  into
    v_result_team_id,
    v_result_public_name,
    v_result_changed,
    v_result_audit_event_id
  from public.manage_team_public_name(
    v_team.id,
    'Smoke Nome Público A',
    'smoke_test',
    'jornada_sql_smoke',
    'public_name_smoke',
    'team-public-name:smoke:noop'
  );

  if v_result_public_name is distinct from 'Smoke Nome Público A'
     or v_result_changed
     or v_result_audit_event_id is not null then
    raise exception 'smoke_noop_result_unexpected' using errcode = '55000';
  end if;

  select count(*)
  into v_audit_count_after
  from public.team_public_name_audit_events;

  if v_audit_count_after <> v_audit_count_before + 1 then
    raise exception 'smoke_noop_created_audit_event' using errcode = '55000';
  end if;

  select result_public_name, result_changed, result_audit_event_id
  into v_result_public_name, v_result_changed, v_result_audit_event_id
  from public.manage_team_public_name(
    v_team.id,
    'Smoke Nome Público B',
    'smoke_test',
    'jornada_sql_smoke',
    'public_name_smoke',
    'team-public-name:smoke:update'
  );

  if v_result_public_name is distinct from 'Smoke Nome Público B'
     or not v_result_changed
     or v_result_audit_event_id is null
     or not exists (
       select 1
       from public.team_public_name_audit_events a
       where a.id = v_result_audit_event_id
         and a.action = 'update'
     ) then
    raise exception 'smoke_update_unexpected' using errcode = '55000';
  end if;

  select result_public_name, result_changed, result_audit_event_id
  into v_result_public_name, v_result_changed, v_result_audit_event_id
  from public.manage_team_public_name(
    v_team.id,
    '   ',
    'smoke_test',
    'jornada_sql_smoke',
    'public_name_smoke',
    'team-public-name:smoke:clear'
  );

  if v_result_public_name is not null
     or not v_result_changed
     or v_result_audit_event_id is null
     or not exists (
       select 1
       from public.team_public_name_audit_events a
       where a.id = v_result_audit_event_id
         and a.action = 'clear'
         and a.after_state -> 'public_name' = 'null'::jsonb
     ) then
    raise exception 'smoke_clear_unexpected' using errcode = '55000';
  end if;

  if exists (
    select 1
    from public.teams t
    where t.id = v_team.id
      and t.public_name is not null
  ) then
    raise exception 'smoke_clear_did_not_restore_null' using errcode = '55000';
  end if;

  select count(*)
  into v_audit_count_after
  from public.team_public_name_audit_events;

  if v_audit_count_after <> v_audit_count_before + 3 then
    raise exception 'smoke_expected_exactly_three_audit_events' using errcode = '55000';
  end if;

  loop
    v_missing_team_id := gen_random_uuid();
    exit when not exists (select 1 from public.teams t where t.id = v_missing_team_id);
  end loop;

  begin
    perform *
    from public.manage_team_public_name(
      v_missing_team_id,
      'Inexistente',
      'smoke_test',
      'jornada_sql_smoke',
      'public_name_smoke',
      'team-public-name:smoke:missing'
    );
    raise exception 'smoke_missing_team_was_accepted' using errcode = '55000';
  exception
    when sqlstate 'P0002' then
      if sqlerrm <> 'team_public_name_team_not_found' then
        raise;
      end if;
  end;

  begin
    perform *
    from public.manage_team_public_name(
      v_team.id,
      'Inválido',
      'smoke_test',
      'jornada_sql_smoke',
      'public_name_smoke',
      '   '
    );
    raise exception 'smoke_blank_request_reference_was_accepted' using errcode = '55000';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'team_public_name_request_reference_required' then
        raise;
      end if;
  end;

  begin
    perform *
    from public.manage_team_public_name(
      v_team.id,
      repeat('X', 81),
      'smoke_test',
      'jornada_sql_smoke',
      'public_name_smoke',
      'team-public-name:smoke:too-long'
    );
    raise exception 'smoke_81_characters_were_accepted' using errcode = '55000';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'team_public_name_value_invalid' then
        raise;
      end if;
  end;

  begin
    perform *
    from public.manage_team_public_name(
      v_team.id,
      E'Nome\nInválido',
      'smoke_test',
      'jornada_sql_smoke',
      'public_name_smoke',
      'team-public-name:smoke:control'
    );
    raise exception 'smoke_control_character_was_accepted' using errcode = '55000';
  exception
    when sqlstate '22023' then
      if sqlerrm <> 'team_public_name_value_invalid' then
        raise;
      end if;
  end;

  if v_manage_oid is null
     or not has_function_privilege('service_role', v_manage_oid, 'EXECUTE')
     or has_function_privilege('anon', v_manage_oid, 'EXECUTE')
     or has_function_privilege('authenticated', v_manage_oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_manage_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'smoke_manage_rpc_privileges_unexpected' using errcode = '42501';
  end if;

  raise notice 'smoke_passed_for_team_id=%; transaction will be rolled back', v_team.id;
end
$smoke$;

rollback;
