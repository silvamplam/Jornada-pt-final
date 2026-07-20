import {
  TEAM_SAFE_DELETION_MAX_REQUEST_BYTES,
  TeamSafeDeletionApiError,
  TeamSafeDeletionApiSuccess,
  TeamSafeDeletionConfirmedAction,
  TeamSafeDeletionPolicyError,
  isTeamSafeDeletionUuid,
  parseTeamSafeDeletionRequest,
  validateTeamSafeDeletionRpcResult,
} from "@/lib/team-safe-deletion-policy";

export type TeamSafeDeletionAuthorization =
  | { status: "authorized"; actorReference: string }
  | { status: "unauthenticated" }
  | { status: "forbidden" };

export type TeamSafeDeletionRpcArguments = {
  p_team_id: string;
  p_apply: boolean;
  p_confirmed_preview_fingerprint: string | null;
  p_confirmed_action: TeamSafeDeletionConfirmedAction | null;
  p_actor_type: "admin_session";
  p_actor_reference: string;
  p_source: "admin_team_safe_deletion";
  p_request_reference: string;
};

export type TeamSafeDeletionApiDependencies = {
  authorize: () => Promise<TeamSafeDeletionAuthorization>;
  serviceConfigured: boolean;
  createRequestReference: () => string;
  executeRpc: (args: TeamSafeDeletionRpcArguments) => Promise<unknown>;
  logError: (message: string, detail: unknown) => void;
};

function jsonResponse(
  body: TeamSafeDeletionApiSuccess | TeamSafeDeletionApiError,
  status: number,
): Response {
  return Response.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function errorResponse(
  status: number,
  code: string,
  message: string,
  requiresNewPreview = false,
): Response {
  return jsonResponse({ ok: false, code, message, requiresNewPreview }, status);
}

function normalizeRpcPayload(value: unknown): unknown {
  if (!Array.isArray(value)) return value;
  return value.length === 1 ? value[0] : undefined;
}

function extractDatabaseError(error: unknown): { code: string; message: string } {
  if (typeof error !== "object" || error === null) return { code: "", message: "" };
  const record = error as Record<string, unknown>;
  return {
    code: typeof record.code === "string" ? record.code : "",
    message: typeof record.message === "string" ? record.message : "",
  };
}

function mapRpcError(error: unknown, logError: TeamSafeDeletionApiDependencies["logError"]): Response {
  const databaseError = extractDatabaseError(error);
  const normalizedMessage = databaseError.message.toLowerCase();

  if (databaseError.code === "40001" || normalizedMessage.includes("preview_stale")) {
    return errorResponse(
      409,
      "preview_stale",
      "A análise ficou desatualizada. Atualize o preview antes de tentar novamente.",
      true,
    );
  }
  if (databaseError.code === "P0002" || normalizedMessage.includes("team_not_found")) {
    return errorResponse(404, "team_not_found", "O clube já não existe.");
  }
  if (normalizedMessage.includes("invalid_confirmation") || normalizedMessage.includes("invalid_action")) {
    return errorResponse(
      409,
      "deletion_rejected",
      "A remoção foi rejeitada porque a confirmação já não é válida.",
      true,
    );
  }

  logError("Falha na RPC de remoção segura de clube.", error);
  return errorResponse(500, "safe_deletion_failed", "Não foi possível concluir a remoção segura.");
}

export async function handleTeamSafeDeletionRequest(
  request: Request,
  teamId: string,
  dependencies: TeamSafeDeletionApiDependencies,
): Promise<Response> {
  const authorization = await dependencies.authorize();
  if (authorization.status === "unauthenticated") {
    return errorResponse(401, "authentication_required", "É necessária uma sessão administrativa.");
  }
  if (authorization.status === "forbidden") {
    return errorResponse(403, "permission_denied", "Não tem autorização para remover clubes.");
  }
  if (!isTeamSafeDeletionUuid(teamId)) {
    return errorResponse(400, "invalid_team_id", "O identificador do clube é inválido.");
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > TEAM_SAFE_DELETION_MAX_REQUEST_BYTES) {
    return errorResponse(413, "request_too_large", "O pedido de remoção é demasiado grande.");
  }

  let requestBody: unknown;
  try {
    requestBody = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "invalid_json", "O corpo JSON do pedido é inválido.");
  }

  let parsedRequest;
  try {
    parsedRequest = parseTeamSafeDeletionRequest(requestBody);
  } catch (error) {
    if (error instanceof TeamSafeDeletionPolicyError) {
      return errorResponse(400, error.code, error.message);
    }
    return errorResponse(400, "invalid_request", "O pedido de remoção segura é inválido.");
  }

  if (!dependencies.serviceConfigured) {
    dependencies.logError("Serviço administrativo Supabase indisponível.", { teamId });
    return errorResponse(500, "service_unavailable", "O serviço administrativo não está configurado.");
  }

  const requestReference = `team-safe-deletion:${parsedRequest.operation}:${dependencies.createRequestReference()}`;
  const rpcArguments: TeamSafeDeletionRpcArguments = {
    p_team_id: teamId,
    p_apply: parsedRequest.operation === "apply",
    p_confirmed_preview_fingerprint:
      parsedRequest.operation === "apply" ? parsedRequest.previewFingerprint : null,
    p_confirmed_action: parsedRequest.operation === "apply" ? parsedRequest.confirmedAction : null,
    p_actor_type: "admin_session",
    p_actor_reference: authorization.actorReference,
    p_source: "admin_team_safe_deletion",
    p_request_reference: requestReference,
  };

  let rpcPayload: unknown;
  try {
    rpcPayload = normalizeRpcPayload(await dependencies.executeRpc(rpcArguments));
  } catch (error) {
    return mapRpcError(error, dependencies.logError);
  }

  const validated = validateTeamSafeDeletionRpcResult(rpcPayload, {
    operation: parsedRequest.operation,
    teamId,
    confirmedFingerprint:
      parsedRequest.operation === "apply" ? parsedRequest.previewFingerprint : undefined,
    confirmedAction: parsedRequest.operation === "apply" ? parsedRequest.confirmedAction : undefined,
  });
  if (!validated.ok) {
    dependencies.logError("Resposta incompatível da RPC de remoção segura.", validated.detail);
    return errorResponse(
      502,
      "rpc_contract_invalid",
      "O serviço de remoção devolveu uma resposta inesperada.",
    );
  }

  return jsonResponse(
    {
      ok: true,
      operation: parsedRequest.operation,
      requestReference,
      result: validated.value,
    },
    200,
  );
}
