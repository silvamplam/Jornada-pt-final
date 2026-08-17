export const PRESERVED_SEARCH_CRAWLERS = [
  "Googlebot",
  "Googlebot-Image",
  "Googlebot-Video",
  "bingbot",
] as const;

export const BLOCKED_CRAWLER_USER_AGENTS = [
  "Amazonbot",
  "iubenda-radar",
  "meta-webindexer",
  "meta-externalagent",
] as const;

const BLOCKED_CRAWLER_TOKENS = BLOCKED_CRAWLER_USER_AGENTS.map((userAgent) =>
  userAgent.toLowerCase(),
);

export function isBlockedCrawlerUserAgent(
  userAgent: string | null | undefined,
): boolean {
  if (!userAgent) {
    return false;
  }

  const normalized = userAgent.toLowerCase();
  return BLOCKED_CRAWLER_TOKENS.some((token) => normalized.includes(token));
}
