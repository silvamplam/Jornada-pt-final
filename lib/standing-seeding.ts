import { fetchSupabaseAdminTable, writeSupabaseAdmin } from "@/lib/supabase";

type ExistingStandingRow = {
  id: string;
  team_id: string;
  position: number;
  data_source?: string | null;
  manual_override?: boolean | null;
};

type SeasonParticipant = {
  team_id: string;
  display_order: number | null;
  status: string | null;
};

type MatchForStanding = {
  matchday_id: string | null;
  home_team_id: string;
  away_team_id: string;
  status: string;
  scheduled_date: string | null;
  kickoff_at: string | null;
  home_score: number | null;
  away_score: number | null;
};

type MatchdayForStanding = {
  id: string;
  number: number;
};

type TeamCandidate = {
  teamId: string;
  displayOrder: number;
};

type StandingStats = {
  teamId: string;
  displayOrder: number;
  position: number;
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goals_for: number;
  goals_against: number;
  goal_difference: number;
  points: number;
  home_played: number;
  home_wins: number;
  home_draws: number;
  home_losses: number;
  away_played: number;
  away_wins: number;
  away_draws: number;
  away_losses: number;
};

type SeedStandingRowsInput = {
  standingId: string;
  competitionId: string;
  seasonId: string;
  matchdayId?: string | null;
  momentLabel?: string | null;
  syncMetadataAvailable: boolean;
};

function emptyStats(candidate: TeamCandidate): StandingStats {
  return {
    teamId: candidate.teamId,
    displayOrder: candidate.displayOrder,
    position: candidate.displayOrder,
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goals_for: 0,
    goals_against: 0,
    goal_difference: 0,
    points: 0,
    home_played: 0,
    home_wins: 0,
    home_draws: 0,
    home_losses: 0,
    away_played: 0,
    away_wins: 0,
    away_draws: 0,
    away_losses: 0
  };
}

function isFinished(match: MatchForStanding) {
  if (match.home_score === null || match.away_score === null) {
    return false;
  }

  const status = match.status.toLowerCase();
  return (
    status.includes("final") ||
    status.includes("termin") ||
    status.includes("finished") ||
    status === "ft"
  );
}

function shouldCountMatch(
  match: MatchForStanding,
  matchdayId: string | null | undefined,
  matchdayNumbers: Map<string, number>,
  momentLabel: string | null | undefined
) {
  if (!isFinished(match)) {
    return false;
  }

  if (!matchdayId) {
    return true;
  }

  if (!match.matchday_id) {
    return false;
  }

  const currentNumber = matchdayNumbers.get(matchdayId);
  const matchNumber = matchdayNumbers.get(match.matchday_id);

  if (currentNumber === undefined || matchNumber === undefined) {
    return false;
  }

  const normalizedMoment = (momentLabel ?? "").toLowerCase();

  if (normalizedMoment.includes("antes")) {
    return matchNumber < currentNumber;
  }

  return matchNumber <= currentNumber;
}

function addTeamCandidate(candidates: TeamCandidate[], seen: Set<string>, teamId: string) {
  if (!teamId || seen.has(teamId)) {
    return;
  }

  seen.add(teamId);
  candidates.push({
    teamId,
    displayOrder: candidates.length + 1
  });
}

function buildFallbackCandidates(matches: MatchForStanding[]) {
  const candidates: TeamCandidate[] = [];
  const seen = new Set<string>();

  for (const match of matches) {
    addTeamCandidate(candidates, seen, match.home_team_id);
    addTeamCandidate(candidates, seen, match.away_team_id);
  }

  return candidates;
}

async function readSeasonParticipants(seasonId: string): Promise<TeamCandidate[]> {
  try {
    const participants = await fetchSupabaseAdminTable<SeasonParticipant>(
      `season_teams?select=team_id,display_order,status&season_id=eq.${encodeURIComponent(
        seasonId
      )}&status=neq.inactive&order=display_order.asc&limit=500`
    );

    return participants.map((participant, index) => ({
      teamId: participant.team_id,
      displayOrder: participant.display_order ?? index + 1
    }));
  } catch {
    return [];
  }
}

function applyMatch(stats: Map<string, StandingStats>, match: MatchForStanding) {
  const home = stats.get(match.home_team_id);
  const away = stats.get(match.away_team_id);

  if (!home || !away || match.home_score === null || match.away_score === null) {
    return;
  }

  home.played += 1;
  home.home_played += 1;
  home.goals_for += match.home_score;
  home.goals_against += match.away_score;

  away.played += 1;
  away.away_played += 1;
  away.goals_for += match.away_score;
  away.goals_against += match.home_score;

  if (match.home_score > match.away_score) {
    home.wins += 1;
    home.home_wins += 1;
    home.points += 3;
    away.losses += 1;
    away.away_losses += 1;
  } else if (match.home_score < match.away_score) {
    away.wins += 1;
    away.away_wins += 1;
    away.points += 3;
    home.losses += 1;
    home.home_losses += 1;
  } else {
    home.draws += 1;
    home.home_draws += 1;
    home.points += 1;
    away.draws += 1;
    away.away_draws += 1;
    away.points += 1;
  }

  home.goal_difference = home.goals_for - home.goals_against;
  away.goal_difference = away.goals_for - away.goals_against;
}

function rowBody(
  standingId: string,
  row: StandingStats,
  syncMetadataAvailable: boolean
): Record<string, string | number | boolean | null> {
  const body: Record<string, string | number | boolean | null> = {
    standing_id: standingId,
    team_id: row.teamId,
    position: row.position,
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goals_for: row.goals_for,
    goals_against: row.goals_against,
    goal_difference: row.goal_difference,
    points: row.points,
    home_played: row.home_played,
    home_wins: row.home_wins,
    home_draws: row.home_draws,
    home_losses: row.home_losses,
    away_played: row.away_played,
    away_wins: row.away_wins,
    away_draws: row.away_draws,
    away_losses: row.away_losses
  };

  if (syncMetadataAvailable) {
    body.data_source = "manual";
    body.sync_status = "manual";
    body.manual_override = false;
    body.external_provider = null;
    body.external_id = null;
    body.last_synced_at = null;
  }

  return body;
}

export async function seedStandingRowsFromSeason({
  standingId,
  competitionId,
  seasonId,
  matchdayId,
  momentLabel,
  syncMetadataAvailable
}: SeedStandingRowsInput): Promise<{ created: number; updated: number; candidates: number }> {
  const rowSelect = syncMetadataAvailable
    ? "id,team_id,position,data_source,manual_override"
    : "id,team_id,position";

  const [existingRows, matches, matchdays] = await Promise.all([
    fetchSupabaseAdminTable<ExistingStandingRow>(
      `standing_rows?select=${rowSelect}&standing_id=eq.${encodeURIComponent(standingId)}&limit=500`
    ),
    fetchSupabaseAdminTable<MatchForStanding>(
      `matches?select=matchday_id,home_team_id,away_team_id,status,scheduled_date,kickoff_at,home_score,away_score&competition_id=eq.${encodeURIComponent(
        competitionId
      )}&season_id=eq.${encodeURIComponent(seasonId)}&order=scheduled_date.asc.nullslast,kickoff_at.asc.nullslast,home_team_id.asc,away_team_id.asc&limit=500`
    ),
    fetchSupabaseAdminTable<MatchdayForStanding>(
      `matchdays?select=id,number&season_id=eq.${encodeURIComponent(seasonId)}&order=number.asc&limit=100`
    )
  ]);

  const participantCandidates = await readSeasonParticipants(seasonId);
  const candidates = participantCandidates.length > 0 ? participantCandidates : buildFallbackCandidates(matches);
  const stats = new Map(candidates.map((candidate) => [candidate.teamId, emptyStats(candidate)]));
  const matchdayNumbers = new Map(matchdays.map((matchday) => [matchday.id, matchday.number]));

  for (const match of matches) {
    if (shouldCountMatch(match, matchdayId, matchdayNumbers, momentLabel)) {
      applyMatch(stats, match);
    }
  }

  const calculatedRows = Array.from(stats.values()).sort((a, b) => {
    return (
      b.points - a.points ||
      b.goal_difference - a.goal_difference ||
      b.goals_for - a.goals_for ||
      b.wins - a.wins ||
      a.displayOrder - b.displayOrder
    );
  });

  calculatedRows.forEach((row, index) => {
    row.position = index + 1;
  });

  const existingByTeam = new Map(existingRows.map((row) => [row.team_id, row]));
  const rowsToCreate = calculatedRows.filter((row) => !existingByTeam.has(row.teamId));
  const rowsToUpdate = calculatedRows.filter((row) => {
    const existing = existingByTeam.get(row.teamId);
    return Boolean(existing && !existing.manual_override);
  });

  if (rowsToCreate.length > 0) {
    await writeSupabaseAdmin("standing_rows", {
      method: "POST",
      body: JSON.stringify(rowsToCreate.map((row) => rowBody(standingId, row, syncMetadataAvailable)))
    });
  }

  await Promise.all(
    rowsToUpdate.map((row) => {
      const existing = existingByTeam.get(row.teamId);

      if (!existing) {
        return Promise.resolve();
      }

      const body = rowBody(standingId, row, syncMetadataAvailable);
      delete body.standing_id;
      delete body.team_id;

      return writeSupabaseAdmin(`standing_rows?id=eq.${encodeURIComponent(existing.id)}`, {
        method: "PATCH",
        body: JSON.stringify(body)
      });
    })
  );

  return {
    created: rowsToCreate.length,
    updated: rowsToUpdate.length,
    candidates: candidates.length
  };
}
