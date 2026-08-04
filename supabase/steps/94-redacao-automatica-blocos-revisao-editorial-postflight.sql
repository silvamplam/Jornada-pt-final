begin;
set local transaction_read_only = on;

do $$
begin
  if to_regclass('public.newsroom_editorial_review_states') is null
     or to_regclass('public.newsroom_editorial_review_batches') is null
     or to_regclass('public.newsroom_editorial_review_batch_items') is null then
    raise exception 'Postflight falhou: faltam tabelas de revisão editorial';
  end if;

  if to_regprocedure('public.newsroom_apply_editorial_review(text,jsonb)') is null then
    raise exception 'Postflight falhou: falta a RPC newsroom_apply_editorial_review';
  end if;

  if exists (
    select 1
    from information_schema.role_table_grants grant_row
    where grant_row.table_schema = 'public'
      and grant_row.table_name in (
        'newsroom_editorial_review_states',
        'newsroom_editorial_review_batches',
        'newsroom_editorial_review_batch_items'
      )
      and grant_row.grantee in ('PUBLIC', 'anon', 'authenticated')
  ) then
    raise exception 'Postflight falhou: existem grants indevidos nas tabelas de revisão';
  end if;

  if not exists (
    select 1
    from pg_policies policy
    where policy.schemaname = 'public'
      and policy.tablename = 'newsroom_editorial_review_states'
  ) and not exists (
    select 1
    from pg_class class
    join pg_namespace namespace on namespace.oid = class.relnamespace
    where namespace.nspname = 'public'
      and class.relname = 'newsroom_editorial_review_states'
      and class.relrowsecurity
      and class.relforcerowsecurity
  ) then
    raise exception 'Postflight falhou: RLS não está forçado nos estados de revisão';
  end if;

  if has_function_privilege('anon', 'public.newsroom_apply_editorial_review(text,jsonb)', 'EXECUTE')
     or has_function_privilege('authenticated', 'public.newsroom_apply_editorial_review(text,jsonb)', 'EXECUTE') then
    raise exception 'Postflight falhou: a RPC é executável fora do service_role';
  end if;
end
$$;

select
  'Postflight concluído: blocos, estados, snapshots revistos, RLS e RPC estão instalados' as resultado,
  false as writes_performed;

rollback;
