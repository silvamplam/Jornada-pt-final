create or replace function public.upsert_matchday_editorial_bank_publication(
  p_matchday_id uuid,
  p_source_type text,
  p_source_id text,
  p_source_slug text,
  p_label text,
  p_title text,
  p_subtitle text,
  p_image_url text,
  p_link_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text := lower(btrim(coalesce(p_source_type, '')));
  v_source_id text := nullif(btrim(p_source_id), '');
  v_source_slug text := nullif(btrim(p_source_slug), '');
  v_title text := nullif(btrim(p_title), '');
  v_link_url text := nullif(btrim(p_link_url), '');
  v_normalized_link text := lower(regexp_replace(split_part(split_part(coalesce(v_link_url, ''), '?', 1), '#', 1), '/$', ''));
  v_keep_id uuid;
  v_drop_id uuid;
  v_preserve_archived boolean := false;
begin
  if p_matchday_id is null or not exists (
    select 1 from public.matchdays where id = p_matchday_id
  ) then
    raise exception 'invalid_matchday';
  end if;

  if v_source_type not in ('editorial_article', 'editorial_content') then
    raise exception 'invalid_source_type';
  end if;

  if v_source_id is null then
    raise exception 'missing_source_id';
  end if;

  if v_title is null then
    raise exception 'missing_title';
  end if;

  select bank.id
    into v_keep_id
  from public.matchday_editorial_bank_items bank
  where lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
  order by bank.created_at asc, bank.id asc
  limit 1;

  if v_keep_id is null and v_normalized_link <> '' then
    select bank.id
      into v_keep_id
    from public.matchday_editorial_bank_items bank
    where bank.matchday_id = p_matchday_id
      and lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = v_normalized_link
    order by bank.created_at asc, bank.id asc
    limit 1;
  end if;

  if v_keep_id is not null then
    select coalesce(bool_or(bank.status = 'archived'), false)
      into v_preserve_archived
    from public.matchday_editorial_bank_items bank
    where (
      lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
      and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
    )
    or (
      v_normalized_link <> ''
      and bank.matchday_id = p_matchday_id
      and lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = v_normalized_link
    );

    for v_drop_id in
      select bank.id
      from public.matchday_editorial_bank_items bank
      where bank.id <> v_keep_id
        and (
          (
            lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
            and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
          )
          or (
            v_normalized_link <> ''
            and bank.matchday_id = p_matchday_id
            and lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = v_normalized_link
          )
        )
      order by bank.created_at asc, bank.id asc
    loop
      delete from public.matchday_reference_composition_items dropped_item
      where dropped_item.source_id = v_drop_id
        and lower(btrim(coalesce(dropped_item.source_type, ''))) in ('manual_link', 'matchday_editorial_bank_item')
        and exists (
          select 1
          from public.matchday_reference_composition_items kept_item
          where kept_item.composition_id = dropped_item.composition_id
            and kept_item.source_id = v_keep_id
            and lower(btrim(coalesce(kept_item.source_type, ''))) in ('manual_link', 'matchday_editorial_bank_item')
        );

      update public.matchday_reference_composition_items
      set source_id = v_keep_id,
          source_type = 'matchday_editorial_bank_item',
          updated_at = now()
      where source_id = v_drop_id
        and lower(btrim(coalesce(source_type, ''))) in ('manual_link', 'matchday_editorial_bank_item');

      delete from public.matchday_editorial_bank_items
      where id = v_drop_id;
    end loop;

    update public.matchday_editorial_bank_items
    set matchday_id = p_matchday_id,
        label = nullif(btrim(p_label), ''),
        title = v_title,
        subtitle = nullif(btrim(p_subtitle), ''),
        image_url = nullif(btrim(p_image_url), ''),
        link_url = v_link_url,
        source_type = v_source_type,
        source_id = v_source_id,
        source_slug = v_source_slug,
        origin_slot_type = null,
        sort_order = null,
        status = case when v_preserve_archived then 'archived' else status end,
        updated_at = now()
    where id = v_keep_id;
  else
    insert into public.matchday_editorial_bank_items (
      matchday_id,
      label,
      title,
      subtitle,
      image_url,
      link_url,
      source_type,
      source_id,
      source_slug,
      origin_slot_type,
      sort_order,
      status
    ) values (
      p_matchday_id,
      nullif(btrim(p_label), ''),
      v_title,
      nullif(btrim(p_subtitle), ''),
      nullif(btrim(p_image_url), ''),
      v_link_url,
      v_source_type,
      v_source_id,
      v_source_slug,
      null,
      null,
      'active'
    )
    returning id into v_keep_id;
  end if;

  return v_keep_id;
end
$$;

do $$
declare
  item record;
begin
  for item in
    select id, matchday_id, slug, label, title, subtitle, image_url
    from public.editorial_articles
    where status = 'published'
      and matchday_id is not null
    order by published_at asc nulls last, created_at asc, id asc
  loop
    perform public.upsert_matchday_editorial_bank_publication(
      item.matchday_id,
      'editorial_article',
      item.id::text,
      item.slug,
      item.label,
      item.title,
      item.subtitle,
      item.image_url,
      case when nullif(btrim(item.slug), '') is null then null else '/noticias/' || item.slug end
    );
  end loop;

  for item in
    select id, matchday_id, slug, label, content_type, title, subtitle, summary, image_url, thumbnail_url
    from public.editorial_contents
    where status = 'published'
      and matchday_id is not null
    order by published_at asc nulls last, created_at asc, id asc
  loop
    perform public.upsert_matchday_editorial_bank_publication(
      item.matchday_id,
      'editorial_content',
      item.id::text,
      item.slug,
      coalesce(nullif(btrim(item.label), ''), nullif(btrim(item.content_type), '')),
      item.title,
      coalesce(nullif(btrim(item.summary), ''), nullif(btrim(item.subtitle), '')),
      coalesce(nullif(btrim(item.thumbnail_url), ''), nullif(btrim(item.image_url), '')),
      case when nullif(btrim(item.slug), '') is null then null else '/conteudos/' || item.slug end
    );
  end loop;
end
$$;

create unique index if not exists matchday_editorial_bank_items_automatic_source_unique_idx
on public.matchday_editorial_bank_items (
  lower(btrim(source_type)),
  lower(btrim(source_id))
)
where lower(btrim(coalesce(source_type, ''))) in ('editorial_article', 'editorial_content')
  and nullif(btrim(source_id), '') is not null;

create or replace function public.sync_published_editorial_source_to_matchday_bank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  payload jsonb := to_jsonb(new);
  publication_status text := lower(btrim(coalesce(payload ->> 'status', '')));
  publication_matchday_id uuid;
begin
  if publication_status <> 'published' or nullif(btrim(payload ->> 'matchday_id'), '') is null then
    return new;
  end if;

  publication_matchday_id := (payload ->> 'matchday_id')::uuid;

  if tg_table_name = 'editorial_articles' then
    perform public.upsert_matchday_editorial_bank_publication(
      publication_matchday_id,
      'editorial_article',
      payload ->> 'id',
      payload ->> 'slug',
      payload ->> 'label',
      payload ->> 'title',
      payload ->> 'subtitle',
      payload ->> 'image_url',
      case
        when nullif(btrim(payload ->> 'slug'), '') is null then null
        else '/noticias/' || (payload ->> 'slug')
      end
    );
  elsif tg_table_name = 'editorial_contents' then
    perform public.upsert_matchday_editorial_bank_publication(
      publication_matchday_id,
      'editorial_content',
      payload ->> 'id',
      payload ->> 'slug',
      coalesce(nullif(btrim(payload ->> 'label'), ''), nullif(btrim(payload ->> 'content_type'), '')),
      payload ->> 'title',
      coalesce(nullif(btrim(payload ->> 'summary'), ''), nullif(btrim(payload ->> 'subtitle'), '')),
      coalesce(nullif(btrim(payload ->> 'thumbnail_url'), ''), nullif(btrim(payload ->> 'image_url'), '')),
      case
        when nullif(btrim(payload ->> 'slug'), '') is null then null
        else '/conteudos/' || (payload ->> 'slug')
      end
    );
  end if;

  return new;
end
$$;

drop trigger if exists sync_published_editorial_article_to_matchday_bank on public.editorial_articles;
create trigger sync_published_editorial_article_to_matchday_bank
after insert or update on public.editorial_articles
for each row
execute function public.sync_published_editorial_source_to_matchday_bank();

drop trigger if exists sync_published_editorial_content_to_matchday_bank on public.editorial_contents;
create trigger sync_published_editorial_content_to_matchday_bank
after insert or update on public.editorial_contents
for each row
execute function public.sync_published_editorial_source_to_matchday_bank();

revoke all on function public.upsert_matchday_editorial_bank_publication(uuid, text, text, text, text, text, text, text, text) from public, anon, authenticated;
revoke all on function public.sync_published_editorial_source_to_matchday_bank() from public, anon, authenticated;
grant execute on function public.upsert_matchday_editorial_bank_publication(uuid, text, text, text, text, text, text, text, text) to service_role;
grant execute on function public.sync_published_editorial_source_to_matchday_bank() to service_role;

comment on function public.upsert_matchday_editorial_bank_publication(uuid, text, text, text, text, text, text, text, text) is
  'Cria, atualiza, move e reconcilia idempotentemente no banco histórico uma publicação associada a uma jornada, preservando o estado arquivado.';

comment on function public.sync_published_editorial_source_to_matchday_bank() is
  'Trigger comum que garante no banco histórico artigos e conteúdos publicados com matchday_id.';

comment on index public.matchday_editorial_bank_items_automatic_source_unique_idx is
  'Garante uma única entrada automática global por artigo ou conteúdo editorial.';

notify pgrst, 'reload schema';
