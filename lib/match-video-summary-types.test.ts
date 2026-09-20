import assert from "node:assert/strict";
import test from "node:test";

import {
  matchVideoSummaryStateNeedsSync,
  type MatchVideoSummaryState,
} from "./match-video-summary-types";

function stateWithCandidates(summaryKinds: Array<"full" | "flash">): MatchVideoSummaryState {
  return {
    matchdayId: "matchday-7",
    totalGames: 1,
    associatedCount: 0,
    candidateCount: summaryKinds.length > 0 ? 1 : 0,
    missingCount: summaryKinds.length > 0 ? 0 : 1,
    waitingCount: 0,
    rows: [{
      matchId: "sporting-arouca",
      label: "Sporting 2 - 2 Arouca",
      status: summaryKinds.length > 0 ? "candidate" : "missing",
      roundupId: null,
      videoUrl: null,
      candidates: summaryKinds.map((summaryKind, index) => ({
        id: `candidate-${index}`,
        title: summaryKind === "full" ? "Resumo Sporting 2-2 Arouca" : "Resumo Flash Sporting 2-2 Arouca",
        videoUrl: `https://www.youtube.com/watch?v=video${index}`,
        thumbnailUrl: null,
        duration: null,
        channelTitle: "VSPORTS",
        isEmbeddable: true,
        confidence: 100,
        summaryKind,
      })),
      diagnostics: [],
    }],
  };
}

test("cron continua com candidato apenas flash e pára depois de descobrir full", () => {
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithCandidates([])), true);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithCandidates(["flash"])), true);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithCandidates(["flash", "full"])), false);
  assert.equal(matchVideoSummaryStateNeedsSync(stateWithCandidates(["full"])), false);
});
