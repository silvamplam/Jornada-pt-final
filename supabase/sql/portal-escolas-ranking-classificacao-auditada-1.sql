-- PORTAL-ESCOLAS-RANKING-CLASSIFICACAO-AUDITADA-1
--
-- Objetivo:
-- - criar RPC generica public.portal_recalculate_competition_ranking(uuid, uuid)
--   para recalcular classificacao/ranking de uma competicao a partir de
--   public.portal_result_entries.
--
-- Estado:
-- - aplicado e validado em producao/Supabase.
--
-- Validacoes feitas:
-- - preflight_ready_for_ranking_rpc_design
-- - postflight_ok_function_created_no_ranking_executed
-- - smoke_ok_ranking_recalculated_inside_transaction
-- - final_confirmation_ok_function_persisted_smoke_rolled_back
--
-- Notas:
-- - Nao altera UI, readers, middleware, admin, backoffice ou paginas publicas antigas.
-- - Nao publica ranking: status fica draft e published_at permanece null.
-- - Esta fase guarda a SQL aplicada; nao executar rollback salvo ordem expressa.

-- APPLY

create or replace function public.portal_recalculate_competition_ranking(
  p_portal_competition_id uuid,
  p_portal_ranking_id uuid default null
)
returns table (
  ranking_id uuid,
  ranking_entry_id uuid,
  participant_id uuid,
  participant_name text,
  rank integer,
  points numeric,
  played integer,
  wins integer,
  draws integer,
  losses integer,
  score_for numeric,
  score_against numeric,
  score_difference numeric,
  entry_status text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_auth_user_id uuid := auth.uid();
  v_actor_portal_user_id uuid;
  v_competition record;
  v_ranking_id uuid;
  v_ranking_status text;
  v_has_permission boolean := false;
  v_deleted_stale_entries integer := 0;
  v_upserted_entries integer := 0;
begin
  if v_auth_user_id is null then
    raise exception 'portal_not_authenticated' using errcode = '28000';
  end if;

  if p_portal_competition_id is null then
    raise exception 'portal_invalid_competition' using errcode = '22023';
  end if;

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
    c.slug
  into v_competition
  from public.portal_competitions c
  where c.id = p_portal_competition_id
  limit 1;

  if not found then
    raise exception 'portal_competition_not_found' using errcode = 'P0002';
  end if;

  select exists (
    select 1
    from public.portal_permissions p
    where p.portal_user_id = v_actor_portal_user_id
      and p.status = 'active'
      and p.can_view = true
      and (p.can_edit = true or p.can_validate = true)
      and p.portal_entity_id = v_competition.portal_entity_id
      and (p.portal_context_id is null or p.portal_context_id = v_competition.portal_context_id)
      and (p.portal_competition_id is null or p.portal_competition_id = v_competition.id)
  ) into v_has_permission;

  if not v_has_permission then
    raise exception 'portal_permission_denied' using errcode = '42501';
  end if;

  if p_portal_ranking_id is not null then
    select
      pr.id,
      pr.status
    into
      v_ranking_id,
      v_ranking_status
    from public.portal_rankings pr
    where pr.id = p_portal_ranking_id
      and pr.portal_competition_id = v_competition.id
      and pr.ranking_scope = 'competition'
      and pr.ranking_type = 'overall'
    limit 1;

    if v_ranking_id is null then
      raise exception 'portal_ranking_not_found' using errcode = 'P0002';
    end if;
  else
    select
      pr.id,
      pr.status
    into
      v_ranking_id,
      v_ranking_status
    from public.portal_rankings pr
    where pr.portal_competition_id = v_competition.id
      and pr.ranking_scope = 'competition'
      and pr.ranking_type = 'overall'
    order by
      case when pr.slug = 'competition-overall' then 0 else 1 end,
      pr.created_at asc
    limit 1;
  end if;

  if v_ranking_id is null then
    insert into public.portal_rankings (
      portal_entity_id,
      portal_context_id,
      portal_modality_id,
      portal_competition_id,
      name,
      slug,
      ranking_scope,
      ranking_type,
      calculation_mode,
      source,
      status,
      generated_at,
      published_at,
      rules_snapshot,
      notes,
      metadata,
      updated_at
    ) values (
      v_competition.portal_entity_id,
      v_competition.portal_context_id,
      v_competition.portal_modality_id,
      v_competition.id,
      'Classificacao geral',
      'competition-overall',
      'competition',
      'overall',
      'derived_from_result_entries',
      'portal_result_entries_recalculation',
      'draft',
      now(),
      null,
      jsonb_build_object(
        'source', 'portal_result_entries',
        'included_result_statuses', jsonb_build_array('submitted', 'validated'),
        'ranking_scope', 'competition',
        'ranking_type', 'overall',
        'win_points', 3,
        'draw_points', 1,
        'loss_points', 0,
        'tie_breakers', jsonb_build_array(
          'points',
          'score_difference',
          'score_for',
          'participant_name',
          'portal_participant_id'
        )
      ),
      'Ranking recalculado a partir de portal_result_entries.',
      jsonb_build_object(
        'phase', 'PORTAL-ESCOLAS-RANKING-CLASSIFICACAO-AUDITADA-1',
        'source_function', 'portal_recalculate_competition_ranking',
        'created_by_portal_user_id', v_actor_portal_user_id,
        'created_at', now()
      ),
      now()
    )
    returning public.portal_rankings.id, public.portal_rankings.status
    into v_ranking_id, v_ranking_status;
  else
    update public.portal_rankings pr
    set
      calculation_mode = 'derived_from_result_entries',
      source = 'portal_result_entries_recalculation',
      status = 'draft',
      generated_at = now(),
      published_at = null,
      rules_snapshot = jsonb_build_object(
        'source', 'portal_result_entries',
        'included_result_statuses', jsonb_build_array('submitted', 'validated'),
        'ranking_scope', 'competition',
        'ranking_type', 'overall',
        'win_points', 3,
        'draw_points', 1,
        'loss_points', 0,
        'tie_breakers', jsonb_build_array(
          'points',
          'score_difference',
          'score_for',
          'participant_name',
          'portal_participant_id'
        )
      ),
      notes = coalesce(pr.notes, 'Ranking recalculado a partir de portal_result_entries.'),
      metadata = coalesce(pr.metadata, '{}'::jsonb) || jsonb_build_object(
        'phase', 'PORTAL-ESCOLAS-RANKING-CLASSIFICACAO-AUDITADA-1',
        'source_function', 'portal_recalculate_competition_ranking',
        'last_recalculated_by_portal_user_id', v_actor_portal_user_id,
        'last_recalculated_at', now()
      ),
      updated_at = now()
    where pr.id = v_ranking_id
    returning pr.status into v_ranking_status;
  end if;

  delete from public.portal_ranking_entries pre
  where pre.portal_ranking_id = v_ranking_id
    and not exists (
      select 1
      from public.portal_competition_participants cp
      where cp.portal_competition_id = v_competition.id
        and cp.portal_participant_id = pre.portal_participant_id
    )
    and not exists (
      select 1
      from public.portal_event_participants ep
      join public.portal_events e
        on e.id = ep.portal_event_id
      where e.portal_competition_id = v_competition.id
        and ep.portal_participant_id = pre.portal_participant_id
    );

  get diagnostics v_deleted_stale_entries = row_count;

  create temporary table tmp_portal_ranking_recalculated_entries (
    ranking_id uuid,
    ranking_entry_id uuid,
    participant_id uuid,
    participant_name text,
    rank integer,
    points numeric,
    played integer,
    wins integer,
    draws integer,
    losses integer,
    score_for numeric,
    score_against numeric,
    score_difference numeric,
    entry_status text
  ) on commit drop;

  with participant_pool as (
    select distinct
      cp.portal_entity_id,
      cp.portal_context_id,
      v_competition.portal_modality_id as portal_modality_id,
      cp.portal_competition_id,
      cp.portal_participant_id,
      p.name as participant_name
    from public.portal_competition_participants cp
    join public.portal_participants p
      on p.id = cp.portal_participant_id
    where cp.portal_competition_id = v_competition.id

    union

    select distinct
      ep.portal_entity_id,
      ep.portal_context_id,
      ep.portal_modality_id,
      ep.portal_competition_id,
      ep.portal_participant_id,
      p.name as participant_name
    from public.portal_event_participants ep
    join public.portal_events e
      on e.id = ep.portal_event_id
    join public.portal_participants p
      on p.id = ep.portal_participant_id
    where e.portal_competition_id = v_competition.id
  ),
  eligible_result_entries as (
    select
      re.id,
      re.portal_entity_id,
      re.portal_context_id,
      re.portal_modality_id,
      re.portal_competition_id,
      re.portal_event_id,
      re.portal_participant_id,
      re.score_numeric,
      re.points,
      re.outcome,
      re.result_status
    from public.portal_result_entries re
    join public.portal_events e
      on e.id = re.portal_event_id
    where e.portal_competition_id = v_competition.id
      and re.result_status in ('submitted', 'validated')
      and (
        re.score_numeric is not null
        or re.points is not null
        or re.outcome is not null
      )
  ),
  computed_event_rows as (
    select
      ere.portal_entity_id,
      ere.portal_context_id,
      ere.portal_modality_id,
      ere.portal_competition_id,
      ere.portal_event_id,
      ere.portal_participant_id,
      coalesce(ere.score_numeric, 0) as score_for,
      coalesce(opponent.score_numeric, 0) as score_against,
      coalesce(
        ere.points,
        case
          when opponent.score_numeric is null or ere.score_numeric is null then 0
          when ere.score_numeric > opponent.score_numeric then 3
          when ere.score_numeric = opponent.score_numeric then 1
          else 0
        end
      ) as points,
      coalesce(
        ere.outcome,
        case
          when opponent.score_numeric is null or ere.score_numeric is null then null
          when ere.score_numeric > opponent.score_numeric then 'win'
          when ere.score_numeric = opponent.score_numeric then 'draw'
          else 'loss'
        end
      ) as outcome
    from eligible_result_entries ere
    left join lateral (
      select
        opponent.score_numeric
      from eligible_result_entries opponent
      where opponent.portal_event_id = ere.portal_event_id
        and opponent.portal_participant_id <> ere.portal_participant_id
        and opponent.score_numeric is not null
      order by opponent.portal_participant_id asc
      limit 1
    ) opponent on true
  ),
  ranking_base as (
    select
      pp.portal_entity_id,
      pp.portal_context_id,
      pp.portal_modality_id,
      pp.portal_competition_id,
      pp.portal_participant_id,
      pp.participant_name,
      count(cer.portal_event_id)::integer as played,
      count(cer.portal_event_id) filter (where cer.outcome = 'win')::integer as wins,
      count(cer.portal_event_id) filter (where cer.outcome = 'draw')::integer as draws,
      count(cer.portal_event_id) filter (where cer.outcome = 'loss')::integer as losses,
      coalesce(sum(cer.points), 0)::numeric as points,
      coalesce(sum(cer.score_for), 0)::numeric as score_for,
      coalesce(sum(cer.score_against), 0)::numeric as score_against,
      coalesce(sum(cer.score_for - cer.score_against), 0)::numeric as score_difference
    from participant_pool pp
    left join computed_event_rows cer
      on cer.portal_competition_id = pp.portal_competition_id
     and cer.portal_participant_id = pp.portal_participant_id
    group by
      pp.portal_entity_id,
      pp.portal_context_id,
      pp.portal_modality_id,
      pp.portal_competition_id,
      pp.portal_participant_id,
      pp.participant_name
  ),
  computed_ranking as (
    select
      (rank() over (
        partition by rb.portal_competition_id
        order by
          rb.points desc,
          rb.score_difference desc,
          rb.score_for desc,
          rb.participant_name asc,
          rb.portal_participant_id asc
      ))::integer as proposed_rank,
      rb.*
    from ranking_base rb
  ),
  upserted as (
    insert into public.portal_ranking_entries (
      portal_entity_id,
      portal_context_id,
      portal_modality_id,
      portal_competition_id,
      portal_ranking_id,
      portal_participant_id,
      rank,
      position_label,
      points,
      played,
      wins,
      draws,
      losses,
      score_for,
      score_against,
      score_difference,
      tie_breaker_values,
      status,
      metadata,
      updated_at
    )
    select
      cr.portal_entity_id,
      cr.portal_context_id,
      cr.portal_modality_id,
      cr.portal_competition_id,
      v_ranking_id,
      cr.portal_participant_id,
      cr.proposed_rank,
      cr.proposed_rank::text,
      cr.points,
      cr.played,
      cr.wins,
      cr.draws,
      cr.losses,
      cr.score_for,
      cr.score_against,
      cr.score_difference,
      jsonb_build_object(
        'points', cr.points,
        'score_difference', cr.score_difference,
        'score_for', cr.score_for,
        'participant_name', cr.participant_name,
        'portal_participant_id', cr.portal_participant_id
      ),
      'active',
      jsonb_build_object(
        'phase', 'PORTAL-ESCOLAS-RANKING-CLASSIFICACAO-AUDITADA-1',
        'source', 'portal_result_entries',
        'recalculated_at', now(),
        'recalculated_by_portal_user_id', v_actor_portal_user_id
      ),
      now()
    from computed_ranking cr
    on conflict (portal_ranking_id, portal_participant_id)
    do update set
      portal_entity_id = excluded.portal_entity_id,
      portal_context_id = excluded.portal_context_id,
      portal_modality_id = excluded.portal_modality_id,
      portal_competition_id = excluded.portal_competition_id,
      rank = excluded.rank,
      position_label = excluded.position_label,
      points = excluded.points,
      played = excluded.played,
      wins = excluded.wins,
      draws = excluded.draws,
      losses = excluded.losses,
      score_for = excluded.score_for,
      score_against = excluded.score_against,
      score_difference = excluded.score_difference,
      tie_breaker_values = excluded.tie_breaker_values,
      status = excluded.status,
      metadata = coalesce(public.portal_ranking_entries.metadata, '{}'::jsonb) || excluded.metadata,
      updated_at = now()
    returning
      public.portal_ranking_entries.id,
      public.portal_ranking_entries.portal_ranking_id,
      public.portal_ranking_entries.portal_participant_id,
      public.portal_ranking_entries.rank,
      public.portal_ranking_entries.points,
      public.portal_ranking_entries.played,
      public.portal_ranking_entries.wins,
      public.portal_ranking_entries.draws,
      public.portal_ranking_entries.losses,
      public.portal_ranking_entries.score_for,
      public.portal_ranking_entries.score_against,
      public.portal_ranking_entries.score_difference,
      public.portal_ranking_entries.status
  )
  insert into tmp_portal_ranking_recalculated_entries (
    ranking_id,
    ranking_entry_id,
    participant_id,
    participant_name,
    rank,
    points,
    played,
    wins,
    draws,
    losses,
    score_for,
    score_against,
    score_difference,
    entry_status
  )
  select
    u.portal_ranking_id,
    u.id,
    u.portal_participant_id,
    p.name,
    u.rank,
    u.points,
    u.played,
    u.wins,
    u.draws,
    u.losses,
    u.score_for,
    u.score_against,
    u.score_difference,
    u.status
  from upserted u
  join public.portal_participants p
    on p.id = u.portal_participant_id;

  get diagnostics v_upserted_entries = row_count;

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
    'portal_competition_ranking_recalculated',
    'portal_rankings',
    v_ranking_id,
    v_ranking_status,
    v_ranking_status,
    jsonb_build_object(
      'phase', 'PORTAL-ESCOLAS-RANKING-CLASSIFICACAO-AUDITADA-1',
      'source_function', 'portal_recalculate_competition_ranking',
      'portal_ranking_id', v_ranking_id,
      'deleted_stale_entries', v_deleted_stale_entries,
      'upserted_entries', v_upserted_entries,
      'calculation_mode', 'derived_from_result_entries',
      'source', 'portal_result_entries_recalculation',
      'result_statuses', jsonb_build_array('submitted', 'validated'),
      'ranking_status', v_ranking_status,
      'published_at', null
    )
  );

  return query
  select
    t.ranking_id,
    t.ranking_entry_id,
    t.participant_id,
    t.participant_name,
    t.rank,
    t.points,
    t.played,
    t.wins,
    t.draws,
    t.losses,
    t.score_for,
    t.score_against,
    t.score_difference,
    t.entry_status
  from tmp_portal_ranking_recalculated_entries t
  order by
    t.rank asc,
    t.participant_name asc,
    t.participant_id asc;
end;
$$;

revoke all on function public.portal_recalculate_competition_ranking(uuid, uuid) from public;
grant execute on function public.portal_recalculate_competition_ranking(uuid, uuid) to authenticated;

comment on function public.portal_recalculate_competition_ranking(uuid, uuid)
is 'Audited Portal das Escolas competition ranking recalculation from portal_result_entries. Requires active portal_user and active can_edit or can_validate permission scoped to the competition. Keeps ranking draft and unpublished.';

-- ROLLBACK GUARDADO
--
-- Executar rollback apenas por ordem expressa.
-- Este bloco esta comentado para impedir execucao acidental.
--
-- drop function if exists public.portal_recalculate_competition_ranking(uuid, uuid);
