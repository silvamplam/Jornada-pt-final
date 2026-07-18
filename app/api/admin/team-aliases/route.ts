import { NextResponse } from "next/server";
import {
  parseTeamAliasListQuery,
  parseTeamAliasMutationBody,
  TeamAliasPolicyError,
  type TeamAliasListStatus,
  type TeamAliasMutationInput
} from "@/lib/team-alias-policy";
import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning
} from "@/lib/supabase";

const READ_PAGE_SIZE = 1000;
const TEAM_ID_BATCH_SIZE = 100;
const ADMIN_ALIAS_SOURCE = "admin_manual";
const ADMIN_ALIAS_ACTOR_TYPE = "admin_session";
const ADMIN_ALIAS_ACTOR_REFERENCE = "jornada_backoffice_shared_admin";

type TeamRow = {
  id: string;
  name: string;
  short_name: string | null;
  slug: string;
  code: string | null;
  country_id: string;
};

type TeamAliasRow = {
  id: string;
  team_id: string;
  alias: string;
  normalized_alias: string;
  source: string;
  status: "active" | "inactive";
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
};

type ManageTeamAliasRow = {
  result_team_alias_id: string;
  result_team_id: string;
  result_alias: string;
  result_normalized_alias: string;
  result_status: "active" | "inactive";
  result_changed: boolean;
  result_code: string;
};

type ApiError = {
  ok: false;
  error: string;
  message: string;
  field?: string;
};

const VALID_RESULT_CODES = new Set([
  "created",
  "updated",
  "deactivated",
  "reactivated",
  "noop_existing_active",
  "noop_existing_inactive",
  "noop_unchanged",
  "noop_already_inactive",
  "noop_already_active"
]);

function apiError(error: string, message: string, status: number, field?: string) {
  const payload: ApiError = {
    ok: false,
    error,
    message,
    ...(field ? { field } : {})
  };

  return NextResponse.json(payload, { status });
}

function policyErrorResponse(error: TeamAliasPolicyError) {
  return apiError(error.code, error.message, 400, error.field);
}

async function readTeams(countryId: string, teamId?: string): Promise<TeamRow[]> {
  const rows: TeamRow[] = [];

  for (let offset = 0; ; offset += READ_PAGE_SIZE) {
    const page = await fetchSupabaseAdminTable<TeamRow>(
      `teams?select=id,name,short_name,slug,code,country_id&country_id=eq.${encodeURIComponent(countryId)}` +
        `${teamId ? `&id=eq.${encodeURIComponent(teamId)}` : ""}` +
        `&order=name.asc,id.asc&limit=${READ_PAGE_SIZE}&offset=${offset}`
    );
    rows.push(...page);

    if (page.length < READ_PAGE_SIZE) {
      return rows;
    }
  }
}

async function readAliases(teamIds: string[], status: TeamAliasListStatus): Promise<TeamAliasRow[]> {
  const rows: TeamAliasRow[] = [];

  for (let batchOffset = 0; batchOffset < teamIds.length; batchOffset += TEAM_ID_BATCH_SIZE) {
    const teamIdBatch = teamIds.slice(batchOffset, batchOffset + TEAM_ID_BATCH_SIZE);
    const teamFilter = teamIdBatch.map((teamId) => encodeURIComponent(teamId)).join(",");

    for (let offset = 0; ; offset += READ_PAGE_SIZE) {
      const page = await fetchSupabaseAdminTable<TeamAliasRow>(
        "team_aliases?select=id,team_id,alias,normalized_alias,source,status,created_at,updated_at,created_by,updated_by" +
          `&team_id=in.(${teamFilter})` +
          `${status === "all" ? "" : `&status=eq.${status}`}` +
          `&order=alias.asc,id.asc&limit=${READ_PAGE_SIZE}&offset=${offset}`
      );
      rows.push(...page);

      if (page.length < READ_PAGE_SIZE) {
        break;
      }
    }
  }

  return rows;
}

function rpcArguments(input: TeamAliasMutationInput) {
  return {
    p_action: input.action,
    p_actor_type: ADMIN_ALIAS_ACTOR_TYPE,
    p_actor_reference: ADMIN_ALIAS_ACTOR_REFERENCE,
    p_source: ADMIN_ALIAS_SOURCE,
    p_team_alias_id: input.action === "create" ? null : input.aliasId,
    p_team_id: input.action === "create" ? input.teamId : null,
    p_alias: input.action === "create" || input.action === "update" ? input.alias : null,
    p_request_reference: crypto.randomUUID()
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

function mutationErrorResponse(error: unknown) {
  const databaseError = databaseErrorDetails(error);
  const message = databaseError.message;

  if (message === "team_alias_not_found") {
    return apiError("team-alias-not-found", "O alias pedido não existe.", 404);
  }

  if (message === "team_alias_team_not_found") {
    return apiError("team-alias-team-not-found", "O clube pedido não existe.", 404);
  }

  if (message === "team_alias_conflict_alias_other_team") {
    return apiError("team-alias-conflict-other-team", "O alias já pertence a outro clube.", 409);
  }

  if (message.startsWith("team_alias_conflict_canonical_other_team:")) {
    return apiError(
      "team-alias-conflict-canonical-other-team",
      "O alias coincide com a identidade canónica de outro clube.",
      409
    );
  }

  if (message === "team_alias_duplicate_same_team") {
    return apiError("team-alias-duplicate", "O clube já tem este alias.", 409);
  }

  if (message.startsWith("team_alias_redundant_canonical_identity:")) {
    return apiError(
      "team-alias-redundant-canonical-identity",
      "O alias repete uma identidade canónica do próprio clube.",
      409
    );
  }

  if (message === "team_alias_reassignment_forbidden" || databaseError.code === "23001") {
    return apiError("team-alias-reassignment-forbidden", "A reatribuição de aliases não é permitida.", 409);
  }

  if (databaseError.code === "23505") {
    return apiError("team-alias-conflict", "O alias entra em conflito com uma identidade existente.", 409);
  }

  if (databaseError.code === "23503" || databaseError.code === "P0002") {
    return apiError("team-alias-reference-not-found", "O alias ou clube pedido não existe.", 404);
  }

  if (databaseError.code === "22023") {
    return apiError("team-alias-rpc-input-invalid", "O pedido de alteração foi recusado.", 400);
  }

  console.error("[admin/team-aliases] manage_team_alias failed");
  return apiError("team-alias-mutation-failed", "Não foi possível alterar o alias.", 500);
}

function isValidManageResult(row: ManageTeamAliasRow | undefined): row is ManageTeamAliasRow {
  return Boolean(
    row &&
      typeof row.result_team_alias_id === "string" &&
      typeof row.result_team_id === "string" &&
      typeof row.result_alias === "string" &&
      typeof row.result_normalized_alias === "string" &&
      (row.result_status === "active" || row.result_status === "inactive") &&
      typeof row.result_changed === "boolean" &&
      typeof row.result_code === "string" &&
      VALID_RESULT_CODES.has(row.result_code)
  );
}

export async function GET(request: Request) {
  let query;

  try {
    query = parseTeamAliasListQuery(new URL(request.url).searchParams);
  } catch (error) {
    if (error instanceof TeamAliasPolicyError) {
      return policyErrorResponse(error);
    }

    return apiError("team-alias-query-invalid", "Os parâmetros de pesquisa são inválidos.", 400);
  }

  if (!getSupabaseServiceConfig()) {
    return apiError("missing-service", "A API administrativa não está configurada.", 503);
  }

  try {
    const teams = await readTeams(query.countryId, query.teamId);

    if (query.teamId && teams.length !== 1) {
      return apiError(
        "team-alias-team-not-in-country",
        "O clube pedido não pertence ao país indicado.",
        404
      );
    }

    const teamsById = new Map(teams.map((team) => [team.id, team]));
    const aliases = await readAliases(Array.from(teamsById.keys()), query.status);
    const result = aliases
      .map((alias) => {
        const team = teamsById.get(alias.team_id);
        if (!team) {
          return null;
        }

        return {
          id: alias.id,
          teamId: alias.team_id,
          alias: alias.alias,
          normalizedAlias: alias.normalized_alias,
          source: alias.source,
          status: alias.status,
          createdAt: alias.created_at,
          updatedAt: alias.updated_at,
          createdBy: alias.created_by,
          updatedBy: alias.updated_by,
          teamName: team.name,
          teamShortName: team.short_name,
          teamSlug: team.slug,
          teamCode: team.code,
          countryId: team.country_id
        };
      })
      .filter((alias): alias is NonNullable<typeof alias> => alias !== null)
      .sort(
        (left, right) =>
          left.teamName.localeCompare(right.teamName, "pt", { sensitivity: "base" }) ||
          left.alias.localeCompare(right.alias, "pt", { sensitivity: "base" }) ||
          left.id.localeCompare(right.id)
      );

    if (result.length !== aliases.length) {
      console.error("[admin/team-aliases] alias read returned an unexpected team reference");
      return apiError("team-alias-read-failed", "Não foi possível listar os aliases.", 500);
    }

    return NextResponse.json({ ok: true, aliases: result });
  } catch {
    console.error("[admin/team-aliases] alias read failed");
    return apiError("team-alias-read-failed", "Não foi possível listar os aliases.", 500);
  }
}

export async function POST(request: Request) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return apiError("team-alias-invalid-json", "O body tem de conter JSON válido.", 400);
  }

  let input: TeamAliasMutationInput;

  try {
    input = parseTeamAliasMutationBody(body);
  } catch (error) {
    if (error instanceof TeamAliasPolicyError) {
      return policyErrorResponse(error);
    }

    return apiError("team-alias-input-invalid", "O pedido de alteração é inválido.", 400);
  }

  if (!getSupabaseServiceConfig()) {
    return apiError("missing-service", "A API administrativa não está configurada.", 503);
  }

  try {
    const rows = await writeSupabaseAdminReturning<ManageTeamAliasRow>("rpc/manage_team_alias", {
      method: "POST",
      body: JSON.stringify(rpcArguments(input))
    });
    const result = rows[0];

    if (rows.length !== 1 || !isValidManageResult(result)) {
      console.error("[admin/team-aliases] manage_team_alias returned an invalid result");
      return apiError("team-alias-rpc-invalid-response", "A alteração não devolveu um resultado válido.", 502);
    }

    return NextResponse.json(
      {
        ok: true,
        outcome: result.result_changed ? "changed" : "noop",
        mutation: {
          id: result.result_team_alias_id,
          teamId: result.result_team_id,
          alias: result.result_alias,
          normalizedAlias: result.result_normalized_alias,
          status: result.result_status,
          changed: result.result_changed,
          code: result.result_code
        }
      },
      { status: input.action === "create" && result.result_changed ? 201 : 200 }
    );
  } catch (error) {
    return mutationErrorResponse(error);
  }
}
