-- PORTAL-ESCOLAS-PARTICIPANTES-CRIACAO-AUDITADA-1
-- SQL 2/5 — APLICAR
--
-- Objetivo:
-- Criar função controlada para criação auditada de participante
-- associado a uma competição existente.
--
-- Validação em produção:
-- - preflight: ready_for_apply_sql;
-- - postflight: ready_for_smoke;
-- - smoke corrigido com ROLLBACK: ok;
-- - confirmação final após ROLLBACK: validated_sql_phase.
--
-- Escopo:
-- - cria/atualiza apenas public.portal_create_competition_participant(...);
-- - escrita controlada em public.portal_participants;
-- - escrita controlada em public.portal_competition_participants;
-- - auditoria em public.portal_audit_events;
-- - autorização por portal_user ativo + permissão ativa;
-- - participante nasce sempre em draft/Rascunho;
-- - inscrição na competição nasce sempre em draft/Rascunho;
-- - exige competição existente;
-- - exige formato competitivo formal existente;
-- - exige estrutura competitiva não arquivada existente;
-- - NÃO cria eventos;
-- - NÃO cria resultados;
-- - NÃO cria rankings;
-- - NÃO publica;
-- - sem UI;
-- - sem /admin;
-- - sem backoffice;
-- - sem páginas públicas antigas.

begin;

create or replace function public.portal_create_competition_participant(
  p_portal_competition_id uuid,
  p_name text,
  p_type text default 'participant',
  p_group_label text default null,
  p_seed_order integer default null,
  p_external_reference text default null,
  p_notes text default null,
  p_status text default 'draft',
  p_registration_status text default 'draft'
)
returns table (
  result_competition_participant_id uuid,
  result_participant_id uuid,
  result_portal_entity_id uuid,
  result_portal_context_id uuid,
  result_portal_competition_id uuid,
  result_name text,
  result_type text,
  result_participant_status text,
  result_registration_status text,
  result_group_label text,
  result_seed_order integer,
  result_external_reference text,
  result_notes text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_portal_user_id uuid;
  v_competition record;
  v_format record;
  v_name text;
  v_type text;
  v_group_label text;
  v_external_reference text;
  v_notes text;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'draft');
  v_registration_status text := coalesce(nullif(btrim(p_registration_status), ''), 'draft');
  v_has_permission boolean := false;
  v_structure_count integer := 0;
  v_participant_id uuid;
  v_competition_participant_id uuid;
begin
  if v_auth_user_id is null then
    raise exception 'portal_not_authenticated' using errcode = '28000';
  end if;

  if p_portal_competition_id is null then
    raise exception 'portal_invalid_competition' using errcode = '22023';
  end if;

  if v_status <> 'draft' then
    raise exception 'portal_participant_initial_status_must_be_draft' using errcode = '22023';
  end if;

  if v_registration_status <> 'draft' then
    raise exception 'portal_competition_participant_initial_status_must_be_draft' using errcode = '22023';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');

  if v_name is null then
    raise exception 'portal_participant_name_required' using errcode = '22023';
  end if;

  v_type := nullif(btrim(coalesce(p_type, '')), '');

  if v_type is null then
    v_type := 'participant';
  end if;

  if p_seed_order is not null and p_seed_order < 0 then
    raise exception 'portal_competition_participant_seed_order_invalid' using errcode = '22023';
  end if;

  v_group_label := nullif(btrim(coalesce(p_group_label, '')), '');
  v_external_reference := nullif(btrim(coalesce(p_external_reference, '')), '');
  v_notes := nullif(btrim(coalesce(p_notes, '')), '');

  select
    u.id
  into v_actor_portal_user_id
  from public.portal_users u
  where u.auth_user_id = v_auth_user_id
    and u.status = 'active'
  limit 1;

  if v_actor_portal_user_id is null then
    raise exception 'portal_user_not_found' using errcode = 'P0002';
  end if;

  select
    c.id,
    c.portal_entity_id,
    c.portal_context_id,
    c.portal_modality_id,
    c.name,
    c.slug,
    c.status as competition_status,
    pc.status as context_status,
    pm.name as modality_name,
    pm.slug as modality_slug,
    pm.status as modality_status
  into v_competition
  from public.portal_competitions c
  join public.portal_contexts pc
    on pc.id = c.portal_context_id
   and pc.portal_entity_id = c.portal_entity_id
  left join public.portal_modalities pm
    on pm.id = c.portal_modality_id
   and pm.portal_context_id = c.portal_context_id
   and pm.portal_entity_id = c.portal_entity_id
  where c.id = p_portal_competition_id
  limit 1;

  if not found then
    raise exception 'portal_competition_not_found' using errcode = 'P0002';
  end if;

  if v_competition.context_status <> 'active' then
    raise exception 'portal_context_not_active' using errcode = '42501';
  end if;

  if v_competition.competition_status not in ('draft', 'active') then
    raise exception 'portal_competition_not_available_for_participant_creation' using errcode = '42501';
  end if;

  if v_competition.portal_modality_id is null then
    raise exception 'portal_competition_missing_modality' using errcode = '42501';
  end if;

  if coalesce(v_competition.modality_status, '') not in ('draft', 'active') then
    raise exception 'portal_modality_not_available_for_participant_creation' using errcode = '42501';
  end if;

  select
    f.id,
    f.name,
    f.code,
    f.format_scope,
    f.format_family,
    f.event_model,
    f.result_model,
    f.ranking_model,
    f.status
  into v_format
  from public.portal_competition_formats f
  where f.portal_entity_id = v_competition.portal_entity_id
    and f.portal_context_id = v_competition.portal_context_id
    and f.portal_modality_id = v_competition.portal_modality_id
    and f.portal_competition_id = v_competition.id
    and f.format_scope = 'competition'
    and f.status in ('draft', 'active')
  order by f.created_at desc nulls last
  limit 1;

  if not found then
    raise exception 'portal_competition_format_required_before_participants' using errcode = '42501';
  end if;

  select count(*)
  into v_structure_count
  from public.portal_stages s
  where s.portal_entity_id = v_competition.portal_entity_id
    and s.portal_context_id = v_competition.portal_context_id
    and s.portal_competition_id = v_competition.id
    and s.status <> 'archived';

  if coalesce(v_structure_count, 0) < 1 then
    raise exception 'portal_competition_structure_required_before_participants' using errcode = '42501';
  end if;

  select exists (
    select 1
    from public.portal_permissions p
    where p.portal_user_id = v_actor_portal_user_id
      and p.status = 'active'
      and p.can_view = true
      and p.can_create = true
      and p.can_edit = true
      and p.portal_entity_id = v_competition.portal_entity_id
      and (
        p.portal_context_id is null
        or p.portal_context_id = v_competition.portal_context_id
      )
      and (
        p.portal_competition_id is null
        or p.portal_competition_id = v_competition.id
      )
  ) into v_has_permission;

  if not v_has_permission then
    raise exception 'portal_competition_participant_create_not_allowed' using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.portal_competition_participants cp
    join public.portal_participants pp
      on pp.id = cp.portal_participant_id
    where cp.portal_entity_id = v_competition.portal_entity_id
      and cp.portal_context_id = v_competition.portal_context_id
      and cp.portal_competition_id = v_competition.id
      and cp.registration_status <> 'archived'
      and pp.status <> 'archived'
      and lower(btrim(pp.name)) = lower(v_name)
  ) then
    raise exception 'portal_competition_participant_name_already_exists' using errcode = '23505';
  end if;

  insert into public.portal_participants (
    portal_entity_id,
    name,
    type,
    external_reference,
    status,
    notes
  ) values (
    v_competition.portal_entity_id,
    v_name,
    v_type,
    v_external_reference,
    'draft',
    v_notes
  )
  returning id into v_participant_id;

  insert into public.portal_competition_participants (
    portal_entity_id,
    portal_context_id,
    portal_competition_id,
    portal_participant_id,
    registration_status,
    group_label,
    seed_order
  ) values (
    v_competition.portal_entity_id,
    v_competition.portal_context_id,
    v_competition.id,
    v_participant_id,
    'draft',
    v_group_label,
    p_seed_order
  )
  returning id into v_competition_participant_id;

  insert into public.portal_audit_events (
    portal_entity_id,
    portal_context_id,
    portal_competition_id,
    actor_reference,
    actor_portal_user_id,
    action_type,
    object_type,
    object_id,
    previous_status,
    new_status,
    metadata
  ) values (
    v_competition.portal_entity_id,
    v_competition.portal_context_id,
    v_competition.id,
    v_auth_user_id::text,
    v_actor_portal_user_id,
    'portal_competition_participant_created',
    'portal_competition_participants',
    v_competition_participant_id,
    null,
    'draft',
    jsonb_build_object(
      'phase', 'PORTAL-ESCOLAS-PARTICIPANTES-CRIACAO-AUDITADA-1',
      'source_function', 'portal_create_competition_participant',
      'portal_modality_id', v_competition.portal_modality_id,
      'portal_competition_id', v_competition.id,
      'competition_format_id', v_format.id,
      'competition_format_code', v_format.code,
      'competition_format_family', v_format.format_family,
      'existing_structure_count', v_structure_count,
      'portal_participant_id', v_participant_id,
      'portal_competition_participant_id', v_competition_participant_id,
      'new', jsonb_build_object(
        'name', v_name,
        'type', v_type,
        'participant_status', 'draft',
        'registration_status', 'draft',
        'group_label', v_group_label,
        'seed_order', p_seed_order,
        'external_reference', v_external_reference,
        'notes', v_notes
      )
    )
  );

  return query
  select
    cp.id,
    pp.id,
    cp.portal_entity_id,
    cp.portal_context_id,
    cp.portal_competition_id,
    pp.name,
    pp.type,
    pp.status,
    cp.registration_status,
    cp.group_label,
    cp.seed_order,
    pp.external_reference,
    pp.notes
  from public.portal_competition_participants cp
  join public.portal_participants pp
    on pp.id = cp.portal_participant_id
  where cp.id = v_competition_participant_id;
end;
$$;

revoke all on function public.portal_create_competition_participant(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text
) from public;

grant execute on function public.portal_create_competition_participant(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text
) to authenticated;

comment on function public.portal_create_competition_participant(
  uuid,
  text,
  text,
  text,
  integer,
  text,
  text,
  text,
  text
)
is 'Controlled Portal das Escolas function to create an audited draft participant and draft competition registration. Requires active portal user, active scoped can_view/can_create/can_edit permission, existing competition format and existing non-archived structure. Does not create events, results or rankings.';

commit;
