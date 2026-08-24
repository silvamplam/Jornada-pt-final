create or replace function public.remove_deleted_editorial_source_from_matchday_bank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text;
  v_source_id text;
begin
  if tg_table_name = 'editorial_articles' then
    v_source_type := 'editorial_article';
  elsif tg_table_name = 'editorial_contents' then
    v_source_type := 'editorial_content';
  else
    raise exception 'unsupported_editorial_source_table';
  end if;

  v_source_id := lower(old.id::text);

  if v_source_type = 'editorial_article' then
    delete from public.matchday_live_layout_items live_row
    where lower(btrim(coalesce(live_row.source_type, ''))) = 'editorial_article'
      and lower(btrim(coalesce(live_row.source_id, ''))) = v_source_id;

    delete from public.matchday_editorial_profile_manual_overrides override_row
    where lower(btrim(coalesce(override_row.source_type, ''))) = 'editorial_article'
      and lower(btrim(coalesce(override_row.source_id, ''))) = v_source_id;

    delete from public.matchday_editorial_profile_zone_items zone_row
    where lower(btrim(coalesce(zone_row.source_type, ''))) = 'editorial_article'
      and lower(btrim(coalesce(zone_row.source_id, ''))) = v_source_id;

    delete from public.matchday_editorial_profile_state_items state_row
    where lower(btrim(coalesce(state_row.source_type, ''))) = 'editorial_article'
      and lower(btrim(coalesce(state_row.source_id, ''))) = v_source_id;
  end if;

  delete from public.matchday_reference_composition_items composition_item
  using public.matchday_editorial_bank_items bank
  where composition_item.source_id = bank.id
    and lower(btrim(coalesce(composition_item.source_type, ''))) in (
      'manual_link',
      'matchday_editorial_bank_item'
    )
    and lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = v_source_id;

  delete from public.matchday_editorial_bank_items bank
  where lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = v_source_id;

  return old;
end
$$;

comment on function public.remove_deleted_editorial_source_from_matchday_bank() is
  'Depois de a aplicação autorizar a eliminação sem vínculos públicos, remove Seleção manual, estado temático, referências internas de composição e Banco da identidade editorial eliminada.';

notify pgrst, 'reload schema';