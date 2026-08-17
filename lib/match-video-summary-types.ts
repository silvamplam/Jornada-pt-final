export type MatchVideoSummaryCandidateView = {
  id: string;
  title: string;
  videoUrl: string;
  thumbnailUrl: string | null;
  duration: string | null;
  channelTitle: string | null;
  isEmbeddable: boolean | null;
  confidence: number | null;
};

export type MatchVideoSummaryStateRow = {
  matchId: string;
  label: string;
  status: "associated" | "candidate" | "missing" | "waiting";
  roundupId: string | null;
  videoUrl: string | null;
  candidates: MatchVideoSummaryCandidateView[];
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
