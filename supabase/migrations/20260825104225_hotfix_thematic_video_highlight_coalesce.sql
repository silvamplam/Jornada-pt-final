do $hotfix$
declare
  v_def text;
  v_count integer;
begin
  select pg_catalog.pg_get_functiondef(
    'public.apply_matchday_editorial_profile_workspace_v6(uuid,text,bigint,text,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb,jsonb)'::pg_catalog.regprocedure
  )
  into v_def;

  v_count := (
    pg_catalog.length(v_def)
    - pg_catalog.length(
        pg_catalog.replace(
          v_def,
          'pg_catalog.coalesce',
          ''
        )
      )
  ) / pg_catalog.length('pg_catalog.coalesce');

  if v_count <> 1 then
    raise exception
      'hotfix-v6-qualified-coalesce-count-%',
      v_count;
  end if;

  v_def := pg_catalog.replace(
    v_def,
    'pg_catalog.coalesce',
    'coalesce'
  );

  v_def := pg_catalog.regexp_replace(
    v_def,
    E';\\s*$',
    ''
  );

  execute v_def;
end;
$hotfix$;
