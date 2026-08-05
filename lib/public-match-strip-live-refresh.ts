export const PUBLIC_MATCH_STRIP_REFRESH_INTERVAL_MS = 15_000;
export const PUBLIC_MATCH_STRIP_MAX_MATCH_IDS = 50;

const MATCH_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type PublicMatchStripLiveUpdate = {
  id: string;
  status: string | null;
  minute: number | string | null;
  live_started_at: string | null;
  live_base_minute: number | string | null;
  is_clock_running: boolean | null;
  home_score: number | null;
  away_score: number | null;
};

export function parsePublicMatchStripMatchIds(value: string | null) {
  if (!value) return [];

  const uniqueIds: string[] = [];
  const seen = new Set<string>();

  for (const candidate of value.split(",")) {
    const id = candidate.trim().toLowerCase();
    if (!MATCH_ID_PATTERN.test(id) || seen.has(id)) continue;

    seen.add(id);
    uniqueIds.push(id);

    if (uniqueIds.length === PUBLIC_MATCH_STRIP_MAX_MATCH_IDS) break;
  }

  return uniqueIds;
}

export function mergePublicMatchStripLiveUpdates<
  T extends { id: string } & Partial<Omit<PublicMatchStripLiveUpdate, "id">>
>(matches: T[], updates: PublicMatchStripLiveUpdate[]) {
  if (updates.length === 0) return matches;

  const updatesById = new Map(updates.map((update) => [update.id.toLowerCase(), update]));
  let changed = false;

  const nextMatches = matches.map((match) => {
    const update = updatesById.get(match.id.toLowerCase());
    if (!update) return match;

    const nextMatch = {
      ...match,
      status: update.status,
      minute: update.minute,
      live_started_at: update.live_started_at,
      live_base_minute: update.live_base_minute,
      is_clock_running: update.is_clock_running,
      home_score: update.home_score,
      away_score: update.away_score
    };

    const matchChanged =
      match.status !== nextMatch.status
      || match.minute !== nextMatch.minute
      || match.live_started_at !== nextMatch.live_started_at
      || match.live_base_minute !== nextMatch.live_base_minute
      || match.is_clock_running !== nextMatch.is_clock_running
      || match.home_score !== nextMatch.home_score
      || match.away_score !== nextMatch.away_score;

    if (!matchChanged) return match;

    changed = true;
    return nextMatch;
  });

  return changed ? nextMatches : matches;
}
