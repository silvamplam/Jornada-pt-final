begin;

create unique index if not exists newsroom_article_snapshots_article_id_id_uidx
  on public.newsroom_article_snapshots (article_id, id);

create table if not exists public.newsroom_editorial_review_batches (
  id uuid primary key default gen_random_uuid(),
  closed_at timestamptz not null default now(),
  item_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint newsroom_editorial_review_batches_item_count_check
    check (item_count >= 0 and item_count <= 100)
);

create table if not exists public.newsroom_editorial_review_states (
  newsroom_article_id uuid primary key,
  decision text not null,
  reviewed_snapshot_id uuid not null,
  reviewed_at timestamptz not null default now(),
  last_batch_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint newsroom_editorial_review_states_article_fkey
    foreign key (newsroom_article_id)
    references public.newsroom_articles(id)
    on delete cascade,
  constraint newsroom_editorial_review_states_snapshot_fkey
    foreign key (newsroom_article_id, reviewed_snapshot_id)
    references public.newsroom_article_snapshots(article_id, id)
    on delete restrict,
  constraint newsroom_editorial_review_states_batch_fkey
    foreign key (last_batch_id)
    references public.newsroom_editorial_review_batches(id)
    on delete set null,
  constraint newsroom_editorial_review_states_decision_check
    check (decision in ('working', 'seen', 'dismissed'))
);

create table if not exists public.newsroom_editorial_review_batch_items (
  batch_id uuid not null,
  newsroom_article_id uuid not null,
  snapshot_id uuid not null,
  decision text not null default 'seen',
  created_at timestamptz not null default now(),
  primary key (batch_id, newsroom_article_id),
  constraint newsroom_editorial_review_batch_items_batch_fkey
    foreign key (batch_id)
    references public.newsroom_editorial_review_batches(id)
    on delete cascade,
  constraint newsroom_editorial_review_batch_items_article_fkey
    foreign key (newsroom_article_id)
    references public.newsroom_articles(id)
    on delete cascade,
  constraint newsroom_editorial_review_batch_items_snapshot_fkey
    foreign key (newsroom_article_id, snapshot_id)
    references public.newsroom_article_snapshots(article_id, id)
    on delete restrict,
  constraint newsroom_editorial_review_batch_items_decision_check
    check (decision = 'seen')
);

create index if not exists newsroom_editorial_review_states_decision_reviewed_idx
  on public.newsroom_editorial_review_states (decision, reviewed_at desc, newsroom_article_id);

create index if not exists newsroom_editorial_review_batch_items_article_idx
  on public.newsroom_editorial_review_batch_items (newsroom_article_id, created_at desc);

drop trigger if exists newsroom_editorial_review_states_set_updated_at
  on public.newsroom_editorial_review_states;

create trigger newsroom_editorial_review_states_set_updated_at
before update on public.newsroom_editorial_review_states
for each row
execute function public.newsroom_set_article_updated_at();

create or replace function public.newsroom_apply_editorial_review(
  p_action text,
  p_items jsonb
)
returns table (
  applied_action text,
  review_batch_id uuid,
  affected_count integer
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_action text := lower(btrim(coalesce(p_action, '')));
  v_item jsonb;
  v_article_id uuid;
  v_snapshot_id uuid;
  v_batch_id uuid;
  v_count integer := 0;
  v_decision text;
begin
  if v_action not in ('working', 'seen', 'dismissed', 'reopen', 'close_block')
     or p_items is null
     or jsonb_typeof(p_items) <> 'array'
     or jsonb_array_length(p_items) < 1
     or jsonb_array_length(p_items) > 100
     or (v_action <> 'close_block' and jsonb_array_length(p_items) <> 1) then
    raise exception 'input_invalid' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_items) item(value)
    where jsonb_typeof(item.value) <> 'object'
       or not (item.value ? 'articleId')
       or not (item.value ? 'snapshotId')
       or jsonb_typeof(item.value -> 'articleId') <> 'string'
       or jsonb_typeof(item.value -> 'snapshotId') <> 'string'
       or item.value ->> 'articleId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
       or item.value ->> 'snapshotId' !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ) or exists (
    select 1
    from jsonb_array_elements(p_items) item(value)
    group by lower(item.value ->> 'articleId')
    having count(*) > 1
  ) then
    raise exception 'input_invalid' using errcode = 'P0001';
  end if;

  if v_action = 'close_block' then
    insert into public.newsroom_editorial_review_batches default values
    returning id into v_batch_id;
  end if;

  for v_item in
    select value
    from jsonb_array_elements(p_items)
  loop
    v_article_id := (v_item ->> 'articleId')::uuid;
    v_snapshot_id := (v_item ->> 'snapshotId')::uuid;

    if not exists (
      select 1
      from public.newsroom_article_snapshots snapshot
      where snapshot.article_id = v_article_id
        and snapshot.id = v_snapshot_id
        and not exists (
          select 1
          from public.newsroom_article_snapshots newer
          where newer.article_id = snapshot.article_id
            and (newer.extracted_at, newer.created_at, newer.id)
              > (snapshot.extracted_at, snapshot.created_at, snapshot.id)
        )
    ) then
      raise exception 'snapshot_stale' using errcode = 'P0001';
    end if;

    if v_action = 'reopen' then
      delete from public.newsroom_editorial_review_states state
      where state.newsroom_article_id = v_article_id;
    else
      v_decision := case
        when v_action = 'close_block' then 'seen'
        else v_action
      end;

      insert into public.newsroom_editorial_review_states (
        newsroom_article_id,
        decision,
        reviewed_snapshot_id,
        reviewed_at,
        last_batch_id
      ) values (
        v_article_id,
        v_decision,
        v_snapshot_id,
        now(),
        v_batch_id
      )
      on conflict (newsroom_article_id) do update
      set
        decision = excluded.decision,
        reviewed_snapshot_id = excluded.reviewed_snapshot_id,
        reviewed_at = excluded.reviewed_at,
        last_batch_id = excluded.last_batch_id;

      if v_action = 'close_block' then
        insert into public.newsroom_editorial_review_batch_items (
          batch_id,
          newsroom_article_id,
          snapshot_id,
          decision
        ) values (
          v_batch_id,
          v_article_id,
          v_snapshot_id,
          'seen'
        );
      end if;
    end if;

    v_count := v_count + 1;
  end loop;

  if v_batch_id is not null then
    update public.newsroom_editorial_review_batches batch
    set item_count = v_count
    where batch.id = v_batch_id;
  end if;

  return query
  select v_action, v_batch_id, v_count;
end;
$$;

alter table public.newsroom_editorial_review_batches enable row level security;
alter table public.newsroom_editorial_review_batches force row level security;
alter table public.newsroom_editorial_review_states enable row level security;
alter table public.newsroom_editorial_review_states force row level security;
alter table public.newsroom_editorial_review_batch_items enable row level security;
alter table public.newsroom_editorial_review_batch_items force row level security;

revoke all privileges on table public.newsroom_editorial_review_batches from public, anon, authenticated;
revoke all privileges on table public.newsroom_editorial_review_states from public, anon, authenticated;
revoke all privileges on table public.newsroom_editorial_review_batch_items from public, anon, authenticated;

grant select, insert, update on table public.newsroom_editorial_review_batches to service_role;
grant select, insert, update, delete on table public.newsroom_editorial_review_states to service_role;
grant select, insert on table public.newsroom_editorial_review_batch_items to service_role;

revoke all on function public.newsroom_apply_editorial_review(text, jsonb)
  from public, anon, authenticated;
grant execute on function public.newsroom_apply_editorial_review(text, jsonb)
  to service_role;

alter function public.newsroom_apply_editorial_review(text, jsonb) owner to postgres;

comment on table public.newsroom_editorial_review_states is
  'Current human editorial decision for each Automatic Newsroom source article and the snapshot reviewed.';
comment on table public.newsroom_editorial_review_batches is
  'Immutable headers for editorial review blocks closed by the journalist.';
comment on table public.newsroom_editorial_review_batch_items is
  'Articles and exact snapshots included when an editorial review block was closed.';

commit;
