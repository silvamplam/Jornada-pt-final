-- Remove tetos editoriais artificiais da produção por Dossiê.
-- Mantém apenas a coerência single/multiple; o tipo integer continua a impor o seu limite técnico natural.

begin;

drop trigger if exists newsroom_editorial_dossier_article_plans_validate_limit
  on public.newsroom_editorial_dossier_article_plans;

drop function if exists public.newsroom_validate_editorial_dossier_article_plan_limit();

alter table public.newsroom_editorial_dossiers
  drop constraint if exists newsroom_editorial_dossiers_output_count_check;

alter table public.newsroom_editorial_dossiers
  add constraint newsroom_editorial_dossiers_output_count_check
  check (
    (output_mode = 'single' and output_count = 1)
    or (output_mode = 'multiple' and output_count >= 2)
  );

commit;
