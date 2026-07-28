-- JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-SCHEMA-1
-- SQL 4/4 — SMOKE TEST TRANSACIONAL COM ROLLBACK
-- Exige pelo menos um snapshot já persistido. Não deixa dados permanentes.

begin;

do $$
declare
  v_snapshot record;
  v_dossier_id uuid;
  v_source_id uuid;
  v_source_count integer;
begin
  select snapshot.id, snapshot.article_id
  into v_snapshot
  from public.newsroom_article_snapshots snapshot
  order by snapshot.extracted_at desc, snapshot.created_at desc, snapshot.id desc
  limit 1;

  if not found then
    raise exception 'smoke_requires_existing_newsroom_snapshot'
      using errcode = '55000';
  end if;

  insert into public.newsroom_editorial_dossiers (
    title,
    status,
    editorial_instructions,
    context_instructions,
    output_mode,
    output_count,
    length_mode,
    article_kind,
    output_language
  ) values (
    'Smoke Dossiê editorial',
    'draft',
    'Ordenar a informação por relevância definida pelo editor.',
    'Usar apenas o contexto indicado pelo editor.',
    'single',
    1,
    'standard',
    'news',
    'pt-PT'
  )
  returning id into v_dossier_id;

  insert into public.newsroom_editorial_dossier_sources (
    dossier_id,
    newsroom_article_id,
    newsroom_snapshot_id,
    source_role,
    sort_order,
    editorial_note,
    included
  ) values (
    v_dossier_id,
    v_snapshot.article_id,
    v_snapshot.id,
    'primary',
    10,
    'Fonte principal do smoke test.',
    true
  )
  returning id into v_source_id;

  if v_source_id is null then
    raise exception 'smoke_source_insert_failed'
      using errcode = '55000';
  end if;

  select count(*)
  into v_source_count
  from public.newsroom_editorial_dossier_sources source_row
  where source_row.dossier_id = v_dossier_id
    and source_row.newsroom_article_id = v_snapshot.article_id
    and source_row.newsroom_snapshot_id = v_snapshot.id
    and source_row.source_role = 'primary'
    and source_row.included;

  if v_source_count <> 1 then
    raise exception 'smoke_source_readback_failed'
      using errcode = '55000';
  end if;

  begin
    insert into public.newsroom_editorial_dossier_sources (
      dossier_id,
      newsroom_article_id,
      newsroom_snapshot_id,
      source_role,
      sort_order
    ) values (
      v_dossier_id,
      v_snapshot.article_id,
      v_snapshot.id,
      'complementary',
      20
    );

    raise exception 'smoke_duplicate_source_was_not_blocked'
      using errcode = '55000';
  exception
    when unique_violation then
      null;
  end;

  begin
    insert into public.newsroom_editorial_dossiers (
      title,
      output_mode,
      output_count
    ) values (
      'Smoke inválido',
      'single',
      2
    );

    raise exception 'smoke_invalid_output_count_was_not_blocked'
      using errcode = '55000';
  exception
    when check_violation then
      null;
  end;

  update public.newsroom_editorial_dossiers
  set status = 'ready_for_generation'
  where id = v_dossier_id;

  if not exists (
    select 1
    from public.newsroom_editorial_dossiers dossier
    where dossier.id = v_dossier_id
      and dossier.status = 'ready_for_generation'
      and dossier.updated_at is not null
  ) then
    raise exception 'smoke_dossier_update_failed'
      using errcode = '55000';
  end if;

  delete from public.newsroom_editorial_dossiers
  where id = v_dossier_id;

  if exists (
    select 1
    from public.newsroom_editorial_dossier_sources source_row
    where source_row.dossier_id = v_dossier_id
  ) then
    raise exception 'smoke_dossier_source_cascade_failed'
      using errcode = '55000';
  end if;
end;
$$;

select jsonb_build_object(
  'phase', 'JORNADA-BACKOFFICE-REDACAO-AUTOMATICA-DOSSIE-EDITORIAL-SCHEMA-1',
  'smoke_ok', true,
  'persistent_writes', false
) as smoke_result;

rollback;
