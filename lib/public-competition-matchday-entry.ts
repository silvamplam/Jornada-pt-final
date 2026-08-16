export const LIGA_PORTUGAL_PUBLIC_ENTRY_SLUG = "liga-portugal";

export const PUBLIC_MATCH_ESTIMATED_DURATION_MS = 2 * 60 * 60 * 1000;
export const PUBLIC_MATCHDAY_EDITORIAL_WINDOW_MS = 48 * 60 * 60 * 1000;
export const PUBLIC_MATCHDAY_ROLLOVER_MS =
  PUBLIC_MATCH_ESTIMATED_DURATION_MS + PUBLIC_MATCHDAY_EDITORIAL_WINDOW_MS;

export type PublicCompetitionEntryMatchday = {
  id: string;
  number: number | null;
};

export type PublicCompetitionEntryMatch = {
  matchday_id: string | null;
  status: string | null;
  kickoff_at: string | null;
  rollover_excluded?: boolean | null;
};

function normalizedStatus(value: string | null | undefined) {
  return value?.trim().toLowerCase() ?? "";
}

function kickoffTimestamp(value: string | null | undefined) {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
}

export function selectPublicCompetitionEntryMatchday<T extends PublicCompetitionEntryMatchday>(
  matchdays: T[],
  matches: PublicCompetitionEntryMatch[],
  now = new Date()
): T | null {
  const orderedMatchdays = [...matchdays]
    .filter((matchday) => Number.isInteger(matchday.number))
    .sort((first, second) => (first.number ?? 0) - (second.number ?? 0));

  if (orderedMatchdays.length === 0) {
    return null;
  }

  const nowTimestamp = now.getTime();
  let selectedIndex = 0;

  for (let index = 0; index < orderedMatchdays.length - 1; index += 1) {
    const matchday = orderedMatchdays[index];
    const eligibleKickoffs = matches
      .filter(
        (match) =>
          match.matchday_id === matchday.id &&
          match.rollover_excluded !== true &&
          normalizedStatus(match.status) !== "postponed"
      )
      .map((match) => kickoffTimestamp(match.kickoff_at))
      .filter((timestamp): timestamp is number => timestamp !== null);

    if (eligibleKickoffs.length === 0) {
      continue;
    }

    const lastKickoff = Math.max(...eligibleKickoffs);
    const rolloverAt = lastKickoff + PUBLIC_MATCHDAY_ROLLOVER_MS;

    if (nowTimestamp >= rolloverAt) {
      selectedIndex = Math.max(selectedIndex, index + 1);
    }
  }

  return orderedMatchdays[selectedIndex] ?? orderedMatchdays[0];
}
