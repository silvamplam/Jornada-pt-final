export const CALENDAR_IMPORT_HEADER = "Jornada;Nome da jornada;Casa;Fora;DataHora;Estádio;CanalTV";
export const CALENDAR_IMPORT_LEGACY_HEADER = "Jornada;Nome da jornada;Casa;Fora;DataHora;Estadio";
export const CALENDAR_IMPORT_MAX_BYTES = 256 * 1024;
export const CALENDAR_IMPORT_MAX_LINES = 500;

const FIELD_LIMITS = {
  matchdayNumber: 4,
  matchdayLabel: 120,
  teamName: 160,
  dateTime: 35,
  venue: 240,
  broadcastChannel: 160
} as const;

const MONTH_LABELS = ["JAN", "FEV", "MAR", "ABR", "MAI", "JUN", "JUL", "AGO", "SET", "OUT", "NOV", "DEZ"];
const LISBON_TIME_ZONE = "Europe/Lisbon";

export type CalendarImportState = "A" | "B" | "C";
export type CalendarImportFormat = "canonical" | "legacy";
export type CalendarPlanAction = "create" | "update" | "keep" | "reject" | "duplicate";

export type CalendarImportRow = {
  lineNumber: number;
  matchdayNumber: number;
  matchdayLabel: string;
  homeName: string;
  awayName: string;
  scheduledDate: string | null;
  kickoffAt: string | null;
  venue: string | null;
  broadcastChannelName: string | null;
  inputState: CalendarImportState;
};

export type CalendarImportIssue = {
  lineNumber: number;
  status: "reject" | "duplicate";
  code: string;
  message: string;
  matchdayNumber: number | null;
  matchdayLabel: string;
  homeName: string;
  awayName: string;
};

export type CalendarImportParseResult = {
  rows: CalendarImportRow[];
  issues: CalendarImportIssue[];
  usefulLineCount: number;
  headerPresent: boolean;
  format: CalendarImportFormat;
  byteLength: number;
};

export type CalendarTemporalMatch = {
  scheduledDate: string | null;
  kickoffAt: string | null;
  status: string;
};

export type CalendarTemporalDecision = {
  action: "update" | "keep" | "conflict";
  reason: string;
  scheduledDate?: string;
  kickoffAt?: string | null;
};

export type CalendarPreviewChange = {
  field: "dateTime" | "venue" | "broadcastChannel";
  currentLabel: string;
  nextLabel: string;
};

export type CalendarMatchUpdatePatch = {
  scheduled_date?: string;
  kickoff_at?: string | null;
  venue?: string;
  broadcast_channel_id?: string;
};

export type CalendarExistingMatchDetails = CalendarTemporalMatch & {
  venue: string | null;
  broadcastChannelId: string | null;
  broadcastChannelName: string | null;
};

export type CalendarResolvedBroadcastChannel = {
  id: string;
  name: string;
};

export type CalendarMatchDecision = {
  action: "update" | "keep" | "conflict";
  reason: string;
  patch: CalendarMatchUpdatePatch;
  changes: CalendarPreviewChange[];
};

export type CalendarTeamLookupEntry = {
  teamId: string;
  keys: Array<string | null | undefined>;
};

export type CalendarTeamResolution =
  | { status: "resolved"; teamId: string }
  | { status: "unresolved" }
  | { status: "ambiguous"; teamIds: string[] };

export type CalendarBroadcastChannelResolution =
  | { status: "resolved"; channelId: string }
  | { status: "unresolved" }
  | { status: "ambiguous"; channelIds: string[] };

export type CalendarPreviewRow = {
  lineNumber: number;
  status: CalendarPlanAction;
  statusLabel: string;
  matchdayNumber: number | null;
  matchdayLabel: string;
  matchdayId: string | null;
  matchdayWillBeCreated: boolean;
  homeName: string;
  awayName: string;
  homeTeamId: string | null;
  awayTeamId: string | null;
  inputState: CalendarImportState | null;
  scheduledDate: string | null;
  kickoffAt: string | null;
  scheduleLabel: string;
  venue: string | null;
  broadcastChannelName: string | null;
  broadcastChannelId: string | null;
  changes: CalendarPreviewChange[];
  existingMatchId: string | null;
  note: string;
};

export type CalendarMatchdayPlan = {
  number: number;
  label: string;
  matchdayId: string | null;
  willBeCreated: boolean;
  fingerprint: string;
  createCount: number;
  updateCount: number;
  keepCount: number;
};

export type CalendarPreviewSummary = {
  activeParticipants: number;
  totalRows: number;
  distinctMatchdays: number;
  matchesToCreate: number;
  matchesToUpdate: number;
  matchesToKeep: number;
  rejectedRows: number;
  duplicateRows: number;
  unresolvedClubs: number;
  ambiguousClubs: number;
  matchdaysToCreate: number;
  gamesByMatchday: Array<{ number: number; games: number }>;
  missingMatchdayNumbers: number[];
  repeatedPairings: number;
  repeatedTeamsInMatchday: number;
};

export type CalendarPreviewResponse = {
  ok: true;
  fingerprint: string;
  rows: CalendarPreviewRow[];
  matchdays: CalendarMatchdayPlan[];
  summary: CalendarPreviewSummary;
};

export type CalendarApplyCheckpoint = {
  matchdayNumber: number;
  matchdayLabel: string;
  createdMatchday: boolean;
  createdMatches: number;
  updatedMatches: number;
  keptMatches: number;
};

export type CalendarMatchdayCheckpoint = CalendarApplyCheckpoint & {
  status: "completed" | "failed";
  message?: string;
};

export type CalendarApplicationProgress = {
  checkpoints: CalendarMatchdayCheckpoint[];
  completedMatchdays: number[];
  pendingMatchdays: number[];
  failedMatchday: number | null;
  nextMatchdayNumber: number | null;
  stopped: boolean;
};

export type CalendarApplicationClientState = {
  completedCount: number;
  pendingCount: number;
  hasPending: boolean;
  hasFailed: boolean;
  isComplete: boolean;
  canApply: boolean;
  action: "apply" | "resume" | null;
  nextMatchdayNumber: number | null;
  shouldRefreshPersistedData: boolean;
};

export type CalendarFingerprintValidation =
  | { ok: true }
  | { ok: false; error: "calendar-preview-stale"; message: string };

export type CalendarCheckpointValidation =
  | { ok: true }
  | { ok: false; error: "calendar-checkpoint-invalid"; message: string };

export type CalendarCheckpointTransition =
  | { ok: true; progress: CalendarApplicationProgress }
  | { ok: false; error: "calendar-checkpoint-invalid" | "calendar-checkpoint-stopped"; message: string };

export type CalendarApplyResponse = {
  ok: true;
  checkpoint: CalendarApplyCheckpoint;
  progress: CalendarApplicationProgress;
};

export type CalendarErrorResponse = {
  ok: false;
  error: string;
  message: string;
  checkpoint?: Partial<CalendarApplyCheckpoint>;
  progress?: CalendarApplicationProgress;
};

type CivilDateParts = {
  year: number;
  month: number;
  day: number;
};

type CivilDateTimeParts = CivilDateParts & {
  hour: number;
  minute: number;
  second: number;
};

type ParsedDateTime =
  | { ok: true; scheduledDate: string; kickoffAt: string }
  | { ok: false; code: string; message: string };

const lisbonFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: LISBON_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23"
});

function pad2(value: number) {
  return String(value).padStart(2, "0");
}

function daysInMonth(year: number, month: number) {
  if (month === 2) {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
  }

  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function isValidCivilDate({ year, month, day }: CivilDateParts) {
  return year >= 1 && year <= 9999 && month >= 1 && month <= 12 && day >= 1 && day <= daysInMonth(year, month);
}

function parseCivilDate(value: string): CivilDateParts | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return null;

  const parts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  };

  return isValidCivilDate(parts) ? parts : null;
}

function civilDateText(parts: CivilDateParts) {
  return `${String(parts.year).padStart(4, "0")}-${pad2(parts.month)}-${pad2(parts.day)}`;
}

function lisbonParts(epochMilliseconds: number): CivilDateTimeParts {
  const values = new Map(lisbonFormatter.formatToParts(new Date(epochMilliseconds)).map((part) => [part.type, part.value]));

  return {
    year: Number(values.get("year")),
    month: Number(values.get("month")),
    day: Number(values.get("day")),
    hour: Number(values.get("hour")),
    minute: Number(values.get("minute")),
    second: Number(values.get("second"))
  };
}

function sameCivilDateTime(left: CivilDateTimeParts, right: CivilDateTimeParts) {
  return (
    left.year === right.year &&
    left.month === right.month &&
    left.day === right.day &&
    left.hour === right.hour &&
    left.minute === right.minute &&
    left.second === right.second
  );
}

function civilUtcEpoch(parts: CivilDateTimeParts, millisecond = 0) {
  const date = new Date(0);
  date.setUTCFullYear(parts.year, parts.month - 1, parts.day);
  date.setUTCHours(parts.hour, parts.minute, parts.second, millisecond);
  return date.getTime();
}

function parseExplicitOffsetCalendarDateTime(value: string): ParsedDateTime | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(\.\d{1,3})?)?(Z|[+-]\d{2}:\d{2})$/.exec(value);
  if (!match) return null;

  const parts: CivilDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: Number(match[6] ?? "0")
  };
  const millisecond = Number((match[7]?.slice(1) ?? "").padEnd(3, "0") || "0");
  const offsetText = match[8];
  const offsetHours = offsetText === "Z" ? 0 : Number(offsetText.slice(1, 3));
  const offsetMinutesPart = offsetText === "Z" ? 0 : Number(offsetText.slice(4, 6));

  if (
    !isValidCivilDate(parts) ||
    parts.hour > 23 ||
    parts.minute > 59 ||
    parts.second > 59 ||
    offsetHours > 14 ||
    offsetMinutesPart > 59 ||
    (offsetHours === 14 && offsetMinutesPart !== 0)
  ) {
    return { ok: false, code: "datetime-invalid", message: "DataHora contém uma data, hora ou offset inválido." };
  }

  const signedOffsetMinutes =
    offsetText === "Z" ? 0 : (offsetText.startsWith("+") ? 1 : -1) * (offsetHours * 60 + offsetMinutesPart);
  const timestamp = civilUtcEpoch(parts, millisecond) - signedOffsetMinutes * 60_000;
  const inLisbon = lisbonParts(timestamp);
  return {
    ok: true,
    scheduledDate: civilDateText(inLisbon),
    kickoffAt: new Date(timestamp).toISOString()
  };
}

function parseCalendarDateTime(value: string): ParsedDateTime {
  const explicitOffset = parseExplicitOffsetCalendarDateTime(value);
  if (explicitOffset) return explicitOffset;

  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) {
    return {
      ok: false,
      code: "datetime-invalid",
      message: "DataHora deve usar YYYY-MM-DD, YYYY-MM-DDTHH:mm ou ISO 8601 com offset explícito."
    };
  }

  const parts: CivilDateTimeParts = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3]),
    hour: Number(match[4]),
    minute: Number(match[5]),
    second: 0
  };

  if (!isValidCivilDate(parts) || parts.hour > 23 || parts.minute > 59 || parts.second > 59) {
    return { ok: false, code: "datetime-invalid", message: "DataHora contém uma data ou hora inválida." };
  }

  const utcCivil = civilUtcEpoch(parts);
  const candidates = new Set<number>();

  for (let offsetMinutes = -14 * 60; offsetMinutes <= 14 * 60; offsetMinutes += 15) {
    const candidate = utcCivil - offsetMinutes * 60_000;
    if (sameCivilDateTime(lisbonParts(candidate), parts)) {
      candidates.add(candidate);
    }
  }

  if (candidates.size === 0) {
    return {
      ok: false,
      code: "datetime-nonexistent",
      message: "A hora local não existe em Europe/Lisbon devido à mudança para o horário de verão."
    };
  }

  if (candidates.size > 1) {
    return {
      ok: false,
      code: "datetime-ambiguous",
      message: "A hora local é ambígua em Europe/Lisbon e não pode ser importada nesta gramática."
    };
  }

  const timestamp = Array.from(candidates)[0];
  const inLisbon = lisbonParts(timestamp);
  return {
    ok: true,
    scheduledDate: civilDateText(inLisbon),
    kickoffAt: new Date(timestamp).toISOString()
  };
}

export function calendarImportByteLength(value: string) {
  let bytes = 0;
  for (const character of value) {
    const codePoint = character.codePointAt(0) ?? 0;
    bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
  }
  return bytes;
}

export function normalizeCalendarTeamKey(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export function normalizeCalendarChannelKey(value: string) {
  return normalizeCalendarTeamKey(value);
}

export function buildCalendarBroadcastChannelLookup(channels: readonly CalendarResolvedBroadcastChannel[]) {
  const index = new Map<string, Set<string>>();
  channels.forEach((channel) => {
    const key = normalizeCalendarChannelKey(channel.name);
    if (!key) return;
    const channelIds = index.get(key) ?? new Set<string>();
    channelIds.add(channel.id);
    index.set(key, channelIds);
  });
  return index;
}

export function resolveCalendarBroadcastChannel(
  index: Map<string, Set<string>>,
  value: string
): CalendarBroadcastChannelResolution {
  const channelIds = Array.from(index.get(normalizeCalendarChannelKey(value)) ?? []).sort();
  if (channelIds.length === 0) return { status: "unresolved" };
  if (channelIds.length > 1) return { status: "ambiguous", channelIds };
  return { status: "resolved", channelId: channelIds[0] };
}

export function buildCalendarTeamLookup(entries: CalendarTeamLookupEntry[]) {
  const index = new Map<string, Set<string>>();
  entries.forEach((entry) => {
    entry.keys.forEach((value) => {
      const key = value ? normalizeCalendarTeamKey(value) : "";
      if (!key) return;
      const teamIds = index.get(key) ?? new Set<string>();
      teamIds.add(entry.teamId);
      index.set(key, teamIds);
    });
  });
  return index;
}

export function resolveCalendarTeam(index: Map<string, Set<string>>, value: string): CalendarTeamResolution {
  const teamIds = Array.from(index.get(normalizeCalendarTeamKey(value)) ?? []).sort();
  if (teamIds.length === 0) return { status: "unresolved" };
  if (teamIds.length > 1) return { status: "ambiguous", teamIds };
  return { status: "resolved", teamId: teamIds[0] };
}

function issue(
  lineNumber: number,
  code: string,
  message: string,
  fields: string[],
  status: "reject" | "duplicate" = "reject"
): CalendarImportIssue {
  const numberValue = fields[0] ?? "";
  const parsedNumber = /^\d+$/.test(numberValue) ? Number(numberValue) : null;
  return {
    lineNumber,
    status,
    code,
    message,
    matchdayNumber: parsedNumber,
    matchdayLabel: fields[1] ?? "",
    homeName: fields[2] ?? "",
    awayName: fields[3] ?? ""
  };
}

export function parseCalendarImport(rawList: string): CalendarImportParseResult {
  const byteLength = calendarImportByteLength(rawList);
  const rows: CalendarImportRow[] = [];
  const issues: CalendarImportIssue[] = [];
  const usefulLines = rawList
    .split(/\r?\n/)
    .map((line, index) => ({ line: line.trim(), lineNumber: index + 1 }))
    .filter((item) => item.line.length > 0);
  const firstFields = usefulLines[0]?.line.split(";").map((value) => value.trim()) ?? [];
  const canonicalHeaderPresent = usefulLines[0]?.line === CALENDAR_IMPORT_HEADER;
  const legacyHeaderPresent = usefulLines[0]?.line === CALENDAR_IMPORT_LEGACY_HEADER;
  const headerPresent = canonicalHeaderPresent || legacyHeaderPresent;
  const looksLikeHeader = firstFields[0] === "Jornada";
  const invalidHeader = !headerPresent && (looksLikeHeader || firstFields.length === 7);
  const format: CalendarImportFormat = canonicalHeaderPresent || firstFields.length === 7 ? "canonical" : "legacy";
  const dataLines = headerPresent || looksLikeHeader ? usefulLines.slice(1) : usefulLines;

  if (byteLength > CALENDAR_IMPORT_MAX_BYTES) {
    issues.push(issue(0, "input-too-large", `A lista excede o limite de ${CALENDAR_IMPORT_MAX_BYTES} bytes.`, []));
    return { rows, issues, usefulLineCount: dataLines.length, headerPresent, format, byteLength };
  }

  if (dataLines.length > CALENDAR_IMPORT_MAX_LINES) {
    issues.push(issue(0, "too-many-lines", `A lista excede o limite de ${CALENDAR_IMPORT_MAX_LINES} linhas úteis.`, []));
    return { rows, issues, usefulLineCount: dataLines.length, headerPresent, format, byteLength };
  }

  if (invalidHeader) {
    const seventhColumnError = firstFields.length === 7 && firstFields.slice(0, 6).join(";") === CALENDAR_IMPORT_HEADER.split(";").slice(0, 6).join(";");
    issues.push(
      issue(
        usefulLines[0]?.lineNumber ?? 1,
        "header-invalid",
        seventhColumnError
          ? "Cabeçalho inválido: a sétima coluna deve chamar-se exatamente CanalTV."
          : `Cabeçalho inválido. Use exatamente ${CALENDAR_IMPORT_HEADER}.`,
        firstFields
      )
    );
    return { rows, issues, usefulLineCount: dataLines.length, headerPresent: false, format, byteLength };
  }

  if (dataLines.length === 0) {
    issues.push(issue(0, "empty-input", "A lista não contém jogos.", []));
    return { rows, issues, usefulLineCount: 0, headerPresent, format, byteLength };
  }

  const seenRawIdentities = new Set<string>();

  for (const { line, lineNumber } of dataLines) {
    const fields = line.split(";").map((value) => value.trim());
    const validColumnCount = format === "canonical" ? fields.length === 7 : fields.length === 5 || fields.length === 6;
    if (!validColumnCount) {
      issues.push(
        issue(
          lineNumber,
          "column-count-invalid",
          format === "canonical"
            ? "Cada linha do formato canónico deve conter exatamente sete colunas separadas por ponto e vírgula."
            : "Cada linha legacy deve conter cinco ou seis colunas separadas por ponto e vírgula.",
          fields
        )
      );
      continue;
    }

    const [numberValue, labelValue, homeValue, awayValue, dateTimeValue, venueValue = "", broadcastChannelValue = ""] = fields;
    if (
      numberValue.length > FIELD_LIMITS.matchdayNumber ||
      labelValue.length > FIELD_LIMITS.matchdayLabel ||
      homeValue.length > FIELD_LIMITS.teamName ||
      awayValue.length > FIELD_LIMITS.teamName ||
      dateTimeValue.length > FIELD_LIMITS.dateTime ||
      venueValue.length > FIELD_LIMITS.venue ||
      broadcastChannelValue.length > FIELD_LIMITS.broadcastChannel
    ) {
      issues.push(issue(lineNumber, "field-too-long", "Um ou mais campos excedem o comprimento permitido.", fields));
      continue;
    }

    if (!/^[1-9]\d*$/.test(numberValue)) {
      issues.push(issue(lineNumber, "matchday-invalid", "A jornada deve ser um número inteiro positivo sem sufixos.", fields));
      continue;
    }

    const matchdayNumber = Number(numberValue);
    const matchdayLabel = labelValue || `Jornada ${String(matchdayNumber).padStart(2, "0")}`;
    if (!homeValue || !awayValue) {
      issues.push(issue(lineNumber, "team-empty", "Casa e Fora são obrigatórios.", fields));
      continue;
    }

    const normalizedHome = normalizeCalendarTeamKey(homeValue);
    const normalizedAway = normalizeCalendarTeamKey(awayValue);
    if (!normalizedHome || !normalizedAway || normalizedHome === normalizedAway) {
      issues.push(issue(lineNumber, "same-team", "Casa e Fora não podem representar o mesmo clube.", fields));
      continue;
    }

    const rawIdentity = `${matchdayNumber}:${normalizedHome}:${normalizedAway}`;
    if (seenRawIdentities.has(rawIdentity)) {
      issues.push(issue(lineNumber, "duplicate-row", "O mesmo emparelhamento aparece mais do que uma vez nesta jornada.", fields, "duplicate"));
      continue;
    }
    seenRawIdentities.add(rawIdentity);

    let inputState: CalendarImportState;
    let scheduledDate: string | null;
    let kickoffAt: string | null;

    if (!dateTimeValue) {
      inputState = "C";
      scheduledDate = null;
      kickoffAt = null;
    } else {
      const civilDate = parseCivilDate(dateTimeValue);
      if (civilDate) {
        inputState = "B";
        scheduledDate = civilDateText(civilDate);
        kickoffAt = null;
      } else {
        if (/^\d{1,2}:\d{2}$/.test(dateTimeValue)) {
          issues.push(issue(lineNumber, "time-without-date", "Uma hora sem data não é aceite.", fields));
          continue;
        }

        const parsedDateTime = parseCalendarDateTime(dateTimeValue);
        if (!parsedDateTime.ok) {
          issues.push(issue(lineNumber, parsedDateTime.code, parsedDateTime.message, fields));
          continue;
        }

        inputState = "A";
        scheduledDate = parsedDateTime.scheduledDate;
        kickoffAt = parsedDateTime.kickoffAt;
      }
    }

    rows.push({
      lineNumber,
      matchdayNumber,
      matchdayLabel,
      homeName: homeValue,
      awayName: awayValue,
      scheduledDate,
      kickoffAt,
      venue: venueValue || null,
      broadcastChannelName: broadcastChannelValue || null,
      inputState
    });
  }

  return { rows, issues, usefulLineCount: dataLines.length, headerPresent, format, byteLength };
}

export function formatCalendarPreviewDate(
  scheduledDate: string | null,
  kickoffAt: string | null,
  matchdayNumber: number
) {
  if (!scheduledDate) return `J${matchdayNumber} · DATA E HORA POR DEFINIR`;

  const civil = parseCivilDate(scheduledDate);
  if (!civil) return `J${matchdayNumber} · DATA E HORA POR DEFINIR`;
  const dateLabel = `${pad2(civil.day)} ${MONTH_LABELS[civil.month - 1]}`;
  if (!kickoffAt) return `${dateLabel} · HORA POR DEFINIR`;

  const timestamp = Date.parse(kickoffAt);
  if (!Number.isFinite(timestamp)) return `${dateLabel} · HORA POR DEFINIR`;
  const parts = lisbonParts(timestamp);
  return `${dateLabel} · ${pad2(parts.hour)}:${pad2(parts.minute)}`;
}

export function createCompetitiveIdentity(seasonId: string, matchdayId: string, homeTeamId: string, awayTeamId: string) {
  return `${seasonId}:${matchdayId}:${homeTeamId}:${awayTeamId}`;
}

export type CalendarResolvedCompetitiveIdentity = {
  lineNumber: number;
  seasonId: string;
  matchdayId: string;
  homeTeamId: string;
  awayTeamId: string;
};

export type CalendarCompetitiveDuplicate = {
  identity: string;
  firstLineNumber: number;
  duplicateLineNumber: number;
};

export function findCalendarCompetitiveDuplicate(
  existing: readonly CalendarResolvedCompetitiveIdentity[],
  candidate: CalendarResolvedCompetitiveIdentity
): CalendarCompetitiveDuplicate | null {
  const identity = createCompetitiveIdentity(
    candidate.seasonId,
    candidate.matchdayId,
    candidate.homeTeamId,
    candidate.awayTeamId
  );
  const first = existing.find(
    (item) =>
      createCompetitiveIdentity(item.seasonId, item.matchdayId, item.homeTeamId, item.awayTeamId) === identity
  );
  return first
    ? { identity, firstLineNumber: first.lineNumber, duplicateLineNumber: candidate.lineNumber }
    : null;
}

export function createCalendarSourceKey(seasonId: string, matchdayId: string, homeTeamId: string, awayTeamId: string) {
  return `manual-calendar:v1:${seasonId}:${matchdayId}:${homeTeamId}:${awayTeamId}`;
}

function sameInstant(left: string | null, right: string | null) {
  if (left === null || right === null) return left === right;
  const leftTimestamp = Date.parse(left);
  const rightTimestamp = Date.parse(right);
  return Number.isFinite(leftTimestamp) && Number.isFinite(rightTimestamp) && leftTimestamp === rightTimestamp;
}

function sameTemporalValues(existing: CalendarTemporalMatch, incoming: CalendarImportRow) {
  return existing.scheduledDate === incoming.scheduledDate && sameInstant(existing.kickoffAt, incoming.kickoffAt);
}

export function decideCalendarTemporalAction(
  existing: CalendarTemporalMatch,
  incoming: CalendarImportRow
): CalendarTemporalDecision {
  if (incoming.inputState === "C") {
    return { action: "keep", reason: "Uma linha sem data e hora não apaga informação existente." };
  }

  if (incoming.inputState === "A") {
    if (sameTemporalValues(existing, incoming)) {
      return { action: "keep", reason: "Data e hora já coincidem." };
    }
    if (existing.status !== "scheduled") {
      return { action: "conflict", reason: `O jogo está ${existing.status}; dados temporais divergentes exigem ação manual.` };
    }
    return {
      action: "update",
      reason: "Data e hora explicitamente fornecidas serão atualizadas.",
      scheduledDate: incoming.scheduledDate ?? undefined,
      kickoffAt: incoming.kickoffAt
    };
  }

  if (existing.kickoffAt) {
    return existing.scheduledDate === incoming.scheduledDate
      ? { action: "keep", reason: "A hora confirmada existente será preservada." }
      : { action: "conflict", reason: "A nova data diverge de um jogo com hora confirmada." };
  }

  if (existing.scheduledDate === incoming.scheduledDate) {
    return { action: "keep", reason: "A data já coincide e a hora continua por definir." };
  }
  if (existing.status !== "scheduled") {
    return { action: "conflict", reason: `O jogo está ${existing.status}; dados temporais divergentes exigem ação manual.` };
  }
  return {
    action: "update",
    reason: "A data será atualizada e a hora continuará por definir.",
    scheduledDate: incoming.scheduledDate ?? undefined,
    kickoffAt: null
  };
}

export type CalendarTemporalUpdatePatch = {
  scheduled_date: string;
  kickoff_at: string | null;
};

export function createCalendarTemporalUpdatePatch(
  incoming: Pick<CalendarImportRow, "scheduledDate" | "kickoffAt">
): CalendarTemporalUpdatePatch | null {
  if (!incoming.scheduledDate) return null;
  return {
    scheduled_date: incoming.scheduledDate,
    kickoff_at: incoming.kickoffAt
  };
}

export function decideCalendarMatchAction(
  existing: CalendarExistingMatchDetails,
  incoming: CalendarImportRow,
  resolvedBroadcastChannel: CalendarResolvedBroadcastChannel | null
): CalendarMatchDecision {
  const temporal = decideCalendarTemporalAction(existing, incoming);
  if (temporal.action === "conflict") {
    return { action: "conflict", reason: temporal.reason, patch: {}, changes: [] };
  }

  const patch: CalendarMatchUpdatePatch = {};
  const changes: CalendarPreviewChange[] = [];
  if (temporal.action === "update") {
    Object.assign(patch, createCalendarTemporalUpdatePatch(incoming) ?? {});
    changes.push({
      field: "dateTime",
      currentLabel: formatCalendarPreviewDate(existing.scheduledDate, existing.kickoffAt, incoming.matchdayNumber),
      nextLabel: formatCalendarPreviewDate(incoming.scheduledDate, incoming.kickoffAt, incoming.matchdayNumber)
    });
  }

  if (incoming.venue !== null && existing.venue !== incoming.venue) {
    patch.venue = incoming.venue;
    changes.push({
      field: "venue",
      currentLabel: existing.venue ?? "Sem estádio",
      nextLabel: incoming.venue
    });
  }

  if (incoming.broadcastChannelName !== null) {
    if (!resolvedBroadcastChannel) {
      return { action: "conflict", reason: "CanalTV preenchido sem resolução válida no catálogo.", patch: {}, changes: [] };
    }
    if (existing.broadcastChannelId !== resolvedBroadcastChannel.id) {
      patch.broadcast_channel_id = resolvedBroadcastChannel.id;
      changes.push({
        field: "broadcastChannel",
        currentLabel: existing.broadcastChannelName ?? "Sem canal",
        nextLabel: resolvedBroadcastChannel.name
      });
    }
  }

  if (changes.length === 0) {
    return {
      action: "keep",
      reason: "Os valores fornecidos já coincidem com os atuais; células vazias preservam os restantes campos.",
      patch,
      changes
    };
  }

  const labels = changes.map((change) =>
    change.field === "dateTime" ? "DataHora" : change.field === "venue" ? "Estádio" : "CanalTV"
  );
  return {
    action: "update",
    reason: `Serão atualizados: ${labels.join(", ")}.`,
    patch,
    changes
  };
}

export function applyCalendarTemporalUpdatePatch<
  T extends Record<string, unknown> & { scheduled_date: string | null; kickoff_at: string | null }
>(existing: T, patch: CalendarTemporalUpdatePatch | null) {
  return {
    ...existing,
    ...(patch ?? {})
  } as Omit<T, "scheduled_date" | "kickoff_at"> & {
    scheduled_date: string | null;
    kickoff_at: string | null;
  };
}

export function compareCalendarImportRows(left: CalendarImportRow, right: CalendarImportRow) {
  if (left.matchdayNumber !== right.matchdayNumber) return left.matchdayNumber - right.matchdayNumber;
  if (left.scheduledDate === null && right.scheduledDate !== null) return 1;
  if (left.scheduledDate !== null && right.scheduledDate === null) return -1;
  if (left.scheduledDate !== right.scheduledDate) return (left.scheduledDate ?? "").localeCompare(right.scheduledDate ?? "");
  if (left.kickoffAt === null && right.kickoffAt !== null) return 1;
  if (left.kickoffAt !== null && right.kickoffAt === null) return -1;
  if (left.kickoffAt !== right.kickoffAt) return (left.kickoffAt ?? "").localeCompare(right.kickoffAt ?? "");
  return left.lineNumber - right.lineNumber;
}

export type CalendarMatchdayActionItem = {
  matchdayNumber: number;
  lineNumber: number;
};

export function groupCalendarActionsByMatchday<T extends CalendarMatchdayActionItem>(items: readonly T[]) {
  const grouped = new Map<number, T[]>();
  items.forEach((item) => {
    const matchdayItems = grouped.get(item.matchdayNumber) ?? [];
    matchdayItems.push(item);
    grouped.set(item.matchdayNumber, matchdayItems);
  });

  return Array.from(grouped.entries())
    .sort(([left], [right]) => left - right)
    .map(([matchdayNumber, matchdayItems]) => ({
      matchdayNumber,
      items: [...matchdayItems].sort((left, right) => left.lineNumber - right.lineNumber)
    }));
}

function orderedMatchdays(matchdays: readonly Pick<CalendarMatchdayPlan, "number">[]) {
  return Array.from(new Map(matchdays.map((matchday) => [matchday.number, matchday])).values()).sort(
    (left, right) => left.number - right.number
  );
}

function orderedCheckpoints(checkpoints: readonly CalendarMatchdayCheckpoint[]) {
  return [...checkpoints].sort((left, right) => left.matchdayNumber - right.matchdayNumber);
}

export function validateCalendarFingerprint(
  expectedFingerprint: string,
  recalculatedFingerprint: string
): CalendarFingerprintValidation {
  if (expectedFingerprint && expectedFingerprint === recalculatedFingerprint) return { ok: true };
  return {
    ok: false,
    error: "calendar-preview-stale",
    message: "O contexto mudou desde o preview; atualiza o preview antes de retomar."
  };
}

export function validateCalendarCheckpointSequence(
  matchdays: readonly Pick<CalendarMatchdayPlan, "number">[],
  checkpoints: readonly CalendarMatchdayCheckpoint[]
): CalendarCheckpointValidation {
  const plans = orderedMatchdays(matchdays);
  const planNumbers = new Set(plans.map((matchday) => matchday.number));
  const seen = new Set<number>();

  for (const checkpoint of checkpoints) {
    if (seen.has(checkpoint.matchdayNumber)) {
      return { ok: false, error: "calendar-checkpoint-invalid", message: "Existem checkpoints duplicados para a mesma jornada." };
    }
    if (!planNumbers.has(checkpoint.matchdayNumber)) {
      return { ok: false, error: "calendar-checkpoint-invalid", message: "Um checkpoint não pertence ao plano atual." };
    }
    seen.add(checkpoint.matchdayNumber);
  }

  const byNumber = new Map(checkpoints.map((checkpoint) => [checkpoint.matchdayNumber, checkpoint]));
  let phase: "completed" | "pending" | "failed" = "completed";
  for (const matchday of plans) {
    const checkpoint = byNumber.get(matchday.number);
    if (!checkpoint) {
      if (phase === "completed") phase = "pending";
      continue;
    }
    if (checkpoint.status === "completed") {
      if (phase !== "completed") {
        return {
          ok: false,
          error: "calendar-checkpoint-invalid",
          message: "As jornadas concluídas devem formar um prefixo contínuo do plano."
        };
      }
      continue;
    }
    if (phase !== "completed") {
      return {
        ok: false,
        error: "calendar-checkpoint-invalid",
        message: "Só pode existir uma primeira jornada falhada imediatamente após as concluídas."
      };
    }
    phase = "failed";
  }

  return { ok: true };
}

export function getPendingCalendarMatchdays<T extends Pick<CalendarMatchdayPlan, "number">>(
  matchdays: readonly T[],
  checkpoints: readonly CalendarMatchdayCheckpoint[]
) {
  const completed = new Set(
    checkpoints.filter((checkpoint) => checkpoint.status === "completed").map((checkpoint) => checkpoint.matchdayNumber)
  );
  return orderedMatchdays(matchdays).filter((matchday) => !completed.has(matchday.number)) as T[];
}

export function prepareCalendarCheckpointsForResume(checkpoints: readonly CalendarMatchdayCheckpoint[]) {
  return orderedCheckpoints(checkpoints.filter((checkpoint) => checkpoint.status === "completed"));
}

export function getFirstFailedCalendarCheckpoint(checkpoints: readonly CalendarMatchdayCheckpoint[]) {
  return orderedCheckpoints(checkpoints).find((checkpoint) => checkpoint.status === "failed") ?? null;
}

export function shouldStopCalendarApplication(checkpoints: readonly CalendarMatchdayCheckpoint[]) {
  return getFirstFailedCalendarCheckpoint(checkpoints) !== null;
}

export function getNextCalendarMatchday<T extends Pick<CalendarMatchdayPlan, "number">>(
  matchdays: readonly T[],
  checkpoints: readonly CalendarMatchdayCheckpoint[]
) {
  if (!validateCalendarCheckpointSequence(matchdays, checkpoints).ok || shouldStopCalendarApplication(checkpoints)) return null;
  return getPendingCalendarMatchdays(matchdays, checkpoints)[0] ?? null;
}

export function buildCalendarApplicationProgress(
  matchdays: readonly Pick<CalendarMatchdayPlan, "number">[],
  checkpoints: readonly CalendarMatchdayCheckpoint[]
): CalendarApplicationProgress {
  const ordered = orderedCheckpoints(checkpoints);
  const completedMatchdays = ordered
    .filter((checkpoint) => checkpoint.status === "completed")
    .map((checkpoint) => checkpoint.matchdayNumber);
  const pendingMatchdays = getPendingCalendarMatchdays(matchdays, checkpoints).map((matchday) => matchday.number);
  const failed = getFirstFailedCalendarCheckpoint(checkpoints);
  const next = failed ? null : getNextCalendarMatchday(matchdays, checkpoints);
  return {
    checkpoints: ordered,
    completedMatchdays,
    pendingMatchdays,
    failedMatchday: failed?.matchdayNumber ?? null,
    nextMatchdayNumber: next?.number ?? null,
    stopped: failed !== null
  };
}

export function buildCalendarApplicationClientState(
  matchdays: readonly Pick<CalendarMatchdayPlan, "number">[],
  checkpoints: readonly CalendarMatchdayCheckpoint[]
): CalendarApplicationClientState {
  const progress = buildCalendarApplicationProgress(matchdays, checkpoints);
  const completedCount = progress.completedMatchdays.length;
  const pendingCount = progress.pendingMatchdays.length;
  const hasPending = pendingCount > 0;
  const hasFailed = progress.failedMatchday !== null;
  const isComplete = matchdays.length > 0 && !hasPending && !hasFailed;
  const canApply = hasPending && !hasFailed;

  return {
    completedCount,
    pendingCount,
    hasPending,
    hasFailed,
    isComplete,
    canApply,
    action: canApply ? (completedCount > 0 ? "resume" : "apply") : null,
    nextMatchdayNumber: progress.nextMatchdayNumber,
    shouldRefreshPersistedData: isComplete || (hasFailed && completedCount > 0)
  };
}

export function applyCalendarCheckpointTransition(
  matchdays: readonly Pick<CalendarMatchdayPlan, "number">[],
  checkpoints: readonly CalendarMatchdayCheckpoint[],
  nextCheckpoint: CalendarMatchdayCheckpoint
): CalendarCheckpointTransition {
  const validation = validateCalendarCheckpointSequence(matchdays, checkpoints);
  if (!validation.ok) return validation;

  const existing = checkpoints.find((checkpoint) => checkpoint.matchdayNumber === nextCheckpoint.matchdayNumber);
  if (existing?.status === "completed" && nextCheckpoint.status === "completed") {
    return { ok: true, progress: buildCalendarApplicationProgress(matchdays, checkpoints) };
  }
  if (shouldStopCalendarApplication(checkpoints)) {
    return {
      ok: false,
      error: "calendar-checkpoint-stopped",
      message: "A aplicação está parada no primeiro checkpoint falhado; atualiza o preview antes de retomar."
    };
  }

  const expected = getNextCalendarMatchday(matchdays, checkpoints);
  if (!expected || expected.number !== nextCheckpoint.matchdayNumber) {
    return {
      ok: false,
      error: "calendar-checkpoint-invalid",
      message: "O checkpoint não corresponde à próxima jornada aplicável."
    };
  }

  const nextCheckpoints = [...checkpoints, nextCheckpoint];
  const nextValidation = validateCalendarCheckpointSequence(matchdays, nextCheckpoints);
  if (!nextValidation.ok) return nextValidation;
  return { ok: true, progress: buildCalendarApplicationProgress(matchdays, nextCheckpoints) };
}

function stableSerialize(value: unknown): string {
  if (value === null) return "null";
  if (typeof value === "string" || typeof value === "boolean") return JSON.stringify(value);
  if (typeof value === "number") return Number.isFinite(value) ? JSON.stringify(value) : "null";
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`)
      .join(",")}}`;
  }
  return JSON.stringify(String(value));
}

export function createCalendarFingerprint(value: unknown) {
  const serialized = stableSerialize(value);
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;

  for (let index = 0; index < serialized.length; index += 1) {
    const code = serialized.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x85ebca6b) >>> 0;
  }

  return `${first.toString(16).padStart(8, "0")}${second.toString(16).padStart(8, "0")}`;
}
