import { NextResponse } from "next/server";
import { getSupabaseServiceConfig, writeSupabaseAdminReturning } from "@/lib/supabase";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;
const PUBLIC_NAME_MAX_CHARACTERS = 80;
const ADMIN_ACTOR_TYPE = "admin_session";
const ADMIN_ACTOR_REFERENCE = "jornada_backoffice_shared_admin";
const ADMIN_SOURCE = "admin_team_public_name";

type ManageTeamPublicNameRow = {
  result_team_id: string;
  result_public_name: string | null;
  result_changed: boolean;
  result_audit_event_id: string | null;
};

type UpdatePublicNameContext = {
  params: Promise<{
    id: string;
  }>;
};

type PublicNameAction = "save" | "clear" | "noop";

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
}

function jsonResponse(body: Record<string, unknown>, status: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store"
    }
  });
}

function isJsonRequest(request: Request) {
  return request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() === "application/json";
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function errorResponse(
  request: Request,
  jsonMode: boolean,
  status: number,
  code: string,
  message: string,
  redirectPath: string
) {
  return jsonMode
    ? jsonResponse({ ok: false, code, message }, status)
    : redirectTo(request, redirectPath);
}

function trimSqlSpaces(value: string) {
  return value.replace(/^ +| +$/g, "");
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

function isValidResult(
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

export async function POST(request: Request, context: UpdatePublicNameContext) {
  const jsonMode = isJsonRequest(request);

  if (!getSupabaseServiceConfig()) {
    return errorResponse(
      request,
      jsonMode,
      503,
      "missing_service_role",
      "Falta configurar o acesso administrativo para guardar o nome público.",
      "/admin/clubes?error=missing-service#clubes-existentes"
    );
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return errorResponse(
      request,
      jsonMode,
      400,
      "invalid_team_id",
      "O identificador do clube é inválido.",
      "/admin/clubes?error=public-name-invalid#clubes-existentes"
    );
  }
  const teamId = id.toLowerCase();

  let rawPublicName: string;
  if (jsonMode) {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return errorResponse(
        request,
        true,
        400,
        "invalid_json",
        "O pedido JSON é inválido.",
        "/admin/clubes?error=public-name-invalid#clubes-existentes"
      );
    }

    const keys = isPlainRecord(body) ? Object.keys(body) : [];
    if (
      !isPlainRecord(body) ||
      keys.length !== 1 ||
      keys[0] !== "publicName" ||
      !Object.prototype.hasOwnProperty.call(body, "publicName") ||
      typeof body.publicName !== "string"
    ) {
      return errorResponse(
        request,
        true,
        400,
        "invalid_request",
        "O pedido deve conter exclusivamente o campo publicName.",
        "/admin/clubes?error=public-name-invalid#clubes-existentes"
      );
    }
    rawPublicName = body.publicName;
  } else {
    let formData: FormData;
    try {
      formData = await request.formData();
    } catch {
      return redirectTo(request, "/admin/clubes?error=public-name-invalid#clubes-existentes");
    }

    const fields = Array.from(formData.keys());
    const values = formData.getAll("publicName");
    if (fields.length !== 1 || fields[0] !== "publicName" || values.length !== 1 || typeof values[0] !== "string") {
      return redirectTo(request, "/admin/clubes?error=public-name-invalid#clubes-existentes");
    }
    rawPublicName = values[0];
  }

  const publicName = trimSqlSpaces(rawPublicName) || null;
  if (
    (publicName !== null && Array.from(publicName).length > PUBLIC_NAME_MAX_CHARACTERS) ||
    (publicName !== null && CONTROL_CHARACTER_PATTERN.test(publicName))
  ) {
    return errorResponse(
      request,
      jsonMode,
      400,
      "invalid_public_name",
      "O nome público deve ter no máximo 80 caracteres e não pode conter caracteres de controlo.",
      "/admin/clubes?error=public-name-invalid#clubes-existentes"
    );
  }

  try {
    const rows = await writeSupabaseAdminReturning<ManageTeamPublicNameRow>(
      "rpc/manage_team_public_name",
      {
        method: "POST",
        body: JSON.stringify({
          p_team_id: teamId,
          p_public_name: publicName,
          p_actor_type: ADMIN_ACTOR_TYPE,
          p_actor_reference: ADMIN_ACTOR_REFERENCE,
          p_source: ADMIN_SOURCE,
          p_request_reference: `team-public-name:update:${crypto.randomUUID()}`
        })
      }
    );
    const result = rows[0];

    if (rows.length !== 1 || !isValidResult(result, teamId, publicName)) {
      console.error("[admin/teams/public-name] manage_team_public_name returned an invalid result");
      return errorResponse(
        request,
        jsonMode,
        502,
        "invalid_rpc_response",
        "O servidor devolveu uma resposta inválida ao guardar o nome público.",
        "/admin/clubes?error=public-name-response#clubes-existentes"
      );
    }

    const action: PublicNameAction = !result.result_changed
      ? "noop"
      : result.result_public_name === null
        ? "clear"
        : "save";
    const message =
      action === "noop"
        ? "O nome público já tinha esse valor."
        : action === "clear"
          ? "Nome público limpo."
          : "Nome público guardado.";

    if (jsonMode) {
      return jsonResponse(
        {
          ok: true,
          teamId: result.result_team_id,
          publicName: result.result_public_name,
          changed: result.result_changed,
          action,
          message
        },
        200
      );
    }

    if (!result.result_changed) {
      return redirectTo(request, "/admin/clubes?public_name_unchanged=1#clubes-existentes");
    }

    if (result.result_public_name === null) {
      return redirectTo(request, "/admin/clubes?public_name_cleared=1#clubes-existentes");
    }

    return redirectTo(request, "/admin/clubes?public_name_updated=1#clubes-existentes");
  } catch (error) {
    const databaseError = databaseErrorDetails(error);

    if (databaseError.message === "team_public_name_team_not_found" || databaseError.code === "P0002") {
      return errorResponse(
        request,
        jsonMode,
        404,
        "team_not_found",
        "O clube já não existe.",
        "/admin/clubes?error=public-name-team-not-found#clubes-existentes"
      );
    }

    if (databaseError.code === "22023") {
      return errorResponse(
        request,
        jsonMode,
        400,
        "invalid_public_name",
        "O nome público é inválido.",
        "/admin/clubes?error=public-name-invalid#clubes-existentes"
      );
    }

    console.error("[admin/teams/public-name] manage_team_public_name failed");
    return errorResponse(
      request,
      jsonMode,
      500,
      "public_name_save_failed",
      "Não foi possível guardar o nome público.",
      "/admin/clubes?error=public-name-save#clubes-existentes"
    );
  }
}
