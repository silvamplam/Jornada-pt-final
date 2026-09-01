begin;

-- ============================================================
-- LOTE 6 / PASSO 2 - ACTIVATION AUTORITATIVA
--
-- A transacao instala a nova fronteira de escrita, limpa apenas estado live
-- residual ou explicitamente decidido, prova ausencia de duplicacoes e so
-- depois instala a exclusividade transversal.
-- ============================================================

-- Writers diretos ja possuem ROW EXCLUSIVE na sua superficie quando entram
-- no trigger da Bridge. RPCs/core adquirem estas mesmas tabelas, nesta ordem,
-- antes de tocar placements. A Activation toma primeiro o lock conflitante:
-- writers em voo terminam sem encontrar placements bloqueados e writers
-- seguintes aguardam antes da primeira mutacao.
lock table
  public.matchday_editorials,
  public.matchday_highlights,
  public.matchday_horizontal_news,
  public.matchday_live_layout_items,
  public.matchday_editorial_profile_zone_items
in share row exclusive mode;

-- Com as superficies fechadas, nenhum writer novo consegue adquirir o lock
-- partilhado da Bridge. O exclusive drena qualquer RPC que tenha entrado antes
-- da cerca e permanece ate ao COMMIT da mudanca autoritativa.
do $rollout_fence$
declare
  v_authority_mode text;
begin
  perform pg_catalog.pg_advisory_xact_lock(6026, 2);

  select control_row.authority_mode
  into v_authority_mode
  from jornada_private.matchday_live_layout_cutover_control as control_row
  where control_row.scope = 'live_layout';

  if v_authority_mode is distinct from 'bridge' then
    raise exception 'matchday-live-layout-activation-bridge-not-ready';
  end if;
end;
$rollout_fence$;

lock table
  jornada_private.matchday_live_layout_cutover_control,
  public.matchdays,
  public.matchday_editorial_desk_control,
  public.matchday_reference_compositions,
  public.matchday_editorial_bank_items,
  public.matchday_live_layout_placements,
  public.matchday_live_layout_bank_item_state_memory,
  public.matchday_live_layout_zones,
  public.matchday_editorial_profile_reconcile_control,
  public.matchday_latest_news,
  public.matchday_roundup_items,
  jornada_private.matchday_live_layout_zone_legacy_projection,
  jornada_private.matchday_live_layout_placement_shadow_sync_queue
in share row exclusive mode;

do $queue_precondition$
begin
  if exists (
    select 1
    from jornada_private.matchday_live_layout_placement_shadow_sync_queue
  ) then
    raise exception 'matchday-live-layout-cutover-queue-not-empty';
  end if;
end;
$queue_precondition$;

-- ============================================================
-- 1. O COALESCER DO LOTE 4 PASSA DE REVERSE WRITER A DRIFT GUARD
-- ============================================================

alter table jornada_private.matchday_live_layout_placement_shadow_sync_queue
  add column legacy_changed boolean not null default false,
  add column bank_changed boolean not null default false;

create or replace function
  jornada_private.enqueue_matchday_live_layout_placement_shadow_sync()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_legacy_changed boolean := true;
  v_bank_changed boolean := false;
  v_matchday_id uuid;
begin
  if tg_table_schema = 'public'
    and tg_table_name = 'matchday_editorial_bank_items'
  then
    v_legacy_changed := false;
    v_bank_changed := tg_op = 'DELETE';

    if tg_op in ('INSERT', 'UPDATE') then
      v_bank_changed := v_bank_changed or exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = new.matchday_id
          and placement_row.bank_item_id = new.id
      );
    end if;

    if tg_op = 'UPDATE' then
      v_bank_changed := v_bank_changed or exists (
        select 1
        from public.matchday_live_layout_placements as placement_row
        where placement_row.matchday_id = old.matchday_id
          and placement_row.bank_item_id = old.id
      );
    end if;

    if not v_bank_changed then
      return null;
    end if;
  end if;

  if tg_op in ('UPDATE', 'DELETE') then
    v_matchday_id := old.matchday_id;

    insert into jornada_private.matchday_live_layout_placement_shadow_sync_queue (
      backend_pid,
      transaction_id,
      matchday_id,
      legacy_changed,
      bank_changed
    ) values (
      pg_catalog.pg_backend_pid(),
      pg_catalog.pg_current_xact_id(),
      v_matchday_id,
      v_legacy_changed,
      v_bank_changed
    )
    on conflict (backend_pid, transaction_id, matchday_id)
    do update set
      legacy_changed =
        jornada_private.matchday_live_layout_placement_shadow_sync_queue.legacy_changed
        or excluded.legacy_changed,
      bank_changed =
        jornada_private.matchday_live_layout_placement_shadow_sync_queue.bank_changed
        or excluded.bank_changed;
  end if;

  if tg_op in ('INSERT', 'UPDATE') then
    v_matchday_id := new.matchday_id;

    insert into jornada_private.matchday_live_layout_placement_shadow_sync_queue (
      backend_pid,
      transaction_id,
      matchday_id,
      legacy_changed,
      bank_changed
    ) values (
      pg_catalog.pg_backend_pid(),
      pg_catalog.pg_current_xact_id(),
      v_matchday_id,
      v_legacy_changed,
      v_bank_changed
    )
    on conflict (backend_pid, transaction_id, matchday_id)
    do update set
      legacy_changed =
        jornada_private.matchday_live_layout_placement_shadow_sync_queue.legacy_changed
        or excluded.legacy_changed,
      bank_changed =
        jornada_private.matchday_live_layout_placement_shadow_sync_queue.bank_changed
        or excluded.bank_changed;
  end if;

  return null;
end;
$function$;

revoke all on function
  jornada_private.enqueue_matchday_live_layout_placement_shadow_sync()
from public, anon, authenticated, service_role;

create or replace function
  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_legacy_matchday_ids uuid[];
  v_bank_only_matchday_ids uuid[];
  v_all_matchday_ids uuid[];
begin
  select
    pg_catalog.array_agg(queue_row.matchday_id order by queue_row.matchday_id),
    pg_catalog.array_agg(queue_row.matchday_id order by queue_row.matchday_id)
      filter (where queue_row.legacy_changed),
    pg_catalog.array_agg(queue_row.matchday_id order by queue_row.matchday_id)
      filter (where queue_row.bank_changed and not queue_row.legacy_changed)
  into
    v_all_matchday_ids,
    v_legacy_matchday_ids,
    v_bank_only_matchday_ids
  from jornada_private.matchday_live_layout_placement_shadow_sync_queue
    as queue_row
  where queue_row.backend_pid = pg_catalog.pg_backend_pid()
    and queue_row.transaction_id = pg_catalog.pg_current_xact_id();

  if v_all_matchday_ids is null
    or pg_catalog.cardinality(v_all_matchday_ids) = 0
  then
    return null;
  end if;

  -- Um write legacy pode atualizar snapshots, mas nao pode mudar a ocupacao.
  -- A comparacao e feita no estado final da transacao e nunca escolhe winner.
  if v_legacy_matchday_ids is not null and exists (
    select 1
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      v_legacy_matchday_ids
    ) as derived_row
    where derived_row.bank_candidate_count <> 1
      or derived_row.slot_source_count <> 1
      or derived_row.invalid_slot_position
      or (
        derived_row.placement_type = 'zone'
        and derived_row.zone_candidate_count <> 1
      )
  ) then
    raise exception 'matchday-live-layout-legacy-write-drift';
  end if;

  if v_legacy_matchday_ids is not null and (
    exists (
      select
        placement_row.matchday_id,
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = any(v_legacy_matchday_ids)

      except

      select
        derived_row.matchday_id,
        derived_row.bank_item_id,
        derived_row.placement_type,
        derived_row.zone_id,
        derived_row.slot_position
      from jornada_private.derive_matchday_live_layout_placement_shadow(
        v_legacy_matchday_ids
      ) as derived_row
      where derived_row.bank_candidate_count = 1
        and derived_row.slot_source_count = 1
        and not derived_row.invalid_slot_position
        and (
          derived_row.placement_type <> 'zone'
          or derived_row.zone_candidate_count = 1
        )
    )
    or exists (
      select
        derived_row.matchday_id,
        derived_row.bank_item_id,
        derived_row.placement_type,
        derived_row.zone_id,
        derived_row.slot_position
      from jornada_private.derive_matchday_live_layout_placement_shadow(
        v_legacy_matchday_ids
      ) as derived_row
      where derived_row.bank_candidate_count = 1
        and derived_row.slot_source_count = 1
        and not derived_row.invalid_slot_position
        and (
          derived_row.placement_type <> 'zone'
          or derived_row.zone_candidate_count = 1
        )

      except

      select
        placement_row.matchday_id,
        placement_row.bank_item_id,
        placement_row.placement_type,
        placement_row.zone_id,
        placement_row.slot_position
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = any(v_legacy_matchday_ids)
    )
  ) then
    raise exception 'matchday-live-layout-legacy-write-rejected';
  end if;

  -- Bank e a fonte dos snapshots da representacao compatibility. Uma mudanca
  -- num Bank colocado e projetada forward; nunca deriva movement do legacy.
  if v_bank_only_matchday_ids is not null then
    perform jornada_private.project_matchday_live_layout_placements_to_legacy(
      v_bank_only_matchday_ids
    );
  end if;

  delete from jornada_private.matchday_live_layout_placement_shadow_sync_queue
  where backend_pid = pg_catalog.pg_backend_pid()
    and transaction_id = pg_catalog.pg_current_xact_id();

  return null;
end;
$function$;

revoke all on function
  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
from public, anon, authenticated, service_role;

comment on function
  jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()
is
  'Deferred cutover drift guard. It never writes placements from legacy; Bank snapshot changes project only in the authoritative forward direction.';

-- ============================================================
-- 2. MANIFEST DE CUTOVER, CLEANUP HISTORICO E DECISAO J04
-- ============================================================

create temporary table cutover_historical_matchdays (
  matchday_id uuid primary key
) on commit drop;

insert into cutover_historical_matchdays (matchday_id)
select distinct composition_row.matchday_id
from public.matchday_reference_compositions as composition_row
left join public.matchday_editorial_desk_control as source_desk
  on source_desk.matchday_id = composition_row.matchday_id
where composition_row.status = 'published'
  and composition_row.is_current = true
  and coalesce(source_desk.is_managed, false) = false
  and not exists (
    select 1
    from public.matchday_editorial_desk_control as target_desk
    where target_desk.is_managed = true
      and target_desk.carryover_source_composition_id = composition_row.id
  );

do $manifest_preconditions$
begin
  if exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id =
      '6f826bbe-88ef-42e2-8e4d-350e97752ade'::uuid
  ) and not exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    join cutover_historical_matchdays as cleanup_row
      on cleanup_row.matchday_id = composition_row.matchday_id
    where composition_row.id =
      '6f826bbe-88ef-42e2-8e4d-350e97752ade'::uuid
      and composition_row.status = 'published'
      and composition_row.is_current = true
  ) then
    raise exception 'matchday-live-layout-cutover-j03-manifest-mismatch';
  end if;

  if exists (
    select 1
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.id = '6bdb34a8-fc26-44fa-8342-5ae71d7adb0a'::uuid
  ) and (
    select pg_catalog.count(*)
    from public.matchday_live_layout_placements as placement_row
    where placement_row.bank_item_id =
      '6bdb34a8-fc26-44fa-8342-5ae71d7adb0a'::uuid
      and (
        placement_row.placement_type = 'video_highlight'
        and placement_row.slot_position = 1
        and placement_row.zone_id is null
        or placement_row.placement_type = 'faixa'
        and placement_row.slot_position = 87
        and placement_row.zone_id is null
      )
  ) <> 2 then
    raise exception 'matchday-live-layout-cutover-j04-manifest-mismatch';
  end if;
end;
$manifest_preconditions$;

-- Fechar representacao live de Jornadas historicas nao e movement editorial.
delete from public.matchday_live_layout_placements as placement_row
using cutover_historical_matchdays as cleanup_row
where placement_row.matchday_id = cleanup_row.matchday_id;

delete from public.matchday_live_layout_bank_item_state_memory as memory_row
using cutover_historical_matchdays as cleanup_row
where memory_row.matchday_id = cleanup_row.matchday_id;

select jornada_private.project_matchday_live_layout_placements_to_legacy(
  coalesce(
    (
      select pg_catalog.array_agg(
        cleanup_row.matchday_id
        order by cleanup_row.matchday_id
      )
      from cutover_historical_matchdays as cleanup_row
    ),
    '{}'::uuid[]
  )
);

-- Decisao editorial explicita e unica para Zekri na J04: sai faixa:87 e
-- permanece video_highlight:1. Nao existe qualquer regra Faixa > 10.
delete from public.matchday_live_layout_placements as placement_row
where placement_row.bank_item_id =
    '6bdb34a8-fc26-44fa-8342-5ae71d7adb0a'::uuid
  and placement_row.placement_type = 'faixa'
  and placement_row.zone_id is null
  and placement_row.slot_position = 87
  and exists (
    select 1
    from public.matchday_live_layout_placements as video_row
    where video_row.matchday_id = placement_row.matchday_id
      and video_row.bank_item_id = placement_row.bank_item_id
      and video_row.placement_type = 'video_highlight'
      and video_row.zone_id is null
      and video_row.slot_position = 1
  );

select jornada_private.project_matchday_live_layout_placements_to_legacy(
  coalesce(
    (
      select pg_catalog.array_agg(distinct bank_row.matchday_id)
      from public.matchday_editorial_bank_items as bank_row
      where bank_row.id =
        '6bdb34a8-fc26-44fa-8342-5ae71d7adb0a'::uuid
    ),
    '{}'::uuid[]
  )
);

do $deduplication_postcondition$
begin
  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    group by placement_row.matchday_id, placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-cutover-unexpected-transversal-duplicate';
  end if;
end;
$deduplication_postcondition$;

alter table public.matchday_live_layout_placements
  add constraint matchday_live_layout_placements_matchday_bank_key
  unique (matchday_id, bank_item_id)
  deferrable initially deferred;

-- ============================================================
-- 3. ADAPTADOR INTERNO LEGACY -> CORE
-- ============================================================

-- Adaptadores legacy autorizados escrevem a representacao compatibility e,
-- ainda na mesma transacao, entregam ao core um plano final sem winner
-- implicito. Esta funcao e a unica ponte legacy -> autoridade do cutover.
create function jornada_private.reconcile_matchday_live_layout_from_legacy_adapter(
  p_matchday_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_plan jsonb;
begin
  if exists (
    select 1
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      array[p_matchday_id]::uuid[]
    ) as derived_row
    where derived_row.bank_candidate_count <> 1
      or derived_row.slot_source_count <> 1
      or derived_row.invalid_slot_position
      or (
        derived_row.placement_type = 'zone'
        and derived_row.zone_candidate_count <> 1
      )
  ) then
    raise exception 'matchday-live-layout-legacy-adapter-resolution-failed';
  end if;

  if exists (
    select 1
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      array[p_matchday_id]::uuid[]
    ) as derived_row
    group by derived_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-legacy-adapter-transversal-conflict';
  end if;

  with desired as materialized (
    select
      derived_row.bank_item_id,
      derived_row.placement_type,
      derived_row.zone_id,
      derived_row.slot_position
    from jornada_private.derive_matchday_live_layout_placement_shadow(
      array[p_matchday_id]::uuid[]
    ) as derived_row
    where derived_row.bank_candidate_count = 1
      and derived_row.slot_source_count = 1
      and not derived_row.invalid_slot_position
      and (
        derived_row.placement_type <> 'zone'
        or derived_row.zone_candidate_count = 1
      )
  ),
  operations as materialized (
    select
      1 as action_order,
      desired_row.placement_type,
      desired_row.zone_id,
      desired_row.slot_position,
      desired_row.bank_item_id,
      pg_catalog.jsonb_build_object(
        'action', 'place',
        'bank_item_id', desired_row.bank_item_id,
        'placement_type', desired_row.placement_type,
        'zone_id', desired_row.zone_id,
        'slot_position', desired_row.slot_position
      ) as operation
    from desired as desired_row
    where not exists (
      select 1
      from public.matchday_live_layout_placements as placement_row
      where placement_row.matchday_id = p_matchday_id
        and placement_row.bank_item_id = desired_row.bank_item_id
        and placement_row.placement_type = desired_row.placement_type
        and placement_row.zone_id is not distinct from desired_row.zone_id
        and placement_row.slot_position = desired_row.slot_position
    )

    union all

    select
      0,
      placement_row.placement_type,
      placement_row.zone_id,
      placement_row.slot_position,
      null::uuid,
      pg_catalog.jsonb_build_object(
        'action', 'clear',
        'bank_item_id', null,
        'placement_type', placement_row.placement_type,
        'zone_id', placement_row.zone_id,
        'slot_position', placement_row.slot_position
      )
    from public.matchday_live_layout_placements as placement_row
    where placement_row.matchday_id = p_matchday_id
      and not exists (
        select 1
        from desired as desired_row
        where desired_row.placement_type = placement_row.placement_type
          and desired_row.zone_id is not distinct from placement_row.zone_id
          and desired_row.slot_position = placement_row.slot_position
      )
      and not exists (
        select 1
        from desired as desired_row
        where desired_row.bank_item_id = placement_row.bank_item_id
      )
  )
  select coalesce(
    pg_catalog.jsonb_agg(
      operation_row.operation
      order by
        operation_row.action_order,
        operation_row.placement_type,
        operation_row.zone_id nulls first,
        operation_row.slot_position,
        operation_row.bank_item_id nulls first
    ),
    '[]'::jsonb
  )
  into v_plan
  from operations as operation_row;

  perform jornada_private.apply_matchday_live_layout_placement_plan(
    p_matchday_id,
    v_plan,
    true
  );
end;
$function$;

revoke all on function
  jornada_private.reconcile_matchday_live_layout_from_legacy_adapter(uuid)
from public, anon, authenticated, service_role;

-- ============================================================
-- 4. V9 TORNA-SE ADAPTADOR; V10 E TOKEN/CACHE FICAM INTACTOS
-- ============================================================

alter function public.apply_matchday_editorial_profile_workspace_v9(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) rename to apply_matchday_editorial_profile_workspace_v9_pre_cutover;

alter function public.apply_matchday_editorial_profile_workspace_v9_pre_cutover(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) set schema jornada_private;

revoke all on function
  jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_cutover(
    uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
  )
from public, anon, authenticated, service_role;

create function public.apply_matchday_editorial_profile_workspace_v9(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb,
  p_worked_source_ids jsonb
)
returns table(
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_apply record;
begin
  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-editorial-profile-workspace-v9-matchday-not-live';
  end if;

  perform pg_catalog.set_config(
    'jornada.live_layout_cutover_adapter',
    'on',
    true
  );

  select *
  into v_apply
  from jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_cutover(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    p_page_controls,
    p_selection_bank_item_ids,
    p_video_module,
    p_worked_source_ids
  );

  perform jornada_private.reconcile_matchday_live_layout_from_legacy_adapter(
    p_matchday_id
  );

  return query
  select
    v_apply.revision,
    v_apply.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_apply.applied_selection_count;
end;
$function$;

revoke all on function public.apply_matchday_editorial_profile_workspace_v9(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;

grant execute on function public.apply_matchday_editorial_profile_workspace_v9(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to service_role;

-- O Desk conserva o envelope e os efeitos funcionais (Latest, control e
-- revision), mas entrega toda ocupacao placement ao mesmo core antes de
-- devolver. A funcao anterior deixa de ser um entrypoint externo.
alter function public.apply_matchday_editorial_desk_state_v2(
  uuid, bigint, text, boolean, jsonb
) rename to apply_matchday_editorial_desk_state_v2_pre_cutover;

alter function public.apply_matchday_editorial_desk_state_v2_pre_cutover(
  uuid, bigint, text, boolean, jsonb
) set schema jornada_private;

revoke all on function
  jornada_private.apply_matchday_editorial_desk_state_v2_pre_cutover(
    uuid, bigint, text, boolean, jsonb
  )
from public, anon, authenticated, service_role;

create function public.apply_matchday_editorial_desk_state_v2(
  p_matchday_id uuid,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_faixa_visible boolean,
  p_articles jsonb
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_result jsonb;
begin
  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'editorial-desk-matchday-not-live';
  end if;

  perform pg_catalog.set_config(
    'jornada.live_layout_cutover_adapter',
    'on',
    true
  );

  v_result :=
    jornada_private.apply_matchday_editorial_desk_state_v2_pre_cutover(
      p_matchday_id,
      p_expected_revision,
      p_expected_state_token,
      p_faixa_visible,
      p_articles
    );

  perform jornada_private.reconcile_matchday_live_layout_from_legacy_adapter(
    p_matchday_id
  );

  return v_result || pg_catalog.jsonb_build_object(
    'stateToken', public.matchday_editorial_desk_state_token_v2(p_matchday_id)
  );
end;
$function$;

revoke all on function public.apply_matchday_editorial_desk_state_v2(
  uuid, bigint, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_matchday_editorial_desk_state_v2(
  uuid, bigint, text, boolean, jsonb
) to service_role;

-- As versoes anteriores continuam a ser detalhes internos da cadeia, mas
-- deixam de ser entrypoints externos concorrentes.
revoke execute on function public.apply_matchday_editorial_profile_workspace_v2(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from service_role;
revoke execute on function public.apply_matchday_editorial_profile_workspace_v3(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from service_role;
revoke execute on function public.apply_matchday_editorial_profile_workspace_v4(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb
) from service_role;
revoke execute on function public.apply_matchday_editorial_profile_workspace_v5(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from service_role;
revoke execute on function public.apply_matchday_editorial_profile_workspace_v6(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from service_role;
revoke execute on function public.apply_matchday_editorial_profile_workspace_v7(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from service_role;
revoke execute on function public.apply_matchday_editorial_profile_workspace_v8(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from service_role;

-- ============================================================
-- 5. PUBLICACAO ATOMICA N -> N+1 E RECOVERY EXPLICITO
-- ============================================================

create or replace function
  public.publish_matchday_reference_composition_with_continuity(
    p_matchday_id uuid,
    p_composition_id uuid
  )
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_source_season_id uuid;
  v_source_number integer;
  v_next_matchday_id uuid;
  v_published_id uuid;
  v_materialized record;
begin
  if p_matchday_id is null or p_composition_id is null then
    raise exception 'composition_invalid';
  end if;

  select matchday_row.season_id, matchday_row.number
  into v_source_season_id, v_source_number
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id;

  if not found then
    raise exception 'composition_matchday_not_found';
  end if;

  select target_row.id
  into v_next_matchday_id
  from public.matchdays as target_row
  where target_row.season_id = v_source_season_id
    and target_row.number = v_source_number + 1;

  if not found then
    raise exception 'composition_next_matchday_not_found';
  end if;

  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_matchday_id, v_next_matchday_id)
  order by lock_row.id
  for update;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'composition_source_matchday_not_live';
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions as target_composition
    where target_composition.matchday_id = v_next_matchday_id
      and target_composition.status = 'published'
      and target_composition.is_current = true
  ) then
    raise exception 'composition_next_matchday_already_published';
  end if;

  v_published_id := public.activate_matchday_reference_composition(
    p_matchday_id,
    p_composition_id,
    true
  );

  select *
  into v_materialized
  from jornada_private.materialize_matchday_live_layout_continuity(
    p_matchday_id,
    v_next_matchday_id,
    v_published_id
  );

  if not coalesce(v_materialized.materialized, false) then
    raise exception 'composition_continuity_not_materialized';
  end if;

  update public.matchday_editorial_desk_control as source_desk
  set is_managed = false,
      carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = pg_catalog.now()
  where source_desk.matchday_id = p_matchday_id;

  update public.matchday_editorial_desk_control as target_desk
  set is_managed = true,
      carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = pg_catalog.now()
  where target_desk.matchday_id = v_next_matchday_id;

  if not found then
    raise exception 'composition_next_matchday_control_missing';
  end if;

  return pg_catalog.jsonb_build_object(
    'publishedCompositionId', v_published_id,
    'sourceMatchdayId', p_matchday_id,
    'nextMatchdayId', v_next_matchday_id,
    'carryoverApplied', true,
    'materialized', true,
    'inheritedBankCount', v_materialized.inherited_bank_count,
    'inheritedZoneCount', v_materialized.inherited_zone_count,
    'inheritedPlacementCount', v_materialized.inherited_placement_count,
    'inheritedLatestCount', v_materialized.inherited_latest_count,
    'inheritedRoundupCount', v_materialized.inherited_roundup_count
  );
end;
$function$;

revoke all on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
to service_role;

create function public.recover_matchday_live_layout_continuity(
  p_source_matchday_id uuid,
  p_target_matchday_id uuid,
  p_source_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_materialized record;
begin
  perform 1
  from public.matchdays as lock_row
  where lock_row.id in (p_source_matchday_id, p_target_matchday_id)
  order by lock_row.id
  for update;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as target_desk
    where target_desk.matchday_id = p_target_matchday_id
      and target_desk.is_managed = true
      and target_desk.carryover_source_composition_id =
        p_source_composition_id
  ) then
    raise exception 'matchday-live-continuity-recovery-manifest-mismatch';
  end if;

  select *
  into v_materialized
  from jornada_private.materialize_matchday_live_layout_continuity(
    p_source_matchday_id,
    p_target_matchday_id,
    p_source_composition_id
  );

  if not coalesce(v_materialized.materialized, false) then
    raise exception 'matchday-live-continuity-recovery-not-materialized';
  end if;

  update public.matchday_editorial_desk_control as target_desk
  set carryover_source_composition_id = null,
      carryover_snapshot = null,
      updated_at = pg_catalog.now()
  where target_desk.matchday_id = p_target_matchday_id
    and target_desk.is_managed = true;

  return pg_catalog.jsonb_build_object(
    'recovered', true,
    'sourceMatchdayId', p_source_matchday_id,
    'targetMatchdayId', p_target_matchday_id,
    'sourceCompositionId', p_source_composition_id,
    'inheritedBankCount', v_materialized.inherited_bank_count,
    'inheritedZoneCount', v_materialized.inherited_zone_count,
    'inheritedPlacementCount', v_materialized.inherited_placement_count,
    'inheritedLatestCount', v_materialized.inherited_latest_count,
    'inheritedRoundupCount', v_materialized.inherited_roundup_count
  );
end;
$function$;

revoke all on function public.recover_matchday_live_layout_continuity(
  uuid, uuid, uuid
) from public, anon, authenticated;
grant execute on function public.recover_matchday_live_layout_continuity(
  uuid, uuid, uuid
) to service_role;

-- A continuidade v3 deixa de ser um entrypoint externo. O novo publicador e
-- o recovery explicito sao as duas unicas fronteiras autorizadas.
revoke execute on function public.initialize_matchday_editorial_thematic_continuity_v3(
  uuid, uuid, uuid
) from service_role;

-- ============================================================
-- 6. IMUTABILIDADE DA COMPOSICAO PUBLICADA
-- ============================================================

create function jornada_private.guard_published_reference_composition()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  if old.status = 'published' then
    if tg_op = 'DELETE'
      or new.status <> 'published'
      or (
        pg_catalog.to_jsonb(new) - array['is_current', 'updated_at']::text[]
      ) is distinct from (
        pg_catalog.to_jsonb(old) - array['is_current', 'updated_at']::text[]
      )
    then
      raise exception 'published-reference-composition-immutable';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function
  jornada_private.guard_published_reference_composition()
from public, anon, authenticated, service_role;

create trigger matchday_reference_compositions_published_immutable
before update or delete on public.matchday_reference_compositions
for each row
execute function jornada_private.guard_published_reference_composition();

create function jornada_private.guard_published_reference_composition_child()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_composition_id uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    v_composition_id := old.composition_id;
  else
    v_composition_id := new.composition_id;
  end if;

  if exists (
    select 1
    from public.matchday_reference_compositions as composition_row
    where composition_row.id = v_composition_id
      and composition_row.status = 'published'
  ) then
    raise exception 'published-reference-composition-immutable';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function
  jornada_private.guard_published_reference_composition_child()
from public, anon, authenticated, service_role;

create trigger matchday_reference_composition_items_published_immutable
before insert or update or delete
on public.matchday_reference_composition_items
for each row
execute function jornada_private.guard_published_reference_composition_child();

create trigger matchday_hierarchical_composition_slots_published_immutable
before insert or update or delete
on public.matchday_hierarchical_composition_slots
for each row
execute function jornada_private.guard_published_reference_composition_child();

create trigger matchday_historical_composition_zones_published_immutable
before insert or update or delete
on public.matchday_historical_composition_zones
for each row
execute function jornada_private.guard_published_reference_composition_child();

create trigger matchday_historical_composition_zone_items_published_immutable
before insert or update or delete
on public.matchday_historical_composition_zone_items
for each row
execute function jornada_private.guard_published_reference_composition_child();

-- ============================================================
-- 7. POSTCONDITIONS DE AUTORIDADE E SEGURANCA
-- ============================================================

update jornada_private.matchday_live_layout_cutover_control
set authority_mode = 'authoritative',
    updated_at = pg_catalog.now()
where scope = 'live_layout'
  and authority_mode = 'bridge';

do $cutover_postconditions$
begin
  if not exists (
    select 1
    from jornada_private.matchday_live_layout_cutover_control as control_row
    where control_row.scope = 'live_layout'
      and control_row.authority_mode = 'authoritative'
  ) then
    raise exception 'matchday-live-layout-activation-not-authoritative';
  end if;

  if exists (
    select 1
    from public.matchday_live_layout_placements as placement_row
    group by placement_row.matchday_id, placement_row.bank_item_id
    having pg_catalog.count(*) > 1
  ) then
    raise exception 'matchday-live-layout-cutover-duplicate-after-unique';
  end if;

  if pg_catalog.pg_get_functiondef(
    'jornada_private.flush_matchday_live_layout_placement_shadow_sync_queue()'::regprocedure
  ) ~* 'sync_matchday_live_layout_placement_shadow'
  then
    raise exception 'matchday-live-layout-cutover-reverse-sync-still-active';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint as constraint_row
    where constraint_row.conrelid =
      'public.matchday_live_layout_placements'::regclass
      and constraint_row.conname =
        'matchday_live_layout_placements_matchday_bank_key'
      and constraint_row.contype = 'u'
      and constraint_row.condeferrable
      and constraint_row.condeferred
  ) then
    raise exception 'matchday-live-layout-cutover-unique-not-deferred';
  end if;

  if pg_catalog.has_function_privilege(
    'anon',
    'public.apply_matchday_live_layout_movement(uuid,text,uuid,text,uuid,integer,uuid,boolean)',
    'EXECUTE'
  ) or pg_catalog.has_function_privilege(
    'authenticated',
    'public.apply_matchday_live_layout_movement(uuid,text,uuid,text,uuid,integer,uuid,boolean)',
    'EXECUTE'
  ) then
    raise exception 'matchday-live-layout-cutover-movement-exposed';
  end if;
end;
$cutover_postconditions$;

notify pgrst, 'reload schema';

commit;
