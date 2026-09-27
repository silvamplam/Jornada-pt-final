-- REPLAY ONLY. Dependency snapshot captured on 2026-09-27; not a historical migration.
-- No INSERT/COPY or production rows. Never apply to an existing database.
do $guard$ begin if current_database() <> 'jornada_migration_replay' or current_setting('jornada.replay',true) is distinct from 'on' then raise exception 'isolated replay required'; end if; end $guard$;
set check_function_bodies = off;
create or replace function public.remove_deleted_editorial_source_from_matchday_bank()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source_type text;
begin
  if tg_table_name = 'editorial_articles' then
    v_source_type := 'editorial_article';
  elsif tg_table_name = 'editorial_contents' then
    v_source_type := 'editorial_content';
  else
    raise exception 'unsupported_editorial_source_table';
  end if;

  -- A eliminação já foi autorizada pela aplicação depois de confirmar que
  -- não restam vínculos públicos. Remove agora os resíduos internos.
  delete from public.matchday_reference_composition_items composition_item
  using public.matchday_editorial_bank_items bank
  where composition_item.source_id = bank.id
    and lower(btrim(coalesce(composition_item.source_type, ''))) in (
      'manual_link',
      'matchday_editorial_bank_item'
    )
    and lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = lower(old.id::text);

  delete from public.matchday_editorial_bank_items bank
  where lower(btrim(coalesce(bank.source_type, ''))) = v_source_type
    and lower(btrim(coalesce(bank.source_id, ''))) = lower(old.id::text);

  return old;
end
$$;;
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
$$;;
CREATE OR REPLACE FUNCTION public.newsroom_protect_editorial_dossier_source_frozen_identity()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.newsroom_article_id is distinct from old.newsroom_article_id
     or new.newsroom_snapshot_id is distinct from old.newsroom_snapshot_id
     or new.title_snapshot is distinct from old.title_snapshot
     or new.published_at_snapshot is distinct from old.published_at_snapshot then
    raise exception 'editorial_dossier_source_frozen_identity_immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.newsroom_protect_editorial_plan_profile_pin()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if old.editorial_profile_version_id is not null
     and (
       new.editorial_profile_id is distinct from old.editorial_profile_id
       or new.editorial_profile_version_id is distinct from old.editorial_profile_version_id
       or new.editorial_profile_pinned_at is distinct from old.editorial_profile_pinned_at
     ) then
    raise exception 'editorial_profile_plan_pin_immutable'
      using errcode = '55000';
  end if;
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.newsroom_protect_editorial_profile()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  if new.id is distinct from old.id
     or new.code is distinct from old.code
     or new.name is distinct from old.name
     or new.created_at is distinct from old.created_at
     or new.created_by_actor_type is distinct from old.created_by_actor_type
     or new.created_by_actor_id is distinct from old.created_by_actor_id then
    raise exception 'editorial_profile_identity_immutable'
      using errcode = '55000';
  end if;

  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.newsroom_reject_editorial_profile_version_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'editorial_profile_version_immutable'
    using errcode = '55000';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.newsroom_reject_snapshot_mutation()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  raise exception 'newsroom article snapshots are immutable';
end;
$function$
;
CREATE OR REPLACE FUNCTION public.newsroom_save_editorial_dossier_article_plan(p_dossier_id uuid, p_article_plan_id uuid, p_working_title text, p_status text, p_sort_order integer, p_article_kind text, p_length_mode text, p_editorial_instructions text, p_dossier_source_ids uuid[])
 RETURNS TABLE(article_plan_id uuid)
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  v_plan_id uuid := coalesce(p_article_plan_id, pg_catalog.gen_random_uuid());
  v_is_create boolean := p_article_plan_id is null;
  v_existing_status text;
  v_editorial_article_id uuid;
  v_source_count integer := coalesce(cardinality(p_dossier_source_ids), 0);
  v_distinct_source_count integer;
  v_source_id uuid;
begin
  if p_dossier_id is null then
    raise exception 'editorial_dossier_article_plan_dossier_required'
      using errcode = '23514';
  end if;

  if btrim(coalesce(p_working_title, '')) = '' then
    raise exception 'editorial_dossier_article_plan_title_required'
      using errcode = '23514';
  end if;

  if p_status not in ('planned', 'ready', 'cancelled') then
    raise exception 'editorial_dossier_article_plan_status_invalid'
      using errcode = '23514';
  end if;

  if p_article_kind not in ('news', 'analysis', 'preview', 'summary') then
    raise exception 'editorial_dossier_article_plan_kind_invalid'
      using errcode = '23514';
  end if;

  if p_length_mode not in ('brief', 'standard', 'developed') then
    raise exception 'editorial_dossier_article_plan_length_invalid'
      using errcode = '23514';
  end if;

  if p_sort_order is null or p_sort_order < 0 then
    raise exception 'editorial_dossier_article_plan_order_invalid'
      using errcode = '23514';
  end if;

  perform 1
  from public.newsroom_editorial_dossiers dossier
  where dossier.id = p_dossier_id
  for update;

  if not found then
    raise exception 'editorial_dossier_not_found'
      using errcode = 'P0002';
  end if;

  if v_is_create then
    if p_status = 'cancelled' then
      raise exception 'editorial_dossier_article_plan_new_cancelled_invalid'
        using errcode = '23514';
    end if;
  else
    select
      plan.status,
      plan.editorial_article_id
    into
      v_existing_status,
      v_editorial_article_id
    from public.newsroom_editorial_dossier_article_plans plan
    where plan.id = p_article_plan_id
      and plan.dossier_id = p_dossier_id
    for update;

    if not found then
      raise exception 'editorial_dossier_article_plan_not_found'
        using errcode = 'P0002';
    end if;

    if v_editorial_article_id is not null then
      raise exception 'editorial_dossier_article_plan_already_converted'
        using errcode = '23514';
    end if;
  end if;

  select count(distinct source_row.source_id)
  into v_distinct_source_count
  from unnest(coalesce(p_dossier_source_ids, '{}'::uuid[]))
    as source_row(source_id);

  if v_distinct_source_count <> v_source_count then
    raise exception 'editorial_dossier_article_plan_source_duplicate'
      using errcode = '23514';
  end if;

  if p_status = 'ready'
     and (
       btrim(coalesce(p_editorial_instructions, '')) = ''
       or v_source_count < 1
     ) then
    raise exception 'editorial_dossier_article_plan_ready_incomplete'
      using errcode = '23514';
  end if;

  if p_status <> 'cancelled' then
    for v_source_id in
      select source_row.source_id
      from unnest(coalesce(p_dossier_source_ids, '{}'::uuid[]))
        as source_row(source_id)
    loop
      if not exists (
        select 1
        from public.newsroom_editorial_dossier_sources dossier_source
        where dossier_source.id = v_source_id
          and dossier_source.dossier_id = p_dossier_id
          and (
            dossier_source.included
            or exists (
              select 1
              from public.newsroom_editorial_dossier_article_plan_sources existing_assignment
              where existing_assignment.article_plan_id = v_plan_id
                and existing_assignment.dossier_source_id = v_source_id
                and existing_assignment.dossier_id = p_dossier_id
            )
          )
      ) then
        raise exception 'editorial_dossier_article_plan_source_unavailable'
          using errcode = '23514';
      end if;
    end loop;
  end if;

  if v_is_create then
    insert into public.newsroom_editorial_dossier_article_plans (
      id,
      dossier_id,
      working_title,
      status,
      sort_order,
      article_kind,
      length_mode,
      editorial_instructions
    ) values (
      v_plan_id,
      p_dossier_id,
      btrim(p_working_title),
      p_status,
      p_sort_order,
      p_article_kind,
      p_length_mode,
      btrim(coalesce(p_editorial_instructions, ''))
    );
  else
    update public.newsroom_editorial_dossier_article_plans plan
    set working_title = btrim(p_working_title),
        status = p_status,
        sort_order = p_sort_order,
        article_kind = p_article_kind,
        length_mode = p_length_mode,
        editorial_instructions = btrim(coalesce(p_editorial_instructions, ''))
    where plan.id = v_plan_id
      and plan.dossier_id = p_dossier_id;
  end if;

  if p_status <> 'cancelled' then
    delete from public.newsroom_editorial_dossier_article_plan_sources assignment
    where assignment.article_plan_id = v_plan_id
      and assignment.dossier_id = p_dossier_id
      and not (
        assignment.dossier_source_id = any(coalesce(p_dossier_source_ids, '{}'::uuid[]))
      );

    insert into public.newsroom_editorial_dossier_article_plan_sources (
      id,
      dossier_id,
      article_plan_id,
      dossier_source_id,
      sort_order
    )
    select
      pg_catalog.gen_random_uuid(),
      p_dossier_id,
      v_plan_id,
      ordered_source.source_id,
      ordered_source.ordinality::integer * 10
    from unnest(coalesce(p_dossier_source_ids, '{}'::uuid[]))
      with ordinality as ordered_source(source_id, ordinality)
    on conflict on constraint newsroom_editorial_dossier_article_plan_sources_plan_source_key
    do update
    set sort_order = excluded.sort_order;
  end if;

  update public.newsroom_editorial_dossiers dossier
  set updated_at = now()
  where dossier.id = p_dossier_id;

  return query select v_plan_id;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.newsroom_set_article_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.newsroom_set_editorial_dossier_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  new.updated_at := now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.normalize_team_identity_v1(p_value text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE STRICT
 SET search_path TO 'pg_catalog'
AS $function$
  select btrim(
    regexp_replace(
      lower(
        regexp_replace(
          normalize(btrim(p_value), NFD),
          U&'[\0300-\036F]',
          '',
          'g'
        )
      ),
      '[^a-z0-9]+',
      '-',
      'g'
    ),
    '-'
  )
$function$
;
CREATE OR REPLACE FUNCTION public.portal_can_select_scope(target_portal_entity_id uuid, target_portal_context_id uuid, target_portal_competition_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
    from public.portal_users u
    join public.portal_permissions p on p.portal_user_id = u.id
    where u.auth_user_id = auth.uid()
      and u.status = 'active'
      and p.status = 'active'
      and p.can_view = true
      and p.portal_entity_id = target_portal_entity_id
      and (target_portal_context_id is null or p.portal_context_id is null or p.portal_context_id = target_portal_context_id)
      and (target_portal_competition_id is null or p.portal_competition_id is null or p.portal_competition_id = target_portal_competition_id)
  );
$function$
;
CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.set_editorial_contents_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_matchday_editorial_bank_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;
CREATE OR REPLACE FUNCTION public.set_matchday_hierarchical_composition_slots_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION public.set_matchday_reference_composition_items_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin new.updated_at = now(); return new; end; $function$
;
CREATE OR REPLACE FUNCTION public.set_matchday_reference_compositions_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$ begin new.updated_at = now(); return new; end; $function$
;
CREATE OR REPLACE FUNCTION public.sync_match_scheduled_date()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
begin
  if new.kickoff_at is not null then
    new.scheduled_date := (new.kickoff_at at time zone 'Europe/Lisbon')::date;
  end if;

  return new;
end
$function$
;
CREATE OR REPLACE FUNCTION public.sync_published_editorial_source_to_matchday_bank()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$
;
CREATE OR REPLACE FUNCTION public.set_site_editorial_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
begin
  new.updated_at = now();
  return new;
end;
$function$
;

-- public.broadcast_channels; original DDL: supabase/schema.sql
create table "public"."broadcast_channels" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "platform" text,
  "country" text,
  "logo_url" text,
  "created_at" timestamp with time zone default now() not null,
  constraint "broadcast_channels_pkey" PRIMARY KEY (id)
);

-- public.competitions; original DDL: supabase/schema.sql, supabase/steps/12-fase1-limpa-pais-competicao-epoca.sql
create table "public"."competitions" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "slug" text not null,
  "country" text,
  "logo_url" text,
  "accent_color" text,
  "is_active" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "data_source" text default 'manual'::text not null,
  "external_provider" text,
  "external_id" text,
  "last_synced_at" timestamp with time zone,
  "sync_status" text default 'manual'::text not null,
  "manual_override" boolean default false not null,
  "country_id" uuid,
  "color" text,
  "status" text default 'active'::text not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "competitions_pkey" PRIMARY KEY (id),
  constraint "competitions_slug_key" UNIQUE (slug)
);

-- public.countries; original DDL: supabase/schema.sql, supabase/steps/11-paises-e-hierarquia.sql, supabase/steps/12-fase1-limpa-pais-competicao-epoca.sql
create table "public"."countries" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "slug" text not null,
  "iso2" text,
  "flag_emoji" text,
  "is_active" boolean default true not null,
  "data_source" text default 'manual'::text not null,
  "external_provider" text,
  "external_id" text,
  "last_synced_at" timestamp with time zone,
  "sync_status" text default 'manual'::text not null,
  "manual_override" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "flag" text,
  "status" text default 'active'::text not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "countries_pkey" PRIMARY KEY (id),
  constraint "countries_slug_key" UNIQUE (slug)
);

-- public.editorial_articles; original DDL: production catalogue; no original CREATE found
create table "public"."editorial_articles" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "status" text default 'draft'::text not null,
  "scope" text default 'general'::text not null,
  "matchday_id" uuid,
  "competition_id" uuid,
  "title" text,
  "subtitle" text,
  "label" text,
  "author" text,
  "image_url" text,
  "body" text,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "image_caption" text,
  "season_id" uuid,
  "newsroom_article_id" uuid,
  constraint "editorial_articles_pkey" PRIMARY KEY (id),
  constraint "editorial_articles_scope_check" CHECK (scope = ANY (ARRAY['home'::text, 'matchday'::text, 'competition'::text, 'general'::text])),
  constraint "editorial_articles_slug_key" UNIQUE (slug),
  constraint "editorial_articles_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.editorial_contents; original DDL: supabase/sql/fase-conteudos-editoriais-video-reportagem-4-editorial-contents-manual.sql
create table "public"."editorial_contents" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "status" text default 'draft'::text not null,
  "scope" text default 'general'::text not null,
  "content_type" text not null,
  "label" text,
  "title" text not null,
  "subtitle" text,
  "summary" text,
  "body" text,
  "author" text,
  "image_url" text,
  "image_caption" text,
  "thumbnail_url" text,
  "video_url" text,
  "video_provider" text,
  "embed_url" text,
  "duration" text,
  "is_embeddable" boolean default false not null,
  "published_at" timestamp with time zone,
  "competition_id" uuid,
  "season_id" uuid,
  "matchday_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "editorial_contents_content_type_check" CHECK (content_type = ANY (ARRAY['video'::text, 'reportagem'::text, 'entrevista'::text, 'especial'::text])),
  constraint "editorial_contents_pkey" PRIMARY KEY (id),
  constraint "editorial_contents_scope_check" CHECK (scope = ANY (ARRAY['home'::text, 'matchday'::text, 'competition'::text, 'general'::text])),
  constraint "editorial_contents_slug_not_blank_check" CHECK (btrim(slug) <> ''::text),
  constraint "editorial_contents_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
  constraint "editorial_contents_title_not_blank_check" CHECK (btrim(title) <> ''::text)
);

-- public.matchday_editorial_bank_items; original DDL: supabase/sql/fase-composicao-banco-noticias-1a.sql
create table "public"."matchday_editorial_bank_items" (
  "id" uuid default gen_random_uuid() not null,
  "matchday_id" uuid not null,
  "label" text,
  "title" text not null,
  "subtitle" text,
  "image_url" text,
  "link_url" text,
  "source_type" text,
  "source_id" text,
  "source_slug" text,
  "origin_slot_type" text,
  "sort_order" integer,
  "status" text default 'active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "label_color" text,
  constraint "matchday_editorial_bank_items_pkey" PRIMARY KEY (id),
  constraint "matchday_editorial_bank_items_status_check" CHECK (status = ANY (ARRAY['active'::text, 'archived'::text]))
);

-- public.matchday_editorials; original DDL: supabase/sql/fase-editorial-a-matchday-editorials.sql
create table "public"."matchday_editorials" (
  "id" uuid default gen_random_uuid() not null,
  "matchday_id" uuid not null,
  "title" text,
  "summary" text,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "title_color" text,
  "image_url" text,
  "below_headline_mode" text default 'highlights'::text not null,
  "complementary_mode" text default 'none'::text not null,
  "complementary_roundup_item_id" uuid,
  "complementary_label" text,
  "complementary_title" text,
  "complementary_text" text,
  "complementary_image_url" text,
  "complementary_link_url" text,
  "complementary_text_color" text,
  "complementary_status" text default 'draft'::text not null,
  "roundup_video_heading" text,
  "roundup_video_heading_color" text,
  "below_headline_heading" text,
  "below_headline_heading_color" text,
  "side_block_status" text default 'draft'::text not null,
  "side_block_type" text,
  "side_block_label" text,
  "side_block_title" text,
  "side_block_title_color" text,
  "side_block_author" text,
  "side_block_text" text,
  "side_block_image_url" text,
  "side_block_link_url" text,
  "headline_link_url" text,
  "latest_zone_mode" text default 'latest_news'::text not null,
  "latest_zone_title" text,
  "below_headline_subtitle" text,
  "latest_zone_title_color" text,
  "side_block_label_color" text,
  "latest_zone_placement" text default 'top'::text not null,
  constraint "matchday_editorials_below_headline_mode_check" CHECK (below_headline_mode = ANY (ARRAY['highlights'::text, 'roundup'::text])),
  constraint "matchday_editorials_complementary_mode_check" CHECK (complementary_mode = ANY (ARRAY['none'::text, 'roundup_video'::text, 'complementary_story'::text])),
  constraint "matchday_editorials_complementary_status_check" CHECK (complementary_status = ANY (ARRAY['draft'::text, 'published'::text])),
  constraint "matchday_editorials_latest_zone_mode_check" CHECK (latest_zone_mode = ANY (ARRAY['latest_news'::text, 'editorial_line'::text])),
  constraint "matchday_editorials_latest_zone_title_color_hex_check" CHECK (latest_zone_title_color IS NULL OR latest_zone_title_color ~ '^#[0-9A-Fa-f]{6}$'::text),
  constraint "matchday_editorials_matchday_id_key" UNIQUE (matchday_id),
  constraint "matchday_editorials_pkey" PRIMARY KEY (id),
  constraint "matchday_editorials_side_block_status_check" CHECK (side_block_status = ANY (ARRAY['draft'::text, 'published'::text])),
  constraint "matchday_editorials_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.matchday_hierarchical_composition_slots; original DDL: supabase/steps/105-composicao-hierarquica-opcional-apply.sql
create table "public"."matchday_hierarchical_composition_slots" (
  "id" uuid default gen_random_uuid() not null,
  "composition_id" uuid not null,
  "slot_key" text not null,
  "bank_item_id" uuid,
  "source_identity" text not null,
  "label_snapshot" text,
  "title_snapshot" text,
  "subtitle_snapshot" text,
  "image_url_snapshot" text,
  "link_url_snapshot" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "media_kind_snapshot" text,
  "media_embed_url_snapshot" text,
  "media_video_url_snapshot" text,
  constraint "matchday_hierarchical_composition_slots_composition_slot_unique" UNIQUE (composition_id, slot_key),
  constraint "matchday_hierarchical_composition_slots_composition_source_uniq" UNIQUE (composition_id, source_identity),
  constraint "matchday_hierarchical_composition_slots_media_kind_check" CHECK (media_kind_snapshot IS NULL OR (media_kind_snapshot = ANY (ARRAY['embed'::text, 'direct_video'::text]))),
  constraint "matchday_hierarchical_composition_slots_media_payload_check" CHECK (media_kind_snapshot IS NULL AND media_embed_url_snapshot IS NULL AND media_video_url_snapshot IS NULL OR media_kind_snapshot = 'embed'::text AND NULLIF(btrim(media_embed_url_snapshot), ''::text) IS NOT NULL OR media_kind_snapshot = 'direct_video'::text AND NULLIF(btrim(media_video_url_snapshot), ''::text) IS NOT NULL),
  constraint "matchday_hierarchical_composition_slots_media_position_check" CHECK (media_kind_snapshot IS NULL OR slot_key = 'dominant_main'::text),
  constraint "matchday_hierarchical_composition_slots_pkey" PRIMARY KEY (id),
  constraint "matchday_hierarchical_composition_slots_slot_key_check" CHECK (slot_key = ANY (ARRAY['dominant_main'::text, 'dominant_side_top'::text, 'dominant_side_bottom'::text, 'other_chronicle_1'::text, 'other_chronicle_2'::text, 'other_chronicle_3'::text, 'secondary_strong_1'::text, 'secondary_strong_2'::text, 'secondary_1'::text, 'secondary_2'::text, 'secondary_3'::text, 'secondary_4'::text, 'closing_1'::text, 'closing_2'::text, 'closing_3'::text])),
  constraint "matchday_hierarchical_composition_slots_source_identity_check" CHECK (btrim(source_identity) <> ''::text)
);

-- public.matchday_highlights; original DDL: supabase/sql/fase-editorial-d-matchday-highlights.sql
create table "public"."matchday_highlights" (
  "id" uuid default gen_random_uuid() not null,
  "matchday_id" uuid not null,
  "label" text,
  "title" text,
  "image_url" text,
  "sort_order" integer default 1 not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "link_url" text,
  "subtitle" text,
  "label_color" text,
  constraint "matchday_highlights_pkey" PRIMARY KEY (id),
  constraint "matchday_highlights_sort_order_check" CHECK (sort_order >= 1 AND sort_order <= 3),
  constraint "matchday_highlights_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.matchday_horizontal_news; original DDL: supabase/steps/65-editorial-faixa-horizontal-noticias-apply.sql
create table "public"."matchday_horizontal_news" (
  "id" uuid default gen_random_uuid() not null,
  "matchday_id" uuid not null,
  "label" text,
  "title" text,
  "subtitle" text,
  "image_url" text,
  "link_url" text,
  "sort_order" integer not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "label_color" text,
  constraint "matchday_horizontal_news_matchday_sort_unique" UNIQUE (matchday_id, sort_order),
  constraint "matchday_horizontal_news_pkey" PRIMARY KEY (id),
  constraint "matchday_horizontal_news_sort_order_check" CHECK (sort_order > 0),
  constraint "matchday_horizontal_news_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.matchday_latest_news; original DDL: production catalogue; no original CREATE found
create table "public"."matchday_latest_news" (
  "id" uuid default gen_random_uuid() not null,
  "matchday_id" uuid not null,
  "time_label" text,
  "title" text,
  "link_url" text,
  "image_url" text,
  "sort_order" integer default 1 not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "subtitle" text,
  "article_id" uuid,
  "time_label_color" text,
  constraint "matchday_latest_news_pkey" PRIMARY KEY (id),
  constraint "matchday_latest_news_sort_order_check" CHECK (sort_order >= 1),
  constraint "matchday_latest_news_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.matchday_reference_composition_items; original DDL: supabase/sql/fase-editorial-m-reference-compositions.sql
create table "public"."matchday_reference_composition_items" (
  "id" uuid default gen_random_uuid() not null,
  "composition_id" uuid not null,
  "slot_type" text not null,
  "source_type" text not null,
  "source_id" uuid,
  "article_id" uuid,
  "sort_order" integer default 1 not null,
  "title_snapshot" text,
  "subtitle_snapshot" text,
  "image_url_snapshot" text,
  "link_url_snapshot" text,
  "label_snapshot" text,
  "status" text default 'published'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "label_color_snapshot" text,
  "media_kind_snapshot" text,
  "media_embed_url_snapshot" text,
  "media_video_url_snapshot" text,
  constraint "matchday_reference_composition_items_beyond_position_check" CHECK (slot_type <> 'beyond_matchday'::text OR sort_order >= 1 AND sort_order <= 5),
  constraint "matchday_reference_composition_items_media_kind_check" CHECK (media_kind_snapshot IS NULL OR (media_kind_snapshot = ANY (ARRAY['embed'::text, 'direct_video'::text]))),
  constraint "matchday_reference_composition_items_media_payload_check" CHECK (media_kind_snapshot IS NULL AND media_embed_url_snapshot IS NULL AND media_video_url_snapshot IS NULL OR media_kind_snapshot = 'embed'::text AND NULLIF(btrim(media_embed_url_snapshot), ''::text) IS NOT NULL OR media_kind_snapshot = 'direct_video'::text AND NULLIF(btrim(media_video_url_snapshot), ''::text) IS NOT NULL),
  constraint "matchday_reference_composition_items_media_position_check" CHECK (media_kind_snapshot IS NULL OR (slot_type = ANY (ARRAY['headline'::text, 'complement'::text]))),
  constraint "matchday_reference_composition_items_pkey" PRIMARY KEY (id),
  constraint "matchday_reference_composition_items_slot_type_check" CHECK (slot_type = ANY (ARRAY['headline'::text, 'side_block'::text, 'complement'::text, 'highlight'::text, 'editorial_line_item'::text, 'related_article'::text, 'roundup'::text, 'custom_card'::text, 'important_item'::text, 'beyond_matchday'::text])),
  constraint "matchday_reference_composition_items_source_type_check" CHECK (source_type = ANY (ARRAY['matchday_editorial'::text, 'matchday_editorial_headline'::text, 'matchday_editorial_complement'::text, 'matchday_editorial_side_block'::text, 'matchday_highlight'::text, 'matchday_latest_news'::text, 'matchday_roundup_item'::text, 'matchday_horizontal_news'::text, 'matchday_reference_composition_item'::text, 'matchday_editorial_bank_item'::text, 'article'::text, 'editorial_article'::text, 'editorial_content'::text, 'manual_link'::text])),
  constraint "matchday_reference_composition_items_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))
);

-- public.matchday_reference_compositions; original DDL: supabase/sql/fase-editorial-m-reference-compositions.sql
create table "public"."matchday_reference_compositions" (
  "id" uuid default gen_random_uuid() not null,
  "matchday_id" uuid not null,
  "status" text default 'draft'::text not null,
  "is_current" boolean default false not null,
  "internal_name" text,
  "use_roundup_items" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "published_at" timestamp with time zone,
  "presentation_mode" text default 'standard'::text not null,
  "hierarchical_editorial_title" text,
  "hierarchical_editorial_text" text,
  "hierarchical_editorial_author" text,
  constraint "matchday_reference_compositions_pkey" PRIMARY KEY (id),
  constraint "matchday_reference_compositions_presentation_mode_check" CHECK (presentation_mode = ANY (ARRAY['standard'::text, 'hierarchical'::text])),
  constraint "matchday_reference_compositions_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text]))
);

-- public.matchday_roundup_items; original DDL: supabase/sql/fase-editorial-e-matchday-roundup-items.sql
create table "public"."matchday_roundup_items" (
  "id" uuid default gen_random_uuid() not null,
  "matchday_id" uuid not null,
  "label" text,
  "title" text,
  "subtitle" text,
  "image_url" text,
  "video_url" text,
  "duration" text,
  "type" text default 'resumo'::text not null,
  "sort_order" integer default 1 not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "matchday_roundup_items_pkey" PRIMARY KEY (id),
  constraint "matchday_roundup_items_sort_order_check" CHECK (sort_order >= 1 AND sort_order <= 50),
  constraint "matchday_roundup_items_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  constraint "matchday_roundup_items_type_check" CHECK (type = ANY (ARRAY['video'::text, 'golos'::text, 'resumo'::text, 'noticia'::text]))
);

-- public.matchdays; original DDL: supabase/schema.sql
create table "public"."matchdays" (
  "id" uuid default gen_random_uuid() not null,
  "season_id" uuid not null,
  "number" integer not null,
  "label" text not null,
  "starts_on" date,
  "ends_on" date,
  "status" text default 'scheduled'::text not null,
  "context_summary" text,
  "created_at" timestamp with time zone default now() not null,
  "data_source" text default 'manual'::text not null,
  "external_provider" text,
  "external_id" text,
  "last_synced_at" timestamp with time zone,
  "sync_status" text default 'manual'::text not null,
  "manual_override" boolean default false not null,
  "editorial_title" text,
  "editorial_summary" text,
  "hero_image_url" text,
  "video_url" text,
  "display_order" integer,
  "is_featured" boolean default false not null,
  "memory_note" text,
  "seo_title" text,
  "seo_description" text,
  constraint "matchdays_pkey" PRIMARY KEY (id),
  constraint "matchdays_season_id_number_key" UNIQUE (season_id, number)
);

-- public.matches; original DDL: supabase/schema.sql
create table "public"."matches" (
  "id" uuid default gen_random_uuid() not null,
  "competition_id" uuid not null,
  "season_id" uuid not null,
  "matchday_id" uuid,
  "home_team_id" uuid not null,
  "away_team_id" uuid not null,
  "status" text default 'scheduled'::text not null,
  "minute" integer,
  "kickoff_at" timestamp with time zone,
  "home_score" integer,
  "away_score" integer,
  "venue" text,
  "broadcast_channel_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "source_key" text,
  "data_source" text default 'manual'::text not null,
  "external_provider" text,
  "external_id" text,
  "external_match_id" text,
  "last_synced_at" timestamp with time zone,
  "sync_status" text default 'manual'::text not null,
  "manual_override" boolean default false not null,
  "live_started_at" timestamp with time zone,
  "live_base_minute" integer,
  "is_clock_running" boolean default false,
  "scheduled_date" date,
  constraint "matches_live_base_minute_range_check" CHECK (live_base_minute IS NULL OR live_base_minute >= 0 AND live_base_minute <= 130),
  constraint "matches_pkey" PRIMARY KEY (id)
);

-- public.newsroom_article_snapshots; original DDL: supabase/steps/15-redacao-automatica-newsroom-apply.sql
create table "public"."newsroom_article_snapshots" (
  "id" uuid default gen_random_uuid() not null,
  "article_id" uuid not null,
  "content_hash" text not null,
  "body" jsonb not null,
  "source_metadata" jsonb not null,
  "extracted_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "newsroom_article_snapshots_article_hash_key" UNIQUE (article_id, content_hash),
  constraint "newsroom_article_snapshots_article_id_id_key" UNIQUE (article_id, id),
  constraint "newsroom_article_snapshots_body_array_check" CHECK (jsonb_typeof(body) = 'array'::text),
  constraint "newsroom_article_snapshots_content_hash_not_blank" CHECK (btrim(content_hash) <> ''::text),
  constraint "newsroom_article_snapshots_metadata_object_check" CHECK (jsonb_typeof(source_metadata) = 'object'::text),
  constraint "newsroom_article_snapshots_pkey" PRIMARY KEY (id)
);

-- public.newsroom_articles; original DDL: supabase/steps/15-redacao-automatica-newsroom-apply.sql
create table "public"."newsroom_articles" (
  "id" uuid default gen_random_uuid() not null,
  "source_code" text not null,
  "original_url" text,
  "normalized_url" text,
  "external_id" text,
  "title" text not null,
  "subtitle" text,
  "summary" text,
  "author" text,
  "published_at" timestamp with time zone,
  "modified_at" timestamp with time zone,
  "detected_at" timestamp with time zone not null,
  "image_url" text,
  "processing_status" text not null,
  "first_detected_at" timestamp with time zone not null,
  "last_detected_at" timestamp with time zone not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "newsroom_articles_detection_window_check" CHECK (first_detected_at <= last_detected_at),
  constraint "newsroom_articles_normalized_url_not_blank" CHECK (btrim(normalized_url) <> ''::text),
  constraint "newsroom_articles_original_url_not_blank" CHECK (btrim(original_url) <> ''::text),
  constraint "newsroom_articles_pkey" PRIMARY KEY (id),
  constraint "newsroom_articles_processing_status_check" CHECK (processing_status = ANY (ARRAY['detected'::text, 'normalized'::text, 'duplicate'::text, 'rejected'::text, 'ready_for_review'::text, 'failed'::text])),
  constraint "newsroom_articles_source_code_not_blank" CHECK (btrim(source_code) <> ''::text),
  constraint "newsroom_articles_source_url_key" UNIQUE (source_code, normalized_url),
  constraint "newsroom_articles_title_not_blank" CHECK (btrim(title) <> ''::text),
  constraint "newsroom_articles_manual_origin_urls_check" check (
      (
        source_code = 'manual_entry'
        and original_url is null
        and normalized_url is null
      )
      or (
        source_code <> 'manual_entry'
        and original_url is not null
        and normalized_url is not null
      )
    )
);

-- public.newsroom_editorial_dossier_article_plan_sources; original DDL: supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigos-planeados-schema-1-aplicar.sql
create table "public"."newsroom_editorial_dossier_article_plan_sources" (
  "id" uuid default gen_random_uuid() not null,
  "dossier_id" uuid not null,
  "article_plan_id" uuid not null,
  "dossier_source_id" uuid not null,
  "sort_order" integer default 10 not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "newsroom_editorial_dossier_article_plan_sources_pkey" PRIMARY KEY (id),
  constraint "newsroom_editorial_dossier_article_plan_sources_plan_source_key" UNIQUE (article_plan_id, dossier_source_id),
  constraint "newsroom_editorial_dossier_article_plan_sources_sort_order_chec" CHECK (sort_order >= 0)
);

-- public.newsroom_editorial_dossier_article_plans; original DDL: supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-artigos-planeados-schema-1-aplicar.sql
create table "public"."newsroom_editorial_dossier_article_plans" (
  "id" uuid default gen_random_uuid() not null,
  "dossier_id" uuid not null,
  "working_title" text not null,
  "status" text default 'planned'::text not null,
  "sort_order" integer default 10 not null,
  "article_kind" text default 'news'::text not null,
  "length_mode" text default 'standard'::text not null,
  "editorial_instructions" text default ''::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "editorial_article_id" uuid,
  "editorial_profile_id" uuid,
  "editorial_profile_version_id" uuid,
  "editorial_profile_pinned_at" timestamp with time zone,
  constraint "newsroom_editorial_dossier_article_plans_article_kind_check" CHECK (article_kind = ANY (ARRAY['news'::text, 'analysis'::text, 'preview'::text, 'summary'::text])),
  constraint "newsroom_editorial_dossier_article_plans_dossier_id_id_key" UNIQUE (dossier_id, id),
  constraint "newsroom_editorial_dossier_article_plans_length_mode_check" CHECK (length_mode = ANY (ARRAY['brief'::text, 'standard'::text, 'developed'::text])),
  constraint "newsroom_editorial_dossier_article_plans_pkey" PRIMARY KEY (id),
  constraint "newsroom_editorial_dossier_article_plans_profile_pin_check" CHECK (editorial_profile_id IS NULL AND editorial_profile_version_id IS NULL AND editorial_profile_pinned_at IS NULL OR editorial_profile_id IS NOT NULL AND editorial_profile_version_id IS NOT NULL AND editorial_profile_pinned_at IS NOT NULL),
  constraint "newsroom_editorial_dossier_article_plans_sort_order_check" CHECK (sort_order >= 0),
  constraint "newsroom_editorial_dossier_article_plans_status_check" CHECK (status = ANY (ARRAY['planned'::text, 'ready'::text, 'cancelled'::text])),
  constraint "newsroom_editorial_dossier_article_plans_title_not_blank" CHECK (btrim(working_title) <> ''::text)
);

-- public.newsroom_editorial_dossier_sources; original DDL: supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-aplicar.sql
create table "public"."newsroom_editorial_dossier_sources" (
  "id" uuid default gen_random_uuid() not null,
  "dossier_id" uuid not null,
  "newsroom_article_id" uuid not null,
  "newsroom_snapshot_id" uuid not null,
  "source_role" text default 'complementary'::text not null,
  "sort_order" integer default 10 not null,
  "editorial_note" text,
  "included" boolean default true not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "title_snapshot" text,
  "published_at_snapshot" timestamp with time zone,
  constraint "newsroom_editorial_dossier_sources_dossier_article_key" UNIQUE (dossier_id, newsroom_article_id),
  constraint "newsroom_editorial_dossier_sources_dossier_id_id_key" UNIQUE (dossier_id, id),
  constraint "newsroom_editorial_dossier_sources_note_not_blank" CHECK (editorial_note IS NULL OR btrim(editorial_note) <> ''::text),
  constraint "newsroom_editorial_dossier_sources_pkey" PRIMARY KEY (id),
  constraint "newsroom_editorial_dossier_sources_role_check" CHECK (source_role = ANY (ARRAY['primary'::text, 'corroboration'::text, 'context'::text, 'complementary'::text])),
  constraint "newsroom_editorial_dossier_sources_sort_order_check" CHECK (sort_order >= 0),
  constraint "newsroom_editorial_dossier_sources_title_snapshot_not_blank" CHECK (title_snapshot IS NULL OR btrim(title_snapshot) <> ''::text)
);

-- public.newsroom_editorial_dossiers; original DDL: supabase/sql/jornada-backoffice-redacao-automatica-dossie-editorial-schema-1-aplicar.sql
create table "public"."newsroom_editorial_dossiers" (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "status" text default 'draft'::text not null,
  "editorial_instructions" text default ''::text not null,
  "context_instructions" text default ''::text not null,
  "output_mode" text default 'single'::text not null,
  "output_count" smallint default 1 not null,
  "length_mode" text default 'standard'::text not null,
  "article_kind" text default 'news'::text not null,
  "output_language" text default 'pt-PT'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "newsroom_editorial_dossiers_article_kind_check" CHECK (article_kind = ANY (ARRAY['news'::text, 'analysis'::text, 'preview'::text, 'summary'::text])),
  constraint "newsroom_editorial_dossiers_length_mode_check" CHECK (length_mode = ANY (ARRAY['brief'::text, 'standard'::text, 'developed'::text])),
  constraint "newsroom_editorial_dossiers_output_language_not_blank" CHECK (btrim(output_language) <> ''::text),
  constraint "newsroom_editorial_dossiers_output_mode_check" CHECK (output_mode = ANY (ARRAY['single'::text, 'multiple'::text])),
  constraint "newsroom_editorial_dossiers_pkey" PRIMARY KEY (id),
  constraint "newsroom_editorial_dossiers_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'ready_for_generation'::text, 'completed'::text, 'archived'::text])),
  constraint "newsroom_editorial_dossiers_title_not_blank" CHECK (btrim(title) <> ''::text)
);

-- public.newsroom_editorial_profile_versions; original DDL: supabase/steps/43-redacao-automatica-linha-editorial-persistente-apply.sql
create table "public"."newsroom_editorial_profile_versions" (
  "id" uuid default gen_random_uuid() not null,
  "profile_id" uuid not null,
  "version_number" integer not null,
  "document_text" text not null,
  "content_hash" text not null,
  "change_summary" text not null,
  "based_on_version_id" uuid,
  "approval_state" text default 'approved'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "created_by_actor_type" text not null,
  "created_by_actor_id" text,
  constraint "newsroom_editorial_profile_versions_actor_id_check" CHECK (created_by_actor_id IS NULL OR btrim(created_by_actor_id) <> ''::text AND char_length(created_by_actor_id) <= 180),
  constraint "newsroom_editorial_profile_versions_actor_type_check" CHECK (created_by_actor_type = ANY (ARRAY['system_migration'::text, 'admin_session'::text])),
  constraint "newsroom_editorial_profile_versions_approval_check" CHECK (approval_state = 'approved'::text),
  constraint "newsroom_editorial_profile_versions_document_check" CHECK (btrim(document_text) <> ''::text AND char_length(document_text) <= 20000),
  constraint "newsroom_editorial_profile_versions_hash_check" CHECK (content_hash ~ '^[0-9a-f]{64}$'::text),
  constraint "newsroom_editorial_profile_versions_number_check" CHECK (version_number > 0),
  constraint "newsroom_editorial_profile_versions_pkey" PRIMARY KEY (id),
  constraint "newsroom_editorial_profile_versions_profile_id_key" UNIQUE (profile_id, id),
  constraint "newsroom_editorial_profile_versions_profile_number_key" UNIQUE (profile_id, version_number),
  constraint "newsroom_editorial_profile_versions_summary_check" CHECK (btrim(change_summary) <> ''::text AND char_length(change_summary) <= 1000)
);

-- public.newsroom_editorial_profiles; original DDL: supabase/steps/43-redacao-automatica-linha-editorial-persistente-apply.sql
create table "public"."newsroom_editorial_profiles" (
  "id" uuid default gen_random_uuid() not null,
  "code" text not null,
  "name" text not null,
  "active_version_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "created_by_actor_type" text not null,
  "created_by_actor_id" text,
  constraint "newsroom_editorial_profiles_actor_id_check" CHECK (created_by_actor_id IS NULL OR btrim(created_by_actor_id) <> ''::text AND char_length(created_by_actor_id) <= 180),
  constraint "newsroom_editorial_profiles_actor_type_check" CHECK (created_by_actor_type = ANY (ARRAY['system_migration'::text, 'admin_session'::text])),
  constraint "newsroom_editorial_profiles_code_check" CHECK (code ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'::text AND char_length(code) <= 80),
  constraint "newsroom_editorial_profiles_code_key" UNIQUE (code),
  constraint "newsroom_editorial_profiles_name_check" CHECK (btrim(name) <> ''::text AND char_length(name) <= 180),
  constraint "newsroom_editorial_profiles_pkey" PRIMARY KEY (id)
);

-- public.newsroom_editorial_review_states; original DDL: supabase/steps/93-redacao-automatica-blocos-revisao-editorial-apply.sql
create table "public"."newsroom_editorial_review_states" (
  "newsroom_article_id" uuid not null,
  "decision" text not null,
  "reviewed_snapshot_id" uuid not null,
  "reviewed_at" timestamp with time zone default now() not null,
  "last_batch_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "newsroom_editorial_review_states_decision_check" CHECK (decision = ANY (ARRAY['working'::text, 'seen'::text, 'dismissed'::text])),
  constraint "newsroom_editorial_review_states_pkey" PRIMARY KEY (newsroom_article_id)
);

-- public.newsroom_editorial_source_packages; original DDL: supabase/steps/53-redacao-automatica-pacotes-fontes-persistentes-apply.sql
create table "public"."newsroom_editorial_source_packages" (
  "id" uuid not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "package_year" text not null,
  "package_month" text not null,
  "manifest" jsonb not null,
  "markdown" text not null,
  constraint "newsroom_editorial_source_packages_markdown_check" CHECK (btrim(markdown) <> ''::text),
  constraint "newsroom_editorial_source_packages_month_check" CHECK (package_month ~ '^(0[1-9]|1[0-2])$'::text),
  constraint "newsroom_editorial_source_packages_pkey" PRIMARY KEY (id),
  constraint "newsroom_editorial_source_packages_time_check" CHECK (updated_at >= created_at),
  constraint "newsroom_editorial_source_packages_year_check" CHECK (package_year ~ '^\d{4}$'::text)
);

-- public.newsroom_manual_entry_requests; original DDL: supabase/steps/39-redacao-automatica-recolha-manual-apply.sql
create table "public"."newsroom_manual_entry_requests" (
  "submission_id" uuid not null,
  "request_fingerprint" text not null,
  "newsroom_article_id" uuid,
  "newsroom_snapshot_id" uuid,
  "created_at" timestamp with time zone default now() not null,
  constraint "newsroom_manual_entry_requests_article_key" UNIQUE (newsroom_article_id),
  constraint "newsroom_manual_entry_requests_fingerprint_format_check" CHECK (request_fingerprint ~ '^[0-9a-f]{64}$'::text),
  constraint "newsroom_manual_entry_requests_identity_pair_check" CHECK (newsroom_article_id IS NULL AND newsroom_snapshot_id IS NULL OR newsroom_article_id IS NOT NULL AND newsroom_snapshot_id IS NOT NULL),
  constraint "newsroom_manual_entry_requests_pkey" PRIMARY KEY (submission_id),
  constraint "newsroom_manual_entry_requests_snapshot_key" UNIQUE (newsroom_snapshot_id)
);

-- public.season_teams; original DDL: supabase/steps/10-participantes-epoca.sql
create table "public"."season_teams" (
  "id" uuid default gen_random_uuid() not null,
  "season_id" uuid not null,
  "team_id" uuid not null,
  "display_order" integer default 999 not null,
  "status" text default 'active'::text not null,
  "data_source" text default 'manual'::text not null,
  "external_provider" text,
  "external_id" text,
  "last_synced_at" timestamp with time zone,
  "sync_status" text default 'manual'::text not null,
  "manual_override" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "season_teams_pkey" PRIMARY KEY (id)
);

-- public.seasons; original DDL: supabase/schema.sql, supabase/steps/12-fase1-limpa-pais-competicao-epoca.sql
create table "public"."seasons" (
  "id" uuid default gen_random_uuid() not null,
  "competition_id" uuid not null,
  "label" text not null,
  "starts_on" date,
  "ends_on" date,
  "is_current" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "data_source" text default 'manual'::text not null,
  "external_provider" text,
  "external_id" text,
  "last_synced_at" timestamp with time zone,
  "sync_status" text default 'manual'::text not null,
  "manual_override" boolean default false not null,
  "slug" text,
  "status" text default 'active'::text not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "seasons_pkey" PRIMARY KEY (id)
);

-- public.site_advertising_slots; original DDL: supabase/steps/120-publicidade-lateral-unificada-apply.sql
create table "public"."site_advertising_slots" (
  "slot_key" text not null,
  "name" text default 'Publicidade lateral'::text not null,
  "image_url" text,
  "target_url" text,
  "alt_text" text,
  "is_active" boolean default false not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "site_advertising_slots_pkey" PRIMARY KEY (slot_key)
);

-- public.site_editorial_highlights; original DDL: production catalogue; no original CREATE found
create table "public"."site_editorial_highlights" (
  "id" uuid default gen_random_uuid() not null,
  "site_editorial_id" uuid not null,
  "label" text,
  "title" text,
  "subtitle" text,
  "image_url" text,
  "link_url" text,
  "sort_order" integer default 1 not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "label_color" text,
  constraint "site_editorial_highlights_pkey" PRIMARY KEY (id),
  constraint "site_editorial_highlights_sort_order_check" CHECK (sort_order >= 1 AND sort_order <= 6),
  constraint "site_editorial_highlights_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.site_editorial_horizontal_news; original DDL: supabase/steps/65-editorial-faixa-horizontal-noticias-apply.sql
create table "public"."site_editorial_horizontal_news" (
  "id" uuid default gen_random_uuid() not null,
  "site_editorial_id" uuid not null,
  "label" text,
  "title" text,
  "subtitle" text,
  "image_url" text,
  "link_url" text,
  "sort_order" integer not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "label_color" text,
  constraint "site_editorial_horizontal_news_editorial_sort_unique" UNIQUE (site_editorial_id, sort_order),
  constraint "site_editorial_horizontal_news_pkey" PRIMARY KEY (id),
  constraint "site_editorial_horizontal_news_sort_order_check" CHECK (sort_order > 0),
  constraint "site_editorial_horizontal_news_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.site_editorial_latest_news; original DDL: production catalogue; no original CREATE found
create table "public"."site_editorial_latest_news" (
  "id" uuid default gen_random_uuid() not null,
  "site_editorial_id" uuid not null,
  "time_label" text,
  "title" text,
  "link_url" text,
  "image_url" text,
  "sort_order" integer default 1 not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "subtitle" text,
  "time_label_color" text,
  constraint "site_editorial_latest_news_pkey" PRIMARY KEY (id),
  constraint "site_editorial_latest_news_sort_order_check" CHECK (sort_order >= 1 AND sort_order <= 20),
  constraint "site_editorial_latest_news_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.site_editorials; original DDL: production catalogue; no original CREATE found
create table "public"."site_editorials" (
  "id" uuid default gen_random_uuid() not null,
  "slug" text not null,
  "status" text default 'draft'::text not null,
  "headline_title" text,
  "headline_subtitle" text,
  "headline_image_url" text,
  "headline_title_color" text,
  "below_headline_mode" text default 'highlights'::text not null,
  "side_block_status" text default 'draft'::text not null,
  "side_block_type" text,
  "side_block_label" text,
  "side_block_title" text,
  "side_block_title_color" text,
  "side_block_author" text,
  "side_block_text" text,
  "side_block_image_url" text,
  "side_block_link_url" text,
  "complementary_mode" text default 'none'::text not null,
  "complementary_label" text,
  "complementary_title" text,
  "complementary_text" text,
  "complementary_image_url" text,
  "complementary_link_url" text,
  "complementary_status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "below_headline_heading" text,
  "below_headline_heading_color" text,
  "roundup_video_heading" text,
  "roundup_video_heading_color" text,
  "complementary_roundup_item_id" uuid,
  "headline_link_url" text,
  "final_zone_title" text,
  "final_zone_title_color" text,
  "final_zone_mode" text,
  "side_block_label_color" text,
  constraint "site_editorials_below_headline_mode_check" CHECK (below_headline_mode = ANY (ARRAY['highlights'::text, 'roundup'::text])),
  constraint "site_editorials_complementary_mode_check" CHECK (complementary_mode = ANY (ARRAY['none'::text, 'complementary_story'::text, 'roundup_video'::text])),
  constraint "site_editorials_complementary_status_check" CHECK (complementary_status = ANY (ARRAY['draft'::text, 'published'::text])),
  constraint "site_editorials_final_zone_mode_check" CHECK (final_zone_mode IS NULL OR (final_zone_mode = ANY (ARRAY['latest_news'::text, 'editorial_line'::text]))),
  constraint "site_editorials_pkey" PRIMARY KEY (id),
  constraint "site_editorials_side_block_status_check" CHECK (side_block_status = ANY (ARRAY['draft'::text, 'published'::text])),
  constraint "site_editorials_slug_key" UNIQUE (slug),
  constraint "site_editorials_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text]))
);

-- public.team_aliases; original DDL: supabase/sql/fase-importador-jogos-team-aliases.sql
create table "public"."team_aliases" (
  "id" uuid default gen_random_uuid() not null,
  "team_id" uuid not null,
  "alias" text not null,
  "normalized_alias" text not null,
  "created_at" timestamp with time zone default now() not null,
  "source" text not null,
  "status" text not null,
  "updated_at" timestamp with time zone not null,
  "created_by" text not null,
  "updated_by" text not null,
  constraint "team_aliases_alias_not_blank_check" CHECK (btrim(alias) <> ''::text),
  constraint "team_aliases_created_by_not_blank_check" CHECK (btrim(created_by) <> ''::text),
  constraint "team_aliases_normalized_alias_format_check" CHECK (normalized_alias ~ '^[a-z0-9]+(-[a-z0-9]+)*$'::text),
  constraint "team_aliases_normalized_alias_key" UNIQUE (normalized_alias),
  constraint "team_aliases_normalized_alias_not_blank_check" CHECK (btrim(normalized_alias) <> ''::text),
  constraint "team_aliases_normalized_alias_v1_check" CHECK (normalized_alias = normalize_team_identity_v1(alias)),
  constraint "team_aliases_pkey" PRIMARY KEY (id),
  constraint "team_aliases_source_not_blank_check" CHECK (btrim(source) <> ''::text),
  constraint "team_aliases_status_check" CHECK (status = ANY (ARRAY['active'::text, 'inactive'::text])),
  constraint "team_aliases_updated_by_not_blank_check" CHECK (btrim(updated_by) <> ''::text)
);

-- public.teams; original DDL: supabase/schema.sql
create table "public"."teams" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "short_name" text not null,
  "slug" text not null,
  "country" text,
  "logo_url" text,
  "primary_color" text,
  "created_at" timestamp with time zone default now() not null,
  "data_source" text default 'manual'::text not null,
  "external_provider" text,
  "external_id" text,
  "last_synced_at" timestamp with time zone,
  "sync_status" text default 'manual'::text not null,
  "manual_override" boolean default false not null,
  "country_id" uuid,
  "code" text,
  "secondary_color" text,
  "public_name" text,
  constraint "teams_pkey" PRIMARY KEY (id),
  constraint "teams_public_name_valid_check" CHECK (public_name IS NULL OR public_name = btrim(public_name) AND char_length(public_name) >= 1 AND char_length(public_name) <= 80 AND public_name !~ '[[:cntrl:]]'::text),
  constraint "teams_slug_key" UNIQUE (slug)
);

-- public.articles; original DDL: supabase/schema.sql
create table "public"."articles" (
  "id" uuid default gen_random_uuid() not null,
  "title" text not null,
  "summary" text,
  "body" text,
  "image_url" text,
  "source_url" text,
  "status" text default 'draft'::text not null,
  "competition_id" uuid,
  "season_id" uuid,
  "matchday_id" uuid,
  "match_id" uuid,
  "published_at" timestamp with time zone,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "articles_pkey" PRIMARY KEY (id)
);

-- public.newsroom_editorial_review_batches; original DDL: supabase/steps/93-redacao-automatica-blocos-revisao-editorial-apply.sql
create table "public"."newsroom_editorial_review_batches" (
  "id" uuid default gen_random_uuid() not null,
  "closed_at" timestamp with time zone default now() not null,
  "item_count" integer default 0 not null,
  "created_at" timestamp with time zone default now() not null,
  constraint "newsroom_editorial_review_batches_item_count_check" CHECK (item_count >= 0 AND item_count <= 100),
  constraint "newsroom_editorial_review_batches_pkey" PRIMARY KEY (id)
);

-- public.portal_permissions; original DDL: supabase/sql/portal-escolas-schema-1-20260626.sql
create table "public"."portal_permissions" (
  "id" uuid default gen_random_uuid() not null,
  "portal_entity_id" uuid not null,
  "portal_context_id" uuid,
  "portal_competition_id" uuid,
  "access_profile_id" uuid not null,
  "user_reference" text,
  "can_view" boolean default false not null,
  "can_create" boolean default false not null,
  "can_edit" boolean default false not null,
  "can_validate" boolean default false not null,
  "can_submit_content" boolean default false not null,
  "can_archive" boolean default false not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "portal_user_id" uuid,
  "can_review_content" boolean default false not null,
  "can_approve_content" boolean default false not null,
  constraint "portal_permissions_pkey" PRIMARY KEY (id),
  constraint "portal_permissions_status_not_empty" CHECK (btrim(status) <> ''::text)
);

-- public.portal_users; original DDL: supabase/sql/portal-escolas-auth-schema-1-20260626.sql
create table "public"."portal_users" (
  "id" uuid default gen_random_uuid() not null,
  "auth_user_id" uuid,
  "portal_entity_id" uuid not null,
  "display_name" text,
  "invite_email" text,
  "status" text default 'pending'::text not null,
  "invited_at" timestamp with time zone,
  "activated_at" timestamp with time zone,
  "disabled_at" timestamp with time zone,
  "metadata" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "portal_users_display_name_not_empty" CHECK (display_name IS NULL OR btrim(display_name) <> ''::text),
  constraint "portal_users_invite_email_not_empty" CHECK (invite_email IS NULL OR btrim(invite_email) <> ''::text),
  constraint "portal_users_pkey" PRIMARY KEY (id),
  constraint "portal_users_status_check" CHECK (status = ANY (ARRAY['pending'::text, 'active'::text, 'disabled'::text]))
);

-- public.site_editorial_roundup_items; original DDL: production catalogue; no original CREATE found
create table "public"."site_editorial_roundup_items" (
  "id" uuid default gen_random_uuid() not null,
  "site_editorial_id" uuid not null,
  "sort_order" integer default 1 not null,
  "label" text,
  "title" text,
  "subtitle" text,
  "image_url" text,
  "video_url" text,
  "duration" text,
  "type" text default 'resumo'::text not null,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "site_editorial_roundup_items_pkey" PRIMARY KEY (id),
  constraint "site_editorial_roundup_items_sort_order_check" CHECK (sort_order >= 1 AND sort_order <= 10),
  constraint "site_editorial_roundup_items_status_check" CHECK (status = ANY (ARRAY['draft'::text, 'published'::text])),
  constraint "site_editorial_roundup_items_type_check" CHECK (type = ANY (ARRAY['video'::text, 'golos'::text, 'resumo'::text, 'noticia'::text]))
);

-- public.portal_access_profiles; original DDL: supabase/sql/portal-escolas-schema-1-20260626.sql
create table "public"."portal_access_profiles" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "description" text,
  "status" text default 'active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "portal_access_profiles_name_not_empty" CHECK (btrim(name) <> ''::text),
  constraint "portal_access_profiles_pkey" PRIMARY KEY (id),
  constraint "portal_access_profiles_status_not_empty" CHECK (btrim(status) <> ''::text)
);

-- public.portal_competitions; original DDL: supabase/sql/portal-escolas-schema-1-20260626.sql
create table "public"."portal_competitions" (
  "id" uuid default gen_random_uuid() not null,
  "portal_entity_id" uuid not null,
  "portal_context_id" uuid not null,
  "name" text not null,
  "slug" text,
  "modality" text,
  "scope" text,
  "format" text,
  "status" text default 'draft'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  "portal_modality_id" uuid,
  constraint "portal_competitions_name_not_empty" CHECK (btrim(name) <> ''::text),
  constraint "portal_competitions_pkey" PRIMARY KEY (id),
  constraint "portal_competitions_status_not_empty" CHECK (btrim(status) <> ''::text)
);

-- public.portal_contexts; original DDL: supabase/sql/portal-escolas-schema-1-20260626.sql
create table "public"."portal_contexts" (
  "id" uuid default gen_random_uuid() not null,
  "portal_entity_id" uuid not null,
  "label" text not null,
  "type" text,
  "start_date" date,
  "end_date" date,
  "status" text default 'active'::text not null,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "portal_contexts_date_order" CHECK (start_date IS NULL OR end_date IS NULL OR start_date <= end_date),
  constraint "portal_contexts_label_not_empty" CHECK (btrim(label) <> ''::text),
  constraint "portal_contexts_pkey" PRIMARY KEY (id),
  constraint "portal_contexts_status_not_empty" CHECK (btrim(status) <> ''::text)
);

-- public.portal_entities; original DDL: supabase/sql/portal-escolas-schema-1-20260626.sql
create table "public"."portal_entities" (
  "id" uuid default gen_random_uuid() not null,
  "name" text not null,
  "slug" text,
  "type" text not null,
  "status" text default 'active'::text not null,
  "contact_name" text,
  "contact_email" text,
  "notes" text,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "portal_entities_name_not_empty" CHECK (btrim(name) <> ''::text),
  constraint "portal_entities_pkey" PRIMARY KEY (id),
  constraint "portal_entities_status_not_empty" CHECK (btrim(status) <> ''::text),
  constraint "portal_entities_type_not_empty" CHECK (btrim(type) <> ''::text)
);

-- public.portal_modalities; original DDL: supabase/sql/portal-escolas-multidesporto-schema-proposta-1-20260628.sql
create table "public"."portal_modalities" (
  "id" uuid default gen_random_uuid() not null,
  "portal_entity_id" uuid not null,
  "portal_context_id" uuid not null,
  "catalog_modality_id" uuid,
  "name" text not null,
  "slug" text,
  "local_code" text,
  "display_order" integer,
  "status" text default 'active'::text not null,
  "notes" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "portal_modalities_display_order_positive" CHECK (display_order IS NULL OR display_order >= 0),
  constraint "portal_modalities_local_code_not_empty" CHECK (local_code IS NULL OR btrim(local_code) <> ''::text),
  constraint "portal_modalities_name_not_empty" CHECK (btrim(name) <> ''::text),
  constraint "portal_modalities_pkey" PRIMARY KEY (id),
  constraint "portal_modalities_status_not_empty" CHECK (btrim(status) <> ''::text)
);

-- public.portal_modality_catalog; original DDL: supabase/sql/portal-escolas-multidesporto-schema-proposta-1-20260628.sql
create table "public"."portal_modality_catalog" (
  "id" uuid default gen_random_uuid() not null,
  "code" text not null,
  "name" text not null,
  "modality_family" text,
  "default_event_model" text,
  "default_result_model" text,
  "status" text default 'active'::text not null,
  "notes" text,
  "metadata" jsonb,
  "created_at" timestamp with time zone default now() not null,
  "updated_at" timestamp with time zone default now() not null,
  constraint "portal_modality_catalog_code_not_empty" CHECK (btrim(code) <> ''::text),
  constraint "portal_modality_catalog_name_not_empty" CHECK (btrim(name) <> ''::text),
  constraint "portal_modality_catalog_pkey" PRIMARY KEY (id),
  constraint "portal_modality_catalog_status_not_empty" CHECK (btrim(status) <> ''::text)
);
alter table "public"."broadcast_channels" enable row level security;
alter table "public"."broadcast_channels" owner to "postgres";
revoke all on table "public"."broadcast_channels" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."broadcast_channels" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."broadcast_channels" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."broadcast_channels" to "service_role";
alter table "public"."competitions" add constraint "competitions_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL;
CREATE INDEX competitions_country_id_idx ON public.competitions USING btree (country_id);
CREATE UNIQUE INDEX competitions_country_name_unique_idx ON public.competitions USING btree (country_id, lower(name)) WHERE (country_id IS NOT NULL);
CREATE UNIQUE INDEX competitions_country_slug_unique_idx ON public.competitions USING btree (country_id, lower(slug)) WHERE ((country_id IS NOT NULL) AND (slug IS NOT NULL));
CREATE INDEX competitions_external_lookup_idx ON public.competitions USING btree (external_provider, external_id);
alter table "public"."competitions" enable row level security;
alter table "public"."competitions" owner to "postgres";
revoke all on table "public"."competitions" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."competitions" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."competitions" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."competitions" to "service_role";
CREATE INDEX countries_external_lookup_idx ON public.countries USING btree (external_provider, external_id);
CREATE UNIQUE INDEX countries_name_unique_idx ON public.countries USING btree (lower(name));
CREATE UNIQUE INDEX countries_slug_unique_idx ON public.countries USING btree (lower(slug)) WHERE (slug IS NOT NULL);
alter table "public"."countries" enable row level security;
alter table "public"."countries" owner to "postgres";
revoke all on table "public"."countries" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."countries" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."countries" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."countries" to "service_role";
alter table "public"."editorial_articles" add constraint "editorial_articles_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL;
alter table "public"."editorial_articles" add constraint "editorial_articles_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE SET NULL;
alter table "public"."editorial_articles" add constraint "editorial_articles_newsroom_article_id_fkey" FOREIGN KEY (newsroom_article_id) REFERENCES newsroom_articles(id) ON DELETE RESTRICT;
alter table "public"."editorial_articles" add constraint "editorial_articles_season_id_fkey" FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
CREATE INDEX editorial_articles_competition_id_idx ON public.editorial_articles USING btree (competition_id);
CREATE INDEX editorial_articles_matchday_id_idx ON public.editorial_articles USING btree (matchday_id);
CREATE UNIQUE INDEX editorial_articles_newsroom_article_id_uidx ON public.editorial_articles USING btree (newsroom_article_id) WHERE (newsroom_article_id IS NOT NULL);
CREATE INDEX editorial_articles_published_at_idx ON public.editorial_articles USING btree (published_at);
CREATE INDEX editorial_articles_scope_idx ON public.editorial_articles USING btree (scope);
CREATE INDEX editorial_articles_season_id_idx ON public.editorial_articles USING btree (season_id);
CREATE INDEX editorial_articles_status_idx ON public.editorial_articles USING btree (status);
alter table "public"."editorial_articles" enable row level security;
alter table "public"."editorial_articles" owner to "postgres";
revoke all on table "public"."editorial_articles" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."editorial_articles" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."editorial_articles" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."editorial_articles" to "service_role";
alter table "public"."editorial_contents" add constraint "editorial_contents_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL;
alter table "public"."editorial_contents" add constraint "editorial_contents_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE SET NULL;
alter table "public"."editorial_contents" add constraint "editorial_contents_season_id_fkey" FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
CREATE INDEX editorial_contents_competition_id_idx ON public.editorial_contents USING btree (competition_id);
CREATE INDEX editorial_contents_content_type_idx ON public.editorial_contents USING btree (content_type);
CREATE INDEX editorial_contents_content_type_status_idx ON public.editorial_contents USING btree (content_type, status);
CREATE INDEX editorial_contents_matchday_id_idx ON public.editorial_contents USING btree (matchday_id);
CREATE INDEX editorial_contents_published_at_idx ON public.editorial_contents USING btree (published_at DESC);
CREATE INDEX editorial_contents_scope_idx ON public.editorial_contents USING btree (scope);
CREATE INDEX editorial_contents_scope_status_idx ON public.editorial_contents USING btree (scope, status);
CREATE INDEX editorial_contents_season_id_idx ON public.editorial_contents USING btree (season_id);
CREATE UNIQUE INDEX editorial_contents_slug_unique_idx ON public.editorial_contents USING btree (lower(btrim(slug)));
CREATE INDEX editorial_contents_status_idx ON public.editorial_contents USING btree (status);
CREATE INDEX editorial_contents_status_published_at_idx ON public.editorial_contents USING btree (status, published_at DESC);
alter table "public"."editorial_contents" enable row level security;
alter table "public"."editorial_contents" owner to "postgres";
revoke all on table "public"."editorial_contents" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."editorial_contents" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."editorial_contents" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."editorial_contents" to "service_role";
alter table "public"."matchday_editorial_bank_items" add constraint "matchday_editorial_bank_items_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX matchday_editorial_bank_items_automatic_source_unique_idx ON public.matchday_editorial_bank_items USING btree (matchday_id, lower(btrim(source_type)), lower(btrim(source_id))) WHERE ((lower(btrim(COALESCE(source_type, ''::text))) = ANY (ARRAY['editorial_article'::text, 'editorial_content'::text])) AND (NULLIF(btrim(source_id), ''::text) IS NOT NULL));
CREATE INDEX matchday_editorial_bank_items_matchday_id_idx ON public.matchday_editorial_bank_items USING btree (matchday_id);
CREATE INDEX matchday_editorial_bank_items_matchday_link_idx ON public.matchday_editorial_bank_items USING btree (matchday_id, link_url);
CREATE UNIQUE INDEX matchday_editorial_bank_items_matchday_link_unique_idx ON public.matchday_editorial_bank_items USING btree (matchday_id, lower(btrim(link_url))) WHERE ((link_url IS NOT NULL) AND (btrim(link_url) <> ''::text));
CREATE INDEX matchday_editorial_bank_items_matchday_source_idx ON public.matchday_editorial_bank_items USING btree (matchday_id, source_type, source_id);
CREATE UNIQUE INDEX matchday_editorial_bank_items_matchday_source_unique_idx ON public.matchday_editorial_bank_items USING btree (matchday_id, lower(btrim(source_type)), lower(btrim(source_id))) WHERE ((source_type IS NOT NULL) AND (btrim(source_type) <> ''::text) AND (source_id IS NOT NULL) AND (btrim(source_id) <> ''::text));
CREATE INDEX matchday_editorial_bank_items_matchday_status_idx ON public.matchday_editorial_bank_items USING btree (matchday_id, status);
alter table "public"."matchday_editorial_bank_items" enable row level security;
alter table "public"."matchday_editorial_bank_items" owner to "postgres";
revoke all on table "public"."matchday_editorial_bank_items" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_editorial_bank_items" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_editorial_bank_items" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_editorial_bank_items" to "service_role";
comment on column "public"."matchday_editorial_bank_items"."label_color" is 'Cor opcional do antetÃ­tulo preservada no banco editorial da jornada.';
alter table "public"."matchday_editorials" add constraint "matchday_editorials_complementary_roundup_item_id_fkey" FOREIGN KEY (complementary_roundup_item_id) REFERENCES matchday_roundup_items(id) ON DELETE SET NULL;
alter table "public"."matchday_editorials" add constraint "matchday_editorials_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE CASCADE;
alter table "public"."matchday_editorials" enable row level security;
alter table "public"."matchday_editorials" owner to "postgres";
revoke all on table "public"."matchday_editorials" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_editorials" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_editorials" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_editorials" to "service_role";
comment on column "public"."matchday_editorials"."latest_zone_title_color" is 'Hex color for the public title of the matchday final editorial zone.';
comment on column "public"."matchday_editorials"."side_block_label_color" is 'Cor hexadecimal opcional do antetítulo do bloco lateral da jornada.';
comment on column "public"."matchday_editorials"."latest_zone_placement" is 'Presentation placement of Latest: top, hidden, or beside the four-news live layout.';
alter table "public"."matchday_hierarchical_composition_slots" add constraint "matchday_hierarchical_composition_slots_bank_item_id_fkey" FOREIGN KEY (bank_item_id) REFERENCES matchday_editorial_bank_items(id) ON DELETE SET NULL;
alter table "public"."matchday_hierarchical_composition_slots" add constraint "matchday_hierarchical_composition_slots_composition_id_fkey" FOREIGN KEY (composition_id) REFERENCES matchday_reference_compositions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX matchday_hierarchical_composition_slots_bank_unique_idx ON public.matchday_hierarchical_composition_slots USING btree (composition_id, bank_item_id) WHERE (bank_item_id IS NOT NULL);
CREATE INDEX matchday_hierarchical_composition_slots_composition_idx ON public.matchday_hierarchical_composition_slots USING btree (composition_id);
alter table "public"."matchday_hierarchical_composition_slots" enable row level security;
alter table "public"."matchday_hierarchical_composition_slots" owner to "postgres";
revoke all on table "public"."matchday_hierarchical_composition_slots" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_hierarchical_composition_slots" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_hierarchical_composition_slots" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_hierarchical_composition_slots" to "service_role";
comment on table "public"."matchday_hierarchical_composition_slots" is 'Slots fixos e snapshots independentes da composição hierárquica opcional.';
comment on column "public"."matchday_hierarchical_composition_slots"."bank_item_id" is 'Origem no banco da Jornada; ON DELETE SET NULL preserva os snapshots e evita cascade destrutivo.';
comment on column "public"."matchday_hierarchical_composition_slots"."media_kind_snapshot" is 'Snapshot audiovisual opcional; nos 15 lugares sÃ³ dominant_main pode guardar embed ou vÃ­deo direto.';
alter table "public"."matchday_highlights" add constraint "matchday_highlights_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE CASCADE;
CREATE INDEX matchday_highlights_matchday_order_idx ON public.matchday_highlights USING btree (matchday_id, sort_order);
alter table "public"."matchday_highlights" enable row level security;
alter table "public"."matchday_highlights" owner to "postgres";
revoke all on table "public"."matchday_highlights" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_highlights" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_highlights" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_highlights" to "service_role";
comment on column "public"."matchday_highlights"."label_color" is 'Cor hexadecimal opcional do antetítulo de cada destaque editorial da jornada.';
alter table "public"."matchday_horizontal_news" add constraint "matchday_horizontal_news_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE CASCADE;
CREATE INDEX matchday_horizontal_news_public_idx ON public.matchday_horizontal_news USING btree (matchday_id, status, sort_order);
alter table "public"."matchday_horizontal_news" enable row level security;
alter table "public"."matchday_horizontal_news" owner to "postgres";
revoke all on table "public"."matchday_horizontal_news" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_horizontal_news" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_horizontal_news" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_horizontal_news" to "service_role";
comment on table "public"."matchday_horizontal_news" is 'NotÃ­cias sem limite fixo da faixa horizontal publicada antes da classificaÃ§Ã£o de cada jornada.';
comment on column "public"."matchday_horizontal_news"."label_color" is 'Cor hexadecimal opcional do antetÃ­tulo; nulo mantÃ©m a cor normal do CSS.';
alter table "public"."matchday_latest_news" add constraint "matchday_latest_news_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL;
alter table "public"."matchday_latest_news" add constraint "matchday_latest_news_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE CASCADE;
CREATE INDEX matchday_latest_news_matchday_order_idx ON public.matchday_latest_news USING btree (matchday_id, sort_order);
alter table "public"."matchday_latest_news" enable row level security;
alter table "public"."matchday_latest_news" owner to "postgres";
revoke all on table "public"."matchday_latest_news" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_latest_news" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_latest_news" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_latest_news" to "service_role";
comment on column "public"."matchday_latest_news"."sort_order" is 'Technical order normalized from canonical publication date; positive and without an editorial maximum.';
comment on column "public"."matchday_latest_news"."time_label_color" is 'Cor hexadecimal opcional do antetítulo de cada item da zona final da jornada.';
alter table "public"."matchday_reference_composition_items" add constraint "matchday_reference_composition_items_article_id_fkey" FOREIGN KEY (article_id) REFERENCES articles(id) ON DELETE SET NULL;
alter table "public"."matchday_reference_composition_items" add constraint "matchday_reference_composition_items_composition_id_fkey" FOREIGN KEY (composition_id) REFERENCES matchday_reference_compositions(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX matchday_reference_composition_beyond_position_unique_idx ON public.matchday_reference_composition_items USING btree (composition_id, sort_order) WHERE (slot_type = 'beyond_matchday'::text);
CREATE INDEX matchday_reference_composition_items_article_id_idx ON public.matchday_reference_composition_items USING btree (article_id);
CREATE INDEX matchday_reference_composition_items_composition_id_idx ON public.matchday_reference_composition_items USING btree (composition_id);
CREATE INDEX matchday_reference_composition_items_slot_type_idx ON public.matchday_reference_composition_items USING btree (slot_type);
CREATE INDEX matchday_reference_composition_items_sort_order_idx ON public.matchday_reference_composition_items USING btree (sort_order);
CREATE INDEX matchday_reference_composition_items_source_type_idx ON public.matchday_reference_composition_items USING btree (source_type);
CREATE INDEX matchday_reference_composition_items_status_idx ON public.matchday_reference_composition_items USING btree (status);
alter table "public"."matchday_reference_composition_items" enable row level security;
alter table "public"."matchday_reference_composition_items" owner to "postgres";
revoke all on table "public"."matchday_reference_composition_items" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_reference_composition_items" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_reference_composition_items" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_reference_composition_items" to "service_role";
comment on column "public"."matchday_reference_composition_items"."label_color_snapshot" is 'Fotografia opcional da cor do antetÃ­tulo na composiÃ§Ã£o editorial.';
comment on column "public"."matchday_reference_composition_items"."media_kind_snapshot" is 'Snapshot audiovisual opcional para posiÃ§Ãµes capazes de apresentar media sem alterar a origem canÃ³nica.';
alter table "public"."matchday_reference_compositions" add constraint "matchday_reference_compositions_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE CASCADE;
CREATE UNIQUE INDEX matchday_reference_compositions_current_unique_idx ON public.matchday_reference_compositions USING btree (matchday_id) WHERE (is_current = true);
CREATE UNIQUE INDEX matchday_reference_compositions_draft_mode_unique_idx ON public.matchday_reference_compositions USING btree (matchday_id, presentation_mode) WHERE (status = 'draft'::text);
CREATE INDEX matchday_reference_compositions_is_current_idx ON public.matchday_reference_compositions USING btree (is_current);
CREATE INDEX matchday_reference_compositions_matchday_id_idx ON public.matchday_reference_compositions USING btree (matchday_id);
CREATE INDEX matchday_reference_compositions_status_idx ON public.matchday_reference_compositions USING btree (status);
alter table "public"."matchday_reference_compositions" enable row level security;
alter table "public"."matchday_reference_compositions" owner to "postgres";
revoke all on table "public"."matchday_reference_compositions" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_reference_compositions" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_reference_compositions" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_reference_compositions" to "service_role";
comment on column "public"."matchday_reference_compositions"."presentation_mode" is 'Renderer da versão: standard preserva a composição existente; hierarchical usa os 15 slots próprios.';
comment on column "public"."matchday_reference_compositions"."hierarchical_editorial_title" is 'TÃ­tulo do Editorial da Jornada pertencente exclusivamente Ã  composiÃ§Ã£o hierarchical.';
comment on column "public"."matchday_reference_compositions"."hierarchical_editorial_text" is 'Texto do Editorial da Jornada pertencente exclusivamente Ã  composiÃ§Ã£o hierarchical.';
comment on column "public"."matchday_reference_compositions"."hierarchical_editorial_author" is 'Autor do Editorial da Jornada pertencente exclusivamente Ã  composiÃ§Ã£o hierarchical.';
alter table "public"."matchday_roundup_items" add constraint "matchday_roundup_items_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE CASCADE;
CREATE INDEX matchday_roundup_items_matchday_order_idx ON public.matchday_roundup_items USING btree (matchday_id, sort_order);
alter table "public"."matchday_roundup_items" enable row level security;
alter table "public"."matchday_roundup_items" owner to "postgres";
revoke all on table "public"."matchday_roundup_items" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_roundup_items" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_roundup_items" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchday_roundup_items" to "service_role";
alter table "public"."matchdays" add constraint "matchdays_season_id_fkey" FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
CREATE INDEX matchdays_external_lookup_idx ON public.matchdays USING btree (external_provider, external_id);
CREATE INDEX matchdays_featured_idx ON public.matchdays USING btree (is_featured, display_order);
CREATE INDEX matchdays_season_order_idx ON public.matchdays USING btree (season_id, display_order, number);
alter table "public"."matchdays" enable row level security;
alter table "public"."matchdays" owner to "postgres";
revoke all on table "public"."matchdays" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchdays" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchdays" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matchdays" to "service_role";
alter table "public"."matches" add constraint "matches_away_team_id_fkey" FOREIGN KEY (away_team_id) REFERENCES teams(id);
alter table "public"."matches" add constraint "matches_broadcast_channel_id_fkey" FOREIGN KEY (broadcast_channel_id) REFERENCES broadcast_channels(id) ON DELETE SET NULL;
alter table "public"."matches" add constraint "matches_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;
alter table "public"."matches" add constraint "matches_home_team_id_fkey" FOREIGN KEY (home_team_id) REFERENCES teams(id);
alter table "public"."matches" add constraint "matches_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE SET NULL;
alter table "public"."matches" add constraint "matches_season_id_fkey" FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
CREATE INDEX matches_external_lookup_idx ON public.matches USING btree (external_provider, external_id);
CREATE INDEX matches_external_match_lookup_idx ON public.matches USING btree (external_provider, external_match_id);
CREATE UNIQUE INDEX matches_source_key_unique ON public.matches USING btree (source_key);
alter table "public"."matches" enable row level security;
alter table "public"."matches" owner to "postgres";
revoke all on table "public"."matches" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matches" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matches" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."matches" to "service_role";
comment on column "public"."matches"."live_started_at" is 'Timestamp used as the reference start/resume time for calculated live match clock.';
comment on column "public"."matches"."live_base_minute" is 'Base match minute used together with live_started_at to calculate the public live minute.';
comment on column "public"."matches"."is_clock_running" is 'Whether the calculated live match clock is currently running.';
alter table "public"."newsroom_article_snapshots" add constraint "newsroom_article_snapshots_article_fkey" FOREIGN KEY (article_id) REFERENCES newsroom_articles(id) ON DELETE RESTRICT;
CREATE UNIQUE INDEX newsroom_article_snapshots_article_id_id_uidx ON public.newsroom_article_snapshots USING btree (article_id, id);
CREATE INDEX newsroom_article_snapshots_latest_idx ON public.newsroom_article_snapshots USING btree (article_id, extracted_at DESC, created_at DESC);
alter table "public"."newsroom_article_snapshots" enable row level security;
alter table "public"."newsroom_article_snapshots" force row level security;
alter table "public"."newsroom_article_snapshots" owner to "postgres";
revoke all on table "public"."newsroom_article_snapshots" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_article_snapshots" to "service_role";
comment on table "public"."newsroom_article_snapshots" is 'Immutable normalized extraction snapshots for Automatic Newsroom source articles.';
CREATE INDEX newsroom_articles_last_detected_idx ON public.newsroom_articles USING btree (last_detected_at DESC, id DESC);
CREATE INDEX newsroom_articles_source_last_detected_idx ON public.newsroom_articles USING btree (source_code, last_detected_at DESC);
CREATE INDEX newsroom_articles_status_last_detected_idx ON public.newsroom_articles USING btree (processing_status, last_detected_at DESC);
alter table "public"."newsroom_articles" enable row level security;
alter table "public"."newsroom_articles" force row level security;
alter table "public"."newsroom_articles" owner to "postgres";
revoke all on table "public"."newsroom_articles" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_articles" to "service_role";
comment on table "public"."newsroom_articles" is 'Persistent source-article identities and current metadata for the Automatic Newsroom.';
alter table "public"."newsroom_editorial_dossier_article_plan_sources" add constraint "newsroom_editorial_dossier_article_plan_sources_plan_identity_f" FOREIGN KEY (dossier_id, article_plan_id) REFERENCES newsroom_editorial_dossier_article_plans(dossier_id, id) ON DELETE CASCADE;
alter table "public"."newsroom_editorial_dossier_article_plan_sources" add constraint "newsroom_editorial_dossier_article_plan_sources_source_identity" FOREIGN KEY (dossier_id, dossier_source_id) REFERENCES newsroom_editorial_dossier_sources(dossier_id, id) ON DELETE CASCADE;
CREATE INDEX newsroom_editorial_dossier_article_plan_sources_plan_order_idx ON public.newsroom_editorial_dossier_article_plan_sources USING btree (article_plan_id, sort_order, id);
CREATE INDEX newsroom_editorial_dossier_article_plan_sources_source_idx ON public.newsroom_editorial_dossier_article_plan_sources USING btree (dossier_source_id, article_plan_id);
alter table "public"."newsroom_editorial_dossier_article_plan_sources" enable row level security;
alter table "public"."newsroom_editorial_dossier_article_plan_sources" force row level security;
alter table "public"."newsroom_editorial_dossier_article_plan_sources" owner to "postgres";
revoke all on table "public"."newsroom_editorial_dossier_article_plan_sources" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_dossier_article_plan_sources" to "service_role";
comment on table "public"."newsroom_editorial_dossier_article_plan_sources" is 'Assignments between an article plan and the dossier sources whose snapshots are already frozen.';
comment on column "public"."newsroom_editorial_dossier_article_plan_sources"."dossier_source_id" is 'References the frozen source entry inside the same dossier rather than a mutable current snapshot.';
alter table "public"."newsroom_editorial_dossier_article_plans" add constraint "newsroom_editorial_dossier_article_plans_dossier_fkey" FOREIGN KEY (dossier_id) REFERENCES newsroom_editorial_dossiers(id) ON DELETE CASCADE;
alter table "public"."newsroom_editorial_dossier_article_plans" add constraint "newsroom_editorial_dossier_article_plans_editorial_article_fkey" FOREIGN KEY (editorial_article_id) REFERENCES editorial_articles(id) ON DELETE SET NULL;
alter table "public"."newsroom_editorial_dossier_article_plans" add constraint "newsroom_editorial_dossier_article_plans_profile_fkey" FOREIGN KEY (editorial_profile_id) REFERENCES newsroom_editorial_profiles(id) ON DELETE RESTRICT;
alter table "public"."newsroom_editorial_dossier_article_plans" add constraint "newsroom_editorial_dossier_article_plans_profile_version_fkey" FOREIGN KEY (editorial_profile_id, editorial_profile_version_id) REFERENCES newsroom_editorial_profile_versions(profile_id, id) ON DELETE RESTRICT;
CREATE INDEX newsroom_editorial_dossier_article_plans_dossier_order_idx ON public.newsroom_editorial_dossier_article_plans USING btree (dossier_id, status, sort_order, id);
CREATE UNIQUE INDEX newsroom_editorial_dossier_article_plans_editorial_article_id_u ON public.newsroom_editorial_dossier_article_plans USING btree (editorial_article_id) WHERE (editorial_article_id IS NOT NULL);
CREATE INDEX newsroom_editorial_dossier_article_plans_profile_version_idx ON public.newsroom_editorial_dossier_article_plans USING btree (editorial_profile_id, editorial_profile_version_id) WHERE (editorial_profile_version_id IS NOT NULL);
alter table "public"."newsroom_editorial_dossier_article_plans" enable row level security;
alter table "public"."newsroom_editorial_dossier_article_plans" force row level security;
alter table "public"."newsroom_editorial_dossier_article_plans" owner to "postgres";
revoke all on table "public"."newsroom_editorial_dossier_article_plans" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_dossier_article_plans" to "service_role";
comment on table "public"."newsroom_editorial_dossier_article_plans" is 'Human-defined article plans inside an editorial dossier; no text generation occurs here.';
comment on column "public"."newsroom_editorial_dossier_article_plans"."working_title" is 'Internal working title defined by the editor before any draft generation.';
comment on column "public"."newsroom_editorial_dossier_article_plans"."status" is 'Planning lifecycle: planned, ready or cancelled. Converted plans remain ready and are identified by editorial_article_id.';
comment on column "public"."newsroom_editorial_dossier_article_plans"."editorial_article_id" is 'Unique editorial article created from this ready plan. A non-null value freezes the plan and its source assignments.';
alter table "public"."newsroom_editorial_dossier_sources" add constraint "newsroom_editorial_dossier_sources_article_fkey" FOREIGN KEY (newsroom_article_id) REFERENCES newsroom_articles(id) ON DELETE RESTRICT;
alter table "public"."newsroom_editorial_dossier_sources" add constraint "newsroom_editorial_dossier_sources_dossier_fkey" FOREIGN KEY (dossier_id) REFERENCES newsroom_editorial_dossiers(id) ON DELETE CASCADE;
alter table "public"."newsroom_editorial_dossier_sources" add constraint "newsroom_editorial_dossier_sources_snapshot_identity_fkey" FOREIGN KEY (newsroom_article_id, newsroom_snapshot_id) REFERENCES newsroom_article_snapshots(article_id, id) ON DELETE RESTRICT;
CREATE INDEX newsroom_editorial_dossier_sources_article_idx ON public.newsroom_editorial_dossier_sources USING btree (newsroom_article_id, dossier_id);
CREATE INDEX newsroom_editorial_dossier_sources_dossier_order_idx ON public.newsroom_editorial_dossier_sources USING btree (dossier_id, included DESC, sort_order, id);
CREATE INDEX newsroom_editorial_dossier_sources_snapshot_idx ON public.newsroom_editorial_dossier_sources USING btree (newsroom_snapshot_id);
alter table "public"."newsroom_editorial_dossier_sources" enable row level security;
alter table "public"."newsroom_editorial_dossier_sources" force row level security;
alter table "public"."newsroom_editorial_dossier_sources" owner to "postgres";
revoke all on table "public"."newsroom_editorial_dossier_sources" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_dossier_sources" to "service_role";
comment on table "public"."newsroom_editorial_dossier_sources" is 'Ordered, role-aware and snapshot-frozen source articles selected for an editorial dossier.';
comment on column "public"."newsroom_editorial_dossier_sources"."newsroom_snapshot_id" is 'Immutable snapshot selected for this dossier; later re-extractions do not silently replace it.';
comment on column "public"."newsroom_editorial_dossier_sources"."title_snapshot" is 'Title frozen when the dossier source is composed. Null only for legacy rows.';
comment on column "public"."newsroom_editorial_dossier_sources"."published_at_snapshot" is 'Source publication timestamp frozen when composed. Null can be factual or legacy.';
CREATE INDEX newsroom_editorial_dossiers_status_updated_idx ON public.newsroom_editorial_dossiers USING btree (status, updated_at DESC, id DESC);
alter table "public"."newsroom_editorial_dossiers" enable row level security;
alter table "public"."newsroom_editorial_dossiers" force row level security;
alter table "public"."newsroom_editorial_dossiers" owner to "postgres";
revoke all on table "public"."newsroom_editorial_dossiers" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_dossiers" to "service_role";
comment on table "public"."newsroom_editorial_dossiers" is 'Persistent editorial workspaces that combine source snapshots and human instructions before any AI generation.';
comment on column "public"."newsroom_editorial_dossiers"."editorial_instructions" is 'Human instructions that define relevance, order, angle and expected editorial reconstruction.';
comment on column "public"."newsroom_editorial_dossiers"."context_instructions" is 'Human context that may be introduced into the reconstructed article without external factual enrichment.';
alter table "public"."newsroom_editorial_profile_versions" add constraint "newsroom_editorial_profile_versions_based_on_fkey" FOREIGN KEY (profile_id, based_on_version_id) REFERENCES newsroom_editorial_profile_versions(profile_id, id) ON DELETE RESTRICT;
alter table "public"."newsroom_editorial_profile_versions" add constraint "newsroom_editorial_profile_versions_profile_fkey" FOREIGN KEY (profile_id) REFERENCES newsroom_editorial_profiles(id) ON DELETE RESTRICT;
CREATE INDEX newsroom_editorial_profile_versions_profile_number_desc_idx ON public.newsroom_editorial_profile_versions USING btree (profile_id, version_number DESC);
alter table "public"."newsroom_editorial_profile_versions" enable row level security;
alter table "public"."newsroom_editorial_profile_versions" force row level security;
alter table "public"."newsroom_editorial_profile_versions" owner to "postgres";
revoke all on table "public"."newsroom_editorial_profile_versions" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_profile_versions" to "service_role";
comment on table "public"."newsroom_editorial_profile_versions" is 'Immutable, approved textual versions of an editorial profile.';
alter table "public"."newsroom_editorial_profiles" add constraint "newsroom_editorial_profiles_active_version_fkey" FOREIGN KEY (id, active_version_id) REFERENCES newsroom_editorial_profile_versions(profile_id, id) ON DELETE RESTRICT;
alter table "public"."newsroom_editorial_profiles" enable row level security;
alter table "public"."newsroom_editorial_profiles" force row level security;
alter table "public"."newsroom_editorial_profiles" owner to "postgres";
revoke all on table "public"."newsroom_editorial_profiles" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_profiles" to "service_role";
comment on table "public"."newsroom_editorial_profiles" is 'Persistent editorial profile; only the active version pointer is mutable.';
alter table "public"."newsroom_editorial_review_states" add constraint "newsroom_editorial_review_states_article_fkey" FOREIGN KEY (newsroom_article_id) REFERENCES newsroom_articles(id) ON DELETE CASCADE;
alter table "public"."newsroom_editorial_review_states" add constraint "newsroom_editorial_review_states_batch_fkey" FOREIGN KEY (last_batch_id) REFERENCES newsroom_editorial_review_batches(id) ON DELETE SET NULL;
alter table "public"."newsroom_editorial_review_states" add constraint "newsroom_editorial_review_states_snapshot_fkey" FOREIGN KEY (newsroom_article_id, reviewed_snapshot_id) REFERENCES newsroom_article_snapshots(article_id, id) ON DELETE RESTRICT;
CREATE INDEX newsroom_editorial_review_states_decision_reviewed_idx ON public.newsroom_editorial_review_states USING btree (decision, reviewed_at DESC, newsroom_article_id);
alter table "public"."newsroom_editorial_review_states" enable row level security;
alter table "public"."newsroom_editorial_review_states" force row level security;
alter table "public"."newsroom_editorial_review_states" owner to "postgres";
revoke all on table "public"."newsroom_editorial_review_states" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_review_states" to "service_role";
comment on table "public"."newsroom_editorial_review_states" is 'Current human editorial decision for each Automatic Newsroom source article and the snapshot reviewed.';
CREATE INDEX newsroom_editorial_source_packages_created_idx ON public.newsroom_editorial_source_packages USING btree (created_at DESC, id DESC);
alter table "public"."newsroom_editorial_source_packages" enable row level security;
alter table "public"."newsroom_editorial_source_packages" force row level security;
alter table "public"."newsroom_editorial_source_packages" owner to "postgres";
revoke all on table "public"."newsroom_editorial_source_packages" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_source_packages" to "service_role";
comment on table "public"."newsroom_editorial_source_packages" is 'Private persistent Markdown packages assembled from selected newsroom snapshots; accessed only by server-side editorial routes.';
comment on column "public"."newsroom_editorial_source_packages"."manifest" is 'Validated package metadata. Local image archive information is optional and may be null in hosted environments.';
comment on column "public"."newsroom_editorial_source_packages"."markdown" is 'Complete Markdown returned to the authenticated backoffice for clipboard copy or download.';
alter table "public"."newsroom_manual_entry_requests" add constraint "newsroom_manual_entry_requests_article_fkey" FOREIGN KEY (newsroom_article_id) REFERENCES newsroom_articles(id) ON DELETE RESTRICT;
alter table "public"."newsroom_manual_entry_requests" add constraint "newsroom_manual_entry_requests_snapshot_fkey" FOREIGN KEY (newsroom_snapshot_id) REFERENCES newsroom_article_snapshots(id) ON DELETE RESTRICT;
alter table "public"."newsroom_manual_entry_requests" enable row level security;
alter table "public"."newsroom_manual_entry_requests" force row level security;
alter table "public"."newsroom_manual_entry_requests" owner to "postgres";
revoke all on table "public"."newsroom_manual_entry_requests" from public, anon, authenticated, service_role;
comment on table "public"."newsroom_manual_entry_requests" is 'Persistent idempotency identity linking one manual submission to one newsroom article and immutable snapshot.';
alter table "public"."season_teams" add constraint "season_teams_season_id_fkey" FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE;
alter table "public"."season_teams" add constraint "season_teams_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE CASCADE;
CREATE INDEX season_teams_season_order_idx ON public.season_teams USING btree (season_id, display_order);
CREATE UNIQUE INDEX season_teams_season_team_idx ON public.season_teams USING btree (season_id, team_id);
alter table "public"."season_teams" enable row level security;
alter table "public"."season_teams" owner to "postgres";
revoke all on table "public"."season_teams" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."season_teams" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."season_teams" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."season_teams" to "service_role";
alter table "public"."seasons" add constraint "seasons_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE CASCADE;
CREATE INDEX seasons_competition_id_idx ON public.seasons USING btree (competition_id);
CREATE UNIQUE INDEX seasons_competition_label_unique_idx ON public.seasons USING btree (competition_id, lower(label)) WHERE (competition_id IS NOT NULL);
CREATE UNIQUE INDEX seasons_competition_slug_unique_idx ON public.seasons USING btree (competition_id, lower(slug)) WHERE ((competition_id IS NOT NULL) AND (slug IS NOT NULL));
CREATE INDEX seasons_external_lookup_idx ON public.seasons USING btree (external_provider, external_id);
alter table "public"."seasons" enable row level security;
alter table "public"."seasons" owner to "postgres";
revoke all on table "public"."seasons" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."seasons" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."seasons" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."seasons" to "service_role";
alter table "public"."site_advertising_slots" enable row level security;
alter table "public"."site_advertising_slots" owner to "postgres";
revoke all on table "public"."site_advertising_slots" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_advertising_slots" to "service_role";
alter table "public"."site_editorial_highlights" add constraint "site_editorial_highlights_site_editorial_id_fkey" FOREIGN KEY (site_editorial_id) REFERENCES site_editorials(id) ON DELETE CASCADE;
CREATE INDEX site_editorial_highlights_editorial_order_idx ON public.site_editorial_highlights USING btree (site_editorial_id, sort_order);
CREATE UNIQUE INDEX site_editorial_highlights_editorial_sort_unique_idx ON public.site_editorial_highlights USING btree (site_editorial_id, sort_order);
alter table "public"."site_editorial_highlights" enable row level security;
alter table "public"."site_editorial_highlights" owner to "postgres";
revoke all on table "public"."site_editorial_highlights" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_highlights" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_highlights" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_highlights" to "service_role";
comment on column "public"."site_editorial_highlights"."label_color" is 'Cor hexadecimal opcional do antetítulo de cada destaque da Home.';
alter table "public"."site_editorial_horizontal_news" add constraint "site_editorial_horizontal_news_site_editorial_id_fkey" FOREIGN KEY (site_editorial_id) REFERENCES site_editorials(id) ON DELETE CASCADE;
CREATE INDEX site_editorial_horizontal_news_public_idx ON public.site_editorial_horizontal_news USING btree (site_editorial_id, status, sort_order);
alter table "public"."site_editorial_horizontal_news" enable row level security;
alter table "public"."site_editorial_horizontal_news" owner to "postgres";
revoke all on table "public"."site_editorial_horizontal_news" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_horizontal_news" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_horizontal_news" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_horizontal_news" to "service_role";
comment on table "public"."site_editorial_horizontal_news" is 'NotÃ­cias sem limite fixo da faixa horizontal publicada no fundo da Home.';
comment on column "public"."site_editorial_horizontal_news"."label_color" is 'Cor hexadecimal opcional do antetÃ­tulo; nulo mantÃ©m a cor normal do CSS.';
alter table "public"."site_editorial_latest_news" add constraint "site_editorial_latest_news_site_editorial_id_fkey" FOREIGN KEY (site_editorial_id) REFERENCES site_editorials(id) ON DELETE CASCADE;
CREATE INDEX site_editorial_latest_news_editorial_order_idx ON public.site_editorial_latest_news USING btree (site_editorial_id, sort_order);
CREATE UNIQUE INDEX site_editorial_latest_news_editorial_sort_unique_idx ON public.site_editorial_latest_news USING btree (site_editorial_id, sort_order);
alter table "public"."site_editorial_latest_news" enable row level security;
alter table "public"."site_editorial_latest_news" owner to "postgres";
revoke all on table "public"."site_editorial_latest_news" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_latest_news" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_latest_news" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_latest_news" to "service_role";
comment on column "public"."site_editorial_latest_news"."time_label_color" is 'Cor hexadecimal opcional do antetítulo de cada item da zona final da Home.';
alter table "public"."site_editorials" add constraint "site_editorials_complementary_roundup_item_id_fkey" FOREIGN KEY (complementary_roundup_item_id) REFERENCES site_editorial_roundup_items(id) ON DELETE SET NULL;
alter table "public"."site_editorials" enable row level security;
alter table "public"."site_editorials" owner to "postgres";
revoke all on table "public"."site_editorials" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorials" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorials" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorials" to "service_role";
comment on column "public"."site_editorials"."side_block_label_color" is 'Cor hexadecimal opcional do antetítulo do bloco lateral da Home.';
alter table "public"."team_aliases" add constraint "team_aliases_team_id_fkey" FOREIGN KEY (team_id) REFERENCES teams(id) ON DELETE RESTRICT;
CREATE INDEX team_aliases_team_id_idx ON public.team_aliases USING btree (team_id);
CREATE INDEX team_aliases_team_status_normalized_idx ON public.team_aliases USING btree (team_id, status, normalized_alias);
alter table "public"."team_aliases" enable row level security;
alter table "public"."team_aliases" owner to "postgres";
revoke all on table "public"."team_aliases" from public, anon, authenticated, service_role;
grant SELECT on table "public"."team_aliases" to "service_role";
alter table "public"."teams" add constraint "teams_country_id_fkey" FOREIGN KEY (country_id) REFERENCES countries(id) ON DELETE SET NULL;
CREATE INDEX teams_country_id_idx ON public.teams USING btree (country_id);
CREATE INDEX teams_external_lookup_idx ON public.teams USING btree (external_provider, external_id);
alter table "public"."teams" enable row level security;
alter table "public"."teams" owner to "postgres";
revoke all on table "public"."teams" from public, anon, authenticated, service_role;
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."teams" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."teams" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."teams" to "service_role";
comment on column "public"."teams"."public_name" is 'Nome editorial usado na apresentaÃ§Ã£o pÃºblica do clube. NÃ£o Ã© uma sigla nem um alias e nÃ£o deve ser usado para resoluÃ§Ã£o canÃ³nica.';
alter table "public"."articles" add constraint "articles_competition_id_fkey" FOREIGN KEY (competition_id) REFERENCES competitions(id) ON DELETE SET NULL;
alter table "public"."articles" add constraint "articles_match_id_fkey" FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE SET NULL;
alter table "public"."articles" add constraint "articles_matchday_id_fkey" FOREIGN KEY (matchday_id) REFERENCES matchdays(id) ON DELETE SET NULL;
alter table "public"."articles" add constraint "articles_season_id_fkey" FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE SET NULL;
alter table "public"."articles" enable row level security;
alter table "public"."articles" owner to "postgres";
revoke all on table "public"."articles" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."articles" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."articles" to "authenticated";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."articles" to "service_role";
alter table "public"."newsroom_editorial_review_batches" enable row level security;
alter table "public"."newsroom_editorial_review_batches" force row level security;
alter table "public"."newsroom_editorial_review_batches" owner to "postgres";
revoke all on table "public"."newsroom_editorial_review_batches" from public, anon, authenticated, service_role;
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."newsroom_editorial_review_batches" to "service_role";
comment on table "public"."newsroom_editorial_review_batches" is 'Immutable headers for editorial review blocks closed by the journalist.';
alter table "public"."portal_permissions" add constraint "portal_permissions_access_profile_id_fkey" FOREIGN KEY (access_profile_id) REFERENCES portal_access_profiles(id) ON DELETE RESTRICT;
alter table "public"."portal_permissions" add constraint "portal_permissions_portal_competition_id_fkey" FOREIGN KEY (portal_competition_id) REFERENCES portal_competitions(id) ON DELETE RESTRICT;
alter table "public"."portal_permissions" add constraint "portal_permissions_portal_context_id_fkey" FOREIGN KEY (portal_context_id) REFERENCES portal_contexts(id) ON DELETE RESTRICT;
alter table "public"."portal_permissions" add constraint "portal_permissions_portal_entity_id_fkey" FOREIGN KEY (portal_entity_id) REFERENCES portal_entities(id) ON DELETE RESTRICT;
alter table "public"."portal_permissions" add constraint "portal_permissions_portal_user_id_fkey" FOREIGN KEY (portal_user_id) REFERENCES portal_users(id) ON DELETE SET NULL;
CREATE INDEX portal_permissions_access_profile_idx ON public.portal_permissions USING btree (access_profile_id);
CREATE INDEX portal_permissions_can_approve_content_idx ON public.portal_permissions USING btree (can_approve_content);
CREATE INDEX portal_permissions_can_review_content_idx ON public.portal_permissions USING btree (can_review_content);
CREATE INDEX portal_permissions_competition_idx ON public.portal_permissions USING btree (portal_competition_id);
CREATE INDEX portal_permissions_context_idx ON public.portal_permissions USING btree (portal_context_id);
CREATE INDEX portal_permissions_entity_idx ON public.portal_permissions USING btree (portal_entity_id);
CREATE INDEX portal_permissions_portal_user_idx ON public.portal_permissions USING btree (portal_user_id);
CREATE INDEX portal_permissions_status_idx ON public.portal_permissions USING btree (status);
CREATE INDEX portal_permissions_user_entity_competition_idx ON public.portal_permissions USING btree (portal_user_id, portal_entity_id, portal_competition_id);
CREATE INDEX portal_permissions_user_entity_context_idx ON public.portal_permissions USING btree (portal_user_id, portal_entity_id, portal_context_id);
CREATE INDEX portal_permissions_user_entity_idx ON public.portal_permissions USING btree (portal_user_id, portal_entity_id);
CREATE INDEX portal_permissions_user_reference_idx ON public.portal_permissions USING btree (user_reference);
alter table "public"."portal_permissions" enable row level security;
alter table "public"."portal_permissions" owner to "postgres";
revoke all on table "public"."portal_permissions" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_permissions" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_permissions" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_permissions" to "service_role";
comment on column "public"."portal_permissions"."portal_user_id" is 'Future link to public.portal_users. Nullable during demo/invitation transition.';
alter table "public"."portal_users" add constraint "portal_users_portal_entity_id_fkey" FOREIGN KEY (portal_entity_id) REFERENCES portal_entities(id) ON DELETE RESTRICT;
CREATE INDEX portal_users_auth_user_idx ON public.portal_users USING btree (auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE UNIQUE INDEX portal_users_entity_auth_user_unique_idx ON public.portal_users USING btree (portal_entity_id, auth_user_id) WHERE (auth_user_id IS NOT NULL);
CREATE INDEX portal_users_entity_idx ON public.portal_users USING btree (portal_entity_id);
CREATE INDEX portal_users_invite_email_idx ON public.portal_users USING btree (invite_email) WHERE (invite_email IS NOT NULL);
CREATE INDEX portal_users_status_idx ON public.portal_users USING btree (status);
alter table "public"."portal_users" enable row level security;
alter table "public"."portal_users" owner to "postgres";
revoke all on table "public"."portal_users" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_users" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_users" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_users" to "service_role";
comment on table "public"."portal_users" is 'Portal users linked conceptually to Supabase Auth and scoped to a portal entity.';
comment on column "public"."portal_users"."auth_user_id" is 'Supabase Auth user id. Nullable while invitation is pending.';
comment on column "public"."portal_users"."invite_email" is 'Invitation/reference email. Not the final authorization identity.';
alter table "public"."site_editorial_roundup_items" add constraint "site_editorial_roundup_items_site_editorial_id_fkey" FOREIGN KEY (site_editorial_id) REFERENCES site_editorials(id) ON DELETE CASCADE;
CREATE INDEX site_editorial_roundup_items_editorial_order_idx ON public.site_editorial_roundup_items USING btree (site_editorial_id, sort_order);
CREATE UNIQUE INDEX site_editorial_roundup_items_editorial_sort_unique_idx ON public.site_editorial_roundup_items USING btree (site_editorial_id, sort_order);
alter table "public"."site_editorial_roundup_items" enable row level security;
alter table "public"."site_editorial_roundup_items" owner to "postgres";
revoke all on table "public"."site_editorial_roundup_items" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_roundup_items" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_roundup_items" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."site_editorial_roundup_items" to "service_role";
CREATE INDEX portal_access_profiles_status_idx ON public.portal_access_profiles USING btree (status);
alter table "public"."portal_access_profiles" enable row level security;
alter table "public"."portal_access_profiles" owner to "postgres";
revoke all on table "public"."portal_access_profiles" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_access_profiles" to "anon";
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_access_profiles" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_access_profiles" to "service_role";
alter table "public"."portal_competitions" add constraint "portal_competitions_portal_context_id_fkey" FOREIGN KEY (portal_context_id) REFERENCES portal_contexts(id) ON DELETE RESTRICT;
alter table "public"."portal_competitions" add constraint "portal_competitions_portal_entity_id_fkey" FOREIGN KEY (portal_entity_id) REFERENCES portal_entities(id) ON DELETE RESTRICT;
alter table "public"."portal_competitions" add constraint "portal_competitions_portal_modality_id_fkey" FOREIGN KEY (portal_modality_id) REFERENCES portal_modalities(id) ON DELETE RESTRICT;
CREATE INDEX portal_competitions_context_idx ON public.portal_competitions USING btree (portal_context_id);
CREATE INDEX portal_competitions_entity_idx ON public.portal_competitions USING btree (portal_entity_id);
CREATE UNIQUE INDEX portal_competitions_local_slug_unique_idx ON public.portal_competitions USING btree (portal_entity_id, portal_context_id, slug) WHERE (slug IS NOT NULL);
CREATE INDEX portal_competitions_modality_idx ON public.portal_competitions USING btree (portal_modality_id);
CREATE INDEX portal_competitions_status_idx ON public.portal_competitions USING btree (status);
alter table "public"."portal_competitions" enable row level security;
alter table "public"."portal_competitions" owner to "postgres";
revoke all on table "public"."portal_competitions" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_competitions" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_competitions" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_competitions" to "service_role";
comment on column "public"."portal_competitions"."portal_modality_id" is 'Formal modality link. portal_competitions.modality remains available as legacy/fallback text.';
alter table "public"."portal_contexts" add constraint "portal_contexts_portal_entity_id_fkey" FOREIGN KEY (portal_entity_id) REFERENCES portal_entities(id) ON DELETE RESTRICT;
CREATE INDEX portal_contexts_entity_idx ON public.portal_contexts USING btree (portal_entity_id);
CREATE INDEX portal_contexts_status_idx ON public.portal_contexts USING btree (status);
alter table "public"."portal_contexts" enable row level security;
alter table "public"."portal_contexts" owner to "postgres";
revoke all on table "public"."portal_contexts" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_contexts" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_contexts" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_contexts" to "service_role";
CREATE UNIQUE INDEX portal_entities_slug_unique_idx ON public.portal_entities USING btree (slug) WHERE (slug IS NOT NULL);
alter table "public"."portal_entities" enable row level security;
alter table "public"."portal_entities" owner to "postgres";
revoke all on table "public"."portal_entities" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_entities" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_entities" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_entities" to "service_role";
alter table "public"."portal_modalities" add constraint "portal_modalities_catalog_modality_id_fkey" FOREIGN KEY (catalog_modality_id) REFERENCES portal_modality_catalog(id) ON DELETE RESTRICT;
alter table "public"."portal_modalities" add constraint "portal_modalities_portal_context_id_fkey" FOREIGN KEY (portal_context_id) REFERENCES portal_contexts(id) ON DELETE RESTRICT;
alter table "public"."portal_modalities" add constraint "portal_modalities_portal_entity_id_fkey" FOREIGN KEY (portal_entity_id) REFERENCES portal_entities(id) ON DELETE RESTRICT;
CREATE INDEX portal_modalities_catalog_idx ON public.portal_modalities USING btree (catalog_modality_id);
CREATE UNIQUE INDEX portal_modalities_context_catalog_unique_idx ON public.portal_modalities USING btree (portal_entity_id, portal_context_id, catalog_modality_id) WHERE (catalog_modality_id IS NOT NULL);
CREATE INDEX portal_modalities_context_idx ON public.portal_modalities USING btree (portal_context_id);
CREATE UNIQUE INDEX portal_modalities_context_slug_unique_idx ON public.portal_modalities USING btree (portal_entity_id, portal_context_id, slug) WHERE (slug IS NOT NULL);
CREATE INDEX portal_modalities_entity_idx ON public.portal_modalities USING btree (portal_entity_id);
CREATE INDEX portal_modalities_order_idx ON public.portal_modalities USING btree (display_order);
CREATE INDEX portal_modalities_status_idx ON public.portal_modalities USING btree (status);
alter table "public"."portal_modalities" enable row level security;
alter table "public"."portal_modalities" owner to "postgres";
revoke all on table "public"."portal_modalities" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_modalities" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_modalities" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_modalities" to "service_role";
comment on table "public"."portal_modalities" is 'Modalities/sports activated for a Portal entity within a specific context.';
comment on column "public"."portal_modalities"."catalog_modality_id" is 'Optional link to canonical modality catalogue.';
comment on column "public"."portal_modalities"."local_code" is 'Optional local code used by the school/entity.';
CREATE UNIQUE INDEX portal_modality_catalog_code_unique_idx ON public.portal_modality_catalog USING btree (lower(code));
CREATE INDEX portal_modality_catalog_status_idx ON public.portal_modality_catalog USING btree (status);
alter table "public"."portal_modality_catalog" enable row level security;
alter table "public"."portal_modality_catalog" owner to "postgres";
revoke all on table "public"."portal_modality_catalog" from public, anon, authenticated, service_role;
grant TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_modality_catalog" to "anon";
grant SELECT, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_modality_catalog" to "authenticated";
grant INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN on table "public"."portal_modality_catalog" to "service_role";
comment on table "public"."portal_modality_catalog" is 'Canonical catalogue of sports/modalities used by Portal das Escolas.';
comment on column "public"."portal_modality_catalog"."code" is 'Stable canonical code, for example football, futsal, athletics, swimming, chess.';
comment on column "public"."portal_modality_catalog"."modality_family" is 'Optional grouping such as team_sport, individual_sport, racket_sport, mind_sport, multi_sport.';
comment on column "public"."portal_modality_catalog"."default_event_model" is 'Suggested default event model, for example match, race, field_event, tournament_round.';
comment on column "public"."portal_modality_catalog"."default_result_model" is 'Suggested default result model, for example score, sets, time, distance, ranking, points.';
alter function "public"."remove_deleted_editorial_source_from_matchday_bank"() owner to "postgres";
revoke all on function "public"."remove_deleted_editorial_source_from_matchday_bank"() from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."remove_deleted_editorial_source_from_matchday_bank"() to "service_role";
comment on function "public"."remove_deleted_editorial_source_from_matchday_bank"() is 'Depois de a aplicação autorizar a eliminação sem vínculos públicos, remove Últimas ainda ligadas pelo URL, Seleção manual, estado temático, referências internas de composição e Banco da identidade editorial eliminada.';
alter function "public"."sync_matchday_zone_row_to_bank"() owner to "postgres";
revoke all on function "public"."sync_matchday_zone_row_to_bank"() from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."sync_matchday_zone_row_to_bank"() to "service_role";
comment on function "public"."sync_matchday_zone_row_to_bank"() is 'Synchronizes ordinary publication surfaces to contextual Bank participation. Exact private v18 carryover writes are inert because Bank was already materialized from its persistent source identity map.';
alter function "public"."newsroom_protect_editorial_dossier_source_frozen_identity"() owner to "postgres";
revoke all on function "public"."newsroom_protect_editorial_dossier_source_frozen_identity"() from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."newsroom_protect_editorial_dossier_source_frozen_identity"() to "service_role";
alter function "public"."newsroom_protect_editorial_plan_profile_pin"() owner to "postgres";
revoke all on function "public"."newsroom_protect_editorial_plan_profile_pin"() from public, anon, authenticated, service_role;
alter function "public"."newsroom_protect_editorial_profile"() owner to "postgres";
revoke all on function "public"."newsroom_protect_editorial_profile"() from public, anon, authenticated, service_role;
alter function "public"."newsroom_reject_editorial_profile_version_mutation"() owner to "postgres";
revoke all on function "public"."newsroom_reject_editorial_profile_version_mutation"() from public, anon, authenticated, service_role;
alter function "public"."newsroom_reject_snapshot_mutation"() owner to "postgres";
revoke all on function "public"."newsroom_reject_snapshot_mutation"() from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."newsroom_reject_snapshot_mutation"() to "service_role";
alter function "public"."newsroom_save_editorial_dossier_article_plan"(p_dossier_id uuid, p_article_plan_id uuid, p_working_title text, p_status text, p_sort_order integer, p_article_kind text, p_length_mode text, p_editorial_instructions text, p_dossier_source_ids uuid[]) owner to "postgres";
revoke all on function "public"."newsroom_save_editorial_dossier_article_plan"(p_dossier_id uuid, p_article_plan_id uuid, p_working_title text, p_status text, p_sort_order integer, p_article_kind text, p_length_mode text, p_editorial_instructions text, p_dossier_source_ids uuid[]) from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."newsroom_save_editorial_dossier_article_plan"(p_dossier_id uuid, p_article_plan_id uuid, p_working_title text, p_status text, p_sort_order integer, p_article_kind text, p_length_mode text, p_editorial_instructions text, p_dossier_source_ids uuid[]) to "service_role";
comment on function "public"."newsroom_save_editorial_dossier_article_plan"(p_dossier_id uuid, p_article_plan_id uuid, p_working_title text, p_status text, p_sort_order integer, p_article_kind text, p_length_mode text, p_editorial_instructions text, p_dossier_source_ids uuid[]) is 'Atomically creates or updates one dossier article plan and its ordered frozen-source assignments. Cancelled plans preserve their assignments.';
alter function "public"."newsroom_set_article_updated_at"() owner to "postgres";
revoke all on function "public"."newsroom_set_article_updated_at"() from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."newsroom_set_article_updated_at"() to "service_role";
alter function "public"."newsroom_set_editorial_dossier_updated_at"() owner to "postgres";
revoke all on function "public"."newsroom_set_editorial_dossier_updated_at"() from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."newsroom_set_editorial_dossier_updated_at"() to "service_role";
alter function "public"."normalize_team_identity_v1"(p_value text) owner to "postgres";
revoke all on function "public"."normalize_team_identity_v1"(p_value text) from public, anon, authenticated, service_role;
alter function "public"."portal_can_select_scope"(target_portal_entity_id uuid, target_portal_context_id uuid, target_portal_competition_id uuid) owner to "postgres";
revoke all on function "public"."portal_can_select_scope"(target_portal_entity_id uuid, target_portal_context_id uuid, target_portal_competition_id uuid) from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."portal_can_select_scope"(target_portal_entity_id uuid, target_portal_context_id uuid, target_portal_competition_id uuid) to "authenticated";
grant EXECUTE on function "public"."portal_can_select_scope"(target_portal_entity_id uuid, target_portal_context_id uuid, target_portal_competition_id uuid) to "service_role";
alter function "public"."rls_auto_enable"() owner to "postgres";
revoke all on function "public"."rls_auto_enable"() from public, anon, authenticated, service_role;
alter function "public"."set_editorial_contents_updated_at"() owner to "postgres";
alter function "public"."set_matchday_editorial_bank_items_updated_at"() owner to "postgres";
alter function "public"."set_matchday_hierarchical_composition_slots_updated_at"() owner to "postgres";
alter function "public"."set_matchday_reference_composition_items_updated_at"() owner to "postgres";
alter function "public"."set_matchday_reference_compositions_updated_at"() owner to "postgres";
alter function "public"."sync_match_scheduled_date"() owner to "postgres";
alter function "public"."sync_published_editorial_source_to_matchday_bank"() owner to "postgres";
revoke all on function "public"."sync_published_editorial_source_to_matchday_bank"() from public, anon, authenticated, service_role;
grant EXECUTE on function "public"."sync_published_editorial_source_to_matchday_bank"() to "service_role";
comment on function "public"."sync_published_editorial_source_to_matchday_bank"() is 'Trigger comum que garante no banco histÃ³rico artigos e conteÃºdos publicados com matchday_id.';
alter function "public"."set_site_editorial_updated_at"() owner to "postgres";
create policy "Public read broadcast channels" on "public"."broadcast_channels" as permissive for select to public using (true);
create policy "Public read competitions" on "public"."competitions" as permissive for select to public using (true);
create policy "countries_select_public" on "public"."countries" as permissive for select to public using (true);
CREATE TRIGGER remove_deleted_editorial_article_from_matchday_bank AFTER DELETE ON editorial_articles FOR EACH ROW EXECUTE FUNCTION remove_deleted_editorial_source_from_matchday_bank();
CREATE TRIGGER sync_published_editorial_article_to_matchday_bank AFTER INSERT OR UPDATE ON editorial_articles FOR EACH ROW EXECUTE FUNCTION sync_published_editorial_source_to_matchday_bank();
CREATE TRIGGER remove_deleted_editorial_content_from_matchday_bank AFTER DELETE ON editorial_contents FOR EACH ROW EXECUTE FUNCTION remove_deleted_editorial_source_from_matchday_bank();
CREATE TRIGGER set_editorial_contents_updated_at BEFORE UPDATE ON editorial_contents FOR EACH ROW EXECUTE FUNCTION set_editorial_contents_updated_at();
CREATE TRIGGER sync_published_editorial_content_to_matchday_bank AFTER INSERT OR UPDATE ON editorial_contents FOR EACH ROW EXECUTE FUNCTION sync_published_editorial_source_to_matchday_bank();
CREATE TRIGGER set_matchday_editorial_bank_items_updated_at BEFORE UPDATE ON matchday_editorial_bank_items FOR EACH ROW EXECUTE FUNCTION set_matchday_editorial_bank_items_updated_at();
CREATE TRIGGER set_matchday_hierarchical_composition_slots_updated_at BEFORE UPDATE ON matchday_hierarchical_composition_slots FOR EACH ROW EXECUTE FUNCTION set_matchday_hierarchical_composition_slots_updated_at();
CREATE TRIGGER sync_matchday_latest_news_to_bank AFTER INSERT OR UPDATE ON matchday_latest_news FOR EACH ROW EXECUTE FUNCTION sync_matchday_zone_row_to_bank();
CREATE TRIGGER set_matchday_reference_composition_items_updated_at BEFORE UPDATE ON matchday_reference_composition_items FOR EACH ROW EXECUTE FUNCTION set_matchday_reference_composition_items_updated_at();
CREATE TRIGGER set_matchday_reference_compositions_updated_at BEFORE UPDATE ON matchday_reference_compositions FOR EACH ROW EXECUTE FUNCTION set_matchday_reference_compositions_updated_at();
create policy "Public read matchdays" on "public"."matchdays" as permissive for select to public using (true);
CREATE TRIGGER sync_match_scheduled_date_before_write BEFORE INSERT OR UPDATE OF kickoff_at, scheduled_date ON matches FOR EACH ROW EXECUTE FUNCTION sync_match_scheduled_date();
create policy "Public read matches" on "public"."matches" as permissive for select to public using (true);
CREATE TRIGGER newsroom_article_snapshots_immutable BEFORE DELETE OR UPDATE ON newsroom_article_snapshots FOR EACH ROW EXECUTE FUNCTION newsroom_reject_snapshot_mutation();
CREATE TRIGGER newsroom_articles_set_updated_at BEFORE UPDATE ON newsroom_articles FOR EACH ROW EXECUTE FUNCTION newsroom_set_article_updated_at();
CREATE TRIGGER newsroom_editorial_dossier_article_plan_sources_set_updated_at BEFORE UPDATE ON newsroom_editorial_dossier_article_plan_sources FOR EACH ROW EXECUTE FUNCTION newsroom_set_editorial_dossier_updated_at();
CREATE TRIGGER newsroom_editorial_dossier_article_plans_profile_pin_immutable BEFORE UPDATE ON newsroom_editorial_dossier_article_plans FOR EACH ROW EXECUTE FUNCTION newsroom_protect_editorial_plan_profile_pin();
CREATE TRIGGER newsroom_editorial_dossier_article_plans_set_updated_at BEFORE UPDATE ON newsroom_editorial_dossier_article_plans FOR EACH ROW EXECUTE FUNCTION newsroom_set_editorial_dossier_updated_at();
CREATE TRIGGER newsroom_editorial_dossier_sources_protect_frozen_identity BEFORE UPDATE OF newsroom_article_id, newsroom_snapshot_id, title_snapshot, published_at_snapshot ON newsroom_editorial_dossier_sources FOR EACH ROW EXECUTE FUNCTION newsroom_protect_editorial_dossier_source_frozen_identity();
CREATE TRIGGER newsroom_editorial_dossier_sources_set_updated_at BEFORE UPDATE ON newsroom_editorial_dossier_sources FOR EACH ROW EXECUTE FUNCTION newsroom_set_editorial_dossier_updated_at();
CREATE TRIGGER newsroom_editorial_dossiers_set_updated_at BEFORE UPDATE ON newsroom_editorial_dossiers FOR EACH ROW EXECUTE FUNCTION newsroom_set_editorial_dossier_updated_at();
CREATE TRIGGER newsroom_editorial_profile_versions_immutable BEFORE DELETE OR UPDATE ON newsroom_editorial_profile_versions FOR EACH ROW EXECUTE FUNCTION newsroom_reject_editorial_profile_version_mutation();
CREATE TRIGGER newsroom_editorial_profiles_protected BEFORE UPDATE ON newsroom_editorial_profiles FOR EACH ROW EXECUTE FUNCTION newsroom_protect_editorial_profile();
CREATE TRIGGER newsroom_editorial_review_states_set_updated_at BEFORE UPDATE ON newsroom_editorial_review_states FOR EACH ROW EXECUTE FUNCTION newsroom_set_article_updated_at();
create policy "Public read seasons" on "public"."seasons" as permissive for select to public using (true);
create policy "Public read teams" on "public"."teams" as permissive for select to public using (true);
create policy "portal_permissions_select_own_active" on "public"."portal_permissions" as permissive for select to "authenticated" using (((status = 'active'::text) AND (EXISTS ( SELECT 1
   FROM portal_users u
  WHERE ((u.id = portal_permissions.portal_user_id) AND (u.auth_user_id = auth.uid()) AND (u.status = 'active'::text))))));
create policy "portal_users_select_own_active" on "public"."portal_users" as permissive for select to "authenticated" using (((auth_user_id = auth.uid()) AND (status = 'active'::text)));
CREATE TRIGGER set_site_editorial_roundup_items_updated_at BEFORE UPDATE ON site_editorial_roundup_items FOR EACH ROW EXECUTE FUNCTION set_site_editorial_updated_at();
create policy "portal_competitions_select_by_scope" on "public"."portal_competitions" as permissive for select to "authenticated" using (portal_can_select_scope(portal_entity_id, portal_context_id, id));
create policy "portal_contexts_select_by_scope" on "public"."portal_contexts" as permissive for select to "authenticated" using (portal_can_select_scope(portal_entity_id, id, NULL::uuid));
create policy "portal_entities_select_by_scope" on "public"."portal_entities" as permissive for select to "authenticated" using (portal_can_select_scope(id, NULL::uuid, NULL::uuid));
create policy "portal_modalities_select_by_scope" on "public"."portal_modalities" as permissive for select to "authenticated" using (portal_can_select_scope(portal_entity_id, portal_context_id, NULL::uuid));
create policy "portal_modality_catalog_select_authenticated" on "public"."portal_modality_catalog" as permissive for select to "authenticated" using ((status = 'active'::text));
set check_function_bodies = on;
