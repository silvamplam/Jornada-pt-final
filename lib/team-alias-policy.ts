import { normalizeTeamIdentityKey } from "@/lib/team-identity-key";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_ALIAS_CHARACTERS = 160;

const FORBIDDEN_BROWSER_FIELDS = new Set([
  "normalized_alias",
  "normalizedAlias",
  "status",
  "source",
  "createdBy",
  "updatedBy",
  "actorType",
  "actorReference",
  "beforeState",
  "afterState"
]);

const MUTATION_ACTIONS = new Set<TeamAliasMutationAction>([
  "create",
  "update",
  "deactivate",
  "reactivate"
]);

const LIST_STATUSES = new Set<TeamAliasListStatus>(["active", "inactive", "all"]);

export type TeamAliasMutationAction = "create" | "update" | "deactivate" | "reactivate";

export type CreateTeamAliasInput = {
  action: "create";
  teamId: string;
  alias: string;
};

export type UpdateTeamAliasInput = {
  action: "update";
  aliasId: string;
  alias: string;
};

export type DeactivateTeamAliasInput = {
  action: "deactivate";
  aliasId: string;
};

export type ReactivateTeamAliasInput = {
  action: "reactivate";
  aliasId: string;
};

export type TeamAliasMutationInput =
  | CreateTeamAliasInput
  | UpdateTeamAliasInput
  | DeactivateTeamAliasInput
  | ReactivateTeamAliasInput;

export type TeamAliasListStatus = "active" | "inactive" | "all";

export type TeamAliasListQuery = {
  countryId: string;
  teamId?: string;
  status: TeamAliasListStatus;
};

export type TeamAliasPolicyErrorCode =
  | "team-alias-body-not-object"
  | "team-alias-forbidden-field"
  | "team-alias-action-required"
  | "team-alias-action-not-allowed"
  | "team-alias-action-invalid"
  | "team-alias-team-id-not-allowed"
  | "team-alias-unexpected-field"
  | "team-alias-uuid-required"
  | "team-alias-uuid-invalid"
  | "team-alias-alias-required"
  | "team-alias-alias-invalid"
  | "team-alias-alias-too-long"
  | "team-alias-normalized-alias-empty"
  | "team-alias-query-parameter-repeated"
  | "team-alias-query-parameter-unsupported"
  | "team-alias-status-invalid";

const ERROR_MESSAGES: Record<TeamAliasPolicyErrorCode, string> = {
  "team-alias-body-not-object": "O body tem de ser um objeto JSON.",
  "team-alias-forbidden-field": "O pedido contém um campo reservado ao servidor.",
  "team-alias-action-required": "A ação é obrigatória.",
  "team-alias-action-not-allowed": "A ação pedida não é permitida.",
  "team-alias-action-invalid": "A ação pedida é inválida.",
  "team-alias-team-id-not-allowed": "teamId só é permitido na criação de um alias.",
  "team-alias-unexpected-field": "O pedido contém um campo não permitido.",
  "team-alias-uuid-required": "O identificador é obrigatório.",
  "team-alias-uuid-invalid": "O identificador tem de ser um UUID válido.",
  "team-alias-alias-required": "O alias é obrigatório.",
  "team-alias-alias-invalid": "O alias tem de ser texto.",
  "team-alias-alias-too-long": "O alias não pode exceder 160 caracteres.",
  "team-alias-normalized-alias-empty": "O alias tem de conter pelo menos uma letra ou um número ASCII.",
  "team-alias-query-parameter-repeated": "Um parâmetro de pesquisa foi repetido.",
  "team-alias-query-parameter-unsupported": "A pesquisa contém um parâmetro não permitido.",
  "team-alias-status-invalid": "O estado tem de ser active, inactive ou all."
};

export class TeamAliasPolicyError extends Error {
  readonly code: TeamAliasPolicyErrorCode;
  readonly field?: string;

  constructor(code: TeamAliasPolicyErrorCode, field?: string) {
    super(ERROR_MESSAGES[code]);
    this.name = "TeamAliasPolicyError";
    this.code = code;
    this.field = field;
  }
}

function fail(code: TeamAliasPolicyErrorCode, field?: string): never {
  throw new TeamAliasPolicyError(code, field);
}

function parseUuid(value: unknown, field: string): string {
  if (value === undefined || value === null || value === "") {
    return fail("team-alias-uuid-required", field);
  }

  if (typeof value !== "string") {
    return fail("team-alias-uuid-invalid", field);
  }

  const trimmed = value.trim();
  if (!UUID_PATTERN.test(trimmed)) {
    return fail("team-alias-uuid-invalid", field);
  }

  return trimmed.toLowerCase();
}

function parseAlias(value: unknown): string {
  if (value === undefined || value === null || value === "") {
    return fail("team-alias-alias-required", "alias");
  }

  if (typeof value !== "string") {
    return fail("team-alias-alias-invalid", "alias");
  }

  const alias = value.trim();
  if (!alias) {
    return fail("team-alias-alias-required", "alias");
  }

  if (Array.from(alias).length > MAX_ALIAS_CHARACTERS) {
    return fail("team-alias-alias-too-long", "alias");
  }

  if (!normalizeTeamIdentityKey(alias)) {
    return fail("team-alias-normalized-alias-empty", "alias");
  }

  return alias;
}

function rejectForbiddenFields(body: Record<string, unknown>) {
  for (const field of Object.keys(body)) {
    if (FORBIDDEN_BROWSER_FIELDS.has(field)) {
      fail("team-alias-forbidden-field", field);
    }
  }
}

function rejectUnexpectedFields(body: Record<string, unknown>, allowedFields: ReadonlySet<string>) {
  for (const field of Object.keys(body)) {
    if (!allowedFields.has(field)) {
      fail("team-alias-unexpected-field", field);
    }
  }
}

export function parseTeamAliasMutationBody(value: unknown): TeamAliasMutationInput {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return fail("team-alias-body-not-object");
  }

  const body = value as Record<string, unknown>;
  rejectForbiddenFields(body);

  if (body.action === undefined || body.action === null || body.action === "") {
    return fail("team-alias-action-required", "action");
  }

  if (body.action === "delete" || body.action === "reassign") {
    return fail("team-alias-action-not-allowed", "action");
  }

  if (typeof body.action !== "string" || !MUTATION_ACTIONS.has(body.action as TeamAliasMutationAction)) {
    return fail("team-alias-action-invalid", "action");
  }

  const action = body.action as TeamAliasMutationAction;
  if (action !== "create" && Object.prototype.hasOwnProperty.call(body, "teamId")) {
    return fail("team-alias-team-id-not-allowed", "teamId");
  }

  if (action === "create") {
    rejectUnexpectedFields(body, new Set(["action", "teamId", "alias"]));
    return {
      action,
      teamId: parseUuid(body.teamId, "teamId"),
      alias: parseAlias(body.alias)
    };
  }

  if (action === "update") {
    rejectUnexpectedFields(body, new Set(["action", "aliasId", "alias"]));
    return {
      action,
      aliasId: parseUuid(body.aliasId, "aliasId"),
      alias: parseAlias(body.alias)
    };
  }

  rejectUnexpectedFields(body, new Set(["action", "aliasId"]));
  const aliasId = parseUuid(body.aliasId, "aliasId");
  return action === "deactivate" ? { action, aliasId } : { action, aliasId };
}

export function parseTeamAliasListQuery(searchParams: URLSearchParams): TeamAliasListQuery {
  const allowedParameters = new Set(["countryId", "teamId", "status"]);

  for (const parameter of searchParams.keys()) {
    if (!allowedParameters.has(parameter)) {
      return fail("team-alias-query-parameter-unsupported", parameter);
    }

    if (searchParams.getAll(parameter).length > 1) {
      return fail("team-alias-query-parameter-repeated", parameter);
    }
  }

  const countryId = parseUuid(searchParams.get("countryId"), "countryId");
  const teamIdValue = searchParams.get("teamId");
  const teamId = teamIdValue === null ? undefined : parseUuid(teamIdValue, "teamId");
  const statusValue = searchParams.get("status") ?? "all";

  if (!LIST_STATUSES.has(statusValue as TeamAliasListStatus)) {
    return fail("team-alias-status-invalid", "status");
  }

  return {
    countryId,
    ...(teamId ? { teamId } : {}),
    status: statusValue as TeamAliasListStatus
  };
}
