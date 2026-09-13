import { load } from "cheerio";

import {
  canonicalAgendaChannelKey,
  canonicalAgendaTeamKey,
  normalizeAgendaTvText,
  type MatchdayAgendaTvSourceMatch,
} from "./matchday-agenda-tv-sync";

const PORTUGUESE_MONTHS = new Map<string, number>([
  ["jan", 1],
  ["fev", 2],
  ["mar", 3],
  ["abr", 4],
  ["mai", 5],
  ["jun", 6],
  ["jul", 7],
  ["ago", 8],
  ["set", 9],
  ["out", 10],
  ["nov", 11],
  ["dez", 12],
]);

const PORTUGUESE_DATE = /\b(?:seg|ter|qua|qui|sex|s[aá]b|dom)\.?\s+(\d{1,2})\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)(?:\s+(20\d{2}))?\b/i;
const COLON_TIME = /\b([01]?\d|2[0-3]):([0-5]\d)\b/;
const EXPLICIT_ISO_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/i;

export type AgendaTvSourceRead = Readonly<{
  label: string;
  sourceUrl: string;
  rows: readonly MatchdayAgendaTvSourceMatch[];
}>;

function cleanText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

function uniqueTexts(values: readonly string[]) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const value of values) {
    const cleaned = cleanText(value);
    const key = normalizeAgendaTvText(cleaned);

    if (!cleaned || !key || seen.has(key)) continue;

    seen.add(key);
    result.push(cleaned);
  }

  return result;
}

function seasonStartYear(seasonStartsOn: string) {
  const year = Number(seasonStartsOn.slice(0, 4));
  const month = Number(seasonStartsOn.slice(5, 7));

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error("invalid-season-start");
  }

  return { year, month } as const;
}

function inferSeasonYear(month: number, seasonStartsOn: string) {
  const season = seasonStartYear(seasonStartsOn);
  return month >= season.month ? season.year : season.year + 1;
}

function isoDate(year: number, month: number, day: number) {
  return [
    String(year).padStart(4, "0"),
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}

function parsePortugueseNamedDate(
  value: string,
  seasonStartsOn: string,
) {
  const match = PORTUGUESE_DATE.exec(cleanText(value));
  if (!match) return null;

  const day = Number(match[1]);
  const month = PORTUGUESE_MONTHS.get(
    normalizeAgendaTvText(match[2]),
  );

  if (!month || day < 1 || day > 31) return null;

  const year = match[3]
    ? Number(match[3])
    : inferSeasonYear(month, seasonStartsOn);

  return {
    date: isoDate(year, month, day),
    endIndex: match.index + match[0].length,
  } as const;
}

function parseColonTime(value: string) {
  const match = COLON_TIME.exec(cleanText(value));
  if (!match) return null;

  return `${String(Number(match[1])).padStart(2, "0")}:${match[2]}`;
}

export function portugalLocalFromUtcInstant(value: string) {
  if (!EXPLICIT_ISO_INSTANT.test(value)) {
    throw new Error("ambiguous-liga-portugal-kickoff");
  }

  const instant = new Date(value);

  if (Number.isNaN(instant.getTime())) {
    throw new Error("invalid-kickoff-date");
  }

  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Lisbon",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);

  const byType = new Map(
    parts.map((part) => [part.type, part.value] as const),
  );

  const year = byType.get("year");
  const month = byType.get("month");
  const day = byType.get("day");
  const hour = byType.get("hour");
  const minute = byType.get("minute");

  if (!year || !month || !day || !hour || !minute) {
    throw new Error("unsupported-portugal-offset");
  }

  return {
    date: `${year}-${month}-${day}`,
    time: `${hour}:${minute}`,
  } as const;
}

type NuxtRecord = Record<string, unknown>;

function asNuxtRecord(value: unknown): NuxtRecord | null {
  return value !== null
    && typeof value === "object"
    && !Array.isArray(value)
    ? value as NuxtRecord
    : null;
}

function resolveNuxtValue(
  data: readonly unknown[],
  value: unknown,
) {
  return typeof value === "number"
    && Number.isInteger(value)
    && value >= 0
    && value < data.length
    ? data[value]
    : value;
}

function nuxtString(
  data: readonly unknown[],
  value: unknown,
) {
  const resolved = resolveNuxtValue(data, value);
  return typeof resolved === "string" ? resolved : null;
}

function nuxtTeamName(
  data: readonly unknown[],
  value: unknown,
) {
  const team = asNuxtRecord(resolveNuxtValue(data, value));
  return team ? nuxtString(data, team.name) : null;
}

function ligaPortugalFixtureInstant(
  html: string,
  home: string,
  away: string,
) {
  const $ = load(html);
  const payload = $("#__NUXT_DATA__").first().html();

  if (!payload) return null;

  let data: unknown;

  try {
    data = JSON.parse(payload);
  } catch {
    return null;
  }

  if (!Array.isArray(data)) return null;

  const expectedHome = canonicalAgendaTeamKey(home);
  const expectedAway = canonicalAgendaTeamKey(away);
  const instants = new Set<string>();

  for (const value of data) {
    const candidate = asNuxtRecord(value);
    if (!candidate) continue;

    const candidateHome = nuxtTeamName(data, candidate.homeTeam);
    const candidateAway = nuxtTeamName(data, candidate.awayTeam);

    if (
      !candidateHome
      || !candidateAway
      || canonicalAgendaTeamKey(candidateHome) !== expectedHome
      || canonicalAgendaTeamKey(candidateAway) !== expectedAway
    ) {
      continue;
    }

    for (const dateValue of [
      candidate.matchDate,
      candidate.fixtureDate,
    ]) {
      const instant = nuxtString(data, dateValue);

      if (
        !instant
        || !EXPLICIT_ISO_INSTANT.test(instant)
        || !Number.isFinite(Date.parse(instant))
      ) {
        continue;
      }

      instants.add(new Date(instant).toISOString());
    }
  }

  return instants.size === 1
    ? Array.from(instants)[0]
    : null;
}

function looksLikeTvChannel(value: string) {
  const key = canonicalAgendaChannelKey(value);

  return /^(?:sporttv(?:plus|\d+)?|btv|benficatv|canal11|portocanal|sportingtv|dazn\d*|rtp\d+|tvi|sic|sicnoticias|eleven\d*|vplus|cmtv)$/.test(
    key,
  );
}

export function ligaPortugalSeasonCode(label: string) {
  const match = /^(20\d{2})\s*[/-]\s*(\d{2}|20\d{2})$/.exec(
    label.trim(),
  );

  if (!match) {
    throw new Error("invalid-season-label");
  }

  const endYear =
    match[2].length === 2
      ? `${match[1].slice(0, 2)}${match[2]}`
      : match[2];

  return `${match[1]}${endYear}`;
}

export function ligaPortugalMatchUrl(input: Readonly<{
  seasonLabel: string;
  matchdayNumber: number;
  matchIndex: number;
}>) {
  if (
    !Number.isInteger(input.matchdayNumber)
    || input.matchdayNumber <= 0
    || !Number.isInteger(input.matchIndex)
    || input.matchIndex <= 0
  ) {
    throw new Error("invalid-matchday-source-index");
  }

  return `https://www.ligaportugal.pt/match/${ligaPortugalSeasonCode(input.seasonLabel)}/ligaportugalbetclic/${input.matchdayNumber}/${input.matchIndex}`;
}

export function parseLigaPortugalMatchHtml(
  html: string,
  input: Readonly<{
    sourceUrl: string;
    seasonStartsOn: string;
  }>,
): MatchdayAgendaTvSourceMatch | null {
  const $ = load(html);
  const title = cleanText($("title").first().text());
  const titleMatch =
    /^Liga Portugal\s*-\s*(.+?)\s*-\s*(.+)$/i.exec(title);

  if (!titleMatch) return null;

  const fixtureInstant = ligaPortugalFixtureInstant(
    html,
    titleMatch[1],
    titleMatch[2],
  );

  if (!fixtureInstant) return null;

  const local = portugalLocalFromUtcInstant(fixtureInstant);

  const bodyChannelCandidates = uniqueTexts([
    ...$("body img[alt]")
      .map((_index, element) => $(element).attr("alt") ?? "")
      .get(),
    ...$("body [title]")
      .map((_index, element) => $(element).attr("title") ?? "")
      .get(),
  ]);

  const channel =
    bodyChannelCandidates.find(looksLikeTvChannel)
    ?? "";

  return {
    home: cleanText(titleMatch[1]),
    away: cleanText(titleMatch[2]),
    date: local.date,
    time: local.time,
    channel,
    sourceUrl: input.sourceUrl,
  };
}

function ondeBolaMatchdayContext(
  value: string,
  matchdayNumber: number,
) {
  const normalized = normalizeAgendaTvText(value);
  if (!normalized.includes("liga portugal")) return false;

  return new RegExp(
    `\\b(?:j|jorn|jornada)\\s*0?${matchdayNumber}\\b`,
  ).test(normalized);
}

export function parseOndeBolaAgendaHtml(
  html: string,
  input: Readonly<{
    sourceUrl: string;
    seasonStartsOn: string;
    matchdayNumber: number;
  }>,
): MatchdayAgendaTvSourceMatch[] {
  const $ = load(html);
  const result: MatchdayAgendaTvSourceMatch[] = [];
  const seen = new Set<string>();

  for (const element of $("tr").toArray()) {
    const row = $(element);
    const cells = row.find("td").toArray();

    if (cells.length < 3) continue;

    const cellTexts = cells.map((cell) => cleanText($(cell).text()));
    const rowText = cleanText(cellTexts.join(" "));

    if (!ondeBolaMatchdayContext(rowText, input.matchdayNumber)) {
      continue;
    }

    const parsedDate = cellTexts
      .map((value) => parsePortugueseNamedDate(value, input.seasonStartsOn))
      .find((value) => value !== null)
      ?? null;

    if (!parsedDate) continue;

    const time =
      cellTexts
        .map(parseColonTime)
        .find((value): value is string => value !== null)
      ?? null;

    if (!time) continue;

    const gameCellIndex = cellTexts.findIndex((value) => (
      /\s[-–]\s/.test(value)
      && !looksLikeTvChannel(value)
    ));

    if (gameCellIndex < 0) continue;

    const gameCell = $(cells[gameCellIndex]);
    const rawHtml = gameCell.html() ?? "";
    const beforeBreak = rawHtml.split(/<br\s*\/?\s*>/i)[0] ?? rawHtml;
    let gameLine = cleanText(load(`<div>${beforeBreak}</div>`)("div").text());

    if (!/\s[-–]\s/.test(gameLine)) {
      gameLine = cellTexts[gameCellIndex]
        .replace(/\s+Liga Portugal\b.*$/i, "")
        .trim();
    }

    const game = /^(.+?)\s[-–]\s(.+?)$/.exec(gameLine);
    if (!game) continue;

    const channelCandidates = uniqueTexts([
      ...row
        .find("a")
        .map((_index, element) => $(element).text())
        .get(),
      ...row
        .find("img[alt]")
        .map((_index, element) => $(element).attr("alt") ?? "")
        .get(),
      ...row
        .find("[title]")
        .map((_index, element) => $(element).attr("title") ?? "")
        .get(),
      cellTexts.at(-1) ?? "",
    ]);

    const channel =
      channelCandidates.find(looksLikeTvChannel)
      ?? "";

    const rowKey = [
      normalizeAgendaTvText(game[1]),
      normalizeAgendaTvText(game[2]),
      parsedDate.date,
      time,
      canonicalAgendaChannelKey(channel),
    ].join("|");

    if (seen.has(rowKey)) continue;
    seen.add(rowKey);

    result.push({
      home: cleanText(game[1]),
      away: cleanText(game[2]),
      date: parsedDate.date,
      time,
      channel,
      sourceUrl: input.sourceUrl,
    });
  }

  return result;
}

export function isGenericAgendaTvChannel(value: string) {
  const key = canonicalAgendaChannelKey(value);
  return key === "sporttv" || key === "dazn";
}
