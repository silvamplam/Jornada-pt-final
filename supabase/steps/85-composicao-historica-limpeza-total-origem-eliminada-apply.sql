begin;

create or replace function public.remove_deleted_editorial_source_from_matchday_bank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text;
begin
  if tg_table_name = 'editorial_articles' then
    v_source_type := 'editorial_article';
  elsif tg_table_name = 'editorial_contents' then
    v_source_type := 'editorial_content';
  else
    raise exception 'unsupported_editorial_source_table';
  end if;

  -- A eliminação já foi autorizada pela aplicação depois de confirmar que
  -- não restam vínculos públicos. Remove agora os resíduos internos.
  delete from public.matchday_reference_composition_items composition_item
  using public.matchday_editorial_bank_items bank
  where composition_item.source_id = bank.id
    and lower(btrim(coalesce(composition_item.source_type, ''))) in (
      'manual_link',
      'matchday_editorial_bank_item'
    )
    and lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = lower(old.id::text);

  delete from public.matchday_editorial_bank_items bank
  where lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = lower(old.id::text);

  return old;
end
$$;

-- Corrige referências internas já quebradas, sem tocar em notícias existentes.
delete from public.matchday_reference_composition_items composition_item
where lower(btrim(coalesce(composition_item.source_type, ''))) in (
    'manual_link',
    'matchday_editorial_bank_item'
  )
  and not exists (
    select 1
    from public.matchday_editorial_bank_items bank
    where bank.id = composition_item.source_id
  );

-- Remove das composições todos os itens de artigos que já foram eliminados.
delete from public.matchday_reference_composition_items composition_item
using public.matchday_editorial_bank_items bank
where composition_item.source_id = bank.id
  and lower(btrim(coalesce(composition_item.source_type, ''))) in (
    'manual_link',
    'matchday_editorial_bank_item'
  )
  and lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
  and not exists (
    select 1
    from public.editorial_articles article
    where lower(article.id::text) = lower(btrim(coalesce(bank.source_id, '')))
  );

-- Aplica a mesma limpeza aos conteúdos editoriais já eliminados.
delete from public.matchday_reference_composition_items composition_item
using public.matchday_editorial_bank_items bank
where composition_item.source_id = bank.id
  and lower(btrim(coalesce(composition_item.source_type, ''))) in (
    'manual_link',
    'matchday_editorial_bank_item'
  )
  and lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
  and not exists (
    select 1
    from public.editorial_contents content
    where lower(content.id::text) = lower(btrim(coalesce(bank.source_id, '')))
  );

-- Depois das referências internas, elimina definitivamente as entradas órfãs.
delete from public.matchday_editorial_bank_items bank
where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
  and not exists (
    select 1
    from public.editorial_articles article
    where lower(article.id::text) = lower(btrim(coalesce(bank.source_id, '')))
  );

delete from public.matchday_editorial_bank_items bank
where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
  and not exists (
    select 1
    from public.editorial_contents content
    where lower(content.id::text) = lower(btrim(coalesce(bank.source_id, '')))
  );

drop trigger if exists remove_deleted_editorial_article_from_matchday_bank on public.editorial_articles;
create trigger remove_deleted_editorial_article_from_matchday_bank
after delete on public.editorial_articles
for each row
execute function public.remove_deleted_editorial_source_from_matchday_bank();

drop trigger if exists remove_deleted_editorial_content_from_matchday_bank on public.editorial_contents;
create trigger remove_deleted_editorial_content_from_matchday_bank
after delete on public.editorial_contents
for each row
execute function public.remove_deleted_editorial_source_from_matchday_bank();

revoke all on function public.remove_deleted_editorial_source_from_matchday_bank() from public, anon, authenticated;
grant execute on function public.remove_deleted_editorial_source_from_matchday_bank() to service_role;

comment on function public.remove_deleted_editorial_source_from_matchday_bank() is
  'Depois de a aplicação autorizar a eliminação de um artigo ou conteúdo sem vínculos públicos, remove os itens internos das composições e elimina definitivamente a entrada correspondente do banco histórico.';

notify pgrst, 'reload schema';

commit;
