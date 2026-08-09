-- Step 94 - postflight read-only da entrada manual canónica completa.

with fn as (
  select proc.oid, proc.prosecdef as security_definer,
    coalesce(array_to_string(proc.proconfig, ','), '') as function_config,
    lower(regexp_replace(pg_get_functiondef(proc.oid), '\s+', ' ', 'g')) as definition
  from pg_proc proc
  join pg_namespace namespace on namespace.oid = proc.pronamespace
  where namespace.nspname = 'public'
    and proc.oid = to_regprocedure('public.newsroom_create_complete_manual_entry(uuid,text,text,text,text,text,jsonb,text,text,text,text)')
)
select jsonb_build_object(
  'step', 94,
  'function_present', (select count(*) from fn) = 1,
  'security_definer', coalesce((select security_definer from fn), false),
  'search_path_controlled', coalesce((select function_config like '%search_path=%' from fn), false),
  'service_role_execute', coalesce((select has_function_privilege('service_role', oid, 'EXECUTE') from fn), false),
  'anon_execute_absent', not coalesce((select has_function_privilege('anon', oid, 'EXECUTE') from fn), false),
  'authenticated_execute_absent', not coalesce((select has_function_privilege('authenticated', oid, 'EXECUTE') from fn), false),
  'canonical_metadata_contract', coalesce((select definition like '%antetitle%' and definition like '%publishedatprecision%' and definition like '%instant%' from fn), false),
  'writes_performed', false
) as postflight_summary;
