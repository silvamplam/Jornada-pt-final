begin;

create or replace function public.newsroom_apply_complete_editorial_dossier_article_plan_generation(
  p_dossier_id uuid,
  p_article_plan_id uuid,
  p_editorial_article_id uuid,
  p_expected_article_updated_at timestamptz,
  p_generated_title text,
  p_generated_post_title text,
  p_image_url text,
  p_generated_body text,
  p_provider text,
  p_model text,
  p_prompt_version text,
  p_provider_response_id text,
  p_input_hash text,
  p_input_snapshot jsonb,
  p_input_tokens integer,
  p_output_tokens integer,
  p_total_tokens integer
)
returns table(
  generation_id uuid,
  editorial_article_id uuid,
  generation_action text
)
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_result record;
  v_title text := btrim(coalesce(p_generated_title, ''));
  v_post_title text := btrim(coalesce(p_generated_post_title, ''));
  v_image_url text := btrim(coalesce(p_image_url, ''));
begin
  if char_length(v_title) not between 8 and 180 then
    raise exception 'editorial_generation_title_invalid'
      using errcode = '23514';
  end if;

  if char_length(v_post_title) not between 20 and 600 then
    raise exception 'editorial_generation_post_title_invalid'
      using errcode = '23514';
  end if;

  if v_image_url = ''
     or char_length(v_image_url) > 2048
     or not (
       v_image_url ~ '^https?://'
       or v_image_url ~ '^/'
     ) then
    raise exception 'editorial_generation_image_invalid'
      using errcode = '23514';
  end if;

  select result.*
  into v_result
  from public.newsroom_apply_editorial_dossier_article_plan_generation(
    p_dossier_id,
    p_article_plan_id,
    p_editorial_article_id,
    p_expected_article_updated_at,
    p_generated_body,
    p_provider,
    p_model,
    p_prompt_version,
    p_provider_response_id,
    p_input_hash,
    p_input_snapshot,
    p_input_tokens,
    p_output_tokens,
    p_total_tokens
  ) result;

  if v_result.generation_action = 'applied' then
    update public.editorial_articles article
    set title = v_title,
        subtitle = v_post_title,
        image_url = v_image_url,
        updated_at = now()
    where article.id = p_editorial_article_id
      and article.status = 'draft'
      and btrim(coalesce(article.body, '')) = btrim(coalesce(p_generated_body, ''));

    if not found then
      raise exception 'editorial_generation_complete_article_conflict'
        using errcode = '55000';
    end if;
  end if;

  return query
  select
    v_result.generation_id,
    v_result.editorial_article_id,
    v_result.generation_action;
end;
$$;

alter function public.newsroom_apply_complete_editorial_dossier_article_plan_generation(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, text, jsonb, integer, integer, integer
) owner to postgres;

revoke all on function public.newsroom_apply_complete_editorial_dossier_article_plan_generation(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, text, jsonb, integer, integer, integer
) from public, anon, authenticated;

grant execute on function public.newsroom_apply_complete_editorial_dossier_article_plan_generation(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, text, jsonb, integer, integer, integer
) to service_role;

comment on function public.newsroom_apply_complete_editorial_dossier_article_plan_generation(
  uuid, uuid, uuid, timestamptz, text, text, text, text, text, text, text, text, text, jsonb, integer, integer, integer
) is 'Applies one immutable editorial generation and fills the draft title, post-title, image and body atomically.';

commit;
