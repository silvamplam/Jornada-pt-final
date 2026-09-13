\set ON_ERROR_STOP on

do $bootstrap$
begin
  if not exists (
    select 1
    from pg_catalog.pg_roles
    where rolname = 'service_role'
  ) then
    execute 'create role service_role nologin';
  end if;
end
$bootstrap$;

create table public.matchdays (
  id uuid primary key
);

create table public.broadcast_channels (
  id uuid primary key,
  name text not null
);

create table public.matches (
  id uuid primary key,
  matchday_id uuid not null references public.matchdays(id),
  status text not null,
  scheduled_date date,
  kickoff_at timestamptz,
  broadcast_channel_id uuid references public.broadcast_channels(id)
);

\ir ../migrations/20260904003000_apply_matchday_agenda_tv_sync_v2.sql
\ir ../migrations/20260913182822_agenda_tv_sync_v2_preserve.sql

begin;

insert into public.matchdays (id)
values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');

insert into public.broadcast_channels (id, name)
values
  ('20000000-0000-4000-8000-000000000001', 'Sport TV 1'),
  ('20000000-0000-4000-8000-000000000002', 'Sport TV 2');

insert into public.matches (
  id,
  matchday_id,
  status,
  scheduled_date,
  kickoff_at,
  broadcast_channel_id
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'postponed',
    null,
    null,
    null
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'finished',
    null,
    null,
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'finished',
    '2026-09-14',
    '2026-09-14T19:00:00Z',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'scheduled',
    '2026-09-13',
    '2026-09-13T15:00:00Z',
    '20000000-0000-4000-8000-000000000001'
  ),
  (
    '30000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000002',
    'scheduled',
    '2026-09-20',
    '2026-09-20T17:00:00Z',
    null
  );

do $test$
declare
  v_matchday constant uuid :=
    '10000000-0000-4000-8000-000000000001';
  v_postponed constant uuid :=
    '30000000-0000-4000-8000-000000000001';
  v_finished_null constant uuid :=
    '30000000-0000-4000-8000-000000000002';
  v_finished_filled constant uuid :=
    '30000000-0000-4000-8000-000000000003';
  v_scheduled constant uuid :=
    '30000000-0000-4000-8000-000000000004';
  v_outside constant uuid :=
    '30000000-0000-4000-8000-000000000005';
  v_channel_one constant uuid :=
    '20000000-0000-4000-8000-000000000001';
  v_channel_two constant uuid :=
    '20000000-0000-4000-8000-000000000002';
  v_missing_channel constant uuid :=
    '20000000-0000-4000-8000-000000000099';
  v_payload jsonb;
  v_attempt jsonb;
  v_updated integer;
begin
  v_payload := pg_catalog.jsonb_build_array(
    pg_catalog.jsonb_build_object(
      'match_id', v_postponed,
      'preserve', true,
      'expected_scheduled_date', null,
      'expected_kickoff_at', null,
      'expected_broadcast_channel_id', null,
      'scheduled_date', null,
      'kickoff_at', null,
      'broadcast_channel_id', null
    ),
    pg_catalog.jsonb_build_object(
      'match_id', v_finished_null,
      'preserve', true,
      'expected_scheduled_date', null,
      'expected_kickoff_at', null,
      'expected_broadcast_channel_id', v_channel_one,
      'scheduled_date', null,
      'kickoff_at', null,
      'broadcast_channel_id', v_channel_one
    ),
    pg_catalog.jsonb_build_object(
      'match_id', v_finished_filled,
      'preserve', true,
      'expected_scheduled_date', '2026-09-14',
      'expected_kickoff_at', '2026-09-14T19:00:00Z',
      'expected_broadcast_channel_id', v_channel_one,
      'scheduled_date', '2026-09-15',
      'kickoff_at', '2026-09-15T19:00:00Z',
      'broadcast_channel_id', v_channel_two
    ),
    pg_catalog.jsonb_build_object(
      'match_id', v_scheduled,
      'preserve', false,
      'expected_scheduled_date', '2026-09-13',
      'expected_kickoff_at', '2026-09-13T15:00:00Z',
      'expected_broadcast_channel_id', v_channel_one,
      'scheduled_date', '2026-09-13',
      'kickoff_at', '2026-09-13T17:00:00Z',
      'broadcast_channel_id', v_channel_two
    )
  );

  v_updated := public.apply_matchday_agenda_tv_sync_v2(
    v_matchday,
    v_payload #- '{3,preserve}'
  );

  if v_updated <> 1 then
    raise exception 'test-01-expected-one-update: %', v_updated;
  end if;

  if not exists (
    select 1
    from public.matches
    where
      id = v_postponed
      and status = 'postponed'
      and scheduled_date is null
      and kickoff_at is null
      and broadcast_channel_id is null
  ) then
    raise exception 'test-01-postponed-was-not-preserved';
  end if;

  if not exists (
    select 1
    from public.matches
    where
      id = v_scheduled
      and status = 'scheduled'
      and scheduled_date = '2026-09-13'::date
      and kickoff_at = '2026-09-13T17:00:00Z'::timestamptz
      and broadcast_channel_id = v_channel_two
  ) then
    raise exception 'test-01-scheduled-update-not-applied';
  end if;

  raise notice 'PASS 01 - postponed NULL/NULL does not block legacy sync row';

  if not exists (
    select 1
    from public.matches
    where
      id = v_finished_null
      and status = 'finished'
      and scheduled_date is null
      and kickoff_at is null
      and broadcast_channel_id = v_channel_one
  ) then
    raise exception 'test-02-finished-null-was-not-preserved';
  end if;

  raise notice 'PASS 02 - finished NULL/NULL is preserved';

  if not exists (
    select 1
    from public.matches
    where
      id = v_finished_filled
      and status = 'finished'
      and scheduled_date = '2026-09-14'::date
      and kickoff_at = '2026-09-14T19:00:00Z'::timestamptz
      and broadcast_channel_id = v_channel_one
  ) then
    raise exception 'test-03-filled-preserve-row-was-written';
  end if;

  raise notice 'PASS 03 - preserve=true never writes filled values';

  update public.matches
  set
    scheduled_date = '2026-09-13',
    kickoff_at = '2026-09-13T15:00:00Z',
    broadcast_channel_id = v_channel_one
  where id = v_scheduled;

  v_attempt := pg_catalog.jsonb_set(
    v_payload,
    '{0,expected_kickoff_at}',
    pg_catalog.to_jsonb('2026-09-13T12:00:00Z'::text)
  );

  begin
    perform public.apply_matchday_agenda_tv_sync_v2(
      v_matchday,
      v_attempt
    );
    raise exception 'test-04-expected-stale-state';
  exception
    when others then
      if sqlerrm <> 'agenda-tv-v2-stale-state' then
        raise;
      end if;
  end;

  if not exists (
    select 1
    from public.matches
    where
      id = v_scheduled
      and kickoff_at = '2026-09-13T15:00:00Z'::timestamptz
      and broadcast_channel_id = v_channel_one
  ) then
    raise exception 'test-04-stale-state-did-not-rollback';
  end if;

  raise notice 'PASS 04 - stale preserve row aborts the whole operation';

  v_attempt := pg_catalog.jsonb_set(
    v_payload,
    '{3,scheduled_date}',
    'null'::jsonb
  );

  begin
    perform public.apply_matchday_agenda_tv_sync_v2(
      v_matchday,
      v_attempt
    );
    raise exception 'test-05-expected-incomplete-row';
  exception
    when others then
      if sqlerrm <> 'agenda-tv-v2-incomplete-row' then
        raise;
      end if;
  end;

  v_attempt := pg_catalog.jsonb_set(
    v_payload,
    '{3,kickoff_at}',
    'null'::jsonb
  );

  begin
    perform public.apply_matchday_agenda_tv_sync_v2(
      v_matchday,
      v_attempt
    );
    raise exception 'test-05-expected-incomplete-row';
  exception
    when others then
      if sqlerrm <> 'agenda-tv-v2-incomplete-row' then
        raise;
      end if;
  end;

  raise notice 'PASS 05 - sync row without date or time is rejected';

  begin
    perform public.apply_matchday_agenda_tv_sync_v2(
      v_matchday,
      v_payload - 3
    );
    raise exception 'test-06-expected-incomplete-matchday';
  exception
    when others then
      if sqlerrm <> 'agenda-tv-v2-incomplete-matchday' then
        raise;
      end if;
  end;

  raise notice 'PASS 06 - incomplete payload is rejected';

  v_attempt := pg_catalog.jsonb_set(
    v_payload,
    '{3}',
    v_payload -> 2
  );

  begin
    perform public.apply_matchday_agenda_tv_sync_v2(
      v_matchday,
      v_attempt
    );
    raise exception 'test-07-expected-duplicate-match';
  exception
    when others then
      if sqlerrm <> 'agenda-tv-v2-duplicate-match' then
        raise;
      end if;
  end;

  raise notice 'PASS 07 - duplicate rows are rejected';

  v_attempt := pg_catalog.jsonb_set(
    v_payload,
    '{0,match_id}',
    pg_catalog.to_jsonb(v_outside::text)
  );

  begin
    perform public.apply_matchday_agenda_tv_sync_v2(
      v_matchday,
      v_attempt
    );
    raise exception 'test-08-expected-outside-matchday';
  exception
    when others then
      if sqlerrm <> 'agenda-tv-v2-match-outside-matchday' then
        raise;
      end if;
  end;

  raise notice 'PASS 08 - match outside the matchday is rejected';

  v_attempt := pg_catalog.jsonb_set(
    v_payload,
    '{3,broadcast_channel_id}',
    pg_catalog.to_jsonb(v_missing_channel::text)
  );

  begin
    perform public.apply_matchday_agenda_tv_sync_v2(
      v_matchday,
      v_attempt
    );
    raise exception 'test-09-expected-channel-not-found';
  exception
    when others then
      if sqlerrm <> 'agenda-tv-v2-channel-not-found' then
        raise;
      end if;
  end;

  raise notice 'PASS 09 - invalid channel in a sync row is rejected';

  if not pg_catalog.has_function_privilege(
    'service_role',
    'public.apply_matchday_agenda_tv_sync_v2(uuid,jsonb)',
    'EXECUTE'
  ) then
    raise exception 'test-10-service-role-missing-execute';
  end if;

  if position(
    'preserve'
    in pg_catalog.pg_get_functiondef(
      'public.apply_matchday_agenda_tv_sync_v2(uuid,jsonb)'::regprocedure
    )
  ) = 0 then
    raise exception 'test-10-preserve-contract-not-installed';
  end if;

  raise notice 'PASS 10 - v2 signature and service-role contract remain installed';
end
$test$;

rollback;
