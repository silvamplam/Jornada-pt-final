begin;

-- Additive audit: leave the v1 function and every historical promotion untouched.
create table public.editorial_image_replacement_promotions (
  article_id uuid not null references public.editorial_articles(id),
  replacement_decision_key text not null references public.editorial_image_decisions(decision_key),
  previous_image_url text not null,
  source_url text not null,
  candidate_url text not null,
  sha256 text not null,
  reviewer text not null check (btrim(reviewer) <> ''),
  promoted_at timestamptz not null default now(),
  primary key (article_id, replacement_decision_key),
  foreign key (article_id, source_url, candidate_url)
    references public.editorial_image_promotions(article_id, source_url, candidate_url)
);
alter table public.editorial_image_replacement_promotions enable row level security;
revoke all on public.editorial_image_replacement_promotions from public, anon, authenticated;
grant select, insert on public.editorial_image_replacement_promotions to service_role;

-- Receipts plus actual Storage catalogue entries; no network requests or host constants.
create function public.editorial_assert_replacement_asset_v1(p_candidate_url text)
returns public.editorial_image_assets language plpgsql security invoker set search_path='' as $$
declare a public.editorial_image_assets; o record; n integer := 0;
begin
  select * into strict a from public.editorial_image_assets where public_url=p_candidate_url;
  if a.storage_path !~ ('^editorial/sha256/'||a.sha256||'\.(jpg|png|webp|avif)$') then
    raise exception 'image-replacement-noncanonical-asset';
  end if;
  for o in select name,metadata from storage.objects where bucket_id='editorial-images'
    and name in (a.storage_path,
      'previews/v1/'||a.storage_path||'/w320.webp', 'previews/v1/'||a.storage_path||'/w640.webp',
      'previews/v1/'||a.storage_path||'/w960.webp', 'previews/v1/'||a.storage_path||'/w1280.webp')
    for share loop
    n := n+1;
    if coalesce((o.metadata->>'size')::bigint,0)<=0 then raise exception 'image-replacement-empty-object'; end if;
    if o.name=a.storage_path then
      if (o.metadata->>'size')::bigint is distinct from a.byte_size
        or o.metadata->>'mimetype' is distinct from a.content_type then
        raise exception 'image-replacement-original-mismatch';
      end if;
    elsif o.metadata->>'mimetype' is distinct from 'image/webp' then
      raise exception 'image-replacement-preview-invalid';
    end if;
  end loop;
  if n<>5 then raise exception 'image-replacement-objects-incomplete'; end if;
  return a;
end $$;

-- Explicit association of an already verified immutable asset, without refetching its source.
create function public.editorial_register_image_replacement_v1(
  p_article_id uuid, p_expected_current_image_url text, p_replacement_decision_key text,
  p_source_url text, p_candidate_url text)
returns text language plpgsql security invoker set search_path='' as $$
declare a public.editorial_articles; asset public.editorial_image_assets;
  d public.editorial_image_decisions; frozen jsonb; inserted integer;
begin
  if p_replacement_decision_key is null or p_replacement_decision_key not like 'replacement:'||p_article_id::text||':%'
    or p_source_url is null or p_source_url !~ '^https?://' then raise exception 'image-replacement-decision-invalid'; end if;
  select * into strict a from public.editorial_articles where id=p_article_id and status='published' for update;
  if a.image_url is distinct from p_expected_current_image_url then raise exception 'image-replacement-reference-conflict'; end if;
  asset := public.editorial_assert_replacement_asset_v1(p_candidate_url);
  frozen := jsonb_build_object('path',asset.storage_path,'publicUrl',asset.public_url,
    'sha256',asset.sha256,'byteSize',asset.byte_size,'contentType',asset.content_type);
  insert into public.editorial_image_decisions(decision_key,source_url,state,image)
    values(p_replacement_decision_key,p_source_url,'ready',frozen) on conflict do nothing;
  get diagnostics inserted = row_count;
  select * into strict d from public.editorial_image_decisions where decision_key=p_replacement_decision_key;
  if d.source_url is distinct from p_source_url or d.image is distinct from frozen or d.state<>'ready' then
    raise exception 'image-replacement-decision-conflict';
  end if;
  return case when inserted=1 then 'registered' else 'reused' end;
end $$;

create function public.editorial_promote_image_v2(
  p_article_id uuid, p_expected_current_image_url text, p_replacement_decision_key text, p_reviewer text)
returns text language plpgsql security invoker set search_path='' as $$
declare a public.editorial_articles; d public.editorial_image_decisions; asset public.editorial_image_assets;
  receipt public.editorial_image_replacement_promotions; before_row jsonb; after_row jsonb;
begin
  if p_reviewer is null or btrim(p_reviewer)='' then raise exception 'image-replacement-reviewer-required'; end if;
  if p_replacement_decision_key is null or p_replacement_decision_key not like 'replacement:'||p_article_id::text||':%' then
    raise exception 'image-replacement-decision-invalid';
  end if;
  select * into strict a from public.editorial_articles where id=p_article_id and status='published' for update;
  select * into strict d from public.editorial_image_decisions where decision_key=p_replacement_decision_key and state='ready';
  asset := public.editorial_assert_replacement_asset_v1(d.image->>'publicUrl');
  if d.image is distinct from jsonb_build_object('path',asset.storage_path,'publicUrl',asset.public_url,
    'sha256',asset.sha256,'byteSize',asset.byte_size,'contentType',asset.content_type) then
    raise exception 'image-replacement-decision-asset-mismatch';
  end if;
  select * into receipt from public.editorial_image_replacement_promotions
    where article_id=p_article_id and replacement_decision_key=p_replacement_decision_key;
  if found then
    if a.image_url=asset.public_url and receipt.previous_image_url=p_expected_current_image_url
      and receipt.source_url=d.source_url and receipt.candidate_url=asset.public_url and receipt.sha256=asset.sha256 then
      return 'reused';
    end if;
    raise exception 'image-replacement-retry-conflict';
  end if;
  if a.image_url is distinct from p_expected_current_image_url or a.image_url=asset.public_url then
    raise exception 'image-replacement-reference-conflict';
  end if;
  before_row := to_jsonb(a)-'image_url';
  update public.editorial_articles set image_url=asset.public_url where id=p_article_id;
  select to_jsonb(t) into after_row from public.editorial_articles t where id=p_article_id;
  if before_row is distinct from (after_row-'image_url') then raise exception 'image-replacement-content-changed'; end if;
  if after_row->>'image_url' is distinct from asset.public_url then raise exception 'image-replacement-image-changed'; end if;
  insert into public.editorial_image_promotions(article_id,source_url,candidate_url,sha256,reviewer)
    values(p_article_id,d.source_url,asset.public_url,asset.sha256,p_reviewer);
  insert into public.editorial_image_replacement_promotions
    (article_id,replacement_decision_key,previous_image_url,source_url,candidate_url,sha256,reviewer)
    values(p_article_id,p_replacement_decision_key,p_expected_current_image_url,d.source_url,asset.public_url,asset.sha256,p_reviewer);
  return 'promoted';
end $$;

revoke all on function public.editorial_assert_replacement_asset_v1(text),
  public.editorial_register_image_replacement_v1(uuid,text,text,text,text),
  public.editorial_promote_image_v2(uuid,text,text,text) from public,anon,authenticated;
grant execute on function public.editorial_assert_replacement_asset_v1(text),
  public.editorial_register_image_replacement_v1(uuid,text,text,text,text),
  public.editorial_promote_image_v2(uuid,text,text,text) to service_role;
commit;
