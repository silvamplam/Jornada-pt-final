-- PORTAL-ESCOLAS-EVENTOS-CRIACAO-AUDITADA-1
-- SQL 2/5 — APLICAR
--
-- Objetivo:
-- Criar função controlada para criação auditada de evento/jornada
-- associado a uma competição e estrutura competitiva existentes.
--
-- Escopo:
-- - cria/atualiza apenas public.portal_create_competition_event(...);
-- - escrita controlada em public.portal_events;
-- - escrita opcional em public.portal_event_participants;
-- - auditoria em public.portal_audit_events;
-- - autorização por portal_user ativo + permissão ativa;
-- - evento nasce sempre em draft/Rascunho;
-- - participantes do evento nascem sempre em draft/Rascunho;
-- - exige competição existente;
-- - exige formato competitivo formal existente;
-- - exige estrutura competitiva não arquivada existente;
-- - se forem passados participantes, exige que estejam inscritos na competição;
-- - NÃO cria resultados;
-- - NÃO cria rankings;
-- - NÃO publica;
-- - sem UI;
-- - sem /admin;
-- - sem backoffice;
-- - sem páginas públicas antigas.

begin;

create or replace function public.portal_create_competition_event(
  p_portal_competition_id uuid,
  p_name text,
  p_portal_stage_id uuid default null,
  p_type text default 'match',
  p_event_order integer default null,
  p_scheduled_at timestamptz default null,
  p_venue text default null,
  p_notes text default null,
  p_participant_ids uuid[] default '{}'::uuid[],
  p_status text default 'draft'
)
returns table (
  result_event_id uuid,
  result_portal_entity_id uuid,
  result_portal_context_id uuid,
  result_portal_modality_id uuid,
  result_portal_competition_id uuid,
  result_portal_stage_id uuid,
  result_name text,
  result_slug text,
  result_type text,
  result_event_order integer,
  result_scheduled_at timestamptz,
  result_venue text,
  result_status text,
  result_notes text,
  result_event_participant_count integer
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
  v_stage record;
  v_name text;
  v_type text;
  v_venue text;
  v_notes text;
  v_status text := coalesce(nullif(btrim(p_status), ''), 'draft');
  v_has_permission boolean := false;
  v_event_order integer;
  v_slug_base text;
  v_slug text;
  v_slug_suffix integer := 1;
  v_event_id uuid;
  v_participant_ids uuid[];
  v_participant_count integer := 0;
  v_invalid_participant_count integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'portal_not_authenticated' using errcode = '28000';
  end if;

  if p_portal_competition_id is null then
    raise exception 'portal_invalid_competition' using errcode = '22023';
  end if;

  if v_status <> 'draft' then
    raise exception 'portal_event_initial_status_must_be_draft' using errcode = '22023';
  end if;

  v_name := nullif(btrim(coalesce(p_name, '')), '');

  if v_name is null then
    raise exception 'portal_event_name_required' using errcode = '22023';
  end if;

  v_type := nullif(btrim(coalesce(p_type, '')), '');

  if v_type is null then
    v_type := 'match';
  end if;

  if p_event_order is not null and p_event_order < 1 then
    raise exception 'portal_event_order_invalid' using errcode = '22023';
  end if;

  v_venue := nullif(btrim(coalesce(p_venue, '')), '');
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
    raise exception 'portal_competition_not_available_for_event_creation' using errcode = '42501';
  end if;

  if v_competition.portal_modality_id is null then
    raise exception 'portal_competition_missing_modality' using errcode = '42501';
  end if;

  if coalesce(v_competition.modality_status, '') not in ('draft', 'active') then
    raise exception 'portal_modality_not_available_for_event_creation' using errcode = '42501';
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
    raise exception 'portal_competition_format_required_before_events' using errcode = '42501';
  end if;

  select
    s.id,
    s.portal_entity_id,
    s.portal_context_id,
    s.portal_competition_id,
    s.name,
    s.type,
    s.stage_order,
    s.status
  into v_stage
  from public.portal_stages s
  where s.portal_entity_id = v_competition.portal_entity_id
    and s.portal_context_id = v_competition.portal_context_id
    and s.portal_competition_id = v_competition.id
    and s.status <> 'archived'
    and (
      p_portal_stage_id is null
      or s.id = p_portal_stage_id
    )
  order by s.stage_order asc nulls last, s.created_at asc
  limit 1;

  if not found then
    raise exception 'portal_competition_structure_required_before_events' using errcode = '42501';
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
    raise exception 'portal_competition_event_create_not_allowed' using errcode = '42501';
  end if;

  select coalesce(
    array_agg(x.portal_participant_id order by x.first_ord),
    '{}'::uuid[]
  )
  into v_participant_ids
  from (
    select
      u.portal_participant_id,
      min(u.ord) as first_ord
    from unnest(coalesce(p_participant_ids, '{}'::uuid[])) with ordinality as u(portal_participant_id, ord)
    where u.portal_participant_id is not null
    group by u.portal_participant_id
  ) x;

  v_participant_count := coalesce(array_length(v_participant_ids, 1), 0);

  if v_participant_count > 0 then
    select count(*)
    into v_invalid_participant_count
    from unnest(v_participant_ids) as requested(portal_participant_id)
    where not exists (
      select 1
      from public.portal_competition_participants cp
      join public.portal_participants pp
        on pp.id = cp.portal_participant_id
      where cp.portal_entity_id = v_competition.portal_entity_id
        and cp.portal_context_id = v_competition.portal_context_id
        and cp.portal_competition_id = v_competition.id
        and cp.portal_participant_id = requested.portal_participant_id
        and cp.registration_status <> 'archived'
        and pp.status <> 'archived'
    );

    if v_invalid_participant_count > 0 then
      raise exception 'portal_event_participant_not_registered_in_competition' using errcode = '42501';
    end if;
  end if;

  if exists (
    select 1
    from public.portal_events e
    where e.portal_entity_id = v_competition.portal_entity_id
      and e.portal_context_id = v_competition.portal_context_id
      and e.portal_competition_id = v_competition.id
      and e.portal_stage_id = v_stage.id
      and e.status <> 'archived'
      and lower(btrim(e.name)) = lower(v_name)
  ) then
    raise exception 'portal_competition_event_name_already_exists' using errcode = '23505';
  end if;

  if p_event_order is null then
    select coalesce(max(e.event_order), 0) + 1
    into v_event_order
    from public.portal_events e
    where e.portal_entity_id = v_competition.portal_entity_id
      and e.portal_context_id = v_competition.portal_context_id
      and e.portal_competition_id = v_competition.id
      and e.portal_stage_id = v_stage.id
      and e.status <> 'archived';
  else
    v_event_order := p_event_order;
  end if;

  v_slug_base := lower(
    regexp_replace(
      regexp_replace(
        coalesce(v_competition.slug, 'competicao') || '-' || v_name,
        '[^a-zA-Z0-9]+',
        '-',
        'g'
      ),
      '(^-|-$)',
      '',
      'g'
    )
  );

  if v_slug_base is null or v_slug_base = '' then
    v_slug_base := 'portal-evento-' || v_event_order::text;
  end if;

  v_slug := v_slug_base;

  while exists (
    select 1
    from public.portal_events e
    where e.slug = v_slug
  ) loop
    v_slug_suffix := v_slug_suffix + 1;
    v_slug := v_slug_base || '-' || v_slug_suffix::text;
  end loop;

  insert into public.portal_events (
    portal_entity_id,
    portal_context_id,
    portal_modality_id,
    portal_competition_id,
    portal_stage_id,
    name,
    slug,
    type,
    event_order,
    scheduled_at,
    venue,
    status,
    notes,
    metadata
  ) values (
    v_competition.portal_entity_id,
    v_competition.portal_context_id,
    v_competition.portal_modality_id,
    v_competition.id,
    v_stage.id,
    v_name,
    v_slug,
    v_type,
    v_event_order,
    p_scheduled_at,
    v_venue,
    'draft',
    v_notes,
    jsonb_build_object(
      'phase', 'PORTAL-ESCOLAS-EVENTOS-CRIACAO-AUDITADA-1',
      'source_function', 'portal_create_competition_event',
      'competition_format_id', v_format.id,
      'competition_format_code', v_format.code,
      'competition_format_family', v_format.format_family,
      'event_model', v_format.event_model,
      'result_model', v_format.result_model,
      'ranking_model', v_format.ranking_model,
      'portal_stage_id', v_stage.id,
      'participant_count', v_participant_count
    )
  )
  returning id into v_event_id;

  if v_participant_count > 0 then
    insert into public.portal_event_participants (
      portal_entity_id,
      portal_context_id,
      portal_modality_id,
      portal_competition_id,
      portal_stage_id,
      portal_event_id,
      portal_participant_id,
      role,
      lane,
      bib_number,
      seed_order,
      group_label,
      status,
      metadata
    )
    select
      v_competition.portal_entity_id,
      v_competition.portal_context_id,
      v_competition.portal_modality_id,
      v_competition.id,
      v_stage.id,
      v_event_id,
      cp.portal_participant_id,
      'participant',
      null,
      null,
      coalesce(cp.seed_order, requested.ord::integer),
      cp.group_label,
      'draft',
      jsonb_build_object(
        'phase', 'PORTAL-ESCOLAS-EVENTOS-CRIACAO-AUDITADA-1',
        'source_function', 'portal_create_competition_event',
        'portal_competition_participant_id', cp.id,
        'registration_status', cp.registration_status
      )
    from unnest(v_participant_ids) with ordinality as requested(portal_participant_id, ord)
    join public.portal_competition_participants cp
      on cp.portal_participant_id = requested.portal_participant_id
     and cp.portal_entity_id = v_competition.portal_entity_id
     and cp.portal_context_id = v_competition.portal_context_id
     and cp.portal_competition_id = v_competition.id
     and cp.registration_status <> 'archived';
  end if;

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
    'portal_competition_event_created',
    'portal_events',
    v_event_id,
    null,
    'draft',
    jsonb_build_object(
      'phase', 'PORTAL-ESCOLAS-EVENTOS-CRIACAO-AUDITADA-1',
      'source_function', 'portal_create_competition_event',
      'portal_modality_id', v_competition.portal_modality_id,
      'portal_competition_id', v_competition.id,
      'portal_stage_id', v_stage.id,
      'competition_format_id', v_format.id,
      'competition_format_code', v_format.code,
      'competition_format_family', v_format.format_family,
      'event_model', v_format.event_model,
      'result_model', v_format.result_model,
      'ranking_model', v_format.ranking_model,
      'participant_ids', v_participant_ids,
      'event_participant_count', v_participant_count,
      'new', jsonb_build_object(
        'name', v_name,
        'slug', v_slug,
        'type', v_type,
        'event_order', v_event_order,
        'scheduled_at', p_scheduled_at,
        'venue', v_venue,
        'status', 'draft',
        'notes', v_notes
      )
    )
  );

  return query
  select
    e.id,
    e.portal_entity_id,
    e.portal_context_id,
    e.portal_modality_id,
    e.portal_competition_id,
    e.portal_stage_id,
    e.name,
    e.slug,
    e.type,
    e.event_order,
    e.scheduled_at,
    e.venue,
    e.status,
    e.notes,
    (
      select count(*)::integer
      from public.portal_event_participants ep
      where ep.portal_event_id = e.id
    ) as result_event_participant_count
  from public.portal_events e
  where e.id = v_event_id;
end;
$$;

revoke all on function public.portal_create_competition_event(
  uuid,
  text,
  uuid,
  text,
  integer,
  timestamptz,
  text,
  text,
  uuid[],
  text
) from public;

grant execute on function public.portal_create_competition_event(
  uuid,
  text,
  uuid,
  text,
  integer,
  timestamptz,
  text,
  text,
  uuid[],
  text
) to authenticated;

comment on function public.portal_create_competition_event(
  uuid,
  text,
  uuid,
  text,
  integer,
  timestamptz,
  text,
  text,
  uuid[],
  text
)
is 'Controlled Portal das Escolas function to create an audited draft event and optional draft event participants. Requires active portal user, active scoped can_view/can_create/can_edit permission, existing competition format, existing non-archived stage, and registered competition participants when participant IDs are provided. Does not create results or rankings.';

commit;
