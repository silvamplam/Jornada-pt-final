import { load } from "cheerio";

export type MatchdayAgendaTvSourceMatch = Readonly<{
  home: string;
  away: string;
  date: string;
  time: string;
  channel: string;
  sourceUrl: string;
}>;

const TEAM_ALIASES = new Map<string, string>([
  ["rio ave fc", "rio ave"],
  ["rio ave", "rio ave"],
  ["sporting cp", "sporting"],
  ["sporting clube de portugal", "sporting"],
  ["sporting", "sporting"],
  ["fc alverca", "alverca"],
  ["alverca", "alverca"],
  ["fc arouca", "arouca"],
  ["arouca", "arouca"],
  ["maritimo m", "maritimo"],
  ["maritimo", "maritimo"],
  ["academico de viseu", "academico"],
  ["academico viseu", "academico"],
  ["academico", "academico"],
  ["fc porto", "porto"],
  ["porto", "porto"],
  ["cd nacional", "nacional"],
  ["nacional", "nacional"],
  ["est amadora", "estrela amadora"],
  ["estrela amadora", "estrela amadora"],
  ["estrela da amadora", "estrela amadora"],
  ["casa pia ac", "casa pia"],
  ["casa pia", "casa pia"],
  ["moreirense fc", "moreirense"],
  ["moreirense", "moreirense"],
  ["fc famalicao", "famalicao"],
  ["famalicao", "famalicao"],
  ["gil vicente fc", "gil vicente"],
  ["gil vicente", "gil vicente"],
  ["sl benfica", "benfica"],
  ["benfica", "benfica"],
  ["estoril praia", "estoril"],
  ["estoril", "estoril"],
  ["sc braga", "braga"],
  ["braga", "braga"],
  ["vitoria sc", "vitoria sc"],
  ["vitoria guimaraes", "vitoria sc"],
]);

export function normalizeAgendaTvText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/\u00a0/g, " ")
    .replace(/[^a-z0-9+]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function canonicalAgendaTeamKey(value: string) {
  const normalized = normalizeAgendaTvText(value);
  return TEAM_ALIASES.get(normalized) ?? normalized;
}

export function canonicalAgendaChannelKey(value: string) {
  return normalizeAgendaTvText(value)
    .replace(/\+/g, " plus ")
    .replace(/[^a-z0-9]+/g, "");
}

function looksLikeTvChannel(value: string) {
  const key = canonicalAgendaChannelKey(value);

  return /^(?:sporttv(?:plus|\d+)?|btv|canal11|portocanal|sportingtv|dazn\d+|rtp\d+|tvi)$/.test(
    key,
  );
}

function cleanCellText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueTexts(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanCellText(value);
    const key = normalizeAgendaTvText(cleaned);

    if (!cleaned || !key || seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

type ParsedDate = Readonly<{
  day: number;
  month: number;
  year: number | null;
}>;

function parseExactDateCell(value: string): ParsedDate | null {
  const text = cleanCellText(value);

  const iso = /^(20\d{2})-(\d{1,2})-(\d{1,2})$/.exec(text);

  if (iso) {
    return {
      year: Number(iso[1]),
      month: Number(iso[2]),
      day: Number(iso[3]),
    };
  }

  const short = /^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/.exec(text);

  if (!short) return null;

  const day = Number(short[1]);
  const month = Number(short[2]);

  if (day < 1 || day > 31 || month < 1 || month > 12) {
    return null;
  }

  const rawYear = short[3] ? Number(short[3]) : null;

  return {
    day,
    month,
    year:
      rawYear === null
        ? null
        : rawYear < 100
          ? 2000 + rawYear
          : rawYear,
  };
}

function yearForSeasonMonth(month: number, seasonStartsOn: string) {
  const startYear = Number(seasonStartsOn.slice(0, 4));
  const startMonth = Number(seasonStartsOn.slice(5, 7));

  if (!Number.isFinite(startYear) || !Number.isFinite(startMonth)) {
    throw new Error("invalid-season-start");
  }

  return month >= startMonth ? startYear : startYear + 1;
}

function toDateString(parsed: ParsedDate, seasonStartsOn: string) {
  const year =
    parsed.year
    ?? yearForSeasonMonth(parsed.month, seasonStartsOn);

  return [
    String(year).padStart(4, "0"),
    String(parsed.month).padStart(2, "0"),
    String(parsed.day).padStart(2, "0"),
  ].join("-");
}

function parseExactTimeCell(value: string) {
  const text = cleanCellText(value);
  const match = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(text);

  if (!match) return null;

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function parseZerozeroAgendaHtml(
  html: string,
  input: Readonly<{
    sourceUrl: string;
    seasonStartsOn: string;
  }>,
): MatchdayAgendaTvSourceMatch[] {
  const $ = load(html);
  const result: MatchdayAgendaTvSourceMatch[] = [];
  const seen = new Set<string>();

  let currentDate: string | null = null;

  for (const element of $("tr").toArray()) {
    const row = $(element);

    const cells = row
      .find("td,th")
      .map((_index, cell) => cleanCellText($(cell).text()))
      .get();

    for (const cell of cells) {
      const parsedDate = parseExactDateCell(cell);

      if (parsedDate) {
        currentDate = toDateString(
          parsedDate,
          input.seasonStartsOn,
        );
        break;
      }
    }

    if (!currentDate) continue;

    const time =
      cells
        .map(parseExactTimeCell)
        .find((value): value is string => value !== null)
      ?? null;

    if (!time) continue;

    const teams = uniqueTexts(
      row
        .find('a[href*="/equipa/"]')
        .map((_index, anchor) => $(anchor).text())
        .get(),
    ).filter((value) => !looksLikeTvChannel(value));

    if (teams.length < 2) continue;

    const channelCandidates = uniqueTexts([
      ...row
        .find("img[alt]")
        .map((_index, image) => $(image).attr("alt") ?? "")
        .get(),
      ...row
        .find("[title]")
        .map((_index, titled) => $(titled).attr("title") ?? "")
        .get(),
    ]);

    const channel =
      channelCandidates.find(looksLikeTvChannel)
      ?? null;

    if (!channel) continue;

    const home = teams[0];
    const away = teams[1];

    const key = [
      canonicalAgendaTeamKey(home),
      canonicalAgendaTeamKey(away),
      currentDate,
      time,
      canonicalAgendaChannelKey(channel),
    ].join("|");

    if (seen.has(key)) continue;
    seen.add(key);

    result.push({
      home,
      away,
      date: currentDate,
      time,
      channel,
      sourceUrl: input.sourceUrl,
    });
  }

  return result;
}

export function agendaSourceMatchesTeams(
  source: MatchdayAgendaTvSourceMatch,
  homeNames: readonly string[],
  awayNames: readonly string[],
) {
  const sourceHome = canonicalAgendaTeamKey(source.home);
  const sourceAway = canonicalAgendaTeamKey(source.away);

  return (
    homeNames.some(
      (value) => canonicalAgendaTeamKey(value) === sourceHome,
    )
    && awayNames.some(
      (value) => canonicalAgendaTeamKey(value) === sourceAway,
    )
  );
}

export function zerozeroPageHasContext(
  html: string,
  input: Readonly<{
    matchdayNumber: number;
    seasonLabel: string;
  }>,
) {
  const $ = load(html);
  const text = normalizeAgendaTvText($.root().text());
  const season = normalizeAgendaTvText(input.seasonLabel);
  const matchdayNumber = String(input.matchdayNumber);
  const selectedMatchday = $(
    'select[name="jornada_in"] option[selected], select[name="jornada"] option[selected]',
  ).toArray().some((option) => {
    const value = ($(option).attr("value") ?? "").trim();
    const label = normalizeAgendaTvText($(option).text());

    return (
      value === matchdayNumber
      || label === `jornada ${matchdayNumber}`
    );
  });
  const inputMatchday = $(
    'input[name="jornada_in"], input[name="jornada"]',
  ).toArray().some((inputElement) => (
    ($(inputElement).attr("value") ?? "").trim() === matchdayNumber
  ));
  const headingMatchday = new RegExp(
    `\\bjornada\\s+${input.matchdayNumber}\\b`,
  ).test(text);

  return (
    text.includes(season)
    && (selectedMatchday || inputMatchday || headingMatchday)
  );
}

export function resolveZerozeroMatchdayUrl(
  html: string,
  matchdayNumber: number,
  baseUrl: string,
) {
  const $ = load(html);

  const selectedPhase =
    $('select[name="fase"] option[selected]')
      .first()
      .attr("value")
    ?? $('input[name="fase"]').first().attr("value")
    ?? null;

  const linkedPhase =
    /[?&]fase=(\d+)/.exec(html)?.[1]
    ?? null;

  const phase =
    selectedPhase && /^\d+$/.test(selectedPhase)
      ? selectedPhase
      : linkedPhase;

  const target = new URL(baseUrl);

  target.searchParams.set(
    "jornada_in",
    String(matchdayNumber),
  );
  target.searchParams.set("v", "tt1");

  if (phase) {
    target.searchParams.set("fase", phase);
  }

  return target.toString();
}

function portugalOffsetForDate(date: string) {
  const probe = new Date(`${date}T12:00:00Z`);

  if (Number.isNaN(probe.getTime())) {
    throw new Error("invalid-kickoff-date");
  }

  const zoneName =
    new Intl.DateTimeFormat("en-US", {
      timeZone: "Europe/Lisbon",
      timeZoneName: "longOffset",
      hour: "2-digit",
    })
      .formatToParts(probe)
      .find((part) => part.type === "timeZoneName")
      ?.value
    ?? null;

  if (zoneName === "GMT") return "+00:00";

  const match =
    zoneName
      ? /^GMT([+-])(\d{1,2})(?::(\d{2}))?$/.exec(
          zoneName,
        )
      : null;

  if (!match) {
    throw new Error("unsupported-portugal-offset");
  }

  return `${match[1]}${String(Number(match[2])).padStart(2, "0")}:${match[3] ?? "00"}`;
}

export function buildPortugalKickoffAt(
  date: string,
  time: string,
) {
  return `${date}T${time}:00${portugalOffsetForDate(date)}`;
}

export type AgendaTvLifecycleMatch = Readonly<{
  id: string;
  status: string | null;
  minute?: number | null;
  live_started_at?: string | null;
  live_base_minute?: number | null;
  is_clock_running?: boolean | null;
  home_score?: number | null;
  away_score?: number | null;
  scheduled_date: string | null;
  kickoff_at: string | null;
  broadcast_channel_id: string | null;
}>;

export type AgendaTvMatchPolicy =
  | "scheduled"
  | "postponed"
  | "preserve";

export type AgendaTvScheduleDecision =
  | Readonly<{
      status: "ok";
      date: string;
      time: string;
      sourceLabel: string;
    }>
  | Readonly<{
      status: "conflict";
      sourceLabel: string;
    }>
  | Readonly<{
      status: "not_found";
    }>;

export type AgendaTvChannelDecision = Readonly<{
  channelId: string | null;
  channelName: string | null;
  sourceLabel: string | null;
  reportedChannel: string | null;
}>;

export type AgendaTvPreviewStatus =
  | "update"
  | "unchanged"
  | "source_not_found"
  | "source_conflict"
  | "channel_not_found";

export type AgendaTvPreviewRow = Readonly<{
  matchId: string;
  label: string;
  preserve: boolean;
  status: AgendaTvPreviewStatus;
  note: string;
  currentDate: string | null;
  currentKickoffAt: string | null;
  currentChannel: string | null;
  currentChannelId: string | null;
  nextDate: string | null;
  nextKickoffAt: string | null;
  nextChannel: string | null;
  nextChannelId: string | null;
}>;

function hasEffectiveLiveState(match: AgendaTvLifecycleMatch) {
  return (
    match.minute !== null
    && match.minute !== undefined
  ) || Boolean(match.live_started_at)
    || (
      match.live_base_minute !== null
      && match.live_base_minute !== undefined
    )
    || match.is_clock_running === true
    || (
      match.home_score !== null
      && match.home_score !== undefined
    )
    || (
      match.away_score !== null
      && match.away_score !== undefined
    );
}

export function agendaTvMatchPolicy(
  match: AgendaTvLifecycleMatch,
): AgendaTvMatchPolicy {
  if (hasEffectiveLiveState(match)) {
    return "preserve";
  }

  const status = (match.status ?? "").trim().toLowerCase();

  if (status === "scheduled") return "scheduled";
  if (status === "postponed") return "postponed";

  return "preserve";
}

export function agendaTvMatchNeedsEvidence(
  match: AgendaTvLifecycleMatch,
) {
  return agendaTvMatchPolicy(match) !== "preserve";
}

export function agendaTvUnavailableSourcesBlock(
  matches: readonly AgendaTvLifecycleMatch[],
) {
  return matches.some(
    (match) => agendaTvMatchPolicy(match) === "scheduled",
  );
}

export function shouldLoadAgendaTvFallback<
  Match extends AgendaTvLifecycleMatch,
>(
  matches: readonly Match[],
  scheduleStatus: (
    match: Match,
  ) => AgendaTvScheduleDecision["status"],
) {
  return matches.some((match) => (
    agendaTvMatchNeedsEvidence(match)
    && (
      scheduleStatus(match) !== "ok"
      || match.broadcast_channel_id === null
    )
  ));
}

function sameInstant(
  left: string | null | undefined,
  right: string | null | undefined,
) {
  if (!left || !right) return left === right;

  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);

  if (
    !Number.isFinite(leftTime)
    || !Number.isFinite(rightTime)
  ) {
    return left === right;
  }

  return leftTime === rightTime;
}

function preservedPreviewRow(input: Readonly<{
  match: AgendaTvLifecycleMatch;
  label: string;
  currentChannel: string | null;
  note: string;
}>): AgendaTvPreviewRow {
  return {
    matchId: input.match.id,
    label: input.label,
    preserve: true,
    status: "unchanged",
    note: input.note,
    currentDate: input.match.scheduled_date,
    currentKickoffAt: input.match.kickoff_at,
    currentChannel: input.currentChannel,
    currentChannelId: input.match.broadcast_channel_id,
    nextDate: input.match.scheduled_date,
    nextKickoffAt: input.match.kickoff_at,
    nextChannel: input.currentChannel,
    nextChannelId: input.match.broadcast_channel_id,
  };
}

export function buildAgendaTvPreviewRow(input: Readonly<{
  match: AgendaTvLifecycleMatch;
  label: string;
  currentChannel: string | null;
  schedule: AgendaTvScheduleDecision;
  channel: AgendaTvChannelDecision;
}>): AgendaTvPreviewRow {
  const policy = agendaTvMatchPolicy(input.match);

  if (policy === "preserve") {
    return preservedPreviewRow({
      match: input.match,
      label: input.label,
      currentChannel: input.currentChannel,
      note: "Jogo fora do ciclo sincronizável; agenda e TV preservadas.",
    });
  }

  if (input.schedule.status !== "ok") {
    if (policy === "postponed") {
      return preservedPreviewRow({
        match: input.match,
        label: input.label,
        currentChannel: input.currentChannel,
        note: "Jogo adiado sem nova marcação inequívoca; agenda e TV preservadas.",
      });
    }

    return {
      matchId: input.match.id,
      label: input.label,
      preserve: false,
      status:
        input.schedule.status === "conflict"
          ? "source_conflict"
          : "source_not_found",
      note:
        input.schedule.status === "conflict"
          ? `${input.schedule.sourceLabel} devolveu mais do que um jogo compatível.`
          : "O jogo não foi identificado de forma inequívoca nas fontes disponíveis.",
      currentDate: input.match.scheduled_date,
      currentKickoffAt: input.match.kickoff_at,
      currentChannel: input.currentChannel,
      currentChannelId: input.match.broadcast_channel_id,
      nextDate: null,
      nextKickoffAt: null,
      nextChannel: null,
      nextChannelId: null,
    };
  }

  const nextKickoffAt = buildPortugalKickoffAt(
    input.schedule.date,
    input.schedule.time,
  );
  const scheduleChanged =
    input.match.scheduled_date !== input.schedule.date
    || !sameInstant(input.match.kickoff_at, nextKickoffAt);
  const channelChanged =
    input.channel.channelId !== null
    && input.match.broadcast_channel_id !== input.channel.channelId;
  const unchanged = !scheduleChanged && !channelChanged;
  const sourceNote = `Data e hora: ${input.schedule.sourceLabel}.`;
  const channelNote = input.channel.channelId
    ? ` Canal: ${input.channel.sourceLabel ?? "catálogo"}.`
    : input.channel.reportedChannel
      ? ` Canal "${input.channel.reportedChannel}" sem correspondência exata no catálogo; a TV atual será preservada.`
      : " Canal sem confirmação exata; a TV atual será preservada.";

  return {
    matchId: input.match.id,
    label: input.label,
    preserve: false,
    status:
      scheduleChanged
        ? "update"
        : !input.channel.channelId
          && input.match.broadcast_channel_id === null
          ? "channel_not_found"
          : unchanged
            ? "unchanged"
            : "update",
    note:
      unchanged
        ? `${sourceNote}${channelNote}`
        : `Alteração pronta para confirmação. ${sourceNote}${channelNote}`,
    currentDate: input.match.scheduled_date,
    currentKickoffAt: input.match.kickoff_at,
    currentChannel: input.currentChannel,
    currentChannelId: input.match.broadcast_channel_id,
    nextDate: input.schedule.date,
    nextKickoffAt,
    nextChannel: input.channel.channelName ?? input.currentChannel,
    nextChannelId: input.channel.channelId,
  };
}

export function buildAgendaTvRpcRows(
  rows: readonly AgendaTvPreviewRow[],
) {
  return rows.map((row) => {
    if (
      !row.preserve
      && (!row.nextDate || !row.nextKickoffAt)
    ) {
      throw new Error("agenda-tv-incomplete-rpc-row");
    }

    return {
      match_id: row.matchId,
      preserve: row.preserve,
      expected_scheduled_date: row.currentDate,
      expected_kickoff_at: row.currentKickoffAt,
      expected_broadcast_channel_id: row.currentChannelId,
      scheduled_date: row.nextDate,
      kickoff_at: row.nextKickoffAt,
      broadcast_channel_id: row.nextChannelId,
    };
  });
}
