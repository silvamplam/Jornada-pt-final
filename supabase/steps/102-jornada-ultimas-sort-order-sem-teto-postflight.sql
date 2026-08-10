begin;
set local transaction_read_only = on;

do $$
declare
  v_data_type text;
  v_nullable text;
  v_constraint_expression text;
  v_normalized_expression text;
  v_constraint_validated boolean;
begin
  select data_type, is_nullable
  into v_data_type, v_nullable
  from information_schema.columns
  where table_schema = 'public'
    and table_name = 'matchday_latest_news'
    and column_name = 'sort_order';

  if v_data_type is distinct from 'integer' or v_nullable is distinct from 'NO' then
    raise exception 'Postflight falhou: sort_order deixou de ser integer not null';
  end if;

  select pg_get_expr(c.conbin, c.conrelid), c.convalidated
  into v_constraint_expression, v_constraint_validated
  from pg_constraint c
  where c.conrelid = 'public.matchday_latest_news'::regclass
    and c.conname = 'matchday_latest_news_sort_order_check';

  if v_constraint_expression is null then
    raise exception 'Postflight falhou: matchday_latest_news_sort_order_check nao existe';
  end if;

  v_normalized_expression := regexp_replace(
    lower(v_constraint_expression),
    '[[:space:]()]',
    '',
    'g'
  );

  if v_normalized_expression <> 'sort_order>=1' then
    raise exception 'Postflight falhou: constraint inesperada: %', v_constraint_expression;
  end if;

  if not v_constraint_validated then
    raise exception 'Postflight falhou: constraint nao esta validada';
  end if;

  if exists (
    select 1
    from public.matchday_latest_news
    where sort_order < 1
  ) then
    raise exception 'Postflight falhou: existem valores sort_order inferiores a 1';
  end if;
end
$$;

select
  pg_get_expr(c.conbin, c.conrelid) as constraint_expression,
  c.convalidated as constraint_validated,
  (select max(sort_order) from public.matchday_latest_news) as current_max_sort_order,
  false as writes_performed
from pg_constraint c
where c.conrelid = 'public.matchday_latest_news'::regclass
  and c.conname = 'matchday_latest_news_sort_order_check';

rollback;
