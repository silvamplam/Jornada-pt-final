import "server-only";

import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  normalizeEditorialComposeInput,
  validComposeClaim,
  validPreparedCompose,
  type EditorialComposeClaim,
  type EditorialComposeInput,
  type EditorialComposePrepared,
  type NormalizedEditorialComposeInput,
} from "@/lib/redacao-automatica/editorial-compose-idempotency-internal";

type PrepareRpcRow = {
  submission_id: string;
  request_fingerprint: string;
  dossier_id: string;
  article_plan_id: string;
  editorial_article_id: string;
  composition_action: string;
  generation_status: string;
};

type ClaimRpcRow = {
  claim_action: string;
  editorial_article_id: string;
};

export type EditorialComposeServiceError =
  | "input_invalid"
  | "submission_payload_conflict"
  | "composition_failed"
  | "generation_claim_failed";

export type PrepareEditorialComposeResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        request: NormalizedEditorialComposeInput;
        composition: EditorialComposePrepared;
      }>;
    }>
  | Readonly<{ ok: false; error: EditorialComposeServiceError }>;

function errorCode(error: unknown, fallback: EditorialComposeServiceError): EditorialComposeServiceError {
  const message = error instanceof Error ? error.message : "";
  return message.includes("compose_payload_conflict")
    ? "submission_payload_conflict"
    : fallback;
}

export async function prepareEditorialCompose(
  input: EditorialComposeInput,
): Promise<PrepareEditorialComposeResult> {
  const request = normalizeEditorialComposeInput(input);
  if (!request) {
    return { ok: false, error: "input_invalid" };
  }
  if (!getSupabaseServiceConfig()) {
    return { ok: false, error: "composition_failed" };
  }

  try {
    const rows = await writeSupabaseAdminReturning<PrepareRpcRow>(
      "rpc/newsroom_prepare_editorial_compose",
      {
        method: "POST",
        body: JSON.stringify({
          p_submission_id: request.submissionId,
          p_request_fingerprint: request.fingerprint,
          p_working_title: request.workingTitle,
          p_editorial_instructions: request.editorialInstructions,
          p_context_instructions: request.contextInstructions,
          p_article_kind: request.articleKind,
          p_length_mode: request.lengthMode,
          p_output_language: request.outputLanguage,
          p_newsroom_article_ids: request.sources.map((source) => source.newsroomArticleId),
          p_newsroom_snapshot_ids: request.sources.map((source) => source.newsroomSnapshotId),
          p_source_roles: request.sources.map((source) => source.sourceRole),
          p_source_priorities: request.sources.map((source) => source.priority),
          p_source_notes: request.sources.map((source) => source.editorialNote || null),
        }),
      },
    );
    const row = rows[0];
    const composition: EditorialComposePrepared | null = row
      ? {
          submissionId: row.submission_id,
          fingerprint: row.request_fingerprint,
          dossierId: row.dossier_id,
          articlePlanId: row.article_plan_id,
          editorialArticleId: row.editorial_article_id,
          compositionAction: row.composition_action as EditorialComposePrepared["compositionAction"],
          generationStatus: row.generation_status as EditorialComposePrepared["generationStatus"],
        }
      : null;

    return validPreparedCompose(composition)
      ? { ok: true, value: { request, composition } }
      : { ok: false, error: "composition_failed" };
  } catch (error) {
    return { ok: false, error: errorCode(error, "composition_failed") };
  }
}

export async function claimEditorialComposeGeneration(
  request: NormalizedEditorialComposeInput,
  claimToken: string,
): Promise<EditorialComposeClaim | null> {
  try {
    const rows = await writeSupabaseAdminReturning<ClaimRpcRow>(
      "rpc/newsroom_claim_editorial_compose_generation",
      {
        method: "POST",
        body: JSON.stringify({
          p_submission_id: request.submissionId,
          p_request_fingerprint: request.fingerprint,
          p_claim_token: claimToken,
        }),
      },
    );
    const row = rows[0];
    const claim: EditorialComposeClaim | null = row
      ? {
          action: row.claim_action as EditorialComposeClaim["action"],
          editorialArticleId: row.editorial_article_id,
        }
      : null;
    return validComposeClaim(claim) ? claim : null;
  } catch {
    return null;
  }
}

export async function markEditorialComposeGenerationFailed(
  request: NormalizedEditorialComposeInput,
  claimToken: string,
  errorCodeValue: string,
): Promise<void> {
  try {
    await writeSupabaseAdminReturning(
      "rpc/newsroom_fail_editorial_compose_generation",
      {
        method: "POST",
        body: JSON.stringify({
          p_submission_id: request.submissionId,
          p_request_fingerprint: request.fingerprint,
          p_claim_token: claimToken,
          p_error_code: errorCodeValue.slice(0, 120),
        }),
      },
    );
  } catch {
    // A retoma também repara o estado se a geração já tiver sido aplicada.
  }
}

export async function markEditorialComposeGenerationCompleted(
  request: NormalizedEditorialComposeInput,
  claimToken: string,
): Promise<void> {
  try {
    await writeSupabaseAdminReturning(
      "rpc/newsroom_complete_editorial_compose_generation",
      {
        method: "POST",
        body: JSON.stringify({
          p_submission_id: request.submissionId,
          p_request_fingerprint: request.fingerprint,
          p_claim_token: claimToken,
        }),
      },
    );
  } catch {
    // Um retry repara este estado a partir do registo de geração já persistido.
  }
}
