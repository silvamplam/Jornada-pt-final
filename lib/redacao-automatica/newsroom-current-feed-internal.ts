import type { ArticleLinkCandidate, SourceCollectionSummary } from "@/lib/redacao-automatica/types";

export type NewsroomCurrentFeedCandidate = Readonly<{
  sourceCode: string;
  articleUrl: string;
}>;

function identity(sourceCode: string, articleUrl: string): string {
  return `${sourceCode.trim().toLowerCase()}\u0000${articleUrl.trim()}`;
}

export function newsroomCurrentFeedIdentity(
  sourceCode: string,
  articleUrl: string,
): string {
  return identity(sourceCode, articleUrl);
}

function allNewCandidates(
  collections: readonly SourceCollectionSummary[],
  knownIdentities: ReadonlySet<string>,
): readonly NewsroomCurrentFeedCandidate[] {
  const seen = new Set<string>();
  const selected: NewsroomCurrentFeedCandidate[] = [];

  for (const collection of collections) {
    for (const candidate of collection.candidates) {
      const candidateIdentity = identity(candidate.sourceCode, candidate.normalizedUrl);
      if (knownIdentities.has(candidateIdentity) || seen.has(candidateIdentity)) {
        continue;
      }

      seen.add(candidateIdentity);
      selected.push({
        sourceCode: candidate.sourceCode,
        articleUrl: candidate.normalizedUrl,
      });
    }
  }

  return selected;
}

export function selectNewsroomCurrentFeedCandidates(
  collections: readonly SourceCollectionSummary[],
  knownIdentities: ReadonlySet<string>,
): Readonly<{
  candidates: readonly NewsroomCurrentFeedCandidate[];
  availableNewCount: number;
  truncated: false;
}> {
  const candidates = allNewCandidates(collections, knownIdentities);

  return {
    candidates,
    availableNewCount: candidates.length,
    truncated: false,
  };
}
