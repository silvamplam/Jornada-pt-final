-- Jornada.pt - criacao transacional de clubes em lote.
-- Postflight exclusivamente read-only. Executar depois do script aplicar.

do $postflight$
declare
  v_signature constant text :=
    'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)';
  v_batch_oid oid := to_regprocedure(v_signature);
  v_definition text;
  v_result text;
  v_comment text;
  v_service_role_oid oid;
begin
  if v_batch_oid is null then
    raise exception 'postflight_manage_team_creation_batch_missing'
      using errcode = '42883';
  end if;

  select r.oid into v_service_role_oid
  from pg_catalog.pg_roles r
  where r.rolname = 'service_role';

  if v_service_role_oid is null then
    raise exception 'postflight_service_role_missing'
      using errcode = '42704';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'manage_team_creation_batch'
      and p.oid <> v_batch_oid
  ) then
    raise exception 'postflight_manage_team_creation_batch_unexpected_overload'
      using errcode = '55000';
  end if;

  select
    pg_catalog.pg_get_functiondef(p.oid),
    pg_catalog.pg_get_function_result(p.oid),
    pg_catalog.obj_description(p.oid, 'pg_proc')
  into v_definition, v_result, v_comment
  from pg_catalog.pg_proc p
  where p.oid = v_batch_oid
    and p.prosecdef
    and p.proowner = (select oid from pg_catalog.pg_roles where rolname = 'postgres')
    and coalesce(p.proconfig, array[]::text[]) @>
      array['search_path=pg_catalog']::text[];

  if not found then
    raise exception 'postflight_rpc_security_contract_unexpected'
      using errcode = '55000';
  end if;

  if v_result not like 'TABLE(line_number integer,%'
     or v_result not like '%result_status text%'
     or v_result not like '%proposed_identity jsonb%'
     or v_result not like '%resolved_team_id uuid%'
     or v_result not like '%existing_identity jsonb%'
     or v_result not like '%conflicts jsonb%'
     or v_result not like '%normalized_aliases jsonb%'
     or v_result not like '%batch_applied boolean%'
     or v_result not like '%batch_total_count integer%'
     or v_result not like '%batch_create_count integer%'
     or v_result not like '%batch_existing_count integer%'
     or v_result not like '%batch_complete_existing_count integer%'
     or v_result not like '%batch_probable_count integer%'
     or v_result not like '%batch_ambiguous_count integer%'
     or v_result not like '%batch_conflict_count integer%'
     or v_result not like '%batch_invalid_count integer%'
     or v_result not like '%batch_blocking_count integer%'
     or v_result not like '%batch_can_apply boolean%'
     or v_result not like '%batch_created_count integer%'
     or v_result not like '%batch_completed_existing_count integer%'
     or v_result not like '%batch_aliases_created_count integer%'
     or v_result not like '%batch_aliases_unchanged_count integer%'
     or v_result not like '%batch_public_names_changed_count integer%'
     or v_result not like '%batch_integrally_applied boolean%'
     or v_result not like '%preview_fingerprint text)' then
    raise exception 'postflight_rpc_return_contract_unexpected: %', v_result
      using errcode = '55000';
  end if;

  if position('pg_advisory_xact_lock' in v_definition) = 0
     or position('team_creation_batch:v1' in v_definition) = 0
     or position('lock table public.teams in share row exclusive mode' in lower(v_definition)) = 0
     or position('lock table public.team_aliases in share row exclusive mode' in lower(v_definition)) = 0
     or position('public.normalize_team_identity_v1' in v_definition) = 0
     or position('public.manage_team_public_name' in v_definition) = 0
     or position('public.manage_team_alias' in v_definition) = 0
     or position('team_creation_batch_preview_stale' in v_definition) = 0
     or position('team_creation_batch_blocking_rows' in v_definition) = 0 then
    raise exception 'postflight_rpc_required_dependency_or_guard_missing'
      using errcode = '55000';
  end if;

  if v_comment is null
     or position('country_id' in v_comment) = 0
     or position('rows JSONB' in v_comment) = 0
     or position('fingerprint' in lower(v_comment)) = 0
     or position('complete_existing' in v_comment) = 0
     or position('actor_type' in v_comment) = 0
     or position('request_reference' in v_comment) = 0 then
    raise exception 'postflight_rpc_comment_incomplete'
      using errcode = '55000';
  end if;

  if not pg_catalog.has_function_privilege(
       'service_role', v_batch_oid, 'EXECUTE'
     )
     or pg_catalog.has_function_privilege('anon', v_batch_oid, 'EXECUTE')
     or pg_catalog.has_function_privilege('authenticated', v_batch_oid, 'EXECUTE')
     or exists (
       select 1
       from pg_catalog.pg_proc p
       cross join lateral pg_catalog.aclexplode(
         coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
       ) acl
       where p.oid = v_batch_oid
         and acl.privilege_type = 'EXECUTE'
         and acl.grantee = 0
     ) then
    raise exception 'postflight_rpc_privileges_unexpected'
      using errcode = '42501';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_proc p
    cross join lateral pg_catalog.aclexplode(
      coalesce(p.proacl, pg_catalog.acldefault('f', p.proowner))
    ) acl
    where p.oid = v_batch_oid
      and acl.privilege_type = 'EXECUTE'
      and acl.grantee not in (p.proowner, v_service_role_oid)
  ) then
    raise exception 'postflight_rpc_unexpected_execute_grantee'
      using errcode = '42501';
  end if;

  if to_regprocedure('public.normalize_team_identity_v1(text)') is null
     or to_regprocedure(
       'public.manage_team_alias(text,text,text,text,uuid,uuid,text,text)'
     ) is null
     or to_regprocedure(
       'public.manage_team_public_name(uuid,text,text,text,text,text)'
     ) is null then
    raise exception 'postflight_reused_rpc_missing'
      using errcode = '42883';
  end if;

  if exists (
    select 1
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p', 'v', 'm', 'S')
      and c.relname like 'team_creation_batch%'
  ) then
    raise exception 'postflight_unexpected_batch_relation_created'
      using errcode = '55000';
  end if;

  if (
    select count(*)
    from information_schema.columns c
    where c.table_schema = 'public'
      and c.table_name = 'season_teams'
      and c.column_name in (
        'id', 'season_id', 'team_id', 'display_order', 'status', 'data_source',
        'external_provider', 'external_id', 'last_synced_at', 'sync_status',
        'manual_override', 'created_at', 'updated_at'
      )
  ) <> 13 or not exists (
    select 1
    from pg_catalog.pg_index i
    where i.indrelid = 'public.season_teams'::regclass
      and i.indisunique
      and i.indexrelid = to_regclass('public.season_teams_season_team_idx')
  ) then
    raise exception 'postflight_season_teams_contract_unexpected'
      using errcode = '55000';
  end if;

  if not (
    select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.teams'::regclass
  ) or not (
    select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.countries'::regclass
  ) or not (
    select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.team_aliases'::regclass
  ) or not (
    select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.team_alias_audit_events'::regclass
  ) or not (
    select c.relrowsecurity from pg_catalog.pg_class c
    where c.oid = 'public.team_public_name_audit_events'::regclass
  ) then
    raise exception 'postflight_existing_rls_contract_unexpected'
      using errcode = '55000';
  end if;
end
$postflight$;

select
  'postflight_ok'::text as result,
  to_regprocedure(
    'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)'
  ) as rpc,
  pg_catalog.pg_get_userbyid(p.proowner) as owner,
  p.prosecdef as security_definer,
  p.proconfig as function_configuration,
  pg_catalog.pg_get_function_result(p.oid) as return_contract,
  pg_catalog.obj_description(p.oid, 'pg_proc') as comment,
  pg_catalog.has_function_privilege('service_role', p.oid, 'EXECUTE')
    as service_role_can_execute,
  pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
    as anon_can_execute,
  pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    as authenticated_can_execute
from pg_catalog.pg_proc p
where p.oid = to_regprocedure(
  'public.manage_team_creation_batch(uuid,jsonb,boolean,text,jsonb,text,text,text,text)'
);
