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

  delete from public.matchday_editorial_bank_items bank
  where lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = lower(old.id::text)
    and not exists (
      select 1
      from public.matchday_reference_composition_items composition_item
      where composition_item.source_id = bank.id
        and lower(btrim(coalesce(composition_item.source_type, ''))) in (
          'manual_link',
          'matchday_editorial_bank_item'
        )
    );

  return old;
end
$$;

-- Limpa também resíduos arquivados já existentes de artigos apagados,
-- desde que não estejam usados por qualquer composição.
delete from public.matchday_editorial_bank_items bank
where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_article'
  and bank.status = 'archived'
  and not exists (
    select 1
    from public.editorial_articles article
    where lower(article.id::text) = lower(btrim(coalesce(bank.source_id, '')))
  )
  and not exists (
    select 1
    from public.matchday_reference_composition_items composition_item
    where composition_item.source_id = bank.id
      and lower(btrim(coalesce(composition_item.source_type, ''))) in (
        'manual_link',
        'matchday_editorial_bank_item'
      )
  );

-- Aplica a mesma regra aos conteúdos editoriais arquivados.
delete from public.matchday_editorial_bank_items bank
where lower(btrim(coalesce(bank.source_type, ''))) = 'editorial_content'
  and bank.status = 'archived'
  and not exists (
    select 1
    from public.editorial_contents content
    where lower(content.id::text) = lower(btrim(coalesce(bank.source_id, '')))
  )
  and not exists (
    select 1
    from public.matchday_reference_composition_items composition_item
    where composition_item.source_id = bank.id
      and lower(btrim(coalesce(composition_item.source_type, ''))) in (
        'manual_link',
        'matchday_editorial_bank_item'
      )
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
  'Ao eliminar um artigo ou conteúdo, remove do banco histórico apenas a entrada automática livre ou arquivada; itens usados numa composição são preservados por segurança.';

notify pgrst, 'reload schema';
