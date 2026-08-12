begin;

do $$
declare
  v_matchday_id uuid;
  v_incomplete_id uuid := gen_random_uuid();
  v_complete_id uuid := gen_random_uuid();
  v_standard_id uuid := gen_random_uuid();
  v_incomplete_blocked boolean := false;
begin
  select id
  into v_matchday_id
  from public.matchdays
  order by created_at asc
  limit 1;

  if v_matchday_id is null then
    raise exception 'Smoke 123 requer pelo menos uma jornada';
  end if;

  begin
    insert into public.matchday_reference_compositions (
      id, matchday_id, status, is_current, internal_name, presentation_mode
    ) values (
      v_incomplete_id, v_matchday_id, 'published', false, 'smoke-123-incomplete', 'hierarchical'
    );
  exception when check_violation then
    v_incomplete_blocked := true;
  end;

  if not v_incomplete_blocked then
    raise exception 'Smoke 123 falhou: hierarchical publicada sem Editorial completo foi aceite';
  end if;

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, presentation_mode,
    hierarchical_editorial_title, hierarchical_editorial_text, hierarchical_editorial_author
  ) values (
    v_complete_id, v_matchday_id, 'published', false, 'smoke-123-complete', 'hierarchical',
    'Uma leitura da Jornada', 'Primeiro parágrafo.\n\nSegundo parágrafo.', 'Autor de teste'
  );

  insert into public.matchday_reference_compositions (
    id, matchday_id, status, is_current, internal_name, presentation_mode
  ) values (
    v_standard_id, v_matchday_id, 'published', false, 'smoke-123-standard', 'standard'
  );

  if not exists (select 1 from public.matchday_reference_compositions where id = v_complete_id)
     or not exists (select 1 from public.matchday_reference_compositions where id = v_standard_id) then
    raise exception 'Smoke 123 falhou: publicação completa hierarchical ou standard foi bloqueada';
  end if;
end
$$;

rollback;
