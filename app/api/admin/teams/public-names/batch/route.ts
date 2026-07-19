import { NextResponse } from "next/server";
import {
  classifyTeamPublicNameChange,
  parseTeamPublicNameBatchRequest,
  publicNameValidationMessage,
  TEAM_PUBLIC_NAME_BATCH_MAX_BODY_BYTES,
  TeamPublicNameBatchPolicyError,
  type ParsedTeamPublicNameBatchRequest,
  type TeamPublicNameApplyStatus,
  type TeamPublicNameBatchApplyResponse,
  type TeamPublicNameBatchApplyRow,
  type TeamPublicNameBatchErrorResponse,
  type TeamPublicNameBatchPreviewResponse,
  type TeamPublicNameBatchPreviewRow,
  type TeamPublicNameBatchPreviewSummary
} from "@/lib/team-public-name-batch-policy";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning
} from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ADMIN_ACTOR_TYPE = "admin_session";
const ADMIN_ACTOR_REFERENCE = "jornada_backoffice_shared_admin";
const ADMIN_SOURCE = "admin_team_public_name_batch";

type CurrentTeamRow = {
  id: string;
  name: string;
  public_name: string | null;
};

type ManageTeamPublicNameRow = {
  result_team_id: string;
  result_public_name: string | null;
  result_changed: boolean;
  result_audit_event_id: string | null;
};

class InvalidTeamReadResponseError extends Error {
  constructor() {
    super("Invalid administrative team read response");
    this.name = "InvalidTeamReadResponseError";
  }
}

class InvalidTeamPublicNameRpcResponseError extends Error {
  constructor() {
    super("Invalid manage_team_public_name response");
    this.name = "InvalidTeamPublicNameRpcResponseError";
  }
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function errorResponse(
  code: string,
  message: string,
  status: number,
  preview?: TeamPublicNameBatchPreviewResponse
) {
  const payload: TeamPublicNameBatchErrorResponse = {
    ok: false,
    code,
    message,
    ...(preview ? { preview } : {})
  };
  return jsonResponse(payload, status);
}

function isJsonRequest(request: Request): boolean {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function isCurrentTeamRow(value: unknown): value is CurrentTeamRow {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    typeof (value as CurrentTeamRow).id === "string" &&
    UUID_PATTERN.test((value as CurrentTeamRow).id) &&
    typeof (value as CurrentTeamRow).name === "string" &&
    (typeof (value as CurrentTeamRow).public_name === "string" ||
      (value as CurrentTeamRow).public_name === null)
  );
}

function isValidRpcResult(
  row: ManageTeamPublicNameRow | undefined,
  teamId: string,
  publicName: string | null
): row is ManageTeamPublicNameRow {
  if (
    !row ||
    row.result_team_id !== teamId ||
    row.result_public_name !== publicName ||
    typeof row.result_changed !== "boolean"
  ) {
    return false;
  }

  if (row.result_changed) {
    return typeof row.result_audit_event_id === "string" && UUID_PATTERN.test(row.result_audit_event_id);
  }

  return row.result_audit_event_id === null;
}

async function readCurrentTeams(teamIds: string[]): Promise<Map<string, CurrentTeamRow>> {
  const rows = await fetchSupabaseAdminTable<unknown>(
    `teams?select=id,name,public_name&id=in.(${teamIds.join(",")})&order=name.asc,id.asc`
  );
  if (!rows.every(isCurrentTeamRow)) {
    throw new InvalidTeamReadResponseError();
  }

  const requestedIds = new Set(teamIds);
  const teams = new Map<string, CurrentTeamRow>();
  for (const row of rows) {
    const teamId = row.id.toLowerCase();
    if (!requestedIds.has(teamId) || teams.has(teamId)) {
      throw new InvalidTeamReadResponseError();
    }
    teams.set(teamId, { ...row, id: teamId });
  }

  return teams;
}

function previewMessage(status: TeamPublicNameBatchPreviewRow["status"]): string | null {
  if (status === "set") {
    return "Novo nome público pronto para guardar.";
  }
  if (status === "update") {
    return "Nome público existente será atualizado.";
  }
  if (status === "clear") {
    return "O nome público será limpo.";
  }
  if (status === "noop") {
    return "O nome público já tem este valor.";
  }
  if (status === "not_found") {
    return "O clube já não existe.";
  }
  return null;
}

function buildPreview(
  input: ParsedTeamPublicNameBatchRequest,
  teams: Map<string, CurrentTeamRow>
): TeamPublicNameBatchPreviewResponse {
  const rows = input.rows.map<TeamPublicNameBatchPreviewRow>((inputRow) => {
    const team = teams.get(inputRow.teamId);
    if (!team) {
      return {
        teamId: inputRow.teamId,
        canonicalName: null,
        currentPublicName: null,
        proposedPublicName: inputRow.publicName,
        status: "not_found",
        message: previewMessage("not_found"),
        snapshot: null
      };
    }

    if (inputRow.validationCode) {
      return {
        teamId: inputRow.teamId,
        canonicalName: team.name,
        currentPublicName: team.public_name,
        proposedPublicName: inputRow.publicName,
        status: "invalid",
        message: publicNameValidationMessage(inputRow.validationCode),
        snapshot: null
      };
    }

    const status = classifyTeamPublicNameChange(team.public_name, inputRow.publicName);
    return {
      teamId: inputRow.teamId,
      canonicalName: team.name,
      currentPublicName: team.public_name,
      proposedPublicName: inputRow.publicName,
      status,
      message: previewMessage(status),
      snapshot: {
        teamId: inputRow.teamId,
        publicName: inputRow.publicName,
        expectedPublicName: team.public_name
      }
    };
  });

  const summary: TeamPublicNameBatchPreviewSummary = {
    total: rows.length,
    sets: rows.filter((row) => row.status === "set").length,
    updates: rows.filter((row) => row.status === "update").length,
    clears: rows.filter((row) => row.status === "clear").length,
    noops: rows.filter((row) => row.status === "noop").length,
    invalid: rows.filter((row) => row.status === "invalid").length,
    notFound: rows.filter((row) => row.status === "not_found").length
  };

  return {
    ok: true,
    operation: "preview",
    rows,
    summary
  };
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

function controlledRpcError(error: unknown): string {
  if (error instanceof InvalidTeamPublicNameRpcResponseError) {
    return "A operação devolveu uma resposta inválida.";
  }

  const databaseError = databaseErrorDetails(error);
  if (databaseError.message === "team_public_name_team_not_found" || databaseError.code === "P0002") {
    return "O clube deixou de estar disponível.";
  }
  if (databaseError.code === "22023") {
    return "O nome público foi recusado pela validação administrativa.";
  }
  return "Não foi possível guardar o nome público deste clube.";
}

async function applyTeamPublicName(
  team: CurrentTeamRow,
  publicName: string | null
): Promise<ManageTeamPublicNameRow> {
  const rows = await writeSupabaseAdminReturning<ManageTeamPublicNameRow>(
    "rpc/manage_team_public_name",
    {
      method: "POST",
      body: JSON.stringify({
        p_team_id: team.id,
        p_public_name: publicName,
        p_actor_type: ADMIN_ACTOR_TYPE,
        p_actor_reference: ADMIN_ACTOR_REFERENCE,
        p_source: ADMIN_SOURCE,
        p_request_reference: `team-public-name:batch:${team.id}:${crypto.randomUUID()}`
      })
    }
  );
  const result = rows[0];
  if (rows.length !== 1 || !isValidRpcResult(result, team.id, publicName)) {
    throw new InvalidTeamPublicNameRpcResponseError();
  }
  return result;
}

function changedApplyStatus(
  plannedStatus: Exclude<TeamPublicNameBatchPreviewRow["status"], "invalid" | "not_found">,
  publicName: string | null
): Exclude<TeamPublicNameApplyStatus, "noop" | "error"> {
  if (plannedStatus === "set") {
    return "set";
  }
  if (plannedStatus === "clear" || publicName === null) {
    return "cleared";
  }
  return "updated";
}

function applyMessage(status: TeamPublicNameApplyStatus): string {
  if (status === "set") {
    return "Nome público definido e auditado.";
  }
  if (status === "updated") {
    return "Nome público atualizado e auditado.";
  }
  if (status === "cleared") {
    return "Nome público limpo e auditado.";
  }
  if (status === "noop") {
    return "Sem alteração e sem novo evento de auditoria.";
  }
  return "Não foi possível concluir esta linha.";
}

async function applyBatch(
  input: ParsedTeamPublicNameBatchRequest,
  teams: Map<string, CurrentTeamRow>
): Promise<TeamPublicNameBatchApplyResponse> {
  const rows: TeamPublicNameBatchApplyRow[] = [];

  for (const inputRow of input.rows) {
    const team = teams.get(inputRow.teamId);
    if (!team) {
      throw new InvalidTeamReadResponseError();
    }
    const plannedStatus = classifyTeamPublicNameChange(team.public_name, inputRow.publicName);

    try {
      const result = await applyTeamPublicName(team, inputRow.publicName);
      const status: TeamPublicNameApplyStatus = result.result_changed
        ? changedApplyStatus(plannedStatus, result.result_public_name)
        : "noop";
      rows.push({
        teamId: team.id,
        canonicalName: team.name,
        publicName: result.result_public_name,
        status,
        message: applyMessage(status)
      });
    } catch (error) {
      console.error(`[admin/teams/public-names/batch] manage_team_public_name failed for ${team.id}`);
      rows.push({
        teamId: team.id,
        canonicalName: team.name,
        publicName: team.public_name,
        status: "error",
        message: controlledRpcError(error)
      });
    }
  }

  const summary = {
    total: rows.length,
    sets: rows.filter((row) => row.status === "set").length,
    updates: rows.filter((row) => row.status === "updated").length,
    clears: rows.filter((row) => row.status === "cleared").length,
    noops: rows.filter((row) => row.status === "noop").length,
    errors: rows.filter((row) => row.status === "error").length,
    succeeded: rows.filter((row) => row.status !== "error").length
  };

  return {
    ok: true,
    operation: "apply",
    rows,
    summary
  };
}

export async function POST(request: Request) {
  if (!isJsonRequest(request)) {
    return errorResponse(
      "team-public-name-batch-content-type-invalid",
      "O pedido tem de usar Content-Type application/json.",
      415
    );
  }

  let rawBody: string;
  try {
    rawBody = await request.text();
  } catch {
    return errorResponse(
      "team-public-name-batch-body-read-failed",
      "Não foi possível ler o pedido.",
      400
    );
  }

  if (new TextEncoder().encode(rawBody).byteLength > TEAM_PUBLIC_NAME_BATCH_MAX_BODY_BYTES) {
    return errorResponse(
      "team-public-name-batch-body-too-large",
      "O pedido excede o limite permitido.",
      413
    );
  }

  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse(
      "team-public-name-batch-json-invalid",
      "O body tem de conter JSON válido.",
      400
    );
  }

  let input: ParsedTeamPublicNameBatchRequest;
  try {
    input = parseTeamPublicNameBatchRequest(body);
  } catch (error) {
    if (error instanceof TeamPublicNameBatchPolicyError) {
      return errorResponse(error.code, error.message, 400);
    }
    return errorResponse(
      "team-public-name-batch-request-invalid",
      "O pedido de nomes públicos é inválido.",
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

  let teams: Map<string, CurrentTeamRow>;
  try {
    teams = await readCurrentTeams(input.rows.map((row) => row.teamId));
  } catch (error) {
    if (error instanceof InvalidTeamReadResponseError) {
      console.error("[admin/teams/public-names/batch] teams returned an invalid response");
      return errorResponse(
        "team-public-name-batch-teams-invalid-response",
        "Não foi possível validar os clubes do lote.",
        502
      );
    }
    console.error("[admin/teams/public-names/batch] team read failed");
    return errorResponse(
      "team-public-name-batch-team-read-failed",
      "Não foi possível reler os clubes do lote.",
      500
    );
  }

  const preview = buildPreview(input, teams);
  if (input.action === "preview") {
    return jsonResponse(preview, 200);
  }

  const previewIsStale = input.rows.some((row) => {
    const team = teams.get(row.teamId);
    return (
      !team ||
      row.validationCode !== null ||
      row.expectedPublicName === undefined ||
      team.public_name !== row.expectedPublicName
    );
  });
  if (previewIsStale) {
    return errorResponse(
      "team_public_name_batch_stale_preview",
      "Um ou mais nomes foram alterados desde a última pré-visualização. Reveja o lote atualizado.",
      409,
      preview
    );
  }

  const applied = await applyBatch(input, teams);
  return jsonResponse(applied, 200);
}
