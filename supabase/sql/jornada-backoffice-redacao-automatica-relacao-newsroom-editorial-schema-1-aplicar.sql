-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-RELACAO-NEWSROOM-EDITORIAL-SCHEMA-1
-- SQL DE APLICACAO PERSISTENTE MANUAL

begin;

alter table public.editorial_articles
  add column newsroom_article_id uuid,
  add constraint editorial_articles_newsroom_article_id_fkey
    foreign key (newsroom_article_id)
    references public.newsroom_articles(id)
    on delete restrict;

create unique index editorial_articles_newsroom_article_id_uidx
  on public.editorial_articles (newsroom_article_id)
  where newsroom_article_id is not null;

commit;
