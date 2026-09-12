\set ON_ERROR_STOP on

-- Disposable validation bridge for the already-applied frozen-source slice of
-- step 31. This is not a migration and must never be applied to Supabase.

alter table public.newsroom_editorial_dossier_sources
  add column title_snapshot text,
  add column published_at_snapshot timestamptz,
  add constraint newsroom_editorial_dossier_sources_title_snapshot_not_blank
    check (title_snapshot is null or btrim(title_snapshot) <> '');

create function public.newsroom_protect_editorial_dossier_source_frozen_identity()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if new.newsroom_article_id is distinct from old.newsroom_article_id
    or new.newsroom_snapshot_id is distinct from old.newsroom_snapshot_id
    or new.title_snapshot is distinct from old.title_snapshot
    or new.published_at_snapshot is distinct from old.published_at_snapshot then
    raise exception 'editorial_dossier_source_frozen_identity_immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$function$;

create trigger newsroom_editorial_dossier_sources_protect_frozen_identity
before update of newsroom_article_id, newsroom_snapshot_id, title_snapshot,
  published_at_snapshot
on public.newsroom_editorial_dossier_sources
for each row
execute function public.newsroom_protect_editorial_dossier_source_frozen_identity();

select 'mesa-workspace-v2-frozen-source-shape-ok' as result;
