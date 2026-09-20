import { load } from "cheerio";

import { youtubeVideoId } from "@/lib/public-video-embed";

const VSPORTS_ORIGIN = "https://vsports.pt";

export type VsportsVideoSummaryDiscovery = Readonly<{
  sourceItemId: string;
  title: string;
  sourceUrl: string;
  matchUrl: string | null;
  thumbnailUrl: string | null;
  publishedAt: string | null;
  youtubeVideoId: string | null;
  youtubeUrl: string | null;
}>;

function absoluteVsportsUrl(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), VSPORTS_ORIGIN);
    return url.protocol === "https:" && (url.hostname === "vsports.pt" || url.hostname.endsWith(".vsports.pt"))
      ? url.toString()
      : null;
  } catch {
    return null;
  }
}

function absoluteHttpUrl(value?: string | null) {
  if (!value?.trim()) return null;
  try {
    const url = new URL(value.trim(), VSPORTS_ORIGIN);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : null;
  } catch {
    return null;
  }
}

function normalizedSeason(value: string) {
  const years = value.match(/(20\d{2})\D+(20\d{2}|\d{2})/u);
  if (!years) return value.trim().toLocaleLowerCase("pt-PT");
  const endingYear = years[2].length === 2 ? `${years[1].slice(0, 2)}${years[2]}` : years[2];
  return `${years[1]}/${endingYear}`;
}

export function currentLigaPortugalCompetitionUrl(homeHtml: string) {
  const $ = load(homeHtml);
  const href = $('a[href*="/vsports/competicao/i-liga/"]')
    .map((_index, element) => $(element).attr("href") ?? "")
    .get()
    .find((value) => /\/vsports\/competicao\/i-liga\/\d+\/?$/u.test(value));
  return absoluteVsportsUrl(href);
}

export function ligaPortugalSeasonUrl(competitionHtml: string, seasonLabel: string) {
  const wanted = normalizedSeason(seasonLabel);
  const $ = load(competitionHtml);
  let href: string | null = null;
  $("select option").each((_index, element) => {
    if (href || normalizedSeason($(element).text()) !== wanted) return;
    href = $(element).attr("value") ?? null;
  });
  return absoluteVsportsUrl(href);
}

export function ligaPortugalMatchdayUrl(seasonHtml: string, matchdayNumber: number) {
  const $ = load(seasonHtml);
  let href: string | null = null;
  $('a[href*="/jornadas/"]').each((_index, element) => {
    if (href) return;
    const number = Number($(element).text().match(/\d+/u)?.[0]);
    if (number === matchdayNumber) href = $(element).attr("href") ?? null;
  });
  return absoluteVsportsUrl(href);
}

function itemId(sourceUrl: string, fallback: string) {
  return sourceUrl.match(/-(\d+)(?:[/?#]|$)/u)?.[1]
    ?? youtubeVideoId(sourceUrl)
    ?? fallback;
}

function publishedAtFromCard(text: string) {
  const value = text.match(/(20\d{2}-\d{2}-\d{2})\s+(\d{2}:\d{2}:\d{2})/u);
  return value ? `${value[1]}T${value[2]}Z` : null;
}

function youtubeLinkFromCard(
  $card: ReturnType<ReturnType<typeof load>>,
) {
  const href = $card.find('a[href*="youtube.com/watch"],a[href*="youtu.be/"]').first().attr("href");
  const url = absoluteHttpUrl(href);
  const videoId = youtubeVideoId(url);
  return videoId && url ? { videoId, url } : null;
}

export function parseVsportsMatchdayDiscoveries(html: string) {
  const $ = load(html);
  const discoveries: VsportsVideoSummaryDiscovery[] = [];

  $("a.video-btn[data-title]").each((index, element) => {
    const anchor = $(element);
    const title = anchor.attr("data-title")?.trim() || anchor.find("img[alt]").attr("alt")?.trim() || "";
    const sourceUrl = absoluteVsportsUrl(anchor.attr("data-share") ?? anchor.attr("data-src"));
    if (!title || !sourceUrl) return;
    const card = anchor.closest(".card");
    const youtube = youtubeLinkFromCard(card);
    discoveries.push({
      sourceItemId: itemId(sourceUrl, `card-${index}`),
      title,
      sourceUrl,
      matchUrl: absoluteVsportsUrl(anchor.attr("data-match")),
      thumbnailUrl: absoluteHttpUrl(card.find("img[data-src],img[src]").first().attr("data-src") ?? card.find("img[src]").first().attr("src")),
      publishedAt: publishedAtFromCard(card.text()),
      youtubeVideoId: youtube?.videoId ?? null,
      youtubeUrl: youtube?.url ?? null,
    });
  });

  $('a[href*="youtube.com/watch"],a[href*="youtu.be/"]').each((index, element) => {
    const anchor = $(element);
    const url = absoluteHttpUrl(anchor.attr("href"));
    const videoId = youtubeVideoId(url);
    if (!url || !videoId || discoveries.some((item) => item.youtubeVideoId === videoId)) return;
    const card = anchor.closest(".card,article,li");
    const title = anchor.attr("title")?.trim()
      || anchor.find("img[alt]").attr("alt")?.trim()
      || card.find(".card-title,h1,h2,h3,h4").first().text().trim()
      || anchor.text().trim();
    if (!title) return;
    discoveries.push({
      sourceItemId: `youtube-${videoId}`,
      title,
      sourceUrl: url,
      matchUrl: null,
      thumbnailUrl: absoluteHttpUrl(card.find("img[data-src],img[src]").first().attr("data-src") ?? card.find("img[src]").first().attr("src")),
      publishedAt: publishedAtFromCard(card.text()),
      youtubeVideoId: videoId,
      youtubeUrl: url,
    });
  });

  return Array.from(new Map(
    discoveries.map((item) => [`${item.sourceItemId}:${item.youtubeVideoId ?? "vsports"}`, item] as const),
  ).values());
}
