-- Jornada.pt - smoke transacional da criacao de clubes em lote.
-- Usa apenas dados reservados para este teste e termina sempre com ROLLBACK.

begin;

do $smoke$
declare
  v_country_id uuid;
  v_preview record;
  v_apply record;
  v_idempotent record;
  v_legacy_preview record;
  v_legacy_apply record;
  v_team_id uuid;
  v_legacy_team_id uuid;
  v_inactive_team_id uuid;
  v_alias_id uuid;
  v_alias_mutation record;
  v_rows jsonb;
  v_failed boolean;
  v_before_count integer;
  v_after_count integer;
  v_alias_audit_before integer;
  v_public_audit_before integer;
begin
  if to_regprocedure(
    'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)'
  ) is null then
    raise exception 'smoke_manage_team_creation_batch_missing'
      using errcode = '42883';
  end if;

  insert into public.countries (
    name,
    slug,
    is_active
  ) values (
    'Transactional Team Creation Smoke Country 20260720',
    'tx-team-creation-smoke-country-20260720',
    true
  )
  returning id into v_country_id;

  select count(*) into v_alias_audit_before
  from public.team_alias_audit_events;

  select count(*) into v_public_audit_before
  from public.team_public_name_audit_events;

  -- 1-4: preview/apply de clube novo, nome publico e aliases.
  v_rows := jsonb_build_array(jsonb_build_object(
    'lineNumber', 1,
    'canonicalName', 'Transactional Smoke Athletic 20260720',
    'publicName', 'Smoke Athletic',
    'shortName', 'TSAC',
    'code', 'TSA20',
    'slug', 'tx-smoke-athletic-20260720',
    'aliases', jsonb_build_array(
      'Transactional Smoke Athletic Club 20260720',
      'TS Athletic 20260720'
    ),
    'logoUrl', 'https://invalid.example/tx-smoke-athletic.svg',
    'primaryColor', '#123ABC'
  ));

  select * into strict v_preview
  from public.manage_team_creation_batch(
    v_country_id,
    v_rows,
    false,
    null,
    '[]'::jsonb,
    'smoke',
    'sql-smoke',
    'team_creation_batch_smoke',
    'team-creation-smoke-new-preview'
  );

  if v_preview.result_status <> 'create'
     or v_preview.batch_create_count <> 1
     or v_preview.batch_blocking_count <> 0
     or not v_preview.batch_can_apply
     or v_preview.batch_applied then
    raise exception 'smoke_new_preview_unexpected: %', row_to_json(v_preview)
      using errcode = '55000';
  end if;

  select * into strict v_apply
  from public.manage_team_creation_batch(
    v_country_id,
    v_rows,
    true,
    v_preview.preview_fingerprint,
    '[]'::jsonb,
    'smoke',
    'sql-smoke',
    'team_creation_batch_smoke',
    'team-creation-smoke-new-apply'
  );

  v_team_id := v_apply.final_team_id;

  if not v_apply.batch_applied
     or not v_apply.batch_integrally_applied
     or not v_apply.changed
     or v_apply.batch_created_count <> 1
     or v_apply.batch_aliases_created_count <> 2
     or v_apply.batch_public_names_changed_count <> 1
     or v_team_id is null then
    raise exception 'smoke_new_apply_unexpected: %', row_to_json(v_apply)
      using errcode = '55000';
  end if;

  if not exists (
    select 1
    from public.teams t
    where t.id = v_team_id
      and t.country_id = v_country_id
      and t.name = 'Transactional Smoke Athletic 20260720'
      and t.public_name = 'Smoke Athletic'
      and t.short_name = 'TSAC'
      and t.code = 'TSA20'
      and t.slug = 'tx-smoke-athletic-20260720'
      and t.logo_url = 'https://invalid.example/tx-smoke-athletic.svg'
      and t.primary_color = '#123ABC'
      and t.data_source = 'manual'
      and t.sync_status = 'manual'
  ) then
    raise exception 'smoke_created_team_state_unexpected'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.team_aliases a
    where a.team_id = v_team_id and a.status = 'active'
  ) <> 2 or (
    select count(*)
    from public.team_alias_audit_events
  ) <> v_alias_audit_before + 2 or (
    select count(*)
    from public.team_public_name_audit_events
  ) <> v_public_audit_before + 1 then
    raise exception 'smoke_audited_identity_state_unexpected'
      using errcode = '55000';
  end if;

  -- 5 e 10: repetir o lote devolve existing e nao cria nem altera.
  select * into strict v_idempotent
  from public.manage_team_creation_batch(
    v_country_id,
    v_rows,
    false,
    null,
    '[]'::jsonb,
    'smoke',
    'sql-smoke',
    'team_creation_batch_smoke',
    'team-creation-smoke-idempotent-preview'
  );

  if v_idempotent.result_status <> 'existing'
     or v_idempotent.resolved_team_id <> v_team_id
     or v_idempotent.batch_existing_count <> 1
     or not v_idempotent.batch_can_apply then
    raise exception 'smoke_idempotent_preview_unexpected: %', row_to_json(v_idempotent)
      using errcode = '55000';
  end if;

  select * into strict v_idempotent
  from public.manage_team_creation_batch(
    v_country_id,
    v_rows,
    true,
    v_idempotent.preview_fingerprint,
    '[]'::jsonb,
    'smoke',
    'sql-smoke',
    'team_creation_batch_smoke',
    'team-creation-smoke-idempotent-apply'
  );

  if v_idempotent.result_status <> 'existing'
     or v_idempotent.changed
     or v_idempotent.batch_created_count <> 0
     or v_idempotent.batch_aliases_created_count <> 0
     or v_idempotent.batch_aliases_unchanged_count <> 2
     or v_idempotent.batch_public_names_changed_count <> 0 then
    raise exception 'smoke_idempotent_apply_unexpected: %', row_to_json(v_idempotent)
      using errcode = '55000';
  end if;

  -- 6: conflito global de slug.
  v_rows := jsonb_build_array(jsonb_build_object(
    'lineNumber', 1,
    'canonicalName', 'Transactional Smoke Other 20260720',
    'publicName', null,
    'shortName', 'TSO',
    'code', null,
    'slug', 'tx-smoke-athletic-20260720',
    'aliases', '[]'::jsonb,
    'logoUrl', null,
    'primaryColor', null
  ));

  select * into strict v_preview
  from public.manage_team_creation_batch(
    v_country_id, v_rows, false, null, '[]'::jsonb,
    'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    'team-creation-smoke-slug-conflict'
  );

  if v_preview.result_status <> 'conflict'
     or v_preview.reason_code <> 'slug_conflict' then
    raise exception 'smoke_slug_conflict_not_detected: %', row_to_json(v_preview)
      using errcode = '55000';
  end if;

  -- 7: conflito de alias com uma identidade ja reservada.
  v_rows := jsonb_build_array(jsonb_build_object(
    'lineNumber', 1,
    'canonicalName', 'Transactional Smoke Alias Conflict 20260720',
    'publicName', null,
    'shortName', 'TSACF',
    'code', null,
    'slug', 'tx-smoke-alias-conflict-20260720',
    'aliases', jsonb_build_array('TS Athletic 20260720'),
    'logoUrl', null,
    'primaryColor', null
  ));

  select * into strict v_preview
  from public.manage_team_creation_batch(
    v_country_id, v_rows, false, null, '[]'::jsonb,
    'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    'team-creation-smoke-alias-conflict'
  );

  if v_preview.result_status <> 'conflict'
     or v_preview.reason_code <> 'alias_conflict' then
    raise exception 'smoke_alias_conflict_not_detected: %', row_to_json(v_preview)
      using errcode = '55000';
  end if;

  -- 8: linha estruturalmente invalida.
  v_rows := jsonb_build_array(jsonb_build_object(
    'lineNumber', 1,
    'canonicalName', 'Transactional Smoke Invalid 20260720',
    'publicName', null,
    'shortName', 'TOOLONG',
    'code', null,
    'slug', 'tx-smoke-invalid-20260720',
    'aliases', '[]'::jsonb,
    'logoUrl', null,
    'primaryColor', null
  ));

  select * into strict v_preview
  from public.manage_team_creation_batch(
    v_country_id, v_rows, false, null, '[]'::jsonb,
    'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    'team-creation-smoke-invalid'
  );

  if v_preview.result_status <> 'invalid'
     or v_preview.reason_code <> 'short_name_invalid'
     or v_preview.batch_can_apply then
    raise exception 'smoke_invalid_row_not_detected: %', row_to_json(v_preview)
      using errcode = '55000';
  end if;

  -- 9: erro na ultima linha bloqueia o lote inteiro e nao deixa a primeira.
  v_rows := jsonb_build_array(
    jsonb_build_object(
      'lineNumber', 1,
      'canonicalName', 'Transactional Smoke Rollback First 20260720',
      'publicName', null,
      'shortName', 'TSRF',
      'code', null,
      'slug', 'tx-smoke-rollback-first-20260720',
      'aliases', '[]'::jsonb,
      'logoUrl', null,
      'primaryColor', null
    ),
    jsonb_build_object(
      'lineNumber', 2,
      'canonicalName', '',
      'publicName', null,
      'shortName', 'TSRL',
      'code', null,
      'slug', 'tx-smoke-rollback-last-20260720',
      'aliases', '[]'::jsonb,
      'logoUrl', null,
      'primaryColor', null
    )
  );

  select * into v_preview
  from public.manage_team_creation_batch(
    v_country_id, v_rows, false, null, '[]'::jsonb,
    'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    'team-creation-smoke-rollback-preview'
  )
  order by line_number
  limit 1;

  select count(*) into v_before_count
  from public.teams t
  where t.slug = 'tx-smoke-rollback-first-20260720';

  v_failed := false;
  begin
    perform 1
    from public.manage_team_creation_batch(
      v_country_id, v_rows, true, v_preview.preview_fingerprint, '[]'::jsonb,
      'smoke', 'sql-smoke', 'team_creation_batch_smoke',
      'team-creation-smoke-rollback-apply'
    );
  exception
    when sqlstate '22023' then
      v_failed := true;
  end;

  select count(*) into v_after_count
  from public.teams t
  where t.slug = 'tx-smoke-rollback-first-20260720';

  if not v_failed or v_before_count <> 0 or v_after_count <> 0 then
    raise exception 'smoke_batch_rollback_not_atomic'
      using errcode = '55000';
  end if;

  -- 11: clube legacy sem country_id exige confirmacao explicita e conserva o id.
  insert into public.teams (
    name, short_name, slug, country_id
  ) values (
    'Transactional Smoke Legacy 20260720',
    'TSLG',
    'tx-smoke-legacy-20260720',
    null
  )
  returning id into v_legacy_team_id;

  v_rows := jsonb_build_array(jsonb_build_object(
    'lineNumber', 1,
    'canonicalName', 'Transactional Smoke Legacy 20260720',
    'publicName', 'Smoke Legacy',
    'shortName', 'TSLG',
    'code', 'TSL20',
    'slug', 'tx-smoke-legacy-20260720',
    'aliases', jsonb_build_array('Transactional Legacy Club 20260720'),
    'logoUrl', 'https://invalid.example/tx-smoke-legacy.svg',
    'primaryColor', '#ABC123'
  ));

  select * into strict v_legacy_preview
  from public.manage_team_creation_batch(
    v_country_id, v_rows, false, null, '[]'::jsonb,
    'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    'team-creation-smoke-legacy-preview'
  );

  if v_legacy_preview.result_status <> 'complete_existing'
     or v_legacy_preview.resolved_team_id <> v_legacy_team_id
     or v_legacy_preview.batch_blocking_count <> 1
     or v_legacy_preview.batch_can_apply then
    raise exception 'smoke_legacy_preview_unexpected: %', row_to_json(v_legacy_preview)
      using errcode = '55000';
  end if;

  select * into strict v_legacy_apply
  from public.manage_team_creation_batch(
    v_country_id,
    v_rows,
    true,
    v_legacy_preview.preview_fingerprint,
    '[1]'::jsonb,
    'smoke',
    'sql-smoke',
    'team_creation_batch_smoke',
    'team-creation-smoke-legacy-apply'
  );

  if v_legacy_apply.final_team_id <> v_legacy_team_id
     or v_legacy_apply.batch_completed_existing_count <> 1
     or not v_legacy_apply.changed
     or not exists (
       select 1
       from public.teams t
       where t.id = v_legacy_team_id
         and t.country_id = v_country_id
         and t.code = 'TSL20'
         and t.public_name = 'Smoke Legacy'
         and t.logo_url = 'https://invalid.example/tx-smoke-legacy.svg'
         and t.primary_color = '#ABC123'
     ) then
    raise exception 'smoke_legacy_apply_unexpected: %', row_to_json(v_legacy_apply)
      using errcode = '55000';
  end if;

  -- 12: alias inativo nao resolve um candidato.
  insert into public.teams (
    name, short_name, slug, country_id
  ) values (
    'Transactional Smoke Inactive Alias Owner 20260720',
    'TSIA',
    'tx-smoke-inactive-alias-owner-20260720',
    v_country_id
  )
  returning id into v_inactive_team_id;

  select * into strict v_alias_mutation
  from public.manage_team_alias(
    'create', 'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    null, v_inactive_team_id, 'Transactional Dormant Identity 20260720',
    'team-creation-smoke-inactive-create'
  );
  v_alias_id := v_alias_mutation.result_team_alias_id;

  perform 1
  from public.manage_team_alias(
    'deactivate', 'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    v_alias_id, null, null, 'team-creation-smoke-inactive-deactivate'
  );

  v_rows := jsonb_build_array(jsonb_build_object(
    'lineNumber', 1,
    'canonicalName', 'Transactional Dormant Identity 20260720',
    'publicName', null,
    'shortName', 'TSDI',
    'code', null,
    'slug', 'tx-smoke-dormant-identity-20260720',
    'aliases', '[]'::jsonb,
    'logoUrl', null,
    'primaryColor', null
  ));

  select * into strict v_preview
  from public.manage_team_creation_batch(
    v_country_id, v_rows, false, null, '[]'::jsonb,
    'smoke', 'sql-smoke', 'team_creation_batch_smoke',
    'team-creation-smoke-inactive-resolution'
  );

  if v_preview.resolved_team_id is not null
     or v_preview.resolved_team_id is not distinct from v_inactive_team_id
     or v_preview.result_status not in ('create', 'conflict') then
    raise exception 'smoke_inactive_alias_resolved_unexpectedly: %', row_to_json(v_preview)
      using errcode = '55000';
  end if;

  -- Fingerprints desatualizadas sao rejeitadas antes de qualquer mutacao.
  v_failed := false;
  begin
    perform 1
    from public.manage_team_creation_batch(
      v_country_id, v_rows, true, 'v1:00000000000000000000000000000000',
      '[]'::jsonb, 'smoke', 'sql-smoke', 'team_creation_batch_smoke',
      'team-creation-smoke-stale-preview'
    );
  exception
    when sqlstate '40001' then
      v_failed := true;
  end;

  if not v_failed then
    raise exception 'smoke_stale_preview_not_rejected'
      using errcode = '55000';
  end if;

  -- 13: privilegios minimos, sem mudar de sessao.
  if not pg_catalog.has_function_privilege(
       'service_role',
       'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'anon',
       'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)',
       'EXECUTE'
     )
     or pg_catalog.has_function_privilege(
       'authenticated',
       'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)',
       'EXECUTE'
     )
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = to_regprocedure(
         'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)'
       )
         and acl.privilege_type = 'EXECUTE'
         and acl.grantee = 0
     ) then
    raise exception 'smoke_rpc_privileges_unexpected'
      using errcode = '42501';
  end if;
end
$smoke$;

ROLLBACK;
