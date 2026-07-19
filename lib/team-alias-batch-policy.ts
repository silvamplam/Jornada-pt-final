const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINE_NUMBER = 2147483647;

export const TEAM_ALIAS_BATCH_MAX_ROWS = 500;
export const TEAM_ALIAS_BATCH_MAX_BODY_BYTES = 524288;

export type TeamAliasBatchAction = "preview" | "apply";

export type TeamAliasBatchInputRow = {
  lineNumber: number;
  canonicalClub: string;
  alias: string;
};

export type TeamAliasBatchRequest = {
  action: TeamAliasBatchAction;
  countryId: string;
  rows: TeamAliasBatchInputRow[];
};

export type TeamAliasBatchStatus =
  | "create"
  | "existing_active_same_team"
  | "existing_inactive_same_team"
  | "unknown_club"
  | "ambiguous_club"
  | "duplicate_alias_in_batch"
  | "alias_conflict_other_team"
  | "canonical_identity_conflict_other_team"
  | "redundant_same_team_identity"
  | "invalid_row";

export type TeamAliasBatchResultRow = {
  lineNumber: number | null;
  canonicalClubInput: string | null;
  aliasInput: string | null;
  normalizedAlias: string | null;
  resolvedTeamId: string | null;
  resolvedTeamName: string | null;
  resultTeamAliasId: string | null;
  resultStatus: TeamAliasBatchStatus;
  resultCode: string;
  blocking: boolean;
  changed: boolean;
};

export type TeamAliasBatchSummary = {
  canApply: boolean;
  requestedApply: boolean;
  createCount: number;
  existingActiveCount: number;
  blockingCount: number;
  createdCount: number;
  noop: boolean;
};

export type TeamAliasBatchSuccessResponse = {
  ok: true;
  operation: TeamAliasBatchAction;
  requestReference: string;
  rows: TeamAliasBatchResultRow[];
  summary: TeamAliasBatchSummary;
};

export type TeamAliasBatchErrorResponse = {
  ok: false;
  code: string;
  message: string;
  preview?: TeamAliasBatchSuccessResponse;
};

export type TeamAliasBatchRpcRow = {
  line_number: number | null;
  canonical_club_input: string | null;
  alias_input: string | null;
  normalized_alias: string | null;
  resolved_team_id: string | null;
  resolved_team_name: string | null;
  result_team_alias_id: string | null;
  result_status: TeamAliasBatchStatus;
  result_code: string;
  blocking: boolean;
  changed: boolean;
  batch_can_apply: boolean;
  batch_requested_apply: boolean;
  batch_create_count: number;
  batch_existing_active_count: number;
  batch_blocking_count: number;
  batch_created_count: number;
  batch_noop: boolean;
};

export type TeamAliasBatchPolicyErrorCode =
  | "team-alias-batch-body-not-object"
  | "team-alias-batch-unexpected-field"
  | "team-alias-batch-action-invalid"
  | "team-alias-batch-country-id-invalid"
  | "team-alias-batch-rows-not-array"
  | "team-alias-batch-rows-required"
  | "team-alias-batch-rows-limit-exceeded"
  | "team-alias-batch-row-not-object"
  | "team-alias-batch-row-fields-invalid"
  | "team-alias-batch-line-number-invalid"
  | "team-alias-batch-canonical-club-invalid"
  | "team-alias-batch-alias-invalid";

const ERROR_MESSAGES: Record<TeamAliasBatchPolicyErrorCode, string> = {
  "team-alias-batch-body-not-object": "O body tem de ser um objeto JSON.",
  "team-alias-batch-unexpected-field": "O pedido contém um campo não permitido.",
  "team-alias-batch-action-invalid": "A ação tem de ser preview ou apply.",
  "team-alias-batch-country-id-invalid": "O país tem de ser um UUID válido.",
  "team-alias-batch-rows-not-array": "As linhas têm de ser enviadas num array.",
  "team-alias-batch-rows-required": "O lote tem de conter pelo menos uma linha.",
  "team-alias-batch-rows-limit-exceeded": `O lote não pode exceder ${TEAM_ALIAS_BATCH_MAX_ROWS} linhas.`,
  "team-alias-batch-row-not-object": "Cada linha tem de ser um objeto JSON.",
  "team-alias-batch-row-fields-invalid": "Cada linha só pode conter lineNumber, canonicalClub e alias.",
  "team-alias-batch-line-number-invalid": "lineNumber tem de ser um inteiro positivo válido.",
  "team-alias-batch-canonical-club-invalid": "canonicalClub tem de ser texto.",
  "team-alias-batch-alias-invalid": "alias tem de ser texto."
};

const REQUEST_FIELDS = new Set(["action", "countryId", "rows"]);
const ROW_FIELDS = new Set(["lineNumber", "canonicalClub", "alias"]);
const BATCH_STATUSES = new Set<TeamAliasBatchStatus>([
  "create",
  "existing_active_same_team",
  "existing_inactive_same_team",
  "unknown_club",
  "ambiguous_club",
  "duplicate_alias_in_batch",
  "alias_conflict_other_team",
  "canonical_identity_conflict_other_team",
  "redundant_same_team_identity",
  "invalid_row"
]);

export class TeamAliasBatchPolicyError extends Error {
  readonly code: TeamAliasBatchPolicyErrorCode;

  constructor(code: TeamAliasBatchPolicyErrorCode) {
    super(ERROR_MESSAGES[code]);
    this.name = "TeamAliasBatchPolicyError";
    this.code = code;
  }
}

function fail(code: TeamAliasBatchPolicyErrorCode): never {
  throw new TeamAliasBatchPolicyError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasExactFields(value: Record<string, unknown>, fields: ReadonlySet<string>) {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

export function parseTeamAliasBatchRequest(value: unknown): TeamAliasBatchRequest {
  if (!isRecord(value)) {
    return fail("team-alias-batch-body-not-object");
  }

  if (!hasExactFields(value, REQUEST_FIELDS)) {
    return fail("team-alias-batch-unexpected-field");
  }

  if (value.action !== "preview" && value.action !== "apply") {
    return fail("team-alias-batch-action-invalid");
  }

  if (typeof value.countryId !== "string" || !UUID_PATTERN.test(value.countryId)) {
    return fail("team-alias-batch-country-id-invalid");
  }

  if (!Array.isArray(value.rows)) {
    return fail("team-alias-batch-rows-not-array");
  }

  if (value.rows.length === 0) {
    return fail("team-alias-batch-rows-required");
  }

  if (value.rows.length > TEAM_ALIAS_BATCH_MAX_ROWS) {
    return fail("team-alias-batch-rows-limit-exceeded");
  }

  const rows = value.rows.map((row) => {
    if (!isRecord(row)) {
      return fail("team-alias-batch-row-not-object");
    }

    if (!hasExactFields(row, ROW_FIELDS)) {
      return fail("team-alias-batch-row-fields-invalid");
    }

    if (!Number.isInteger(row.lineNumber) || Number(row.lineNumber) < 1 || Number(row.lineNumber) > MAX_LINE_NUMBER) {
      return fail("team-alias-batch-line-number-invalid");
    }

    if (typeof row.canonicalClub !== "string") {
      return fail("team-alias-batch-canonical-club-invalid");
    }

    if (typeof row.alias !== "string") {
      return fail("team-alias-batch-alias-invalid");
    }

    return {
      lineNumber: row.lineNumber as number,
      canonicalClub: row.canonicalClub,
      alias: row.alias
    };
  });

  return {
    action: value.action,
    countryId: value.countryId,
    rows
  };
}

export function isTeamAliasBatchRequest(value: unknown): value is TeamAliasBatchRequest {
  try {
    parseTeamAliasBatchRequest(value);
    return true;
  } catch {
    return false;
  }
}

export function isTeamAliasBatchRpcRow(value: unknown): value is TeamAliasBatchRpcRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.line_number === null || Number.isInteger(value.line_number)) &&
    isNullableString(value.canonical_club_input) &&
    isNullableString(value.alias_input) &&
    isNullableString(value.normalized_alias) &&
    isNullableString(value.resolved_team_id) &&
    isNullableString(value.resolved_team_name) &&
    isNullableString(value.result_team_alias_id) &&
    typeof value.result_status === "string" &&
    BATCH_STATUSES.has(value.result_status as TeamAliasBatchStatus) &&
    typeof value.result_code === "string" &&
    typeof value.blocking === "boolean" &&
    typeof value.changed === "boolean" &&
    typeof value.batch_can_apply === "boolean" &&
    typeof value.batch_requested_apply === "boolean" &&
    isNonNegativeInteger(value.batch_create_count) &&
    isNonNegativeInteger(value.batch_existing_active_count) &&
    isNonNegativeInteger(value.batch_blocking_count) &&
    isNonNegativeInteger(value.batch_created_count) &&
    typeof value.batch_noop === "boolean"
  );
}

export function isTeamAliasBatchResultRow(value: unknown): value is TeamAliasBatchResultRow {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.lineNumber === null || Number.isInteger(value.lineNumber)) &&
    isNullableString(value.canonicalClubInput) &&
    isNullableString(value.aliasInput) &&
    isNullableString(value.normalizedAlias) &&
    isNullableString(value.resolvedTeamId) &&
    isNullableString(value.resolvedTeamName) &&
    isNullableString(value.resultTeamAliasId) &&
    typeof value.resultStatus === "string" &&
    BATCH_STATUSES.has(value.resultStatus as TeamAliasBatchStatus) &&
    typeof value.resultCode === "string" &&
    typeof value.blocking === "boolean" &&
    typeof value.changed === "boolean"
  );
}

function isTeamAliasBatchSummary(value: unknown): value is TeamAliasBatchSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.canApply === "boolean" &&
    typeof value.requestedApply === "boolean" &&
    isNonNegativeInteger(value.createCount) &&
    isNonNegativeInteger(value.existingActiveCount) &&
    isNonNegativeInteger(value.blockingCount) &&
    isNonNegativeInteger(value.createdCount) &&
    typeof value.noop === "boolean"
  );
}

export function isTeamAliasBatchSuccessResponse(value: unknown): value is TeamAliasBatchSuccessResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.ok === true &&
    (value.operation === "preview" || value.operation === "apply") &&
    typeof value.requestReference === "string" &&
    value.requestReference.length > 0 &&
    Array.isArray(value.rows) &&
    value.rows.every(isTeamAliasBatchResultRow) &&
    isTeamAliasBatchSummary(value.summary)
  );
}

export function isTeamAliasBatchErrorResponse(value: unknown): value is TeamAliasBatchErrorResponse {
  if (!isRecord(value)) {
    return false;
  }

  return (
    value.ok === false &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.preview === undefined || isTeamAliasBatchSuccessResponse(value.preview))
  );
}
