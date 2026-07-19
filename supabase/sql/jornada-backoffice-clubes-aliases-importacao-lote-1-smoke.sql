-- JORNADA-BACKOFFICE-CLUBES-ALIASES-IMPORTACAO-LOTE-RPC-1
-- SQL 4/4 - SMOKE
--
-- Todo o cenario, incluindo aliases, audit events e a identidade controlada
-- para ambiguidade, vive apenas nesta transacao e e sempre revertido no fim.

begin;

do $smoke$
declare
  v_country_id uuid;
  v_team_one_id uuid;
  v_team_one_name text;
  v_team_two_id uuid;
  v_team_two_name text;
  v_alias_one text := 'batch smoke ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_two text := 'batch smoke ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_three text := 'batch smoke ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_mixed text := 'batch smoke ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_ambiguous text := 'batch smoke ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_duplicate text := 'batch smoke ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_invalid text := 'batch smoke ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_request_null text := 'batch smoke request null ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_request_blank text := 'batch smoke request blank ' || replace(gen_random_uuid()::text, '-', '');
  v_alias_unicode_160 text := repeat('á', 128) || replace(gen_random_uuid()::text, '-', '');
  v_alias_unicode_161 text := repeat('á', 129) || replace(gen_random_uuid()::text, '-', '');
  v_unknown_club text := 'unknown club ' || replace(gen_random_uuid()::text, '-', '');
  v_ambiguous_key text;
  v_request_preview text := 'batch-smoke-preview-' || gen_random_uuid()::text;
  v_request_apply text := 'batch-smoke-apply-' || gen_random_uuid()::text;
  v_request_direct text := 'batch-smoke-direct-' || gen_random_uuid()::text;
  v_request_deactivate text := 'batch-smoke-deactivate-' || gen_random_uuid()::text;
  v_request_unicode text := 'batch-smoke-unicode-' || gen_random_uuid()::text;
  v_rows jsonb;
  v_alias_count_before bigint;
  v_alias_count_after bigint;
  v_audit_count_before bigint;
  v_audit_count_after bigint;
  v_alias_one_id uuid;
  v_result record;
  v_expected_error_raised boolean;
  v_error_message text;
  v_error_sqlstate text;
begin
  if to_regprocedure(
    'public.manage_team_alias_batch(uuid,jsonb,boolean,text,text,text,text)'
  ) is null then
    raise exception 'smoke_manage_team_alias_batch_missing'
      using errcode = '42883';
  end if;

  -- Escolher dois clubes reais do mesmo pais cujos nomes resolvem de forma
  -- univoca contra os quatro campos canonicos dentro desse pais.
  with identities as (
    select distinct
      t.id as team_id,
      t.country_id,
      public.normalize_team_identity_v1(identity_value.field_value) as identity_key
    from public.teams t
    cross join lateral (
      values (t.name), (t.short_name), (t.slug), (t.code)
    ) identity_value(field_value)
    where t.country_id is not null
      and identity_value.field_value is not null
      and public.normalize_team_identity_v1(identity_value.field_value) <> ''
  ),
  eligible as (
    select t.id, t.name, t.country_id
    from public.teams t
    join identities own_name
      on own_name.team_id = t.id
     and own_name.identity_key = public.normalize_team_identity_v1(t.name)
    where t.country_id is not null
      and (
        select count(distinct candidate.team_id)
        from identities candidate
        where candidate.identity_key = public.normalize_team_identity_v1(t.name)
      ) = 1
      and not exists (
        select 1
        from public.team_aliases a
        where a.normalized_alias = public.normalize_team_identity_v1(t.name)
      )
  ),
  ranked as (
    select
      e.*,
      row_number() over (partition by e.country_id order by e.id) as position,
      count(*) over (partition by e.country_id) as country_team_count
    from eligible e
  )
  select
    first_team.country_id,
    first_team.id,
    first_team.name,
    second_team.id,
    second_team.name
  into
    v_country_id,
    v_team_one_id,
    v_team_one_name,
    v_team_two_id,
    v_team_two_name
  from ranked first_team
  join ranked second_team
    on second_team.country_id = first_team.country_id
   and second_team.position = 2
  where first_team.position = 1
    and first_team.country_team_count >= 2
  order by first_team.country_id
  limit 1;

  if v_country_id is null then
    raise exception 'smoke_requires_two_uniquely_resolvable_teams_in_one_country'
      using errcode = '55000';
  end if;

  -- A request_reference e obrigatoria mesmo num apply que, sem esta validacao,
  -- teria um plano valido. Cada erro e capturado numa subtransacao isolada.
  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;
  v_expected_error_raised := false;
  v_error_message := null;
  v_error_sqlstate := null;

  begin
    perform 1
    from public.manage_team_alias_batch(
      v_country_id,
      jsonb_build_array(jsonb_build_object(
        'lineNumber', 1,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_request_null
      )),
      true,
      'admin_session',
      'batch_smoke',
      'admin_batch_import',
      null::text
    );
  exception
    when others then
      v_expected_error_raised := true;
      get stacked diagnostics
        v_error_message = message_text,
        v_error_sqlstate = returned_sqlstate;
  end;

  if not v_expected_error_raised
     or v_error_message is distinct from 'team_alias_batch_request_reference_required'
     or v_error_sqlstate is distinct from '22023' then
    raise exception 'smoke_request_reference_null_contract_failed:%:%',
      v_error_sqlstate,
      v_error_message
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before
     or exists (
       select 1
       from public.team_aliases a
       where a.normalized_alias = public.normalize_team_identity_v1(v_alias_request_null)
     ) then
    raise exception 'smoke_request_reference_null_wrote_data'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;
  v_expected_error_raised := false;
  v_error_message := null;
  v_error_sqlstate := null;

  begin
    perform 1
    from public.manage_team_alias_batch(
      v_country_id,
      jsonb_build_array(jsonb_build_object(
        'lineNumber', 2,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_request_blank
      )),
      true,
      'admin_session',
      'batch_smoke',
      'admin_batch_import',
      '   '::text
    );
  exception
    when others then
      v_expected_error_raised := true;
      get stacked diagnostics
        v_error_message = message_text,
        v_error_sqlstate = returned_sqlstate;
  end;

  if not v_expected_error_raised
     or v_error_message is distinct from 'team_alias_batch_request_reference_required'
     or v_error_sqlstate is distinct from '22023' then
    raise exception 'smoke_request_reference_blank_contract_failed:%:%',
      v_error_sqlstate,
      v_error_message
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before
     or exists (
       select 1
       from public.team_aliases a
       where a.normalized_alias = public.normalize_team_identity_v1(v_alias_request_blank)
     ) then
    raise exception 'smoke_request_reference_blank_wrote_data'
      using errcode = '55000';
  end if;

  v_rows := jsonb_build_array(
    jsonb_build_object(
      'lineNumber', 1,
      'canonicalClub', v_team_one_name,
      'alias', v_alias_one
    ),
    jsonb_build_object(
      'lineNumber', 2,
      'canonicalClub', v_team_two_name,
      'alias', v_alias_two
    )
  );

  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;

  -- Preview valido de duas linhas: plano completo, zero writes.
  select
    count(*) as row_count,
    count(*) filter (where result_status = 'create') as status_count,
    count(*) filter (where blocking) as blocking_count,
    count(*) filter (where changed) as changed_count,
    bool_and(batch_can_apply) as can_apply,
    bool_and(not batch_requested_apply) as requested_preview,
    max(batch_create_count) as create_count,
    max(batch_existing_active_count) as existing_count,
    max(batch_blocking_count) as batch_block_count,
    max(batch_created_count) as created_count,
    bool_and(not batch_noop) as not_noop
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    v_rows,
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    v_request_preview
  );

  if v_result.row_count <> 2
     or v_result.status_count <> 2
     or v_result.blocking_count <> 0
     or v_result.changed_count <> 0
     or v_result.can_apply is distinct from true
     or v_result.requested_preview is distinct from true
     or v_result.create_count <> 2
     or v_result.existing_count <> 0
     or v_result.batch_block_count <> 0
     or v_result.created_count <> 0
     or v_result.not_noop is distinct from true then
    raise exception 'smoke_valid_preview_contract_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;

  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before then
    raise exception 'smoke_preview_wrote_data'
      using errcode = '55000';
  end if;

  -- Apply valido: as duas criacoes e os dois audit events partilham a mesma
  -- chamada e a mesma request_reference.
  select
    count(*) as row_count,
    count(*) filter (where result_status = 'create' and result_code = 'created')
      as status_count,
    count(*) filter (where blocking) as blocking_count,
    count(*) filter (where changed) as changed_count,
    bool_and(batch_can_apply) as can_apply,
    bool_and(batch_requested_apply) as requested_apply,
    max(batch_create_count) as create_count,
    max(batch_blocking_count) as batch_block_count,
    max(batch_created_count) as created_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    v_rows,
    true,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    v_request_apply
  );

  if v_result.row_count <> 2
     or v_result.status_count <> 2
     or v_result.blocking_count <> 0
     or v_result.changed_count <> 2
     or v_result.can_apply is distinct from true
     or v_result.requested_apply is distinct from true
     or v_result.create_count <> 2
     or v_result.batch_block_count <> 0
     or v_result.created_count <> 2 then
    raise exception 'smoke_valid_apply_contract_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;

  if v_alias_count_after <> v_alias_count_before + 2
     or v_audit_count_after <> v_audit_count_before + 2 then
    raise exception 'smoke_valid_apply_count_failed'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from public.team_alias_audit_events e
    join public.team_aliases a on a.id = e.team_alias_id
    where e.request_reference = v_request_apply
      and e.action = 'create'
      and a.normalized_alias in (
        public.normalize_team_identity_v1(v_alias_one),
        public.normalize_team_identity_v1(v_alias_two)
      )
  ) <> 2 then
    raise exception 'smoke_valid_apply_audit_events_failed'
      using errcode = '55000';
  end if;

  select a.id
  into v_alias_one_id
  from public.team_aliases a
  where a.normalized_alias = public.normalize_team_identity_v1(v_alias_one)
    and a.team_id = v_team_one_id;

  if v_alias_one_id is null then
    raise exception 'smoke_created_alias_not_found'
      using errcode = '55000';
  end if;

  -- Alias ativo no mesmo clube: no-op global e sem novo audit event.
  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;

  select
    count(*) as row_count,
    count(*) filter (where result_status = 'existing_active_same_team') as status_count,
    count(*) filter (where blocking) as blocking_count,
    count(*) filter (where changed) as changed_count,
    bool_and(batch_can_apply) as can_apply,
    max(batch_existing_active_count) as existing_count,
    max(batch_created_count) as created_count,
    bool_and(batch_noop) as is_noop
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 10,
      'canonicalClub', v_team_one_name,
      'alias', v_alias_one
    )),
    true,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-existing-active-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 0
     or v_result.changed_count <> 0
     or v_result.can_apply is distinct from true
     or v_result.existing_count <> 1
     or v_result.created_count <> 0
     or v_result.is_noop is distinct from true then
    raise exception 'smoke_existing_active_noop_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before then
    raise exception 'smoke_existing_active_noop_wrote_data'
      using errcode = '55000';
  end if;

  -- Tornar o fixture inativo pela RPC unitaria; o batch deve bloquear e nao
  -- pode reativa-lo automaticamente.
  perform 1
  from public.manage_team_alias(
    'deactivate',
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    v_alias_one_id,
    null::uuid,
    null::text,
    v_request_deactivate
  );

  if not exists (
    select 1
    from public.team_aliases a
    where a.id = v_alias_one_id
      and a.status = 'inactive'
  ) then
    raise exception 'smoke_inactive_fixture_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;

  select
    count(*) as row_count,
    count(*) filter (where result_status = 'existing_inactive_same_team') as status_count,
    count(*) filter (where blocking) as blocking_count,
    count(*) filter (where changed) as changed_count,
    max(batch_blocking_count) as batch_block_count,
    max(batch_created_count) as created_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 11,
      'canonicalClub', v_team_one_name,
      'alias', v_alias_one
    )),
    true,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-existing-inactive-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 1
     or v_result.changed_count <> 0
     or v_result.batch_block_count <> 1
     or v_result.created_count <> 0 then
    raise exception 'smoke_existing_inactive_block_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before then
    raise exception 'smoke_existing_inactive_batch_wrote_data'
      using errcode = '55000';
  end if;

  -- Clube desconhecido.
  select
    count(*) as row_count,
    count(*) filter (where result_status = 'unknown_club') as status_count,
    count(*) filter (where blocking) as blocking_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 20,
      'canonicalClub', v_unknown_club,
      'alias', v_alias_three
    )),
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-unknown-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 1 then
    raise exception 'smoke_unknown_club_failed'
      using errcode = '55000';
  end if;

  -- Alias repetido no lote: todas as ocorrencias bloqueiam.
  select
    count(*) as row_count,
    count(*) filter (where result_status = 'duplicate_alias_in_batch') as status_count,
    count(*) filter (where blocking) as blocking_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(
      jsonb_build_object(
        'lineNumber', 30,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_duplicate
      ),
      jsonb_build_object(
        'lineNumber', 31,
        'canonicalClub', v_team_two_name,
        'alias', upper(v_alias_duplicate)
      )
    ),
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-duplicate-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 2
     or v_result.status_count <> 2
     or v_result.blocking_count <> 2 then
    raise exception 'smoke_duplicate_alias_in_batch_failed'
      using errcode = '55000';
  end if;

  -- Alias existente noutro clube.
  select
    count(*) as row_count,
    count(*) filter (where result_status = 'alias_conflict_other_team') as status_count,
    count(*) filter (where blocking) as blocking_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 40,
      'canonicalClub', v_team_one_name,
      'alias', v_alias_two
    )),
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-alias-conflict-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 1 then
    raise exception 'smoke_alias_conflict_other_team_failed'
      using errcode = '55000';
  end if;

  -- Colisao com identidade canonica de outro clube.
  select
    count(*) as row_count,
    count(*) filter (
      where result_status = 'canonical_identity_conflict_other_team'
    ) as status_count,
    count(*) filter (where blocking) as blocking_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 50,
      'canonicalClub', v_team_one_name,
      'alias', v_team_two_name
    )),
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-canonical-conflict-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 1 then
    raise exception 'smoke_canonical_identity_conflict_other_team_failed'
      using errcode = '55000';
  end if;

  -- Redundancia com a identidade do proprio clube.
  select
    count(*) as row_count,
    count(*) filter (where result_status = 'redundant_same_team_identity') as status_count,
    count(*) filter (where blocking) as blocking_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 60,
      'canonicalClub', v_team_one_name,
      'alias', v_team_one_name
    )),
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-redundant-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 1 then
    raise exception 'smoke_redundant_same_team_identity_failed'
      using errcode = '55000';
  end if;

  -- Estrutura proibida e limite Unicode: 160 caracteres multibyte sao validos
  -- e 161 bloqueiam. teamId e action demonstram que nao existe caminho de
  -- reassign ou outra action por linha.
  if char_length(v_alias_unicode_160) <> 160
     or octet_length(v_alias_unicode_160) <= char_length(v_alias_unicode_160)
     or char_length(v_alias_unicode_161) <> 161
     or octet_length(v_alias_unicode_161) <= char_length(v_alias_unicode_161) then
    raise exception 'smoke_unicode_fixture_length_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;

  select
    count(*) as row_count,
    count(*) filter (where result_status = 'invalid_row') as status_count,
    count(*) filter (
      where result_status = 'create'
        and char_length(alias_input) = 160
        and octet_length(alias_input) > char_length(alias_input)
    ) as unicode_valid_count,
    count(*) filter (
      where result_status = 'invalid_row'
        and result_code = 'alias_too_long'
        and char_length(alias_input) = 161
        and octet_length(alias_input) > char_length(alias_input)
    ) as unicode_invalid_count,
    count(*) filter (where result_code = 'invalid_row_fields') as forbidden_count,
    count(*) filter (where result_code = 'alias_too_long') as length_count,
    count(*) filter (where result_code = 'duplicate_line_number') as line_number_count,
    count(*) filter (where blocking) as blocking_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(
      jsonb_build_object(
        'lineNumber', 69,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_unicode_160
      ),
      jsonb_build_object(
        'lineNumber', 70,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_invalid,
        'teamId', v_team_two_id,
        'action', 'reassign'
      ),
      jsonb_build_object(
        'lineNumber', 71,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_unicode_161
      ),
      jsonb_build_object(
        'lineNumber', 72,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_invalid || ' one'
      ),
      jsonb_build_object(
        'lineNumber', 72,
        'canonicalClub', v_team_two_name,
        'alias', v_alias_invalid || ' two'
      )
    ),
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-invalid-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 5
     or v_result.status_count <> 4
     or v_result.unicode_valid_count <> 1
     or v_result.unicode_invalid_count <> 1
     or v_result.forbidden_count <> 1
     or v_result.length_count <> 1
     or v_result.line_number_count <> 2
     or v_result.blocking_count <> 4 then
    raise exception 'smoke_invalid_row_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before
     or exists (
       select 1
       from public.team_aliases a
       where a.normalized_alias in (
         public.normalize_team_identity_v1(v_alias_unicode_160),
         public.normalize_team_identity_v1(v_alias_unicode_161)
       )
     ) then
    raise exception 'smoke_unicode_preview_wrote_data'
      using errcode = '55000';
  end if;

  -- Um apply apenas com 161 caracteres continua bloqueado e sem qualquer
  -- alias ou audit event, preservando a classificacao alias_too_long.
  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;

  select
    count(*) as row_count,
    count(*) filter (
      where result_status = 'invalid_row'
        and result_code = 'alias_too_long'
        and char_length(alias_input) = 161
        and octet_length(alias_input) > char_length(alias_input)
    ) as status_count,
    count(*) filter (where blocking) as blocking_count,
    count(*) filter (where changed) as changed_count,
    max(batch_created_count) as created_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 73,
      'canonicalClub', v_team_one_name,
      'alias', v_alias_unicode_161
    )),
    true,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-unicode-invalid-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 1
     or v_result.changed_count <> 0
     or v_result.created_count <> 0 then
    raise exception 'smoke_unicode_161_apply_contract_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before
     or exists (
       select 1
       from public.team_aliases a
       where a.normalized_alias = public.normalize_team_identity_v1(v_alias_unicode_161)
     ) then
    raise exception 'smoke_unicode_161_apply_wrote_data'
      using errcode = '55000';
  end if;

  -- O caso de 160 caracteres e aplicado efetivamente e gera um unico evento
  -- de auditoria, sempre dentro da transacao que termina em ROLLBACK.
  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;

  select
    count(*) as row_count,
    count(*) filter (
      where result_status = 'create'
        and result_code = 'created'
        and changed
        and char_length(alias_input) = 160
        and octet_length(alias_input) > char_length(alias_input)
    ) as status_count,
    max(batch_created_count) as created_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 74,
      'canonicalClub', v_team_one_name,
      'alias', v_alias_unicode_160
    )),
    true,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    v_request_unicode
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.created_count <> 1 then
    raise exception 'smoke_unicode_160_apply_contract_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before + 1
     or v_audit_count_after <> v_audit_count_before + 1
     or (
       select count(*)
       from public.team_alias_audit_events e
       join public.team_aliases a on a.id = e.team_alias_id
       where e.request_reference = v_request_unicode
         and e.action = 'create'
         and a.team_id = v_team_one_id
         and a.normalized_alias = public.normalize_team_identity_v1(v_alias_unicode_160)
     ) <> 1 then
    raise exception 'smoke_unicode_160_apply_audit_failed'
      using errcode = '55000';
  end if;

  -- Ambiguidade natural quando disponivel; caso contrario, criar um valor
  -- controlado em short_name para os dois clubes reais. A alteracao e local a
  -- esta transacao e sera revertida juntamente com todos os restantes fixtures.
  with identities as (
    select distinct
      t.id as team_id,
      public.normalize_team_identity_v1(identity_value.field_value) as identity_key
    from public.teams t
    cross join lateral (
      values (t.name), (t.short_name), (t.slug), (t.code)
    ) identity_value(field_value)
    where t.country_id = v_country_id
      and identity_value.field_value is not null
      and public.normalize_team_identity_v1(identity_value.field_value) <> ''
  )
  select i.identity_key
  into v_ambiguous_key
  from identities i
  group by i.identity_key
  having count(distinct i.team_id) > 1
  order by i.identity_key
  limit 1;

  if v_ambiguous_key is null then
    v_ambiguous_key := 'amb-' || left(replace(gen_random_uuid()::text, '-', ''), 12);

    update public.teams t
    set short_name = v_ambiguous_key
    where t.id in (v_team_one_id, v_team_two_id);

    if not found then
      raise exception 'smoke_controlled_ambiguity_update_failed'
        using errcode = '55000';
    end if;
  end if;

  select
    count(*) as row_count,
    count(*) filter (where result_status = 'ambiguous_club') as status_count,
    count(*) filter (where blocking) as blocking_count,
    count(*) filter (where resolved_team_id is null) as unresolved_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 80,
      'canonicalClub', v_ambiguous_key,
      'alias', v_alias_ambiguous
    )),
    false,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-ambiguous-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.blocking_count <> 1
     or v_result.unresolved_count <> 1 then
    raise exception 'smoke_ambiguous_club_failed'
      using errcode = '55000';
  end if;

  -- Uma linha create e outra bloqueante: apply devolve o plano e escreve zero.
  select count(*) into v_alias_count_before from public.team_aliases;
  select count(*) into v_audit_count_before from public.team_alias_audit_events;

  select
    count(*) as row_count,
    count(*) filter (where result_status = 'create') as create_status_count,
    count(*) filter (where result_status = 'unknown_club') as blocked_status_count,
    count(*) filter (where blocking) as blocking_count,
    count(*) filter (where changed) as changed_count,
    max(batch_create_count) as create_count,
    max(batch_blocking_count) as batch_block_count,
    max(batch_created_count) as created_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(
      jsonb_build_object(
        'lineNumber', 90,
        'canonicalClub', v_team_one_name,
        'alias', v_alias_mixed
      ),
      jsonb_build_object(
        'lineNumber', 91,
        'canonicalClub', v_unknown_club,
        'alias', 'blocked ' || v_alias_mixed
      )
    ),
    true,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    'batch-smoke-mixed-' || gen_random_uuid()::text
  );

  if v_result.row_count <> 2
     or v_result.create_status_count <> 1
     or v_result.blocked_status_count <> 1
     or v_result.blocking_count <> 1
     or v_result.changed_count <> 0
     or v_result.create_count <> 1
     or v_result.batch_block_count <> 1
     or v_result.created_count <> 0 then
    raise exception 'smoke_mixed_batch_plan_failed'
      using errcode = '55000';
  end if;

  select count(*) into v_alias_count_after from public.team_aliases;
  select count(*) into v_audit_count_after from public.team_alias_audit_events;
  if v_alias_count_after <> v_alias_count_before
     or v_audit_count_after <> v_audit_count_before
     or exists (
       select 1
       from public.team_aliases a
       where a.normalized_alias = public.normalize_team_identity_v1(v_alias_mixed)
     ) then
    raise exception 'smoke_mixed_batch_partial_write_found'
      using errcode = '55000';
  end if;

  -- Apply direto, sem preview correspondente: prova que p_apply=true constroi
  -- e valida o seu proprio plano dentro da chamada.
  select
    count(*) as row_count,
    count(*) filter (
      where result_status = 'create'
        and result_code = 'created'
        and changed
    ) as status_count,
    max(batch_created_count) as created_count
  into v_result
  from public.manage_team_alias_batch(
    v_country_id,
    jsonb_build_array(jsonb_build_object(
      'lineNumber', 100,
      'canonicalClub', v_team_one_name,
      'alias', v_alias_three
    )),
    true,
    'admin_session',
    'batch_smoke',
    'admin_batch_import',
    v_request_direct
  );

  if v_result.row_count <> 1
     or v_result.status_count <> 1
     or v_result.created_count <> 1
     or (
       select count(*)
       from public.team_alias_audit_events e
       where e.request_reference = v_request_direct
         and e.action = 'create'
     ) <> 1 then
    raise exception 'smoke_apply_revalidation_failed'
      using errcode = '55000';
  end if;
end
$smoke$;

rollback;
