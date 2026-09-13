-- Mesa 2C: normalized, frozen production contexts.
-- Forward-only and opt-in. Historical workspaces and publications are not
-- rewritten and continue to use their existing contracts.
begin;

do $preflight$
begin
  if to_regclass('public.newsroom_mesa_production_contexts') is null
    or to_regclass('public.newsroom_editorial_dossier_sources') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or to_regclass('public.newsroom_editorial_dossier_article_plan_sources') is null
    or to_regclass('public.newsroom_mesa_output_publications') is null
    or to_regclass('public.newsroom_mesa_output_source_usage') is null
    or to_regclass('public.newsroom_editorial_source_packages') is null
    or to_regclass('public.newsroom_editorial_themes') is null
    or to_regclass('public.newsroom_editorial_theme_sources') is null
    or to_regprocedure('public.newsroom_prepare_mesa_materials_v2(uuid,uuid,text,jsonb,jsonb)') is null
    or to_regprocedure('public.newsroom_mesa_normalize_refs_v2(jsonb)') is null
    or to_regprocedure('public.newsroom_set_editorial_theme_source_membership_v1(uuid,uuid,boolean)') is null
    or to_regprocedure('public.newsroom_acknowledge_theme_source_v1(uuid,uuid,uuid)') is null
    or to_regprocedure('public.newsroom_editorial_source_package_manifest_v5_valid(uuid,text,text,jsonb)') is null
    or to_regprocedure('public.newsroom_set_mesa_shared_outputs_v2(uuid,uuid[])') is null
    or to_regprocedure('public.newsroom_save_editorial_dossier_article_plan(uuid,uuid,text,text,integer,text,text,text,uuid[])') is null
    or to_regprocedure('public.newsroom_publish_mesa_output_v2(uuid,uuid,uuid,uuid[],jsonb)') is null
    or to_regprocedure('public.newsroom_mesa_consolidate_publication_v4(uuid)') is null
  then
    raise exception 'mesa-contexts-2c-preflight-authority-missing';
  end if;

  if to_regclass('public.newsroom_mesa_production_context_items') is not null
    or to_regclass('public.newsroom_mesa_production_context_sources') is not null
    or to_regclass('public.newsroom_mesa_article_plan_contexts') is not null
    or exists (
      select 1
      from information_schema.columns c
      where c.table_schema = 'public'
        and c.table_name = 'newsroom_mesa_output_publications'
        and c.column_name = 'production_context_id'
    )
  then
    raise exception 'mesa-contexts-2c-preflight-target-conflict';
  end if;
end;
$preflight$;

create table public.newsroom_mesa_production_context_items (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  context_kind text not null,
  source_newsroom_article_id uuid,
  theme_id uuid,
  title_snapshot text not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  constraint newsroom_mesa_context_items_workspace_fkey
    foreign key (dossier_id)
    references public.newsroom_mesa_production_contexts(dossier_id)
    on delete restrict,
  constraint newsroom_mesa_context_items_source_fkey
    foreign key (source_newsroom_article_id)
    references public.newsroom_articles(id)
    on delete restrict,
  constraint newsroom_mesa_context_items_theme_fkey
    foreign key (theme_id)
    references public.newsroom_editorial_themes(id)
    on delete restrict,
  constraint newsroom_mesa_context_items_workspace_id_key
    unique (dossier_id, id),
  constraint newsroom_mesa_context_items_workspace_order_key
    unique (dossier_id, sort_order),
  constraint newsroom_mesa_context_items_kind_check check (
    (
      context_kind = 'source'
      and source_newsroom_article_id is not null
      and theme_id is null
    )
    or
    (
      context_kind = 'theme'
      and source_newsroom_article_id is null
      and theme_id is not null
    )
  ),
  constraint newsroom_mesa_context_items_title_check
    check (btrim(title_snapshot) <> ''),
  constraint newsroom_mesa_context_items_order_check
    check (sort_order between 1 and 20)
);

create unique index newsroom_mesa_context_items_source_uidx
  on public.newsroom_mesa_production_context_items(
    dossier_id,
    source_newsroom_article_id
  )
  where context_kind = 'source';

create unique index newsroom_mesa_context_items_theme_uidx
  on public.newsroom_mesa_production_context_items(dossier_id, theme_id)
  where context_kind = 'theme';

create index newsroom_mesa_context_items_source_idx
  on public.newsroom_mesa_production_context_items(
    source_newsroom_article_id,
    dossier_id
  )
  where context_kind = 'source';

create index newsroom_mesa_context_items_theme_idx
  on public.newsroom_mesa_production_context_items(theme_id, dossier_id)
  where context_kind = 'theme';

create table public.newsroom_mesa_production_context_sources (
  dossier_id uuid not null,
  production_context_id uuid not null,
  dossier_source_id uuid not null,
  sort_order smallint not null,
  created_at timestamptz not null default now(),
  constraint newsroom_mesa_context_sources_pkey
    primary key (dossier_id, production_context_id, dossier_source_id),
  constraint newsroom_mesa_context_sources_order_key
    unique (dossier_id, production_context_id, sort_order),
  constraint newsroom_mesa_context_sources_context_fkey
    foreign key (dossier_id, production_context_id)
    references public.newsroom_mesa_production_context_items(dossier_id, id)
    on delete restrict,
  constraint newsroom_mesa_context_sources_dossier_source_fkey
    foreign key (dossier_id, dossier_source_id)
    references public.newsroom_editorial_dossier_sources(dossier_id, id)
    on delete restrict,
  constraint newsroom_mesa_context_sources_order_check
    check (sort_order between 1 and 20)
);

create index newsroom_mesa_context_sources_source_idx
  on public.newsroom_mesa_production_context_sources(
    dossier_id,
    dossier_source_id,
    production_context_id
  );

create table public.newsroom_mesa_article_plan_contexts (
  dossier_id uuid not null,
  article_plan_id uuid not null,
  production_context_id uuid not null,
  assigned_at timestamptz not null default now(),
  constraint newsroom_mesa_plan_contexts_pkey
    primary key (dossier_id, article_plan_id),
  constraint newsroom_mesa_plan_contexts_output_key
    unique (dossier_id, article_plan_id, production_context_id),
  constraint newsroom_mesa_plan_contexts_plan_fkey
    foreign key (dossier_id, article_plan_id)
    references public.newsroom_editorial_dossier_article_plans(dossier_id, id)
    on delete restrict,
  constraint newsroom_mesa_plan_contexts_context_fkey
    foreign key (dossier_id, production_context_id)
    references public.newsroom_mesa_production_context_items(dossier_id, id)
    on delete restrict
);

create index newsroom_mesa_plan_contexts_context_idx
  on public.newsroom_mesa_article_plan_contexts(
    dossier_id,
    production_context_id,
    article_plan_id
  );

alter table public.newsroom_mesa_output_publications
  add column production_context_id uuid;

alter table public.newsroom_mesa_output_publications
  add constraint newsroom_mesa_output_publications_plan_context_fkey
  foreign key (dossier_id, article_plan_id, production_context_id)
  references public.newsroom_mesa_article_plan_contexts(
    dossier_id,
    article_plan_id,
    production_context_id
  )
  on delete restrict;

alter table public.newsroom_mesa_output_publications
  drop constraint newsroom_mesa_output_publications_source_scope_check;

alter table public.newsroom_mesa_output_publications
  add constraint newsroom_mesa_output_publications_source_scope_check check (
    (
      source_scope is null
      and production_context_id is null
      and origin_kind is not null
      and (
        (
          origin_kind = 'source'
          and origin_dossier_source_id is not null
          and material_key is null
          and material_version_id is null
        )
        or
        (
          origin_kind = 'material'
          and origin_dossier_source_id is null
          and material_key is not null
          and material_version_id is not null
        )
      )
    )
    or
    (
      source_scope is not null
      and
      source_scope = 'workspace'
      and production_context_id is null
      and origin_kind is null
      and origin_dossier_source_id is null
      and material_key is null
      and material_version_id is null
    )
    or
    (
      source_scope is not null
      and
      source_scope = 'context'
      and production_context_id is not null
      and origin_kind is null
      and origin_dossier_source_id is null
      and material_key is null
      and material_version_id is null
    )
  );

comment on table public.newsroom_mesa_production_context_items is
  'Opt-in 2C editorial contexts inside the existing technical production workspace. No row means a historical/context-less workspace.';
comment on table public.newsroom_mesa_production_context_sources is
  'Immutable exact source/snapshot set frozen for one production context through dossier_source_id.';
comment on table public.newsroom_mesa_article_plan_contexts is
  'One frozen production context assigned to one Article Plan. Multiple plans may reuse the same context.';
comment on column public.newsroom_mesa_output_publications.production_context_id is
  'Required only when source_scope=context. NULL preserves historical and workspace-scoped publications.';

do $security$
declare
  v_table text;
begin
  foreach v_table in array array[
    'newsroom_mesa_production_context_items',
    'newsroom_mesa_production_context_sources',
    'newsroom_mesa_article_plan_contexts'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
    execute format(
      'revoke all on public.%I from public, anon, authenticated, service_role',
      v_table
    );
    execute format('grant select on public.%I to service_role', v_table);
  end loop;
end;
$security$;

create function public.newsroom_mesa_context_item_sources_valid_v1(
  p_dossier_id uuid,
  p_production_context_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case item.context_kind
    when 'source' then
      (
        select count(*) = 1
          and min(dossier_source.newsroom_article_id::text)
            = item.source_newsroom_article_id::text
        from public.newsroom_mesa_production_context_sources context_source
        join public.newsroom_editorial_dossier_sources dossier_source
          on dossier_source.dossier_id = context_source.dossier_id
          and dossier_source.id = context_source.dossier_source_id
        where context_source.dossier_id = item.dossier_id
          and context_source.production_context_id = item.id
      )
    when 'theme' then exists (
      select 1
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = item.dossier_id
        and context_source.production_context_id = item.id
    )
    else false
  end
  from public.newsroom_mesa_production_context_items item
  where item.dossier_id = p_dossier_id
    and item.id = p_production_context_id;
$function$;

revoke all on function public.newsroom_mesa_context_item_sources_valid_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.newsroom_assert_mesa_context_item_sources_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_dossier_id uuid;
  v_context_id uuid;
begin
  if tg_table_name = 'newsroom_mesa_production_context_items' then
    v_dossier_id := new.dossier_id;
    v_context_id := new.id;
  else
    v_dossier_id := new.dossier_id;
    v_context_id := new.production_context_id;
  end if;

  if not coalesce(public.newsroom_mesa_context_item_sources_valid_v1(
    v_dossier_id,
    v_context_id
  ), false) then
    raise exception 'mesa-production-context-source-set-invalid'
      using errcode = '23514';
  end if;
  return null;
end;
$function$;

revoke all on function public.newsroom_assert_mesa_context_item_sources_v1()
  from public, anon, authenticated, service_role;

create constraint trigger newsroom_mesa_context_item_source_set_v1
after insert on public.newsroom_mesa_production_context_items
deferrable initially deferred
for each row execute function public.newsroom_assert_mesa_context_item_sources_v1();

create constraint trigger newsroom_mesa_context_source_set_v1
after insert on public.newsroom_mesa_production_context_sources
deferrable initially deferred
for each row execute function public.newsroom_assert_mesa_context_item_sources_v1();

create function public.newsroom_reject_mesa_context_mutation_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  raise exception 'mesa-production-context-immutable'
    using errcode = '23514';
end;
$function$;

revoke all on function public.newsroom_reject_mesa_context_mutation_v1()
  from public, anon, authenticated, service_role;

create trigger newsroom_mesa_context_items_immutable_v1
before update or delete on public.newsroom_mesa_production_context_items
for each row execute function public.newsroom_reject_mesa_context_mutation_v1();

create trigger newsroom_mesa_context_sources_immutable_v1
before update or delete on public.newsroom_mesa_production_context_sources
for each row execute function public.newsroom_reject_mesa_context_mutation_v1();

create function public.newsroom_protect_frozen_dossier_source_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op = 'DELETE' and exists (
    select 1
    from public.newsroom_mesa_production_context_sources frozen
    where frozen.dossier_id = old.dossier_id
      and frozen.dossier_source_id = old.id
  ) then
    raise exception 'mesa-production-context-source-immutable'
      using errcode = '23514';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;

  if exists (
    select 1
    from public.newsroom_mesa_production_context_sources frozen
    where frozen.dossier_id = old.dossier_id
      and frozen.dossier_source_id = old.id
  ) and (
    new.dossier_id is distinct from old.dossier_id
    or new.newsroom_article_id is distinct from old.newsroom_article_id
    or new.newsroom_snapshot_id is distinct from old.newsroom_snapshot_id
    or new.included is distinct from old.included
  ) then
    raise exception 'mesa-production-context-source-immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

revoke all on function public.newsroom_protect_frozen_dossier_source_v1()
  from public, anon, authenticated, service_role;

create trigger newsroom_mesa_protect_frozen_dossier_source_v1
before update or delete on public.newsroom_editorial_dossier_sources
for each row execute function public.newsroom_protect_frozen_dossier_source_v1();

create function public.newsroom_mesa_plan_context_sources_valid_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_production_context_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select
    p_dossier_id is not null
    and p_article_plan_id is not null
    and p_production_context_id is not null
    and exists (
      select 1
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = p_dossier_id
        and context_source.production_context_id = p_production_context_id
    )
    and not exists (
      select context_source.dossier_source_id
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = p_dossier_id
        and context_source.production_context_id = p_production_context_id
      except
      select plan_source.dossier_source_id
      from public.newsroom_editorial_dossier_article_plan_sources plan_source
      where plan_source.dossier_id = p_dossier_id
        and plan_source.article_plan_id = p_article_plan_id
    )
    and not exists (
      select plan_source.dossier_source_id
      from public.newsroom_editorial_dossier_article_plan_sources plan_source
      where plan_source.dossier_id = p_dossier_id
        and plan_source.article_plan_id = p_article_plan_id
      except
      select context_source.dossier_source_id
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = p_dossier_id
        and context_source.production_context_id = p_production_context_id
    );
$function$;

revoke all on function public.newsroom_mesa_plan_context_sources_valid_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.newsroom_assert_mesa_plan_context_sources_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_dossier_id uuid;
  v_article_plan_id uuid;
  v_assignment public.newsroom_mesa_article_plan_contexts%rowtype;
begin
  v_dossier_id := case when tg_op = 'DELETE' then old.dossier_id else new.dossier_id end;
  v_article_plan_id := case when tg_op = 'DELETE' then old.article_plan_id else new.article_plan_id end;

  for v_assignment in
    select assignment.*
    from public.newsroom_mesa_article_plan_contexts assignment
    where assignment.dossier_id = v_dossier_id
      and assignment.article_plan_id = v_article_plan_id
  loop
    if not public.newsroom_mesa_plan_context_sources_valid_v1(
      v_assignment.dossier_id,
      v_assignment.article_plan_id,
      v_assignment.production_context_id
    ) then
      raise exception 'mesa-article-plan-context-sources-invalid'
        using errcode = '23514';
    end if;
  end loop;

  if tg_op = 'UPDATE'
    and (
      old.dossier_id is distinct from new.dossier_id
      or old.article_plan_id is distinct from new.article_plan_id
    )
  then
    for v_assignment in
      select assignment.*
      from public.newsroom_mesa_article_plan_contexts assignment
      where assignment.dossier_id = old.dossier_id
        and assignment.article_plan_id = old.article_plan_id
    loop
      if not public.newsroom_mesa_plan_context_sources_valid_v1(
        v_assignment.dossier_id,
        v_assignment.article_plan_id,
        v_assignment.production_context_id
      ) then
        raise exception 'mesa-article-plan-context-sources-invalid'
          using errcode = '23514';
      end if;
    end loop;
  end if;

  return null;
end;
$function$;

revoke all on function public.newsroom_assert_mesa_plan_context_sources_v1()
  from public, anon, authenticated, service_role;

create constraint trigger newsroom_mesa_plan_sources_match_context_v1
after insert or update or delete
on public.newsroom_editorial_dossier_article_plan_sources
deferrable initially deferred
for each row execute function public.newsroom_assert_mesa_plan_context_sources_v1();

create function public.newsroom_assert_mesa_plan_context_assignment_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not public.newsroom_mesa_plan_context_sources_valid_v1(
    new.dossier_id,
    new.article_plan_id,
    new.production_context_id
  ) then
    raise exception 'mesa-article-plan-context-sources-invalid'
      using errcode = '23514';
  end if;
  return null;
end;
$function$;

revoke all on function public.newsroom_assert_mesa_plan_context_assignment_v1()
  from public, anon, authenticated, service_role;

create constraint trigger newsroom_mesa_plan_context_assignment_valid_v1
after insert or update
on public.newsroom_mesa_article_plan_contexts
deferrable initially deferred
for each row execute function public.newsroom_assert_mesa_plan_context_assignment_v1();

create function public.newsroom_protect_bound_mesa_plan_context_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if exists (
    select 1
    from public.newsroom_mesa_output_publications publication
    where publication.dossier_id = old.dossier_id
      and publication.article_plan_id = old.article_plan_id
  ) or exists (
    select 1
    from public.newsroom_editorial_source_packages package,
      jsonb_array_elements(coalesce(package.manifest -> 'outputs', '[]'::jsonb)) output
    where output -> 'articlePlan' ->> 'sourceScope' = 'context'
      and lower(output -> 'articlePlan' ->> 'dossierId') = old.dossier_id::text
      and lower(output -> 'articlePlan' ->> 'articlePlanId') = old.article_plan_id::text
  ) then
    raise exception 'mesa-article-plan-context-already-bound'
      using errcode = '23514';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

revoke all on function public.newsroom_protect_bound_mesa_plan_context_v1()
  from public, anon, authenticated, service_role;

create trigger newsroom_mesa_protect_bound_plan_context_v1
before update or delete on public.newsroom_mesa_article_plan_contexts
for each row execute function public.newsroom_protect_bound_mesa_plan_context_v1();

create function public.newsroom_mesa_output_source_in_context_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_dossier_source_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when publication.source_scope is distinct from 'context' then true
    else exists (
      select 1
      from public.newsroom_mesa_production_context_sources context_source
      where context_source.dossier_id = publication.dossier_id
        and context_source.production_context_id = publication.production_context_id
        and context_source.dossier_source_id = p_dossier_source_id
    )
  end
  from public.newsroom_mesa_output_publications publication
  where publication.dossier_id = p_dossier_id
    and publication.article_plan_id = p_article_plan_id;
$function$;

revoke all on function public.newsroom_mesa_output_source_in_context_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.newsroom_assert_mesa_output_source_scope_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if not coalesce(public.newsroom_mesa_output_source_in_context_v1(
    new.dossier_id,
    new.article_plan_id,
    new.dossier_source_id
  ), false) then
    raise exception 'mesa-output-source-outside-context'
      using errcode = '23514';
  end if;
  return new;
end;
$function$;

revoke all on function public.newsroom_assert_mesa_output_source_scope_v1()
  from public, anon, authenticated, service_role;

create trigger newsroom_mesa_output_usage_context_scope_v1
before insert or update on public.newsroom_mesa_output_source_usage
for each row execute function public.newsroom_assert_mesa_output_source_scope_v1();

create function public.newsroom_mesa_context_output_usage_valid_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $function$
  select case
    when not exists (
      select 1
      from public.newsroom_mesa_output_publications publication
      where publication.dossier_id = p_dossier_id
        and publication.article_plan_id = p_article_plan_id
        and publication.source_scope = 'context'
    ) then true
    else
      exists (
        select 1
        from public.newsroom_mesa_output_source_usage usage
        where usage.dossier_id = p_dossier_id
          and usage.article_plan_id = p_article_plan_id
      )
      and not exists (
        select 1
        from public.newsroom_mesa_output_source_usage usage
        where usage.dossier_id = p_dossier_id
          and usage.article_plan_id = p_article_plan_id
          and not public.newsroom_mesa_output_source_in_context_v1(
            usage.dossier_id,
            usage.article_plan_id,
            usage.dossier_source_id
          )
      )
  end;
$function$;

revoke all on function public.newsroom_mesa_context_output_usage_valid_v1(uuid, uuid)
  from public, anon, authenticated, service_role;

create function public.newsroom_assert_mesa_context_output_usage_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if tg_op <> 'DELETE' then
    if not public.newsroom_mesa_context_output_usage_valid_v1(
      new.dossier_id,
      new.article_plan_id
    ) then
      raise exception 'mesa-output-context-usage-invalid'
        using errcode = '23514';
    end if;
  end if;

  if tg_op <> 'INSERT' then
    if not public.newsroom_mesa_context_output_usage_valid_v1(
      old.dossier_id,
      old.article_plan_id
    ) then
      raise exception 'mesa-output-context-usage-invalid'
        using errcode = '23514';
    end if;
  end if;

  return null;
end;
$function$;

revoke all on function public.newsroom_assert_mesa_context_output_usage_v1()
  from public, anon, authenticated, service_role;

create constraint trigger newsroom_mesa_context_output_usage_valid_v1
after insert or update on public.newsroom_mesa_output_publications
deferrable initially deferred
for each row execute function public.newsroom_assert_mesa_context_output_usage_v1();

create constraint trigger newsroom_mesa_context_usage_stays_valid_v1
after insert or update or delete on public.newsroom_mesa_output_source_usage
deferrable initially deferred
for each row execute function public.newsroom_assert_mesa_context_output_usage_v1();

create function public.newsroom_editorial_source_package_manifest_v5_context_valid(
  p_id uuid,
  p_package_year text,
  p_package_month text,
  p_manifest jsonb
)
returns boolean
language plpgsql
immutable
strict
parallel safe
set search_path = ''
as $function$
declare
  v_output jsonb;
  v_source_id jsonb;
  v_context_source_ids text[];
  v_transformed_outputs jsonb;
  v_workspace_manifest jsonb;
  v_uuid_pattern constant text :=
    '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
begin
  if jsonb_typeof(p_manifest -> 'outputs') is distinct from 'array'
    or jsonb_array_length(p_manifest -> 'outputs') not between 1 and 30
  then
    return false;
  end if;

  for v_output in
    select output.value
    from jsonb_array_elements(p_manifest -> 'outputs') output(value)
  loop
    if jsonb_typeof(v_output -> 'articlePlan') is distinct from 'object'
      or v_output -> 'articlePlan' ->> 'sourceScope' is distinct from 'context'
      or jsonb_typeof(v_output -> 'articlePlan' -> 'contextId') is distinct from 'string'
      or lower(v_output -> 'articlePlan' ->> 'contextId') !~ v_uuid_pattern
      or jsonb_typeof(v_output -> 'contextSourceIds') is distinct from 'array'
      or jsonb_array_length(v_output -> 'contextSourceIds') not between 1 and 20
    then
      return false;
    end if;

    v_context_source_ids := '{}'::text[];
    for v_source_id in
      select source_id.value
      from jsonb_array_elements(v_output -> 'contextSourceIds') source_id(value)
    loop
      if jsonb_typeof(v_source_id) is distinct from 'string'
        or lower(v_source_id #>> '{}') !~ v_uuid_pattern
        or lower(v_source_id #>> '{}') = any(v_context_source_ids)
        or not exists (
          select 1
          from jsonb_array_elements(p_manifest -> 'entries') entry(value)
          where entry.value ->> 'status' = 'prepared'
            and lower(entry.value ->> 'provenanceSourceId') = lower(v_source_id #>> '{}')
        )
      then
        return false;
      end if;
      v_context_source_ids := v_context_source_ids || lower(v_source_id #>> '{}');
    end loop;
  end loop;

  select jsonb_agg(
    jsonb_set(
      output.value - 'contextSourceIds',
      '{articlePlan}',
      ((output.value -> 'articlePlan') - 'contextId')
        || jsonb_build_object('sourceScope', 'workspace')
    )
    order by output.ordinality
  )
  into v_transformed_outputs
  from jsonb_array_elements(p_manifest -> 'outputs')
    with ordinality output(value, ordinality);

  v_workspace_manifest := jsonb_set(
    p_manifest,
    '{outputs}',
    v_transformed_outputs
  );

  return public.newsroom_editorial_source_package_manifest_v5_valid(
    p_id,
    p_package_year,
    p_package_month,
    v_workspace_manifest
  );
exception
  when others then
    return false;
end;
$function$;

revoke all on function public.newsroom_editorial_source_package_manifest_v5_context_valid(
  uuid,
  text,
  text,
  jsonb
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_editorial_source_package_manifest_v5_context_valid(
  uuid,
  text,
  text,
  jsonb
) to service_role;

alter table public.newsroom_editorial_source_packages
  drop constraint newsroom_editorial_source_packages_manifest_check;

alter table public.newsroom_editorial_source_packages
  add constraint newsroom_editorial_source_packages_manifest_check check (
    case
      when manifest ->> 'version' = '5' then
        public.newsroom_editorial_source_package_manifest_v5_valid(
          id,
          package_year,
          package_month,
          manifest
        )
        or public.newsroom_editorial_source_package_manifest_v5_context_valid(
          id,
          package_year,
          package_month,
          manifest
        )
      when manifest ->> 'version' in ('2', '4') then
        jsonb_typeof(manifest) = 'object'
        and manifest ->> 'version' in ('2', '4')
        and manifest ->> 'packageId' = id::text
        and manifest ->> 'year' = package_year
        and manifest ->> 'month' = package_month
        and jsonb_typeof(manifest -> 'entries') = 'array'
        and (
          manifest ->> 'version' = '2'
          or (
            manifest ->> 'version' = '4'
            and jsonb_typeof(manifest -> 'outputs') = 'array'
            and jsonb_array_length(manifest -> 'outputs') between 1 and 30
          )
        )
      else false
    end
  );

create function public.newsroom_assert_mesa_context_package_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_output jsonb;
  v_dossier_id uuid;
  v_article_plan_id uuid;
  v_context_id uuid;
  v_declared_source_ids uuid[];
  v_frozen_source_ids uuid[];
begin
  if new.manifest ->> 'version' <> '5'
    or jsonb_typeof(new.manifest -> 'outputs') is distinct from 'array'
    or not exists (
      select 1
      from jsonb_array_elements(new.manifest -> 'outputs') output(value)
      where output.value -> 'articlePlan' ->> 'sourceScope' = 'context'
    )
  then
    return null;
  end if;

  if exists (
    select 1
    from jsonb_array_elements(new.manifest -> 'outputs') output(value)
    where output.value -> 'articlePlan' ->> 'sourceScope' is distinct from 'context'
  ) then
    raise exception 'mesa-context-package-mixed-source-scope'
      using errcode = '23514';
  end if;

  for v_output in
    select output.value
    from jsonb_array_elements(new.manifest -> 'outputs') output(value)
  loop
    begin
      v_dossier_id := (v_output -> 'articlePlan' ->> 'dossierId')::uuid;
      v_article_plan_id := (v_output -> 'articlePlan' ->> 'articlePlanId')::uuid;
      v_context_id := (v_output -> 'articlePlan' ->> 'contextId')::uuid;
    exception
      when others then
        raise exception 'mesa-context-package-reference-invalid'
          using errcode = '23514';
    end;

    if not exists (
      select 1
      from public.newsroom_mesa_article_plan_contexts assignment
      where assignment.dossier_id = v_dossier_id
        and assignment.article_plan_id = v_article_plan_id
        and assignment.production_context_id = v_context_id
    ) then
      raise exception 'mesa-context-package-assignment-invalid'
        using errcode = '23514';
    end if;

    select array_agg((source_id.value #>> '{}')::uuid order by (source_id.value #>> '{}')::uuid)
    into v_declared_source_ids
    from jsonb_array_elements(v_output -> 'contextSourceIds') source_id(value);

    select array_agg(context_source.dossier_source_id order by context_source.dossier_source_id)
    into v_frozen_source_ids
    from public.newsroom_mesa_production_context_sources context_source
    where context_source.dossier_id = v_dossier_id
      and context_source.production_context_id = v_context_id;

    if v_declared_source_ids is distinct from v_frozen_source_ids then
      raise exception 'mesa-context-package-source-set-invalid'
        using errcode = '23514';
    end if;
  end loop;

  return null;
end;
$function$;

revoke all on function public.newsroom_assert_mesa_context_package_v1()
  from public, anon, authenticated, service_role;

create constraint trigger newsroom_mesa_context_package_valid_v1
after insert or update of manifest
on public.newsroom_editorial_source_packages
deferrable initially deferred
for each row execute function public.newsroom_assert_mesa_context_package_v1();

create function public.newsroom_prepare_mesa_contexts_v3(
  p_preparation_key uuid,
  p_title text,
  p_contexts jsonb,
  p_incorporate_theme_id uuid default null,
  p_incorporate_source_ids uuid[] default '{}'::uuid[]
)
returns table (
  dossier_id uuid,
  preparation_action text,
  source_count integer,
  published_context_count integer,
  image_count integer,
  context_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_request_fingerprint text;
  v_existing public.newsroom_mesa_production_contexts%rowtype;
  v_result record;
  v_context jsonb;
  v_contexts jsonb := '[]'::jsonb;
  v_refs jsonb;
  v_union_refs jsonb := '[]'::jsonb;
  v_ref jsonb;
  v_kind text;
  v_source_id uuid;
  v_theme_id uuid;
  v_title_snapshot text;
  v_context_id uuid;
  v_snapshot_id uuid;
  v_ordinality bigint;
  v_ref_ordinality bigint;
  v_requested_theme_sources uuid[];
  v_current_theme_sources uuid[];
  v_incorporate_source_ids uuid[];
begin
  if p_preparation_key is null
    or nullif(btrim(p_title), '') is null
    or length(btrim(p_title)) > 180
    or p_contexts is null
    or jsonb_typeof(p_contexts) is distinct from 'array'
  then
    raise exception 'mesa-context-preparation-input-invalid';
  end if;

  if jsonb_array_length(p_contexts) not between 1 and 20
    or p_incorporate_source_ids is null
    or array_position(p_incorporate_source_ids, null) is not null
  then
    raise exception 'mesa-context-preparation-input-invalid';
  end if;

  select coalesce(array_agg(source_id order by source_id), '{}'::uuid[])
  into v_incorporate_source_ids
  from (
    select distinct source_id
    from unnest(p_incorporate_source_ids) source_rows(source_id)
  ) normalized;

  if cardinality(v_incorporate_source_ids) <> cardinality(p_incorporate_source_ids)
    or cardinality(v_incorporate_source_ids) > 20
    or (p_incorporate_theme_id is null and cardinality(v_incorporate_source_ids) <> 0)
    or (p_incorporate_theme_id is not null and cardinality(v_incorporate_source_ids) < 1)
  then
    raise exception 'mesa-context-incorporation-input-invalid';
  end if;

  v_request_fingerprint := md5(jsonb_build_object(
    'contractVersion', 3,
    'title', btrim(p_title),
    'contexts', p_contexts,
    'incorporateThemeId', p_incorporate_theme_id,
    'incorporateSourceIds', to_jsonb(v_incorporate_source_ids)
  )::text);

  perform pg_advisory_xact_lock(
    hashtextextended('newsroom-mesa-organization-v1', 0)
  );

  select context.*
  into v_existing
  from public.newsroom_mesa_production_contexts context
  where context.preparation_key = p_preparation_key;

  if found then
    if v_existing.selection_payload ->> 'contextRequestFingerprint'
        is distinct from v_request_fingerprint
      or v_existing.workspace_contract_version is distinct from 2::smallint
      or v_existing.workspace_state is distinct from 'active'
      or not exists (
        select 1
        from public.newsroom_mesa_production_context_items item
        where item.dossier_id = v_existing.dossier_id
      )
    then
      raise exception 'mesa-context-preparation-conflict';
    end if;

    return query
    select
      v_existing.dossier_id,
      'reused'::text,
      jsonb_array_length(v_existing.source_refs),
      (
        select count(*)::integer
        from public.newsroom_editorial_dossier_published_contexts published_context
        where published_context.dossier_id = v_existing.dossier_id
      ),
      (
        select count(*)::integer
        from public.newsroom_editorial_dossier_images image
        where image.dossier_id = v_existing.dossier_id
      ),
      (
        select count(*)::integer
        from public.newsroom_mesa_production_context_items item
        where item.dossier_id = v_existing.dossier_id
      );
    return;
  end if;

  if exists (
    select 1
    from public.newsroom_editorial_dossiers dossier
    where dossier.preparation_key = p_preparation_key
  ) then
    raise exception 'mesa-context-prepared-before-v3';
  end if;

  for v_context, v_ordinality in
    select context.value, context.ordinality
    from jsonb_array_elements(p_contexts)
      with ordinality context(value, ordinality)
  loop
    if jsonb_typeof(v_context) is distinct from 'object'
      or jsonb_typeof(v_context -> 'sources') is distinct from 'array'
    then
      raise exception 'mesa-context-selection-invalid';
    end if;

    v_kind := lower(btrim(coalesce(v_context ->> 'kind', '')));
    v_source_id := null;
    v_theme_id := null;

    begin
      if v_kind = 'source' then
        v_source_id := (v_context ->> 'sourceId')::uuid;
      elsif v_kind = 'theme' then
        v_theme_id := (v_context ->> 'themeId')::uuid;
      else
        raise exception 'mesa-context-selection-invalid';
      end if;
    exception
      when invalid_text_representation or not_null_violation then
        raise exception 'mesa-context-selection-invalid';
    end;

    v_refs := public.newsroom_mesa_normalize_refs_v2(v_context -> 'sources');
    if jsonb_array_length(v_refs) not between 1 and 20 then
      raise exception 'mesa-context-selection-invalid';
    end if;

    if v_kind = 'source' then
      if jsonb_array_length(v_refs) <> 1
        or lower(v_refs -> 0 ->> 'newsroomArticleId') <> v_source_id::text
      then
        raise exception 'mesa-context-source-selection-invalid';
      end if;
      select coalesce(nullif(btrim(article.title), ''), 'Fonte')
      into v_title_snapshot
      from public.newsroom_articles article
      where article.id = v_source_id;
      if not found then
        raise exception 'mesa-context-source-unavailable';
      end if;
      if exists (
        select 1
        from public.newsroom_editorial_theme_sources membership
        where membership.newsroom_article_id = v_source_id
      ) then
        raise exception 'mesa-context-source-not-loose';
      end if;
    else
      select theme.title
      into v_title_snapshot
      from public.newsroom_editorial_themes theme
      where theme.id = v_theme_id
        and theme.status = 'open'
      for update;
      if not found then
        raise exception 'mesa-context-theme-unavailable';
      end if;
    end if;

    v_contexts := v_contexts || jsonb_build_array(jsonb_build_object(
      'kind', v_kind,
      'sourceId', v_source_id,
      'themeId', v_theme_id,
      'titleSnapshot', v_title_snapshot,
      'sortOrder', v_ordinality,
      'sources', v_refs
    ));
    v_union_refs := v_union_refs || v_refs;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(v_contexts) context(value)
    group by
      context.value ->> 'kind',
      coalesce(context.value ->> 'sourceId', context.value ->> 'themeId')
    having count(*) > 1
  ) then
    raise exception 'mesa-context-selection-duplicate';
  end if;

  v_union_refs := public.newsroom_mesa_normalize_refs_v2(v_union_refs);
  if jsonb_array_length(v_union_refs) not between 1 and 20 then
    raise exception 'mesa-context-selection-invalid';
  end if;

  if p_incorporate_theme_id is not null then
    if jsonb_array_length(v_contexts) <> 1
      or v_contexts -> 0 ->> 'kind' <> 'theme'
      or lower(v_contexts -> 0 ->> 'themeId') <> p_incorporate_theme_id::text
    then
      raise exception 'mesa-context-incorporation-ambiguous';
    end if;

    if exists (
      select 1
      from unnest(v_incorporate_source_ids) requested(source_id)
      where not exists (
        select 1
        from jsonb_array_elements(v_contexts -> 0 -> 'sources') ref(value)
        where lower(ref.value ->> 'newsroomArticleId') = requested.source_id::text
      )
        or exists (
          select 1
          from public.newsroom_editorial_theme_sources membership
          where membership.newsroom_article_id = requested.source_id
        )
    ) then
      raise exception 'mesa-context-incorporation-source-invalid';
    end if;

    foreach v_source_id in array v_incorporate_source_ids
    loop
      select (ref.value ->> 'newsroomSnapshotId')::uuid
      into strict v_snapshot_id
      from jsonb_array_elements(v_contexts -> 0 -> 'sources') ref(value)
      where lower(ref.value ->> 'newsroomArticleId') = v_source_id::text;

      perform public.newsroom_set_editorial_theme_source_membership_v1(
        p_incorporate_theme_id,
        v_source_id,
        true
      );
      perform public.newsroom_acknowledge_theme_source_v1(
        p_incorporate_theme_id,
        v_source_id,
        v_snapshot_id
      );
    end loop;
  end if;

  for v_context in
    select context.value
    from jsonb_array_elements(v_contexts) context(value)
    where context.value ->> 'kind' = 'theme'
  loop
    select array_agg(membership.newsroom_article_id order by membership.newsroom_article_id)
    into v_current_theme_sources
    from public.newsroom_editorial_theme_sources membership
    where membership.theme_id = (v_context ->> 'themeId')::uuid;

    select array_agg(
      distinct (ref.value ->> 'newsroomArticleId')::uuid
      order by (ref.value ->> 'newsroomArticleId')::uuid
    )
    into v_requested_theme_sources
    from jsonb_array_elements(v_context -> 'sources') ref(value);

    if coalesce(v_current_theme_sources, '{}'::uuid[])
      is distinct from coalesce(v_requested_theme_sources, '{}'::uuid[])
    then
      raise exception 'mesa-context-theme-membership-stale';
    end if;
  end loop;

  select *
  into v_result
  from public.newsroom_prepare_mesa_materials_v2(
    p_preparation_key,
    null,
    btrim(p_title),
    v_union_refs,
    '[]'::jsonb
  );

  update public.newsroom_mesa_production_contexts context
  set selection_payload = jsonb_build_object(
    'contractVersion', 3,
    'contextContractVersion', 1,
    'contextRequestFingerprint', v_request_fingerprint,
    'title', btrim(p_title),
    'sources', v_union_refs,
    'materials', '[]'::jsonb,
    'contexts', v_contexts,
    'incorporateThemeId', p_incorporate_theme_id,
    'incorporateSourceIds', to_jsonb(v_incorporate_source_ids)
  )
  where context.dossier_id = v_result.dossier_id;

  if not found then
    raise exception 'mesa-context-preparation-workspace-missing';
  end if;

  for v_context in
    select context.value
    from jsonb_array_elements(v_contexts) context(value)
    order by (context.value ->> 'sortOrder')::smallint
  loop
    insert into public.newsroom_mesa_production_context_items(
      dossier_id,
      context_kind,
      source_newsroom_article_id,
      theme_id,
      title_snapshot,
      sort_order
    ) values (
      v_result.dossier_id,
      v_context ->> 'kind',
      (v_context ->> 'sourceId')::uuid,
      (v_context ->> 'themeId')::uuid,
      v_context ->> 'titleSnapshot',
      (v_context ->> 'sortOrder')::smallint
    )
    returning id into v_context_id;

    for v_ref, v_ref_ordinality in
      select ref.value, ref.ordinality
      from jsonb_array_elements(v_context -> 'sources')
        with ordinality ref(value, ordinality)
    loop
      insert into public.newsroom_mesa_production_context_sources(
        dossier_id,
        production_context_id,
        dossier_source_id,
        sort_order
      )
      select
        v_result.dossier_id,
        v_context_id,
        dossier_source.id,
        v_ref_ordinality::smallint
      from public.newsroom_editorial_dossier_sources dossier_source
      where dossier_source.dossier_id = v_result.dossier_id
        and dossier_source.newsroom_article_id = (v_ref ->> 'newsroomArticleId')::uuid
        and dossier_source.newsroom_snapshot_id = (v_ref ->> 'newsroomSnapshotId')::uuid
        and dossier_source.included;

      if not found then
        raise exception 'mesa-context-frozen-source-missing';
      end if;
    end loop;
  end loop;

  return query
  select
    v_result.dossier_id,
    v_result.preparation_action,
    v_result.source_count,
    v_result.published_context_count,
    v_result.image_count,
    jsonb_array_length(v_contexts);
end;
$function$;

revoke all on function public.newsroom_prepare_mesa_contexts_v3(
  uuid,
  text,
  jsonb,
  uuid,
  uuid[]
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_prepare_mesa_contexts_v3(
  uuid,
  text,
  jsonb,
  uuid,
  uuid[]
) to service_role;

create function public.newsroom_assign_mesa_article_plan_context_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_production_context_id uuid
)
returns table (
  assignment_action text,
  context_source_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_existing public.newsroom_mesa_article_plan_contexts%rowtype;
  v_source_count integer;
begin
  if p_dossier_id is null
    or p_article_plan_id is null
    or p_production_context_id is null
  then
    raise exception 'mesa-article-plan-context-input-invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended(
      'newsroom-mesa-plan-context:' || p_dossier_id::text || ':' || p_article_plan_id::text,
      0
    )
  );

  perform 1
  from public.newsroom_mesa_production_contexts workspace
  where workspace.dossier_id = p_dossier_id
    and workspace.workspace_role = 'technical'
    and workspace.workspace_contract_version = 2
    and workspace.workspace_state = 'active'
  for update;
  if not found then
    raise exception 'mesa-article-plan-context-workspace-invalid';
  end if;

  perform 1
  from public.newsroom_editorial_dossier_article_plans plan
  where plan.dossier_id = p_dossier_id
    and plan.id = p_article_plan_id
    and plan.status <> 'cancelled'
    and plan.editorial_article_id is null
  for update;
  if not found then
    raise exception 'mesa-article-plan-context-plan-invalid';
  end if;

  select count(*)::integer
  into v_source_count
  from public.newsroom_mesa_production_context_sources context_source
  where context_source.dossier_id = p_dossier_id
    and context_source.production_context_id = p_production_context_id;

  if v_source_count < 1
    or not public.newsroom_mesa_plan_context_sources_valid_v1(
      p_dossier_id,
      p_article_plan_id,
      p_production_context_id
    )
  then
    raise exception 'mesa-article-plan-context-sources-invalid';
  end if;

  select assignment.*
  into v_existing
  from public.newsroom_mesa_article_plan_contexts assignment
  where assignment.dossier_id = p_dossier_id
    and assignment.article_plan_id = p_article_plan_id
  for update;

  if found then
    if v_existing.production_context_id = p_production_context_id then
      return query select 'reused'::text, v_source_count;
      return;
    end if;

    update public.newsroom_mesa_article_plan_contexts assignment
    set production_context_id = p_production_context_id,
      assigned_at = now()
    where assignment.dossier_id = p_dossier_id
      and assignment.article_plan_id = p_article_plan_id;
    return query select 'updated'::text, v_source_count;
    return;
  end if;

  insert into public.newsroom_mesa_article_plan_contexts(
    dossier_id,
    article_plan_id,
    production_context_id
  ) values (
    p_dossier_id,
    p_article_plan_id,
    p_production_context_id
  );

  return query select 'created'::text, v_source_count;
end;
$function$;

revoke all on function public.newsroom_assign_mesa_article_plan_context_v1(uuid, uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_assign_mesa_article_plan_context_v1(uuid, uuid, uuid)
  to service_role;

create function public.newsroom_save_mesa_context_article_plan_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_working_title text,
  p_status text,
  p_sort_order integer,
  p_article_kind text,
  p_length_mode text,
  p_editorial_instructions text,
  p_dossier_source_ids uuid[],
  p_production_context_id uuid
)
returns table(article_plan_id uuid)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_article_plan_id uuid;
begin
  if p_production_context_id is null then
    raise exception 'mesa-article-plan-context-input-invalid';
  end if;

  perform 1
  from public.newsroom_mesa_production_contexts workspace
  where workspace.dossier_id = p_dossier_id
    and workspace.workspace_role = 'technical'
    and workspace.workspace_contract_version = 2
    and workspace.workspace_state = 'active'
    and workspace.selection_payload ->> 'contractVersion' = '3'
    and workspace.selection_payload ->> 'contextContractVersion' = '1'
    and exists (
      select 1
      from public.newsroom_mesa_production_context_items context_item
      where context_item.dossier_id = workspace.dossier_id
        and context_item.id = p_production_context_id
    )
  for update;
  if not found then
    raise exception 'mesa-article-plan-context-workspace-invalid';
  end if;

  select saved.article_plan_id
  into strict v_article_plan_id
  from public.newsroom_save_editorial_dossier_article_plan(
    p_dossier_id,
    p_article_plan_id,
    p_working_title,
    p_status,
    p_sort_order,
    p_article_kind,
    p_length_mode,
    p_editorial_instructions,
    p_dossier_source_ids
  ) saved;

  perform public.newsroom_assign_mesa_article_plan_context_v1(
    p_dossier_id,
    v_article_plan_id,
    p_production_context_id
  );

  return query select v_article_plan_id;
end;
$function$;

revoke all on function public.newsroom_save_mesa_context_article_plan_v1(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text,
  text,
  uuid[],
  uuid
) from public, anon, authenticated, service_role;
grant execute on function public.newsroom_save_mesa_context_article_plan_v1(
  uuid,
  uuid,
  text,
  text,
  integer,
  text,
  text,
  text,
  uuid[],
  uuid
) to service_role;

create or replace function public.newsroom_set_mesa_shared_outputs_v2(
  p_dossier_id uuid,
  p_article_plan_ids uuid[]
)
returns table (
  output_count integer,
  cancelled_count integer
)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_cancelled integer := 0;
begin
  if p_dossier_id is null
    or p_article_plan_ids is null
    or cardinality(p_article_plan_ids) not between 1 and 30
    or array_position(p_article_plan_ids, null) is not null
    or (
      select count(distinct requested_id)
      from unnest(p_article_plan_ids) requested(requested_id)
    ) <> cardinality(p_article_plan_ids)
  then
    raise exception 'mesa-shared-outputs-input-invalid';
  end if;

  perform pg_advisory_xact_lock(
    hashtextextended('newsroom-mesa-shared-outputs:' || p_dossier_id::text, 0)
  );

  select context.*
  into v_context
  from public.newsroom_mesa_production_contexts context
  where context.dossier_id = p_dossier_id
  for update;

  if not found
    or v_context.workspace_role <> 'technical'
    or v_context.workspace_contract_version <> 2
    or v_context.workspace_state <> 'active'
    or exists (
      select 1
      from public.newsroom_mesa_output_publications publication
      where publication.dossier_id = p_dossier_id
    )
  then
    raise exception 'mesa-shared-outputs-workspace-invalid';
  end if;

  if exists (
    select 1
    from unnest(p_article_plan_ids) requested(id)
    left join public.newsroom_editorial_dossier_article_plans plan
      on plan.dossier_id = p_dossier_id
      and plan.id = requested.id
      and plan.status <> 'cancelled'
      and plan.editorial_article_id is null
    where plan.id is null
  ) then
    raise exception 'mesa-shared-outputs-plan-invalid';
  end if;

  if exists (
    select 1
    from public.newsroom_mesa_production_context_items context_item
    where context_item.dossier_id = p_dossier_id
  ) and exists (
    select 1
    from unnest(p_article_plan_ids) requested(id)
    left join public.newsroom_mesa_article_plan_contexts assignment
      on assignment.dossier_id = p_dossier_id
      and assignment.article_plan_id = requested.id
    where assignment.article_plan_id is null
      or not public.newsroom_mesa_plan_context_sources_valid_v1(
        assignment.dossier_id,
        assignment.article_plan_id,
        assignment.production_context_id
      )
  ) then
    raise exception 'mesa-shared-outputs-plan-context-invalid';
  end if;

  update public.newsroom_editorial_dossier_article_plans plan
  set status = 'cancelled',
    updated_at = now()
  where plan.dossier_id = p_dossier_id
    and plan.status <> 'cancelled'
    and plan.editorial_article_id is null
    and not (plan.id = any(p_article_plan_ids));
  get diagnostics v_cancelled = row_count;

  update public.newsroom_editorial_dossiers dossier
  set output_mode = case
      when cardinality(p_article_plan_ids) = 1 then 'single'
      else 'multiple'
    end,
    output_count = cardinality(p_article_plan_ids),
    updated_at = now()
  where dossier.id = p_dossier_id;
  if not found then
    raise exception 'mesa-shared-outputs-workspace-invalid';
  end if;

  return query
  select cardinality(p_article_plan_ids), v_cancelled;
end;
$function$;

revoke all on function public.newsroom_set_mesa_shared_outputs_v2(uuid, uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_set_mesa_shared_outputs_v2(uuid, uuid[])
  to service_role;

create or replace function public.newsroom_mesa_consolidate_publication_v4(p_dossier_id uuid)
returns boolean language plpgsql security definer set search_path = '' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_payload jsonb; v_fingerprint text; v_event uuid; v_title text;
  v_material jsonb; v_origin public.newsroom_mesa_material_versions%rowtype;
  v_group record; v_articles uuid[]; v_version uuid; v_key text;
  v_source_scope text; v_source_scope_count integer;
begin
  select * into v_context from public.newsroom_mesa_production_contexts context
    where context.dossier_id = p_dossier_id for update;
  if not found or v_context.workspace_contract_version <> 2 or v_context.workspace_role <> 'technical'
    or v_context.workspace_state <> 'active' then return false; end if;
  if not exists(select 1 from public.newsroom_editorial_dossier_article_plans plan
      where plan.dossier_id = p_dossier_id and plan.status <> 'cancelled') then return false; end if;
  if exists(select 1 from public.newsroom_editorial_dossier_article_plans plan
      left join public.newsroom_mesa_output_publications publication
        on publication.dossier_id = plan.dossier_id and publication.article_plan_id = plan.id
      left join public.editorial_articles article on article.id = publication.editorial_article_id
      where plan.dossier_id = p_dossier_id and plan.status <> 'cancelled'
        and (publication.article_plan_id is null or article.status <> 'published')) then return false; end if;

  -- Historical exclusive-origin rows keep their original consolidator unchanged.
  if exists(select 1 from public.newsroom_mesa_output_publications publication
      where publication.dossier_id = p_dossier_id and publication.source_scope is null) then
    return public.newsroom_mesa_consolidate_publication_v3(p_dossier_id);
  end if;

  select min(publication.source_scope), count(distinct publication.source_scope)::integer
  into v_source_scope, v_source_scope_count
  from public.newsroom_mesa_output_publications publication
  where publication.dossier_id = p_dossier_id;
  if v_source_scope_count <> 1 or v_source_scope not in ('workspace', 'context') then
    return false;
  end if;

  select jsonb_build_object(
    'contractVersion', 2,
    'sourceScope', v_source_scope,
    'outputs', coalesce(jsonb_agg(output_row.payload order by output_row.article_plan_id), '[]'::jsonb)
  ) into v_payload
  from (
    select publication.article_plan_id,
      jsonb_build_object(
        'outputId', publication.article_plan_id,
        'articleId', publication.editorial_article_id,
        'sources', coalesce((select jsonb_agg(jsonb_build_object(
          'dossierSourceId', usage.dossier_source_id,
          'newsroomArticleId', usage.newsroom_article_id,
          'newsroomSnapshotId', usage.newsroom_snapshot_id
        ) order by usage.dossier_source_id)
          from public.newsroom_mesa_output_source_usage usage
          where usage.dossier_id = publication.dossier_id
            and usage.article_plan_id = publication.article_plan_id), '[]'::jsonb)
      ) || case when v_source_scope = 'context'
        then jsonb_build_object('contextId', publication.production_context_id)
        else '{}'::jsonb end as payload
    from public.newsroom_mesa_output_publications publication
    where publication.dossier_id = p_dossier_id
  ) output_row;
  v_fingerprint := md5(v_payload::text);
  select event.id into v_event from public.newsroom_mesa_publication_events event
    where event.dossier_id = p_dossier_id and event.fingerprint = v_fingerprint;
  if found then return false; end if;
  insert into public.newsroom_mesa_publication_events(dossier_id, fingerprint, payload)
    values(p_dossier_id, v_fingerprint, v_payload) returning id into v_event;
  select dossier.title into v_title from public.newsroom_editorial_dossiers dossier
    where dossier.id = p_dossier_id;

  -- Existing selected technical materials retain their frozen source set.
  for v_material in
    select value from jsonb_array_elements(coalesce(v_context.material_refs, '[]'::jsonb))
  loop
    if jsonb_typeof(v_material -> 'sources') <> 'array'
      or nullif(v_material ->> 'key', '') is null
      or nullif(v_material ->> 'versionId', '') is null then
      raise exception 'mesa-publication-workspace-invalid';
    end if;
    select array_agg(distinct usage.editorial_article_id order by usage.editorial_article_id)
      into v_articles
      from public.newsroom_mesa_output_source_usage usage
      where usage.dossier_id = p_dossier_id and exists(
        select 1 from jsonb_array_elements(v_material -> 'sources') ref
        where lower(ref ->> 'newsroomArticleId') = usage.newsroom_article_id::text
          and lower(ref ->> 'newsroomSnapshotId') = usage.newsroom_snapshot_id::text
      );
    if coalesce(cardinality(v_articles), 0) = 0 then continue; end if;
    select * into strict v_origin from public.newsroom_mesa_material_versions version
      where version.material_key = lower(v_material ->> 'key')
        and version.id = (v_material ->> 'versionId')::uuid;
    v_articles := array(select distinct article_id
      from unnest(v_origin.article_ids || v_articles) article_id order by article_id);
    if v_articles = v_origin.article_ids then continue; end if;
    insert into public.newsroom_mesa_material_versions(
      material_key, title, source_refs, article_ids, parent_version_id, production_dossier_id, publication_event_id
    ) values (
      v_origin.material_key, v_origin.title, v_origin.source_refs, v_articles,
      v_origin.id, p_dossier_id, v_event
    ) returning id into v_version;
    if v_context.theme_id is not null then
      update public.newsroom_mesa_theme_materials theme_material set version_id = v_version
        where theme_material.theme_id = v_context.theme_id
          and theme_material.material_key = v_origin.material_key
          and theme_material.version_id = v_origin.id;
      if not found then
        insert into public.newsroom_mesa_theme_materials(theme_id, material_key, version_id)
          values(v_context.theme_id, v_origin.material_key, v_version) on conflict do nothing;
      end if;
    end if;
  end loop;

  -- Dossier/material remains technical infrastructure; exact equal used-source
  -- sets share one immutable material version just as in the existing engine.
  for v_group in
    select standalone.source_ids, standalone.source_refs,
      array_agg(distinct standalone.article_id order by standalone.article_id) article_ids,
      min(standalone.article_plan_id::text)::uuid key_plan_id
    from (
      select usage.article_plan_id, min(usage.editorial_article_id::text)::uuid article_id,
        array_agg(usage.dossier_source_id order by usage.dossier_source_id) source_ids,
        public.newsroom_mesa_normalize_refs_v2(jsonb_agg(jsonb_build_object(
          'newsroomArticleId', usage.newsroom_article_id,
          'newsroomSnapshotId', usage.newsroom_snapshot_id
        ) order by usage.newsroom_article_id, usage.newsroom_snapshot_id)) source_refs
      from public.newsroom_mesa_output_source_usage usage
      where usage.dossier_id = p_dossier_id and not exists(
        select 1
        from jsonb_array_elements(coalesce(v_context.material_refs, '[]'::jsonb)) material,
          jsonb_array_elements(coalesce(material -> 'sources', '[]'::jsonb)) ref
        where lower(ref ->> 'newsroomArticleId') = usage.newsroom_article_id::text
          and lower(ref ->> 'newsroomSnapshotId') = usage.newsroom_snapshot_id::text
      )
      group by usage.article_plan_id
      having count(*) >= 2
    ) standalone
    group by standalone.source_ids, standalone.source_refs
  loop
    v_key := 'output:' || v_group.key_plan_id::text;
    insert into public.newsroom_mesa_material_versions(
      material_key, title, source_refs, article_ids, production_dossier_id, publication_event_id
    ) values (v_key, v_title, v_group.source_refs, v_group.article_ids, p_dossier_id, v_event)
    returning id into v_version;
    if v_context.theme_id is not null then
      insert into public.newsroom_mesa_theme_materials(theme_id, material_key, version_id)
        values(v_context.theme_id, v_key, v_version) on conflict do nothing;
    end if;
  end loop;

  if v_context.theme_id is not null then
    insert into public.newsroom_editorial_theme_articles(theme_id, editorial_article_id)
      select v_context.theme_id, publication.editorial_article_id
      from public.newsroom_mesa_output_publications publication
      where publication.dossier_id = p_dossier_id
      on conflict(theme_id, editorial_article_id) do nothing;
  end if;

  if v_source_scope = 'context' then
    insert into public.newsroom_editorial_theme_articles(theme_id, editorial_article_id)
      select context_item.theme_id, publication.editorial_article_id
      from public.newsroom_mesa_output_publications publication
      join public.newsroom_mesa_production_context_items context_item
        on context_item.dossier_id = publication.dossier_id
        and context_item.id = publication.production_context_id
      where publication.dossier_id = p_dossier_id
        and context_item.context_kind = 'theme'
      on conflict(theme_id, editorial_article_id) do nothing;
  end if;

  update public.newsroom_mesa_production_contexts
    set workspace_state = 'consolidated', consolidated_at = now()
    where dossier_id = p_dossier_id;
  return true;
end;
$function$;

revoke all on function public.newsroom_mesa_consolidate_publication_v4(uuid)
  from public, anon, authenticated, service_role;

create or replace function public.newsroom_publish_mesa_output_v2(
  p_dossier_id uuid,
  p_output_id uuid,
  p_package_id uuid,
  p_dossier_source_ids uuid[],
  p_article jsonb
)
returns table(
  editorial_article_id uuid,
  article_slug text,
  publication_action text,
  consolidated boolean
)
language plpgsql security definer set search_path = '' as $function$
declare
  v_context public.newsroom_mesa_production_contexts%rowtype;
  v_plan public.newsroom_editorial_dossier_article_plans%rowtype;
  v_manifest jsonb; v_manifest_output jsonb;
  v_existing public.newsroom_mesa_output_publications%rowtype;
  v_article_id uuid; v_slug text; v_label text; v_title text; v_subtitle text; v_body text;
  v_image text; v_author text; v_published_at timestamptz; v_matchday uuid; v_mode text;
  v_previous_slug text; v_source_scope text := 'workspace'; v_production_context_id uuid;
  v_declared_context_source_ids uuid[]; v_frozen_context_source_ids uuid[];
  v_is_2c boolean;
  v_payload jsonb; v_fingerprint text; v_consolidated boolean; v_now timestamptz := now();
begin
  if p_dossier_id is null or p_output_id is null or p_package_id is null
    or p_dossier_source_ids is null or cardinality(p_dossier_source_ids) < 1
    or cardinality(p_dossier_source_ids) > 20 or array_position(p_dossier_source_ids, null) is not null
    or (select count(distinct source_id) from unnest(p_dossier_source_ids) source_id) <> cardinality(p_dossier_source_ids)
    or p_article is null or jsonb_typeof(p_article) <> 'object' then
    raise exception 'mesa-publication-input-invalid';
  end if;

  perform pg_advisory_xact_lock(hashtextextended('newsroom-mesa-output:' || p_output_id::text, 0));
  select * into v_context from public.newsroom_mesa_production_contexts context
    where context.dossier_id = p_dossier_id for update;
  if not found or v_context.workspace_role <> 'technical' or v_context.workspace_contract_version <> 2
    or v_context.workspace_state not in ('active', 'consolidated') then
    raise exception 'mesa-publication-workspace-invalid';
  end if;

  v_is_2c := coalesce(
    v_context.selection_payload ->> 'contractVersion' = '3'
      and v_context.selection_payload ->> 'contextContractVersion' = '1',
    false
  );
  if coalesce(
    v_context.selection_payload ->> 'contractVersion' = '3'
      or v_context.selection_payload ? 'contextContractVersion',
    false
  ) and not v_is_2c then
    raise exception 'mesa-publication-workspace-invalid';
  end if;
  if v_is_2c is distinct from (exists (
      select 1 from public.newsroom_mesa_production_context_items context_item
      where context_item.dossier_id = p_dossier_id
    )) then
    raise exception 'mesa-publication-workspace-invalid';
  end if;

  select * into v_plan from public.newsroom_editorial_dossier_article_plans plan
    where plan.dossier_id = p_dossier_id and plan.id = p_output_id
      and plan.status <> 'cancelled' for update;
  if not found then raise exception 'mesa-publication-output-invalid'; end if;

  if v_is_2c then
    select assignment.production_context_id
    into v_production_context_id
    from public.newsroom_mesa_article_plan_contexts assignment
    where assignment.dossier_id = p_dossier_id
      and assignment.article_plan_id = p_output_id;
    if not found or not public.newsroom_mesa_plan_context_sources_valid_v1(
      p_dossier_id, p_output_id, v_production_context_id
    ) then
      raise exception 'mesa-publication-output-invalid';
    end if;
    v_source_scope := 'context';
  elsif exists (
    select 1 from public.newsroom_mesa_article_plan_contexts assignment
    where assignment.dossier_id = p_dossier_id
      and assignment.article_plan_id = p_output_id
  ) then
    raise exception 'mesa-publication-workspace-invalid';
  end if;

  select package.manifest into v_manifest from public.newsroom_editorial_source_packages package
    where package.id = p_package_id for update;
  if not found or (v_manifest ->> 'version')::integer <> 5
    or v_manifest ->> 'provenanceContract' <> 'mesa-v2' then
    raise exception 'mesa-publication-package-invalid';
  end if;

  select output.value into v_manifest_output
  from jsonb_array_elements(v_manifest -> 'outputs') output(value)
  where lower(output.value ->> 'outputId') = p_output_id::text
    and lower(output.value -> 'articlePlan' ->> 'articlePlanId') = p_output_id::text
    and lower(output.value -> 'articlePlan' ->> 'dossierId') = p_dossier_id::text;
  if not found
    or v_manifest_output -> 'articlePlan' ->> 'sourceScope' is distinct from v_source_scope
    or v_manifest_output -> 'articlePlan' ? 'origin' then
    raise exception 'mesa-publication-package-invalid';
  end if;

  if v_source_scope = 'context' then
    if lower(v_manifest_output -> 'articlePlan' ->> 'contextId')
      is distinct from v_production_context_id::text
      or jsonb_typeof(v_manifest_output -> 'contextSourceIds') is distinct from 'array'
    then
      raise exception 'mesa-publication-package-invalid';
    end if;
    begin
      select array_agg((source_id.value #>> '{}')::uuid order by (source_id.value #>> '{}')::uuid)
      into v_declared_context_source_ids
      from jsonb_array_elements(v_manifest_output -> 'contextSourceIds') source_id(value);
    exception when others then
      raise exception 'mesa-publication-package-invalid';
    end;
    select array_agg(context_source.dossier_source_id order by context_source.dossier_source_id)
    into v_frozen_context_source_ids
    from public.newsroom_mesa_production_context_sources context_source
    where context_source.dossier_id = p_dossier_id
      and context_source.production_context_id = v_production_context_id;
    if v_declared_context_source_ids is distinct from v_frozen_context_source_ids
      or exists (
        select 1 from unnest(p_dossier_source_ids) requested(id)
        where not (requested.id = any(v_frozen_context_source_ids))
      )
    then
      raise exception 'mesa-publication-source-invalid';
    end if;
  end if;

  if exists(select 1 from unnest(p_dossier_source_ids) requested(id)
    left join public.newsroom_editorial_dossier_sources dossier_source
      on dossier_source.id = requested.id
      and dossier_source.dossier_id = p_dossier_id
      and dossier_source.included
    where dossier_source.id is null
      or not exists(select 1 from jsonb_array_elements(v_context.source_refs) ref
        where lower(ref ->> 'newsroomArticleId') = dossier_source.newsroom_article_id::text
          and lower(ref ->> 'newsroomSnapshotId') = dossier_source.newsroom_snapshot_id::text)
      or not exists(select 1 from jsonb_array_elements(v_manifest -> 'entries') entry
        where entry ->> 'status' = 'prepared'
          and lower(entry ->> 'provenanceSourceId') = requested.id::text
          and lower(entry ->> 'newsroomArticleId') = dossier_source.newsroom_article_id::text
          and lower(entry ->> 'newsroomSnapshotId') = dossier_source.newsroom_snapshot_id::text)
  ) then raise exception 'mesa-publication-source-invalid'; end if;

  begin
    v_article_id := (p_article ->> 'id')::uuid;
  exception when others then
    raise exception 'mesa-publication-article-invalid';
  end;
  v_slug := btrim(coalesce(p_article ->> 'slug', ''));
  v_label := btrim(coalesce(p_article ->> 'label', ''));
  v_title := btrim(coalesce(p_article ->> 'title', ''));
  v_subtitle := btrim(coalesce(p_article ->> 'subtitle', ''));
  v_body := btrim(coalesce(p_article ->> 'body', ''));
  v_image := nullif(btrim(coalesce(p_article ->> 'imageUrl', '')), '');
  v_author := btrim(coalesce(p_article ->> 'author', ''));
  v_mode := lower(btrim(coalesce(p_article ->> 'mode', '')));
  begin
    v_published_at := (p_article ->> 'publishedAt')::timestamptz;
    v_matchday := (p_article ->> 'matchdayId')::uuid;
  exception when others then
    raise exception 'mesa-publication-article-invalid';
  end;
  if v_slug = '' or v_label = '' or v_title = '' or v_subtitle = '' or v_body = '' or v_author = ''
    or v_mode not in ('create', 'update') then
    raise exception 'mesa-publication-article-invalid';
  end if;

  v_payload := jsonb_build_object(
    'article', jsonb_build_object(
      'id', v_article_id, 'slug', v_slug, 'label', v_label, 'title', v_title,
      'subtitle', v_subtitle, 'body', v_body, 'imageUrl', v_image, 'author', v_author,
      'publishedAt', v_published_at, 'matchdayId', v_matchday, 'mode', v_mode
    ),
    'sources', (select to_jsonb(array_agg(source_id order by source_id)) from unnest(p_dossier_source_ids) source_id),
    'packageId', p_package_id,
    'outputId', p_output_id,
    'sourceScope', v_source_scope
  ) || case when v_source_scope = 'context'
    then jsonb_build_object('contextId', v_production_context_id)
    else '{}'::jsonb end;
  v_fingerprint := md5(v_payload::text);

  select * into v_existing from public.newsroom_mesa_output_publications publication
    where publication.dossier_id = p_dossier_id and publication.article_plan_id = p_output_id;
  if found then
    if v_existing.fingerprint <> v_fingerprint or v_existing.editorial_article_id <> v_article_id
      or v_existing.source_scope is distinct from v_source_scope
      or v_existing.production_context_id is distinct from v_production_context_id
      or not exists(select 1 from public.editorial_articles article
        where article.id = v_article_id and article.status = 'published') then
      raise exception 'mesa-publication-provenance-conflict';
    end if;
    return query select v_article_id, v_slug, 'reused'::text,
      v_context.workspace_state = 'consolidated';
    return;
  end if;
  if v_context.workspace_state = 'consolidated' then
    raise exception 'mesa-publication-provenance-conflict';
  end if;

  if v_mode = 'create' then
    if v_plan.destination <> 'new' or v_plan.update_target_editorial_article_id is not null
      or v_image is null
      or exists(select 1 from public.editorial_articles article
        where article.id = v_article_id or article.slug = v_slug) then
      raise exception 'mesa-publication-article-conflict';
    end if;
    insert into public.editorial_articles(
      id, status, scope, author, label, title, subtitle, body, slug, image_url,
      image_caption, published_at, competition_id, season_id, matchday_id, created_at, updated_at
    ) values (
      v_article_id, 'published', 'matchday', v_author, v_label, v_title, v_subtitle,
      v_body, v_slug, v_image, null, v_published_at, null, null, v_matchday, v_now, v_now
    );
  else
    if v_plan.destination <> 'update' or v_plan.update_target_editorial_article_id <> v_article_id then
      raise exception 'mesa-publication-update-target-invalid';
    end if;
    select article.slug into v_previous_slug from public.editorial_articles article
      where article.id = v_article_id and article.status = 'published'
        and article.matchday_id = v_matchday for update;
    if not found or v_previous_slug <> v_slug then
      raise exception 'mesa-publication-update-target-invalid';
    end if;
    update public.editorial_articles article
      set label = v_label, title = v_title, subtitle = v_subtitle, body = v_body,
        author = v_author, image_url = coalesce(v_image, article.image_url),
        status = 'published', scope = 'matchday', competition_id = null,
        season_id = null, updated_at = v_now
      where article.id = v_article_id and article.status = 'published'
        and article.matchday_id = v_matchday and article.slug = v_slug;
    if not found then raise exception 'mesa-publication-update-target-invalid'; end if;
  end if;

  insert into public.newsroom_mesa_output_publications(
    dossier_id, article_plan_id, package_id, editorial_article_id, source_scope,
    production_context_id, origin_kind, origin_dossier_source_id, material_key,
    material_version_id, fingerprint, payload
  ) values (
    p_dossier_id, p_output_id, p_package_id, v_article_id, v_source_scope,
    v_production_context_id, null, null, null, null, v_fingerprint, v_payload
  );
  insert into public.newsroom_mesa_output_source_usage(
    dossier_id, article_plan_id, dossier_source_id, newsroom_article_id,
    newsroom_snapshot_id, editorial_article_id, package_id
  ) select p_dossier_id, p_output_id, dossier_source.id, dossier_source.newsroom_article_id,
      dossier_source.newsroom_snapshot_id, v_article_id, p_package_id
    from public.newsroom_editorial_dossier_sources dossier_source
    where dossier_source.dossier_id = p_dossier_id
      and dossier_source.id = any(p_dossier_source_ids);
  update public.newsroom_editorial_dossier_article_plans plan
    set editorial_article_id = v_article_id, updated_at = v_now
    where plan.dossier_id = p_dossier_id and plan.id = p_output_id
      and plan.editorial_article_id is null;
  if not found then raise exception 'mesa-publication-output-conflict'; end if;
  v_consolidated := public.newsroom_mesa_consolidate_publication_v4(p_dossier_id);
  if v_mode = 'update' then
    perform * from public.sync_editorial_article_live_snapshots_v15(v_article_id, v_previous_slug);
  end if;
  return query select v_article_id, v_slug,
    case when v_mode = 'update' then 'updated' else 'created' end, v_consolidated;
end;
$function$;

revoke all on function public.newsroom_publish_mesa_output_v2(uuid, uuid, uuid, uuid[], jsonb)
  from public, anon, authenticated, service_role;
grant execute on function public.newsroom_publish_mesa_output_v2(uuid, uuid, uuid, uuid[], jsonb)
  to service_role;

notify pgrst, 'reload schema';
commit;
