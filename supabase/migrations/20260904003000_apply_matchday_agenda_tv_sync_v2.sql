begin;

create or replace function public.apply_matchday_agenda_tv_sync_v2(
  p_matchday_id uuid,
  p_rows jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected_count integer;
  v_received_count integer;
  v_updated_count integer;
begin
  if p_matchday_id is null then
    raise exception 'agenda-tv-v2-missing-matchday';
  end if;

  if jsonb_typeof(p_rows) is distinct from 'array' then
    raise exception 'agenda-tv-v2-invalid-payload';
  end if;

  select count(*)
  into v_expected_count
  from public.matches
  where matchday_id = p_matchday_id;

  if v_expected_count = 0 then
    raise exception 'agenda-tv-v2-empty-matchday';
  end if;

  v_received_count := jsonb_array_length(p_rows);

  if v_received_count <> v_expected_count then
    raise exception 'agenda-tv-v2-incomplete-matchday';
  end if;

  if exists (
    select 1
    from (
      select
        (item ->> 'match_id')::uuid as match_id,
        count(*) as occurrences
      from jsonb_array_elements(p_rows) as item
      group by 1
    ) as duplicated
    where duplicated.occurrences <> 1
  ) then
    raise exception 'agenda-tv-v2-duplicate-match';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item
    where
      nullif(item ->> 'match_id', '') is null
      or nullif(item ->> 'scheduled_date', '') is null
      or nullif(item ->> 'kickoff_at', '') is null
  ) then
    raise exception 'agenda-tv-v2-incomplete-row';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item
    where not exists (
      select 1
      from public.matches as m
      where
        m.id = (item ->> 'match_id')::uuid
        and m.matchday_id = p_matchday_id
    )
  ) then
    raise exception 'agenda-tv-v2-match-outside-matchday';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item
    where
      nullif(item ->> 'broadcast_channel_id', '') is not null
      and not exists (
        select 1
        from public.broadcast_channels as channel
        where
          channel.id =
            (item ->> 'broadcast_channel_id')::uuid
      )
  ) then
    raise exception 'agenda-tv-v2-channel-not-found';
  end if;

  if exists (
    select 1
    from jsonb_array_elements(p_rows) as item
    where
      (
        (
          (item ->> 'kickoff_at')::timestamptz
          at time zone 'Europe/Lisbon'
        )::date
      )
      is distinct from
      (item ->> 'scheduled_date')::date
  ) then
    raise exception 'agenda-tv-v2-date-kickoff-mismatch';
  end if;

  if exists (
    with requested as (
      select
        (item ->> 'match_id')::uuid as match_id,
        nullif(
          item ->> 'expected_scheduled_date',
          ''
        )::date as expected_scheduled_date,
        nullif(
          item ->> 'expected_kickoff_at',
          ''
        )::timestamptz as expected_kickoff_at,
        nullif(
          item ->> 'expected_broadcast_channel_id',
          ''
        )::uuid as expected_broadcast_channel_id
      from jsonb_array_elements(p_rows) as item
    )
    select 1
    from requested
    join public.matches as m
      on m.id = requested.match_id
    where
      m.scheduled_date
        is distinct from
        requested.expected_scheduled_date
      or m.kickoff_at
        is distinct from
        requested.expected_kickoff_at
      or m.broadcast_channel_id
        is distinct from
        requested.expected_broadcast_channel_id
  ) then
    raise exception 'agenda-tv-v2-stale-state';
  end if;

  with requested as (
    select
      (item ->> 'match_id')::uuid as match_id,
      (item ->> 'scheduled_date')::date as scheduled_date,
      (item ->> 'kickoff_at')::timestamptz as kickoff_at,
      nullif(
        item ->> 'broadcast_channel_id',
        ''
      )::uuid as broadcast_channel_id
    from jsonb_array_elements(p_rows) as item
  )
  update public.matches as m
  set
    scheduled_date = requested.scheduled_date,
    kickoff_at = requested.kickoff_at,
    broadcast_channel_id = case
      when requested.broadcast_channel_id is null
        then m.broadcast_channel_id
      else requested.broadcast_channel_id
    end
  from requested
  where
    m.id = requested.match_id
    and m.matchday_id = p_matchday_id
    and (
      m.scheduled_date
        is distinct from
        requested.scheduled_date
      or m.kickoff_at
        is distinct from
        requested.kickoff_at
      or (
        requested.broadcast_channel_id is not null
        and m.broadcast_channel_id
          is distinct from
          requested.broadcast_channel_id
      )
    );

  get diagnostics v_updated_count = row_count;

  return v_updated_count;
end;
$$;

revoke all
on function public.apply_matchday_agenda_tv_sync_v2(uuid, jsonb)
from public;

grant execute
on function public.apply_matchday_agenda_tv_sync_v2(uuid, jsonb)
to service_role;

comment on function public.apply_matchday_agenda_tv_sync_v2(uuid, jsonb)
is
  'Aplica data/hora de uma jornada de forma atómica; canal TV só muda quando existe confirmação exata no catálogo. Estado concorrente continua protegido por expected_*.';

notify pgrst, 'reload schema';

commit;
