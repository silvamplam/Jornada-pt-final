begin;
set local transaction_read_only = on;

do $$
declare
  v_immutable_definition text;
begin
  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and constraint_row.conname = 'newsroom_editorial_dossier_article_plans_editorial_article_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = to_regclass('public.editorial_articles')
      and constraint_row.confdeltype = 'n'
  ) then
    raise exception 'Postflight falhou: o plano não usa ON DELETE SET NULL';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_generations')
      and constraint_row.conname = 'newsroom_editorial_dossier_article_plan_generations_article_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = to_regclass('public.editorial_articles')
      and constraint_row.confdeltype = 'c'
  ) then
    raise exception 'Postflight falhou: a geração não usa ON DELETE CASCADE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_constraint constraint_row
    where constraint_row.conrelid = to_regclass('public.newsroom_editorial_compose_requests')
      and constraint_row.conname = 'newsroom_editorial_compose_requests_article_fkey'
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = to_regclass('public.editorial_articles')
      and constraint_row.confdeltype = 'c'
  ) then
    raise exception 'Postflight falhou: o pedido de composição não usa ON DELETE CASCADE';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and attname = 'editorial_article_id'
      and not attnotnull
      and not attisdropped
  ) then
    raise exception 'Postflight falhou: o plano não pode ser desvinculado do artigo';
  end if;

  select pg_catalog.pg_get_functiondef(function_row.oid)
  into v_immutable_definition
  from pg_catalog.pg_proc function_row
  where function_row.oid = to_regprocedure('public.newsroom_reject_editorial_generation_mutation()');

  if v_immutable_definition is null
     or v_immutable_definition not ilike '%editorial_generation_immutable%'
     or v_immutable_definition not ilike '%tg_op = ''DELETE''%'
     or v_immutable_definition not ilike '%not exists%'
     or v_immutable_definition not ilike '%public.editorial_articles%' then
    raise exception 'Postflight falhou: proteção seletiva das gerações incompleta';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_generations')
      and trigger_row.tgname = 'newsroom_editorial_dossier_article_plan_generations_immutable'
      and not trigger_row.tgisinternal
      and pg_catalog.pg_get_triggerdef(trigger_row.oid) ilike '%BEFORE UPDATE OR DELETE%'
  ) then
    raise exception 'Postflight falhou: imutabilidade normal das gerações deixou de estar ativa';
  end if;
end
$$;

select 'Postflight concluído: o artigo pode ser eliminado; o plano fica disponível, a geração e o pedido interno são removidos e a imutabilidade normal mantém-se' as resultado;

rollback;
