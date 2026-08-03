begin;
set local transaction_read_only = on;

do $$
declare
  v_constraint record;
  v_unexpected_constraints text;
begin
  if to_regclass('public.editorial_articles') is null then
    raise exception 'Preflight falhou: tabela public.editorial_articles ausente';
  end if;

  if to_regclass('public.newsroom_editorial_dossier_article_plans') is null then
    raise exception 'Preflight falhou: tabela de planos editoriais ausente';
  end if;

  if to_regclass('public.newsroom_editorial_dossier_article_plan_generations') is null then
    raise exception 'Preflight falhou: tabela de gerações editoriais ausente';
  end if;

  if to_regclass('public.newsroom_editorial_compose_requests') is null then
    raise exception 'Preflight falhou: tabela de pedidos de composição ausente';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_dossier_article_plans')
      and attname = 'editorial_article_id'
      and atttypid = 'uuid'::regtype
      and not attnotnull
      and not attisdropped
  ) then
    raise exception 'Preflight falhou: newsroom_editorial_dossier_article_plans.editorial_article_id deve aceitar NULL';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_generations')
      and attname = 'editorial_article_id'
      and atttypid = 'uuid'::regtype
      and attnotnull
      and not attisdropped
  ) then
    raise exception 'Preflight falhou: coluna editorial_article_id das gerações inválida';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_attribute
    where attrelid = to_regclass('public.newsroom_editorial_compose_requests')
      and attname = 'editorial_article_id'
      and atttypid = 'uuid'::regtype
      and not attisdropped
  ) then
    raise exception 'Preflight falhou: coluna editorial_article_id dos pedidos de composição inválida';
  end if;

  for v_constraint in
    select *
    from (values
      (
        'newsroom_editorial_dossier_article_plans'::text,
        'newsroom_editorial_dossier_article_plans_editorial_article_fkey'::text
      ),
      (
        'newsroom_editorial_dossier_article_plan_generations'::text,
        'newsroom_editorial_dossier_article_plan_generations_article_fkey'::text
      ),
      (
        'newsroom_editorial_compose_requests'::text,
        'newsroom_editorial_compose_requests_article_fkey'::text
      )
    ) as expected(table_name, constraint_name)
  loop
    if not exists (
      select 1
      from pg_catalog.pg_constraint constraint_row
      where constraint_row.conrelid = to_regclass('public.' || v_constraint.table_name)
        and constraint_row.conname = v_constraint.constraint_name
        and constraint_row.contype = 'f'
        and constraint_row.confrelid = to_regclass('public.editorial_articles')
    ) then
      raise exception 'Preflight falhou: chave estrangeira % ausente ou inválida', v_constraint.constraint_name;
    end if;
  end loop;

  select string_agg(
    format('%s.%s', constraint_table.relname, constraint_row.conname),
    ', '
    order by constraint_table.relname, constraint_row.conname
  )
  into v_unexpected_constraints
  from pg_catalog.pg_constraint constraint_row
  join pg_catalog.pg_class constraint_table
    on constraint_table.oid = constraint_row.conrelid
  join pg_catalog.pg_namespace constraint_schema
    on constraint_schema.oid = constraint_table.relnamespace
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = to_regclass('public.editorial_articles')
    and constraint_schema.nspname = 'public'
    and constraint_row.conname not in (
      'newsroom_editorial_dossier_article_plans_editorial_article_fkey',
      'newsroom_editorial_dossier_article_plan_generations_article_fkey',
      'newsroom_editorial_compose_requests_article_fkey'
    );

  if v_unexpected_constraints is not null then
    raise exception 'Preflight falhou: existem outras chaves estrangeiras para editorial_articles que exigem diagnóstico: %', v_unexpected_constraints;
  end if;

  if to_regprocedure('public.newsroom_reject_editorial_generation_mutation()') is null then
    raise exception 'Preflight falhou: função de imutabilidade das gerações ausente';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_generations')
      and trigger_row.tgname = 'newsroom_editorial_dossier_article_plan_generations_immutable'
      and not trigger_row.tgisinternal
  ) then
    raise exception 'Preflight falhou: trigger de imutabilidade das gerações ausente';
  end if;

  if to_regprocedure('public.remove_deleted_editorial_source_from_matchday_bank()') is null then
    raise exception 'Preflight falhou: limpeza do banco histórico ainda não foi aplicada';
  end if;
end
$$;

select 'Preflight concluído: artigos sem vínculos públicos podem ser eliminados, preservando o plano e removendo apenas os artefactos internos dependentes' as resultado;

rollback;
