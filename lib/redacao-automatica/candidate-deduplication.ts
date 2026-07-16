import type { ArticleLinkCandidate } from "@/lib/redacao-automatica/types";

export type CandidateDeduplicationResult = Readonly<{
  candidates: readonly ArticleLinkCandidate[];
  duplicateCount: number;
}>;

export function deduplicateArticleCandidates(
  candidates: readonly ArticleLinkCandidate[],
): CandidateDeduplicationResult {
  const seenCandidates = new Set<string>();
  const uniqueCandidates: ArticleLinkCandidate[] = [];
  let duplicateCount = 0;

  for (const candidate of candidates) {
    const identity = `${candidate.sourceCode}\u0000${candidate.normalizedUrl}`;

    if (seenCandidates.has(identity)) {
      duplicateCount += 1;
      continue;
    }

    seenCandidates.add(identity);
    uniqueCandidates.push(candidate);
  }

  return {
    candidates: uniqueCandidates,
    duplicateCount,
  };
}
