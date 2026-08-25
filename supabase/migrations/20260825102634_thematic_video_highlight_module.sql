begin;

alter table public.matchday_editorial_profile_reconcile_control
  drop constraint if exists
    matchday_editorial_profile_reconcile_control_block_order_check;

alter table public.matchday_editorial_profile_reconcile_control
  alter column thematic_block_order set default array[
    'benfica',
    'sporting',
    'fc_porto',
    'other_liga_clubs',
    'outside_liga_other',
    'latest',
    'video'
  ]::text[];

alter table public.matchday_editorial_profile_reconcile_control
  add constraint
    matchday_editorial_profile_reconcile_control_block_order_check
  check (
    pg_catalog.cardinality(thematic_block_order) in (6, 7)
    and thematic_block_order <@ array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other',
      'latest',
      'video'
    ]::text[]
    and thematic_block_order @> array[
      'benfica',
      'sporting',
      'fc_porto',
      'other_liga_clubs',
      'outside_liga_other',
      'latest'
    ]::text[]
    and (
      pg_catalog.cardinality(thematic_block_order) = 6
      or thematic_block_order @> array['video']::text[]
    )
  );

update public.matchday_editorial_profile_reconcile_control
set thematic_block_order =
      thematic_block_order || array['video']::text[],
    updated_at = pg_catalog.now()
where pg_catalog.cardinality(thematic_block_order) = 6
  and not thematic_block_order @> array['video']::text[];

comment on column
  public.matchday_editorial_profile_reconcile_control.thematic_block_order
is
  'Applied order of the five thematic semantic blocks, Latest, and the unified Video + Matchday Highlight module. Six-entry historical writers remain accepted and readers append Video without reordering existing entries.';

create or replace function
public.apply_matchday_editorial_profile_workspace_v6(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb,
  p_opening jsonb,
  p_page_controls jsonb,
  p_selection_bank_item_ids jsonb,
  p_video_module jsonb
)
returns table(
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer,
  applied_opening_count integer,
  applied_selection_count integer
)
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_apply record;
  v_bank public.matchday_editorial_bank_items%rowtype;
  v_current_block_order text[];
  v_requested_block_order text[];
  v_legacy_page_controls jsonb;
  v_highlight_action text;
  v_highlight_bank_item_id uuid;
  v_requested_active boolean;
  v_current_active boolean;
  v_module_changed boolean := false;
  v_block_order_changed boolean := false;
  v_final_revision bigint;
  v_now timestamptz := pg_catalog.now();
begin
  if p_page_controls is null
    or pg_catalog.jsonb_typeof(p_page_controls) <> 'object'
    or pg_catalog.jsonb_typeof(
      p_page_controls -> 'thematic_block_order'
    ) <> 'array'
  then
    raise exception
      'matchday-editorial-profile-workspace-v6-invalid-page-controls';
  end if;

  if pg_catalog.jsonb_array_length(
      p_page_controls -> 'thematic_block_order'
    ) <> 7
    or (
      select count(distinct item.value #>> '{}')
      from pg_catalog.jsonb_array_elements(
        p_page_controls -> 'thematic_block_order'
      ) as item(value)
    ) <> 7
    or exists (
      select 1
      from pg_catalog.jsonb_array_elements(
        p_page_controls -> 'thematic_block_order'
      ) as item(value)
      where pg_catalog.jsonb_typeof(item.value) <> 'string'
        or item.value #>> '{}' not in (
          'benfica',
          'sporting',
          'fc_porto',
          'other_liga_clubs',
          'outside_liga_other',
          'latest',
          'video'
        )
    )
  then
    raise exception
      'matchday-editorial-profile-workspace-v6-invalid-block-order';
  end if;

  if p_video_module is null
    or pg_catalog.jsonb_typeof(p_video_module) <> 'object'
    or not (
      p_video_module ?& array[
        'active',
        'highlight_action',
        'highlight_bank_item_id'
      ]
    )
    or (
      p_video_module - array[
        'active',
        'highlight_action',
        'highlight_bank_item_id'
      ]::text[]
    ) <> '{}'::jsonb
    or pg_catalog.jsonb_typeof(
      p_video_module -> 'active'
    ) <> 'boolean'
    or pg_catalog.jsonb_typeof(
      p_video_module -> 'highlight_action'
    ) <> 'string'
    or p_video_module ->> 'highlight_action'
      not in ('preserve', 'remove', 'replace')
    or pg_catalog.jsonb_typeof(
      p_video_module -> 'highlight_bank_item_id'
    ) not in ('string', 'null')
  then
    raise exception
      'matchday-editorial-profile-workspace-v6-invalid-video-module';
  end if;

  v_requested_active :=
    (p_video_module ->> 'active')::boolean;
  v_highlight_action :=
    p_video_module ->> 'highlight_action';

  if v_highlight_action = 'replace' then
    if coalesce(
      p_video_module ->> 'highlight_bank_item_id',
      ''
    ) !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then
      raise exception
        'matchday-editorial-profile-workspace-v6-invalid-highlight-source';
    end if;

    v_highlight_bank_item_id :=
      (p_video_module ->> 'highlight_bank_item_id')::uuid;
  elsif p_video_module ->> 'highlight_bank_item_id'
    is not null
  then
    raise exception
      'matchday-editorial-profile-workspace-v6-unexpected-highlight-source';
  end if;

  select
    control_row.thematic_block_order
  into v_current_block_order
  from public.matchday_editorial_profile_reconcile_control
    as control_row
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key;

  select
    coalesce(
      editorial_row.complementary_mode = 'roundup_video',
      false
    )
  into v_current_active
  from public.matchday_editorials as editorial_row
  where editorial_row.matchday_id = p_matchday_id;

  select pg_catalog.array_agg(
    item.value #>> '{}'
    order by item.ordinality
  )
  into v_requested_block_order
  from pg_catalog.jsonb_array_elements(
    p_page_controls -> 'thematic_block_order'
  ) with ordinality as item(value, ordinality);

  v_block_order_changed :=
    v_current_block_order is distinct from v_requested_block_order;
  v_module_changed :=
    v_current_active is distinct from v_requested_active
    or v_highlight_action <> 'preserve';

  select pg_catalog.jsonb_set(
    p_page_controls,
    '{thematic_block_order}',
    pg_catalog.coalesce(
      pg_catalog.jsonb_agg(
        item.value
        order by item.ordinality
      ) filter (
        where item.value #>> '{}' <> 'video'
      ),
      '[]'::jsonb
    )
  )
  into v_legacy_page_controls
  from pg_catalog.jsonb_array_elements(
    p_page_controls -> 'thematic_block_order'
  ) with ordinality as item(value, ordinality);

  select *
  into v_apply
  from public.apply_matchday_editorial_profile_workspace_v5(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids,
    p_opening,
    v_legacy_page_controls,
    p_selection_bank_item_ids
  );

  if v_highlight_action = 'replace' then
    select bank_row.*
    into v_bank
    from public.matchday_editorial_bank_items as bank_row
    where bank_row.id = v_highlight_bank_item_id
      and bank_row.matchday_id = p_matchday_id
      and pg_catalog.lower(
        pg_catalog.btrim(
          coalesce(bank_row.status, '')
        )
      ) = 'active'
      and pg_catalog.lower(
        pg_catalog.btrim(
          coalesce(bank_row.source_type, '')
        )
      ) in ('editorial_article', 'editorial_content')
      and nullif(
        pg_catalog.btrim(bank_row.title),
        ''
      ) is not null
      and nullif(
        pg_catalog.btrim(bank_row.link_url),
        ''
      ) is not null
    for share;

    if not found then
      raise exception
        'matchday-editorial-profile-workspace-v6-highlight-source-not-found';
    end if;
  end if;

  update public.matchday_editorial_profile_reconcile_control
    as control_row
  set thematic_block_order = v_requested_block_order,
      updated_at = case
        when v_block_order_changed
          then v_now
        else control_row.updated_at
      end
  where control_row.matchday_id = p_matchday_id
    and control_row.profile_key = p_profile_key;

  if not found then
    raise exception
      'matchday-editorial-profile-workspace-v6-reconcile-control-not-found';
  end if;

  if v_module_changed then
    update public.matchday_editorials as editorial_row
    set complementary_mode = case
          when v_requested_active
            then 'roundup_video'
          else 'none'
        end,
        complementary_status = case
          when v_highlight_action = 'remove'
            then 'draft'
          when v_highlight_action = 'replace'
            then 'published'
          else editorial_row.complementary_status
        end,
        complementary_label = case
          when v_highlight_action = 'remove'
            then null
          when v_highlight_action = 'replace'
            then nullif(pg_catalog.btrim(v_bank.label), '')
          else editorial_row.complementary_label
        end,
        complementary_title = case
          when v_highlight_action = 'remove'
            then null
          when v_highlight_action = 'replace'
            then pg_catalog.btrim(v_bank.title)
          else editorial_row.complementary_title
        end,
        complementary_text = case
          when v_highlight_action = 'remove'
            then null
          when v_highlight_action = 'replace'
            then nullif(pg_catalog.btrim(v_bank.subtitle), '')
          else editorial_row.complementary_text
        end,
        complementary_image_url = case
          when v_highlight_action = 'remove'
            then null
          when v_highlight_action = 'replace'
            then nullif(pg_catalog.btrim(v_bank.image_url), '')
          else editorial_row.complementary_image_url
        end,
        complementary_link_url = case
          when v_highlight_action = 'remove'
            then null
          when v_highlight_action = 'replace'
            then pg_catalog.btrim(v_bank.link_url)
          else editorial_row.complementary_link_url
        end,
        updated_at = v_now
    where editorial_row.matchday_id = p_matchday_id;

    if not found then
      raise exception
        'matchday-editorial-profile-workspace-v6-editorial-not-found';
    end if;
  end if;

  if v_requested_active then
    if not exists (
      select 1
      from public.matchday_roundup_items as roundup_row
      where roundup_row.matchday_id = p_matchday_id
        and pg_catalog.lower(
          pg_catalog.btrim(
            coalesce(roundup_row.status, '')
          )
        ) = 'published'
        and nullif(
          pg_catalog.btrim(roundup_row.video_url),
          ''
        ) is not null
    ) then
      raise exception
        'matchday-editorial-profile-workspace-v6-video-required';
    end if;

    if not exists (
      select 1
      from public.matchday_editorials as editorial_row
      where editorial_row.matchday_id = p_matchday_id
        and editorial_row.complementary_status = 'published'
        and pg_catalog.num_nonnulls(
          nullif(pg_catalog.btrim(editorial_row.complementary_title), ''),
          nullif(pg_catalog.btrim(editorial_row.complementary_text), ''),
          nullif(pg_catalog.btrim(editorial_row.complementary_image_url), ''),
          nullif(pg_catalog.btrim(editorial_row.complementary_link_url), '')
        ) > 0
    ) then
      raise exception
        'matchday-editorial-profile-workspace-v6-highlight-required';
    end if;
  end if;

  v_final_revision := v_apply.revision;

  if (
      v_block_order_changed
      or v_module_changed
    )
    and v_final_revision = p_expected_revision
  then
    update public.matchday_editorial_profile_reconcile_control
      as control_row
    set revision = control_row.revision + 1,
        last_applied_at = v_now,
        updated_at = v_now
    where control_row.matchday_id = p_matchday_id
      and control_row.profile_key = p_profile_key
    returning control_row.revision
    into v_final_revision;
  end if;

  return query
  select
    v_final_revision,
    token_row.state_token,
    v_apply.applied_override_count,
    v_apply.applied_zone_item_count,
    v_apply.applied_faixa_count,
    v_apply.applied_opening_count,
    v_apply.applied_selection_count
  from public.matchday_editorial_profile_workspace_token(
    p_matchday_id,
    p_profile_key
  ) as token_row;
end;
$function$;

revoke all
on function
public.apply_matchday_editorial_profile_workspace_v6(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
from public, anon, authenticated;

grant execute
on function
public.apply_matchday_editorial_profile_workspace_v6(
  uuid,
  text,
  bigint,
  text,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb,
  jsonb
)
to service_role;

commit;
