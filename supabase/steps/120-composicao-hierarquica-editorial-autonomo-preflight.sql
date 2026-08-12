do $$
declare
  v_column record;
begin
  if to_regclass('public.matchday_reference_compositions') is null then
    raise exception 'Preflight 120 falhou: tabela public.matchday_reference_compositions ausente';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'matchday_reference_compositions'
      and column_name = 'presentation_mode'
      and data_type = 'text'
  ) then
    raise exception 'Preflight 120 falhou: presentation_mode ausente';
  end if;

  for v_column in
    select expected.column_name, actual.data_type
    from (values
      ('hierarchical_editorial_title'),
      ('hierarchical_editorial_text'),
      ('hierarchical_editorial_author')
    ) as expected(column_name)
    left join information_schema.columns actual
      on actual.table_schema = 'public'
     and actual.table_name = 'matchday_reference_compositions'
     and actual.column_name = expected.column_name
    where actual.column_name is not null
  loop
    if v_column.data_type <> 'text' then
      raise exception 'Preflight 120 falhou: coluna % existe com tipo incompatível %', v_column.column_name, v_column.data_type;
    end if;
  end loop;
end
$$;
