alter table public.matches
add column if not exists rollover_excluded boolean not null default false;

update public.matches
set rollover_excluded = true
where lower(coalesce(status, '')) = 'postponed';

comment on column public.matches.rollover_excluded is
'Exclui o jogo do calculo automatico da jornada publica de entrada depois de um adiamento.';
