begin;

do $$
declare
  v_matchday_id uuid;
  v_editorial_id uuid;
  v_placement text;
begin
  select id
  into v_matchday_id
  from public.matchdays
  order by created_at asc nulls last, id asc
  limit 1;

  if v_matchday_id is null then
    raise exception 'Smoke falhou: nao existe uma jornada para validar latest_zone_placement';
  end if;

  insert into public.matchday_editorials (matchday_id)
  values (v_matchday_id)
  on conflict (matchday_id) do update
  set latest_zone_placement = excluded.latest_zone_placement
  returning id, latest_zone_placement into v_editorial_id, v_placement;

  if v_placement <> 'top' then
    raise exception 'Smoke falhou: registo atual nao recebeu default top';
  end if;

  update public.matchday_editorials
  set latest_zone_placement = 'hidden'
  where id = v_editorial_id
  returning latest_zone_placement into v_placement;

  if v_placement <> 'hidden' then
    raise exception 'Smoke falhou: nao foi possivel ocultar Ultimas';
  end if;

  update public.matchday_editorials
  set latest_zone_placement = 'top'
  where id = v_editorial_id
  returning latest_zone_placement into v_placement;

  if v_placement <> 'top' then
    raise exception 'Smoke falhou: nao foi possivel mostrar Ultimas';
  end if;
end
$$;

select 'Smoke concluido: default top e alternancia hidden/top funcionam; rollback preservara os dados' as resultado;

rollback;
