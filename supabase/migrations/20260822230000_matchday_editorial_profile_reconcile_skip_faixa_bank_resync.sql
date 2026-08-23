begin;

drop trigger if exists sync_matchday_horizontal_news_to_bank
  on public.matchday_horizontal_news;

create trigger sync_matchday_horizontal_news_to_bank
after insert or update on public.matchday_horizontal_news
for each row
when (
  pg_catalog.current_setting('jornada.thematic_faixa_reconcile', true)
    is distinct from 'on'
)
execute function public.sync_matchday_zone_row_to_bank();

comment on trigger sync_matchday_horizontal_news_to_bank
  on public.matchday_horizontal_news is
  'Legacy/core bank sync remains unchanged for ordinary writes; thematic atomic Faixa reconcile suppresses the redundant per-row resync only inside its own transaction.';

create function public.apply_matchday_editorial_profile_reconcile_v2(
  p_matchday_id uuid,
  p_profile_key text,
  p_expected_revision bigint,
  p_expected_state_token text,
  p_overrides jsonb,
  p_zone_items jsonb,
  p_faixa_source_ids jsonb
)
returns table (
  revision bigint,
  state_token text,
  applied_override_count integer,
  applied_zone_item_count integer,
  applied_faixa_count integer
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.set_config(
    'jornada.thematic_faixa_reconcile',
    'on',
    true
  );

  return query
  select *
  from public.apply_matchday_editorial_profile_reconcile(
    p_matchday_id,
    p_profile_key,
    p_expected_revision,
    p_expected_state_token,
    p_overrides,
    p_zone_items,
    p_faixa_source_ids
  );
end;
$$;

revoke all on function public.apply_matchday_editorial_profile_reconcile_v2(
  uuid, text, bigint, text, jsonb, jsonb, jsonb
) from public, anon, authenticated, service_role;

grant execute on function public.apply_matchday_editorial_profile_reconcile_v2(
  uuid, text, bigint, text, jsonb, jsonb, jsonb
) to service_role;

comment on function public.apply_matchday_editorial_profile_reconcile_v2(
  uuid, text, bigint, text, jsonb, jsonb, jsonb
) is
  'Thin thematic wrapper around the audited atomic reconcile. It suppresses only the redundant matchday_horizontal_news -> bank trigger during the same transaction; all ordinary legacy/core Faixa writes keep the existing sync.';

notify pgrst, 'reload schema';

commit;