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
  where bank.matchday_id = p_matchday_id
    and lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
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
    where bank.matchday_id = p_matchday_id
      and (
        (
          lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
          and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
        )
        or (
          v_normalized_link <> ''
          and lower(regexp_replace(split_part(split_part(coalesce(bank.link_url, ''), '?', 1), '#', 1), '/$', '')) = v_normalized_link
        )
      );

    for v_drop_id in
      select bank.id
      from public.matchday_editorial_bank_items bank
      where bank.id <> v_keep_id
        and bank.matchday_id = p_matchday_id
        and (
          (
            lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
            and lower(btrim(coalesce(bank.source_id, ''))) = lower(v_source_id)
          )
          or (
            v_normalized_link <> ''
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

      delete from public.matchday_hierarchical_composition_slots dropped_slot
      where dropped_slot.bank_item_id = v_drop_id
        and exists (
          select 1
          from public.matchday_hierarchical_composition_slots kept_slot
          where kept_slot.composition_id = dropped_slot.composition_id
            and kept_slot.bank_item_id = v_keep_id
        );

      update public.matchday_hierarchical_composition_slots
      set bank_item_id = v_keep_id,
          updated_at = now()
      where bank_item_id = v_drop_id;

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

drop index if exists public.matchday_editorial_bank_items_automatic_source_unique_idx;
create unique index matchday_editorial_bank_items_automatic_source_unique_idx
on public.matchday_editorial_bank_items (
  matchday_id,
  lower(btrim(source_type)),
  lower(btrim(source_id))
)
where lower(btrim(coalesce(source_type, ''))) in ('editorial_article', 'editorial_content')
  and nullif(btrim(source_id), '') is not null;

create or replace function public.sync_matchday_zone_publication_to_bank(
  p_matchday_id uuid,
  p_link_url text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_path text := regexp_replace(split_part(split_part(coalesce(btrim(p_link_url), ''), '?', 1), '#', 1), '/$', '');
  v_slug text;
  v_article public.editorial_articles%rowtype;
  v_content public.editorial_contents%rowtype;
begin
  if p_matchday_id is null or v_path = '' then
    return null;
  end if;

  if v_path like '/noticias/%' then
    v_slug := nullif(substring(v_path from char_length('/noticias/') + 1), '');
    if v_slug is null then return null; end if;

    select * into v_article
    from public.editorial_articles article
    where article.slug = v_slug
      and article.status = 'published'
      and (article.matchday_id is null or article.matchday_id = p_matchday_id)
    order by case when article.matchday_id = p_matchday_id then 0 else 1 end,
             article.published_at desc nulls last,
             article.updated_at desc nulls last,
             article.id
    limit 1;

    if v_article.id is null then return null; end if;

    return public.upsert_matchday_editorial_bank_publication(
      p_matchday_id,
      'editorial_article',
      v_article.id::text,
      v_article.slug,
      v_article.label,
      v_article.title,
      v_article.subtitle,
      v_article.image_url,
      '/noticias/' || v_article.slug
    );
  end if;

  if v_path like '/conteudos/%' then
    v_slug := nullif(substring(v_path from char_length('/conteudos/') + 1), '');
    if v_slug is null then return null; end if;

    select * into v_content
    from public.editorial_contents content
    where content.slug = v_slug
      and content.status = 'published'
      and (content.matchday_id is null or content.matchday_id = p_matchday_id)
    order by case when content.matchday_id = p_matchday_id then 0 else 1 end,
             content.published_at desc nulls last,
             content.updated_at desc nulls last,
             content.id
    limit 1;

    if v_content.id is null then return null; end if;

    return public.upsert_matchday_editorial_bank_publication(
      p_matchday_id,
      'editorial_content',
      v_content.id::text,
      v_content.slug,
      coalesce(nullif(btrim(v_content.label), ''), nullif(btrim(v_content.content_type), '')),
      v_content.title,
      coalesce(nullif(btrim(v_content.summary), ''), nullif(btrim(v_content.subtitle), '')),
      coalesce(nullif(btrim(v_content.thumbnail_url), ''), nullif(btrim(v_content.image_url), '')),
      '/conteudos/' || v_content.slug
    );
  end if;

  return null;
end
$$;

create or replace function public.sync_matchday_zone_row_to_bank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_table_name = 'matchday_latest_news' then
    if lower(btrim(coalesce(new.status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(new.matchday_id, new.link_url);
    end if;
  elsif tg_table_name = 'matchday_highlights' then
    if lower(btrim(coalesce(new.status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(new.matchday_id, new.link_url);
    end if;
  elsif tg_table_name = 'matchday_horizontal_news' then
    if lower(btrim(coalesce(new.status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(new.matchday_id, new.link_url);
    end if;
  elsif tg_table_name = 'matchday_editorials' then
    perform public.sync_matchday_zone_publication_to_bank(new.matchday_id, new.headline_link_url);
    if lower(btrim(coalesce(new.complementary_status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(new.matchday_id, new.complementary_link_url);
    end if;
    if lower(btrim(coalesce(new.side_block_status, ''))) = 'published' then
      perform public.sync_matchday_zone_publication_to_bank(new.matchday_id, new.side_block_link_url);
    end if;
  end if;

  return new;
end
$$;

drop trigger if exists sync_matchday_latest_news_to_bank on public.matchday_latest_news;
create trigger sync_matchday_latest_news_to_bank
after insert or update on public.matchday_latest_news
for each row execute function public.sync_matchday_zone_row_to_bank();

drop trigger if exists sync_matchday_highlights_to_bank on public.matchday_highlights;
create trigger sync_matchday_highlights_to_bank
after insert or update on public.matchday_highlights
for each row execute function public.sync_matchday_zone_row_to_bank();

drop trigger if exists sync_matchday_horizontal_news_to_bank on public.matchday_horizontal_news;
create trigger sync_matchday_horizontal_news_to_bank
after insert or update on public.matchday_horizontal_news
for each row execute function public.sync_matchday_zone_row_to_bank();

drop trigger if exists sync_matchday_editorials_to_bank on public.matchday_editorials;
create trigger sync_matchday_editorials_to_bank
after insert or update on public.matchday_editorials
for each row execute function public.sync_matchday_zone_row_to_bank();

do $$
declare
  item record;
begin
  for item in
    select bank.matchday_id, bank.link_url
    from public.matchday_editorial_bank_items bank
    where nullif(btrim(bank.link_url), '') is not null
    order by bank.created_at asc, bank.id asc
  loop
    perform public.sync_matchday_zone_publication_to_bank(item.matchday_id, item.link_url);
  end loop;

  for item in
    select latest.matchday_id, latest.link_url
    from public.matchday_latest_news latest
    where lower(btrim(coalesce(latest.status, ''))) = 'published'
      and nullif(btrim(latest.link_url), '') is not null
  loop
    perform public.sync_matchday_zone_publication_to_bank(item.matchday_id, item.link_url);
  end loop;

  for item in
    select highlight.matchday_id, highlight.link_url
    from public.matchday_highlights highlight
    where lower(btrim(coalesce(highlight.status, ''))) = 'published'
      and nullif(btrim(highlight.link_url), '') is not null
  loop
    perform public.sync_matchday_zone_publication_to_bank(item.matchday_id, item.link_url);
  end loop;

  for item in
    select horizontal.matchday_id, horizontal.link_url
    from public.matchday_horizontal_news horizontal
    where lower(btrim(coalesce(horizontal.status, ''))) = 'published'
      and nullif(btrim(horizontal.link_url), '') is not null
  loop
    perform public.sync_matchday_zone_publication_to_bank(item.matchday_id, item.link_url);
  end loop;

  for item in
    select editorial.matchday_id, editorial.headline_link_url as link_url
    from public.matchday_editorials editorial
    where nullif(btrim(editorial.headline_link_url), '') is not null
    union all
    select editorial.matchday_id, editorial.complementary_link_url
    from public.matchday_editorials editorial
    where lower(btrim(coalesce(editorial.complementary_status, ''))) = 'published'
      and nullif(btrim(editorial.complementary_link_url), '') is not null
    union all
    select editorial.matchday_id, editorial.side_block_link_url
    from public.matchday_editorials editorial
    where lower(btrim(coalesce(editorial.side_block_status, ''))) = 'published'
      and nullif(btrim(editorial.side_block_link_url), '') is not null
  loop
    perform public.sync_matchday_zone_publication_to_bank(item.matchday_id, item.link_url);
  end loop;
end
$$;

revoke all on function public.sync_matchday_zone_publication_to_bank(uuid, text) from public, anon, authenticated;
revoke all on function public.sync_matchday_zone_row_to_bank() from public, anon, authenticated;
grant execute on function public.sync_matchday_zone_publication_to_bank(uuid, text) to service_role;
grant execute on function public.sync_matchday_zone_row_to_bank() to service_role;

comment on function public.upsert_matchday_editorial_bank_publication(uuid, text, text, text, text, text, text, text, text) is
  'Reconcilia uma publicação canónica dentro do banco de uma jornada, sem usar linhas mutáveis das zonas como identidade e sem mover a mesma publicação entre jornadas.';
comment on function public.sync_matchday_zone_publication_to_bank(uuid, text) is
  'Resolve /noticias ou /conteudos para a publicação canónica elegível (jornada atual ou sem jornada) e sincroniza-a no banco da jornada.';
comment on function public.sync_matchday_zone_row_to_bank() is
  'Garante que alterações nas zonas editoriais sincronizam o banco pela identidade canónica do link, nunca pelo id mutável da linha da zona.';

notify pgrst, 'reload schema';
