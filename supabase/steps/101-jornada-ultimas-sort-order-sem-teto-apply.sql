begin;

alter table public.matchday_latest_news
  drop constraint if exists matchday_latest_news_sort_order_check;

alter table public.matchday_latest_news
  add constraint matchday_latest_news_sort_order_check
  check (sort_order >= 1) not valid;

alter table public.matchday_latest_news
  validate constraint matchday_latest_news_sort_order_check;

comment on column public.matchday_latest_news.sort_order is
  'Technical order normalized from canonical publication date; positive and without an editorial maximum.';

notify pgrst, 'reload schema';

commit;
