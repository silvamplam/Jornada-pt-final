import {
  extractArticleCandidate,
  type ArticleExtractionDependencies,
} from "@/lib/redacao-automatica/article-extraction-service";
import type {
  ArticleLinkCandidate,
  CollectionError,
  NormalizedDetectedArticle,
  OperationResult,
} from "@/lib/redacao-automatica/types";

export type ArticleCandidatePair = readonly [
  first: ArticleLinkCandidate,
  second: ArticleLinkCandidate,
];

type ArticleCandidateExtractionResult = OperationResult<
  NormalizedDetectedArticle,
  CollectionError
>;

export type ArticlePairExtractionResults = readonly [
  first: ArticleCandidateExtractionResult,
  second: ArticleCandidateExtractionResult,
];

function duplicateCandidateError(
  candidate: ArticleLinkCandidate,
): CollectionError {
  return {
    code: "duplicate",
    stage: "normalization",
    sourceCode: candidate.sourceCode,
    url: candidate.normalizedUrl,
    recoverable: false,
    detail: "O segundo candidato duplica o primeiro candidato do par.",
  };
}

export async function extractTwoArticleCandidates(
  candidates: ArticleCandidatePair,
  dependencies: ArticleExtractionDependencies,
): Promise<ArticlePairExtractionResults> {
  const [firstCandidate, secondCandidate] = candidates;
  const hasDuplicateIdentity =
    firstCandidate.sourceCode === secondCandidate.sourceCode &&
    firstCandidate.normalizedUrl === secondCandidate.normalizedUrl;

  const firstResult = await extractArticleCandidate(firstCandidate, dependencies);

  if (hasDuplicateIdentity) {
    return [
      firstResult,
      { ok: false, error: duplicateCandidateError(secondCandidate) },
    ];
  }

  const secondResult = await extractArticleCandidate(
    secondCandidate,
    dependencies,
  );

  return [firstResult, secondResult];
}
