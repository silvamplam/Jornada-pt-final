const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

export const TEAM_PUBLIC_NAME_BATCH_MAX_ROWS = 50;
export const TEAM_PUBLIC_NAME_MAX_CHARACTERS = 80;
export const TEAM_PUBLIC_NAME_BATCH_MAX_BODY_BYTES = 65536;

export type TeamPublicNameBatchAction = "preview" | "apply";

export type TeamPublicNameBatchClientRow = {
  teamId: string;
  publicName: string;
  expectedPublicName?: string | null;
};

export type TeamPublicNameBatchClientRequest = {
  action: TeamPublicNameBatchAction;
  rows: TeamPublicNameBatchClientRow[];
};

export type TeamPublicNameValidationCode =
  | "public_name_too_long"
  | "public_name_control_characters";

export type ParsedTeamPublicNameBatchRow = {
  teamId: string;
  publicName: string | null;
  expectedPublicName?: string | null;
  validationCode: TeamPublicNameValidationCode | null;
};

export type ParsedTeamPublicNameBatchRequest = {
  action: TeamPublicNameBatchAction;
  rows: ParsedTeamPublicNameBatchRow[];
};

export type TeamPublicNamePreviewStatus =
  | "set"
  | "update"
  | "clear"
  | "noop"
  | "invalid"
  | "not_found";

export type TeamPublicNameApplyStatus =
  | "set"
  | "updated"
  | "cleared"
  | "noop"
  | "error";

export type TeamPublicNameBatchSnapshot = {
  teamId: string;
  publicName: string | null;
  expectedPublicName: string | null;
};

export type TeamPublicNameBatchPreviewRow = {
  teamId: string;
  canonicalName: string | null;
  currentPublicName: string | null;
  proposedPublicName: string | null;
  status: TeamPublicNamePreviewStatus;
  message: string | null;
  snapshot: TeamPublicNameBatchSnapshot | null;
};

export type TeamPublicNameBatchPreviewSummary = {
  total: number;
  sets: number;
  updates: number;
  clears: number;
  noops: number;
  invalid: number;
  notFound: number;
};

export type TeamPublicNameBatchPreviewResponse = {
  ok: true;
  operation: "preview";
  rows: TeamPublicNameBatchPreviewRow[];
  summary: TeamPublicNameBatchPreviewSummary;
};

export type TeamPublicNameBatchApplyRow = {
  teamId: string;
  canonicalName: string;
  publicName: string | null;
  status: TeamPublicNameApplyStatus;
  message: string;
};

export type TeamPublicNameBatchApplySummary = {
  total: number;
  succeeded: number;
  sets: number;
  updates: number;
  clears: number;
  noops: number;
  errors: number;
};

export type TeamPublicNameBatchApplyResponse = {
  ok: true;
  operation: "apply";
  rows: TeamPublicNameBatchApplyRow[];
  summary: TeamPublicNameBatchApplySummary;
};

export type TeamPublicNameBatchErrorResponse = {
  ok: false;
  code: string;
  message: string;
  preview?: TeamPublicNameBatchPreviewResponse;
};

export type TeamPublicNameBatchPolicyErrorCode =
  | "team-public-name-batch-body-not-object"
  | "team-public-name-batch-request-fields-invalid"
  | "team-public-name-batch-action-invalid"
  | "team-public-name-batch-rows-not-array"
  | "team-public-name-batch-rows-required"
  | "team-public-name-batch-rows-limit-exceeded"
  | "team-public-name-batch-row-not-object"
  | "team-public-name-batch-row-fields-invalid"
  | "team-public-name-batch-team-id-invalid"
  | "team-public-name-batch-team-id-duplicate"
  | "team-public-name-batch-public-name-invalid"
  | "team-public-name-batch-expected-public-name-required"
  | "team-public-name-batch-expected-public-name-invalid";

const POLICY_ERROR_MESSAGES: Record<TeamPublicNameBatchPolicyErrorCode, string> = {
  "team-public-name-batch-body-not-object": "O body tem de ser um objeto JSON.",
  "team-public-name-batch-request-fields-invalid": "O pedido só pode conter action e rows.",
  "team-public-name-batch-action-invalid": "A ação tem de ser preview ou apply.",
  "team-public-name-batch-rows-not-array": "Os clubes têm de ser enviados num array.",
  "team-public-name-batch-rows-required": "Selecione pelo menos um clube.",
  "team-public-name-batch-rows-limit-exceeded": `O lote não pode exceder ${TEAM_PUBLIC_NAME_BATCH_MAX_ROWS} clubes.`,
  "team-public-name-batch-row-not-object": "Cada clube tem de ser um objeto JSON.",
  "team-public-name-batch-row-fields-invalid": "Cada clube contém campos inesperados.",
  "team-public-name-batch-team-id-invalid": "Cada teamId tem de ser um UUID válido.",
  "team-public-name-batch-team-id-duplicate": "O lote contém o mesmo clube mais do que uma vez.",
  "team-public-name-batch-public-name-invalid": "publicName tem de ser texto.",
  "team-public-name-batch-expected-public-name-required": "expectedPublicName é obrigatório na aplicação.",
  "team-public-name-batch-expected-public-name-invalid": "expectedPublicName tem de ser texto ou null."
};

const REQUEST_FIELDS = new Set(["action", "rows"]);
const PREVIEW_ROW_FIELDS = new Set(["teamId", "publicName", "expectedPublicName"]);
const APPLY_ROW_FIELDS = new Set(["teamId", "publicName", "expectedPublicName"]);
const PREVIEW_STATUSES = new Set<TeamPublicNamePreviewStatus>([
  "set",
  "update",
  "clear",
  "noop",
  "invalid",
  "not_found"
]);
const APPLY_STATUSES = new Set<TeamPublicNameApplyStatus>([
  "set",
  "updated",
  "cleared",
  "noop",
  "error"
]);

export class TeamPublicNameBatchPolicyError extends Error {
  readonly code: TeamPublicNameBatchPolicyErrorCode;

  constructor(code: TeamPublicNameBatchPolicyErrorCode) {
    super(POLICY_ERROR_MESSAGES[code]);
    this.name = "TeamPublicNameBatchPolicyError";
    this.code = code;
  }
}

function fail(code: TeamPublicNameBatchPolicyErrorCode): never {
  throw new TeamPublicNameBatchPolicyError(code);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }

  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(value: Record<string, unknown>, fields: ReadonlySet<string>): boolean {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function hasAllowedPreviewFields(value: Record<string, unknown>): boolean {
  const keys = Object.keys(value);
  return (
    keys.length >= 2 &&
    keys.length <= PREVIEW_ROW_FIELDS.size &&
    keys.every((key) => PREVIEW_ROW_FIELDS.has(key)) &&
    Object.prototype.hasOwnProperty.call(value, "teamId") &&
    Object.prototype.hasOwnProperty.call(value, "publicName")
  );
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function trimSqlSpaces(value: string): string {
  return value.replace(/^ +| +$/g, "");
}

export function normalizeTeamPublicName(value: string): string | null {
  return trimSqlSpaces(value) || null;
}

export function validateTeamPublicName(
  value: string | null
): TeamPublicNameValidationCode | null {
  if (value !== null && Array.from(value).length > TEAM_PUBLIC_NAME_MAX_CHARACTERS) {
    return "public_name_too_long";
  }

  if (value !== null && CONTROL_CHARACTER_PATTERN.test(value)) {
    return "public_name_control_characters";
  }

  return null;
}

export function publicNameValidationMessage(code: TeamPublicNameValidationCode): string {
  return code === "public_name_too_long"
    ? `O nome público não pode exceder ${TEAM_PUBLIC_NAME_MAX_CHARACTERS} caracteres.`
    : "O nome público não pode conter caracteres de controlo.";
}

export function classifyTeamPublicNameChange(
  currentPublicName: string | null,
  proposedPublicName: string | null
): Exclude<TeamPublicNamePreviewStatus, "invalid" | "not_found"> {
  if (currentPublicName === proposedPublicName) {
    return "noop";
  }
  if (currentPublicName === null) {
    return "set";
  }
  if (proposedPublicName === null) {
    return "clear";
  }
  return "update";
}

export function parseTeamPublicNameBatchRequest(
  value: unknown
): ParsedTeamPublicNameBatchRequest {
  if (!isRecord(value)) {
    return fail("team-public-name-batch-body-not-object");
  }
  if (!hasExactFields(value, REQUEST_FIELDS)) {
    return fail("team-public-name-batch-request-fields-invalid");
  }
  if (value.action !== "preview" && value.action !== "apply") {
    return fail("team-public-name-batch-action-invalid");
  }
  if (!Array.isArray(value.rows)) {
    return fail("team-public-name-batch-rows-not-array");
  }
  if (value.rows.length === 0) {
    return fail("team-public-name-batch-rows-required");
  }
  if (value.rows.length > TEAM_PUBLIC_NAME_BATCH_MAX_ROWS) {
    return fail("team-public-name-batch-rows-limit-exceeded");
  }

  const seenTeamIds = new Set<string>();
  const rows = value.rows.map((row) => {
    if (!isRecord(row)) {
      return fail("team-public-name-batch-row-not-object");
    }

    const fieldsAreValid =
      value.action === "apply"
        ? hasExactFields(row, APPLY_ROW_FIELDS)
        : hasAllowedPreviewFields(row);
    if (!fieldsAreValid) {
      return fail("team-public-name-batch-row-fields-invalid");
    }
    if (typeof row.teamId !== "string" || !UUID_PATTERN.test(row.teamId)) {
      return fail("team-public-name-batch-team-id-invalid");
    }

    const teamId = row.teamId.toLowerCase();
    if (seenTeamIds.has(teamId)) {
      return fail("team-public-name-batch-team-id-duplicate");
    }
    seenTeamIds.add(teamId);

    if (typeof row.publicName !== "string") {
      return fail("team-public-name-batch-public-name-invalid");
    }
    if (value.action === "apply" && !Object.prototype.hasOwnProperty.call(row, "expectedPublicName")) {
      return fail("team-public-name-batch-expected-public-name-required");
    }
    if (
      Object.prototype.hasOwnProperty.call(row, "expectedPublicName") &&
      !isNullableString(row.expectedPublicName)
    ) {
      return fail("team-public-name-batch-expected-public-name-invalid");
    }

    const publicName = normalizeTeamPublicName(row.publicName);
    const expectedPublicName =
      typeof row.expectedPublicName === "string"
        ? normalizeTeamPublicName(row.expectedPublicName)
        : row.expectedPublicName === null
          ? null
          : undefined;
    if (expectedPublicName !== undefined && validateTeamPublicName(expectedPublicName)) {
      return fail("team-public-name-batch-expected-public-name-invalid");
    }

    return {
      teamId,
      publicName,
      ...(expectedPublicName !== undefined ? { expectedPublicName } : {}),
      validationCode: validateTeamPublicName(publicName)
    };
  });

  return {
    action: value.action,
    rows
  };
}

function isSnapshot(value: unknown): value is TeamPublicNameBatchSnapshot {
  return (
    isRecord(value) &&
    typeof value.teamId === "string" &&
    UUID_PATTERN.test(value.teamId) &&
    isNullableString(value.publicName) &&
    isNullableString(value.expectedPublicName)
  );
}

function isPreviewRow(value: unknown): value is TeamPublicNameBatchPreviewRow {
  return (
    isRecord(value) &&
    typeof value.teamId === "string" &&
    UUID_PATTERN.test(value.teamId) &&
    isNullableString(value.canonicalName) &&
    isNullableString(value.currentPublicName) &&
    isNullableString(value.proposedPublicName) &&
    typeof value.status === "string" &&
    PREVIEW_STATUSES.has(value.status as TeamPublicNamePreviewStatus) &&
    isNullableString(value.message) &&
    (value.snapshot === null || isSnapshot(value.snapshot))
  );
}

function isPreviewSummary(value: unknown): value is TeamPublicNameBatchPreviewSummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeInteger(value.total) &&
    isNonNegativeInteger(value.sets) &&
    isNonNegativeInteger(value.updates) &&
    isNonNegativeInteger(value.clears) &&
    isNonNegativeInteger(value.noops) &&
    isNonNegativeInteger(value.invalid) &&
    isNonNegativeInteger(value.notFound) &&
    value.total ===
      value.sets + value.updates + value.clears + value.noops + value.invalid + value.notFound
  );
}

export function isTeamPublicNameBatchPreviewResponse(
  value: unknown
): value is TeamPublicNameBatchPreviewResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.operation === "preview" &&
    Array.isArray(value.rows) &&
    value.rows.every(isPreviewRow) &&
    isPreviewSummary(value.summary) &&
    value.rows.length === value.summary.total
  );
}

function isApplyRow(value: unknown): value is TeamPublicNameBatchApplyRow {
  return (
    isRecord(value) &&
    typeof value.teamId === "string" &&
    UUID_PATTERN.test(value.teamId) &&
    typeof value.canonicalName === "string" &&
    isNullableString(value.publicName) &&
    typeof value.status === "string" &&
    APPLY_STATUSES.has(value.status as TeamPublicNameApplyStatus) &&
    typeof value.message === "string"
  );
}

function isApplySummary(value: unknown): value is TeamPublicNameBatchApplySummary {
  if (!isRecord(value)) {
    return false;
  }

  return (
    isNonNegativeInteger(value.total) &&
    isNonNegativeInteger(value.succeeded) &&
    isNonNegativeInteger(value.sets) &&
    isNonNegativeInteger(value.updates) &&
    isNonNegativeInteger(value.clears) &&
    isNonNegativeInteger(value.noops) &&
    isNonNegativeInteger(value.errors) &&
    value.succeeded === value.sets + value.updates + value.clears + value.noops &&
    value.total === value.succeeded + value.errors
  );
}

export function isTeamPublicNameBatchApplyResponse(
  value: unknown
): value is TeamPublicNameBatchApplyResponse {
  return (
    isRecord(value) &&
    value.ok === true &&
    value.operation === "apply" &&
    Array.isArray(value.rows) &&
    value.rows.every(isApplyRow) &&
    isApplySummary(value.summary) &&
    value.rows.length === value.summary.total
  );
}

export function isTeamPublicNameBatchErrorResponse(
  value: unknown
): value is TeamPublicNameBatchErrorResponse {
  return (
    isRecord(value) &&
    value.ok === false &&
    typeof value.code === "string" &&
    typeof value.message === "string" &&
    (value.preview === undefined || isTeamPublicNameBatchPreviewResponse(value.preview))
  );
}
