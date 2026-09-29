begin;

-- These receipts are service-owned. The URL is registered by the server using
-- its configured Storage origin, never inferred from a client hostname.
create table public.editorial_image_assets (
  public_url text primary key,
  storage_path text not null unique,
  sha256 text not null check (sha256 ~ '^[a-f0-9]{64}$'),
  byte_size bigint not null check (byte_size between 1 and 8388608),
  content_type text not null check (content_type in ('image/jpeg','image/png','image/webp','image/avif')),
  created_at timestamptz not null default now(),
  check (public_url like '%/storage/v1/object/public/editorial-images/' || storage_path),
  check (storage_path ~ '^editorial/(sha256/[a-f0-9]{64}\.(jpg|png|webp|avif)|20[0-9]{2}/(0[1-9]|1[0-2])/[0-9]{13}-[a-f0-9-]+-[a-z0-9-]+\.(jpe?g|png|webp|avif))$')
);
create table public.editorial_image_decisions (
  decision_key text primary key check (decision_key ~ '^[a-zA-Z0-9:_.-]{1,200}$'),
  source_url text not null,
  state text not null default 'acquiring' check (state in ('acquiring','candidate','ready')),
  image jsonb,
  created_at timestamptz not null default now(),
  check (source_url ~ '^https?://'),
  check ((state = 'acquiring' and image is null) or (state <> 'acquiring' and image is not null))
);
create table public.editorial_image_promotions (
  article_id uuid not null references public.editorial_articles(id),
  source_url text not null,
  candidate_url text not null references public.editorial_image_assets(public_url),
  sha256 text not null,
  reviewer text not null check (btrim(reviewer) <> ''),
  promoted_at timestamptz not null default now(),
  primary key(article_id, source_url, candidate_url)
);
alter table public.editorial_image_assets enable row level security;
alter table public.editorial_image_decisions enable row level security;
alter table public.editorial_image_promotions enable row level security;
revoke all on public.editorial_image_assets,public.editorial_image_decisions,public.editorial_image_promotions from public,anon,authenticated;
grant select,insert on public.editorial_image_assets,public.editorial_image_promotions to service_role;
grant select,insert,update on public.editorial_image_decisions to service_role;

alter table public.newsroom_editorial_dossier_images add column source_url text;
comment on column public.newsroom_editorial_dossier_images.frozen_url is
  'Legacy rows can be external candidates. Only a registered local URL is frozen visual authority; source_url preserves the previous source reference after confirmation.';

create function public.editorial_image_decision_immutable_v1() returns trigger language plpgsql set search_path='' as $$
begin
  if new.decision_key is distinct from old.decision_key or new.source_url is distinct from old.source_url
    or (old.image is not null and new.image is distinct from old.image)
    or (old.state='ready' and new.state <> 'ready')
    or (old.state='candidate' and new.state='acquiring') then
    raise exception 'image-decision-immutable';
  end if;
  return new;
end $$;
create trigger editorial_image_decision_immutable before update on public.editorial_image_decisions
  for each row execute function public.editorial_image_decision_immutable_v1();

create function public.editorial_require_local_image_v1() returns trigger language plpgsql security definer set search_path='' as $$
begin
  if new.status <> 'published' then return new; end if;
  -- Identity-bound grandfathering, including ordinary text edits and preserve.
  -- Draft -> published, NEW and changed references never enter this exception.
  if tg_op='UPDATE' and old.status='published' and new.image_url is not distinct from old.image_url then return new; end if;
  if not exists(select 1 from public.editorial_image_assets a
    join storage.objects o on o.bucket_id='editorial-images' and o.name=a.storage_path
    where a.public_url=new.image_url) then raise exception 'image-materialization-required'; end if;
  return new;
end $$;
revoke all on function public.editorial_require_local_image_v1() from public,anon,authenticated,service_role;
create trigger editorial_require_local_image before insert or update on public.editorial_articles
  for each row execute function public.editorial_require_local_image_v1();

create function public.editorial_confirm_dossier_image_v1(p_image_id uuid,p_decision_key text)
returns void language plpgsql security invoker set search_path='' as $$
declare d public.editorial_image_decisions; i public.newsroom_editorial_dossier_images;
begin
  select * into strict d from public.editorial_image_decisions where decision_key=p_decision_key and state='ready';
  select * into strict i from public.newsroom_editorial_dossier_images where id=p_image_id for update;
  if i.frozen_url=d.image->>'publicUrl' then return; end if;
  if d.source_url is distinct from coalesce(i.source_url,i.frozen_url)
    or not exists(select 1 from public.editorial_image_assets where public_url=d.image->>'publicUrl') then
    raise exception 'image-decision-source-conflict';
  end if;
  update public.newsroom_editorial_dossier_images set source_url=coalesce(source_url,frozen_url),
    frozen_url=d.image->>'publicUrl' where id=p_image_id;
end $$;
revoke all on function public.editorial_confirm_dossier_image_v1(uuid,text) from public,anon,authenticated;
grant execute on function public.editorial_confirm_dossier_image_v1(uuid,text) to service_role;

create function public.editorial_promote_image_v1(p_article_id uuid,p_source_url text,p_candidate_url text,p_sha256 text,p_reviewer text)
returns text language plpgsql security invoker set search_path='' as $$
declare a public.editorial_articles; before_row jsonb; after_row jsonb;
begin
  select * into strict a from public.editorial_articles where id=p_article_id and status='published' for update;
  if a.image_url=p_candidate_url and exists(select 1 from public.editorial_image_promotions
    where article_id=p_article_id and source_url=p_source_url and candidate_url=p_candidate_url and sha256=p_sha256) then return 'reused'; end if;
  if a.image_url is distinct from p_source_url then raise exception 'image-promotion-reference-conflict'; end if;
  if not exists(select 1 from public.editorial_image_assets where public_url=p_candidate_url and sha256=p_sha256)
    or not exists(select 1 from public.editorial_image_decisions where state='ready' and source_url=p_source_url
      and image->>'publicUrl'=p_candidate_url and image->>'sha256'=p_sha256) then raise exception 'image-promotion-candidate-invalid'; end if;
  before_row := to_jsonb(a)-'image_url';
  update public.editorial_articles set image_url=p_candidate_url where id=p_article_id;
  select to_jsonb(t)-'image_url' into after_row from public.editorial_articles t where id=p_article_id;
  if before_row is distinct from after_row then raise exception 'image-promotion-content-changed'; end if;
  insert into public.editorial_image_promotions values(p_article_id,p_source_url,p_candidate_url,p_sha256,p_reviewer,now());
  return 'promoted';
end $$;
revoke all on function public.editorial_promote_image_v1(uuid,text,text,text,text) from public,anon,authenticated;
grant execute on function public.editorial_promote_image_v1(uuid,text,text,text,text) to service_role;

-- A reference-only migration must not relink sources, consolidate a dossier or
-- run the bank's deduplication/composition reconciliation as an UPDATE side effect.
-- Preserve each function's identity, ACL, owner and security/search_path settings.
do $guard_image_only$
declare signature text; definition text;
begin
  foreach signature in array array[
    'public.sync_published_editorial_source_to_matchday_bank()',
    'public.newsroom_link_legacy_article_source_v1()',
    'public.newsroom_mesa_after_article_publication_v2()'
  ] loop
    select pg_get_functiondef(signature::regprocedure) into definition;
    if definition !~ '\mbegin\M' then raise exception 'image-only-trigger-contract-changed: %',signature; end if;
    definition := regexp_replace(definition, '\mbegin\M', $replacement$begin
  if tg_op='UPDATE' and tg_table_name='editorial_articles'
    and (to_jsonb(new)->'image_url') is distinct from (to_jsonb(old)->'image_url')
    and (to_jsonb(new)-'image_url') = (to_jsonb(old)-'image_url') then return new; end if;
$replacement$);
    execute definition;
  end loop;
end $guard_image_only$;
commit;
