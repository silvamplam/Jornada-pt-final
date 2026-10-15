import "server-only";

import {
  currentLigaPortugalCompetitionUrl,
  ligaPortugalMatchdayUrl,
  ligaPortugalSeasonUrl,
  parseVsportsMatchdayDiscoveries,
  vsportsMatchUrls,
  type VsportsVideoSummaryDiscovery,
} from "@/lib/vsports-video-summary-discovery";

const VSPORTS_HOME = "https://vsports.pt/";
const MAX_HTML_BYTES = 2_000_000;

export type VsportsMatchdayDiscoveryResult = Readonly<{
  supported: boolean;
  matchdayUrl: string | null;
  items: VsportsVideoSummaryDiscovery[];
  reason: "ok" | "competition-not-supported" | "season-not-found" | "matchday-not-found";
}>;

type LoaderDependencies = Readonly<{
  fetchHtml: (url: string) => Promise<string>;
}>;

async function fetchHtml(url: string) {
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
    if (!response.ok) throw new Error(`vsports-http-${response.status}`);
    const length = Number(response.headers.get("content-length") ?? 0);
    if (length > MAX_HTML_BYTES) throw new Error("vsports-response-too-large");
    const html = await response.text();
    if (Buffer.byteLength(html, "utf8") > MAX_HTML_BYTES) throw new Error("vsports-response-too-large");
    return html;
  } finally {
    clearTimeout(timeout);
  }
}

function uniqueDiscoveries(items: VsportsVideoSummaryDiscovery[]) {
  return Array.from(new Map(
    items.map((item) => [`${item.sourceItemId}:${item.sourceUrl}`, item] as const),
  ).values());
}

async function discoverMissingMatchPages(
  matchdayHtml: string,
  indexedItems: VsportsVideoSummaryDiscovery[],
  dependencies: LoaderDependencies,
) {
  const indexedMatchUrls = new Set(indexedItems.flatMap((item) => item.matchUrl ? [item.matchUrl] : []));
  const fallbackMatchUrls = vsportsMatchUrls(matchdayHtml).filter((url) => !indexedMatchUrls.has(url));
  if (fallbackMatchUrls.length === 0) return [];

  const loaded = await Promise.allSettled(fallbackMatchUrls.map(async (url) => (
    parseVsportsMatchdayDiscoveries(await dependencies.fetchHtml(url))
  )));
  return loaded.flatMap((result) => result.status === "fulfilled" ? result.value : []);
}

export function createVsportsMatchdayDiscoveryLoader(
  dependencies: LoaderDependencies = { fetchHtml },
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
    const fallbackItems = await discoverMissingMatchPages(matchdayHtml, indexedItems, dependencies);
    return {
      supported: true,
      matchdayUrl,
      items: uniqueDiscoveries([...indexedItems, ...fallbackItems]),
      reason: "ok",
    };
  };
}

export const discoverVsportsMatchday = createVsportsMatchdayDiscoveryLoader();
