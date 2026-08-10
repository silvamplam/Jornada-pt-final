begin;

do $$
declare
  v_matchday_id uuid;
  v_inserted_count integer;
begin
  select m.id
  into v_matchday_id
  from public.matchdays m
  where not exists (
    select 1
    from public.matchday_latest_news
    where matchday_id = m.id
  )
  order by m.created_at asc nulls last, m.id asc
  limit 1;

  if v_matchday_id is null then
    raise exception 'Smoke falhou: nao existe uma jornada sem linhas de Ultimas para validar sort_order';
  end if;

  begin
    insert into public.matchday_latest_news (matchday_id, title, sort_order, status)
    values (v_matchday_id, '__smoke_ultimas_sort_order_0__', 0, 'draft');

    raise exception 'Smoke falhou: sort_order 0 foi aceite';
  exception
    when check_violation then
      null;
  end;

  insert into public.matchday_latest_news (matchday_id, title, sort_order, status)
  values
    (v_matchday_id, '__smoke_ultimas_sort_order_10__', 10, 'draft'),
    (v_matchday_id, '__smoke_ultimas_sort_order_11__', 11, 'draft'),
    (v_matchday_id, '__smoke_ultimas_sort_order_25__', 25, 'draft');

  select count(*)
  into v_inserted_count
  from public.matchday_latest_news
  where matchday_id = v_matchday_id
    and title in (
      '__smoke_ultimas_sort_order_10__',
      '__smoke_ultimas_sort_order_11__',
      '__smoke_ultimas_sort_order_25__'
    );

  if v_inserted_count <> 3 then
    raise exception 'Smoke falhou: esperadas 3 linhas temporarias; encontradas %', v_inserted_count;
  end if;
end
$$;

select 'Smoke concluido: sort_order aceita 10, 11 e 25, rejeita 0 e o rollback preservara os dados' as resultado;

rollback;
