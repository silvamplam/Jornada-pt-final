do $$
begin
  if to_regprocedure(
    'public.newsroom_apply_editorial_dossier_article_plan_generation(uuid,uuid,uuid,timestamptz,text,text,text,text,text,text,jsonb,integer,integer,integer)'
  ) is null then
    raise exception 'missing_base_generation_rpc';
  end if;

  if to_regclass('public.editorial_articles') is null then
    raise exception 'missing_editorial_articles';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'editorial_articles'
      and column_name in ('title', 'subtitle', 'image_url', 'body', 'status', 'updated_at')
    group by table_schema, table_name
    having count(*) = 6
  ) then
    raise exception 'missing_editorial_article_columns';
  end if;
end;
$$;
