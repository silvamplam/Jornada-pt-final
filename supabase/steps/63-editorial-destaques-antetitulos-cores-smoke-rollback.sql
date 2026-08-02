begin;

update public.site_editorial_highlights
set label_color = '#c40000'
where false;

update public.matchday_highlights
set label_color = '#c40000'
where false;

select 'Smoke test concluído: as duas colunas aceitam valores hexadecimais sem alterar dados' as resultado;

rollback;
