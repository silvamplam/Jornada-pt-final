do $$
declare
  v_constraint_definition text;
  v_constraint_validated boolean;
begin
  if exists (
    select 1
    from (values
      ('hierarchical_editorial_title'),
      ('hierarchical_editorial_text'),
      ('hierarchical_editorial_author')
    ) as expected(column_name)
    left join information_schema.columns actual
      on actual.table_schema = 'public'
     and actual.table_name = 'matchday_reference_compositions'
     and actual.column_name = expected.column_name
    where actual.column_name is null
       or actual.data_type <> 'text'
  ) then
    raise exception 'Postflight 122 falhou: colunas do Editorial hierarchical ausentes ou incompatíveis';
  end if;

  select pg_get_constraintdef(oid), convalidated
  into v_constraint_definition, v_constraint_validated
  from pg_constraint
  where conrelid = 'public.matchday_reference_compositions'::regclass
    and conname = 'matchday_reference_compositions_hierarchical_editorial_complete_check';

  if v_constraint_definition is null
     or v_constraint_definition not ilike '%presentation_mode%'
     or v_constraint_definition not ilike '%hierarchical%'
     or v_constraint_definition not ilike '%status%'
     or v_constraint_definition not ilike '%published%'
     or v_constraint_definition not ilike '%hierarchical_editorial_title%'
     or v_constraint_definition not ilike '%hierarchical_editorial_text%'
     or v_constraint_definition not ilike '%hierarchical_editorial_author%' then
    raise exception 'Postflight 122 falhou: proteção do Editorial hierarchical incompleta';
  end if;

  if v_constraint_validated then
    raise exception 'Postflight 122 falhou: constraint deveria permanecer NOT VALID para tolerar versões legacy já publicadas';
  end if;
end
$$;
