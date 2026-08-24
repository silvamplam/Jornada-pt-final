alter table public.matchday_live_layout_items
  add column if not exists source_type text,
  add column if not exists source_id text;

with resolved as (
  select
    live_row.id as live_id,
    bank_row.source_type,
    bank_row.source_id,
    row_number() over (
      partition by live_row.id
      order by bank_row.created_at asc, bank_row.id asc
    ) as candidate_order,
    count(*) over (
      partition by live_row.id
    ) as candidate_count
  from public.matchday_live_layout_items as live_row
  join public.matchday_editorial_bank_items as bank_row
    on bank_row.matchday_id = live_row.matchday_id
   and bank_row.status = 'active'
   and regexp_replace(
         split_part(
           split_part(
             coalesce(bank_row.link_url, ''),
             '?',
             1
           ),
           '#',
           1
         ),
         '/$',
         ''
       ) = regexp_replace(
         split_part(
           split_part(
             coalesce(live_row.link_url, ''),
             '?',
             1
           ),
           '#',
           1
         ),
         '/$',
         ''
       )
  where live_row.slot_type in (
    'live_four_news:1',
    'live_four_news:2',
    'live_four_news:3',
    'live_four_news:4'
  )
    and live_row.source_type is null
    and live_row.source_id is null
)
update public.matchday_live_layout_items as live_row
set source_type = resolved.source_type,
    source_id = resolved.source_id,
    article_id = case
      when lower(
        btrim(
          coalesce(
            resolved.source_type,
            ''
          )
        )
      ) = 'editorial_article'
       and resolved.source_id
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then resolved.source_id::uuid
      else null
    end
from resolved
where live_row.id = resolved.live_id
  and resolved.candidate_order = 1
  and resolved.candidate_count = 1;

create unique index
if not exists matchday_live_layout_selection_source_unique
on public.matchday_live_layout_items (
  matchday_id,
  lower(source_type),
  lower(source_id)
)
where slot_type in (
  'live_four_news:1',
  'live_four_news:2',
  'live_four_news:3',
  'live_four_news:4'
)
  and source_type is not null
  and source_id is not null;

create or replace function
public.set_matchday_editorial_selection_item(
  p_matchday_id uuid,
  p_position integer,
  p_bank_item_id uuid
)
returns uuid
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_slot_type text;
  v_bank public.matchday_editorial_bank_items%rowtype;
  v_result_id uuid;
  v_source_type text;
  v_source_id text;
begin
  if p_matchday_id is null
    or p_bank_item_id is null
    or p_position not between 1 and 4
  then
    raise exception
      'matchday-editorial-selection-invalid-input';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_profile_assignments
      as assignment_row
    where assignment_row.matchday_id = p_matchday_id
      and assignment_row.profile_key = 'liga_portugal_v1'
  ) then
    raise exception
      'matchday-editorial-selection-profile-required';
  end if;

  select bank_row.*
  into v_bank
  from public.matchday_editorial_bank_items as bank_row
  where bank_row.id = p_bank_item_id
    and bank_row.matchday_id = p_matchday_id
    and bank_row.status = 'active'
  limit 1;

  if not found then
    raise exception
      'matchday-editorial-selection-bank-item-not-found';
  end if;

  v_source_type :=
    lower(
      btrim(
        coalesce(
          v_bank.source_type,
          ''
        )
      )
    );

  v_source_id :=
    btrim(
      coalesce(
        v_bank.source_id,
        ''
      )
    );

  if v_source_type
      not in (
        'editorial_article',
        'editorial_content'
      )
    or v_source_id = ''
    or btrim(
      coalesce(
        v_bank.title,
        ''
      )
    ) = ''
    or btrim(
      coalesce(
        v_bank.link_url,
        ''
      )
    ) = ''
  then
    raise exception
      'matchday-editorial-selection-bank-item-invalid';
  end if;

  v_slot_type :=
    'live_four_news:'
    || p_position::text;

  delete
  from public.matchday_live_layout_items
    as live_row
  where live_row.matchday_id = p_matchday_id
    and live_row.slot_type in (
      'live_four_news:1',
      'live_four_news:2',
      'live_four_news:3',
      'live_four_news:4'
    )
    and live_row.slot_type <> v_slot_type
    and lower(
      btrim(
        coalesce(
          live_row.source_type,
          ''
        )
      )
    ) = v_source_type
    and btrim(
      coalesce(
        live_row.source_id,
        ''
      )
    ) = v_source_id;

  insert into public.matchday_live_layout_items (
    matchday_id,
    slot_type,
    article_id,
    source_type,
    source_id,
    label,
    title,
    subtitle,
    image_url,
    link_url,
    updated_at
  )
  values (
    p_matchday_id,
    v_slot_type,
    case
      when v_source_type = 'editorial_article'
       and v_source_id
         ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then v_source_id::uuid
      else null
    end,
    v_source_type,
    v_source_id,
    nullif(
      btrim(v_bank.label),
      ''
    ),
    btrim(v_bank.title),
    nullif(
      btrim(v_bank.subtitle),
      ''
    ),
    nullif(
      btrim(v_bank.image_url),
      ''
    ),
    nullif(
      btrim(v_bank.link_url),
      ''
    ),
    pg_catalog.now()
  )
  on conflict (
    matchday_id,
    slot_type
  )
  do update
  set article_id = excluded.article_id,
      source_type = excluded.source_type,
      source_id = excluded.source_id,
      label = excluded.label,
      title = excluded.title,
      subtitle = excluded.subtitle,
      image_url = excluded.image_url,
      link_url = excluded.link_url,
      updated_at = excluded.updated_at
  returning id into v_result_id;

  return v_result_id;
end;
$function$;

create or replace function
public.clear_matchday_editorial_selection_item(
  p_matchday_id uuid,
  p_position integer
)
returns boolean
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_deleted integer := 0;
begin
  if p_matchday_id is null
    or p_position not between 1 and 4
  then
    raise exception
      'matchday-editorial-selection-invalid-input';
  end if;

  if not exists (
    select 1
    from public.matchday_editorial_profile_assignments
      as assignment_row
    where assignment_row.matchday_id = p_matchday_id
      and assignment_row.profile_key = 'liga_portugal_v1'
  ) then
    raise exception
      'matchday-editorial-selection-profile-required';
  end if;

  delete
  from public.matchday_live_layout_items as live_row
  where live_row.matchday_id = p_matchday_id
    and live_row.slot_type =
      'live_four_news:'
      || p_position::text;

  get diagnostics
    v_deleted = row_count;

  return v_deleted > 0;
end;
$function$;

create or replace function
public.sync_matchday_editorial_selection_from_bank()
returns trigger
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_source_type text;
  v_source_id text;
begin
  if tg_op not in (
    'INSERT',
    'UPDATE'
  ) then
    return new;
  end if;

  v_source_type :=
    lower(
      btrim(
        coalesce(
          new.source_type,
          ''
        )
      )
    );

  v_source_id :=
    btrim(
      coalesce(
        new.source_id,
        ''
      )
    );

  if v_source_type
      not in (
        'editorial_article',
        'editorial_content'
      )
    or v_source_id = ''
  then
    return new;
  end if;

  update public.matchday_live_layout_items
    as live_row
  set article_id = case
        when v_source_type = 'editorial_article'
         and v_source_id
           ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then v_source_id::uuid
        else null
      end,
      label =
        nullif(
          btrim(new.label),
          ''
        ),
      title =
        nullif(
          btrim(new.title),
          ''
        ),
      subtitle =
        nullif(
          btrim(new.subtitle),
          ''
        ),
      image_url =
        nullif(
          btrim(new.image_url),
          ''
        ),
      link_url =
        nullif(
          btrim(new.link_url),
          ''
        ),
      updated_at =
        pg_catalog.now()
  where live_row.matchday_id = new.matchday_id
    and live_row.slot_type in (
      'live_four_news:1',
      'live_four_news:2',
      'live_four_news:3',
      'live_four_news:4'
    )
    and lower(
      btrim(
        coalesce(
          live_row.source_type,
          ''
        )
      )
    ) = v_source_type
    and btrim(
      coalesce(
        live_row.source_id,
        ''
      )
    ) = v_source_id;

  return new;
end;
$function$;

drop trigger
if exists sync_matchday_editorial_selection_from_bank
on public.matchday_editorial_bank_items;

create trigger
sync_matchday_editorial_selection_from_bank
after insert or update
on public.matchday_editorial_bank_items
for each row
execute function
public.sync_matchday_editorial_selection_from_bank();

revoke all
on function
public.set_matchday_editorial_selection_item(
  uuid,
  integer,
  uuid
)
from public;

revoke all
on function
public.set_matchday_editorial_selection_item(
  uuid,
  integer,
  uuid
)
from anon;

revoke all
on function
public.set_matchday_editorial_selection_item(
  uuid,
  integer,
  uuid
)
from authenticated;

grant execute
on function
public.set_matchday_editorial_selection_item(
  uuid,
  integer,
  uuid
)
to service_role;

revoke all
on function
public.clear_matchday_editorial_selection_item(
  uuid,
  integer
)
from public;

revoke all
on function
public.clear_matchday_editorial_selection_item(
  uuid,
  integer
)
from anon;

revoke all
on function
public.clear_matchday_editorial_selection_item(
  uuid,
  integer
)
from authenticated;

grant execute
on function
public.clear_matchday_editorial_selection_item(
  uuid,
  integer
)
to service_role;