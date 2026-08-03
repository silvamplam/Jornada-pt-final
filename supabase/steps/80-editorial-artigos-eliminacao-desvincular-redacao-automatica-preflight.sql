begin;
set local transaction_read_only = on;

do $$
declare
  v_target record;
  v_fk_count integer;
  v_total_article_fks integer;
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
      and not attnotnull
      and not attisdropped
  ) then
    raise exception 'Preflight falhou: coluna editorial_article_id dos pedidos de composição inválida';
  end if;

  for v_target in
    select *
    from (values
      ('newsroom_editorial_dossier_article_plans'::text),
      ('newsroom_editorial_dossier_article_plan_generations'::text),
      ('newsroom_editorial_compose_requests'::text)
    ) as expected(table_name)
  loop
    select count(*)
    into v_fk_count
    from pg_catalog.pg_constraint constraint_row
    join pg_catalog.pg_attribute source_attribute
      on source_attribute.attrelid = constraint_row.conrelid
     and source_attribute.attname = 'editorial_article_id'
     and not source_attribute.attisdropped
    join pg_catalog.pg_attribute target_attribute
      on target_attribute.attrelid = constraint_row.confrelid
     and target_attribute.attname = 'id'
     and not target_attribute.attisdropped
    where constraint_row.conrelid = to_regclass('public.' || v_target.table_name)
      and constraint_row.contype = 'f'
      and constraint_row.confrelid = to_regclass('public.editorial_articles')
      and constraint_row.conkey = array[source_attribute.attnum]
      and constraint_row.confkey = array[target_attribute.attnum];

    if v_fk_count <> 1 then
      raise exception 'Preflight falhou: %.editorial_article_id deve ter exatamente uma chave estrangeira para editorial_articles; encontradas %',
        v_target.table_name,
        v_fk_count;
    end if;
  end loop;

  select count(*)
  into v_total_article_fks
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = to_regclass('public.editorial_articles');

  if v_total_article_fks <> 3 then
    raise exception 'Preflight falhou: existem % chaves estrangeiras para editorial_articles; esperadas exatamente 3',
      v_total_article_fks;
  end if;

  if to_regprocedure('public.newsroom_reject_editorial_generation_mutation()') is null then
    raise exception 'Preflight falhou: função de imutabilidade das gerações ausente';
  end if;

  if not exists (
    select 1
    from pg_catalog.pg_trigger trigger_row
    where trigger_row.tgrelid = to_regclass('public.newsroom_editorial_dossier_article_plan_generations')
      and trigger_row.tgfoid = to_regprocedure('public.newsroom_reject_editorial_generation_mutation()')
      and not trigger_row.tgisinternal
      and trigger_row.tgenabled <> 'D'
      and (trigger_row.tgtype::integer & 1) = 1
      and (trigger_row.tgtype::integer & 2) = 2
      and (trigger_row.tgtype::integer & 8) = 8
      and (trigger_row.tgtype::integer & 16) = 16
  ) then
    raise exception 'Preflight falhou: trigger BEFORE DELETE OR UPDATE de imutabilidade das gerações ausente';
  end if;

  if to_regprocedure('public.remove_deleted_editorial_source_from_matchday_bank()') is null then
    raise exception 'Preflight falhou: limpeza do banco histórico ainda não foi aplicada';
  end if;
end
$$;

select 'Preflight concluído: as relações reais com editorial_articles foram identificadas pelas colunas, sem depender de nomes truncados, e a eliminação integrada pode ser aplicada' as resultado;

rollback;
