begin;

-- Mesa da Redacao - estado persistente anterior ao Source Package.
-- O Dossie continua a ser a operacao e o Article Plan continua a ser o output.

do $preflight$
begin
  if pg_catalog.to_regclass('public.newsroom_editorial_dossiers') is null
    or pg_catalog.to_regclass('public.newsroom_editorial_dossier_sources') is null
    or pg_catalog.to_regclass('public.newsroom_editorial_dossier_article_plans') is null
    or pg_catalog.to_regclass('public.newsroom_article_snapshots') is null
    or pg_catalog.to_regclass('public.editorial_articles') is null
  then
    raise exception 'production_workspace_preflight_authority_missing';
  end if;

  if pg_catalog.to_regclass(
    'public.newsroom_editorial_dossier_published_contexts'
  ) is not null
    or pg_catalog.to_regclass(
      'public.newsroom_editorial_dossier_article_plan_published_contexts'
    ) is not null
    or pg_catalog.to_regclass(
      'public.newsroom_editorial_dossier_images'
    ) is not null
  then
    raise exception 'production_workspace_preflight_target_conflict';
  end if;

  if exists (
    select 1
    from information_schema.columns as column_row
    where column_row.table_schema = 'public'
      and (
        (
          column_row.table_name = 'newsroom_editorial_dossiers'
          and column_row.column_name = 'preparation_key'
        )
        or (
          column_row.table_name = 'newsroom_editorial_dossier_article_plans'
          and column_row.column_name in (
            'destination',
            'update_target_editorial_article_id',
            'image_choice',
            'dossier_image_id'
          )
        )
      )
  ) then
    raise exception 'production_workspace_preflight_column_conflict';
  end if;
end;
$preflight$;

alter table public.newsroom_editorial_dossiers
  add column preparation_key uuid,
  add constraint newsroom_editorial_dossiers_preparation_key_key
    unique (preparation_key);

create function public.newsroom_protect_dossier_preparation_key_v1()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $function$
begin
  if old.preparation_key is not null
    and new.preparation_key is distinct from old.preparation_key
  then
    raise exception 'editorial_dossier_preparation_key_immutable'
      using errcode = '23514';
  end if;

  return new;
end;
$function$;

create trigger newsroom_editorial_dossiers_protect_preparation_key_v1
before update of preparation_key
on public.newsroom_editorial_dossiers
for each row
execute function public.newsroom_protect_dossier_preparation_key_v1();

create table public.newsroom_editorial_dossier_published_contexts (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  editorial_article_id uuid not null,
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  constraint ned_published_contexts_dossier_fkey
    foreign key (dossier_id)
    references public.newsroom_editorial_dossiers(id)
    on delete cascade,
  constraint ned_published_contexts_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete restrict,
  constraint ned_published_contexts_dossier_id_id_key
    unique (dossier_id, id),
  constraint ned_published_contexts_dossier_article_key
    unique (dossier_id, editorial_article_id),
  constraint ned_published_contexts_sort_order_check
    check (sort_order >= 0)
);

create table public.newsroom_editorial_dossier_article_plan_published_contexts (
  dossier_id uuid not null,
  article_plan_id uuid not null,
  dossier_published_context_id uuid not null,
  sort_order integer not null default 10,
  created_at timestamptz not null default now(),
  constraint ned_plan_published_contexts_pkey
    primary key (article_plan_id, dossier_published_context_id),
  constraint ned_plan_published_contexts_plan_fkey
    foreign key (dossier_id, article_plan_id)
    references public.newsroom_editorial_dossier_article_plans(dossier_id, id)
    on delete cascade,
  constraint ned_plan_published_contexts_context_fkey
    foreign key (dossier_id, dossier_published_context_id)
    references public.newsroom_editorial_dossier_published_contexts(dossier_id, id)
    on delete cascade,
  constraint ned_plan_published_contexts_sort_order_check
    check (sort_order >= 0)
);

create table public.newsroom_editorial_dossier_images (
  id uuid primary key default gen_random_uuid(),
  dossier_id uuid not null,
  origin_kind text not null,
  frozen_url text not null,
  newsroom_article_id uuid,
  editorial_article_id uuid,
  storage_bucket text,
  storage_path text,
  file_name text,
  created_at timestamptz not null default now(),
  constraint ned_images_dossier_fkey
    foreign key (dossier_id)
    references public.newsroom_editorial_dossiers(id)
    on delete cascade,
  constraint ned_images_newsroom_article_fkey
    foreign key (newsroom_article_id)
    references public.newsroom_articles(id)
    on delete restrict,
  constraint ned_images_editorial_article_fkey
    foreign key (editorial_article_id)
    references public.editorial_articles(id)
    on delete restrict,
  constraint ned_images_dossier_id_id_key
    unique (dossier_id, id),
  constraint ned_images_upload_identity_key
    unique (dossier_id, storage_bucket, storage_path),
  constraint ned_images_origin_check
    check (
      (
        origin_kind = 'newsroom'
        and newsroom_article_id is not null
        and editorial_article_id is null
        and storage_bucket is null
        and storage_path is null
        and file_name is null
      )
      or (
        origin_kind = 'published'
        and newsroom_article_id is null
        and editorial_article_id is not null
        and storage_bucket is null
        and storage_path is null
        and file_name is null
      )
      or (
        origin_kind = 'upload'
        and newsroom_article_id is null
        and editorial_article_id is null
        and storage_bucket is not null
        and storage_path is not null
        and file_name is not null
      )
    ),
  constraint ned_images_frozen_url_not_blank
    check (pg_catalog.btrim(frozen_url) <> ''),
  constraint ned_images_storage_bucket_not_blank
    check (storage_bucket is null or pg_catalog.btrim(storage_bucket) <> ''),
  constraint ned_images_upload_bucket_check
    check (
      storage_bucket is null
      or storage_bucket = 'editorial-images'
    ),
  constraint ned_images_storage_path_not_blank
    check (storage_path is null or pg_catalog.btrim(storage_path) <> ''),
  constraint ned_images_file_name_not_blank
    check (file_name is null or pg_catalog.btrim(file_name) <> '')
);

create unique index ned_images_newsroom_origin_uidx
  on public.newsroom_editorial_dossier_images (
    dossier_id,
    newsroom_article_id
  )
  where origin_kind = 'newsroom';

create unique index ned_images_published_origin_uidx
  on public.newsroom_editorial_dossier_images (
    dossier_id,
    editorial_article_id
  )
  where origin_kind = 'published';

alter table public.newsroom_editorial_dossier_article_plans
  add column destination text not null default 'new',
  add column update_target_editorial_article_id uuid,
  add column image_choice text not null default 'unselected',
  add column dossier_image_id uuid,
  add constraint ned_article_plans_update_target_fkey
    foreign key (update_target_editorial_article_id)
    references public.editorial_articles(id)
    on delete restrict,
  add constraint ned_article_plans_dossier_image_fkey
    foreign key (dossier_id, dossier_image_id)
    references public.newsroom_editorial_dossier_images(dossier_id, id)
    on delete no action,
  add constraint ned_article_plans_destination_check
    check (
      (
        destination = 'new'
        and update_target_editorial_article_id is null
      )
      or (
        destination = 'update'
        and update_target_editorial_article_id is not null
      )
    ),
  add constraint ned_article_plans_image_choice_check
    check (
      (
        image_choice = 'unselected'
        and dossier_image_id is null
      )
      or (
        image_choice = 'preserve_published'
        and destination = 'update'
        and dossier_image_id is null
      )
      or (
        image_choice = 'dossier_image'
        and dossier_image_id is not null
      )
    );

create index ned_published_contexts_dossier_order_idx
  on public.newsroom_editorial_dossier_published_contexts (
    dossier_id,
    sort_order,
    id
  );

create index ned_published_contexts_article_idx
  on public.newsroom_editorial_dossier_published_contexts (
    editorial_article_id,
    dossier_id
  );

create index ned_plan_published_contexts_plan_order_idx
  on public.newsroom_editorial_dossier_article_plan_published_contexts (
    dossier_id,
    article_plan_id,
    sort_order,
    dossier_published_context_id
  );

create index ned_plan_published_contexts_context_idx
  on public.newsroom_editorial_dossier_article_plan_published_contexts (
    dossier_published_context_id,
    article_plan_id
  );

create index ned_images_dossier_created_idx
  on public.newsroom_editorial_dossier_images (
    dossier_id,
    created_at,
    id
  );

create index ned_article_plans_update_target_idx
  on public.newsroom_editorial_dossier_article_plans (
    update_target_editorial_article_id,
    dossier_id
  )
  where update_target_editorial_article_id is not null;

alter table public.newsroom_editorial_dossier_published_contexts
  enable row level security;
alter table public.newsroom_editorial_dossier_published_contexts
  force row level security;
alter table public.newsroom_editorial_dossier_article_plan_published_contexts
  enable row level security;
alter table public.newsroom_editorial_dossier_article_plan_published_contexts
  force row level security;
alter table public.newsroom_editorial_dossier_images
  enable row level security;
alter table public.newsroom_editorial_dossier_images
  force row level security;

revoke all privileges
on table public.newsroom_editorial_dossier_published_contexts
from public, anon, authenticated, service_role;

revoke all privileges
on table public.newsroom_editorial_dossier_article_plan_published_contexts
from public, anon, authenticated, service_role;

revoke all privileges
on table public.newsroom_editorial_dossier_images
from public, anon, authenticated, service_role;

grant select
on table public.newsroom_editorial_dossier_published_contexts
to service_role;

grant select
on table public.newsroom_editorial_dossier_article_plan_published_contexts
to service_role;

grant select
on table public.newsroom_editorial_dossier_images
to service_role;

create function public.newsroom_prepare_editorial_dossier_workspace_v1(
  p_preparation_key uuid,
  p_title text,
  p_newsroom_article_ids uuid[],
  p_newsroom_snapshot_ids uuid[],
  p_published_context_article_ids uuid[]
)
returns table (
  dossier_id uuid,
  preparation_action text,
  source_count integer,
  published_context_count integer,
  image_count integer
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_dossier_id uuid;
  v_created boolean := false;
  v_source_count integer := coalesce(
    pg_catalog.cardinality(p_newsroom_article_ids),
    0
  );
  v_snapshot_count integer := coalesce(
    pg_catalog.cardinality(p_newsroom_snapshot_ids),
    0
  );
  v_published_count integer := coalesce(
    pg_catalog.cardinality(p_published_context_article_ids),
    0
  );
  v_existing_article_ids uuid[];
  v_existing_snapshot_ids uuid[];
  v_existing_published_ids uuid[];
  v_existing_title text;
  v_image_count integer;
begin
  if p_preparation_key is null
    or p_title is null
    or pg_catalog.btrim(p_title) = ''
    or pg_catalog.char_length(pg_catalog.btrim(p_title)) > 180
    or p_newsroom_article_ids is null
    or p_newsroom_snapshot_ids is null
    or p_published_context_article_ids is null
    or v_source_count <> v_snapshot_count
    or v_source_count > 20
    or v_source_count + v_published_count < 1
    or pg_catalog.array_position(p_newsroom_article_ids, null) is not null
    or pg_catalog.array_position(p_newsroom_snapshot_ids, null) is not null
    or pg_catalog.array_position(
      p_published_context_article_ids,
      null
    ) is not null
    or (
      select pg_catalog.count(distinct requested_id)
      from pg_catalog.unnest(p_newsroom_article_ids)
        as requested_row(requested_id)
    ) <> v_source_count
    or (
      select pg_catalog.count(distinct requested_id)
      from pg_catalog.unnest(p_published_context_article_ids)
        as requested_row(requested_id)
    ) <> v_published_count
  then
    raise exception 'production_workspace_prepare_input_invalid'
      using errcode = '22023';
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
    output_language,
    preparation_key
  ) values (
    pg_catalog.btrim(p_title),
    'draft',
    '',
    '',
    'single',
    1,
    'standard',
    'news',
    'pt-PT',
    p_preparation_key
  )
  on conflict on constraint newsroom_editorial_dossiers_preparation_key_key
  do nothing
  returning id into v_dossier_id;

  v_created := v_dossier_id is not null;

  if not v_created then
    select dossier_row.id, dossier_row.title
    into v_dossier_id, v_existing_title
    from public.newsroom_editorial_dossiers as dossier_row
    where dossier_row.preparation_key = p_preparation_key
    for update;

    if not found then
      raise exception 'production_workspace_prepare_idempotency_conflict'
        using errcode = '40001';
    end if;

    select
      coalesce(
        pg_catalog.array_agg(
          source_row.newsroom_article_id
          order by source_row.sort_order, source_row.id
        ),
        '{}'::uuid[]
      ),
      coalesce(
        pg_catalog.array_agg(
          source_row.newsroom_snapshot_id
          order by source_row.sort_order, source_row.id
        ),
        '{}'::uuid[]
      )
    into v_existing_article_ids, v_existing_snapshot_ids
    from public.newsroom_editorial_dossier_sources as source_row
    where source_row.dossier_id = v_dossier_id;

    select coalesce(
      pg_catalog.array_agg(
        context_row.editorial_article_id
        order by context_row.sort_order, context_row.id
      ),
      '{}'::uuid[]
    )
    into v_existing_published_ids
    from public.newsroom_editorial_dossier_published_contexts as context_row
    where context_row.dossier_id = v_dossier_id;

    if v_existing_title is distinct from pg_catalog.btrim(p_title)
      or v_existing_article_ids is distinct from p_newsroom_article_ids
      or v_existing_snapshot_ids is distinct from p_newsroom_snapshot_ids
      or v_existing_published_ids is distinct from p_published_context_article_ids
    then
      raise exception 'production_workspace_prepare_idempotency_conflict'
        using errcode = '23514';
    end if;
  else
    if exists (
      select 1
      from rows from (
        pg_catalog.unnest(p_newsroom_article_ids),
        pg_catalog.unnest(p_newsroom_snapshot_ids)
      ) as requested_row(newsroom_article_id, newsroom_snapshot_id)
      left join public.newsroom_articles as article_row
        on article_row.id = requested_row.newsroom_article_id
      left join public.newsroom_article_snapshots as snapshot_row
        on snapshot_row.article_id = requested_row.newsroom_article_id
        and snapshot_row.id = requested_row.newsroom_snapshot_id
      where article_row.id is null
        or snapshot_row.id is null
        or article_row.processing_status not in (
          'detected',
          'normalized',
          'ready_for_review'
        )
        or not exists (
          select 1
          from pg_catalog.jsonb_array_elements(snapshot_row.body)
            as block_row(value)
          where pg_catalog.btrim(
            coalesce(block_row.value ->> 'text', '')
          ) <> ''
        )
    ) then
      raise exception 'production_workspace_prepare_source_unavailable'
        using errcode = '23514';
    end if;

    if exists (
      select 1
      from pg_catalog.unnest(p_published_context_article_ids)
        as requested_row(editorial_article_id)
      left join public.editorial_articles as article_row
        on article_row.id = requested_row.editorial_article_id
      where article_row.id is null
        or article_row.status <> 'published'
    ) then
      raise exception 'production_workspace_prepare_published_context_unavailable'
        using errcode = '23514';
    end if;

    insert into public.newsroom_editorial_dossier_sources (
      dossier_id,
      newsroom_article_id,
      newsroom_snapshot_id,
      title_snapshot,
      published_at_snapshot,
      source_role,
      sort_order,
      editorial_note,
      included
    )
    select
      v_dossier_id,
      article_row.id,
      requested_row.newsroom_snapshot_id,
      article_row.title,
      article_row.published_at,
      case
        when requested_row.requested_order = 1 then 'primary'
        else 'complementary'
      end,
      requested_row.requested_order::integer * 10,
      null,
      true
    from rows from (
      pg_catalog.unnest(p_newsroom_article_ids),
      pg_catalog.unnest(p_newsroom_snapshot_ids)
    ) with ordinality
      as requested_row(
        newsroom_article_id,
        newsroom_snapshot_id,
        requested_order
      )
    join public.newsroom_articles as article_row
      on article_row.id = requested_row.newsroom_article_id;

    insert into public.newsroom_editorial_dossier_published_contexts (
      dossier_id,
      editorial_article_id,
      sort_order
    )
    select
      v_dossier_id,
      requested_row.editorial_article_id,
      requested_row.requested_order::integer * 10
    from pg_catalog.unnest(p_published_context_article_ids)
      with ordinality
      as requested_row(editorial_article_id, requested_order);

    insert into public.newsroom_editorial_dossier_images (
      dossier_id,
      origin_kind,
      frozen_url,
      newsroom_article_id
    )
    select
      v_dossier_id,
      'newsroom',
      pg_catalog.btrim(article_row.image_url),
      article_row.id
    from pg_catalog.unnest(p_newsroom_article_ids)
      as requested_row(newsroom_article_id)
    join public.newsroom_articles as article_row
      on article_row.id = requested_row.newsroom_article_id
    where pg_catalog.btrim(
      coalesce(article_row.image_url, '')
    ) <> '';

    insert into public.newsroom_editorial_dossier_images (
      dossier_id,
      origin_kind,
      frozen_url,
      editorial_article_id
    )
    select
      v_dossier_id,
      'published',
      pg_catalog.btrim(article_row.image_url),
      article_row.id
    from pg_catalog.unnest(p_published_context_article_ids)
      as requested_row(editorial_article_id)
    join public.editorial_articles as article_row
      on article_row.id = requested_row.editorial_article_id
    where pg_catalog.btrim(
      coalesce(article_row.image_url, '')
    ) <> '';
  end if;

  select pg_catalog.count(*)::integer
  into v_image_count
  from public.newsroom_editorial_dossier_images as image_row
  where image_row.dossier_id = v_dossier_id;

  return query
  select
    v_dossier_id,
    case when v_created then 'created' else 'reused' end,
    v_source_count,
    v_published_count,
    v_image_count;
end;
$function$;

create function public.newsroom_save_dossier_article_plan_state_v1(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_destination text,
  p_update_target_editorial_article_id uuid,
  p_published_context_ids uuid[],
  p_image_choice text,
  p_dossier_image_id uuid
)
returns table (
  article_plan_id uuid,
  destination text,
  update_target_editorial_article_id uuid,
  published_context_count integer,
  image_choice text,
  dossier_image_id uuid
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_plan record;
  v_context_count integer := coalesce(
    pg_catalog.cardinality(p_published_context_ids),
    0
  );
begin
  if p_dossier_id is null
    or p_article_plan_id is null
    or p_destination is null
    or p_image_choice is null
    or p_published_context_ids is null
    or pg_catalog.array_position(p_published_context_ids, null) is not null
    or (
      select pg_catalog.count(distinct requested_id)
      from pg_catalog.unnest(p_published_context_ids)
        as requested_row(requested_id)
    ) <> v_context_count
    or not (
      (
        p_destination = 'new'
        and p_update_target_editorial_article_id is null
      )
      or (
        p_destination = 'update'
        and p_update_target_editorial_article_id is not null
      )
    )
    or not (
      (
        p_image_choice = 'unselected'
        and p_dossier_image_id is null
      )
      or (
        p_image_choice = 'preserve_published'
        and p_destination = 'update'
        and p_dossier_image_id is null
      )
      or (
        p_image_choice = 'dossier_image'
        and p_dossier_image_id is not null
      )
    )
  then
    raise exception 'production_workspace_article_plan_state_invalid'
      using errcode = '22023';
  end if;

  select plan_row.id, plan_row.editorial_article_id
  into v_plan
  from public.newsroom_editorial_dossier_article_plans as plan_row
  where plan_row.id = p_article_plan_id
    and plan_row.dossier_id = p_dossier_id
  for update;

  if not found then
    raise exception 'production_workspace_article_plan_not_found'
      using errcode = 'P0002';
  end if;

  if v_plan.editorial_article_id is not null then
    raise exception 'editorial_dossier_article_plan_already_converted'
      using errcode = '23514';
  end if;

  if p_destination = 'update'
    and not exists (
      select 1
      from public.editorial_articles as article_row
      where article_row.id = p_update_target_editorial_article_id
        and article_row.status = 'published'
    )
  then
    raise exception 'production_workspace_update_target_not_published'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from pg_catalog.unnest(p_published_context_ids)
      as requested_row(dossier_published_context_id)
    left join public.newsroom_editorial_dossier_published_contexts
      as context_row
      on context_row.id = requested_row.dossier_published_context_id
      and context_row.dossier_id = p_dossier_id
    where context_row.id is null
  ) then
    raise exception 'production_workspace_published_context_not_in_dossier'
      using errcode = '23514';
  end if;

  if p_image_choice = 'dossier_image'
    and not exists (
      select 1
      from public.newsroom_editorial_dossier_images as image_row
      where image_row.id = p_dossier_image_id
        and image_row.dossier_id = p_dossier_id
    )
  then
    raise exception 'production_workspace_image_not_in_dossier'
      using errcode = '23514';
  end if;

  update public.newsroom_editorial_dossier_article_plans as plan_row
  set
    destination = p_destination,
    update_target_editorial_article_id =
      p_update_target_editorial_article_id,
    image_choice = p_image_choice,
    dossier_image_id = p_dossier_image_id
  where plan_row.id = p_article_plan_id
    and plan_row.dossier_id = p_dossier_id;

  delete from
    public.newsroom_editorial_dossier_article_plan_published_contexts
    as assignment_row
  where assignment_row.article_plan_id = p_article_plan_id
    and assignment_row.dossier_id = p_dossier_id
    and not (
      assignment_row.dossier_published_context_id = any(
        p_published_context_ids
      )
    );

  insert into
    public.newsroom_editorial_dossier_article_plan_published_contexts (
      dossier_id,
      article_plan_id,
      dossier_published_context_id,
      sort_order
    )
  select
    p_dossier_id,
    p_article_plan_id,
    requested_row.dossier_published_context_id,
    requested_row.requested_order::integer * 10
  from pg_catalog.unnest(p_published_context_ids)
    with ordinality
    as requested_row(dossier_published_context_id, requested_order)
  on conflict on constraint ned_plan_published_contexts_pkey
  do update
  set sort_order = excluded.sort_order;

  update public.newsroom_editorial_dossiers as dossier_row
  set updated_at = pg_catalog.statement_timestamp()
  where dossier_row.id = p_dossier_id;

  return query
  select
    p_article_plan_id,
    p_destination,
    p_update_target_editorial_article_id,
    v_context_count,
    p_image_choice,
    p_dossier_image_id;
end;
$function$;

create function public.newsroom_add_dossier_upload_image_v1(
  p_dossier_id uuid,
  p_frozen_url text,
  p_storage_bucket text,
  p_storage_path text,
  p_file_name text
)
returns table (
  dossier_image_id uuid,
  image_action text,
  frozen_url text
)
language plpgsql
volatile
security definer
set search_path = ''
as $function$
declare
  v_image public.newsroom_editorial_dossier_images%rowtype;
  v_created boolean := false;
begin
  if p_dossier_id is null
    or pg_catalog.btrim(coalesce(p_frozen_url, '')) = ''
    or pg_catalog.btrim(coalesce(p_storage_bucket, '')) <> 'editorial-images'
    or pg_catalog.btrim(coalesce(p_storage_path, '')) = ''
    or pg_catalog.btrim(coalesce(p_file_name, '')) = ''
  then
    raise exception 'production_workspace_upload_image_input_invalid'
      using errcode = '22023';
  end if;

  perform 1
  from public.newsroom_editorial_dossiers as dossier_row
  where dossier_row.id = p_dossier_id
  for update;

  if not found then
    raise exception 'editorial_dossier_not_found'
      using errcode = 'P0002';
  end if;

  insert into public.newsroom_editorial_dossier_images (
    dossier_id,
    origin_kind,
    frozen_url,
    storage_bucket,
    storage_path,
    file_name
  ) values (
    p_dossier_id,
    'upload',
    pg_catalog.btrim(p_frozen_url),
    pg_catalog.btrim(p_storage_bucket),
    pg_catalog.btrim(p_storage_path),
    pg_catalog.btrim(p_file_name)
  )
  on conflict on constraint ned_images_upload_identity_key
  do nothing
  returning * into v_image;

  v_created := v_image.id is not null;

  if not v_created then
    select image_row.*
    into strict v_image
    from public.newsroom_editorial_dossier_images as image_row
    where image_row.dossier_id = p_dossier_id
      and image_row.storage_bucket = pg_catalog.btrim(p_storage_bucket)
      and image_row.storage_path = pg_catalog.btrim(p_storage_path);

    if v_image.origin_kind <> 'upload'
      or v_image.frozen_url is distinct from pg_catalog.btrim(p_frozen_url)
      or v_image.file_name is distinct from pg_catalog.btrim(p_file_name)
    then
      raise exception 'production_workspace_upload_image_conflict'
        using errcode = '23514';
    end if;
  end if;

  if v_created then
    update public.newsroom_editorial_dossiers as dossier_row
    set updated_at = pg_catalog.statement_timestamp()
    where dossier_row.id = p_dossier_id;
  end if;

  return query
  select
    v_image.id,
    case when v_created then 'created' else 'reused' end,
    v_image.frozen_url;
end;
$function$;

revoke all
on function public.newsroom_protect_dossier_preparation_key_v1()
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_prepare_editorial_dossier_workspace_v1(
  uuid,
  text,
  uuid[],
  uuid[],
  uuid[]
)
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_save_dossier_article_plan_state_v1(
  uuid,
  uuid,
  text,
  uuid,
  uuid[],
  text,
  uuid
)
from public, anon, authenticated, service_role;

revoke all
on function public.newsroom_add_dossier_upload_image_v1(
  uuid,
  text,
  text,
  text,
  text
)
from public, anon, authenticated, service_role;

grant execute
on function public.newsroom_prepare_editorial_dossier_workspace_v1(
  uuid,
  text,
  uuid[],
  uuid[],
  uuid[]
)
to service_role;

grant execute
on function public.newsroom_save_dossier_article_plan_state_v1(
  uuid,
  uuid,
  text,
  uuid,
  uuid[],
  text,
  uuid
)
to service_role;

grant execute
on function public.newsroom_add_dossier_upload_image_v1(
  uuid,
  text,
  text,
  text,
  text
)
to service_role;

comment on column public.newsroom_editorial_dossiers.preparation_key is
  'Stable idempotency key for the atomic Mesa PREPARAR operation. Null identifies legacy dossiers.';

comment on table public.newsroom_editorial_dossier_published_contexts is
  'Canonical published articles available only as editorial context in one production dossier. This relation never means UPDATE.';

comment on table public.newsroom_editorial_dossier_article_plan_published_contexts is
  'Per-plan selection from the published contexts of the same dossier.';

comment on column public.newsroom_editorial_dossier_article_plans.destination is
  'Pre-package output destination: new or update.';

comment on column public.newsroom_editorial_dossier_article_plans.update_target_editorial_article_id is
  'Canonical published article targeted by an update plan. The writer validates published status; a future Source Package writer must revalidate it. editorial_article_id keeps its separate materialized-output meaning.';

comment on table public.newsroom_editorial_dossier_images is
  'Dossier-local common image bank with one frozen URL and exclusive newsroom, published or upload provenance.';

comment on column public.newsroom_editorial_dossier_images.frozen_url is
  'Image URL available and frozen when this row was created. For newsroom origin, newsroom_articles is the image authority; the textual snapshot remains only on the dossier source.';

comment on column public.newsroom_editorial_dossier_article_plans.image_choice is
  'Single image decision authority: unselected, preserve_published or dossier_image.';

notify pgrst, 'reload schema';

commit;
