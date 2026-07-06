-- ============================================================================
-- Fase:
-- PORTAL-ESCOLAS-CONTEUDOS-CRIACAO-AUDITADA-1
--
-- Objetivo:
-- Criar RPC auditada para criação de conteúdos do Portal das Escolas em draft,
-- usando public.portal_content_submissions.
--
-- Estado:
-- SQL aplicada e validada manualmente em produção no Supabase.
--
-- Validações feitas:
-- - SECURITY DEFINER = true
-- - search_path = public
-- - EXECUTE permitido a authenticated
-- - EXECUTE negado a public e anon
-- - Smoke test criou conteúdo e auditoria dentro de subtransação
-- - Rollback interno confirmado
-- - Nenhum conteúdo persistiu após rollback
-- - Nenhuma auditoria persistiu após rollback
-- - Nenhuma escrita em editorial_articles
-- - Nenhuma escrita em editorial_contents
--
-- Nota:
-- Esta fase não cria UI, não publica conteúdos e não toca no editorial antigo.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.portal_create_content_submission(
  p_portal_competition_id uuid,
  p_type text,
  p_title text,
  p_summary text,
  p_body text,
  p_media_url text,
  p_portal_stage_id uuid,
  p_portal_event_id uuid,
  p_portal_participant_id uuid
)
RETURNS TABLE (
  portal_content_submission_id uuid,
  portal_entity_id uuid,
  portal_context_id uuid,
  portal_modality_id uuid,
  portal_competition_id uuid,
  portal_stage_id uuid,
  portal_event_id uuid,
  portal_participant_id uuid,
  submission_status text,
  content_type text,
  title text,
  audit_event_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_auth_user_id uuid;
  v_portal_user_id uuid;
  v_user_entity_id uuid;
  v_competition public.portal_competitions%ROWTYPE;
  v_stage public.portal_stages%ROWTYPE;
  v_event public.portal_events%ROWTYPE;
  v_participant public.portal_participants%ROWTYPE;
  v_effective_stage_id uuid;
  v_effective_modality_id uuid;
  v_content_submission_id uuid;
  v_audit_event_id uuid;
  v_clean_type text;
  v_clean_title text;
  v_clean_summary text;
  v_clean_body text;
  v_clean_media_url text;
BEGIN
  v_auth_user_id := auth.uid();

  IF v_auth_user_id IS NULL THEN
    RAISE EXCEPTION 'Authentication required.'
      USING ERRCODE = '42501';
  END IF;

  v_clean_type := NULLIF(btrim(p_type), '');
  v_clean_title := NULLIF(btrim(p_title), '');
  v_clean_summary := NULLIF(btrim(p_summary), '');
  v_clean_body := NULLIF(btrim(p_body), '');
  v_clean_media_url := NULLIF(btrim(p_media_url), '');

  IF v_clean_type IS NULL THEN
    RAISE EXCEPTION 'Content type is required.'
      USING ERRCODE = '22023';
  END IF;

  IF v_clean_title IS NULL THEN
    RAISE EXCEPTION 'Content title is required.'
      USING ERRCODE = '22023';
  END IF;

  SELECT
    u.id,
    u.portal_entity_id
  INTO
    v_portal_user_id,
    v_user_entity_id
  FROM public.portal_users u
  WHERE u.auth_user_id = v_auth_user_id
    AND u.status = 'active'
  LIMIT 1;

  IF v_portal_user_id IS NULL THEN
    RAISE EXCEPTION 'Active portal user not found.'
      USING ERRCODE = '42501';
  END IF;

  SELECT c.*
  INTO v_competition
  FROM public.portal_competitions c
  WHERE c.id = p_portal_competition_id
  LIMIT 1;

  IF v_competition.id IS NULL THEN
    RAISE EXCEPTION 'Portal competition not found.'
      USING ERRCODE = '22023';
  END IF;

  IF v_user_entity_id IS DISTINCT FROM v_competition.portal_entity_id THEN
    RAISE EXCEPTION 'Portal user does not belong to the competition entity.'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.portal_permissions pp
    WHERE pp.portal_user_id = v_portal_user_id
      AND pp.status = 'active'
      AND pp.portal_entity_id = v_competition.portal_entity_id
      AND (
        pp.portal_context_id IS NULL
        OR pp.portal_context_id = v_competition.portal_context_id
      )
      AND (
        pp.portal_competition_id IS NULL
        OR pp.portal_competition_id = v_competition.id
      )
      AND (
        pp.can_create IS TRUE
        OR pp.can_edit IS TRUE
        OR pp.can_submit_content IS TRUE
      )
  ) THEN
    RAISE EXCEPTION 'Portal user does not have permission to create portal content drafts.'
      USING ERRCODE = '42501';
  END IF;

  IF p_portal_stage_id IS NOT NULL THEN
    SELECT s.*
    INTO v_stage
    FROM public.portal_stages s
    WHERE s.id = p_portal_stage_id
    LIMIT 1;

    IF v_stage.id IS NULL THEN
      RAISE EXCEPTION 'Portal stage not found.'
        USING ERRCODE = '22023';
    END IF;

    IF v_stage.portal_competition_id IS DISTINCT FROM v_competition.id
       OR v_stage.portal_entity_id IS DISTINCT FROM v_competition.portal_entity_id
       OR v_stage.portal_context_id IS DISTINCT FROM v_competition.portal_context_id THEN
      RAISE EXCEPTION 'Portal stage does not match competition scope.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  IF p_portal_event_id IS NOT NULL THEN
    SELECT e.*
    INTO v_event
    FROM public.portal_events e
    WHERE e.id = p_portal_event_id
    LIMIT 1;

    IF v_event.id IS NULL THEN
      RAISE EXCEPTION 'Portal event not found.'
        USING ERRCODE = '22023';
    END IF;

    IF v_event.portal_competition_id IS DISTINCT FROM v_competition.id
       OR v_event.portal_entity_id IS DISTINCT FROM v_competition.portal_entity_id
       OR v_event.portal_context_id IS DISTINCT FROM v_competition.portal_context_id THEN
      RAISE EXCEPTION 'Portal event does not match competition scope.'
        USING ERRCODE = '22023';
    END IF;

    IF v_event.portal_modality_id IS NOT NULL
       AND v_competition.portal_modality_id IS NOT NULL
       AND v_event.portal_modality_id IS DISTINCT FROM v_competition.portal_modality_id THEN
      RAISE EXCEPTION 'Portal event modality does not match competition modality.'
        USING ERRCODE = '22023';
    END IF;

    IF p_portal_stage_id IS NOT NULL
       AND v_event.portal_stage_id IS NOT NULL
       AND v_event.portal_stage_id IS DISTINCT FROM p_portal_stage_id THEN
      RAISE EXCEPTION 'Portal event does not match selected stage.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  v_effective_stage_id := COALESCE(p_portal_stage_id, v_event.portal_stage_id);
  v_effective_modality_id := COALESCE(v_event.portal_modality_id, v_competition.portal_modality_id);

  IF p_portal_participant_id IS NOT NULL THEN
    SELECT p.*
    INTO v_participant
    FROM public.portal_participants p
    WHERE p.id = p_portal_participant_id
    LIMIT 1;

    IF v_participant.id IS NULL THEN
      RAISE EXCEPTION 'Portal participant not found.'
        USING ERRCODE = '22023';
    END IF;

    IF v_participant.portal_entity_id IS DISTINCT FROM v_competition.portal_entity_id THEN
      RAISE EXCEPTION 'Portal participant does not match competition entity.'
        USING ERRCODE = '22023';
    END IF;

    IF NOT EXISTS (
      SELECT 1
      FROM public.portal_competition_participants cp
      WHERE cp.portal_competition_id = v_competition.id
        AND cp.portal_participant_id = p_portal_participant_id
    ) THEN
      RAISE EXCEPTION 'Portal participant is not registered in this competition.'
        USING ERRCODE = '22023';
    END IF;

    IF p_portal_event_id IS NOT NULL
       AND NOT EXISTS (
         SELECT 1
         FROM public.portal_event_participants ep
         WHERE ep.portal_event_id = p_portal_event_id
           AND ep.portal_participant_id = p_portal_participant_id
       ) THEN
      RAISE EXCEPTION 'Portal participant is not registered in this event.'
        USING ERRCODE = '22023';
    END IF;
  END IF;

  INSERT INTO public.portal_content_submissions (
    portal_entity_id,
    portal_context_id,
    portal_modality_id,
    portal_competition_id,
    portal_stage_id,
    portal_event_id,
    portal_participant_id,
    type,
    title,
    summary,
    body,
    media_url,
    submission_status,
    review_notes,
    submitted_at,
    reviewed_at,
    approved_at,
    rejected_at,
    submitted_by_portal_user_id,
    reviewed_by_portal_user_id,
    approved_by_portal_user_id,
    rejected_by_portal_user_id
  )
  VALUES (
    v_competition.portal_entity_id,
    v_competition.portal_context_id,
    v_effective_modality_id,
    v_competition.id,
    v_effective_stage_id,
    p_portal_event_id,
    p_portal_participant_id,
    v_clean_type,
    v_clean_title,
    v_clean_summary,
    v_clean_body,
    v_clean_media_url,
    'draft',
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL,
    NULL
  )
  RETURNING id
  INTO v_content_submission_id;

  INSERT INTO public.portal_audit_events (
    portal_entity_id,
    portal_context_id,
    portal_competition_id,
    actor_portal_user_id,
    actor_reference,
    action_type,
    object_type,
    object_id,
    previous_status,
    new_status,
    metadata
  )
  VALUES (
    v_competition.portal_entity_id,
    v_competition.portal_context_id,
    v_competition.id,
    v_portal_user_id,
    v_auth_user_id::text,
    'portal_content_submission_created',
    'portal_content_submissions',
    v_content_submission_id,
    NULL,
    'draft',
    jsonb_build_object(
      'phase', 'PORTAL-ESCOLAS-CONTEUDOS-CRIACAO-AUDITADA-1',
      'not_publication', true,
      'source_function', 'portal_create_content_submission',
      'created_status', 'draft',
      'content_type', v_clean_type,
      'title', v_clean_title,
      'portal_modality_id', v_effective_modality_id,
      'portal_competition_id', v_competition.id,
      'portal_stage_id', v_effective_stage_id,
      'portal_event_id', p_portal_event_id,
      'portal_participant_id', p_portal_participant_id,
      'permission_gate', 'can_create_or_can_edit_or_can_submit_content',
      'editorial_articles_written', false,
      'editorial_contents_written', false
    )
  )
  RETURNING id
  INTO v_audit_event_id;

  RETURN QUERY
  SELECT
    v_content_submission_id AS portal_content_submission_id,
    v_competition.portal_entity_id AS portal_entity_id,
    v_competition.portal_context_id AS portal_context_id,
    v_effective_modality_id AS portal_modality_id,
    v_competition.id AS portal_competition_id,
    v_effective_stage_id AS portal_stage_id,
    p_portal_event_id AS portal_event_id,
    p_portal_participant_id AS portal_participant_id,
    'draft'::text AS submission_status,
    v_clean_type AS content_type,
    v_clean_title AS title,
    v_audit_event_id AS audit_event_id;
END;
$$;

REVOKE ALL ON FUNCTION public.portal_create_content_submission(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.portal_create_content_submission(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid
) FROM anon;

GRANT EXECUTE ON FUNCTION public.portal_create_content_submission(
  uuid,
  text,
  text,
  text,
  text,
  text,
  uuid,
  uuid,
  uuid
) TO authenticated;

SELECT
  n.nspname AS schema_name,
  p.proname AS function_name,
  pg_get_function_identity_arguments(p.oid) AS arguments,
  pg_get_function_result(p.oid) AS result_type,
  p.prosecdef AS security_definer,
  p.proconfig AS config,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') AS authenticated_can_execute,
  has_function_privilege('public', p.oid, 'EXECUTE') AS public_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute,
  'apply_done_portal_create_content_submission_rpc' AS apply_status
FROM pg_proc p
JOIN pg_namespace n
  ON n.oid = p.pronamespace
WHERE n.nspname = 'public'
  AND p.proname = 'portal_create_content_submission'
  AND pg_get_function_identity_arguments(p.oid) =
    'p_portal_competition_id uuid, p_type text, p_title text, p_summary text, p_body text, p_media_url text, p_portal_stage_id uuid, p_portal_event_id uuid, p_portal_participant_id uuid';

-- ============================================================================
-- ROLLBACK GUARDADO — NÃO EXECUTAR SEM ORDEM EXPRESSA
-- ============================================================================
--
-- DROP FUNCTION IF EXISTS public.portal_create_content_submission(
--   uuid,
--   text,
--   text,
--   text,
--   text,
--   text,
--   uuid,
--   uuid,
--   uuid
-- );
--
-- ============================================================================
-- FIM DO ROLLBACK GUARDADO
-- ============================================================================
