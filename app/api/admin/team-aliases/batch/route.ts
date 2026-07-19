import { NextResponse } from "next/server";
import {
  isTeamAliasBatchRpcRow,
  parseTeamAliasBatchRequest,
  TEAM_ALIAS_BATCH_MAX_BODY_BYTES,
  TeamAliasBatchPolicyError,
  type TeamAliasBatchAction,
  type TeamAliasBatchErrorResponse,
  type TeamAliasBatchRequest,
  type TeamAliasBatchRpcRow,
  type TeamAliasBatchSuccessResponse,
  type TeamAliasBatchSummary
} from "@/lib/team-alias-batch-policy";
import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning
} from "@/lib/supabase";

const ADMIN_ALIAS_ACTOR_TYPE = "admin_session";
const ADMIN_ALIAS_ACTOR_REFERENCE = "jornada_backoffice_shared_admin";
const ADMIN_ALIAS_SOURCE = "admin_batch_import";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

class InvalidBatchRpcResponseError extends Error {
  constructor() {
    super("Invalid team alias batch RPC response");
    this.name = "InvalidBatchRpcResponseError";
  }
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  preview?: TeamAliasBatchSuccessResponse
) {
  const payload: TeamAliasBatchErrorResponse = {
    ok: false,
    code,
    message,
    ...(preview ? { preview } : {})
  };

  return NextResponse.json(payload, { status });
}

function requestReference(operation: "preview" | "apply-check" | "apply") {
  return `team-alias-batch:${operation}:${crypto.randomUUID()}`;
}

function rpcArguments(input: TeamAliasBatchRequest, apply: boolean, reference: string) {
  return {
    p_country_id: input.countryId,
    p_rows: input.rows,
    p_apply: apply,
    p_actor_type: ADMIN_ALIAS_ACTOR_TYPE,
    p_actor_reference: ADMIN_ALIAS_ACTOR_REFERENCE,
    p_source: ADMIN_ALIAS_SOURCE,
    p_request_reference: reference
  };
}

function sameBatchSummary(left: TeamAliasBatchRpcRow, right: TeamAliasBatchRpcRow) {
  return (
    left.batch_can_apply === right.batch_can_apply &&
    left.batch_requested_apply === right.batch_requested_apply &&
    left.batch_create_count === right.batch_create_count &&
    left.batch_existing_active_count === right.batch_existing_active_count &&
    left.batch_blocking_count === right.batch_blocking_count &&
    left.batch_created_count === right.batch_created_count &&
    left.batch_noop === right.batch_noop
  );
}

function isNullableUuid(value: string | null) {
  return value === null || UUID_PATTERN.test(value);
}

function validateBatchSemantics(rows: TeamAliasBatchRpcRow[], requestedApply: boolean) {
  const first = rows[0];
  if (!first || rows.some((row) => !sameBatchSummary(first, row))) {
    return false;
  }

  const blockingCount = rows.filter((row) => row.blocking).length;
  const createCount = rows.filter((row) => row.result_status === "create").length;
  const existingActiveCount = rows.filter(
    (row) => row.result_status === "existing_active_same_team"
  ).length;
  const changedRows = rows.filter((row) => row.changed);

  return (
    first.batch_requested_apply === requestedApply &&
    first.batch_can_apply === (blockingCount === 0) &&
    first.batch_blocking_count === blockingCount &&
    first.batch_create_count === createCount &&
    first.batch_existing_active_count === existingActiveCount &&
    first.batch_created_count === changedRows.length &&
    first.batch_noop === (blockingCount === 0 && createCount === 0) &&
    (blockingCount === 0 || changedRows.length === 0) &&
    changedRows.every(
      (row) => row.result_status === "create" && row.result_code === "created"
    ) &&
    (requestedApply || changedRows.length === 0)
  );
}

function mapBatchResponse(
  rows: TeamAliasBatchRpcRow[],
  operation: TeamAliasBatchAction,
  reference: string
): TeamAliasBatchSuccessResponse {
  const first = rows[0];
  if (!first) {
    throw new InvalidBatchRpcResponseError();
  }

  const summary: TeamAliasBatchSummary = {
    canApply: first.batch_can_apply,
    requestedApply: first.batch_requested_apply,
    createCount: first.batch_create_count,
    existingActiveCount: first.batch_existing_active_count,
    blockingCount: first.batch_blocking_count,
    createdCount: first.batch_created_count,
    noop: first.batch_noop
  };

  return {
    ok: true,
    operation,
    requestReference: reference,
    rows: rows.map((row) => ({
      lineNumber: row.line_number,
      canonicalClubInput: row.canonical_club_input,
      aliasInput: row.alias_input,
      normalizedAlias: row.normalized_alias,
      resolvedTeamId: row.resolved_team_id,
      resolvedTeamName: row.resolved_team_name,
      resultTeamAliasId: row.result_team_alias_id,
      resultStatus: row.result_status,
      resultCode: row.result_code,
      blocking: row.blocking,
      changed: row.changed
    })),
    summary
  };
}

async function runBatch(
  input: TeamAliasBatchRequest,
  apply: boolean,
  operation: TeamAliasBatchAction,
  reference: string
) {
  const rows = await writeSupabaseAdminReturning<TeamAliasBatchRpcRow>(
    "rpc/manage_team_alias_batch",
    {
      method: "POST",
      body: JSON.stringify(rpcArguments(input, apply, reference))
    }
  );

  if (
    rows.length !== input.rows.length ||
    !rows.every(isTeamAliasBatchRpcRow) ||
    rows.some(
      (row) =>
        !isNullableUuid(row.resolved_team_id) ||
        !isNullableUuid(row.result_team_alias_id)
    ) ||
    rows.some((row, index) => row.line_number !== input.rows[index]?.lineNumber) ||
    !validateBatchSemantics(rows, apply)
  ) {
    throw new InvalidBatchRpcResponseError();
  }

  return mapBatchResponse(rows, operation, reference);
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

function rpcErrorResponse(error: unknown) {
  if (error instanceof InvalidBatchRpcResponseError) {
    console.error("[admin/team-aliases/batch] manage_team_alias_batch returned an invalid result");
    return errorResponse(
      "team-alias-batch-rpc-invalid-response",
      "A operação não devolveu um resultado válido.",
      502
    );
  }

  const databaseError = databaseErrorDetails(error);
  if (
    databaseError.message === "team_alias_batch_country_not_found" ||
    databaseError.code === "23503"
  ) {
    return errorResponse(
      "team-alias-batch-country-not-found",
      "O país selecionado deixou de estar disponível.",
      404
    );
  }

  if (databaseError.code === "22023") {
    return errorResponse(
      "team-alias-batch-rpc-input-invalid",
      "O pedido de importação foi recusado.",
      400
    );
  }

  console.error("[admin/team-aliases/batch] manage_team_alias_batch failed");
  return errorResponse(
    "team-alias-batch-operation-failed",
    "Não foi possível processar o lote de aliases.",
    500
  );
}

export async function POST(request: Request) {
  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(
      "team-alias-batch-body-read-failed",
      "Não foi possível ler o pedido.",
      400
    );
  }

  if (new TextEncoder().encode(rawBody).byteLength > TEAM_ALIAS_BATCH_MAX_BODY_BYTES) {
    return errorResponse(
      "team-alias-batch-body-too-large",
      "O pedido excede o limite permitido.",
      413
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse(
      "team-alias-batch-invalid-json",
      "O body tem de conter JSON válido.",
      400
    );
  }

  let input: TeamAliasBatchRequest;
  try {
    input = parseTeamAliasBatchRequest(body);
  } catch (error) {
    if (error instanceof TeamAliasBatchPolicyError) {
      return errorResponse(error.code, error.message, 400);
    }

    return errorResponse(
      "team-alias-batch-input-invalid",
      "O pedido de importação é inválido.",
      400
    );
  }

  if (!getSupabaseServiceConfig()) {
    return errorResponse(
      "missing-service",
      "A API administrativa não está configurada.",
      503
    );
  }

  try {
    if (input.action === "preview") {
      const reference = requestReference("preview");
      const preview = await runBatch(input, false, "preview", reference);
      return NextResponse.json(preview);
    }

    const checkReference = requestReference("apply-check");
    const updatedPreview = await runBatch(input, false, "preview", checkReference);
    if (
      !updatedPreview.summary.canApply ||
      updatedPreview.summary.blockingCount > 0 ||
      updatedPreview.rows.some((row) => row.blocking)
    ) {
      return errorResponse(
        "team_alias_batch_no_longer_applicable",
        "O lote deixou de estar pronto para aplicação. Reveja o novo resultado.",
        409,
        updatedPreview
      );
    }

    const applyReference = requestReference("apply");
    const applied = await runBatch(input, true, "apply", applyReference);
    if (
      !applied.summary.canApply ||
      applied.summary.blockingCount > 0 ||
      applied.rows.some((row) => row.blocking)
    ) {
      const refreshedCheckReference = requestReference("apply-check");
      const refreshedPreview = await runBatch(
        input,
        false,
        "preview",
        refreshedCheckReference
      );
      return errorResponse(
        "team_alias_batch_no_longer_applicable",
        "O lote deixou de estar pronto para aplicação. Reveja o novo resultado.",
        409,
        refreshedPreview
      );
    }

    if (
      !applied.summary.requestedApply ||
      !applied.summary.canApply ||
      applied.summary.blockingCount !== 0 ||
      applied.rows.some((row) => row.blocking) ||
      applied.summary.createdCount !== applied.rows.filter((row) => row.changed).length
    ) {
      throw new InvalidBatchRpcResponseError();
    }

    return NextResponse.json(applied);
  } catch (error) {
    return rpcErrorResponse(error);
  }
}
