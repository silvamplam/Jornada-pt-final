export const PUBLIC_MORE_ARTICLES_LIMIT = 5;

export type PublicMoreArticleContext = Readonly<{
  id: string;
  competition_id?: string | null;
  season_id?: string | null;
  matchday_id?: string | null;
}>;

export type PublicMoreArticleScope = Readonly<{
  priority: 1 | 2 | 3 | 4;
  filter: string;
}>;

function cleanText(value: string | null | undefined) {
  const cleanValue = value?.trim();
  return cleanValue || null;
}

function equalsFilter(column: string, value: string) {
  return `${column}=eq.${encodeURIComponent(value)}`;
}

export function publicArticleContextPriority(
  candidate: PublicMoreArticleContext,
  current: PublicMoreArticleContext,
) {
  const currentCompetitionId = cleanText(current.competition_id);
  const currentSeasonId = cleanText(current.season_id);
  const currentMatchdayId = cleanText(current.matchday_id);
  const candidateCompetitionId = cleanText(candidate.competition_id);
  const candidateSeasonId = cleanText(candidate.season_id);
  const candidateMatchdayId = cleanText(candidate.matchday_id);
  const candidateIsGeneral = !candidateCompetitionId && !candidateSeasonId && !candidateMatchdayId;

  if (currentMatchdayId && candidateMatchdayId === currentMatchdayId) {
    return 1;
  }

  if (currentCompetitionId && currentSeasonId) {
    if (
      candidateCompetitionId === currentCompetitionId &&
      candidateSeasonId === currentSeasonId &&
      !candidateMatchdayId
    ) {
      return 2;
    }

    if (candidateCompetitionId === currentCompetitionId && !candidateSeasonId && !candidateMatchdayId) {
      return 3;
    }

    return candidateIsGeneral ? 4 : null;
  }

  if (currentCompetitionId) {
    if (candidateCompetitionId === currentCompetitionId && !candidateSeasonId && !candidateMatchdayId) {
      return 3;
    }

    return candidateIsGeneral ? 4 : null;
  }

  return candidateIsGeneral ? 4 : null;
}

export function buildPublicMoreArticleScopes(current: PublicMoreArticleContext): PublicMoreArticleScope[] {
  const competitionId = cleanText(current.competition_id);
  const seasonId = cleanText(current.season_id);
  const matchdayId = cleanText(current.matchday_id);
  const scopes: PublicMoreArticleScope[] = [];

  if (matchdayId) {
    scopes.push({
      priority: 1,
      filter: equalsFilter("matchday_id", matchdayId),
    });
  }

  if (competitionId && seasonId) {
    scopes.push({
      priority: 2,
      filter: `${equalsFilter("competition_id", competitionId)}&${equalsFilter("season_id", seasonId)}&matchday_id=is.null`,
    });
  }

  if (competitionId) {
    scopes.push({
      priority: 3,
      filter: `${equalsFilter("competition_id", competitionId)}&season_id=is.null&matchday_id=is.null`,
    });
  }

  scopes.push({
    priority: 4,
    filter: "competition_id=is.null&season_id=is.null&matchday_id=is.null",
  });

  return scopes;
}

export async function selectPublicMoreArticles<T extends PublicMoreArticleContext>(
  current: PublicMoreArticleContext,
  readScope: (scope: PublicMoreArticleScope, limit: number) => Promise<readonly T[]>,
): Promise<T[]> {
  const selected: T[] = [];
  const selectedIds = new Set([current.id]);

  for (const scope of buildPublicMoreArticleScopes(current)) {
    const remaining = PUBLIC_MORE_ARTICLES_LIMIT - selected.length;
    if (remaining <= 0) {
      break;
    }

    const candidates = await readScope(scope, remaining);
    for (const candidate of candidates) {
      if (selectedIds.has(candidate.id) || publicArticleContextPriority(candidate, current) !== scope.priority) {
        continue;
      }

      selected.push(candidate);
      selectedIds.add(candidate.id);

      if (selected.length === PUBLIC_MORE_ARTICLES_LIMIT) {
        break;
      }
    }
  }

  return selected;
}
