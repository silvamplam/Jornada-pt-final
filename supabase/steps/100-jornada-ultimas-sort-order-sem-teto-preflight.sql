begin;
set local transaction_read_only = on;

do $$
declare
  v_data_type text;
  v_nullable text;
  v_constraint_definition text;
begin
  if to_regclass('public.matchday_latest_news') is null then
    raise exception 'Preflight falhou: public.matchday_latest_news nao existe';
  end if;

  select data_type, is_nullable
  into v_data_type, v_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'matchday_latest_news'
    and column_name = 'sort_order';

  if v_data_type is distinct from 'integer' or v_nullable is distinct from 'NO' then
    raise exception 'Preflight falhou: sort_order deve ser integer not null; tipo %, nullable %', v_data_type, v_nullable;
  end if;

  select pg_get_constraintdef(c.oid)
  into v_constraint_definition
  from pg_constraint c
  where c.conrelid = 'public.matchday_latest_news'::regclass
    and c.conname = 'matchday_latest_news_sort_order_check';

  if v_constraint_definition is null then
    raise exception 'Preflight falhou: matchday_latest_news_sort_order_check nao existe';
  end if;

  if exists (
    select 1
    from public.matchday_latest_news
    where sort_order < 1
  ) then
    raise exception 'Preflight falhou: existem valores sort_order inferiores a 1';
  end if;

  raise notice 'Constraint atual: %', v_constraint_definition;
end
$$;

select
  (
    select pg_get_constraintdef(c.oid)
    from pg_constraint c
    where c.conrelid = 'public.matchday_latest_news'::regclass
      and c.conname = 'matchday_latest_news_sort_order_check'
  ) as current_constraint_definition,
  min(sort_order) as current_min_sort_order,
  max(sort_order) as current_max_sort_order,
  count(*) filter (where sort_order < 1) as invalid_rows,
  false as writes_performed
from public.matchday_latest_news;

rollback;
