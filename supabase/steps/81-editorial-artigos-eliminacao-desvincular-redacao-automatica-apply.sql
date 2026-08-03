begin;

-- Mantém as gerações imutáveis durante o uso normal, mas permite que a
-- cascata originada pela eliminação do artigo remova o respetivo artefacto.
create or replace function public.newsroom_reject_editorial_generation_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE'
     and pg_catalog.pg_trigger_depth() > 1
     and old.editorial_article_id is not null
     and not exists (
       select 1
       from public.editorial_articles article
       where article.id = old.editorial_article_id
     ) then
    return old;
  end if;

  raise exception 'editorial_generation_immutable'
    using errcode = '55000';
end;
$$;

-- Remove as três chaves pelo relacionamento real entre colunas. Isto evita
-- depender de nomes que o PostgreSQL pode truncar a 63 caracteres.
do $$
declare
  v_target record;
  v_constraint record;
begin
  for v_target in
    select *
    from (values
      ('newsroom_editorial_dossier_article_plans'::text),
      ('newsroom_editorial_dossier_article_plan_generations'::text),
      ('newsroom_editorial_compose_requests'::text)
    ) as target(table_name)
  loop
    for v_constraint in
      select constraint_row.conname
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
    loop
      execute format(
        'alter table public.%I drop constraint %I',
        v_target.table_name,
        v_constraint.conname
      );
    end loop;
  end loop;
end
$$;

-- O plano editorial continua a existir e volta a ficar sem artigo convertido.
alter table public.newsroom_editorial_dossier_article_plans
  add constraint newsroom_editorial_dossier_article_plans_editorial_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete set null;

-- A geração pertence ao artigo eliminado e deixa de ter utilidade operacional.
-- Usa um nome curto e estável para não voltar a depender da truncagem automática.
alter table public.newsroom_editorial_dossier_article_plan_generations
  add constraint newsroom_editorial_plan_generations_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete cascade;

-- O pedido idempotente já concluído também depende daquele artigo concreto.
alter table public.newsroom_editorial_compose_requests
  add constraint newsroom_editorial_compose_requests_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete cascade;

comment on constraint newsroom_editorial_dossier_article_plans_editorial_article_fkey
  on public.newsroom_editorial_dossier_article_plans is
  'Ao eliminar um artigo editorial, preserva o plano e liberta-o para nova conversão.';

comment on constraint newsroom_editorial_plan_generations_article_fkey
  on public.newsroom_editorial_dossier_article_plan_generations is
  'Ao eliminar um artigo editorial, remove a geração interna que produziu esse artigo.';

comment on constraint newsroom_editorial_compose_requests_article_fkey
  on public.newsroom_editorial_compose_requests is
  'Ao eliminar um artigo editorial, remove o pedido idempotente associado a esse artigo.';

notify pgrst, 'reload schema';

commit;
