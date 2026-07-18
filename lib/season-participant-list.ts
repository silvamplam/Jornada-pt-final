export const SEASON_PARTICIPANT_LIST_HEADER = "Nome;Sigla;Slug;Emblema URL;Cor";
export const CALENDAR_LIST_HEADER = "Jornada;Nome da jornada;Casa;Fora;DataHora;Estadio";
export const SEASON_PARTICIPANT_LIST_MAX_LINES = 500;
export const SEASON_PARTICIPANT_LIST_MAX_BYTES = 256 * 1024;
export const SEASON_PARTICIPANT_SUGGESTION_LIMIT = 3;

const FIELD_LIMITS = {
  name: 160,
  shortName: 32,
  slug: 160,
  logoUrl: 2048,
  color: 7
} as const;

export type SeasonParticipantCatalogTeam = {
  id: string;
  name: string;
  shortName: string | null;
  slug: string;
  code: string | null;
};

export type SeasonParticipantAlias = {
  teamId: string;
  normalizedAlias: string;
};

export type ExistingSeasonParticipant = {
  teamId: string;
  status: string | null;
};

export type SeasonParticipantListRow = {
  lineNumber: number;
  name: string;
  shortName: string;
  slug: string;
  logoUrl: string;
  color: string;
};

export type SeasonParticipantListIssue = {
  lineNumber: number;
  code: string;
  message: string;
  fields: string[];
};

export type SeasonParticipantParseResult = {
  rows: SeasonParticipantListRow[];
  issues: SeasonParticipantListIssue[];
  usefulLineCount: number;
  headerPresent: boolean;
  byteLength: number;
};

export type SeasonParticipantResolution =
  | { status: "resolved"; teamId: string }
  | { status: "unresolved" }
  | { status: "ambiguous"; teamIds: string[] }
  | { status: "conflict"; teamIds: string[] };

export type SeasonParticipantPlanAction = "associate" | "reactivate" | "keep" | "reject";

export type SeasonParticipantSuggestionReason = {
  inputField: "name" | "short_name" | "slug";
  candidateField: "name" | "short_name" | "slug" | "code" | "alias";
  similarity: number;
};

export type SeasonParticipantSuggestion = {
  teamName: string;
  shortName: string | null;
  slug: string;
  reasons: SeasonParticipantSuggestionReason[];
};

export type SeasonParticipantPlanRow = SeasonParticipantListRow & {
  action: SeasonParticipantPlanAction;
  actionLabel: string;
  reasonCode: string;
  note: string;
  teamId: string | null;
  teamName: string | null;
  suggestions: SeasonParticipantSuggestion[];
};

export type SeasonParticipantPlanSummary = {
  totalRows: number;
  associate: number;
  reactivate: number;
  keep: number;
  reject: number;
  invalid: number;
  unresolved: number;
  ambiguous: number;
  conflicts: number;
  duplicates: number;
};

export type SeasonParticipantPlan = {
  rows: SeasonParticipantPlanRow[];
  summary: SeasonParticipantPlanSummary;
  applicable: boolean;
  headerPresent: boolean;
  byteLength: number;
};

export type SeasonParticipantPlanInput = {
  rawList: string;
  teams: readonly SeasonParticipantCatalogTeam[] | null;
  aliases: readonly SeasonParticipantAlias[] | null;
  participants: readonly ExistingSeasonParticipant[] | null;
};

export function seasonParticipantListByteLength(value: string) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function normalizeSeasonParticipantKey(value: string) {
  return value
    .trim()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function issue(lineNumber: number, code: string, message: string, fields: string[] = []): SeasonParticipantListIssue {
  return { lineNumber, code, message, fields };
}

function isValidHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && Boolean(url.hostname);
  } catch {
    return false;
  }
}

function looksLikeCalendarRow(fields: string[]) {
  if (fields.length !== 5 && fields.length !== 6) return false;
  if (!/^[1-9]\d*$/.test(fields[0] ?? "")) return false;
  if (!(fields[2] ?? "").trim() || !(fields[3] ?? "").trim()) return false;
  const dateTime = (fields[4] ?? "").trim();
  return dateTime === "" || /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2})?$/.test(dateTime);
}

export function parseSeasonParticipantList(rawList: string): SeasonParticipantParseResult {
  const byteLength = seasonParticipantListByteLength(rawList);
  const rows: SeasonParticipantListRow[] = [];
  const issues: SeasonParticipantListIssue[] = [];
  const usefulLines = rawList
    .split(/\r?\n/)
    .map((rawLine, index) => ({ line: rawLine.trim(), lineNumber: index + 1 }))
    .filter((item) => item.line.length > 0);
  const headerPresent = usefulLines[0]?.line === SEASON_PARTICIPANT_LIST_HEADER;
  const dataLines = headerPresent ? usefulLines.slice(1) : usefulLines;

  if (byteLength > SEASON_PARTICIPANT_LIST_MAX_BYTES) {
    issues.push(issue(0, "input-too-large", `A lista excede o limite de ${SEASON_PARTICIPANT_LIST_MAX_BYTES} bytes.`));
    return { rows, issues, usefulLineCount: dataLines.length, headerPresent, byteLength };
  }

  if (usefulLines.length > SEASON_PARTICIPANT_LIST_MAX_LINES) {
    issues.push(issue(0, "too-many-lines", `A lista excede o limite de ${SEASON_PARTICIPANT_LIST_MAX_LINES} linhas não vazias.`));
    return { rows, issues, usefulLineCount: dataLines.length, headerPresent, byteLength };
  }

  if (dataLines.length === 0) {
    issues.push(issue(0, "empty-input", "A lista não contém clubes."));
    return { rows, issues, usefulLineCount: 0, headerPresent, byteLength };
  }

  for (const { line, lineNumber } of dataLines) {
    const fields = line.split(";").map((value) => value.trim());

    if (line === SEASON_PARTICIPANT_LIST_HEADER) {
      issues.push(issue(lineNumber, "header-position-invalid", "O cabeçalho só é permitido na primeira linha não vazia.", fields));
      continue;
    }

    if (line === CALENDAR_LIST_HEADER) {
      issues.push(issue(lineNumber, "calendar-header", "O cabeçalho pertence ao importador de calendário, não à lista de participantes.", fields));
      continue;
    }

    if (looksLikeCalendarRow(fields)) {
      issues.push(issue(lineNumber, "calendar-format", "A linha tem o formato de um jogo do calendário e não pode ser usada para preparar participantes.", fields));
      continue;
    }

    if (fields.length !== 5) {
      issues.push(issue(lineNumber, "column-count-invalid", "Cada linha deve conter exatamente cinco colunas separadas por ponto e vírgula.", fields));
      continue;
    }

    const [name, shortName, slug, logoUrl, color] = fields;
    if (!name) {
      issues.push(issue(lineNumber, "name-required", "O nome do clube é obrigatório.", fields));
      continue;
    }

    if (
      name.length > FIELD_LIMITS.name ||
      shortName.length > FIELD_LIMITS.shortName ||
      slug.length > FIELD_LIMITS.slug ||
      logoUrl.length > FIELD_LIMITS.logoUrl ||
      color.length > FIELD_LIMITS.color
    ) {
      issues.push(issue(lineNumber, "field-too-long", "Um ou mais campos excedem o comprimento permitido.", fields));
      continue;
    }

    if (logoUrl && !isValidHttpUrl(logoUrl)) {
      issues.push(issue(lineNumber, "logo-url-invalid", "O Emblema URL deve ser um endereço HTTP ou HTTPS válido.", fields));
      continue;
    }

    if (color && !/^#[0-9A-Fa-f]{6}$/.test(color)) {
      issues.push(issue(lineNumber, "color-invalid", "A Cor deve usar o formato hexadecimal #RRGGBB.", fields));
      continue;
    }

    rows.push({ lineNumber, name, shortName, slug, logoUrl, color });
  }

  return { rows, issues, usefulLineCount: dataLines.length, headerPresent, byteLength };
}

export function buildSeasonParticipantLookup(
  teams: readonly SeasonParticipantCatalogTeam[],
  aliases: readonly SeasonParticipantAlias[]
) {
  const teamIds = new Set(teams.map((team) => team.id));
  const index = new Map<string, Set<string>>();
  const add = (value: string | null | undefined, teamId: string) => {
    const key = value ? normalizeSeasonParticipantKey(value) : "";
    if (!key) return;
    const candidates = index.get(key) ?? new Set<string>();
    candidates.add(teamId);
    index.set(key, candidates);
  };

  teams.forEach((team) => {
    add(team.name, team.id);
    add(team.shortName, team.id);
    add(team.slug, team.id);
    add(team.code, team.id);
  });
  aliases.forEach((alias) => {
    if (teamIds.has(alias.teamId)) add(alias.normalizedAlias, alias.teamId);
  });

  return index;
}

export function resolveSeasonParticipantRow(
  index: Map<string, Set<string>>,
  row: Pick<SeasonParticipantListRow, "name" | "shortName" | "slug">
): SeasonParticipantResolution {
  const identifiers = [row.name, row.shortName, row.slug].filter((value) => value.trim().length > 0);
  const candidateSets = identifiers.map((value) => new Set(index.get(normalizeSeasonParticipantKey(value)) ?? []));

  if (candidateSets.some((candidates) => candidates.size === 0)) {
    return { status: "unresolved" };
  }

  const intersection = new Set(candidateSets[0] ?? []);
  for (const candidates of candidateSets.slice(1)) {
    for (const teamId of intersection) {
      if (!candidates.has(teamId)) intersection.delete(teamId);
    }
  }

  const matchingTeamIds = Array.from(intersection).sort();
  if (matchingTeamIds.length === 1) return { status: "resolved", teamId: matchingTeamIds[0] };
  if (matchingTeamIds.length > 1) return { status: "ambiguous", teamIds: matchingTeamIds };

  const conflictingTeamIds = Array.from(new Set(candidateSets.flatMap((candidates) => Array.from(candidates)))).sort();
  return { status: "conflict", teamIds: conflictingTeamIds };
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      const substitution = previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1);
      current[rightIndex] = Math.min(previous[rightIndex] + 1, current[rightIndex - 1] + 1, substitution);
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function suggestionSimilarity(leftValue: string, rightValue: string) {
  const left = normalizeSeasonParticipantKey(leftValue);
  const right = normalizeSeasonParticipantKey(rightValue);
  if (!left || !right) return 0;
  if (left === right) return 1;

  const leftCompact = left.replace(/-/g, "");
  const rightCompact = right.replace(/-/g, "");
  const maximumLength = Math.max(leftCompact.length, rightCompact.length);
  const editScore = maximumLength > 0 ? 1 - editDistance(leftCompact, rightCompact) / maximumLength : 0;
  const stopWords = new Set(["a", "o", "da", "de", "do", "das", "dos"]);
  const leftTokens = new Set(left.split("-").filter((token) => token && !stopWords.has(token)));
  const rightTokens = new Set(right.split("-").filter((token) => token && !stopWords.has(token)));
  const sharedTokens = Array.from(leftTokens).filter((token) => rightTokens.has(token)).length;
  const tokenScore = Math.max(leftTokens.size, rightTokens.size) > 0 ? sharedTokens / Math.max(leftTokens.size, rightTokens.size) : 0;
  const shorterLength = Math.min(leftCompact.length, rightCompact.length);
  const prefixScore =
    shorterLength >= 5 && (leftCompact.startsWith(rightCompact) || rightCompact.startsWith(leftCompact)) ? 0.86 : 0;

  return Math.max(editScore, tokenScore, prefixScore);
}

export function suggestSeasonParticipantCandidates({
  row,
  teams,
  aliases,
  limit = SEASON_PARTICIPANT_SUGGESTION_LIMIT
}: {
  row: Pick<SeasonParticipantListRow, "name" | "shortName" | "slug">;
  teams: readonly SeasonParticipantCatalogTeam[];
  aliases: readonly SeasonParticipantAlias[];
  limit?: number;
}): SeasonParticipantSuggestion[] {
  const requested = [
    { field: "name" as const, value: row.name },
    { field: "short_name" as const, value: row.shortName },
    { field: "slug" as const, value: row.slug }
  ].filter((item) => normalizeSeasonParticipantKey(item.value));
  const aliasesByTeamId = new Map<string, string[]>();
  aliases.forEach((alias) => {
    const values = aliasesByTeamId.get(alias.teamId) ?? [];
    values.push(alias.normalizedAlias);
    aliasesByTeamId.set(alias.teamId, values);
  });

  return teams
    .map((team) => {
      const candidates = [
        { field: "name" as const, value: team.name },
        { field: "short_name" as const, value: team.shortName ?? "" },
        { field: "slug" as const, value: team.slug },
        { field: "code" as const, value: team.code ?? "" },
        ...(aliasesByTeamId.get(team.id) ?? []).map((value) => ({ field: "alias" as const, value }))
      ];
      const reasons: SeasonParticipantSuggestionReason[] = [];
      requested.forEach((input) => {
        candidates.forEach((candidate) => {
          const similarity = suggestionSimilarity(input.value, candidate.value);
          if (similarity >= 0.68) {
            reasons.push({
              inputField: input.field,
              candidateField: candidate.field,
              similarity: Math.round(similarity * 1000) / 1000
            });
          }
        });
      });
      reasons.sort(
        (left, right) =>
          right.similarity - left.similarity ||
          left.inputField.localeCompare(right.inputField) ||
          left.candidateField.localeCompare(right.candidateField)
      );
      return {
        teamName: team.name,
        shortName: team.shortName,
        slug: team.slug,
        reasons,
        bestScore: reasons[0]?.similarity ?? 0
      };
    })
    .filter((suggestion) => suggestion.reasons.length > 0)
    .sort((left, right) => right.bestScore - left.bestScore || left.teamName.localeCompare(right.teamName) || left.slug.localeCompare(right.slug))
    .slice(0, Math.max(0, Math.min(limit, 5)))
    .map(({ bestScore: _bestScore, ...suggestion }) => suggestion);
}

function rejectedRow(
  row: SeasonParticipantListRow,
  reasonCode: string,
  note: string,
  teamId: string | null = null,
  teamName: string | null = null,
  suggestions: SeasonParticipantSuggestion[] = []
): SeasonParticipantPlanRow {
  return { ...row, action: "reject", actionLabel: "Rejeitar", reasonCode, note, teamId, teamName, suggestions };
}

function issueRow(item: SeasonParticipantListIssue): SeasonParticipantPlanRow {
  const [name = "", shortName = "", slug = "", logoUrl = "", color = ""] = item.fields;
  return rejectedRow({ lineNumber: item.lineNumber, name, shortName, slug, logoUrl, color }, item.code, item.message);
}

function summarize(rows: readonly SeasonParticipantPlanRow[], totalRows: number): SeasonParticipantPlanSummary {
  const summary: SeasonParticipantPlanSummary = {
    totalRows,
    associate: 0,
    reactivate: 0,
    keep: 0,
    reject: 0,
    invalid: 0,
    unresolved: 0,
    ambiguous: 0,
    conflicts: 0,
    duplicates: 0
  };

  rows.forEach((row) => {
    summary[row.action] += 1;
    if (row.action !== "reject") return;
    if (row.reasonCode === "team-unresolved") summary.unresolved += 1;
    else if (row.reasonCode === "team-ambiguous") summary.ambiguous += 1;
    else if (row.reasonCode === "team-conflict") summary.conflicts += 1;
    else if (row.reasonCode === "team-duplicate") summary.duplicates += 1;
    else summary.invalid += 1;
  });

  return summary;
}

export function buildSeasonParticipantPlan({
  rawList,
  teams,
  aliases,
  participants
}: SeasonParticipantPlanInput): SeasonParticipantPlan {
  const parsed = parseSeasonParticipantList(rawList);
  const issueRows = parsed.issues.map(issueRow);

  if (teams === null || aliases === null || participants === null) {
    const reasonCode =
      teams === null ? "catalog-unavailable" : aliases === null ? "aliases-unavailable" : "participants-unavailable";
    const note =
      teams === null
        ? "Não foi possível carregar o catálogo contextual de clubes; a lista está bloqueada."
        : aliases === null
          ? "Não foi possível carregar os aliases; a lista está bloqueada."
          : "Não foi possível carregar os participantes atuais da época; a lista está bloqueada.";
    const blockedRows = parsed.rows.map((row) => rejectedRow(row, reasonCode, note));
    const rows = [...issueRows, ...blockedRows].sort((left, right) => left.lineNumber - right.lineNumber);
    return {
      rows,
      summary: summarize(rows, parsed.usefulLineCount),
      applicable: false,
      headerPresent: parsed.headerPresent,
      byteLength: parsed.byteLength
    };
  }

  const teamsById = new Map(teams.map((team) => [team.id, team]));
  const index = buildSeasonParticipantLookup(teams, aliases);
  const resolvedRows = parsed.rows.map((row) => {
    const resolution = resolveSeasonParticipantRow(index, row);
    if (resolution.status === "unresolved") {
      return rejectedRow(row, "team-unresolved", "Nenhum clube existente do país corresponde a todos os identificadores preenchidos.");
    }
    if (resolution.status === "ambiguous") {
      return rejectedRow(row, "team-ambiguous", "Os identificadores correspondem a mais de um clube existente.");
    }
    if (resolution.status === "conflict") {
      return rejectedRow(row, "team-conflict", "Os identificadores preenchidos apontam para clubes diferentes.");
    }

    const team = teamsById.get(resolution.teamId);
    if (!team) {
      return rejectedRow(row, "team-unresolved", "O clube resolvido não pertence ao catálogo contextual.");
    }

    return {
      ...row,
      action: "keep" as const,
      actionLabel: "Manter",
      reasonCode: "participant-active",
      note: "O clube já está associado e ativo nesta época.",
      teamId: team.id,
      teamName: team.name,
      suggestions: []
    };
  });

  const rowsWithSuggestions = resolvedRows.map((row) =>
    row.action === "reject" && ["team-unresolved", "team-ambiguous", "team-conflict"].includes(row.reasonCode)
      ? rejectedRow(
          row,
          row.reasonCode,
          row.note,
          row.teamId,
          row.teamName,
          suggestSeasonParticipantCandidates({ row, teams, aliases })
        )
      : row
  );
  const resolvedUses = new Map<string, number[]>();
  rowsWithSuggestions.forEach((row, indexValue) => {
    if (!row.teamId) return;
    const uses = resolvedUses.get(row.teamId) ?? [];
    uses.push(indexValue);
    resolvedUses.set(row.teamId, uses);
  });
  resolvedUses.forEach((uses) => {
    if (uses.length < 2) return;
    uses.forEach((indexValue) => {
      const row = rowsWithSuggestions[indexValue];
      rowsWithSuggestions[indexValue] = rejectedRow(
        row,
        "team-duplicate",
        "Mais de uma linha da lista resolve para o mesmo clube.",
        row.teamId,
        row.teamName,
        row.suggestions
      );
    });
  });

  const participantsByTeamId = new Map(participants.map((participant) => [participant.teamId, participant]));
  const plannedRows = rowsWithSuggestions.map((row): SeasonParticipantPlanRow => {
    if (row.action === "reject" || !row.teamId) return row;
    const participant = participantsByTeamId.get(row.teamId);
    if (!participant) {
      return {
        ...row,
        action: "associate",
        actionLabel: "Associar",
        reasonCode: "participant-missing",
        note: "O clube existente será associado à época."
      };
    }
    if (participant.status === "inactive") {
      return {
        ...row,
        action: "reactivate",
        actionLabel: "Reativar",
        reasonCode: "participant-inactive",
        note: "A associação existente está inativa e será reativada."
      };
    }
    return row;
  });

  const rows = [...issueRows, ...plannedRows].sort((left, right) => left.lineNumber - right.lineNumber);
  const summary = summarize(rows, parsed.usefulLineCount);
  const validRows = summary.associate + summary.reactivate + summary.keep;
  return {
    rows,
    summary,
    applicable: summary.reject === 0 && validRows > 0,
    headerPresent: parsed.headerPresent,
    byteLength: parsed.byteLength
  };
}
