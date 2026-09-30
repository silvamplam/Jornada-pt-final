-- Public titles are optional. Keep the installed activation contract otherwise intact.
do $migration$
declare
  v_function regprocedure := pg_catalog.to_regprocedure(
    'public.activate_matchday_reference_composition(uuid,uuid,boolean)'
  );
  v_definition text;
  v_guard constant text := $guard$or nullif(btrim(public_title), '') is null$guard$;
  v_occurrences integer;
begin
  if v_function is null then
    raise exception 'historical-optional-title: activation function missing';
  end if;

  v_definition := pg_catalog.pg_get_functiondef(v_function);
  v_occurrences := (
    pg_catalog.length(v_definition)
    - pg_catalog.length(pg_catalog.replace(v_definition, v_guard, ''))
  ) / pg_catalog.length(v_guard);

  if v_occurrences <> 1 then
    raise exception 'historical-optional-title: activation source drift (found %)', v_occurrences;
  end if;

  execute pg_catalog.replace(v_definition, v_guard, '');
end;
$migration$;
