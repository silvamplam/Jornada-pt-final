import {
  buildTeamBatchCreationRpcArguments,
  isTeamBatchCreationRpcRow,
  parseTeamBatchCreationRequest,
  TEAM_BATCH_CREATION_MAX_TEXT_BYTES,
  TeamBatchCreationPolicyError,
  validateTeamBatchCreationRpcRows,
  type TeamBatchCreationApplyRequest,
  type TeamBatchCreationPreviewFingerprint,
  type TeamBatchCreationPreviewRequest,
  type TeamBatchCreationRpcRow,
  type TeamBatchCreationSummary
} from "@/lib/team-batch-creation-policy";

export const TEAM_BATCH_CREATION_MAX_HTTP_BODY_BYTES = 512 * 1024;

const ADMIN_ACTOR_TYPE = "admin_session";
const ADMIN_ACTOR_REFERENCE = "jornada_backoffice_shared_admin";
const ADMIN_SOURCE = "admin_team_batch_creation";

type TeamBatchCreationRequest =
  | TeamBatchCreationPreviewRequest
  | TeamBatchCreationApplyRequest;

export type TeamBatchCreationRpcArguments = ReturnType<
  typeof buildTeamBatchCreationRpcArguments
> & {
  p_actor_type: typeof ADMIN_ACTOR_TYPE;
  p_actor_reference: typeof ADMIN_ACTOR_REFERENCE;
  p_source: typeof ADMIN_SOURCE;
  p_request_reference: string;
};

export type TeamBatchCreationApiSuccessResponse = {
  ok: true;
  operation: "preview" | "apply";
  requestReference: string;
  fingerprint: TeamBatchCreationPreviewFingerprint;
  rows: TeamBatchCreationRpcRow[];
  summary: TeamBatchCreationSummary;
};

export type TeamBatchCreationApiErrorResponse = {
  ok: false;
  code: string;
  message: string;
};

export type TeamBatchCreationApiDependencies = {
  serviceConfigured: () => boolean;
  createRequestId: () => string;
  executeRpc: (argumentsValue: TeamBatchCreationRpcArguments) => Promise<unknown>;
  logError?: (message: string) => void;
};

const SUCCESS_FIELDS = new Set([
  "ok",
  "operation",
  "requestReference",
  "fingerprint",
  "rows",
  "summary"
]);
const ERROR_FIELDS = new Set(["ok", "code", "message"]);
const SUMMARY_FIELDS = new Set([
  "applied",
  "totalCount",
  "createCount",
  "existingCount",
  "completeExistingCount",
  "probableCount",
  "ambiguousCount",
  "conflictCount",
  "invalidCount",
  "blockingCount",
  "canApply",
  "createdCount",
  "completedExistingCount",
  "existingResultCount",
  "aliasesCreatedCount",
  "aliasesUnchangedCount",
  "publicNamesChangedCount",
  "integrallyApplied"
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, fields: ReadonlySet<string>) {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function isNonNegativeInteger(value: unknown) {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isSummary(value: unknown): value is TeamBatchCreationSummary {
  if (!isRecord(value) || !hasExactFields(value, SUMMARY_FIELDS)) return false;
  return (
    typeof value.applied === "boolean" &&
    typeof value.canApply === "boolean" &&
    typeof value.integrallyApplied === "boolean" &&
    [
      value.totalCount,
      value.createCount,
      value.existingCount,
      value.completeExistingCount,
      value.probableCount,
      value.ambiguousCount,
      value.conflictCount,
      value.invalidCount,
      value.blockingCount,
      value.createdCount,
      value.completedExistingCount,
      value.existingResultCount,
      value.aliasesCreatedCount,
      value.aliasesUnchangedCount,
      value.publicNamesChangedCount
    ].every(isNonNegativeInteger)
  );
}

export function isTeamBatchCreationApiSuccessResponse(
  value: unknown
): value is TeamBatchCreationApiSuccessResponse {
  return (
    isRecord(value) &&
    hasExactFields(value, SUCCESS_FIELDS) &&
    value.ok === true &&
    (value.operation === "preview" || value.operation === "apply") &&
    typeof value.requestReference === "string" &&
    /^team-batch-creation:(preview|apply):[0-9A-Za-z-]+$/.test(value.requestReference) &&
    typeof value.fingerprint === "string" &&
    /^v1:[0-9a-f]{32}$/.test(value.fingerprint) &&
    Array.isArray(value.rows) &&
    value.rows.length > 0 &&
    value.rows.every(isTeamBatchCreationRpcRow) &&
    isSummary(value.summary)
  );
}

export function isTeamBatchCreationApiErrorResponse(
  value: unknown
): value is TeamBatchCreationApiErrorResponse {
  return (
    isRecord(value) &&
    hasExactFields(value, ERROR_FIELDS) &&
    value.ok === false &&
    typeof value.code === "string" &&
    value.code.length > 0 &&
    typeof value.message === "string" &&
    value.message.length > 0
  );
}

function jsonResponse(
  value: TeamBatchCreationApiSuccessResponse | TeamBatchCreationApiErrorResponse,
  status: number
) {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function errorResponse(code: string, message: string, status: number) {
  return jsonResponse({ ok: false, code, message }, status);
}

function databaseErrorDetails(error: unknown): { code: string; message: string } {
  const rawMessage = error instanceof Error ? error.message : "";
  try {
    const parsed = JSON.parse(rawMessage) as { code?: unknown; message?: unknown };
    return {
      code: typeof parsed.code === "string" ? parsed.code : "",
      message: typeof parsed.message === "string" ? parsed.message : ""
    };
  } catch {
    return { code: "", message: rawMessage };
  }
}

function rpcErrorResponse(error: unknown, logError: (message: string) => void) {
  const databaseError = databaseErrorDetails(error);
  if (
    databaseError.code === "40001" ||
    databaseError.message.includes("team_creation_batch_preview_stale")
  ) {
    return errorResponse(
      "team-batch-creation-preview-stale",
      "O estado dos clubes mudou desde a pré-visualização. Volte a pré-visualizar o lote.",
      409
    );
  }
  if (
    databaseError.message.includes("team_creation_batch_blocking_rows") ||
    databaseError.message.includes("team_creation_batch_complete_confirmation_invalid") ||
    databaseError.message.includes("team_creation_batch_legacy_state_changed")
  ) {
    return errorResponse(
      "team-batch-creation-batch-blocked",
      "O lote deixou de estar pronto para aplicação. Volte a pré-visualizar e reveja os bloqueios.",
      409
    );
  }
  if (
    databaseError.code === "23503" ||
    databaseError.message.includes("team_creation_batch_country_not_found") ||
    databaseError.message.includes("team_creation_batch_country_inactive")
  ) {
    return errorResponse(
      "team-batch-creation-country-unavailable",
      "O país selecionado não está disponível para esta operação.",
      409
    );
  }
  if (databaseError.code === "22023") {
    return errorResponse(
      "team-batch-creation-rpc-input-invalid",
      "O pedido foi recusado pela validação transacional.",
      422
    );
  }

  logError("[admin/teams/batch] manage_team_creation_batch failed");
  return errorResponse(
    "team-batch-creation-operation-failed",
    "Não foi possível processar o lote de clubes.",
    500
  );
}

function rpcArguments(
  input: TeamBatchCreationRequest,
  requestReference: string
): TeamBatchCreationRpcArguments {
  return {
    ...buildTeamBatchCreationRpcArguments(input),
    p_actor_type: ADMIN_ACTOR_TYPE,
    p_actor_reference: ADMIN_ACTOR_REFERENCE,
    p_source: ADMIN_SOURCE,
    p_request_reference: requestReference
  };
}

export async function handleTeamBatchCreationRequest(
  request: Request,
  dependencies: TeamBatchCreationApiDependencies
): Promise<Response> {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(
      "team-batch-creation-body-read-failed",
      "Não foi possível ler o pedido.",
      400
    );
  }

  if (new TextEncoder().encode(rawBody).byteLength > TEAM_BATCH_CREATION_MAX_HTTP_BODY_BYTES) {
    return errorResponse(
      "team-batch-creation-body-too-large",
      "O pedido excede o limite de 512 KiB.",
      413
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse(
      "team-batch-creation-invalid-json",
      "O body tem de conter JSON válido.",
      400
    );
  }

  let input: TeamBatchCreationRequest;
  try {
    input = parseTeamBatchCreationRequest(body);
  } catch (error) {
    if (error instanceof TeamBatchCreationPolicyError) {
      return errorResponse(error.code, error.message, 400);
    }
    return errorResponse(
      "team-batch-creation-input-invalid",
      "O pedido de criação em lote é inválido.",
      400
    );
  }

  if (!dependencies.serviceConfigured()) {
    return errorResponse(
      "missing-service",
      "A API administrativa não está configurada.",
      503
    );
  }

  const requestReference = `team-batch-creation:${input.action}:${dependencies.createRequestId()}`;
  try {
    const rawRows = await dependencies.executeRpc(rpcArguments(input, requestReference));
    const validated = validateTeamBatchCreationRpcRows(rawRows, {
      operation: input.action,
      countryId: input.countryId,
      expectedLineNumbers: input.rows.map((row) => row.lineNumber),
      confirmedCompleteExistingLines:
        input.action === "apply" ? input.confirmedCompleteExistingLines : []
    });
    if (!validated.ok) {
      dependencies.logError?.(
        "[admin/teams/batch] manage_team_creation_batch returned an invalid result"
      );
      return errorResponse(
        validated.code,
        "A operação não devolveu um resultado válido.",
        502
      );
    }

    return jsonResponse(
      {
        ok: true,
        operation: input.action,
        requestReference,
        fingerprint: validated.fingerprint,
        rows: validated.rows,
        summary: validated.summary
      },
      200
    );
  } catch (error) {
    return rpcErrorResponse(error, dependencies.logError ?? (() => undefined));
  }
}

export const TEAM_BATCH_CREATION_LOCAL_TEXT_LIMIT = TEAM_BATCH_CREATION_MAX_TEXT_BYTES;
