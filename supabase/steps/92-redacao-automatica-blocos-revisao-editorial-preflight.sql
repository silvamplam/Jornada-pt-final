begin;
set local transaction_read_only = on;

select
  to_regclass('public.newsroom_articles') is not null as newsroom_articles_exists,
  to_regclass('public.newsroom_article_snapshots') is not null as newsroom_snapshots_exists,
  to_regprocedure('public.newsroom_set_article_updated_at()') is not null as updated_at_trigger_function_exists,
  to_regclass('public.newsroom_editorial_review_states') is not null as review_states_already_exists,
  to_regclass('public.newsroom_editorial_review_batches') is not null as review_batches_already_exists,
  to_regclass('public.newsroom_editorial_review_batch_items') is not null as review_batch_items_already_exists,
  to_regprocedure('public.newsroom_apply_editorial_review(text,jsonb)') is not null as review_rpc_already_exists,
  false as writes_performed;

rollback;
