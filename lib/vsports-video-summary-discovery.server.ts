import "server-only";

import { ligaPortugalMatchUrl } from "@/lib/matchday-agenda-tv-sources";
import {
  currentLigaPortugalCompetitionUrl,
  ligaPortugalMatchdayUrl,
  ligaPortugalSeasonUrl,
  parseLigaPortugalMatchTeams,
  parseLigaPortugalMatchVideoDiscoveries,
  parseVsportsMatchdayDiscoveries,
  parseVsportsMatchTeams,
  sameVideoSummaryMatchTeams,
  vsportsMatchUrls,
  type VideoSummaryMatchTeams,
  type VsportsVideoSummaryDiscovery,
} from "@/lib/vsports-video-summary-discovery";

const VSPORTS_HOME = "https://vsports.pt/";
const MAX_VSPORTS_HTML_BYTES = 2_000_000;
const MAX_LIGA_PORTUGAL_HTML_BYTES = 3_000_000;
const MAX_LIGA_PORTUGAL_MATCHES = 12;

export type VsportsMatchdayDiscoveryResult = Readonly<{
  supported: boolean;
  matchdayUrl: string | null;
  items: VsportsVideoSummaryDiscovery[];
  reason: "ok" | "competition-not-supported" | "season-not-found" | "matchday-not-found";
}>;

type LoaderDependencies = Readonly<{
  fetchHtml: (url: string) => Promise<string>;
  fetchLigaPortugalHtml: (url: string) => Promise<string>;
}>;

async function fetchHtmlWithLimit(url: string, maxBytes: number, errorPrefix: string) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  try {
    const response = await fetch(url, {
      cache: "no-store",
      redirect: "follow",
      signal: controller.signal,
      headers: {
        Accept: "text/html,application/xhtml+xml",
        "User-Agent": "Jornada.pt video-summary discovery/1.0",
      },
    });
    if (!response.ok) throw new Error(`${errorPrefix}-http-${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > maxBytes) throw new Error(`${errorPrefix}-response-too-large`);
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > maxBytes) throw new Error(`${errorPrefix}-response-too-large`);
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchHtml(url: string) {
  return fetchHtmlWithLimit(url, MAX_VSPORTS_HTML_BYTES, "vsports");
}

async function fetchLigaPortugalHtml(url: string) {
  return fetchHtmlWithLimit(url, MAX_LIGA_PORTUGAL_HTML_BYTES, "liga-portugal");
}

function uniqueDiscoveries(items: VsportsVideoSummaryDiscovery[]) {
  return Array.from(new Map(
    items.map((item) => [`${item.sourceItemId}:${item.sourceUrl}`, item] as const),
  ).values());
}

type MissingMatchPage = Readonly<{
  teams: VideoSummaryMatchTeams;
  items: VsportsVideoSummaryDiscovery[];
}>;

async function discoverMissingMatchPages(
  matchdayHtml: string,
  indexedItems: VsportsVideoSummaryDiscovery[],
  input: Readonly<{ seasonLabel: string; matchdayNumber: number }>,
  dependencies: LoaderDependencies,
) {
  const allMatchUrls = vsportsMatchUrls(matchdayHtml);
  const indexedMatchUrls = new Set(indexedItems.flatMap((item) => item.matchUrl ? [item.matchUrl] : []));
  const fallbackMatchUrls = allMatchUrls.filter((url) => !indexedMatchUrls.has(url));
  if (fallbackMatchUrls.length === 0) return [];

  const loaded = await Promise.allSettled(fallbackMatchUrls.map(async (url): Promise<MissingMatchPage | null> => {
    const html = await dependencies.fetchHtml(url);
    const teams = parseVsportsMatchTeams(html);
    if (!teams) return null;
    return {
      teams,
      items: parseVsportsMatchdayDiscoveries(html),
    };
  }));

  const resolvedPages = loaded.flatMap((result) => (
    result.status === "fulfilled" && result.value ? [result.value] : []
  ));
  const fallbackItems = resolvedPages.flatMap((page) => page.items);
  const unresolved = resolvedPages.map((page) => page.teams);
  if (unresolved.length === 0) return fallbackItems;

  const matchCount = Math.min(Math.max(allMatchUrls.length, 1), MAX_LIGA_PORTUGAL_MATCHES);
  for (let matchIndex = 1; matchIndex <= matchCount && unresolved.length > 0; matchIndex += 1) {
    const sourcePageUrl = ligaPortugalMatchUrl({
      seasonLabel: input.seasonLabel,
      matchdayNumber: input.matchdayNumber,
      matchIndex,
    });

    let officialHtml: string;
    try {
      officialHtml = await dependencies.fetchLigaPortugalHtml(sourcePageUrl);
    } catch {
      continue;
    }

    const officialTeams = parseLigaPortugalMatchTeams(officialHtml);
    if (!officialTeams) continue;
    const unresolvedIndex = unresolved.findIndex((teams) => sameVideoSummaryMatchTeams(teams, officialTeams));
    if (unresolvedIndex < 0) continue;

    fallbackItems.push(...parseLigaPortugalMatchVideoDiscoveries(officialHtml, sourcePageUrl));
    unresolved.splice(unresolvedIndex, 1);
  }

  return fallbackItems;
}

export function createVsportsMatchdayDiscoveryLoader(
  dependencies: LoaderDependencies = { fetchHtml, fetchLigaPortugalHtml },
) {
  return async function discoverVsportsMatchday(input: {
    competitionSlug: string;
    seasonLabel: string;
    matchdayNumber: number;
  }): Promise<VsportsMatchdayDiscoveryResult> {
    if (input.competitionSlug !== "liga-portugal") {
      return { supported: false, matchdayUrl: null, items: [], reason: "competition-not-supported" };
    }

    const homeHtml = await dependencies.fetchHtml(VSPORTS_HOME);
    const currentCompetitionUrl = currentLigaPortugalCompetitionUrl(homeHtml);
    if (!currentCompetitionUrl) {
      return { supported: true, matchdayUrl: null, items: [], reason: "season-not-found" };
    }

    const currentCompetitionHtml = await dependencies.fetchHtml(currentCompetitionUrl);
    const seasonUrl = ligaPortugalSeasonUrl(currentCompetitionHtml, input.seasonLabel);
    if (!seasonUrl) {
      return { supported: true, matchdayUrl: null, items: [], reason: "season-not-found" };
    }

    const seasonHtml = seasonUrl === currentCompetitionUrl
      ? currentCompetitionHtml
      : await dependencies.fetchHtml(seasonUrl);
    const matchdayUrl = ligaPortugalMatchdayUrl(seasonHtml, input.matchdayNumber);
    if (!matchdayUrl) {
      return { supported: true, matchdayUrl: null, items: [], reason: "matchday-not-found" };
    }

    const matchdayHtml = await dependencies.fetchHtml(matchdayUrl);
    const indexedItems = parseVsportsMatchdayDiscoveries(matchdayHtml);
    const fallbackItems = await discoverMissingMatchPages(
      matchdayHtml,
      indexedItems,
      { seasonLabel: input.seasonLabel, matchdayNumber: input.matchdayNumber },
      dependencies,
    );
    return {
      supported: true,
      matchdayUrl,
      items: uniqueDiscoveries([...indexedItems, ...fallbackItems]),
      reason: "ok",
    };
  };
}

export const discoverVsportsMatchday = createVsportsMatchdayDiscoveryLoader();
