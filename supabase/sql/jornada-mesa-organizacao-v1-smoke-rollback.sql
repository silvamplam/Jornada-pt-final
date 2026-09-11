-- Executar apenas num PostgreSQL local descartável, com a fundação e a migration.
-- Não executar no Supabase de produção. Tudo termina em ROLLBACK.
begin;
do $local_only$
begin
  if inet_server_addr() is not null and inet_server_addr() not in ('127.0.0.1'::inet, '::1'::inet) then
    raise exception 'mesa-smoke-local-only: remote databases are not allowed';
  end if;
end;
$local_only$;

insert into public.newsroom_articles (
  id, source_code, original_url, normalized_url, title, published_at,
  detected_at, image_url, processing_status, first_detected_at, last_detected_at
) values
('94000000-0000-4000-8000-000000000001', '__mesa_organization_smoke__', 'https://example.invalid/mesa-source-1',
 'https://example.invalid/mesa-source-1', 'Sporting: fonte um', '2026-09-10 12:00:00+00', '2026-09-10 12:01:00+00',
 'https://example.invalid/one.jpg', 'ready_for_review', '2026-09-10 12:01:00+00', '2026-09-10 12:01:00+00'),
('94000000-0000-4000-8000-000000000002', '__mesa_organization_smoke__', 'https://example.invalid/mesa-source-2',
 'https://example.invalid/mesa-source-2', 'Sporting: fonte dois', '2026-09-10 12:00:00+00', '2026-09-10 12:01:00+00',
 'https://example.invalid/two.jpg', 'ready_for_review', '2026-09-10 12:01:00+00', '2026-09-10 12:01:00+00');
insert into public.newsroom_article_snapshots (id,article_id,content_hash,body,source_metadata,extracted_at) values
('94000000-0000-4000-8000-000000000101','94000000-0000-4000-8000-000000000001',repeat('c',64),
 '[{"type":"paragraph","text":"Primeiras declarações."}]','{}','2026-09-10 12:02:00+00'),
('94000000-0000-4000-8000-000000000102','94000000-0000-4000-8000-000000000002',repeat('d',64),
 '[{"type":"paragraph","text":"Reações ao jogo."}]','{}','2026-09-10 12:02:00+00');

set local role service_role;
do $test$
declare
  a uuid := '94000000-0000-4000-8000-000000000001';
  b uuid := '94000000-0000-4000-8000-000000000002';
  sa uuid := '94000000-0000-4000-8000-000000000101';
  sb uuid := '94000000-0000-4000-8000-000000000102';
  t record; again record; d record; t2 record;
  before_articles bigint; before_plans bigint; before_themes bigint;
  rejected boolean;
begin
  select count(*) into before_articles from public.editorial_articles;
  select count(*) into before_plans from public.newsroom_editorial_dossier_article_plans;
  select * into t from public.newsroom_organize_theme_sources_v1(
    '94000000-0000-4000-8000-000000000201',null,'Jogo do Sporting','sporting',array[a]);
  select * into again from public.newsroom_organize_theme_sources_v1(
    '94000000-0000-4000-8000-000000000201',null,'Jogo do Sporting','sporting',array[a]);
  if not again.reused or again.theme_id <> t.theme_id then raise exception 'smoke retry duplicated theme'; end if;
  if (select reference_snapshot_id from public.newsroom_editorial_theme_sources
      where theme_id = t.theme_id and newsroom_article_id = a) is distinct from sa then
    raise exception 'smoke baseline not captured';
  end if;
  rejected := false;
  begin
    perform public.newsroom_organize_theme_sources_v1(
      '94000000-0000-4000-8000-000000000201',null,'Pedido diferente','sporting',array[a]);
  exception when others then
    if sqlerrm not like '%request-conflict%' then raise; end if; rejected := true;
  end;
  if not rejected then raise exception 'smoke conflicting request accepted'; end if;

  select count(*) into before_themes from public.newsroom_editorial_themes;
  rejected := false;
  begin
    perform public.newsroom_organize_theme_sources_v1(
      '94000000-0000-4000-8000-000000000202',null,'Tema que deve falhar','sporting',
      array[a,'94000000-0000-4000-8000-000000009999'::uuid]);
  exception when others then
    if sqlerrm not like '%source-not-found%' then raise; end if; rejected := true;
  end;
  if not rejected or (select count(*) from public.newsroom_editorial_themes) <> before_themes then
    raise exception 'smoke partial theme persisted';
  end if;

  -- Preparation explicitly adds source B and links the Dossier, all in one transaction.
  select * into d from public.newsroom_prepare_theme_dossier_v1(t.theme_id,
    '94000000-0000-4000-8000-000000000301','Cobertura do jogo',array[a,b],array[sa,sb],'{}'::uuid[]);
  if (select count(*) from public.newsroom_editorial_theme_dossiers where dossier_id = d.dossier_id and theme_id = t.theme_id) <> 1
    or (select count(*) from public.newsroom_editorial_theme_sources where theme_id = t.theme_id) <> 2 then
    raise exception 'smoke hierarchy not persisted';
  end if;
  select * into again from public.newsroom_prepare_theme_dossier_v1(t.theme_id,
    '94000000-0000-4000-8000-000000000301','Cobertura do jogo',array[a,b],array[sa,sb],'{}'::uuid[]);
  if again.dossier_id <> d.dossier_id or again.preparation_action <> 'reused' then raise exception 'smoke dossier duplicated'; end if;
  if (select count(*) from public.editorial_articles) <> before_articles
    or (select count(*) from public.newsroom_editorial_dossier_article_plans) <> before_plans then
    raise exception 'smoke organization produced output unexpectedly';
  end if;
  rejected := false;
  begin perform public.newsroom_remove_theme_source_v1(t.theme_id,a);
  exception when others then
    if sqlerrm not like '%source-in-dossier%' then raise; end if; rejected := true;
  end;
  if not rejected then raise exception 'smoke production source removed from parent'; end if;
  rejected := false;
  begin perform public.newsroom_set_editorial_theme_source_membership_v1(t.theme_id,a,false);
  exception when others then
    if sqlerrm not like '%source-in-dossier%' then raise; end if; rejected := true;
  end;
  if not rejected then raise exception 'smoke older writer bypassed hierarchy'; end if;

  select * into t2 from public.newsroom_organize_theme_sources_v1(
    '94000000-0000-4000-8000-000000000203',null,'Outro contexto','sporting',array[a]);
  rejected := false;
  begin perform public.newsroom_attach_dossier_to_theme_v1(d.dossier_id,t2.theme_id);
  exception when others then
    if sqlerrm not like '%dossier-already-linked%' then raise; end if; rejected := true;
  end;
  if not rejected then raise exception 'smoke dossier parent changed silently'; end if;
  perform public.newsroom_remove_theme_source_v1(t2.theme_id,a);
  if not exists(select 1 from public.newsroom_articles where id = a) then raise exception 'smoke source deleted'; end if;
end;
$test$;
reset role;
insert into public.newsroom_article_snapshots(id,article_id,content_hash,body,source_metadata,extracted_at) values
('94000000-0000-4000-8000-000000000103','94000000-0000-4000-8000-000000000001',repeat('e',64),
 '[{"type":"paragraph","text":"Primeiras declarações. Nova reação confirmada."}]','{}','2026-09-10 13:02:00+00');
set local role service_role;
do $version$
declare tid uuid; did uuid;
begin
  select theme_id,dossier_id into tid,did from public.newsroom_editorial_theme_dossiers
    where dossier_id = (select id from public.newsroom_editorial_dossiers where preparation_key = '94000000-0000-4000-8000-000000000301');
  perform public.newsroom_acknowledge_theme_source_v1(tid,'94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000103');
  if (select reference_snapshot_id from public.newsroom_editorial_theme_sources
    where theme_id=tid and newsroom_article_id='94000000-0000-4000-8000-000000000001') <> '94000000-0000-4000-8000-000000000103'::uuid then
    raise exception 'smoke latest seen version not saved';
  end if;
  perform public.newsroom_acknowledge_theme_source_v1(tid,'94000000-0000-4000-8000-000000000001','94000000-0000-4000-8000-000000000101');
  if (select reference_snapshot_id from public.newsroom_editorial_theme_sources
    where theme_id=tid and newsroom_article_id='94000000-0000-4000-8000-000000000001') <> '94000000-0000-4000-8000-000000000103'::uuid then
    raise exception 'smoke acknowledgement regressed';
  end if;
  if (select newsroom_snapshot_id from public.newsroom_editorial_dossier_sources
    where dossier_id=did and newsroom_article_id='94000000-0000-4000-8000-000000000001') <> '94000000-0000-4000-8000-000000000101'::uuid then
    raise exception 'smoke frozen production version was changed';
  end if;
end;
$version$;
rollback;
