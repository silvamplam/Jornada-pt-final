begin;

do $$
begin
  begin
    perform *
    from public.newsroom_apply_complete_editorial_dossier_article_plan_generation(
      null, null, null, null,
      'Título de teste válido',
      'Pós-título de teste suficientemente descritivo',
      '/assets/hero-match.png',
      repeat('corpo de teste ', 10),
      'openai',
      'modelo-teste',
      'dossier-article-plan-body-v2-editorial-profile',
      null,
      repeat('a', 64),
      '{}'::jsonb,
      null, null, null
    );

    raise exception 'smoke_expected_input_rejection';
  exception
    when check_violation then
      null;
  end;
end;
$$;

rollback;
