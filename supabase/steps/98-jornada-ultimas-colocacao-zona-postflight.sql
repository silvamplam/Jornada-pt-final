begin;
set local transaction_read_only = on;

do $$
declare
  v_default text;
  v_nullable text;
  v_constraint text;
begin
  select column_default, is_nullable
  into v_default, v_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'matchday_editorials'
    and column_name = 'latest_zone_placement';

  if v_default is null or v_default not like '%top%' then
    raise exception 'Postflight falhou: latest_zone_placement nao tem default top';
  end if;

  if v_nullable <> 'NO' then
    raise exception 'Postflight falhou: latest_zone_placement permite null';
  end if;

  select pg_get_constraintdef(oid)
  into v_constraint
  from pg_constraint
  where conname = 'matchday_editorials_latest_zone_placement_check';

  if v_constraint is null
     or v_constraint not like '%top%'
     or v_constraint not like '%hidden%' then
    raise exception 'Postflight falhou: constraint de latest_zone_placement incompleta';
  end if;

  if exists (
    select 1
    from public.matchday_editorials
    where latest_zone_placement not in ('top', 'hidden')
  ) then
    raise exception 'Postflight falhou: existem colocacoes de Ultimas invalidas';
  end if;
end
$$;

select
  'Postflight concluido: latest_zone_placement tem default top e aceita apenas top ou hidden' as resultado,
  false as writes_performed;

rollback;
