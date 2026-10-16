begin;
-- Additive rollout, prior to the application. No existing decisions/assets are
-- removed or rewritten. Production application requires separate authorization.
alter table public.editorial_image_decisions
  drop constraint editorial_image_decisions_state_check,
  drop constraint editorial_image_decisions_check,
  add column failure_code text,
  add constraint editorial_image_decisions_state_check check (state in ('acquiring','candidate','ready','failed')),
  add constraint editorial_image_decisions_check check (
    (state in ('acquiring','failed') and image is null) or
    (state in ('candidate','ready') and image is not null));

create or replace function public.editorial_image_decision_immutable_v1() returns trigger language plpgsql set search_path='' as $$
begin
  if new.decision_key is distinct from old.decision_key or new.source_url is distinct from old.source_url
    or new.created_at is distinct from old.created_at
    or (old.image is not null and new.image is distinct from old.image)
    or (old.state='ready' and new.state <> 'ready')
    or (old.state='candidate' and new.state not in ('candidate','ready'))
    or (old.state='failed' and new.state <> 'failed') then
    raise exception 'image-decision-immutable';
  end if;
  return new;
end $$;
commit;
