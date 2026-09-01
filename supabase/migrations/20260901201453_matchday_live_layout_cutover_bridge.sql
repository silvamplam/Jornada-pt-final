begin;

-- ============================================================
-- LOTE 6 / PASSO 2 - BRIDGE DE ROLLOUT BACKWARD-COMPATIBLE
--
-- Esta migration expoe os entrypoints usados pelo codigo novo, mas conserva
-- integralmente a autoridade legacy e o reverse sync do Lote 4. O advisory
-- lock partilhado marca a fronteira de todas as escritas de ocupacao para que
-- a Activation posterior possa drenar writers em voo sem pausa arbitraria.
-- ============================================================

create table jornada_private.matchday_live_layout_cutover_control (
  scope text primary key,
  authority_mode text not null,
  updated_at timestamptz not null default pg_catalog.now(),
  constraint matchday_live_layout_cutover_control_scope_check
    check (scope = 'live_layout'),
  constraint matchday_live_layout_cutover_control_authority_mode_check
    check (authority_mode in ('bridge', 'authoritative'))
);

insert into jornada_private.matchday_live_layout_cutover_control (
  scope,
  authority_mode,
  updated_at
) values (
  'live_layout',
  'bridge',
  pg_catalog.now()
);

revoke all on table
  jornada_private.matchday_live_layout_cutover_control
from public, anon, authenticated, service_role;

create function jornada_private.acquire_matchday_live_layout_cutover_writer_lock()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  -- Classe 6026, chave 2: Lote 6 / Passo 2 / write cutover.
  -- Shared xact locks deixam writers da Bridge concorrer entre si e permitem
  -- que a Activation espere por todos com um unico exclusive xact lock.
  perform pg_catalog.pg_advisory_xact_lock_shared(6026, 2);
end;
$function$;

revoke all on function
  jornada_private.acquire_matchday_live_layout_cutover_writer_lock()
from public, anon, authenticated, service_role;

create function jornada_private.acquire_matchday_live_layout_cutover_core_lock()
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  -- RPCs e funcoes multi-superficie anunciam primeiro todas as tabelas que o
  -- forward projector pode escrever. A Activation usa a mesma ordem com um
  -- lock conflitante e, por isso, nunca segura placements enquanto espera por
  -- um writer que ainda precise de concluir a sua projecao legacy.
  lock table
    public.matchday_editorials,
    public.matchday_highlights,
    public.matchday_horizontal_news,
    public.matchday_live_layout_items,
    public.matchday_editorial_profile_zone_items
  in row exclusive mode;

  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();
end;
$function$;

revoke all on function
  jornada_private.acquire_matchday_live_layout_cutover_core_lock()
from public, anon, authenticated, service_role;

create function jornada_private.fence_matchday_live_layout_legacy_writer()
returns trigger
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_writer_lock();
  return null;
end;
$function$;

revoke all on function
  jornada_private.fence_matchday_live_layout_legacy_writer()
from public, anon, authenticated, service_role;

create trigger matchday_live_layout_cutover_writer_fence
before insert or update or delete on public.matchday_editorials
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_layout_cutover_writer_fence
before insert or update or delete on public.matchday_highlights
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_layout_cutover_writer_fence
before insert or update or delete on public.matchday_horizontal_news
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_layout_cutover_writer_fence
before insert or update or delete on public.matchday_live_layout_items
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

create trigger matchday_live_layout_cutover_writer_fence
before insert or update or delete
on public.matchday_editorial_profile_zone_items
for each statement
execute function jornada_private.fence_matchday_live_layout_legacy_writer();

-- ============================================================
-- 1. WRAPPERS DOS CONTRATOS ANTIGOS
--
-- Assinaturas e efeitos permanecem iguais. O wrapper apenas adquire o lock
-- partilhado antes de qualquer escrita da implementacao anterior.
-- ============================================================

alter function public.apply_matchday_editorial_profile_workspace_v9(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) rename to apply_matchday_editorial_profile_workspace_v9_pre_bridge;

alter function public.apply_matchday_editorial_profile_workspace_v9_pre_bridge(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) set schema jornada_private;

revoke all on function
  jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_bridge(
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
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  return query
  select *
  from jornada_private.apply_matchday_editorial_profile_workspace_v9_pre_bridge(
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
end;
$function$;

revoke all on function public.apply_matchday_editorial_profile_workspace_v9(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) from public, anon, authenticated;
grant execute on function public.apply_matchday_editorial_profile_workspace_v9(
  uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb
) to service_role;

alter function public.apply_matchday_editorial_desk_state_v2(
  uuid, bigint, text, boolean, jsonb
) rename to apply_matchday_editorial_desk_state_v2_pre_bridge;

alter function public.apply_matchday_editorial_desk_state_v2_pre_bridge(
  uuid, bigint, text, boolean, jsonb
) set schema jornada_private;

revoke all on function
  jornada_private.apply_matchday_editorial_desk_state_v2_pre_bridge(
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
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  return jornada_private.apply_matchday_editorial_desk_state_v2_pre_bridge(
    p_matchday_id,
    p_expected_revision,
    p_expected_state_token,
    p_faixa_visible,
    p_articles
  );
end;
$function$;

revoke all on function public.apply_matchday_editorial_desk_state_v2(
  uuid, bigint, text, boolean, jsonb
) from public, anon, authenticated;
grant execute on function public.apply_matchday_editorial_desk_state_v2(
  uuid, bigint, text, boolean, jsonb
) to service_role;

alter function public.publish_matchday_reference_composition_with_continuity(
  uuid, uuid
) rename to publish_matchday_reference_composition_pre_bridge;

alter function
  public.publish_matchday_reference_composition_pre_bridge(
    uuid, uuid
  )
set schema jornada_private;

revoke all on function
  jornada_private.publish_matchday_reference_composition_pre_bridge(
    uuid, uuid
  )
from public, anon, authenticated, service_role;

create function public.publish_matchday_reference_composition_with_continuity(
  p_matchday_id uuid,
  p_composition_id uuid
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  return
    jornada_private.publish_matchday_reference_composition_pre_bridge(
      p_matchday_id,
      p_composition_id
    );
end;
$function$;

revoke all on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
from public, anon, authenticated;
grant execute on function
  public.publish_matchday_reference_composition_with_continuity(uuid, uuid)
to service_role;

-- ============================================================
-- 2. ENTRYPOINTS USADOS PELO CODIGO NOVO
--
-- O core privado e o forward projector foram preparados no Passo 1. Nesta
-- fase o reverse sync continua ativo e converge o legacy projetado para o
-- mesmo estado; a autoridade definitiva so muda na Activation.
-- ============================================================

create function public.apply_matchday_live_layout_movement(
  p_matchday_id uuid,
  p_action text,
  p_bank_item_id uuid,
  p_placement_type text,
  p_zone_id uuid,
  p_slot_position integer,
  p_expected_target_bank_item_id uuid,
  p_expect_target_empty boolean
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_current_target_bank_item_id uuid;
  v_result jsonb;
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();

  if p_matchday_id is null
    or p_action not in ('place', 'clear')
    or p_placement_type is null
    or p_slot_position is null
    or p_expect_target_empty is null
  then
    raise exception 'matchday-live-layout-movement-invalid-envelope';
  end if;

  perform 1
  from public.matchdays as matchday_row
  where matchday_row.id = p_matchday_id
  for update;

  if not found then
    raise exception 'matchday-live-layout-movement-matchday-not-found';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_desk_control as desk_row
    where desk_row.matchday_id = p_matchday_id
      and desk_row.is_managed = true
  ) then
    raise exception 'matchday-live-layout-movement-matchday-not-live';
  end if;

  select placement_row.bank_item_id
  into v_current_target_bank_item_id
  from public.matchday_live_layout_placements as placement_row
  where placement_row.matchday_id = p_matchday_id
    and placement_row.placement_type = p_placement_type
    and placement_row.zone_id is not distinct from p_zone_id
    and placement_row.slot_position = p_slot_position;

  if p_expect_target_empty and found then
    raise exception 'matchday-live-layout-movement-target-changed';
  end if;

  if p_expected_target_bank_item_id is not null
    and v_current_target_bank_item_id is distinct from
      p_expected_target_bank_item_id
  then
    raise exception 'matchday-live-layout-movement-target-changed';
  end if;

  if p_action = 'place' and p_bank_item_id is null then
    raise exception 'matchday-live-layout-movement-bank-required';
  end if;

  if p_action = 'clear'
    and p_bank_item_id is not null
  then
    raise exception 'matchday-live-layout-movement-clear-bank-forbidden';
  end if;

  select jornada_private.apply_matchday_live_layout_placement_plan(
    p_matchday_id,
    pg_catalog.jsonb_build_array(
      pg_catalog.jsonb_build_object(
        'action', p_action,
        'bank_item_id', p_bank_item_id,
        'placement_type', p_placement_type,
        'zone_id', p_zone_id,
        'slot_position', p_slot_position
      )
    ),
    true
  ) into v_result;

  return v_result;
end;
$function$;

revoke all on function public.apply_matchday_live_layout_movement(
  uuid, text, uuid, text, uuid, integer, uuid, boolean
) from public, anon, authenticated;
grant execute on function public.apply_matchday_live_layout_movement(
  uuid, text, uuid, text, uuid, integer, uuid, boolean
) to service_role;

create function public.apply_matchday_live_layout_legacy_slot(
  p_matchday_id uuid,
  p_action text,
  p_placement_type text,
  p_zone_id uuid,
  p_slot_position integer,
  p_source_link_url text
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_normalized_link text;
  v_bank_item_id uuid;
  v_bank_item_ids uuid[];
  v_candidate_count bigint;
begin
  if p_action = 'clear' then
    return public.apply_matchday_live_layout_movement(
      p_matchday_id,
      'clear',
      null,
      p_placement_type,
      p_zone_id,
      p_slot_position,
      null,
      false
    );
  end if;

  if p_action <> 'place'
    or nullif(pg_catalog.btrim(p_source_link_url), '') is null
  then
    raise exception 'matchday-live-layout-legacy-slot-invalid-envelope';
  end if;

  v_normalized_link := nullif(
    pg_catalog.lower(
      pg_catalog.regexp_replace(
        pg_catalog.split_part(
          pg_catalog.split_part(pg_catalog.btrim(p_source_link_url), '#', 1),
          '?',
          1
        ),
        '/+$',
        ''
      )
    ),
    ''
  );

  select
    pg_catalog.count(*),
    pg_catalog.array_agg(bank_row.id order by bank_row.id)
  into v_candidate_count, v_bank_item_ids
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.matchday_id = p_matchday_id
    and nullif(
      pg_catalog.lower(
        pg_catalog.regexp_replace(
          pg_catalog.split_part(
            pg_catalog.split_part(pg_catalog.btrim(bank_row.link_url), '#', 1),
            '?',
            1
          ),
          '/+$',
          ''
        )
      ),
      ''
    ) = v_normalized_link;

  if v_candidate_count <> 1 then
    raise exception 'matchday-live-layout-legacy-slot-bank-resolution-failed';
  end if;

  v_bank_item_id := v_bank_item_ids[1];

  return public.apply_matchday_live_layout_movement(
    p_matchday_id,
    'place',
    v_bank_item_id,
    p_placement_type,
    p_zone_id,
    p_slot_position,
    null,
    false
  );
end;
$function$;

revoke all on function public.apply_matchday_live_layout_legacy_slot(
  uuid, text, text, uuid, integer, text
) from public, anon, authenticated;
grant execute on function public.apply_matchday_live_layout_legacy_slot(
  uuid, text, text, uuid, integer, text
) to service_role;

create function public.refresh_matchday_live_layout_legacy(
  p_matchday_id uuid
)
returns void
language plpgsql
volatile
security definer
set search_path = ''
as $function$
begin
  perform jornada_private.acquire_matchday_live_layout_cutover_core_lock();
  perform jornada_private.project_matchday_live_layout_placements_to_legacy(
    array[p_matchday_id]::uuid[]
  );
end;
$function$;

revoke all on function public.refresh_matchday_live_layout_legacy(uuid)
from public, anon, authenticated;
grant execute on function public.refresh_matchday_live_layout_legacy(uuid)
to service_role;

notify pgrst, 'reload schema';

commit;
