begin;

do $$
declare
  kickoff_data_type text;
  kickoff_udt_name text;
  kickoff_is_nullable text;
begin
  if to_regclass('public.matches') is null then
    raise exception 'Preflight failed: table public.matches does not exist.';
  end if;

  select columns.data_type, columns.udt_name, columns.is_nullable
    into kickoff_data_type, kickoff_udt_name, kickoff_is_nullable
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'matches'
    and columns.column_name = 'kickoff_at';

  if not found then
    raise exception 'Preflight failed: public.matches.kickoff_at does not exist.';
  end if;

  if kickoff_data_type <> 'timestamp with time zone' or kickoff_udt_name <> 'timestamptz' then
    raise exception
      'Preflight failed: public.matches.kickoff_at must be timestamptz, found data_type=%, udt_name=%.',
      kickoff_data_type,
      kickoff_udt_name;
  end if;

  if kickoff_is_nullable <> 'NO' then
    raise exception
      'Preflight failed: public.matches.kickoff_at must remain NOT NULL in this phase, found is_nullable=%.',
      kickoff_is_nullable;
  end if;

  if exists (
    select 1
    from information_schema.columns
    where columns.table_schema = 'public'
      and columns.table_name = 'matches'
      and columns.column_name = 'scheduled_date'
  ) then
    raise exception 'Preflight failed: public.matches.scheduled_date already exists.';
  end if;

  if to_regprocedure('public.sync_match_scheduled_date()') is not null then
    raise exception 'Preflight failed: function public.sync_match_scheduled_date() already exists.';
  end if;

  if exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.matches'::regclass
      and tgname = 'sync_match_scheduled_date_before_write'
      and not tgisinternal
  ) then
    raise exception 'Preflight failed: trigger sync_match_scheduled_date_before_write already exists.';
  end if;
end
$$;

alter table public.matches
  add column scheduled_date date;

update public.matches
set scheduled_date = (kickoff_at at time zone 'Europe/Lisbon')::date;

do $$
declare
  null_scheduled_dates bigint;
begin
  select count(*)
    into null_scheduled_dates
  from public.matches
  where scheduled_date is null;

  if null_scheduled_dates <> 0 then
    raise exception
      'Backfill failed: % public.matches rows still have scheduled_date NULL.',
      null_scheduled_dates;
  end if;
end
$$;

alter table public.matches
  alter column scheduled_date set not null;


create function public.sync_match_scheduled_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.scheduled_date is null then
    if new.kickoff_at is not null then
      new.scheduled_date := (new.kickoff_at at time zone 'Europe/Lisbon')::date;
    end if;
  elsif tg_op = 'UPDATE' then
    if new.kickoff_at is distinct from old.kickoff_at
      and new.kickoff_at is not null
      and new.scheduled_date is not distinct from old.scheduled_date then
      new.scheduled_date := (new.kickoff_at at time zone 'Europe/Lisbon')::date;
    end if;
  end if;

  return new;
end
$$;

create trigger sync_match_scheduled_date_before_write
before insert or update of kickoff_at, scheduled_date on public.matches
for each row
execute function public.sync_match_scheduled_date();

do $$
declare
  total_matches bigint;
  scheduled_date_count bigint;
  kickoff_at_count bigint;
  scheduled_data_type text;
  scheduled_udt_name text;
  scheduled_is_nullable text;
  kickoff_data_type text;
  kickoff_udt_name text;
  kickoff_is_nullable text;
  schedule_trigger_events integer;
begin
  select count(*), count(scheduled_date), count(kickoff_at)
    into total_matches, scheduled_date_count, kickoff_at_count
  from public.matches;

  select columns.data_type, columns.udt_name, columns.is_nullable
    into scheduled_data_type, scheduled_udt_name, scheduled_is_nullable
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'matches'
    and columns.column_name = 'scheduled_date';

  if not found
    or scheduled_data_type <> 'date'
    or scheduled_udt_name <> 'date'
    or scheduled_is_nullable <> 'NO' then
    raise exception
      'Postflight failed: public.matches.scheduled_date must be date NOT NULL; data_type=%, udt_name=%, is_nullable=%.',
      scheduled_data_type,
      scheduled_udt_name,
      scheduled_is_nullable;
  end if;

  select columns.data_type, columns.udt_name, columns.is_nullable
    into kickoff_data_type, kickoff_udt_name, kickoff_is_nullable
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'matches'
    and columns.column_name = 'kickoff_at';

  if not found
    or kickoff_data_type <> 'timestamp with time zone'
    or kickoff_udt_name <> 'timestamptz'
    or kickoff_is_nullable <> 'NO' then
    raise exception
      'Postflight failed: public.matches.kickoff_at must remain timestamptz NOT NULL; data_type=%, udt_name=%, is_nullable=%.',
      kickoff_data_type,
      kickoff_udt_name,
      kickoff_is_nullable;
  end if;

  if scheduled_date_count <> total_matches then
    raise exception
      'Postflight failed: scheduled_date count (%) differs from total matches (%).',
      scheduled_date_count,
      total_matches;
  end if;

  if kickoff_at_count <> total_matches then
    raise exception
      'Postflight failed: kickoff_at count (%) differs from total matches (%).',
      kickoff_at_count,
      total_matches;
  end if;

  select count(distinct triggers.event_manipulation)
    into schedule_trigger_events
  from information_schema.triggers
  where triggers.trigger_schema = 'public'
    and triggers.event_object_table = 'matches'
    and triggers.trigger_name = 'sync_match_scheduled_date_before_write'
    and triggers.event_manipulation in ('INSERT', 'UPDATE');

  if schedule_trigger_events <> 2 then
    raise exception
      'Postflight failed: trigger sync_match_scheduled_date_before_write must cover INSERT and UPDATE, found % event types.',
      schedule_trigger_events;
  end if;

  if to_regprocedure('public.sync_match_scheduled_date()') is null then
    raise exception 'Postflight failed: function public.sync_match_scheduled_date() was not created.';
  end if;

  raise notice
    'Postflight passed: total_matches=%, scheduled_date_not_null=%, kickoff_at_not_null=%.',
    total_matches,
    scheduled_date_count,
    kickoff_at_count;
end
$$;

commit;
