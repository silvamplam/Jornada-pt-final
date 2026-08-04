import type { ArticleLinkCandidate, SourceCollectionSummary } from "@/lib/redacao-automatica/types";

export type NewsroomCurrentFeedCandidate = Readonly<{
  sourceCode: string;
  articleUrl: string;
}>;

export type NewsroomCurrentFeedPersistenceAction =
  | "created"
  | "updated"
  | "reused";

export type NewsroomCurrentFeedPersistenceSummary = Readonly<{
  createdCount: number;
  updatedCount: number;
  reusedCount: number;
  availableCount: number;
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

function classifyCandidates(
  collections: readonly SourceCollectionSummary[],
  knownIdentities: ReadonlySet<string>,
): Readonly<{
  candidates: readonly NewsroomCurrentFeedCandidate[];
  alreadyKnownCount: number;
}> {
  const seen = new Set<string>();
  const selected: NewsroomCurrentFeedCandidate[] = [];
  let alreadyKnownCount = 0;

  for (const collection of collections) {
    for (const candidate of collection.candidates) {
      const candidateIdentity = identity(candidate.sourceCode, candidate.normalizedUrl);
      if (seen.has(candidateIdentity)) {
        continue;
      }

      seen.add(candidateIdentity);
      if (knownIdentities.has(candidateIdentity)) {
        alreadyKnownCount += 1;
        continue;
      }

      selected.push({
        sourceCode: candidate.sourceCode,
        articleUrl: candidate.normalizedUrl,
      });
    }
  }

  return { candidates: selected, alreadyKnownCount };
}

export function selectNewsroomCurrentFeedCandidates(
  collections: readonly SourceCollectionSummary[],
  knownIdentities: ReadonlySet<string>,
): Readonly<{
  candidates: readonly NewsroomCurrentFeedCandidate[];
  availableNewCount: number;
  alreadyKnownCount: number;
  truncated: false;
}> {
  const classification = classifyCandidates(collections, knownIdentities);

  return {
    candidates: classification.candidates,
    availableNewCount: classification.candidates.length,
    alreadyKnownCount: classification.alreadyKnownCount,
    truncated: false,
  };
}

export function summarizeNewsroomCurrentFeedPersistence(
  actions: readonly (NewsroomCurrentFeedPersistenceAction | null)[],
): NewsroomCurrentFeedPersistenceSummary {
  const createdCount = actions.filter((action) => action === "created").length;
  const updatedCount = actions.filter((action) => action === "updated").length;
  const reusedCount = actions.filter((action) => action === "reused").length;

  return {
    createdCount,
    updatedCount,
    reusedCount,
    availableCount: createdCount + updatedCount + reusedCount,
  };
}
