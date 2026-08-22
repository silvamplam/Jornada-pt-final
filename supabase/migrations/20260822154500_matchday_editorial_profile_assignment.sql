begin;

create table public.matchday_editorial_profile_assignments (
  matchday_id uuid primary key references public.matchdays(id) on delete cascade,
  profile_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint matchday_editorial_profile_assignments_profile_key_check
    check (profile_key = 'liga_portugal_v1')
);

alter table public.matchday_editorial_profile_assignments enable row level security;

revoke all on table public.matchday_editorial_profile_assignments
  from public, anon, authenticated, service_role;
grant select on table public.matchday_editorial_profile_assignments to service_role;

comment on table public.matchday_editorial_profile_assignments is
  'A ausência de linha mantém a Jornada no circuito editorial Atual/legacy; uma linha ativa explicitamente o perfil temático. Esta tabela não contém o estado interno do perfil. Apagar uma atribuição não representa apagar eventual estado temático independente.';
comment on column public.matchday_editorial_profile_assignments.profile_key is
  'Profile editorial temático explicitamente atribuído à Jornada.';

create function public.set_matchday_editorial_profile_assignment(
  p_matchday_id uuid,
  p_profile_key text
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_competition_slug text;
  v_current_profile_key text;
  v_now timestamptz := now();
begin
  if p_matchday_id is null then
    raise exception 'matchday-editorial-profile-invalid-input';
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
    raise exception 'matchday-editorial-profile-matchday-not-found';
  end if;

  if p_profile_key is null then
    delete from public.matchday_editorial_profile_assignments
    where matchday_id = p_matchday_id;

    return null;
  end if;

  if p_profile_key is distinct from 'liga_portugal_v1' then
    raise exception 'matchday-editorial-profile-invalid-profile';
  end if;

  if v_competition_slug is distinct from 'liga-portugal' then
    raise exception 'matchday-editorial-profile-incompatible-competition';
  end if;

  select assignment_row.profile_key
  into v_current_profile_key
  from public.matchday_editorial_profile_assignments as assignment_row
  where assignment_row.matchday_id = p_matchday_id;

  if v_current_profile_key = p_profile_key then
    return v_current_profile_key;
  end if;

  if v_current_profile_key is null then
    insert into public.matchday_editorial_profile_assignments (
      matchday_id,
      profile_key
    )
    values (
      p_matchday_id,
      p_profile_key
    );
  else
    update public.matchday_editorial_profile_assignments
    set profile_key = p_profile_key,
        updated_at = v_now
    where matchday_id = p_matchday_id;
  end if;

  return p_profile_key;
end;
$$;

revoke execute on function public.set_matchday_editorial_profile_assignment(uuid, text)
  from public, anon, authenticated;
grant execute on function public.set_matchday_editorial_profile_assignment(uuid, text)
  to service_role;

commit;
