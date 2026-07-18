export type ClassificationSplit = {
  played: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
};

export type ClassificationRecentResult = {
  label: string;
  title: string;
};

export type ClassificationParticipant = {
  team_id: string;
  team: {
    name: string;
  } | null;
};

export type ClassificationMatchday = {
  id: string;
  season_id: string;
  number: number;
};

export type ClassificationMatch = {
  season_id: string;
  matchday_id: string | null;
  home_team_id: string;
  away_team_id: string;
  scheduled_date?: string | null;
  kickoff_at: string | null;
  status: string;
  home_score: number | string | null;
  away_score: number | string | null;
};

export type ClassificationRow = {
  teamId: string;
  name: string;
  played: number;
  homePlayed: number;
  awayPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  recentForm: ClassificationRecentResult[];
  home: ClassificationSplit;
  away: ClassificationSplit;
};

const LISBON_CIVIL_DATE_FORMATTER = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Lisbon",
  year: "numeric",
  month: "2-digit",
  day: "2-digit"
});

function resolveClassificationScheduledDate(match: ClassificationMatch) {
  const scheduledDate = match.scheduled_date?.trim() ?? "";
  if (scheduledDate) return scheduledDate;
  if (!match.kickoff_at) return "";

  const kickoff = new Date(match.kickoff_at);
  if (Number.isNaN(kickoff.getTime())) return "";

  const parts = LISBON_CIVIL_DATE_FORMATTER.formatToParts(kickoff);
  const year = parts.find((part) => part.type === "year")?.value;
  const month = parts.find((part) => part.type === "month")?.value;
  const day = parts.find((part) => part.type === "day")?.value;

  return year && month && day ? `${year}-${month}-${day}` : "";
}

function compareMatchSchedule(first: ClassificationMatch, second: ClassificationMatch) {
  const firstDate = resolveClassificationScheduledDate(first);
  const secondDate = resolveClassificationScheduledDate(second);

  if (firstDate !== secondDate) {
    if (!firstDate) return 1;
    if (!secondDate) return -1;
    return firstDate.localeCompare(secondDate);
  }

  if (first.kickoff_at && second.kickoff_at) {
    const firstTime = new Date(first.kickoff_at).getTime();
    const secondTime = new Date(second.kickoff_at).getTime();
    const firstValid = !Number.isNaN(firstTime);
    const secondValid = !Number.isNaN(secondTime);

    if (firstValid && secondValid && firstTime !== secondTime) return firstTime - secondTime;
    if (firstValid !== secondValid) return firstValid ? -1 : 1;
  } else if (first.kickoff_at !== second.kickoff_at) {
    return first.kickoff_at ? -1 : 1;
  }

  return (
    first.home_team_id.localeCompare(second.home_team_id) ||
    first.away_team_id.localeCompare(second.away_team_id)
  );
}

export const STAT_COLUMNS: Array<{ key: keyof ClassificationSplit; label: string }> = [
  { key: "played", label: "J" },
  { key: "wins", label: "V" },
  { key: "draws", label: "E" },
  { key: "losses", label: "D" },
  { key: "goalsFor", label: "GM" },
  { key: "goalsAgainst", label: "GS" },
  { key: "goalDifference", label: "DG" },
  { key: "points", label: "PTS" }
];

export function emptyClassificationSplit(): ClassificationSplit {
  return {
    played: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points: 0
  };
}

export function totalClassificationStats(row: ClassificationRow): ClassificationSplit {
  return {
    played: row.played,
    wins: row.wins,
    draws: row.draws,
    losses: row.losses,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
    goalDifference: row.goalDifference,
    points: row.points
  };
}

function toScore(value: number | string | null | undefined) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  const score = typeof value === "number" ? value : Number(value);
  return Number.isInteger(score) && score >= 0 ? score : null;
}

function addSplitResult(split: ClassificationSplit, goalsFor: number, goalsAgainst: number) {
  split.played += 1;
  split.goalsFor += goalsFor;
  split.goalsAgainst += goalsAgainst;
  split.goalDifference = split.goalsFor - split.goalsAgainst;

  if (goalsFor > goalsAgainst) {
    split.wins += 1;
    split.points += 3;
  } else if (goalsFor < goalsAgainst) {
    split.losses += 1;
  } else {
    split.draws += 1;
    split.points += 1;
  }
}

function syncTotalFromSplits(row: ClassificationRow) {
  row.homePlayed = row.home.played;
  row.awayPlayed = row.away.played;
  row.played = row.home.played + row.away.played;
  row.wins = row.home.wins + row.away.wins;
  row.draws = row.home.draws + row.away.draws;
  row.losses = row.home.losses + row.away.losses;
  row.goalsFor = row.home.goalsFor + row.away.goalsFor;
  row.goalsAgainst = row.home.goalsAgainst + row.away.goalsAgainst;
  row.goalDifference = row.goalsFor - row.goalsAgainst;
  row.points = row.home.points + row.away.points;
}

export function buildAccumulatedClassification({
  participants,
  matches,
  matchdays,
  selectedMatchday
}: {
  participants: ClassificationParticipant[];
  matches: ClassificationMatch[];
  matchdays: ClassificationMatchday[];
  selectedMatchday: ClassificationMatchday | null;
}): ClassificationRow[] {
  const rows = new Map<string, ClassificationRow>();
  const matchdaysById = new Map(matchdays.map((matchday) => [matchday.id, matchday]));

  participants.forEach((participant) => {
    if (!participant.team) {
      return;
    }

    rows.set(participant.team_id, {
      teamId: participant.team_id,
      name: participant.team.name,
      played: 0,
      homePlayed: 0,
      awayPlayed: 0,
      wins: 0,
      draws: 0,
      losses: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      recentForm: [],
      home: emptyClassificationSplit(),
      away: emptyClassificationSplit()
    });
  });

  if (!selectedMatchday) {
    return Array.from(rows.values()).sort((a, b) => a.name.localeCompare(b.name, "pt"));
  }

  const finishedMatches = matches
    .map((match) => ({
      match,
      matchday: match.matchday_id ? matchdaysById.get(match.matchday_id) ?? null : null
    }))
    .filter(({ match, matchday }) => {
      const homeScore = toScore(match.home_score);
      const awayScore = toScore(match.away_score);

      return (
        Boolean(matchday) &&
        match.season_id === selectedMatchday.season_id &&
        matchday!.number <= selectedMatchday.number &&
        match.status?.trim().toLowerCase() === "finished" &&
        homeScore !== null &&
        awayScore !== null
      );
    })
    .sort(
      (a, b) =>
        a.matchday!.number - b.matchday!.number ||
        compareMatchSchedule(a.match, b.match)
    );

  finishedMatches.forEach(({ match }) => {
    const homeScore = toScore(match.home_score);
    const awayScore = toScore(match.away_score);

    if (homeScore === null || awayScore === null) {
      return;
    }

    const home = rows.get(match.home_team_id);
    const away = rows.get(match.away_team_id);

    if (!home || !away) {
      return;
    }

    addSplitResult(home.home, homeScore, awayScore);
    addSplitResult(away.away, awayScore, homeScore);

    if (homeScore > awayScore) {
      home.recentForm.push({
        label: "V(C)",
        title: `V(C) - vs ${away.name}, ${homeScore}-${awayScore}`
      });
      away.recentForm.push({
        label: "D(F)",
        title: `D(F) - vs ${home.name}, ${awayScore}-${homeScore}`
      });
    } else if (homeScore < awayScore) {
      home.recentForm.push({
        label: "D(C)",
        title: `D(C) - vs ${away.name}, ${homeScore}-${awayScore}`
      });
      away.recentForm.push({
        label: "V(F)",
        title: `V(F) - vs ${home.name}, ${awayScore}-${homeScore}`
      });
    } else {
      home.recentForm.push({
        label: "E(C)",
        title: `E(C) - vs ${away.name}, ${homeScore}-${awayScore}`
      });
      away.recentForm.push({
        label: "E(F)",
        title: `E(F) - vs ${home.name}, ${awayScore}-${homeScore}`
      });
    }
  });

  rows.forEach((row) => {
    syncTotalFromSplits(row);
    row.recentForm = row.recentForm.slice(-4);
  });

  return Array.from(rows.values()).sort(
    (a, b) =>
      b.points - a.points ||
      b.goalDifference - a.goalDifference ||
      b.goalsFor - a.goalsFor ||
      a.name.localeCompare(b.name, "pt")
  );
}
