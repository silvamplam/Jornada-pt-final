export type VideoSummaryMatchTarget = {
  matchId: string;
  homeVariants: string[];
  awayVariants: string[];
  homeScore: number | null;
  awayScore: number | null;
};

export type VideoSummaryMatchDecision = {
  eligible: boolean;
  matchId: string | null;
  confidence: number;
  reason:
    | "not-main-summary"
    | "no-match"
    | "ambiguous-match"
    | "teams-only"
    | "teams-and-score";
  matchedHomeVariant: string | null;
  matchedAwayVariant: string | null;
};

const SCORE_RE = /(?:^|\s)(\d{1,2})\s*[-–—x:]\s*(\d{1,2})(?=\s|$)/giu;

export function normalizeVideoSummaryText(value?: string | null) {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-PT")
    .replace(/&/g, " e ")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isMainVideoSummaryTitle(title?: string | null) {
  const normalized = normalizeVideoSummaryText(title);
  if (!normalized) return false;
  if (!/(^| )resumo( |$)/u.test(normalized)) return false;
  if (/(^| )flash( |$)/u.test(normalized)) return false;
  if (/(^| )(golo|jogada|expulsao|caso|penalti)( |$)/u.test(normalized)) return false;
  return true;
}

export function extractScorePairs(title?: string | null) {
  const source = ` ${title ?? ""} `;
  const pairs: Array<[number, number]> = [];
  for (const match of source.matchAll(SCORE_RE)) {
    pairs.push([Number(match[1]), Number(match[2])]);
  }
  return pairs;
}

function findVariant(normalizedTitle: string, variants: string[]) {
  const padded = ` ${normalizedTitle} `;
  const normalizedVariants = variants
    .map(normalizeVideoSummaryText)
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);

  return normalizedVariants.find((variant) => padded.includes(` ${variant} `)) ?? null;
}

export function matchVideoSummaryTitle(
  title: string,
  matches: VideoSummaryMatchTarget[],
): VideoSummaryMatchDecision {
  if (!isMainVideoSummaryTitle(title)) {
    return {
      eligible: false,
      matchId: null,
      confidence: 0,
      reason: "not-main-summary",
      matchedHomeVariant: null,
      matchedAwayVariant: null,
    };
  }

  const normalizedTitle = normalizeVideoSummaryText(title);
  const scorePairs = extractScorePairs(title);
  const candidates = matches.flatMap((match) => {
    const homeVariant = findVariant(normalizedTitle, match.homeVariants);
    const awayVariant = findVariant(normalizedTitle, match.awayVariants);
    if (!homeVariant || !awayVariant || homeVariant === awayVariant) return [];

    const hasFinalScore = Number.isInteger(match.homeScore) && Number.isInteger(match.awayScore);
    const scoreMatches = hasFinalScore
      ? scorePairs.some(([home, away]) => home === match.homeScore && away === match.awayScore)
      : false;

    if (hasFinalScore && scorePairs.length > 0 && !scoreMatches) return [];

    return [{
      match,
      homeVariant,
      awayVariant,
      scoreMatches,
      confidence: scoreMatches ? 100 : 88,
    }];
  });

  if (candidates.length === 0) {
    return {
      eligible: true,
      matchId: null,
      confidence: 0,
      reason: "no-match",
      matchedHomeVariant: null,
      matchedAwayVariant: null,
    };
  }

  if (candidates.length > 1) {
    return {
      eligible: true,
      matchId: null,
      confidence: Math.max(...candidates.map((candidate) => candidate.confidence)),
      reason: "ambiguous-match",
      matchedHomeVariant: null,
      matchedAwayVariant: null,
    };
  }

  const [candidate] = candidates;
  return {
    eligible: true,
    matchId: candidate.match.matchId,
    confidence: candidate.confidence,
    reason: candidate.scoreMatches ? "teams-and-score" : "teams-only",
    matchedHomeVariant: candidate.homeVariant,
    matchedAwayVariant: candidate.awayVariant,
  };
}

export function cleanRoundupTitleFromYouTube(title: string) {
  const resumoIndex = title.search(/\bresumo\b/iu);
  const afterResumo = resumoIndex >= 0
    ? title.slice(resumoIndex).replace(/^resumo\s*:?\s*/iu, "")
    : title;

  return afterResumo
    .replace(/\s*\|\s*sport\s*tv\s*$/iu, "")
    .replace(/\s+-\s+liga\s+portugal.*$/iu, "")
    .replace(/\s*\(\s*liga\s+[^)]*\)\s*$/iu, "")
    .replace(/(\d{1,2})\s*[-–—]\s*(\d{1,2})/gu, "$1 - $2")
    .replace(/\s+/g, " ")
    .trim();
}

export function parseYouTubeDurationSeconds(value?: string | null) {
  if (!value) return null;
  const match = /^P(?:(\d+)D)?T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/u.exec(value.trim());
  if (!match) return null;
  const days = Number(match[1] ?? 0);
  const hours = Number(match[2] ?? 0);
  const minutes = Number(match[3] ?? 0);
  const seconds = Number(match[4] ?? 0);
  return days * 86400 + hours * 3600 + minutes * 60 + seconds;
}

export function formatVideoDuration(seconds?: number | null) {
  if (!Number.isInteger(seconds) || (seconds ?? -1) < 0) return null;
  const value = seconds as number;
  const hours = Math.floor(value / 3600);
  const minutes = Math.floor((value % 3600) / 60);
  const remainingSeconds = value % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`
    : `${String(minutes).padStart(2, "0")}:${String(remainingSeconds).padStart(2, "0")}`;
}
