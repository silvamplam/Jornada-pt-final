export type MatchVideoSummaryCandidateView = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: string | null;
  channelTitle: string | null;
  isEmbeddable: boolean | null;
  confidence: number | null;
  summaryKind: "full" | "flash";
};

export type MatchVideoSummaryDiagnosticView = {
  id: string;
  title: string;
  sourceProvider: "vsports" | "youtube";
  sourceUrl: string | null;
  summaryKind: "full" | "flash" | "not-summary";
  reason:
    | "full"
    | "flash"
    | "not-summary"
    | "outside-window"
    | "teams-not-recognized"
    | "score-mismatch"
    | "ambiguous-match"
    | "already-associated"
    | "no-playable-media"
    | "not-found"
    | "source-unavailable";
};

export type MatchVideoSummaryStateRow = {
  matchId: string;
  label: string;
  status: "associated" | "candidate" | "missing" | "waiting";
  roundupId: string | null;
  videoUrl: string | null;
  candidates: MatchVideoSummaryCandidateView[];
  diagnostics: MatchVideoSummaryDiagnosticView[];
};

export type MatchVideoSummaryState = {
  matchdayId: string;
  totalGames: number;
  associatedCount: number;
  candidateCount: number;
  missingCount: number;
  waitingCount: number;
  rows: MatchVideoSummaryStateRow[];
  sourceChannels?: string[];
  message?: string;
};

export function matchVideoSummaryStateNeedsSync(state: MatchVideoSummaryState) {
  return state.rows.some((row) => (
    row.status === "missing"
    || (
      row.status === "candidate"
      && row.candidates.some((candidate) => candidate.summaryKind === "flash")
      && !row.candidates.some((candidate) => candidate.summaryKind === "full")
    )
  ));
}
