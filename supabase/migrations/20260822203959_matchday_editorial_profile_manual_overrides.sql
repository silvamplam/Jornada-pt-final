begin;

create table public.matchday_editorial_profile_manual_overrides (
  id uuid primary key default gen_random_uuid(),
  matchday_id uuid not null
    references public.matchdays(id)
    on delete cascade,
  profile_key text not null,
  source_type text not null,
  source_id text not null,
  zone_key text,
  sort_order integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_editorial_profile_manual_overrides_profile_key_check
    check (profile_key = 'liga_portugal_v1'),
  constraint matchday_editorial_profile_manual_overrides_source_type_check
    check (source_type = 'editorial_article'),
  constraint matchday_editorial_profile_manual_overrides_source_id_check
    check (btrim(source_id) <> ''),
  constraint matchday_editorial_profile_manual_overrides_zone_key_check
    check (
      zone_key is null
      or zone_key in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    ),
  constraint matchday_editorial_profile_manual_overrides_placement_check
    check (
      (zone_key is null and sort_order is null)
      or (zone_key is not null and (sort_order is null or sort_order > 0))
    ),
  constraint matchday_editorial_profile_manual_overrides_identity_key
    unique (matchday_id, profile_key, source_type, source_id)
);

create unique index matchday_editorial_profile_manual_overrides_slot_key
  on public.matchday_editorial_profile_manual_overrides (
    matchday_id,
    profile_key,
    zone_key,
    sort_order
  )
  where zone_key is not null
    and sort_order is not null;

comment on table public.matchday_editorial_profile_manual_overrides is
  'Manual thematic editorial decisions layered over, and independent from, the automatic profile state.';

comment on column public.matchday_editorial_profile_manual_overrides.zone_key is
  'NULL with NULL sort_order means explicitly kept in the bank; a value protects the publication in that zone.';

comment on column public.matchday_editorial_profile_manual_overrides.sort_order is
  'NULL with a zone protects zone membership but leaves position free; a positive value fixes the exact slot.';

alter table public.matchday_editorial_profile_manual_overrides
  enable row level security;

revoke all on table public.matchday_editorial_profile_manual_overrides
  from public, anon, authenticated, service_role;

grant select on table public.matchday_editorial_profile_manual_overrides
  to service_role;

create function public.apply_matchday_editorial_profile_manual_overrides(
  p_matchday_id uuid,
  p_profile_key text,
  p_overrides jsonb
)
returns table (applied_override_count integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_assignment_profile_key text;
  v_competition_slug text;
  v_item jsonb;
  v_source_id text;
  v_zone_key text;
  v_sort_order numeric;
  v_zone_capacity integer;
begin
  if p_matchday_id is null or p_profile_key is null or btrim(p_profile_key) = '' then
    raise exception 'matchday-editorial-profile-manual-overrides-invalid-input';
  end if;

  if p_profile_key <> 'liga_portugal_v1' then
    raise exception 'matchday-editorial-profile-manual-overrides-invalid-profile';
  end if;

  if p_overrides is null or jsonb_typeof(p_overrides) <> 'array' then
    raise exception 'matchday-editorial-profile-manual-overrides-invalid-payload';
  end if;

  select competition_row.slug
  into v_competition_slug
  from public.matchdays as matchday_row
  join public.seasons as season_row
    on season_row.id = matchday_row.season_id
  join public.competitions as competition_row
    on competition_row.id = season_row.competition_id
  where matchday_row.id = p_matchday_id
  for update of matchday_row;

  if not found then
    raise exception 'matchday-editorial-profile-manual-overrides-matchday-not-found';
  end if;

  -- The matchday lock serializes controlled assignment changes. Keep this
  -- assignment read unlocked before bank-row locks to avoid assignment -> bank
  -- ordering against the bank trigger's bank -> assignment refresh path.
  select assignment_row.profile_key
  into v_assignment_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id;

  if not found then
    raise exception 'matchday-editorial-profile-manual-overrides-assignment-not-found';
  end if;

  if v_assignment_profile_key <> p_profile_key then
    raise exception 'matchday-editorial-profile-manual-overrides-assignment-mismatch';
  end if;

  if v_competition_slug <> 'liga-portugal' then
    raise exception 'matchday-editorial-profile-manual-overrides-incompatible-competition';
  end if;

  for v_item in
    select payload_item.value
    from jsonb_array_elements(p_overrides) as payload_item(value)
  loop
    if jsonb_typeof(v_item) <> 'object'
      or not (v_item ?& array['source_type', 'source_id', 'zone_key', 'sort_order'])
      or (v_item - array['source_type', 'source_id', 'zone_key', 'sort_order']) <> '{}'::jsonb
    then
      raise exception 'matchday-editorial-profile-manual-overrides-invalid-payload';
    end if;

    if jsonb_typeof(v_item -> 'source_type') <> 'string'
      or v_item ->> 'source_type' <> 'editorial_article'
      or jsonb_typeof(v_item -> 'source_id') <> 'string'
      or btrim(v_item ->> 'source_id') = ''
    then
      raise exception 'matchday-editorial-profile-manual-overrides-invalid-source';
    end if;

    v_source_id := lower(btrim(v_item ->> 'source_id'));

    if jsonb_typeof(v_item -> 'zone_key') = 'null' then
      v_zone_key := null;
    elsif jsonb_typeof(v_item -> 'zone_key') = 'string' then
      v_zone_key := v_item ->> 'zone_key';
    else
      raise exception 'matchday-editorial-profile-manual-overrides-invalid-zone';
    end if;

    if v_zone_key is not null
      and v_zone_key not in (
        'benfica',
        'sporting',
        'fc_porto',
        'other_liga_clubs',
        'outside_liga_other'
      )
    then
      raise exception 'matchday-editorial-profile-manual-overrides-invalid-zone';
    end if;

    if jsonb_typeof(v_item -> 'sort_order') = 'null' then
      v_sort_order := null;
    elsif jsonb_typeof(v_item -> 'sort_order') = 'number'
      and (v_item ->> 'sort_order') ~ '^[0-9]+$'
    then
      v_sort_order := (v_item ->> 'sort_order')::numeric;
    else
      raise exception 'matchday-editorial-profile-manual-overrides-invalid-sort-order';
    end if;

    if v_zone_key is null and v_sort_order is not null then
      raise exception 'matchday-editorial-profile-manual-overrides-invalid-placement';
    end if;

    if v_zone_key is not null then
      v_zone_capacity := case v_zone_key
        when 'benfica' then 6
        when 'sporting' then 5
        when 'fc_porto' then 5
        when 'other_liga_clubs' then 6
        when 'outside_liga_other' then 5
      end;

      if v_sort_order is not null
        and (v_sort_order <= 0 or v_sort_order > v_zone_capacity)
      then
        raise exception 'matchday-editorial-profile-manual-overrides-invalid-sort-order';
      end if;
    end if;

    perform 1
      from public.matchday_editorial_bank_items as bank_item
      where bank_item.matchday_id = p_matchday_id
        and lower(btrim(bank_item.source_type)) = 'editorial_article'
        and lower(btrim(bank_item.source_id)) = v_source_id
        and lower(btrim(bank_item.status)) = 'active'
      for share;

    if not found then
      raise exception 'matchday-editorial-profile-manual-overrides-source-not-active';
    end if;
  end loop;

  if exists (
    select 1
    from jsonb_array_elements(p_overrides) as payload_item(value)
    group by
      lower(btrim(payload_item.value ->> 'source_type')),
      lower(btrim(payload_item.value ->> 'source_id'))
    having count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-manual-overrides-duplicate-source';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_overrides) as payload_item(value)
    where jsonb_typeof(payload_item.value -> 'zone_key') = 'string'
      and jsonb_typeof(payload_item.value -> 'sort_order') = 'number'
    group by
      payload_item.value ->> 'zone_key',
      (payload_item.value ->> 'sort_order')::integer
    having count(*) > 1
  ) then
    raise exception 'matchday-editorial-profile-manual-overrides-duplicate-slot';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_overrides) as payload_item(value)
    where jsonb_typeof(payload_item.value -> 'zone_key') = 'string'
    group by payload_item.value ->> 'zone_key'
    having count(*) > case payload_item.value ->> 'zone_key'
      when 'benfica' then 6
      when 'sporting' then 5
      when 'fc_porto' then 5
      when 'other_liga_clubs' then 6
      when 'outside_liga_other' then 5
      else 0
    end
  ) then
    raise exception 'matchday-editorial-profile-manual-overrides-zone-capacity-exceeded';
  end if;

  delete from public.matchday_editorial_profile_manual_overrides
  where matchday_id = p_matchday_id
    and profile_key = p_profile_key;

  insert into public.matchday_editorial_profile_manual_overrides (
    matchday_id,
    profile_key,
    source_type,
    source_id,
    zone_key,
    sort_order
  )
  select
    p_matchday_id,
    p_profile_key,
    'editorial_article',
    lower(btrim(payload_item.value ->> 'source_id')),
    case
      when jsonb_typeof(payload_item.value -> 'zone_key') = 'null' then null
      else payload_item.value ->> 'zone_key'
    end,
    case
      when jsonb_typeof(payload_item.value -> 'sort_order') = 'null' then null
      else (payload_item.value ->> 'sort_order')::integer
    end
  from jsonb_array_elements(p_overrides) as payload_item(value);

  return query
  select jsonb_array_length(p_overrides);
end;
$$;

revoke all on function public.apply_matchday_editorial_profile_manual_overrides(uuid, text, jsonb)
  from public, anon, authenticated, service_role;

grant execute on function public.apply_matchday_editorial_profile_manual_overrides(uuid, text, jsonb)
  to service_role;

comment on function public.apply_matchday_editorial_profile_manual_overrides(uuid, text, jsonb) is
  'Atomically replaces manual overrides after validating assignment, competition, active canonical publications, zone capacity and fixed slots. It never changes automatic profile state.';

commit;
