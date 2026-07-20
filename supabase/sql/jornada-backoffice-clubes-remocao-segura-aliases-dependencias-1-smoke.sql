-- Jornada.pt - smoke transacional da remocao segura de clubes.
-- Todos os dados sao sinteticos e toda a operacao termina obrigatoriamente em ROLLBACK.

begin;

do $smoke$
declare
  v_prefix text := 'smoke-team-safe-deletion-' ||
    pg_catalog.replace(gen_random_uuid()::text, '-', '');
  v_country_id uuid := gen_random_uuid();
  v_competition_id uuid := gen_random_uuid();
  v_season_id uuid := gen_random_uuid();
  v_standing_id uuid := gen_random_uuid();
  v_support_home_id uuid := gen_random_uuid();
  v_support_away_id uuid := gen_random_uuid();
  v_removable_team_id uuid := gen_random_uuid();
  v_active_only_team_id uuid := gen_random_uuid();
  v_inactive_only_team_id uuid := gen_random_uuid();
  v_alias_team_id uuid := gen_random_uuid();
  v_stale_team_id uuid := gen_random_uuid();
  v_action_team_id uuid := gen_random_uuid();
  v_rollback_team_id uuid := gen_random_uuid();
  v_season_team_id uuid := gen_random_uuid();
  v_home_team_id uuid := gen_random_uuid();
  v_away_team_id uuid := gen_random_uuid();
  v_standing_team_id uuid := gen_random_uuid();
  v_goal_team_id uuid := gen_random_uuid();
  v_player_team_id uuid := gen_random_uuid();
  v_event_team_id uuid := gen_random_uuid();
  v_multi_team_id uuid := gen_random_uuid();
  v_home_match_id uuid := gen_random_uuid();
  v_away_match_id uuid := gen_random_uuid();
  v_neutral_match_id uuid := gen_random_uuid();
  v_active_alias_id uuid;
  v_inactive_alias_id uuid := gen_random_uuid();
  v_active_only_alias_id uuid := gen_random_uuid();
  v_inactive_only_alias_id uuid := gen_random_uuid();
  v_rollback_alias_id uuid := gen_random_uuid();
  v_public_audit_id uuid;
  v_public_before_state jsonb;
  v_public_after_state jsonb;
  v_alias_audit_snapshot jsonb;
  v_result jsonb;
  v_preview jsonb;
  v_fingerprint text;
  v_request_reference text;
  v_deletion_audit_id uuid;
  v_failed boolean;
  v_rpc_oid oid := to_regprocedure(
    'public.manage_team_safe_deletion(uuid,boolean,text,text,text,text,text,text)'
  );
begin
  insert into public.countries (id, name, slug)
  values (
    v_country_id,
    'Pais sintetico para remocao segura',
    v_prefix || '-country'
  );

  insert into public.competitions (id, name, slug, country_id)
  values (
    v_competition_id,
    'Competicao sintetica para remocao segura',
    v_prefix || '-competition',
    v_country_id
  );

  insert into public.seasons (id, competition_id, label)
  values (v_season_id, v_competition_id, '2099/2100');

  insert into public.teams (
    id,
    name,
    public_name,
    short_name,
    code,
    slug,
    country_id
  ) values
    (v_support_home_id, 'Clube suporte casa ' || v_prefix, null, 'SCH', null, v_prefix || '-support-home', v_country_id),
    (v_support_away_id, 'Clube suporte fora ' || v_prefix, null, 'SCA', null, v_prefix || '-support-away', v_country_id),
    (v_removable_team_id, 'Clube removivel ' || v_prefix, null, 'REM', 'REM', v_prefix || '-removable', v_country_id),
    (v_active_only_team_id, 'Clube alias ativo ' || v_prefix, null, 'AAO', null, v_prefix || '-active-only', v_country_id),
    (v_inactive_only_team_id, 'Clube alias inativo ' || v_prefix, null, 'AIO', null, v_prefix || '-inactive-only', v_country_id),
    (v_alias_team_id, 'Clube com aliases ' || v_prefix, null, 'ALS', null, v_prefix || '-aliases', v_country_id),
    (v_stale_team_id, 'Clube preview stale ' || v_prefix, null, 'STL', null, v_prefix || '-stale', v_country_id),
    (v_action_team_id, 'Clube acao divergente ' || v_prefix, null, 'ACT', null, v_prefix || '-action', v_country_id),
    (v_rollback_team_id, 'Clube rollback ' || v_prefix, null, 'RBK', null, v_prefix || '-rollback', v_country_id),
    (v_season_team_id, 'Clube participante ' || v_prefix, null, 'SEA', null, v_prefix || '-season', v_country_id),
    (v_home_team_id, 'Clube jogo casa ' || v_prefix, null, 'HOM', null, v_prefix || '-home', v_country_id),
    (v_away_team_id, 'Clube jogo fora ' || v_prefix, null, 'AWY', null, v_prefix || '-away', v_country_id),
    (v_standing_team_id, 'Clube classificacao ' || v_prefix, null, 'STD', null, v_prefix || '-standing', v_country_id),
    (v_goal_team_id, 'Clube golo ' || v_prefix, null, 'GOL', null, v_prefix || '-goal', v_country_id),
    (v_player_team_id, 'Clube jogador ' || v_prefix, null, 'PLY', null, v_prefix || '-player', v_country_id),
    (v_event_team_id, 'Clube evento ' || v_prefix, null, 'EVT', null, v_prefix || '-event', v_country_id),
    (v_multi_team_id, 'Clube dependencias multiplas ' || v_prefix, null, 'MUL', null, v_prefix || '-multi', v_country_id);

  -- A FK auditavel ja e anulavel; o RPC continua a criar auditoria ligada
  -- ao clube vivo e a preservar os dois snapshots.
  select result_audit_event_id
  into v_public_audit_id
  from public.manage_team_public_name(
    v_removable_team_id,
    'Clube removivel',
    'smoke',
    v_prefix,
    'team_safe_deletion_smoke',
    v_prefix || ':public-name'
  );

  select e.before_state, e.after_state
  into v_public_before_state, v_public_after_state
  from public.team_public_name_audit_events e
  where e.id = v_public_audit_id
    and e.team_id = v_removable_team_id;

  if v_public_audit_id is null
     or v_public_before_state is null
     or v_public_after_state is null
     or v_public_before_state ->> 'team_id' <> v_removable_team_id::text
     or v_public_after_state ->> 'team_id' <> v_removable_team_id::text
     or v_public_after_state ->> 'public_name' <> 'Clube removivel' then
    raise exception 'smoke_manage_team_public_name_audit_failed';
  end if;

  insert into public.team_aliases (
    id,
    team_id,
    alias,
    normalized_alias,
    source,
    status,
    updated_at,
    created_by,
    updated_by
  ) values
    (
      v_active_only_alias_id,
      v_active_only_team_id,
      'Alias unico ativo ' || v_prefix,
      public.normalize_team_identity_v1('Alias unico ativo ' || v_prefix),
      'team_safe_deletion_smoke',
      'active',
      pg_catalog.now(),
      'smoke',
      'smoke'
    ),
    (
      v_inactive_only_alias_id,
      v_inactive_only_team_id,
      'Alias unico inativo ' || v_prefix,
      public.normalize_team_identity_v1('Alias unico inativo ' || v_prefix),
      'team_safe_deletion_smoke',
      'inactive',
      pg_catalog.now(),
      'smoke',
      'smoke'
    ),
    (
      v_inactive_alias_id,
      v_alias_team_id,
      'Alias inativo ' || v_prefix,
      public.normalize_team_identity_v1('Alias inativo ' || v_prefix),
      'team_safe_deletion_smoke',
      'inactive',
      pg_catalog.now(),
      'smoke',
      'smoke'
    ),
    (
      v_rollback_alias_id,
      v_rollback_team_id,
      'Alias rollback ' || v_prefix,
      public.normalize_team_identity_v1('Alias rollback ' || v_prefix),
      'team_safe_deletion_smoke',
      'active',
      pg_catalog.now(),
      'smoke',
      'smoke'
    );

  insert into public.team_alias_audit_events (
    team_alias_id,
    action,
    actor_type,
    actor_reference,
    source,
    before_state,
    after_state,
    request_reference
  )
  select
    a.id,
    'create',
    'smoke',
    v_prefix,
    'team_safe_deletion_smoke',
    null,
    pg_catalog.to_jsonb(a),
    v_prefix || ':alias:' || a.id::text
  from public.team_aliases a
  where a.id in (
    v_active_only_alias_id,
    v_inactive_only_alias_id,
    v_inactive_alias_id,
    v_rollback_alias_id
  );

  -- O RPC de aliases continua a criar um evento ligado ao alias vivo depois
  -- de team_alias_audit_events.team_alias_id se tornar anulavel.
  select result_team_alias_id
  into v_active_alias_id
  from public.manage_team_alias(
    'create',
    'smoke',
    v_prefix,
    'team_safe_deletion_smoke',
    null,
    v_alias_team_id,
    'Alias ativo ' || v_prefix,
    v_prefix || ':alias-rpc'
  );

  if v_active_alias_id is null
     or not exists (
       select 1
       from public.team_alias_audit_events e
       where e.team_alias_id = v_active_alias_id
         and e.before_state is null
         and e.after_state ->> 'id' = v_active_alias_id::text
         and e.after_state ->> 'team_id' = v_alias_team_id::text
         and e.after_state ->> 'alias' = 'Alias ativo ' || v_prefix
     ) then
    raise exception 'smoke_manage_team_alias_audit_failed';
  end if;

  select pg_catalog.jsonb_agg(
    pg_catalog.jsonb_build_object(
      'id', e.id,
      'before_state', e.before_state,
      'after_state', e.after_state
    ) order by e.id
  )
  into v_alias_audit_snapshot
  from public.team_alias_audit_events e
  join public.team_aliases a on a.id = e.team_alias_id
  where a.team_id = v_alias_team_id;

  -- Clube inexistente devolve o erro estavel team_not_found.
  v_failed := false;
  begin
    perform public.manage_team_safe_deletion(
      gen_random_uuid(), false, null, null, null, null, null, null
    );
  exception
    when no_data_found then
      v_failed := sqlerrm = 'team_not_found';
  end;
  if not v_failed then
    raise exception 'smoke_team_not_found_not_enforced';
  end if;

  -- Clube sem dependencias, mas com auditoria de nome publico preservavel.
  v_preview := public.manage_team_safe_deletion(
    v_removable_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'removable'
     or v_preview ->> 'proposed_action' <> 'delete_team'
     or (v_preview ->> 'can_delete')::boolean is not true
     or (v_preview ->> 'public_name_audit_count')::integer <> 1
     or v_preview ->> 'contract_version' <> 'v1'
     or v_preview ->> 'preview_fingerprint' !~ '^v1:[0-9a-f]{32}$' then
    raise exception 'smoke_removable_preview_invalid: %', v_preview;
  end if;

  v_fingerprint := v_preview ->> 'preview_fingerprint';
  v_request_reference := v_prefix || ':delete-removable';
  v_result := public.manage_team_safe_deletion(
    v_removable_team_id,
    true,
    v_fingerprint,
    'delete_team',
    'admin_session',
    'smoke_admin',
    'team_safe_deletion_smoke',
    v_request_reference
  );
  if (v_result ->> 'applied')::boolean is not true
     or v_result ->> 'deleted_team_id' <> v_removable_team_id::text
     or (v_result ->> 'aliases_deleted_count')::integer <> 0
     or exists (select 1 from public.teams t where t.id = v_removable_team_id)
     or not exists (
       select 1
       from public.team_public_name_audit_events e
       where e.id = v_public_audit_id
         and e.team_id is null
         and e.before_state is not distinct from v_public_before_state
         and e.after_state is not distinct from v_public_after_state
     ) then
    raise exception 'smoke_delete_team_or_public_audit_preservation_failed: %', v_result;
  end if;

  v_deletion_audit_id := (v_result ->> 'deletion_audit_event_id')::uuid;
  if not exists (
    select 1
    from public.team_deletion_audit_events e
    where e.id = v_deletion_audit_id
      and e.deleted_team_id = v_removable_team_id
      and e.confirmed_action = 'delete_team'
      and e.team_snapshot ->> 'id' = v_removable_team_id::text
  ) then
    raise exception 'smoke_deletion_audit_missing';
  end if;

  v_failed := false;
  begin
    update public.team_deletion_audit_events
    set source = 'forbidden'
    where id = v_deletion_audit_id;
  exception
    when sqlstate '55000' then
      v_failed := sqlerrm = 'team_deletion_audit_events_immutable';
  end;
  if not v_failed then
    raise exception 'smoke_deletion_audit_update_not_blocked';
  end if;

  v_failed := false;
  begin
    delete from public.team_deletion_audit_events
    where id = v_deletion_audit_id;
  exception
    when sqlstate '55000' then
      v_failed := sqlerrm = 'team_deletion_audit_events_immutable';
  end;
  if not v_failed then
    raise exception 'smoke_deletion_audit_delete_not_blocked';
  end if;

  -- Uma segunda tentativa e um erro estavel, sem novo evento.
  v_failed := false;
  begin
    perform public.manage_team_safe_deletion(
      v_removable_team_id, false, null, null, null, null, null, null
    );
  exception
    when no_data_found then
      v_failed := sqlerrm = 'team_not_found';
  end;
  if not v_failed then
    raise exception 'smoke_second_attempt_not_rejected';
  end if;

  -- Aliases ativos e inativos isolados sao ambos trataveis.
  v_preview := public.manage_team_safe_deletion(
    v_active_only_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'removable_with_aliases'
     or pg_catalog.jsonb_array_length(v_preview -> 'active_aliases') <> 1
     or pg_catalog.jsonb_array_length(v_preview -> 'inactive_aliases') <> 0 then
    raise exception 'smoke_active_only_alias_preview_invalid: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_inactive_only_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'removable_with_aliases'
     or pg_catalog.jsonb_array_length(v_preview -> 'active_aliases') <> 0
     or pg_catalog.jsonb_array_length(v_preview -> 'inactive_aliases') <> 1 then
    raise exception 'smoke_inactive_only_alias_preview_invalid: %', v_preview;
  end if;

  -- Varios aliases ativos e inativos sao removidos, mas a auditoria sobrevive.
  v_preview := public.manage_team_safe_deletion(
    v_alias_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'removable_with_aliases'
     or v_preview ->> 'proposed_action' <> 'delete_team_and_aliases'
     or (v_preview ->> 'alias_count')::integer <> 2
     or pg_catalog.jsonb_array_length(v_preview -> 'active_aliases') <> 1
     or pg_catalog.jsonb_array_length(v_preview -> 'inactive_aliases') <> 1
     or (v_preview ->> 'alias_audit_count')::integer <> 2 then
    raise exception 'smoke_alias_preview_invalid: %', v_preview;
  end if;

  v_result := public.manage_team_safe_deletion(
    v_alias_team_id,
    true,
    v_preview ->> 'preview_fingerprint',
    'delete_team_and_aliases',
    'admin_session',
    'smoke_admin',
    'team_safe_deletion_smoke',
    v_prefix || ':delete-aliases'
  );
  if (v_result ->> 'applied')::boolean is not true
     or (v_result ->> 'aliases_deleted_count')::integer <> 2
     or exists (select 1 from public.teams t where t.id = v_alias_team_id)
     or exists (
       select 1 from public.team_aliases a
       where a.id in (v_active_alias_id, v_inactive_alias_id)
     )
     or (
       select count(*)
       from public.team_alias_audit_events e
       where e.team_alias_id is null
          and e.after_state ->> 'team_id' = v_alias_team_id::text
          and e.after_state ? 'alias'
      ) <> 2
     or (
       select pg_catalog.jsonb_agg(
         pg_catalog.jsonb_build_object(
           'id', e.id,
           'before_state', e.before_state,
           'after_state', e.after_state
         ) order by e.id
       )
       from public.team_alias_audit_events e
       where e.team_alias_id is null
         and coalesce(e.after_state, e.before_state) ->> 'team_id' =
           v_alias_team_id::text
     ) is distinct from v_alias_audit_snapshot then
    raise exception 'smoke_alias_delete_or_audit_preservation_failed: %', v_result;
  end if;

  -- Fingerprint desatualizada aborta sem remover o clube.
  v_preview := public.manage_team_safe_deletion(
    v_stale_team_id, false, null, null, null, null, null, null
  );
  update public.teams
  set public_name = 'Identidade alterada depois do preview'
  where id = v_stale_team_id;
  v_failed := false;
  begin
    perform public.manage_team_safe_deletion(
      v_stale_team_id,
      true,
      v_preview ->> 'preview_fingerprint',
      'delete_team',
      'admin_session',
      'smoke_admin',
      'team_safe_deletion_smoke',
      v_prefix || ':stale'
    );
  exception
    when serialization_failure then
      v_failed := sqlerrm = 'preview_stale';
  end;
  if not v_failed
     or not exists (select 1 from public.teams t where t.id = v_stale_team_id)
     or exists (
       select 1 from public.team_deletion_audit_events e
       where e.request_reference = v_prefix || ':stale'
     ) then
    raise exception 'smoke_preview_stale_not_atomic';
  end if;

  -- A acao confirmada tem de coincidir exatamente com o preview.
  v_preview := public.manage_team_safe_deletion(
    v_action_team_id, false, null, null, null, null, null, null
  );
  v_failed := false;
  begin
    perform public.manage_team_safe_deletion(
      v_action_team_id,
      true,
      v_preview ->> 'preview_fingerprint',
      'delete_team_and_aliases',
      'admin_session',
      'smoke_admin',
      'team_safe_deletion_smoke',
      v_prefix || ':wrong-action'
    );
  exception
    when invalid_parameter_value then
      v_failed := sqlerrm = 'invalid_confirmation';
  end;
  if not v_failed
     or not exists (select 1 from public.teams t where t.id = v_action_team_id) then
    raise exception 'smoke_invalid_confirmation_not_enforced';
  end if;

  v_failed := false;
  begin
    perform public.manage_team_safe_deletion(
      v_action_team_id,
      true,
      v_preview ->> 'preview_fingerprint',
      'unknown_action',
      'admin_session',
      'smoke_admin',
      'team_safe_deletion_smoke',
      v_prefix || ':invalid-action'
    );
  exception
    when invalid_parameter_value then
      v_failed := sqlerrm = 'invalid_action';
  end;
  if not v_failed then
    raise exception 'smoke_invalid_action_not_enforced';
  end if;

  -- Uma falha tardia na auditoria reverte integralmente alias e clube.
  v_preview := public.manage_team_safe_deletion(
    v_rollback_team_id, false, null, null, null, null, null, null
  );
  v_request_reference := v_prefix || ':forced-rollback';
  insert into public.team_deletion_audit_events (
    deleted_team_id,
    team_snapshot,
    aliases_snapshot,
    dependency_snapshot,
    confirmed_action,
    confirmed_preview_fingerprint,
    actor_type,
    actor_reference,
    source,
    request_reference
  ) values (
    v_rollback_team_id,
    pg_catalog.jsonb_build_object(
      'id', v_rollback_team_id,
      'name', 'Clube rollback ' || v_prefix,
      'slug', v_prefix || '-rollback',
      'country_id', v_country_id
    ),
    '[]'::jsonb,
    '[]'::jsonb,
    'delete_team',
    'v1:00000000000000000000000000000000',
    'smoke',
    'smoke',
    'team_safe_deletion_smoke',
    v_request_reference
  );
  v_failed := false;
  begin
    perform public.manage_team_safe_deletion(
      v_rollback_team_id,
      true,
      v_preview ->> 'preview_fingerprint',
      'delete_team_and_aliases',
      'admin_session',
      'smoke_admin',
      'team_safe_deletion_smoke',
      v_request_reference
    );
  exception
    when unique_violation then
      v_failed := true;
  end;
  if not v_failed
     or not exists (select 1 from public.teams t where t.id = v_rollback_team_id)
     or not exists (select 1 from public.team_aliases a where a.id = v_rollback_alias_id)
     or not exists (
       select 1 from public.team_alias_audit_events e
       where e.team_alias_id = v_rollback_alias_id
     ) then
    raise exception 'smoke_integral_rollback_failed';
  end if;

  -- Dependencias bloqueantes, mesmo quando a FK usa CASCADE ou SET NULL.
  insert into public.season_teams (season_id, team_id)
  values (v_season_id, v_season_team_id), (v_season_id, v_multi_team_id);

  insert into public.matches (
    id, competition_id, season_id, home_team_id, away_team_id, status
  ) values
    (v_home_match_id, v_competition_id, v_season_id, v_home_team_id, v_support_away_id, 'scheduled'),
    (v_away_match_id, v_competition_id, v_season_id, v_support_home_id, v_away_team_id, 'scheduled'),
    (v_neutral_match_id, v_competition_id, v_season_id, v_support_home_id, v_support_away_id, 'scheduled');

  insert into public.standings (id, competition_id, season_id)
  values (v_standing_id, v_competition_id, v_season_id);
  insert into public.standing_rows (standing_id, team_id, position)
  values (v_standing_id, v_standing_team_id, 1);
  insert into public.goals (match_id, team_id, minute)
  values (v_neutral_match_id, v_goal_team_id, 10);
  insert into public.players (team_id, name, slug)
  values
    (v_player_team_id, 'Jogador sintetico ' || v_prefix, v_prefix || '-player-one'),
    (v_multi_team_id, 'Jogador multi sintetico ' || v_prefix, v_prefix || '-player-multi');
  insert into public.match_events (match_id, minute, type, title, team_id)
  values (v_neutral_match_id, 20, 'goal', 'Evento sintetico', v_event_team_id);

  v_preview := public.manage_team_safe_deletion(
    v_season_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"season_teams","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_season_teams_not_blocking: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_home_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"matches_home","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_home_match_not_blocking: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_away_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"matches_away","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_away_match_not_blocking: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_standing_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"standing_rows","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_standing_not_blocking: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_goal_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"goals","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_goals_not_blocking: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_player_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"players","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_players_not_blocking: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_event_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"match_events","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_events_not_blocking: %', v_preview;
  end if;

  v_preview := public.manage_team_safe_deletion(
    v_multi_team_id, false, null, null, null, null, null, null
  );
  if v_preview ->> 'status' <> 'blocked'
     or not (v_preview -> 'dependencies' @> '[{"key":"season_teams","count":1,"blocking":true},{"key":"players","count":1,"blocking":true}]'::jsonb) then
    raise exception 'smoke_multiple_dependencies_not_reported: %', v_preview;
  end if;

  -- Um apply bloqueado nao altera dados nem cria auditoria de remocao.
  v_result := public.manage_team_safe_deletion(
    v_multi_team_id,
    true,
    v_preview ->> 'preview_fingerprint',
    'none',
    'admin_session',
    'smoke_admin',
    'team_safe_deletion_smoke',
    v_prefix || ':blocked'
  );
  if (v_result ->> 'applied')::boolean is not false
     or v_result ->> 'status' <> 'blocked'
     or not exists (select 1 from public.teams t where t.id = v_multi_team_id)
     or exists (
       select 1 from public.team_deletion_audit_events e
       where e.request_reference = v_prefix || ':blocked'
     ) then
    raise exception 'smoke_blocked_apply_changed_data: %', v_result;
  end if;

  -- O RPC e exclusivamente executavel por service_role.
  if v_rpc_oid is null
     or not pg_catalog.has_function_privilege('service_role', v_rpc_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('anon', v_rpc_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_rpc_oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_rpc_oid
         and acl.grantee = 0
         and acl.privilege_type = 'EXECUTE'
     ) then
    raise exception 'smoke_permission_denied_contract_failed';
  end if;

  if exists (
    select 1
    from public.team_deletion_audit_events e
    where e.request_reference like v_prefix || '%'
      and (
        e.team_snapshot::text ~* '(spain|espanha|la liga)'
        or e.dependency_snapshot::text ~* '(spain|espanha|la liga)'
      )
  ) then
    raise exception 'smoke_country_specific_logic_detected';
  end if;
end
$smoke$;

rollback;
