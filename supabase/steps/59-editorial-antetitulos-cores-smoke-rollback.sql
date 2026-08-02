begin;

update public.site_editorials
set side_block_label_color = '#c40000'
where false;

update public.site_editorial_latest_news
set time_label_color = '#c40000'
where false;

update public.matchday_editorials
set side_block_label_color = '#c40000'
where false;

update public.matchday_latest_news
set time_label_color = '#c40000'
where false;

select 'Smoke test concluído: as quatro colunas aceitam valores hexadecimais sem alterar dados' as resultado;

rollback;
