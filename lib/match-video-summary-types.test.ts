import assert from "node:assert/strict";
import test from "node:test";

import {
  matchVideoSummaryStateNeedsSync,
  type MatchVideoSummaryCandidateView,
  type MatchVideoSummaryState,
  type MatchVideoSummaryStateRow,
} from "./match-video-summary-types";

function candidate(
  provider: "youtube" | "vsports",
  summaryKind: "full" | "flash",
  index = 0,
): MatchVideoSummaryCandidateView {
  return {
    id: `candidate-${provider}-${index}`,
    provider,
    title: summaryKind === "full" ? "Resumo Sporting 2-2 Arouca" : "Resumo Flash Sporting 2-2 Arouca",
    videoUrl: provider === "youtube"
      ? `https://www.youtube.com/watch?v=video${index}`
      : `https://vsports.pt/vsports/embd/resumo-${130983 + index}`,
    sourceUrl: provider === "youtube"
      ? `https://www.youtube.com/watch?v=video${index}`
      : `https://vsports.pt/vsports/vod/resumo-${130983 + index}`,
    thumbnailUrl: null,
    duration: null,
    channelTitle: provider === "youtube" ? "VSPORTS - Liga Portugal" : "VSPORTS",
    isEmbeddable: true,
    confidence: 100,
    summaryKind,
  };
}

function stateWithRow(input: {
  status: MatchVideoSummaryStateRow["status"];
  associatedProvider?: MatchVideoSummaryStateRow["associatedProvider"];
  candidates?: MatchVideoSummaryCandidateView[];
}): MatchVideoSummaryState {
  const candidates = input.candidates ?? [];
  return {
    matchdayId: "matchday-7",
    totalGames: 1,
    associatedCount: input.status === "associated" ? 1 : 0,
    candidateCount: input.status === "candidate" ? 1 : 0,
    missingCount: input.status === "missing" ? 1 : 0,
    waitingCount: 0,
    rows: [{
      matchId: "sporting-arouca",
      label: "Sporting 2 - 2 Arouca",
      status: input.status,
      roundupId: input.status === "associated" ? "roundup-1" : null,
      videoUrl: input.status === "associated" ? "https://vsports.pt/vsports/embd/resumo-130983" : null,
      associatedProvider: input.associatedProvider ?? null,
      candidates,
      diagnostics: [],
    }],
  };
}

test("cron continua com missing, flash ou apenas provider VSPORTS", () => {
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({ status: "missing" })), true);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({
    status: "candidate",
    candidates: [candidate("vsports", "full")],
  })), true);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({
    status: "candidate",
    candidates: [candidate("youtube", "flash")],
  })), true);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({
    status: "candidate",
    candidates: [candidate("youtube", "full")],
  })), false);
});

test("VSPORTS publicado continua elegível até existir candidato YouTube full", () => {
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({
    status: "associated",
    associatedProvider: "vsports",
  })), true);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({
    status: "associated",
    associatedProvider: "vsports",
    candidates: [candidate("youtube", "flash")],
  })), true);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({
    status: "associated",
    associatedProvider: "vsports",
    candidates: [candidate("youtube", "full")],
  })), false);
});

test("YouTube realmente publicado encerra discovery independentemente de candidatos", () => {
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithRow({
    status: "associated",
    associatedProvider: "youtube",
  })), false);
});
