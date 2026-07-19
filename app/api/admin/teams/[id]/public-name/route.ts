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

function redirectTo(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url), { status: 303 });
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
  if (!getSupabaseServiceConfig()) {
    return redirectTo(request, "/admin/clubes?error=missing-service#clubes-existentes");
  }

  const { id } = await context.params;
  if (!UUID_PATTERN.test(id)) {
    return redirectTo(request, "/admin/clubes?error=public-name-invalid#clubes-existentes");
  }
  const teamId = id.toLowerCase();

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

  const publicName = trimSqlSpaces(values[0]) || null;
  if (
    (publicName !== null && Array.from(publicName).length > PUBLIC_NAME_MAX_CHARACTERS) ||
    (publicName !== null && CONTROL_CHARACTER_PATTERN.test(publicName))
  ) {
    return redirectTo(request, "/admin/clubes?error=public-name-invalid#clubes-existentes");
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
      return redirectTo(request, "/admin/clubes?error=public-name-response#clubes-existentes");
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
      return redirectTo(request, "/admin/clubes?error=public-name-team-not-found#clubes-existentes");
    }

    if (databaseError.code === "22023") {
      return redirectTo(request, "/admin/clubes?error=public-name-invalid#clubes-existentes");
    }

    console.error("[admin/teams/public-name] manage_team_public_name failed");
    return redirectTo(request, "/admin/clubes?error=public-name-save#clubes-existentes");
  }
}
