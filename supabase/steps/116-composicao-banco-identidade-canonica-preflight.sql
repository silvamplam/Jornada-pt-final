do $$
begin
  if to_regclass('public.matchday_editorial_bank_items') is null then raise exception 'missing matchday_editorial_bank_items'; end if;
  if to_regclass('public.matchday_reference_composition_items') is null then raise exception 'missing matchday_reference_composition_items'; end if;
  if to_regclass('public.matchday_hierarchical_composition_slots') is null then raise exception 'missing matchday_hierarchical_composition_slots'; end if;
  if to_regclass('public.matchday_latest_news') is null then raise exception 'missing matchday_latest_news'; end if;
  if to_regclass('public.matchday_highlights') is null then raise exception 'missing matchday_highlights'; end if;
  if to_regclass('public.matchday_horizontal_news') is null then raise exception 'missing matchday_horizontal_news'; end if;
  if to_regclass('public.matchday_editorials') is null then raise exception 'missing matchday_editorials'; end if;
  if to_regclass('public.editorial_articles') is null then raise exception 'missing editorial_articles'; end if;
  if to_regclass('public.editorial_contents') is null then raise exception 'missing editorial_contents'; end if;
  if to_regprocedure('public.upsert_matchday_editorial_bank_publication(uuid,text,text,text,text,text,text,text,text)') is null then
    raise exception 'missing upsert_matchday_editorial_bank_publication';
  end if;
end
$$;
