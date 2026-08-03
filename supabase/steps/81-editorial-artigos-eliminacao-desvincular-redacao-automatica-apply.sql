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

-- O plano editorial continua a existir e volta a ficar sem artigo convertido.
alter table public.newsroom_editorial_dossier_article_plans
  drop constraint if exists newsroom_editorial_dossier_article_plans_editorial_article_fkey;

alter table public.newsroom_editorial_dossier_article_plans
  add constraint newsroom_editorial_dossier_article_plans_editorial_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete set null;

-- A geração pertence ao artigo eliminado e deixa de ter utilidade operacional.
alter table public.newsroom_editorial_dossier_article_plan_generations
  drop constraint if exists newsroom_editorial_dossier_article_plan_generations_article_fkey;

alter table public.newsroom_editorial_dossier_article_plan_generations
  add constraint newsroom_editorial_dossier_article_plan_generations_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete cascade;

-- O pedido idempotente já concluído também depende daquele artigo concreto.
alter table public.newsroom_editorial_compose_requests
  drop constraint if exists newsroom_editorial_compose_requests_article_fkey;

alter table public.newsroom_editorial_compose_requests
  add constraint newsroom_editorial_compose_requests_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete cascade;

comment on constraint newsroom_editorial_dossier_article_plans_editorial_article_fkey
  on public.newsroom_editorial_dossier_article_plans is
  'Ao eliminar um artigo editorial, preserva o plano e liberta-o para nova conversão.';

comment on constraint newsroom_editorial_dossier_article_plan_generations_article_fkey
  on public.newsroom_editorial_dossier_article_plan_generations is
  'Ao eliminar um artigo editorial, remove a geração interna que produziu esse artigo.';

comment on constraint newsroom_editorial_compose_requests_article_fkey
  on public.newsroom_editorial_compose_requests is
  'Ao eliminar um artigo editorial, remove o pedido idempotente associado a esse artigo.';

notify pgrst, 'reload schema';

commit;
