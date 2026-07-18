begin;

do $$
declare
  scheduled_data_type text;
  scheduled_udt_name text;
  scheduled_is_nullable text;
  kickoff_data_type text;
  kickoff_udt_name text;
  kickoff_is_nullable text;
  total_matches bigint;
  scheduled_date_count bigint;
  kickoff_at_count bigint;
  matches_fingerprint text;
  trigger_enabled "char";
  trigger_event_count integer;
  trigger_update_column_count integer;
begin
  if to_regclass('public.matches') is null then
    raise exception 'Preflight failed: table public.matches does not exist.';
  end if;

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
      'Preflight failed: public.matches.scheduled_date must be date NOT NULL; data_type=%, udt_name=%, is_nullable=%.',
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
      'Preflight failed: public.matches.kickoff_at must be timestamptz NOT NULL; data_type=%, udt_name=%, is_nullable=%.',
      kickoff_data_type,
      kickoff_udt_name,
      kickoff_is_nullable;
  end if;

  select count(*), count(scheduled_date), count(kickoff_at)
    into total_matches, scheduled_date_count, kickoff_at_count
  from public.matches;

  if total_matches <> 552
    or scheduled_date_count <> 552
    or kickoff_at_count <> 552 then
    raise exception
      'Preflight failed: expected total=552, scheduled_date_not_null=552, kickoff_at_not_null=552; found total=%, scheduled_date_not_null=%, kickoff_at_not_null=%.',
      total_matches,
      scheduled_date_count,
      kickoff_at_count;
  end if;

  if to_regprocedure('public.sync_match_scheduled_date()') is null then
    raise exception 'Preflight failed: function public.sync_match_scheduled_date() does not exist.';
  end if;

  select triggers.tgenabled
    into trigger_enabled
  from pg_trigger as triggers
  where triggers.tgrelid = 'public.matches'::regclass
    and triggers.tgname = 'sync_match_scheduled_date_before_write'
    and not triggers.tgisinternal;

  if not found then
    raise exception 'Preflight failed: trigger sync_match_scheduled_date_before_write does not exist on public.matches.';
  end if;

  if trigger_enabled not in ('O', 'A') then
    raise exception 'Preflight failed: trigger sync_match_scheduled_date_before_write is not active; tgenabled=%.', trigger_enabled;
  end if;

  select count(distinct triggers.event_manipulation)
    into trigger_event_count
  from information_schema.triggers
  where triggers.trigger_schema = 'public'
    and triggers.event_object_table = 'matches'
    and triggers.trigger_name = 'sync_match_scheduled_date_before_write'
    and triggers.action_timing = 'BEFORE'
    and triggers.action_orientation = 'ROW'
    and triggers.event_manipulation in ('INSERT', 'UPDATE');

  select count(*)
    into trigger_update_column_count
  from information_schema.triggered_update_columns as columns
  where columns.trigger_schema = 'public'
    and columns.event_object_table = 'matches'
    and columns.trigger_name = 'sync_match_scheduled_date_before_write'
    and columns.event_object_column in ('kickoff_at', 'scheduled_date');

  if trigger_event_count <> 2 or trigger_update_column_count <> 2 then
    raise exception
      'Preflight failed: trigger must cover BEFORE INSERT OR UPDATE OF kickoff_at, scheduled_date; event_count=%, update_column_count=%.',
      trigger_event_count,
      trigger_update_column_count;
  end if;

  select md5(coalesce(string_agg(
    matches.id::text || '|' || matches.scheduled_date::text || '|' || extract(epoch from matches.kickoff_at)::text,
    E'\n' order by matches.id
  ), ''))
    into matches_fingerprint
  from public.matches as matches;

  perform set_config('jornada_calendar.preflight_matches_fingerprint', matches_fingerprint, true);
end
$$;

create or replace function public.sync_match_scheduled_date()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.kickoff_at is not null then
    new.scheduled_date := (new.kickoff_at at time zone 'Europe/Lisbon')::date;
  end if;

  return new;
end
$$;

alter table public.matches
  alter column scheduled_date drop not null,
  alter column kickoff_at drop not null;

do $$
declare
  scheduled_data_type text;
  scheduled_udt_name text;
  scheduled_is_nullable text;
  kickoff_data_type text;
  kickoff_udt_name text;
  kickoff_is_nullable text;
  total_matches bigint;
  scheduled_date_count bigint;
  kickoff_at_count bigint;
  matches_fingerprint text;
  preflight_matches_fingerprint text;
  trigger_enabled "char";
  trigger_event_count integer;
  trigger_update_column_count integer;
begin
  select columns.data_type, columns.udt_name, columns.is_nullable
    into scheduled_data_type, scheduled_udt_name, scheduled_is_nullable
  from information_schema.columns
  where columns.table_schema = 'public'
    and columns.table_name = 'matches'
    and columns.column_name = 'scheduled_date';

  if not found
    or scheduled_data_type <> 'date'
    or scheduled_udt_name <> 'date'
    or scheduled_is_nullable <> 'YES' then
    raise exception
      'Postflight failed: public.matches.scheduled_date must be date NULL; data_type=%, udt_name=%, is_nullable=%.',
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
    or kickoff_is_nullable <> 'YES' then
    raise exception
      'Postflight failed: public.matches.kickoff_at must be timestamptz NULL; data_type=%, udt_name=%, is_nullable=%.',
      kickoff_data_type,
      kickoff_udt_name,
      kickoff_is_nullable;
  end if;

  select count(*), count(scheduled_date), count(kickoff_at)
    into total_matches, scheduled_date_count, kickoff_at_count
  from public.matches;

  if total_matches <> 552
    or scheduled_date_count <> 552
    or kickoff_at_count <> 552 then
    raise exception
      'Postflight failed: expected total=552, scheduled_date_not_null=552, kickoff_at_not_null=552; found total=%, scheduled_date_not_null=%, kickoff_at_not_null=%.',
      total_matches,
      scheduled_date_count,
      kickoff_at_count;
  end if;

  select md5(coalesce(string_agg(
    matches.id::text || '|' || matches.scheduled_date::text || '|' || extract(epoch from matches.kickoff_at)::text,
    E'\n' order by matches.id
  ), ''))
    into matches_fingerprint
  from public.matches as matches;

  preflight_matches_fingerprint := current_setting('jornada_calendar.preflight_matches_fingerprint', true);

  if preflight_matches_fingerprint is null
    or matches_fingerprint is distinct from preflight_matches_fingerprint then
    raise exception
      'Postflight failed: public.matches values changed; preflight fingerprint=%, postflight fingerprint=%.',
      preflight_matches_fingerprint,
      matches_fingerprint;
  end if;

  if to_regprocedure('public.sync_match_scheduled_date()') is null then
    raise exception 'Postflight failed: function public.sync_match_scheduled_date() does not exist.';
  end if;

  select triggers.tgenabled
    into trigger_enabled
  from pg_trigger as triggers
  where triggers.tgrelid = 'public.matches'::regclass
    and triggers.tgname = 'sync_match_scheduled_date_before_write'
    and not triggers.tgisinternal;

  if not found or trigger_enabled not in ('O', 'A') then
    raise exception 'Postflight failed: trigger sync_match_scheduled_date_before_write is missing or inactive; tgenabled=%.', trigger_enabled;
  end if;

  select count(distinct triggers.event_manipulation)
    into trigger_event_count
  from information_schema.triggers
  where triggers.trigger_schema = 'public'
    and triggers.event_object_table = 'matches'
    and triggers.trigger_name = 'sync_match_scheduled_date_before_write'
    and triggers.action_timing = 'BEFORE'
    and triggers.action_orientation = 'ROW'
    and triggers.event_manipulation in ('INSERT', 'UPDATE');

  select count(*)
    into trigger_update_column_count
  from information_schema.triggered_update_columns as columns
  where columns.trigger_schema = 'public'
    and columns.event_object_table = 'matches'
    and columns.trigger_name = 'sync_match_scheduled_date_before_write'
    and columns.event_object_column in ('kickoff_at', 'scheduled_date');

  if trigger_event_count <> 2 or trigger_update_column_count <> 2 then
    raise exception
      'Postflight failed: trigger must cover BEFORE INSERT OR UPDATE OF kickoff_at, scheduled_date; event_count=%, update_column_count=%.',
      trigger_event_count,
      trigger_update_column_count;
  end if;

  raise notice
    'Postflight passed: total_matches=%, scheduled_date_not_null=%, kickoff_at_not_null=%, fingerprint=%.',
    total_matches,
    scheduled_date_count,
    kickoff_at_count,
    matches_fingerprint;
end
$$;

commit;
