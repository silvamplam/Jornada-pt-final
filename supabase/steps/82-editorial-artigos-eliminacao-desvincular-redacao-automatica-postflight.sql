begin;
set local transaction_read_only = on;

do $$
declare
  v_target record;
  v_fk_count integer;
  v_total_article_fks integer;
  v_immutable_definition text;
begin
  for v_target in
    select *
    from (values
      ('newsroom_editorial_dossier_article_plans'::text, 'n'::"char", 'ON DELETE SET NULL'::text),
      ('newsroom_editorial_dossier_article_plan_generations'::text, 'c'::"char", 'ON DELETE CASCADE'::text),
      ('newsroom_editorial_compose_requests'::text, 'c'::"char", 'ON DELETE CASCADE'::text)
    ) as expected(table_name, delete_type, delete_label)
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
      and constraint_row.confkey = array[target_attribute.attnum]
      and constraint_row.confdeltype = v_target.delete_type;

    if v_fk_count <> 1 then
      raise exception 'Postflight falhou: %.editorial_article_id não usa exatamente uma chave %',
        v_target.table_name,
        v_target.delete_label;
    end if;
  end loop;

  select count(*)
  into v_total_article_fks
  from pg_catalog.pg_constraint constraint_row
  where constraint_row.contype = 'f'
    and constraint_row.confrelid = to_regclass('public.editorial_articles');

  if v_total_article_fks <> 3 then
    raise exception 'Postflight falhou: existem % chaves estrangeiras para editorial_articles; esperadas exatamente 3',
      v_total_article_fks;
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
     or v_immutable_definition not ilike '%pg_trigger_depth()%'
     or v_immutable_definition not ilike '%not exists%'
     or v_immutable_definition not ilike '%public.editorial_articles%' then
    raise exception 'Postflight falhou: proteção seletiva das gerações incompleta';
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
    raise exception 'Postflight falhou: imutabilidade normal das gerações deixou de estar ativa';
  end if;
end
$$;

select 'Postflight concluído: as chaves reais usam SET NULL/CASCADE, o plano fica disponível e a imutabilidade normal das gerações mantém-se' as resultado;

rollback;
