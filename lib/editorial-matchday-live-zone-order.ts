export const MATCHDAY_LIVE_PUBLIC_ZONE_ORDER_KEYS = [
  "video",
  "four_news",
  "six_news",
  "five_news_balanced",
  "five_news_secondary",
] as const;

export type MatchdayLivePublicZoneKey =
  (typeof MATCHDAY_LIVE_PUBLIC_ZONE_ORDER_KEYS)[number];

export const DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER: MatchdayLivePublicZoneKey[] = [
  "video",
  "four_news",
  "six_news",
  "five_news_balanced",
  "five_news_secondary",
];

export const MATCHDAY_LIVE_PUBLIC_ZONE_LABELS: Record<
  MatchdayLivePublicZoneKey,
  string
> = {
  video: "A Jornada em Vídeo + Destaque da Jornada",
  four_news: "4 notícias + Últimas",
  six_news: "6 notícias",
  five_news_balanced: "5 notícias — 1 destaque + 1 secundária + 3 complementares",
  five_news_secondary: "5 notícias — 1 destaque + 4 secundárias",
};

const matchdayLivePublicZoneKeySet = new Set<string>(
  MATCHDAY_LIVE_PUBLIC_ZONE_ORDER_KEYS,
);

export function isMatchdayLivePublicZoneKey(
  value?: string | null,
): value is MatchdayLivePublicZoneKey {
  return Boolean(value && matchdayLivePublicZoneKeySet.has(value));
}

export function normalizeMatchdayLivePublicZoneOrder(
  value: unknown,
): MatchdayLivePublicZoneKey[] {
  if (!Array.isArray(value)) {
    return [...DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER];
  }

  const normalized = value.filter(
    (item): item is MatchdayLivePublicZoneKey =>
      typeof item === "string" && isMatchdayLivePublicZoneKey(item),
  );

  if (
    normalized.length !== MATCHDAY_LIVE_PUBLIC_ZONE_ORDER_KEYS.length ||
    new Set(normalized).size !== MATCHDAY_LIVE_PUBLIC_ZONE_ORDER_KEYS.length
  ) {
    return [...DEFAULT_MATCHDAY_LIVE_PUBLIC_ZONE_ORDER];
  }

  return normalized;
}

export function moveMatchdayLivePublicZone(
  currentValue: unknown,
  zone: MatchdayLivePublicZoneKey,
  direction: "up" | "down",
) {
  const current = normalizeMatchdayLivePublicZoneOrder(currentValue);
  const currentIndex = current.indexOf(zone);
  const targetIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;

  if (
    currentIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= current.length
  ) {
    return current;
  }

  const next = [...current];
  [next[currentIndex], next[targetIndex]] = [
    next[targetIndex],
    next[currentIndex],
  ];
  return next;
}
