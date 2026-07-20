export const TEAM_SAFE_DELETION_CONTRACT_VERSION = "v1" as const;
export const TEAM_SAFE_DELETION_MAX_REQUEST_BYTES = 16 * 1024;

export const TEAM_SAFE_DELETION_STATUSES = [
  "removable",
  "removable_with_aliases",
  "blocked",
] as const;

export const TEAM_SAFE_DELETION_ACTIONS = [
  "delete_team",
  "delete_team_and_aliases",
  "none",
] as const;

const DELETION_ACTIONS = ["delete_team", "delete_team_and_aliases"] as const;

const DEPENDENCY_KEYS = [
  "season_teams",
  "matches_home",
  "matches_away",
  "standing_rows",
  "goals",
  "players",
  "match_events",
  "aliases_active",
  "aliases_inactive",
  "alias_audit_events",
  "public_name_audit_events",
] as const;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^v1:[0-9a-f]{32}$/;

export type TeamSafeDeletionStatus = (typeof TEAM_SAFE_DELETION_STATUSES)[number];
export type TeamSafeDeletionAction = (typeof TEAM_SAFE_DELETION_ACTIONS)[number];
export type TeamSafeDeletionConfirmedAction = (typeof DELETION_ACTIONS)[number];
export type TeamSafeDeletionFingerprint = string;

export type TeamSafeDeletionPreviewRequest = {
  operation: "preview";
};

export type TeamSafeDeletionApplyRequest = {
  operation: "apply";
  previewFingerprint: TeamSafeDeletionFingerprint;
  confirmedAction: TeamSafeDeletionConfirmedAction;
};

export type TeamSafeDeletionRequest =
  | TeamSafeDeletionPreviewRequest
  | TeamSafeDeletionApplyRequest;

export type TeamSafeDeletionAlias = {
  id: string;
  alias: string;
  normalized_alias: string;
  status: "active" | "inactive";
};

export type TeamSafeDeletionCountry = {
  id: string;
  name: string;
  slug: string;
  iso2: string | null;
};

export type TeamSafeDeletionDependency = {
  key: (typeof DEPENDENCY_KEYS)[number];
  table: string;
  column: string;
  count: number;
  blocking: boolean;
  reason: string;
};

export type TeamSafeDeletionRpcResult = {
  contract_version: typeof TEAM_SAFE_DELETION_CONTRACT_VERSION;
  mode: "preview" | "apply";
  applied: boolean;
  team_id: string;
  name: string;
  public_name: string | null;
  short_name: string;
  code: string | null;
  slug: string;
  country: TeamSafeDeletionCountry | null;
  active_aliases: TeamSafeDeletionAlias[];
  inactive_aliases: TeamSafeDeletionAlias[];
  alias_count: number;
  alias_audit_count: number;
  public_name_audit_count: number;
  dependencies: TeamSafeDeletionDependency[];
  status: TeamSafeDeletionStatus;
  can_delete: boolean;
  proposed_action: TeamSafeDeletionAction;
  reason_code: string;
  reason_message: string;
  preview_fingerprint: TeamSafeDeletionFingerprint;
  deleted_team_id: string | null;
  aliases_deleted_count: number;
  alias_audit_events_preserved_count: number;
  public_name_audit_events_preserved_count: number;
  deletion_audit_event_id: string | null;
};

export type TeamSafeDeletionRpcValidationContext = {
  operation: TeamSafeDeletionRequest["operation"];
  teamId: string;
  confirmedFingerprint?: string;
  confirmedAction?: TeamSafeDeletionConfirmedAction;
};

export type TeamSafeDeletionRpcValidationResult =
  | { ok: true; value: TeamSafeDeletionRpcResult }
  | { ok: false; code: "rpc_contract_invalid"; detail: string };

export type TeamSafeDeletionApiSuccess = {
  ok: true;
  operation: TeamSafeDeletionRequest["operation"];
  requestReference: string;
  result: TeamSafeDeletionRpcResult;
};

export type TeamSafeDeletionApiError = {
  ok: false;
  code: string;
  message: string;
  requiresNewPreview: boolean;
};

export class TeamSafeDeletionPolicyError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "TeamSafeDeletionPolicyError";
    this.code = code;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === "string";
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

export function isTeamSafeDeletionUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

export function isTeamSafeDeletionFingerprint(value: unknown): value is string {
  return typeof value === "string" && FINGERPRINT_PATTERN.test(value);
}

export function parseTeamSafeDeletionRequest(value: unknown): TeamSafeDeletionRequest {
  if (!isRecord(value) || typeof value.operation !== "string") {
    throw new TeamSafeDeletionPolicyError(
      "invalid_request",
      "O pedido de remoção segura é inválido.",
    );
  }

  if (value.operation === "preview") {
    if (!hasExactKeys(value, ["operation"])) {
      throw new TeamSafeDeletionPolicyError(
        "unexpected_fields",
        "O pedido de análise contém campos inesperados.",
      );
    }
    return { operation: "preview" };
  }

  if (value.operation === "apply") {
    if (!hasExactKeys(value, ["operation", "previewFingerprint", "confirmedAction"])) {
      throw new TeamSafeDeletionPolicyError(
        "unexpected_fields",
        "O pedido de remoção contém campos inesperados ou em falta.",
      );
    }
    if (!isTeamSafeDeletionFingerprint(value.previewFingerprint)) {
      throw new TeamSafeDeletionPolicyError(
        "invalid_fingerprint",
        "A análise confirmada é inválida ou está em falta.",
      );
    }
    if (
      value.confirmedAction !== "delete_team" &&
      value.confirmedAction !== "delete_team_and_aliases"
    ) {
      throw new TeamSafeDeletionPolicyError(
        "invalid_action",
        "A ação de remoção confirmada é inválida.",
      );
    }
    return {
      operation: "apply",
      previewFingerprint: value.previewFingerprint,
      confirmedAction: value.confirmedAction,
    };
  }

  throw new TeamSafeDeletionPolicyError(
    "invalid_operation",
    "A operação de remoção segura é inválida.",
  );
}

function parseAlias(value: unknown, expectedStatus: "active" | "inactive"): TeamSafeDeletionAlias | null {
  if (!isRecord(value) || !hasExactKeys(value, ["id", "alias", "normalized_alias", "status"])) {
    return null;
  }
  if (
    !isTeamSafeDeletionUuid(value.id) ||
    !isNonEmptyString(value.alias) ||
    !isNonEmptyString(value.normalized_alias) ||
    value.status !== expectedStatus
  ) {
    return null;
  }
  return {
    id: value.id,
    alias: value.alias,
    normalized_alias: value.normalized_alias,
    status: expectedStatus,
  };
}

function parseCountry(value: unknown): TeamSafeDeletionCountry | null | undefined {
  if (value === null) return null;
  if (!isRecord(value) || !hasExactKeys(value, ["id", "name", "slug", "iso2"])) return undefined;
  if (
    !isTeamSafeDeletionUuid(value.id) ||
    !isNonEmptyString(value.name) ||
    !isNonEmptyString(value.slug) ||
    !isNullableString(value.iso2)
  ) {
    return undefined;
  }
  return { id: value.id, name: value.name, slug: value.slug, iso2: value.iso2 };
}

function parseDependency(value: unknown): TeamSafeDeletionDependency | null {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, ["key", "table", "column", "count", "blocking", "reason"])
  ) {
    return null;
  }
  if (
    !DEPENDENCY_KEYS.includes(value.key as (typeof DEPENDENCY_KEYS)[number]) ||
    !isNonEmptyString(value.table) ||
    !isNonEmptyString(value.column) ||
    !isNonNegativeInteger(value.count) ||
    typeof value.blocking !== "boolean" ||
    typeof value.reason !== "string"
  ) {
    return null;
  }
  return {
    key: value.key as TeamSafeDeletionDependency["key"],
    table: value.table,
    column: value.column,
    count: value.count,
    blocking: value.blocking,
    reason: value.reason,
  };
}

function validationFailure(detail: string): TeamSafeDeletionRpcValidationResult {
  return { ok: false, code: "rpc_contract_invalid", detail };
}

export function validateTeamSafeDeletionRpcResult(
  value: unknown,
  expected: TeamSafeDeletionRpcValidationContext,
): TeamSafeDeletionRpcValidationResult {
  const keys = [
    "contract_version",
    "mode",
    "applied",
    "team_id",
    "name",
    "public_name",
    "short_name",
    "code",
    "slug",
    "country",
    "active_aliases",
    "inactive_aliases",
    "alias_count",
    "alias_audit_count",
    "public_name_audit_count",
    "dependencies",
    "status",
    "can_delete",
    "proposed_action",
    "reason_code",
    "reason_message",
    "preview_fingerprint",
    "deleted_team_id",
    "aliases_deleted_count",
    "alias_audit_events_preserved_count",
    "public_name_audit_events_preserved_count",
    "deletion_audit_event_id",
  ] as const;

  if (!isRecord(value) || !hasExactKeys(value, keys)) {
    return validationFailure("A resposta da RPC não contém exatamente o contrato esperado.");
  }
  if (
    value.contract_version !== TEAM_SAFE_DELETION_CONTRACT_VERSION ||
    value.mode !== expected.operation ||
    typeof value.applied !== "boolean" ||
    !isTeamSafeDeletionUuid(value.team_id) ||
    value.team_id.toLowerCase() !== expected.teamId.toLowerCase() ||
    !isNonEmptyString(value.name) ||
    !isNullableString(value.public_name) ||
    !isNonEmptyString(value.short_name) ||
    !isNullableString(value.code) ||
    !isNonEmptyString(value.slug) ||
    !TEAM_SAFE_DELETION_STATUSES.includes(value.status as TeamSafeDeletionStatus) ||
    !TEAM_SAFE_DELETION_ACTIONS.includes(value.proposed_action as TeamSafeDeletionAction) ||
    typeof value.can_delete !== "boolean" ||
    typeof value.reason_code !== "string" ||
    typeof value.reason_message !== "string" ||
    !isTeamSafeDeletionFingerprint(value.preview_fingerprint)
  ) {
    return validationFailure("A identidade, o estado ou a fingerprint da resposta é inválida.");
  }

  const country = parseCountry(value.country);
  if (country === undefined) return validationFailure("O país devolvido pela RPC é inválido.");

  if (!Array.isArray(value.active_aliases) || !Array.isArray(value.inactive_aliases)) {
    return validationFailure("Os aliases devolvidos pela RPC são inválidos.");
  }
  const activeAliases = value.active_aliases.map((item) => parseAlias(item, "active"));
  const inactiveAliases = value.inactive_aliases.map((item) => parseAlias(item, "inactive"));
  if (activeAliases.some((item) => item === null) || inactiveAliases.some((item) => item === null)) {
    return validationFailure("Um alias devolvido pela RPC não respeita o contrato.");
  }

  if (!Array.isArray(value.dependencies)) {
    return validationFailure("A lista de dependências devolvida pela RPC é inválida.");
  }
  const dependencies = value.dependencies.map(parseDependency);
  if (dependencies.some((item) => item === null)) {
    return validationFailure("Uma dependência devolvida pela RPC não respeita o contrato.");
  }
  const dependencyValues = dependencies as TeamSafeDeletionDependency[];
  const dependencyKeySet = new Set(dependencyValues.map((item) => item.key));
  if (
    dependencyKeySet.size !== DEPENDENCY_KEYS.length ||
    DEPENDENCY_KEYS.some((key) => !dependencyKeySet.has(key))
  ) {
    return validationFailure("O conjunto de dependências devolvido pela RPC está incompleto.");
  }

  const countFields = [
    value.alias_count,
    value.alias_audit_count,
    value.public_name_audit_count,
    value.aliases_deleted_count,
    value.alias_audit_events_preserved_count,
    value.public_name_audit_events_preserved_count,
  ];
  if (countFields.some((item) => !isNonNegativeInteger(item))) {
    return validationFailure("Um contador devolvido pela RPC é inválido.");
  }
  if (
    value.alias_count !== activeAliases.length + inactiveAliases.length ||
    dependencyValues.find((item) => item.key === "aliases_active")?.count !== activeAliases.length ||
    dependencyValues.find((item) => item.key === "aliases_inactive")?.count !== inactiveAliases.length ||
    dependencyValues.find((item) => item.key === "alias_audit_events")?.count !== value.alias_audit_count ||
    dependencyValues.find((item) => item.key === "public_name_audit_events")?.count !==
      value.public_name_audit_count
  ) {
    return validationFailure("Os contadores de aliases ou auditoria são incoerentes.");
  }

  const blockingCount = dependencyValues
    .filter((item) => item.blocking)
    .reduce((total, item) => total + item.count, 0);
  const status = value.status as TeamSafeDeletionStatus;
  const proposedAction = value.proposed_action as TeamSafeDeletionAction;
  const expectedCanDelete = expected.operation === "preview" && status !== "blocked";
  if (
    value.can_delete !== expectedCanDelete ||
    (status === "blocked" && (proposedAction !== "none" || blockingCount === 0)) ||
    (status === "removable" &&
      (proposedAction !== "delete_team" || value.alias_count !== 0 || blockingCount > 0)) ||
    (status === "removable_with_aliases" &&
      (proposedAction !== "delete_team_and_aliases" || value.alias_count === 0 || blockingCount > 0))
  ) {
    return validationFailure("O estado, a ação proposta e as dependências são incoerentes.");
  }

  const deletedTeamId = value.deleted_team_id;
  const deletionAuditEventId = value.deletion_audit_event_id;
  if (
    (deletedTeamId !== null && !isTeamSafeDeletionUuid(deletedTeamId)) ||
    (deletionAuditEventId !== null && !isTeamSafeDeletionUuid(deletionAuditEventId))
  ) {
    return validationFailure("Os identificadores finais da remoção são inválidos.");
  }
  const finalDeletedTeamId = deletedTeamId as string | null;
  const finalDeletionAuditEventId = deletionAuditEventId as string | null;

  if (expected.operation === "preview") {
    if (
      value.applied ||
      finalDeletedTeamId !== null ||
      finalDeletionAuditEventId !== null ||
      value.aliases_deleted_count !== 0 ||
      value.alias_audit_events_preserved_count !== 0 ||
      value.public_name_audit_events_preserved_count !== 0
    ) {
      return validationFailure("Uma resposta de preview contém mutações.");
    }
  } else {
    if (
      !value.applied ||
      finalDeletedTeamId?.toLowerCase() !== expected.teamId.toLowerCase() ||
      finalDeletionAuditEventId === null ||
      value.preview_fingerprint !== expected.confirmedFingerprint ||
      proposedAction !== expected.confirmedAction ||
      value.aliases_deleted_count !== value.alias_count ||
      value.alias_audit_events_preserved_count !== value.alias_audit_count ||
      value.public_name_audit_events_preserved_count !== value.public_name_audit_count
    ) {
      return validationFailure("Uma resposta de apply não confirma uma remoção integral coerente.");
    }
  }

  return {
    ok: true,
    value: {
      contract_version: TEAM_SAFE_DELETION_CONTRACT_VERSION,
      mode: value.mode as "preview" | "apply",
      applied: value.applied,
      team_id: value.team_id,
      name: value.name,
      public_name: value.public_name,
      short_name: value.short_name,
      code: value.code,
      slug: value.slug,
      country,
      active_aliases: activeAliases as TeamSafeDeletionAlias[],
      inactive_aliases: inactiveAliases as TeamSafeDeletionAlias[],
      alias_count: value.alias_count as number,
      alias_audit_count: value.alias_audit_count as number,
      public_name_audit_count: value.public_name_audit_count as number,
      dependencies: dependencyValues,
      status,
      can_delete: value.can_delete,
      proposed_action: proposedAction,
      reason_code: value.reason_code,
      reason_message: value.reason_message,
      preview_fingerprint: value.preview_fingerprint,
      deleted_team_id: finalDeletedTeamId,
      aliases_deleted_count: value.aliases_deleted_count as number,
      alias_audit_events_preserved_count: value.alias_audit_events_preserved_count as number,
      public_name_audit_events_preserved_count:
        value.public_name_audit_events_preserved_count as number,
      deletion_audit_event_id: finalDeletionAuditEventId,
    },
  };
}

export function isTeamSafeDeletionApiSuccess(value: unknown): value is TeamSafeDeletionApiSuccess {
  return (
    isRecord(value) &&
    value.ok === true &&
    (value.operation === "preview" || value.operation === "apply") &&
    typeof value.requestReference === "string" &&
    isRecord(value.result)
  );
}

export function isTeamSafeDeletionApiError(value: unknown): value is TeamSafeDeletionApiError {
  return (
    isRecord(value) &&
    value.ok === false &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    typeof value.requiresNewPreview === "boolean"
  );
}

export function canApplyTeamSafeDeletion(
  preview: TeamSafeDeletionRpcResult | null,
  confirmation: string,
): boolean {
  return Boolean(
    preview &&
      preview.mode === "preview" &&
      preview.can_delete &&
      preview.status !== "blocked" &&
      preview.proposed_action !== "none" &&
      confirmation === preview.name,
  );
}

export function buildTeamSafeDeletionApplyRequest(
  preview: TeamSafeDeletionRpcResult,
): TeamSafeDeletionApplyRequest {
  if (
    preview.mode !== "preview" ||
    !preview.can_delete ||
    preview.status === "blocked" ||
    (preview.proposed_action !== "delete_team" &&
      preview.proposed_action !== "delete_team_and_aliases")
  ) {
    throw new TeamSafeDeletionPolicyError(
      "deletion_blocked",
      "Este clube não pode ser removido com a análise atual.",
    );
  }
  return {
    operation: "apply",
    previewFingerprint: preview.preview_fingerprint,
    confirmedAction: preview.proposed_action,
  };
}
