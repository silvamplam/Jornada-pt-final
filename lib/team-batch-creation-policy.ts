import {
  suggestAdminTeamPublicName,
  type AdminTeamPublicNameSuggestion
} from "@/lib/admin-team-public-name-suggestion";
import { normalizeTeamIdentityKey } from "@/lib/team-identity-key";

export const TEAM_BATCH_CREATION_HEADER =
  "Nome canónico;Nome público;Sigla;Código;Slug;Aliases;Emblema URL;Cor";
export const TEAM_BATCH_CREATION_MAX_ROWS = 500;
export const TEAM_BATCH_CREATION_MAX_TEXT_BYTES = 256 * 1024;
export const TEAM_BATCH_CREATION_MAX_LINE_LENGTH = 8192;
export const TEAM_BATCH_CREATION_MAX_CANONICAL_NAME_LENGTH = 160;
export const TEAM_BATCH_CREATION_MAX_PUBLIC_NAME_LENGTH = 80;
export const TEAM_BATCH_CREATION_MAX_SHORT_NAME_LENGTH = 6;
export const TEAM_BATCH_CREATION_MAX_CODE_LENGTH = 160;
export const TEAM_BATCH_CREATION_MAX_SLUG_LENGTH = 160;
export const TEAM_BATCH_CREATION_MAX_ALIAS_LENGTH = 160;
export const TEAM_BATCH_CREATION_MAX_ALIASES_PER_ROW = 34;
export const TEAM_BATCH_CREATION_MAX_LOGO_URL_LENGTH = 2048;

const MAX_LINE_NUMBER = 2147483647;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const FINGERPRINT_PATTERN = /^v1:[0-9a-f]{32}$/;
const COLOR_PATTERN = /^#[0-9A-F]{6}$/;
const CONTROL_CHARACTER_PATTERN = /[\u0000-\u001f\u007f-\u009f]/u;

const HEADER_FIELDS = TEAM_BATCH_CREATION_HEADER.split(";");
const HEADER_KEYS = HEADER_FIELDS.map(normalizeTeamIdentityKey);
const REQUEST_PREVIEW_FIELDS = new Set(["action", "countryId", "rows"]);
const REQUEST_APPLY_FIELDS = new Set([
  "action",
  "countryId",
  "rows",
  "previewFingerprint",
  "confirmedCompleteExistingLines"
]);
const INPUT_ROW_FIELDS = new Set([
  "lineNumber",
  "canonicalName",
  "publicName",
  "shortName",
  "code",
  "slug",
  "aliases",
  "logoUrl",
  "primaryColor"
]);
const PROPOSED_IDENTITY_FIELDS = new Set([
  "canonical_name",
  "normalized_canonical_name",
  "public_name",
  "short_name",
  "normalized_short_name",
  "code",
  "normalized_code",
  "slug",
  "country_id",
  "logo_url",
  "primary_color"
]);
const EXISTING_IDENTITY_FIELDS = new Set([
  "team_id",
  "country_id",
  "canonical_name",
  "public_name",
  "short_name",
  "code",
  "slug",
  "logo_url",
  "primary_color"
]);
const RPC_ROW_FIELDS = new Set([
  "line_number",
  "result_status",
  "reason_code",
  "reason_message",
  "proposed_identity",
  "resolved_team_id",
  "existing_identity",
  "conflicts",
  "normalized_aliases",
  "proposed_action",
  "final_team_id",
  "changed",
  "batch_applied",
  "batch_total_count",
  "batch_create_count",
  "batch_existing_count",
  "batch_complete_existing_count",
  "batch_probable_count",
  "batch_ambiguous_count",
  "batch_conflict_count",
  "batch_invalid_count",
  "batch_blocking_count",
  "batch_can_apply",
  "batch_created_count",
  "batch_completed_existing_count",
  "batch_existing_result_count",
  "batch_aliases_created_count",
  "batch_aliases_unchanged_count",
  "batch_public_names_changed_count",
  "batch_integrally_applied",
  "preview_fingerprint"
]);

const STATUS_VALUES = new Set<TeamBatchCreationStatus>([
  "create",
  "existing",
  "complete_existing",
  "probable",
  "ambiguous",
  "conflict",
  "invalid"
]);
const ACTION_VALUES = new Set<TeamBatchCreationAction>([
  "create",
  "noop",
  "complete",
  "review",
  "block"
]);

export type TeamBatchCreationStatus =
  | "create"
  | "existing"
  | "complete_existing"
  | "probable"
  | "ambiguous"
  | "conflict"
  | "invalid";

export type TeamBatchCreationAction =
  | "create"
  | "noop"
  | "complete"
  | "review"
  | "block";

export type TeamBatchCreationOperation = "preview" | "apply";

export type TeamBatchCreationInputRow = {
  lineNumber: number;
  canonicalName: string;
  publicName: string | null;
  shortName: string;
  code: string | null;
  slug: string;
  aliases: string[];
  logoUrl: string | null;
  primaryColor: string | null;
};

export type TeamBatchCreationTextField =
  | "canonicalName"
  | "publicName"
  | "shortName"
  | "code"
  | "slug"
  | "aliases"
  | "logoUrl"
  | "primaryColor";

export type TeamBatchCreationFieldIssue = {
  lineNumber: number;
  field: TeamBatchCreationTextField | null;
  code: string;
  message: string;
  severity: "error" | "warning";
};

export type TeamBatchCreationSuggestions = {
  slug: {
    value: string | null;
    suggested: boolean;
  };
  publicName: AdminTeamPublicNameSuggestion;
  publicNameAsAlias: string | null;
};

export type TeamBatchCreationLineResult =
  | {
      ok: true;
      lineNumber: number;
      rawLine: string;
      row: TeamBatchCreationInputRow;
      suggestions: TeamBatchCreationSuggestions;
      warnings: TeamBatchCreationFieldIssue[];
    }
  | {
      ok: false;
      lineNumber: number;
      rawLine: string;
      errors: TeamBatchCreationFieldIssue[];
    };

export type TeamBatchCreationParseSummary = {
  totalPhysicalLines: number;
  usefulLines: number;
  validRows: number;
  invalidRows: number;
  warningCount: number;
  byteLength: number;
  headerPresent: boolean;
  canSubmit: boolean;
};

export type TeamBatchCreationParseResult = {
  lines: TeamBatchCreationLineResult[];
  rows: TeamBatchCreationInputRow[];
  issues: TeamBatchCreationFieldIssue[];
  summary: TeamBatchCreationParseSummary;
};

export type TeamBatchCreationPreviewRequest = {
  action: "preview";
  countryId: string;
  rows: TeamBatchCreationInputRow[];
};

export type TeamBatchCreationApplyRequest = {
  action: "apply";
  countryId: string;
  rows: TeamBatchCreationInputRow[];
  previewFingerprint: TeamBatchCreationPreviewFingerprint;
  confirmedCompleteExistingLines: number[];
};

export type TeamBatchCreationProposedIdentity = {
  canonical_name: string | null;
  normalized_canonical_name: string | null;
  public_name: string | null;
  short_name: string | null;
  normalized_short_name: string | null;
  code: string | null;
  normalized_code: string | null;
  slug: string | null;
  country_id: string;
  logo_url: string | null;
  primary_color: string | null;
};

export type TeamBatchCreationExistingIdentity = {
  team_id: string;
  country_id: string | null;
  canonical_name: string;
  public_name: string | null;
  short_name: string;
  code: string | null;
  slug: string;
  logo_url: string | null;
  primary_color: string | null;
};

export type TeamBatchCreationConflict =
  | string
  | {
      type:
        | "slug"
        | "identity_alias"
        | "alias"
        | "line_number"
        | "batch_identity";
      team_id?: string;
      value?: string;
    };

export type TeamBatchCreationRpcRow = {
  line_number: number;
  result_status: TeamBatchCreationStatus;
  reason_code: string;
  reason_message: string;
  proposed_identity: TeamBatchCreationProposedIdentity;
  resolved_team_id: string | null;
  existing_identity: TeamBatchCreationExistingIdentity | null;
  conflicts: TeamBatchCreationConflict[];
  normalized_aliases: string[];
  proposed_action: TeamBatchCreationAction;
  final_team_id: string | null;
  changed: boolean;
  batch_applied: boolean;
  batch_total_count: number;
  batch_create_count: number;
  batch_existing_count: number;
  batch_complete_existing_count: number;
  batch_probable_count: number;
  batch_ambiguous_count: number;
  batch_conflict_count: number;
  batch_invalid_count: number;
  batch_blocking_count: number;
  batch_can_apply: boolean;
  batch_created_count: number;
  batch_completed_existing_count: number;
  batch_existing_result_count: number;
  batch_aliases_created_count: number;
  batch_aliases_unchanged_count: number;
  batch_public_names_changed_count: number;
  batch_integrally_applied: boolean;
  preview_fingerprint: TeamBatchCreationPreviewFingerprint;
};

export type TeamBatchCreationSummary = {
  applied: boolean;
  totalCount: number;
  createCount: number;
  existingCount: number;
  completeExistingCount: number;
  probableCount: number;
  ambiguousCount: number;
  conflictCount: number;
  invalidCount: number;
  blockingCount: number;
  canApply: boolean;
  createdCount: number;
  completedExistingCount: number;
  existingResultCount: number;
  aliasesCreatedCount: number;
  aliasesUnchangedCount: number;
  publicNamesChangedCount: number;
  integrallyApplied: boolean;
};

export type TeamBatchCreationPreviewFingerprint = string;

export type TeamBatchCreationRpcValidationContext = {
  operation: TeamBatchCreationOperation;
  countryId: string;
  expectedLineNumbers: readonly number[];
  confirmedCompleteExistingLines?: readonly number[];
};

export type TeamBatchCreationRpcValidationResult =
  | {
      ok: true;
      rows: TeamBatchCreationRpcRow[];
      summary: TeamBatchCreationSummary;
      fingerprint: TeamBatchCreationPreviewFingerprint;
    }
  | {
      ok: false;
      code: "team-batch-creation-rpc-invalid-response";
      message: string;
    };

export type TeamBatchCreationFunctionalRpcArguments = {
  p_country_id: string;
  p_rows: TeamBatchCreationInputRow[];
  p_apply: boolean;
  p_confirmed_preview_fingerprint: string | null;
  p_confirmed_complete_existing_lines: number[];
};

export type TeamBatchCreationPolicyErrorCode =
  | "team-batch-creation-body-not-object"
  | "team-batch-creation-request-fields-invalid"
  | "team-batch-creation-action-invalid"
  | "team-batch-creation-country-id-invalid"
  | "team-batch-creation-rows-not-array"
  | "team-batch-creation-rows-required"
  | "team-batch-creation-rows-limit-exceeded"
  | "team-batch-creation-row-not-object"
  | "team-batch-creation-row-fields-invalid"
  | "team-batch-creation-line-number-invalid"
  | "team-batch-creation-line-number-duplicate"
  | "team-batch-creation-row-value-invalid"
  | "team-batch-creation-batch-identity-conflict"
  | "team-batch-creation-fingerprint-invalid"
  | "team-batch-creation-confirmed-lines-invalid"
  | "team-batch-creation-confirmed-line-duplicate"
  | "team-batch-creation-confirmed-line-missing";

const POLICY_ERROR_MESSAGES: Record<TeamBatchCreationPolicyErrorCode, string> = {
  "team-batch-creation-body-not-object": "O pedido tem de ser um objeto JSON.",
  "team-batch-creation-request-fields-invalid": "O pedido contém campos ausentes ou inesperados.",
  "team-batch-creation-action-invalid": "A ação tem de ser preview ou apply.",
  "team-batch-creation-country-id-invalid": "countryId tem de ser um UUID válido.",
  "team-batch-creation-rows-not-array": "rows tem de ser um array.",
  "team-batch-creation-rows-required": "O lote tem de conter pelo menos uma linha.",
  "team-batch-creation-rows-limit-exceeded": "O lote não pode exceder 500 linhas.",
  "team-batch-creation-row-not-object": "Cada linha tem de ser um objeto JSON.",
  "team-batch-creation-row-fields-invalid": "Cada linha tem de conter exatamente os nove campos suportados.",
  "team-batch-creation-line-number-invalid": "lineNumber tem de ser um inteiro positivo válido.",
  "team-batch-creation-line-number-duplicate": "lineNumber repete-se dentro do lote.",
  "team-batch-creation-row-value-invalid": "Uma linha contém um valor inválido.",
  "team-batch-creation-batch-identity-conflict": "Existem identidades repetidas entre linhas do lote.",
  "team-batch-creation-fingerprint-invalid": "A fingerprint de preview é obrigatória e inválida.",
  "team-batch-creation-confirmed-lines-invalid": "As linhas complete_existing confirmadas são inválidas.",
  "team-batch-creation-confirmed-line-duplicate": "Uma confirmação complete_existing foi repetida.",
  "team-batch-creation-confirmed-line-missing": "Uma confirmação não pertence ao lote."
};

export class TeamBatchCreationPolicyError extends Error {
  readonly code: TeamBatchCreationPolicyErrorCode;
  readonly field?: string;
  readonly lineNumber?: number;

  constructor(
    code: TeamBatchCreationPolicyErrorCode,
    options: { field?: string; lineNumber?: number } = {}
  ) {
    super(POLICY_ERROR_MESSAGES[code]);
    this.name = "TeamBatchCreationPolicyError";
    this.code = code;
    this.field = options.field;
    this.lineNumber = options.lineNumber;
  }
}

type RowValues = {
  lineNumber: number;
  canonicalName: string;
  publicName: string;
  shortName: string;
  code: string;
  slug: string;
  aliases: string[];
  logoUrl: string;
  primaryColor: string;
};

type NormalizeRowOptions = {
  allowSlugSuggestion: boolean;
  strictAliases: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return false;
  }
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

function hasExactFields(value: Record<string, unknown>, fields: ReadonlySet<string>) {
  const keys = Object.keys(value);
  return keys.length === fields.size && keys.every((key) => fields.has(key));
}

function characterLength(value: string) {
  return Array.from(value).length;
}

function isPositiveLineNumber(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 1 && Number(value) <= MAX_LINE_NUMBER;
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && Number(value) >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return typeof value === "string" || value === null;
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function issue(
  lineNumber: number,
  field: TeamBatchCreationTextField | null,
  code: string,
  message: string,
  severity: "error" | "warning" = "error"
): TeamBatchCreationFieldIssue {
  return { lineNumber, field, code, message, severity };
}

function validateLogoUrl(value: string) {
  try {
    const parsed = new URL(value);
    return (
      (parsed.protocol === "http:" || parsed.protocol === "https:") &&
      Boolean(parsed.hostname) &&
      !parsed.username &&
      !parsed.password
    );
  } catch {
    return false;
  }
}

function rowIdentityKeys(row: TeamBatchCreationInputRow) {
  const values = [
    row.canonicalName,
    row.shortName,
    row.code,
    row.slug,
    ...row.aliases
  ];
  return new Set(
    values
      .filter((value): value is string => typeof value === "string")
      .map(normalizeTeamIdentityKey)
      .filter(Boolean)
  );
}

function rowSignature(row: TeamBatchCreationInputRow) {
  return JSON.stringify({
    canonicalName: row.canonicalName,
    publicName: row.publicName,
    shortName: row.shortName,
    code: row.code,
    slug: row.slug,
    aliases: row.aliases.map(normalizeTeamIdentityKey).sort(),
    logoUrl: row.logoUrl,
    primaryColor: row.primaryColor
  });
}

function normalizeRow(
  values: RowValues,
  options: NormalizeRowOptions
): {
  row: TeamBatchCreationInputRow | null;
  errors: TeamBatchCreationFieldIssue[];
  warnings: TeamBatchCreationFieldIssue[];
  suggestions: TeamBatchCreationSuggestions;
} {
  const errors: TeamBatchCreationFieldIssue[] = [];
  const warnings: TeamBatchCreationFieldIssue[] = [];
  const canonicalName = values.canonicalName.trim();
  const publicNameText = values.publicName.trim();
  const publicName = publicNameText || null;
  const shortName = values.shortName.trim().toUpperCase();
  const codeText = values.code.trim();
  const code = codeText || null;
  const suppliedSlug = values.slug.trim();
  const suggestedSlug = normalizeTeamIdentityKey(canonicalName);
  const slug = suppliedSlug || (options.allowSlugSuggestion ? suggestedSlug : "");
  const logoUrlText = values.logoUrl.trim();
  const logoUrl = logoUrlText || null;
  const colorText = values.primaryColor.trim();
  const primaryColor = colorText ? colorText.toUpperCase() : null;

  if (!canonicalName) {
    errors.push(issue(values.lineNumber, "canonicalName", "canonical-name-required", "O nome canónico é obrigatório."));
  } else if (
    characterLength(canonicalName) > TEAM_BATCH_CREATION_MAX_CANONICAL_NAME_LENGTH
  ) {
    errors.push(issue(values.lineNumber, "canonicalName", "canonical-name-too-long", "O nome canónico excede 160 caracteres."));
  } else if (CONTROL_CHARACTER_PATTERN.test(canonicalName)) {
    errors.push(issue(values.lineNumber, "canonicalName", "canonical-name-control-characters", "O nome canónico contém caracteres de controlo."));
  }

  if (
    publicName !== null &&
    characterLength(publicName) > TEAM_BATCH_CREATION_MAX_PUBLIC_NAME_LENGTH
  ) {
    errors.push(issue(values.lineNumber, "publicName", "public-name-too-long", "O nome público excede 80 caracteres."));
  } else if (publicName !== null && CONTROL_CHARACTER_PATTERN.test(publicName)) {
    errors.push(issue(values.lineNumber, "publicName", "public-name-control-characters", "O nome público contém caracteres de controlo."));
  }

  if (!shortName) {
    errors.push(issue(values.lineNumber, "shortName", "short-name-required", "A sigla é obrigatória."));
  } else if (
    characterLength(shortName) > TEAM_BATCH_CREATION_MAX_SHORT_NAME_LENGTH
  ) {
    errors.push(issue(values.lineNumber, "shortName", "short-name-too-long", "A sigla excede seis caracteres."));
  } else if (CONTROL_CHARACTER_PATTERN.test(shortName)) {
    errors.push(issue(values.lineNumber, "shortName", "short-name-control-characters", "A sigla contém caracteres de controlo."));
  }

  if (code !== null && characterLength(code) > TEAM_BATCH_CREATION_MAX_CODE_LENGTH) {
    errors.push(issue(values.lineNumber, "code", "code-too-long", "O código excede 160 caracteres."));
  } else if (code !== null && CONTROL_CHARACTER_PATTERN.test(code)) {
    errors.push(issue(values.lineNumber, "code", "code-control-characters", "O código contém caracteres de controlo."));
  }

  if (!slug) {
    errors.push(issue(values.lineNumber, "slug", "slug-required", "O slug é obrigatório e não foi possível sugeri-lo."));
  } else if (characterLength(slug) > TEAM_BATCH_CREATION_MAX_SLUG_LENGTH) {
    errors.push(issue(values.lineNumber, "slug", "slug-too-long", "O slug excede 160 caracteres."));
  } else if (suppliedSlug && suppliedSlug !== normalizeTeamIdentityKey(suppliedSlug)) {
    errors.push(issue(values.lineNumber, "slug", "slug-invalid", "O slug preenchido não está na forma normalizada oficial."));
  } else if (CONTROL_CHARACTER_PATTERN.test(slug)) {
    errors.push(issue(values.lineNumber, "slug", "slug-control-characters", "O slug contém caracteres de controlo."));
  }

  if (
    logoUrl !== null &&
    characterLength(logoUrl) > TEAM_BATCH_CREATION_MAX_LOGO_URL_LENGTH
  ) {
    errors.push(issue(values.lineNumber, "logoUrl", "logo-url-too-long", "O URL do emblema excede 2048 caracteres."));
  } else if (logoUrl !== null && !validateLogoUrl(logoUrl)) {
    errors.push(issue(values.lineNumber, "logoUrl", "logo-url-invalid", "O URL do emblema tem de ser HTTP ou HTTPS, absoluto, sem credenciais."));
  }

  if (primaryColor !== null && !COLOR_PATTERN.test(primaryColor)) {
    errors.push(issue(values.lineNumber, "primaryColor", "primary-color-invalid", "A cor tem de usar o formato #RRGGBB."));
  }

  const aliases: string[] = [];
  const seenAliases = new Set<string>();
  for (const rawAlias of values.aliases) {
    const alias = rawAlias.trim();
    if (!alias) {
      const emptyIssue = issue(
        values.lineNumber,
        "aliases",
        "empty-alias-ignored",
        "Foi ignorado um segmento de alias vazio.",
        options.strictAliases ? "error" : "warning"
      );
      (options.strictAliases ? errors : warnings).push(emptyIssue);
      continue;
    }

    if (characterLength(alias) > TEAM_BATCH_CREATION_MAX_ALIAS_LENGTH) {
      errors.push(issue(values.lineNumber, "aliases", "alias-too-long", "Um alias excede 160 caracteres."));
      continue;
    }
    if (CONTROL_CHARACTER_PATTERN.test(alias)) {
      errors.push(issue(values.lineNumber, "aliases", "alias-control-characters", "Um alias contém caracteres de controlo."));
      continue;
    }

    const aliasKey = normalizeTeamIdentityKey(alias);
    if (!aliasKey) {
      errors.push(issue(values.lineNumber, "aliases", "alias-not-normalizable", "Um alias não produz identidade normalizada."));
      continue;
    }
    if (seenAliases.has(aliasKey)) {
      const duplicateIssue = issue(
        values.lineNumber,
        "aliases",
        "duplicate-alias-removed",
        "Foi removido um alias duplicado pela normalização oficial.",
        options.strictAliases ? "error" : "warning"
      );
      (options.strictAliases ? errors : warnings).push(duplicateIssue);
      continue;
    }

    seenAliases.add(aliasKey);
    aliases.push(alias);
  }

  if (aliases.length > TEAM_BATCH_CREATION_MAX_ALIASES_PER_ROW) {
    errors.push(issue(values.lineNumber, "aliases", "too-many-aliases", "A linha excede o limite de 34 aliases."));
  }

  const ownIdentityKeys = new Set(
    [canonicalName, shortName, code, slug]
      .filter((value): value is string => typeof value === "string" && value.length > 0)
      .map(normalizeTeamIdentityKey)
      .filter(Boolean)
  );
  if (aliases.some((alias) => ownIdentityKeys.has(normalizeTeamIdentityKey(alias)))) {
    errors.push(issue(values.lineNumber, "aliases", "alias-redundant-with-identity", "Um alias repete uma identidade proposta na mesma linha."));
  }

  const publicNameSuggestion = suggestAdminTeamPublicName({ name: canonicalName });
  const suggestedPublicAlias = publicNameSuggestion.value?.trim() || null;
  const suggestedPublicAliasKey = suggestedPublicAlias
    ? normalizeTeamIdentityKey(suggestedPublicAlias)
    : "";
  const publicNameAsAlias =
    suggestedPublicAlias &&
    suggestedPublicAliasKey &&
    !ownIdentityKeys.has(suggestedPublicAliasKey) &&
    !seenAliases.has(suggestedPublicAliasKey)
      ? suggestedPublicAlias
      : null;
  const suggestions: TeamBatchCreationSuggestions = {
    slug: {
      value: slug || null,
      suggested: !suppliedSlug && Boolean(slug)
    },
    publicName: publicNameSuggestion,
    publicNameAsAlias
  };

  return {
    row:
      errors.length === 0
        ? {
            lineNumber: values.lineNumber,
            canonicalName,
            publicName,
            shortName,
            code,
            slug,
            aliases,
            logoUrl,
            primaryColor
          }
        : null,
    errors,
    warnings,
    suggestions
  };
}

function isHeaderLike(line: string) {
  const fields = line.split(";").map((field) => normalizeTeamIdentityKey(field.trim()));
  if (fields.length !== HEADER_KEYS.length) {
    return fields[0] === HEADER_KEYS[0];
  }
  const matches = fields.filter((field, index) => field === HEADER_KEYS[index]).length;
  return fields[0] === HEADER_KEYS[0] || matches >= 4;
}

function invalidLine(
  lineNumber: number,
  rawLine: string,
  errors: TeamBatchCreationFieldIssue[]
): TeamBatchCreationLineResult {
  return { ok: false, lineNumber, rawLine, errors };
}

export function parseTeamBatchCreationText(rawText: string): TeamBatchCreationParseResult {
  const byteLength = new TextEncoder().encode(rawText).byteLength;
  const text = rawText.startsWith("\uFEFF") ? rawText.slice(1) : rawText;
  const physicalLines = text.split(/\r\n|\n/);
  const usefulLines = physicalLines
    .map((rawLine, index) => ({
      rawLine,
      trimmedLine: rawLine.trim(),
      lineNumber: index + 1
    }))
    .filter((entry) => entry.trimmedLine.length > 0);
  const headerPresent = usefulLines[0]?.trimmedLine === TEAM_BATCH_CREATION_HEADER;
  const dataLines = headerPresent ? usefulLines.slice(1) : usefulLines;
  const issues: TeamBatchCreationFieldIssue[] = [];
  let lineResults: TeamBatchCreationLineResult[] = [];

  if (byteLength > TEAM_BATCH_CREATION_MAX_TEXT_BYTES) {
    issues.push(issue(0, null, "input-too-large", "O texto excede 262144 bytes."));
  }
  if (dataLines.length > TEAM_BATCH_CREATION_MAX_ROWS) {
    issues.push(issue(0, null, "too-many-rows", "O lote excede 500 linhas de dados."));
  }
  if (dataLines.length === 0) {
    issues.push(issue(0, null, "empty-input", "O lote não contém clubes."));
  }

  for (const entry of dataLines) {
    const { rawLine, trimmedLine, lineNumber } = entry;
    if (trimmedLine === TEAM_BATCH_CREATION_HEADER) {
      const error = issue(lineNumber, null, "header-position-invalid", "O cabeçalho só é permitido na primeira linha não vazia.");
      issues.push(error);
      lineResults.push(invalidLine(lineNumber, rawLine, [error]));
      continue;
    }
    if (!headerPresent && entry === usefulLines[0] && isHeaderLike(trimmedLine)) {
      const error = issue(lineNumber, null, "header-invalid", "O cabeçalho não corresponde exatamente ao formato suportado.");
      issues.push(error);
      lineResults.push(invalidLine(lineNumber, rawLine, [error]));
      continue;
    }
    if (rawLine.includes("\uFEFF")) {
      const error = issue(lineNumber, null, "bom-position-invalid", "O BOM UTF-8 só é permitido no início do texto.");
      issues.push(error);
      lineResults.push(invalidLine(lineNumber, rawLine, [error]));
      continue;
    }
    if (characterLength(rawLine) > TEAM_BATCH_CREATION_MAX_LINE_LENGTH) {
      const error = issue(lineNumber, null, "line-too-long", "A linha excede 8192 caracteres.");
      issues.push(error);
      lineResults.push(invalidLine(lineNumber, rawLine, [error]));
      continue;
    }

    const fields = trimmedLine.split(";").map((value) => value.trim());
    if (fields.length !== 8) {
      const error = issue(lineNumber, null, "column-count-invalid", "Cada linha deve conter exatamente oito colunas.");
      issues.push(error);
      lineResults.push(invalidLine(lineNumber, rawLine, [error]));
      continue;
    }

    const normalized = normalizeRow(
      {
        lineNumber,
        canonicalName: fields[0] ?? "",
        publicName: fields[1] ?? "",
        shortName: fields[2] ?? "",
        code: fields[3] ?? "",
        slug: fields[4] ?? "",
        aliases: (fields[5] ?? "").trim() ? (fields[5] ?? "").split("|") : [],
        logoUrl: fields[6] ?? "",
        primaryColor: fields[7] ?? ""
      },
      { allowSlugSuggestion: true, strictAliases: false }
    );
    issues.push(...normalized.errors, ...normalized.warnings);
    lineResults.push(
      normalized.row
        ? {
            ok: true,
            lineNumber,
            rawLine,
            row: normalized.row,
            suggestions: normalized.suggestions,
            warnings: normalized.warnings
          }
        : invalidLine(lineNumber, rawLine, normalized.errors)
    );
  }

  const validIndexes = lineResults
    .map((result, index) => (result.ok ? index : -1))
    .filter((index) => index >= 0);
  const duplicateIndexes = new Set<number>();
  const conflictingIndexes = new Set<number>();
  const indexesBySignature = new Map<string, number[]>();
  const indexesByIdentity = new Map<string, number[]>();

  for (const index of validIndexes) {
    const result = lineResults[index];
    if (!result?.ok) continue;
    const signature = rowSignature(result.row);
    indexesBySignature.set(signature, [...(indexesBySignature.get(signature) ?? []), index]);
    for (const key of rowIdentityKeys(result.row)) {
      indexesByIdentity.set(key, [...(indexesByIdentity.get(key) ?? []), index]);
    }
  }
  for (const indexes of indexesBySignature.values()) {
    if (indexes.length > 1) indexes.forEach((index) => duplicateIndexes.add(index));
  }
  for (const indexes of indexesByIdentity.values()) {
    if (new Set(indexes).size > 1) {
      indexes.forEach((index) => {
        if (!duplicateIndexes.has(index)) conflictingIndexes.add(index);
      });
    }
  }

  lineResults = lineResults.map((result, index) => {
    if (!result.ok) return result;
    const collisionIssue = duplicateIndexes.has(index)
      ? issue(result.lineNumber, null, "duplicate-row", "A mesma linha aparece mais do que uma vez no lote.")
      : conflictingIndexes.has(index)
        ? issue(result.lineNumber, null, "batch-identity-conflict", "Uma identidade colide com outra linha do lote.")
        : null;
    if (!collisionIssue) return result;
    issues.push(collisionIssue);
    return invalidLine(result.lineNumber, result.rawLine, [collisionIssue]);
  });

  const rows = lineResults
    .filter((result): result is Extract<TeamBatchCreationLineResult, { ok: true }> => result.ok)
    .map((result) => result.row);
  const invalidRows = lineResults.length - rows.length;
  const warningCount = issues.filter((item) => item.severity === "warning").length;
  const hasErrors = issues.some((item) => item.severity === "error");

  return {
    lines: lineResults,
    rows,
    issues,
    summary: {
      totalPhysicalLines: physicalLines.length,
      usefulLines: dataLines.length,
      validRows: rows.length,
      invalidRows,
      warningCount,
      byteLength,
      headerPresent,
      canSubmit: rows.length > 0 && !hasErrors
    }
  };
}

function fail(
  code: TeamBatchCreationPolicyErrorCode,
  options: { field?: string; lineNumber?: number } = {}
): never {
  throw new TeamBatchCreationPolicyError(code, options);
}

function parseStructuredRow(value: unknown): TeamBatchCreationInputRow {
  if (!isRecord(value)) return fail("team-batch-creation-row-not-object");
  if (!hasExactFields(value, INPUT_ROW_FIELDS)) {
    return fail("team-batch-creation-row-fields-invalid");
  }
  if (!isPositiveLineNumber(value.lineNumber)) {
    return fail("team-batch-creation-line-number-invalid", { field: "lineNumber" });
  }
  if (
    typeof value.canonicalName !== "string" ||
    !isNullableString(value.publicName) ||
    typeof value.shortName !== "string" ||
    !isNullableString(value.code) ||
    typeof value.slug !== "string" ||
    !Array.isArray(value.aliases) ||
    !value.aliases.every((alias) => typeof alias === "string") ||
    !isNullableString(value.logoUrl) ||
    !isNullableString(value.primaryColor)
  ) {
    return fail("team-batch-creation-row-value-invalid", {
      lineNumber: value.lineNumber
    });
  }

  const normalized = normalizeRow(
    {
      lineNumber: value.lineNumber,
      canonicalName: value.canonicalName,
      publicName: value.publicName ?? "",
      shortName: value.shortName,
      code: value.code ?? "",
      slug: value.slug,
      aliases: value.aliases as string[],
      logoUrl: value.logoUrl ?? "",
      primaryColor: value.primaryColor ?? ""
    },
    { allowSlugSuggestion: false, strictAliases: true }
  );
  if (!normalized.row) {
    const first = normalized.errors[0];
    return fail("team-batch-creation-row-value-invalid", {
      field: first?.field ?? undefined,
      lineNumber: value.lineNumber
    });
  }
  return normalized.row;
}

function assertNoBatchIdentityConflicts(rows: readonly TeamBatchCreationInputRow[]) {
  const ownerByKey = new Map<string, number>();
  for (const row of rows) {
    for (const key of rowIdentityKeys(row)) {
      const owner = ownerByKey.get(key);
      if (owner !== undefined && owner !== row.lineNumber) {
        return fail("team-batch-creation-batch-identity-conflict", {
          lineNumber: row.lineNumber
        });
      }
      ownerByKey.set(key, row.lineNumber);
    }
  }
}

export function parseTeamBatchCreationRequest(
  value: unknown
): TeamBatchCreationPreviewRequest | TeamBatchCreationApplyRequest {
  if (!isRecord(value)) return fail("team-batch-creation-body-not-object");
  if (value.action !== "preview" && value.action !== "apply") {
    return fail("team-batch-creation-action-invalid", { field: "action" });
  }
  const requestFields =
    value.action === "preview" ? REQUEST_PREVIEW_FIELDS : REQUEST_APPLY_FIELDS;
  if (!hasExactFields(value, requestFields)) {
    return fail("team-batch-creation-request-fields-invalid");
  }
  if (!isUuid(value.countryId)) {
    return fail("team-batch-creation-country-id-invalid", { field: "countryId" });
  }
  if (!Array.isArray(value.rows)) return fail("team-batch-creation-rows-not-array");
  if (value.rows.length === 0) return fail("team-batch-creation-rows-required");
  if (value.rows.length > TEAM_BATCH_CREATION_MAX_ROWS) {
    return fail("team-batch-creation-rows-limit-exceeded");
  }

  const rows = value.rows.map(parseStructuredRow);
  const lineNumbers = new Set<number>();
  for (const row of rows) {
    if (lineNumbers.has(row.lineNumber)) {
      return fail("team-batch-creation-line-number-duplicate", {
        lineNumber: row.lineNumber
      });
    }
    lineNumbers.add(row.lineNumber);
  }
  assertNoBatchIdentityConflicts(rows);
  const countryId = value.countryId.toLowerCase();

  if (value.action === "preview") {
    return { action: "preview", countryId, rows };
  }
  if (
    typeof value.previewFingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(value.previewFingerprint)
  ) {
    return fail("team-batch-creation-fingerprint-invalid", {
      field: "previewFingerprint"
    });
  }
  if (
    !Array.isArray(value.confirmedCompleteExistingLines) ||
    !value.confirmedCompleteExistingLines.every(isPositiveLineNumber)
  ) {
    return fail("team-batch-creation-confirmed-lines-invalid", {
      field: "confirmedCompleteExistingLines"
    });
  }
  const confirmedLines = value.confirmedCompleteExistingLines as number[];
  const confirmedSet = new Set<number>();
  for (const lineNumber of confirmedLines) {
    if (confirmedSet.has(lineNumber)) {
      return fail("team-batch-creation-confirmed-line-duplicate", {
        lineNumber
      });
    }
    if (!lineNumbers.has(lineNumber)) {
      return fail("team-batch-creation-confirmed-line-missing", {
        lineNumber
      });
    }
    confirmedSet.add(lineNumber);
  }
  return {
    action: "apply",
    countryId,
    rows,
    previewFingerprint: value.previewFingerprint,
    confirmedCompleteExistingLines: [...confirmedLines]
  };
}

export function buildTeamBatchCreationRpcArguments(
  request: TeamBatchCreationPreviewRequest | TeamBatchCreationApplyRequest
): TeamBatchCreationFunctionalRpcArguments {
  return {
    p_country_id: request.countryId,
    p_rows: request.rows,
    p_apply: request.action === "apply",
    p_confirmed_preview_fingerprint:
      request.action === "apply" ? request.previewFingerprint : null,
    p_confirmed_complete_existing_lines:
      request.action === "apply"
        ? [...request.confirmedCompleteExistingLines]
        : []
  };
}

function isProposedIdentity(value: unknown): value is TeamBatchCreationProposedIdentity {
  return (
    isRecord(value) &&
    hasExactFields(value, PROPOSED_IDENTITY_FIELDS) &&
    isNullableString(value.canonical_name) &&
    isNullableString(value.normalized_canonical_name) &&
    isNullableString(value.public_name) &&
    isNullableString(value.short_name) &&
    isNullableString(value.normalized_short_name) &&
    isNullableString(value.code) &&
    isNullableString(value.normalized_code) &&
    isNullableString(value.slug) &&
    isUuid(value.country_id) &&
    isNullableString(value.logo_url) &&
    isNullableString(value.primary_color)
  );
}

function isExistingIdentity(value: unknown): value is TeamBatchCreationExistingIdentity {
  return (
    isRecord(value) &&
    hasExactFields(value, EXISTING_IDENTITY_FIELDS) &&
    isUuid(value.team_id) &&
    (value.country_id === null || isUuid(value.country_id)) &&
    typeof value.canonical_name === "string" &&
    isNullableString(value.public_name) &&
    typeof value.short_name === "string" &&
    isNullableString(value.code) &&
    typeof value.slug === "string" &&
    isNullableString(value.logo_url) &&
    isNullableString(value.primary_color)
  );
}

function isConflict(value: unknown): value is TeamBatchCreationConflict {
  if (isUuid(value)) return true;
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "line_number" || value.type === "batch_identity") {
    return hasExactFields(value, new Set(["type"]));
  }
  if (value.type === "identity_alias" || value.type === "alias") {
    return hasExactFields(value, new Set(["type", "team_id"])) && isUuid(value.team_id);
  }
  return (
    value.type === "slug" &&
    hasExactFields(value, new Set(["type", "team_id", "value"])) &&
    isUuid(value.team_id) &&
    typeof value.value === "string"
  );
}

export function isTeamBatchCreationRpcRow(
  value: unknown
): value is TeamBatchCreationRpcRow {
  if (!isRecord(value) || !hasExactFields(value, RPC_ROW_FIELDS)) return false;
  if (
    !isPositiveLineNumber(value.line_number) ||
    typeof value.result_status !== "string" ||
    !STATUS_VALUES.has(value.result_status as TeamBatchCreationStatus) ||
    typeof value.reason_code !== "string" ||
    typeof value.reason_message !== "string" ||
    !isProposedIdentity(value.proposed_identity) ||
    (value.resolved_team_id !== null && !isUuid(value.resolved_team_id)) ||
    (value.existing_identity !== null && !isExistingIdentity(value.existing_identity)) ||
    !Array.isArray(value.conflicts) ||
    !value.conflicts.every(isConflict) ||
    !Array.isArray(value.normalized_aliases) ||
    !value.normalized_aliases.every(
      (alias) =>
        typeof alias === "string" &&
        alias.length > 0 &&
        alias === normalizeTeamIdentityKey(alias)
    ) ||
    new Set(value.normalized_aliases).size !== value.normalized_aliases.length ||
    typeof value.proposed_action !== "string" ||
    !ACTION_VALUES.has(value.proposed_action as TeamBatchCreationAction) ||
    (value.final_team_id !== null && !isUuid(value.final_team_id)) ||
    typeof value.changed !== "boolean" ||
    typeof value.batch_applied !== "boolean" ||
    typeof value.batch_can_apply !== "boolean" ||
    typeof value.batch_integrally_applied !== "boolean" ||
    typeof value.preview_fingerprint !== "string" ||
    !FINGERPRINT_PATTERN.test(value.preview_fingerprint)
  ) {
    return false;
  }

  return [
    value.batch_total_count,
    value.batch_create_count,
    value.batch_existing_count,
    value.batch_complete_existing_count,
    value.batch_probable_count,
    value.batch_ambiguous_count,
    value.batch_conflict_count,
    value.batch_invalid_count,
    value.batch_blocking_count,
    value.batch_created_count,
    value.batch_completed_existing_count,
    value.batch_existing_result_count,
    value.batch_aliases_created_count,
    value.batch_aliases_unchanged_count,
    value.batch_public_names_changed_count
  ].every(isNonNegativeInteger);
}

function invalidRpc(message: string): TeamBatchCreationRpcValidationResult {
  return {
    ok: false,
    code: "team-batch-creation-rpc-invalid-response",
    message
  };
}

function repeatedBatchFieldsEqual(
  left: TeamBatchCreationRpcRow,
  right: TeamBatchCreationRpcRow
) {
  return (
    left.batch_applied === right.batch_applied &&
    left.batch_total_count === right.batch_total_count &&
    left.batch_create_count === right.batch_create_count &&
    left.batch_existing_count === right.batch_existing_count &&
    left.batch_complete_existing_count === right.batch_complete_existing_count &&
    left.batch_probable_count === right.batch_probable_count &&
    left.batch_ambiguous_count === right.batch_ambiguous_count &&
    left.batch_conflict_count === right.batch_conflict_count &&
    left.batch_invalid_count === right.batch_invalid_count &&
    left.batch_blocking_count === right.batch_blocking_count &&
    left.batch_can_apply === right.batch_can_apply &&
    left.batch_created_count === right.batch_created_count &&
    left.batch_completed_existing_count === right.batch_completed_existing_count &&
    left.batch_existing_result_count === right.batch_existing_result_count &&
    left.batch_aliases_created_count === right.batch_aliases_created_count &&
    left.batch_aliases_unchanged_count === right.batch_aliases_unchanged_count &&
    left.batch_public_names_changed_count === right.batch_public_names_changed_count &&
    left.batch_integrally_applied === right.batch_integrally_applied &&
    left.preview_fingerprint === right.preview_fingerprint
  );
}

export function validateTeamBatchCreationRpcRows(
  value: unknown,
  expected: TeamBatchCreationRpcValidationContext
): TeamBatchCreationRpcValidationResult {
  if (
    (expected.operation !== "preview" && expected.operation !== "apply") ||
    !isUuid(expected.countryId) ||
    expected.expectedLineNumbers.length === 0 ||
    !expected.expectedLineNumbers.every(isPositiveLineNumber) ||
    new Set(expected.expectedLineNumbers).size !== expected.expectedLineNumbers.length
  ) {
    return invalidRpc("O contexto esperado para validar o RPC é inválido.");
  }
  const confirmed = expected.confirmedCompleteExistingLines ?? [];
  if (
    !confirmed.every(isPositiveLineNumber) ||
    new Set(confirmed).size !== confirmed.length ||
    confirmed.some((lineNumber) => !expected.expectedLineNumbers.includes(lineNumber))
  ) {
    return invalidRpc("As confirmações complete_existing do contexto são inválidas.");
  }
  if (!Array.isArray(value) || value.length !== expected.expectedLineNumbers.length) {
    return invalidRpc("O RPC não devolveu o número esperado de linhas.");
  }
  if (!value.every(isTeamBatchCreationRpcRow)) {
    return invalidRpc("Uma linha do RPC não respeita o contrato estrutural.");
  }

  const rows = value;
  const first = rows[0];
  if (!first) return invalidRpc("O RPC devolveu um lote vazio.");
  if (
    rows.some(
      (row, index) =>
        row.line_number !== expected.expectedLineNumbers[index] ||
        row.proposed_identity.country_id.toLowerCase() !== expected.countryId.toLowerCase()
    ) ||
    new Set(rows.map((row) => row.line_number)).size !== rows.length
  ) {
    return invalidRpc("Os line_number ou country_id não correspondem ao pedido.");
  }
  if (rows.some((row) => !repeatedBatchFieldsEqual(first, row))) {
    return invalidRpc("Os totais ou a fingerprint não são iguais em todas as linhas.");
  }

  const count = (status: TeamBatchCreationStatus) =>
    rows.filter((row) => row.result_status === status).length;
  const statusCounts = {
    create: count("create"),
    existing: count("existing"),
    completeExisting: count("complete_existing"),
    probable: count("probable"),
    ambiguous: count("ambiguous"),
    conflict: count("conflict"),
    invalid: count("invalid")
  };
  if (
    first.batch_total_count !== rows.length ||
    first.batch_create_count !== statusCounts.create ||
    first.batch_existing_count !== statusCounts.existing ||
    first.batch_complete_existing_count !== statusCounts.completeExisting ||
    first.batch_probable_count !== statusCounts.probable ||
    first.batch_ambiguous_count !== statusCounts.ambiguous ||
    first.batch_conflict_count !== statusCounts.conflict ||
    first.batch_invalid_count !== statusCounts.invalid ||
    Object.values(statusCounts).reduce((sum, current) => sum + current, 0) !== rows.length ||
    first.batch_existing_result_count !== statusCounts.existing
  ) {
    return invalidRpc("Os contadores de estado não correspondem às linhas devolvidas.");
  }

  const confirmedSet = new Set(confirmed);
  const blockingCount = rows.filter(
    (row) =>
      ["probable", "ambiguous", "conflict", "invalid"].includes(row.result_status) ||
      (row.result_status === "complete_existing" &&
        (expected.operation === "preview" || !confirmedSet.has(row.line_number)))
  ).length;
  if (
    first.batch_blocking_count !== blockingCount ||
    first.batch_can_apply !== (blockingCount === 0)
  ) {
    return invalidRpc("batch_can_apply ou batch_blocking_count é incoerente.");
  }

  if (expected.operation === "preview") {
    if (
      rows.some((row) => row.batch_applied || row.batch_integrally_applied || row.changed) ||
      first.batch_created_count !== 0 ||
      first.batch_completed_existing_count !== 0 ||
      first.batch_aliases_created_count !== 0 ||
      first.batch_aliases_unchanged_count !== 0 ||
      first.batch_public_names_changed_count !== 0
    ) {
      return invalidRpc("Um preview declarou mutações ou aplicação integral.");
    }
  } else {
    if (
      blockingCount !== 0 ||
      rows.some((row) => !row.batch_applied || !row.batch_integrally_applied) ||
      first.batch_created_count !== statusCounts.create ||
      first.batch_completed_existing_count !== statusCounts.completeExisting ||
      rows.some(
        (row) =>
          row.final_team_id === null ||
          (row.result_status === "existing" && row.changed) ||
          (row.result_status !== "existing" && !row.changed)
      )
    ) {
      return invalidRpc("O apply não representa uma aplicação integral coerente.");
    }
  }

  return {
    ok: true,
    rows,
    fingerprint: first.preview_fingerprint,
    summary: {
      applied: first.batch_applied,
      totalCount: first.batch_total_count,
      createCount: first.batch_create_count,
      existingCount: first.batch_existing_count,
      completeExistingCount: first.batch_complete_existing_count,
      probableCount: first.batch_probable_count,
      ambiguousCount: first.batch_ambiguous_count,
      conflictCount: first.batch_conflict_count,
      invalidCount: first.batch_invalid_count,
      blockingCount: first.batch_blocking_count,
      canApply: first.batch_can_apply,
      createdCount: first.batch_created_count,
      completedExistingCount: first.batch_completed_existing_count,
      existingResultCount: first.batch_existing_result_count,
      aliasesCreatedCount: first.batch_aliases_created_count,
      aliasesUnchangedCount: first.batch_aliases_unchanged_count,
      publicNamesChangedCount: first.batch_public_names_changed_count,
      integrallyApplied: first.batch_integrally_applied
    }
  };
}
