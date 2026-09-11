begin;

-- Mesa: organização editorial é independente da prova de publicação.
-- Relações explícitas; sem backfill ou associação inferida por fontes partilhadas.
create table public.newsroom_editorial_theme_dossiers (
  dossier_id uuid primary key references public.newsroom_editorial_dossiers(id) on delete restrict,
  theme_id uuid not null references public.newsroom_editorial_themes(id) on delete restrict,
  added_at timestamptz not null default now()
);
create index newsroom_theme_dossiers_theme_idx
  on public.newsroom_editorial_theme_dossiers(theme_id, added_at, dossier_id);

-- Referência da última versão reconhecida neste Tema. NULL em relações anteriores
-- à migration significa "referência desconhecida", nunca "já vista".
alter table public.newsroom_editorial_theme_sources
  add column reference_snapshot_id uuid references public.newsroom_article_snapshots(id) on delete restrict,
  add column reference_at timestamptz;

create table public.newsroom_mesa_organization_requests (
  request_id uuid primary key,
  payload jsonb not null,
  theme_id uuid not null references public.newsroom_editorial_themes(id) on delete restrict,
  added_count integer not null check (added_count >= 0),
  created_at timestamptz not null default now()
);

alter table public.newsroom_editorial_theme_dossiers enable row level security;
alter table public.newsroom_editorial_theme_dossiers force row level security;
alter table public.newsroom_mesa_organization_requests enable row level security;
alter table public.newsroom_mesa_organization_requests force row level security;
revoke all on public.newsroom_editorial_theme_dossiers from public, anon, authenticated, service_role;
revoke all on public.newsroom_mesa_organization_requests from public, anon, authenticated, service_role;
grant select on public.newsroom_editorial_theme_dossiers to service_role;

create function public.newsroom_mesa_theme_source_reference_v1()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if new.reference_snapshot_id is null then
    select s.id into new.reference_snapshot_id
    from public.newsroom_article_snapshots s
    where s.article_id = new.newsroom_article_id
    order by s.extracted_at desc, s.created_at desc, s.id desc limit 1;
    if new.reference_snapshot_id is not null then
      new.reference_at := pg_catalog.statement_timestamp();
    end if;
  elsif not exists (
    select 1 from public.newsroom_article_snapshots s
    where s.id = new.reference_snapshot_id and s.article_id = new.newsroom_article_id
  ) then
    raise exception 'mesa-organization-snapshot-mismatch';
  end if;
  return new;
end;
$function$;
revoke all on function public.newsroom_mesa_theme_source_reference_v1() from public, anon, authenticated, service_role;
create trigger newsroom_mesa_theme_source_reference_v1
before insert on public.newsroom_editorial_theme_sources
for each row execute function public.newsroom_mesa_theme_source_reference_v1();

-- Any existing dossier writer must also leave its new material accessible in the parent.
create function public.newsroom_mesa_dossier_source_membership_v1()
returns trigger language plpgsql security definer set search_path = '' as $function$
declare v_theme_id uuid;
begin
  if new.included then
    select m.theme_id into v_theme_id from public.newsroom_editorial_theme_dossiers m
      where m.dossier_id = new.dossier_id;
    if v_theme_id is not null then
      perform public.newsroom_set_editorial_theme_source_membership_v1(v_theme_id,new.newsroom_article_id,true);
    end if;
  end if;
  return new;
end;
$function$;
revoke all on function public.newsroom_mesa_dossier_source_membership_v1() from public, anon, authenticated, service_role;
create trigger newsroom_mesa_dossier_source_membership_v1
  after insert or update of included on public.newsroom_editorial_dossier_sources
  for each row execute function public.newsroom_mesa_dossier_source_membership_v1();

-- Preserve containment even when an older membership writer is used.
create function public.newsroom_mesa_protect_theme_source_v1()
returns trigger language plpgsql security definer set search_path = '' as $function$
begin
  if exists (
    select 1 from public.newsroom_editorial_theme_dossiers td
    join public.newsroom_editorial_dossier_sources ds on ds.dossier_id = td.dossier_id
    where td.theme_id = old.theme_id and ds.newsroom_article_id = old.newsroom_article_id and ds.included
  ) then raise exception 'mesa-organization-source-in-dossier'; end if;
  return old;
end;
$function$;
revoke all on function public.newsroom_mesa_protect_theme_source_v1() from public, anon, authenticated, service_role;
create trigger newsroom_mesa_protect_theme_source_v1 before delete on public.newsroom_editorial_theme_sources
  for each row execute function public.newsroom_mesa_protect_theme_source_v1();

-- Um único request cria/recupera o Tema e associa toda a seleção atomicamente.
create function public.newsroom_organize_theme_sources_v1(
  p_request_id uuid, p_theme_id uuid, p_title text,
  p_classification_key text, p_source_ids uuid[]
)
returns table(theme_id uuid, added_count integer, reused boolean)
language plpgsql security definer set search_path = '' as $function$
declare
  v_theme_id uuid;
  v_count integer;
  v_payload jsonb;
  v_previous public.newsroom_mesa_organization_requests%rowtype;
  v_source_id uuid;
begin
  if p_request_id is null or p_source_ids is null
    or pg_catalog.cardinality(p_source_ids) < 1
    or pg_catalog.cardinality(p_source_ids) > 200
    or pg_catalog.array_position(p_source_ids, null) is not null
    or (select pg_catalog.count(distinct x) from pg_catalog.unnest(p_source_ids) x)
      <> pg_catalog.cardinality(p_source_ids)
    or (p_theme_id is null and (
      nullif(pg_catalog.btrim(p_title), '') is null
      or pg_catalog.char_length(pg_catalog.btrim(p_title)) > 180
      or p_classification_key is null
      or p_classification_key not in ('benfica','sporting','fc_porto','other_liga_clubs','outside_liga_other')
    ))
  then raise exception 'mesa-organization-invalid-input'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('newsroom-mesa-organization-v1', 0));
  v_payload := pg_catalog.jsonb_build_object(
    'themeId', p_theme_id,
    'title', case when p_theme_id is null then pg_catalog.btrim(p_title) else null end,
    'classification', case when p_theme_id is null then p_classification_key else null end,
    'sources', (select pg_catalog.jsonb_agg(x order by x) from pg_catalog.unnest(p_source_ids) x)
  );
  select * into v_previous from public.newsroom_mesa_organization_requests r
    where r.request_id = p_request_id;
  if found then
    if v_previous.payload is distinct from v_payload then
      raise exception 'mesa-organization-request-conflict';
    end if;
    return query select v_previous.theme_id, v_previous.added_count, true;
    return;
  end if;

  if exists (
    select 1 from pg_catalog.unnest(p_source_ids) x(id)
    left join public.newsroom_articles a on a.id = x.id where a.id is null
  ) then raise exception 'mesa-organization-source-not-found'; end if;

  if p_theme_id is null then
    select t.id into v_theme_id from public.newsroom_create_editorial_theme_v1(
      pg_catalog.btrim(p_title), p_classification_key
    ) t;
  else
    select t.id into v_theme_id from public.newsroom_editorial_themes t
      where t.id = p_theme_id and t.status = 'open' for update;
    if not found then raise exception 'mesa-organization-theme-unavailable'; end if;
  end if;

  select pg_catalog.count(*)::integer into v_count
    from pg_catalog.unnest(p_source_ids) x(id)
    where not exists (select 1 from public.newsroom_editorial_theme_sources m
      where m.theme_id = v_theme_id and m.newsroom_article_id = x.id);
  foreach v_source_id in array p_source_ids loop
    perform public.newsroom_set_editorial_theme_source_membership_v1(v_theme_id, v_source_id, true);
  end loop;
  insert into public.newsroom_mesa_organization_requests(request_id, payload, theme_id, added_count)
    values(p_request_id, v_payload, v_theme_id, v_count);
  return query select v_theme_id, v_count, false;
end;
$function$;
revoke all on function public.newsroom_organize_theme_sources_v1(uuid,uuid,text,text,uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_organize_theme_sources_v1(uuid,uuid,text,text,uuid[]) to service_role;

create function public.newsroom_attach_dossier_to_theme_v1(p_dossier_id uuid, p_theme_id uuid)
returns table(dossier_id uuid, theme_id uuid)
language plpgsql security definer set search_path = '' as $function$
declare
  v_existing uuid;
  v_source_id uuid;
begin
  if p_dossier_id is null or p_theme_id is null then
    raise exception 'mesa-organization-invalid-input';
  end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('newsroom-mesa-organization-v1', 0));
  perform 1 from public.newsroom_editorial_themes t where t.id = p_theme_id and t.status = 'open' for update;
  if not found then raise exception 'mesa-organization-theme-unavailable'; end if;
  perform 1 from public.newsroom_editorial_dossiers d where d.id = p_dossier_id for update;
  if not found then raise exception 'mesa-organization-dossier-not-found'; end if;
  select m.theme_id into v_existing from public.newsroom_editorial_theme_dossiers m
    where m.dossier_id = p_dossier_id;
  if found and v_existing <> p_theme_id then
    raise exception 'mesa-organization-dossier-already-linked';
  end if;
  insert into public.newsroom_editorial_theme_dossiers(dossier_id,theme_id)
    values(p_dossier_id,p_theme_id) on conflict on constraint newsroom_editorial_theme_dossiers_pkey do nothing;
  for v_source_id in
    select distinct s.newsroom_article_id from public.newsroom_editorial_dossier_sources s
    where s.dossier_id = p_dossier_id and s.included
  loop
    perform public.newsroom_set_editorial_theme_source_membership_v1(p_theme_id,v_source_id,true);
  end loop;
  return query select p_dossier_id,p_theme_id;
end;
$function$;
revoke all on function public.newsroom_attach_dossier_to_theme_v1(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_attach_dossier_to_theme_v1(uuid,uuid) to service_role;

-- Preparação e relação com Tema na MESMA transação. Reutiliza o writer v1.
-- Não infere planos nem publica artigos.
create function public.newsroom_prepare_theme_dossier_v1(
  p_theme_id uuid, p_preparation_key uuid, p_title text,
  p_newsroom_article_ids uuid[], p_newsroom_snapshot_ids uuid[],
  p_published_context_article_ids uuid[]
)
returns table(dossier_id uuid, preparation_action text, source_count integer,
  published_context_count integer, image_count integer)
language plpgsql security definer set search_path = '' as $function$
declare v_result record;
begin
  if p_theme_id is null then raise exception 'mesa-organization-invalid-input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('newsroom-mesa-organization-v1', 0));
  perform 1 from public.newsroom_editorial_themes t where t.id = p_theme_id and t.status = 'open' for update;
  if not found then raise exception 'mesa-organization-theme-unavailable'; end if;
  -- The explicit preparation may add selected NOVAS to the chosen Theme.
  -- The foundation validates sources/snapshots; attachment below adds membership.
  select * into v_result from public.newsroom_prepare_editorial_dossier_workspace_v1(
    p_preparation_key,p_title,p_newsroom_article_ids,p_newsroom_snapshot_ids,p_published_context_article_ids
  );
  perform public.newsroom_attach_dossier_to_theme_v1(v_result.dossier_id,p_theme_id);
  return query select v_result.dossier_id,v_result.preparation_action,v_result.source_count,
    v_result.published_context_count,v_result.image_count;
end;
$function$;
revoke all on function public.newsroom_prepare_theme_dossier_v1(uuid,uuid,text,uuid[],uuid[],uuid[]) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_prepare_theme_dossier_v1(uuid,uuid,text,uuid[],uuid[],uuid[]) to service_role;

create function public.newsroom_remove_theme_source_v1(p_theme_id uuid,p_source_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
begin
  if p_theme_id is null or p_source_id is null then raise exception 'mesa-organization-invalid-input'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('newsroom-mesa-organization-v1', 0));
  if exists (
    select 1 from public.newsroom_editorial_theme_dossiers td
    join public.newsroom_editorial_dossier_sources ds on ds.dossier_id = td.dossier_id
    where td.theme_id = p_theme_id and ds.newsroom_article_id = p_source_id and ds.included
  ) then raise exception 'mesa-organization-source-in-dossier'; end if;
  perform public.newsroom_set_editorial_theme_source_membership_v1(p_theme_id,p_source_id,false);
  return true;
end;
$function$;
revoke all on function public.newsroom_remove_theme_source_v1(uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_remove_theme_source_v1(uuid,uuid) to service_role;

-- Visto não é utilizado/publicado. Nunca muda snapshots de produções existentes.
create function public.newsroom_acknowledge_theme_source_v1(p_theme_id uuid,p_source_id uuid,p_snapshot_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
begin
  if p_theme_id is null or p_source_id is null or p_snapshot_id is null then
    raise exception 'mesa-organization-invalid-input';
  end if;
  if not exists(select 1 from public.newsroom_article_snapshots s
    where s.id = p_snapshot_id and s.article_id = p_source_id)
  then raise exception 'mesa-organization-snapshot-mismatch'; end if;
  -- Aceita apenas a versão que o editor viu; se surgir outra, continuará sinalizada.
  update public.newsroom_editorial_theme_sources m
    set reference_snapshot_id = p_snapshot_id, reference_at = pg_catalog.statement_timestamp()
    where m.theme_id = p_theme_id and m.newsroom_article_id = p_source_id
      and not exists (
        select 1 from public.newsroom_article_snapshots previous_snapshot
        join public.newsroom_article_snapshots requested_snapshot on requested_snapshot.id = p_snapshot_id
        where previous_snapshot.id = m.reference_snapshot_id
          and (previous_snapshot.extracted_at, previous_snapshot.created_at, previous_snapshot.id)
            > (requested_snapshot.extracted_at, requested_snapshot.created_at, requested_snapshot.id)
      );
  if not exists(select 1 from public.newsroom_editorial_theme_sources m
    where m.theme_id = p_theme_id and m.newsroom_article_id = p_source_id)
  then raise exception 'mesa-organization-source-outside-theme'; end if;
  return true;
end;
$function$;
revoke all on function public.newsroom_acknowledge_theme_source_v1(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_acknowledge_theme_source_v1(uuid,uuid,uuid) to service_role;

comment on table public.newsroom_editorial_theme_dossiers is
  'Explicit Theme -> Dossier relation. One parent per Dossier; old unlinked Dossiers stay accessible. No source/content copies.';
comment on column public.newsroom_editorial_theme_sources.reference_snapshot_id is
  'Version acknowledged within this Theme. NULL on pre-existing memberships means unknown, not seen. Independent of frozen production snapshots and publication proof.';

notify pgrst, 'reload schema';

commit;
