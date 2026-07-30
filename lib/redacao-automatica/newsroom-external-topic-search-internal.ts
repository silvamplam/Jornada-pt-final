import {
  hasNewsroomTopicSearchTerms,
  scoreNewsroomTopicCandidate,
} from "@/lib/redacao-automatica/newsroom-topic-search";
import type {
  HttpNewsroomIngestionError,
  HttpNewsroomIngestionErrorCode,
} from "@/lib/redacao-automatica/http-newsroom-ingestion-internal";
import type {
  NewsroomPersistenceErrorCode,
} from "@/lib/redacao-automatica/newsroom-article-persistence";
import type {
  NewsroomTopicArchiveOutcome,
} from "@/lib/redacao-automatica/newsroom-topic-search";
import type {
  ArticleLinkCandidate,
  CollectionError,
  OperationResult,
  SourceCollectionSummary,
  SourceConfiguration,
} from "@/lib/redacao-automatica/types";

type ExternalTopicCollectionInput = Readonly<{
  sourceCode: string;
  detectedAt: string;
  executionMode: "manual";
}>;

type ExternalTopicArticleIngestionInput = Readonly<{
  sourceCode: string;
  articleUrl: string;
  detectedAt: string;
  extractedAt: string;
}>;

type ExternalTopicArticleIngestionResult = OperationResult<
  Readonly<{
    article: Readonly<{
      id: string;
      action: "created" | "updated" | "reused";
    }>;
  }>,
  HttpNewsroomIngestionError
>;

export type NewsroomExternalTopicArchiveSnapshot = Readonly<{
  articleIds: readonly string[];
  reasonsByArticleId: Readonly<Record<string, NewsroomTopicArchiveOutcome>>;
}>;

export type NewsroomExternalTopicRecoveryCandidate = Readonly<{
  id: string;
  sourceCode: string;
  normalizedUrl: string;
}>;

const MAX_TOPIC_LENGTH = 180;
export const NEWSROOM_TOPIC_TARGET_ELIGIBLE = 4;
export const NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT = 8;
export const NEWSROOM_TOPIC_SOURCE_ATTEMPT_LIMIT = 6;
export const NEWSROOM_TOPIC_RECOVERY_LIMIT = 4;
export const NEWSROOM_TOPIC_INGESTION_CONCURRENCY = 2;

export const NEWSROOM_TOPIC_FAILURE_STAGES = [
  "validation",
  "configuration",
  "listing",
  "loading",
  "article",
  "parsing",
  "normalization",
  "persistence",
  "snapshot",
] as const;

export type NewsroomTopicFailureStage =
  (typeof NEWSROOM_TOPIC_FAILURE_STAGES)[number];

export const NEWSROOM_TOPIC_FAILURE_CODES = [
  "source_not_found",
  "source_inactive",
  "legal_hold",
  "source_forbidden",
  "adapter_missing",
  "adapter_source_mismatch",
  "invalid_adapter_key",
  "duplicate_adapter_key",
  "invalid_url",
  "domain_not_allowed",
  "private_network_blocked",
  "dns_resolution_failed",
  "redirect_blocked",
  "timeout",
  "http_error",
  "response_too_large",
  "load_failed",
  "unsupported_content",
  "parse_failed",
  "required_field_missing",
  "duplicate",
  "input_invalid",
  "adapter_unavailable",
  "normalized_article_invalid",
  "parsing_failed",
  "persistence_failed",
  "article_write_failed",
  "snapshot_write_failed",
  "persistence_conflict",
  "persistence_unavailable",
] as const;

export type NewsroomTopicFailureCode =
  (typeof NEWSROOM_TOPIC_FAILURE_CODES)[number];

export const NEWSROOM_TOPIC_PERSISTENCE_CODES = [
  "input_invalid",
  "source_not_found",
  "article_write_failed",
  "snapshot_write_failed",
  "persistence_conflict",
  "persistence_unavailable",
] as const satisfies readonly NewsroomPersistenceErrorCode[];

export type FailureReasonCount = Readonly<{
  sourceCode: string;
  stage: NewsroomTopicFailureStage;
  code: NewsroomTopicFailureCode;
  count: number;
  statusCode?: number;
  persistenceCode?: NewsroomPersistenceErrorCode;
}>;

type FailureReason = Omit<FailureReasonCount, "count">;

export type NewsroomExternalTopicSearchInput = Readonly<{
  topic: string;
  periodDays?: number | null;
  sourceCode?: string | null;
}>;

export type NewsroomExternalTopicSearchStatus =
  | "completed"
  | "partial"
  | "empty";

export type NewsroomExternalTopicSearchStopReason =
  | "target_reached"
  | "attempt_limit"
  | "candidates_exhausted";

export type NewsroomExternalTopicSearchSourceReport = Readonly<{
  sourceCode: string;
  collectionStatus: "completed" | "failed";
  candidateLinkCount: number;
  attemptedArticleCount: number;
  readArticleCount: number;
  failedArticleCount: number;
  discoveredCount: number;
  selectedCount: number;
  ingestedCount: number;
  failedIngestionCount: number;
  rawDiscoveredLinkCount: number;
  rejectedNormalizationCount: number;
  listingDuplicateCount: number;
  uniqueCandidateCount: number;
  positiveCandidateCount: number;
  zeroScoreCandidateCount: number;
  positiveNotAttemptedByLimitCount: number;
  recoveryAttemptedCount: number;
  finalEligibleArticleCount: number;
  failureReasonCounts: readonly FailureReasonCount[];
}>;

export type NewsroomExternalTopicSearchSuccess = Readonly<{
  topic: string;
  requestedSourceCodes: readonly string[];
  status: NewsroomExternalTopicSearchStatus;
  stopReason: NewsroomExternalTopicSearchStopReason;
  candidateLinkCount: number;
  attemptedArticleCount: number;
  readArticleCount: number;
  failedArticleCount: number;
  finalEligibleArticleCount: number;
  articles: readonly Readonly<{
    id: string;
    action: "created" | "updated" | "reused";
  }>[];
  discoveredCount: number;
  selectedCount: number;
  ingestedCount: number;
  createdCount: number;
  updatedCount: number;
  reusedCount: number;
  failedSourceCount: number;
  failedIngestionCount: number;
  rawDiscoveredLinkCount: number;
  rejectedNormalizationCount: number;
  listingDuplicateCount: number;
  uniqueCandidateCount: number;
  positiveCandidateCount: number;
  zeroScoreCandidateCount: number;
  positiveNotAttemptedByLimitCount: number;
  recoveryAttemptedCount: number;
  attemptedExclusionCounts: Readonly<Partial<Record<NewsroomTopicArchiveOutcome, number>>>;
  failureReasonCounts: readonly FailureReasonCount[];
  sources: readonly NewsroomExternalTopicSearchSourceReport[];
}>;

export type NewsroomExternalTopicSearchErrorCode =
  | "input_invalid"
  | "source_unavailable"
  | "collection_unavailable";

export type NewsroomExternalTopicSearchError = Readonly<{
  code: NewsroomExternalTopicSearchErrorCode;
  message: string;
}>;

export type NewsroomExternalTopicSearchResult = OperationResult<
  NewsroomExternalTopicSearchSuccess,
  NewsroomExternalTopicSearchError
>;

export type NewsroomExternalTopicSearchDependencies = Readonly<{
  listSources(): readonly SourceConfiguration[];
  collectSource(
    input: ExternalTopicCollectionInput,
  ): Promise<OperationResult<SourceCollectionSummary, CollectionError>>;
  ingestArticle(
    input: ExternalTopicArticleIngestionInput,
  ): Promise<ExternalTopicArticleIngestionResult>;
  searchArchive?(input: {
    topic: string;
    periodDays: number | null;
    sourceCode: string | null;
  }): Promise<OperationResult<NewsroomExternalTopicArchiveSnapshot, unknown>>;
  listUndatedRecoveryCandidates?(input: {
    topic: string;
    sourceCode: string | null;
    limit: number;
    cooldownHours: number;
    now: Date;
  }): Promise<OperationResult<readonly NewsroomExternalTopicRecoveryCandidate[], unknown>>;
  clock(): Date;
}>;

type RankedCandidate = Readonly<{
  candidate: ArticleLinkCandidate;
  index: number;
  score: number;
}>;

type AttemptCandidate = Readonly<{
  sourceCode: string;
  articleUrl: string;
  origin: "current" | "recovery";
}>;

type IngestionOutcome = Readonly<{
  sourceCode: string;
  origin: "current" | "recovery";
  articleUrl: string;
  ok: boolean;
  articleId: string | null;
  action: "created" | "updated" | "reused" | null;
  failure: FailureReason | null;
}>;

export type NewsroomTopicFailureTuple =
  | readonly [stage: NewsroomTopicFailureStage, code: NewsroomTopicFailureCode, count: number]
  | readonly [
      stage: NewsroomTopicFailureStage,
      code: NewsroomTopicFailureCode,
      count: number,
      statusCode: number,
    ]
  | readonly [
      stage: NewsroomTopicFailureStage,
      code: NewsroomTopicFailureCode,
      count: number,
      persistenceCode: NewsroomPersistenceErrorCode,
    ]
  | readonly [
      stage: NewsroomTopicFailureStage,
      code: NewsroomTopicFailureCode,
      count: number,
      statusCode: number,
      persistenceCode: NewsroomPersistenceErrorCode,
    ];

export type NewsroomTopicSourceTechnicalReport = Readonly<{
  sourceCode: string;
  rawDiscoveredLinkCount: number;
  rejectedNormalizationCount: number;
  listingDuplicateCount: number;
  uniqueCandidateCount: number;
  positiveCandidateCount: number;
  zeroScoreCandidateCount: number;
  positiveNotAttemptedByLimitCount: number;
  attemptedArticleCount: number;
  readArticleCount: number;
  failedArticleCount: number;
  finalEligibleArticleCount: number;
  failures: readonly FailureReasonCount[];
}>;

const FAILURE_STAGE_SET = new Set<string>(NEWSROOM_TOPIC_FAILURE_STAGES);
const FAILURE_CODE_SET = new Set<string>(NEWSROOM_TOPIC_FAILURE_CODES);
const PERSISTENCE_CODE_SET = new Set<string>(NEWSROOM_TOPIC_PERSISTENCE_CODES);
const COMPACT_SOURCE_REPORT_KEYS = new Set([
  "sourceCode",
  "collectionStatus",
  "candidateLinkCount",
  "attemptedArticleCount",
  "readArticleCount",
  "failedArticleCount",
  "discoveredCount",
  "selectedCount",
  "ingestedCount",
  "failedIngestionCount",
  "rawDiscoveredLinkCount",
  "rejectedNormalizationCount",
  "listingDuplicateCount",
  "uniqueCandidateCount",
  "positiveCandidateCount",
  "zeroScoreCandidateCount",
  "positiveNotAttemptedByLimitCount",
  "recoveryAttemptedCount",
  "finalEligibleArticleCount",
  "failures",
]);
const COMPACT_SOURCE_REPORT_COUNT_KEYS = [
  "candidateLinkCount",
  "attemptedArticleCount",
  "readArticleCount",
  "failedArticleCount",
  "discoveredCount",
  "selectedCount",
  "ingestedCount",
  "failedIngestionCount",
  "rawDiscoveredLinkCount",
  "rejectedNormalizationCount",
  "listingDuplicateCount",
  "uniqueCandidateCount",
  "positiveCandidateCount",
  "zeroScoreCandidateCount",
  "positiveNotAttemptedByLimitCount",
  "recoveryAttemptedCount",
  "finalEligibleArticleCount",
] as const;
const TECHNICAL_REPORT_COUNT_KEYS = [
  "rawDiscoveredLinkCount",
  "rejectedNormalizationCount",
  "listingDuplicateCount",
  "uniqueCandidateCount",
  "positiveCandidateCount",
  "zeroScoreCandidateCount",
  "positiveNotAttemptedByLimitCount",
  "attemptedArticleCount",
  "readArticleCount",
  "failedArticleCount",
  "finalEligibleArticleCount",
] as const;

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareFailureReasons(
  left: FailureReasonCount,
  right: FailureReasonCount,
): number {
  return (
    compareText(left.sourceCode, right.sourceCode)
    || compareText(left.stage, right.stage)
    || compareText(left.code, right.code)
    || (left.statusCode ?? -1) - (right.statusCode ?? -1)
    || compareText(left.persistenceCode ?? "", right.persistenceCode ?? "")
  );
}

export function aggregateNewsroomTopicFailureReasons(
  failures: readonly FailureReason[],
): readonly FailureReasonCount[] {
  const groups = new Map<string, FailureReasonCount>();

  for (const failure of failures) {
    const key = JSON.stringify([
      failure.sourceCode,
      failure.stage,
      failure.code,
      failure.statusCode ?? null,
      failure.persistenceCode ?? null,
    ]);
    const existing = groups.get(key);
    groups.set(key, {
      ...failure,
      count: (existing?.count ?? 0) + 1,
    });
  }

  return [...groups.values()].sort(compareFailureReasons);
}

function compactFailureReason(reason: FailureReasonCount): NewsroomTopicFailureTuple {
  if (reason.statusCode !== undefined && reason.persistenceCode !== undefined) {
    return [
      reason.stage,
      reason.code,
      reason.count,
      reason.statusCode,
      reason.persistenceCode,
    ];
  }
  if (reason.statusCode !== undefined) {
    return [reason.stage, reason.code, reason.count, reason.statusCode];
  }
  if (reason.persistenceCode !== undefined) {
    return [reason.stage, reason.code, reason.count, reason.persistenceCode];
  }
  return [reason.stage, reason.code, reason.count];
}

export function compactNewsroomExternalTopicSearchSourceReports(
  reports: readonly NewsroomExternalTopicSearchSourceReport[],
) {
  return reports.map(({ failureReasonCounts, ...report }) => ({
    ...report,
    failures: failureReasonCounts.map(compactFailureReason),
  }));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function parseFailureTuple(
  sourceCode: string,
  value: unknown,
): FailureReasonCount | null {
  if (!Array.isArray(value) || value.length < 3 || value.length > 5) {
    return null;
  }

  const [stage, code, count, fourth, fifth] = value;
  if (
    typeof stage !== "string"
    || !FAILURE_STAGE_SET.has(stage)
    || typeof code !== "string"
    || !FAILURE_CODE_SET.has(code)
    || !Number.isInteger(count)
    || count < 1
    || count > NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT
  ) {
    return null;
  }

  let statusCode: number | undefined;
  let persistenceCode: NewsroomPersistenceErrorCode | undefined;
  if (value.length === 4) {
    if (typeof fourth === "number") {
      statusCode = fourth;
    } else if (typeof fourth === "string" && PERSISTENCE_CODE_SET.has(fourth)) {
      persistenceCode = fourth as NewsroomPersistenceErrorCode;
    } else {
      return null;
    }
  } else if (value.length === 5) {
    if (
      typeof fourth !== "number"
      || typeof fifth !== "string"
      || !PERSISTENCE_CODE_SET.has(fifth)
    ) {
      return null;
    }
    statusCode = fourth;
    persistenceCode = fifth as NewsroomPersistenceErrorCode;
  }

  if (
    (statusCode !== undefined && (
      !Number.isInteger(statusCode)
      || statusCode < 100
      || statusCode > 599
      || code !== "http_error"
    ))
    || (persistenceCode !== undefined && code !== "persistence_failed")
  ) {
    return null;
  }

  return {
    sourceCode,
    stage: stage as NewsroomTopicFailureStage,
    code: code as NewsroomTopicFailureCode,
    count,
    ...(statusCode === undefined ? {} : { statusCode }),
    ...(persistenceCode === undefined ? {} : { persistenceCode }),
  };
}

export function parseNewsroomExternalTopicSearchSourceReports(
  value: string | null | undefined,
): readonly NewsroomTopicSourceTechnicalReport[] {
  try {
    const parsed: unknown = JSON.parse(value ?? "[]");
    if (!Array.isArray(parsed) || parsed.length > NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT) {
      return [];
    }

    const reports: NewsroomTopicSourceTechnicalReport[] = [];
    const seenSources = new Set<string>();
    let totalFailures = 0;
    for (const candidate of parsed) {
      const candidateKeys = isRecord(candidate) ? Object.keys(candidate) : [];
      if (
        !isRecord(candidate)
        || candidateKeys.length !== COMPACT_SOURCE_REPORT_KEYS.size
        || candidateKeys.some((key) => !COMPACT_SOURCE_REPORT_KEYS.has(key))
        || typeof candidate.sourceCode !== "string"
        || !/^[a-z0-9_-]{1,64}$/.test(candidate.sourceCode)
        || seenSources.has(candidate.sourceCode)
        || (
          candidate.collectionStatus !== "completed"
          && candidate.collectionStatus !== "failed"
        )
        || !Array.isArray(candidate.failures)
        || COMPACT_SOURCE_REPORT_COUNT_KEYS.some((key) => (
          !Number.isInteger(candidate[key]) || (candidate[key] as number) < 0
        ))
      ) {
        return [];
      }

      const counts = Object.fromEntries(TECHNICAL_REPORT_COUNT_KEYS.map((key) => [
        key,
        candidate[key],
      ])) as Record<(typeof TECHNICAL_REPORT_COUNT_KEYS)[number], unknown>;
      const failures: FailureReasonCount[] = [];
      const failureKeys = new Set<string>();
      for (const tuple of candidate.failures ?? []) {
        const failure = parseFailureTuple(candidate.sourceCode, tuple);
        if (!failure) {
          return [];
        }
        const failureKey = JSON.stringify([
          failure.stage,
          failure.code,
          failure.statusCode ?? null,
          failure.persistenceCode ?? null,
        ]);
        if (failureKeys.has(failureKey)) {
          return [];
        }
        failureKeys.add(failureKey);
        failures.push(failure);
      }

      const sourceFailureCount = failures.reduce(
        (total, failure) => total + failure.count,
        0,
      );
      if (
        sourceFailureCount !== counts.failedArticleCount
        || totalFailures + sourceFailureCount > NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT
      ) {
        return [];
      }

      totalFailures += sourceFailureCount;
      seenSources.add(candidate.sourceCode);
      reports.push({
        sourceCode: candidate.sourceCode,
        rawDiscoveredLinkCount: counts.rawDiscoveredLinkCount as number,
        rejectedNormalizationCount: counts.rejectedNormalizationCount as number,
        listingDuplicateCount: counts.listingDuplicateCount as number,
        uniqueCandidateCount: counts.uniqueCandidateCount as number,
        positiveCandidateCount: counts.positiveCandidateCount as number,
        zeroScoreCandidateCount: counts.zeroScoreCandidateCount as number,
        positiveNotAttemptedByLimitCount: counts.positiveNotAttemptedByLimitCount as number,
        attemptedArticleCount: counts.attemptedArticleCount as number,
        readArticleCount: counts.readArticleCount as number,
        failedArticleCount: counts.failedArticleCount as number,
        finalEligibleArticleCount: counts.finalEligibleArticleCount as number,
        failures: failures.sort(compareFailureReasons),
      });
    }

    return reports;
  } catch {
    return [];
  }
}

function cleanTopic(value: unknown): string {
  return typeof value === "string" ? value.trim().replace(/\s+/g, " ") : "";
}

function cleanSourceCode(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const normalized = value.trim();
  return normalized || null;
}

function isEligibleSource(source: SourceConfiguration): boolean {
  return (
    source.manualCollectionEnabled === true
    && Boolean(source.adapterKey?.trim())
    && source.operationalStatus !== "legal_hold"
    && source.operationalStatus !== "disabled"
  );
}

function metadataText(candidate: ArticleLinkCandidate, key: string): string {
  const value = candidate.sourceMetadata[key];
  return typeof value === "string" ? value.trim() : "";
}

function urlSearchText(value: string): string {
  try {
    const url = new URL(value);
    return decodeURIComponent(url.pathname)
      .replace(/[\/_-]+/g, " ")
      .replace(/\d{7,}/g, " ")
      .trim();
  } catch {
    return "";
  }
}

function candidateSearchText(candidate: ArticleLinkCandidate): string {
  return [
    metadataText(candidate, "anchorText"),
    metadataText(candidate, "title"),
    metadataText(candidate, "ariaLabel"),
    urlSearchText(candidate.normalizedUrl),
  ].filter(Boolean).join(" ");
}

function rankNewsroomExternalTopicCandidates(
  candidates: readonly ArticleLinkCandidate[],
  topic: string,
): readonly RankedCandidate[] {
  return candidates
    .map((candidate, index) => ({
      candidate,
      index,
      score: scoreNewsroomTopicCandidate({
        title: candidateSearchText(candidate),
      }, topic),
    }))
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score || left.index - right.index);
}

export function selectNewsroomExternalTopicCandidates(
  candidates: readonly ArticleLinkCandidate[],
  topic: string,
  limit: number,
): readonly ArticleLinkCandidate[] {
  const normalizedLimit = Math.max(1, Math.floor(limit));
  return rankNewsroomExternalTopicCandidates(candidates, topic)
    .slice(0, normalizedLimit)
    .map(({ candidate }) => candidate);
}

async function mapWithConcurrency<T, R>(
  values: readonly T[],
  concurrency: number,
  worker: (value: T) => Promise<R>,
): Promise<readonly R[]> {
  const results: R[] = new Array(values.length);
  let nextIndex = 0;

  async function runWorker(): Promise<void> {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      results[index] = await worker(values[index]);
    }
  }

  const workerCount = Math.min(Math.max(1, concurrency), values.length);
  await Promise.all(Array.from({ length: workerCount }, () => runWorker()));
  return results;
}

function error(
  code: NewsroomExternalTopicSearchErrorCode,
  message: string,
): NewsroomExternalTopicSearchResult {
  return { ok: false, error: { code, message } };
}

function nextBalancedBatch(
  queues: ReadonlyMap<string, AttemptCandidate[]>,
  sourceCodes: readonly string[],
  attemptedBySource: ReadonlyMap<string, number>,
  attemptedUrls: ReadonlySet<string>,
  batchLimit = NEWSROOM_TOPIC_INGESTION_CONCURRENCY,
): readonly AttemptCandidate[] {
  const batch: AttemptCandidate[] = [];

  function takeFromSource(sourceCode: string): AttemptCandidate | null {
    if ((attemptedBySource.get(sourceCode) ?? 0) + batch.filter(
      (candidate) => candidate.sourceCode === sourceCode,
    ).length >= NEWSROOM_TOPIC_SOURCE_ATTEMPT_LIMIT) {
      return null;
    }

    const queue = queues.get(sourceCode);
    while (queue?.length) {
      const candidate = queue.shift()!;
      const identity = `${candidate.sourceCode}\u0000${candidate.articleUrl}`;
      if (
        !attemptedUrls.has(identity)
        && !batch.some((item) => (
          item.sourceCode === candidate.sourceCode
          && item.articleUrl === candidate.articleUrl
        ))
      ) {
        return candidate;
      }
    }
    return null;
  }

  for (const sourceCode of sourceCodes) {
    if (batch.length >= batchLimit) {
      break;
    }
    const candidate = takeFromSource(sourceCode);
    if (candidate) {
      batch.push(candidate);
    }
  }

  while (batch.length < batchLimit) {
    let candidate: AttemptCandidate | null = null;
    for (const sourceCode of sourceCodes) {
      candidate = takeFromSource(sourceCode);
      if (candidate) {
        break;
      }
    }
    if (!candidate) {
      break;
    }
    batch.push(candidate);
  }

  return batch;
}

function countBySource<T extends { sourceCode: string }>(
  values: readonly T[],
  sourceCode: string,
): number {
  return values.filter((value) => value.sourceCode === sourceCode).length;
}

export function createNewsroomExternalTopicSearch(
  dependencies: NewsroomExternalTopicSearchDependencies,
): (
  input: NewsroomExternalTopicSearchInput,
) => Promise<NewsroomExternalTopicSearchResult> {
  return async (rawInput) => {
    const topic = cleanTopic(rawInput.topic);
    if (!topic || topic.length > MAX_TOPIC_LENGTH || !hasNewsroomTopicSearchTerms(topic)) {
      return error(
        "input_invalid",
        "O tema indicado não contém termos suficientes para uma pesquisa editorial.",
      );
    }

    const requestedSourceCode = cleanSourceCode(rawInput.sourceCode);
    const eligibleSources = dependencies.listSources().filter(isEligibleSource);
    const selectedSources = requestedSourceCode
      ? eligibleSources.filter((source) => source.code === requestedSourceCode)
      : eligibleSources;

    if (selectedSources.length === 0) {
      return error(
        "source_unavailable",
        "A fonte selecionada não permite pesquisa externa controlada.",
      );
    }

    const now = dependencies.clock();
    const timestamp = now.toISOString();
    const periodDays = rawInput.periodDays === null
      ? null
      : Number.isInteger(rawInput.periodDays) && (rawInput.periodDays ?? 0) > 0
        ? rawInput.periodDays!
        : 7;
    const collections = await Promise.all(selectedSources.map(async (source) => ({
      source,
      result: await dependencies.collectSource({
        sourceCode: source.code,
        detectedAt: timestamp,
        executionMode: "manual",
      }),
    })));
    const successfulCollections = collections.filter(({ result }) => result.ok);

    if (successfulCollections.length === 0) {
      return error(
        "collection_unavailable",
        "Não foi possível consultar nenhuma das fontes selecionadas.",
      );
    }

    const rankedBySource = new Map<string, readonly RankedCandidate[]>();
    for (const { source, result } of successfulCollections) {
      if (result.ok) {
        rankedBySource.set(
          source.code,
          rankNewsroomExternalTopicCandidates(result.value.candidates, topic),
        );
      }
    }

    const recoveryResult = dependencies.listUndatedRecoveryCandidates
      ? await dependencies.listUndatedRecoveryCandidates({
          topic,
          sourceCode: requestedSourceCode,
          limit: NEWSROOM_TOPIC_RECOVERY_LIMIT,
          cooldownHours: 24,
          now,
        })
      : { ok: true as const, value: [] };
    const allowedSourceCodes = new Set(selectedSources.map((source) => source.code));
    const recoveryCandidates = recoveryResult.ok
      ? recoveryResult.value
          .filter((candidate) => allowedSourceCodes.has(candidate.sourceCode))
          .slice(0, NEWSROOM_TOPIC_RECOVERY_LIMIT)
      : [];
    const currentQueues = new Map<string, AttemptCandidate[]>();
    const recoveryQueues = new Map<string, AttemptCandidate[]>();
    for (const source of selectedSources) {
      currentQueues.set(source.code, (rankedBySource.get(source.code) ?? []).map(
        ({ candidate }) => ({
          sourceCode: source.code,
          articleUrl: candidate.normalizedUrl,
          origin: "current" as const,
        }),
      ));
      recoveryQueues.set(source.code, recoveryCandidates
        .filter((candidate) => candidate.sourceCode === source.code)
        .map((candidate) => ({
          sourceCode: source.code,
          articleUrl: candidate.normalizedUrl,
          origin: "recovery" as const,
        })));
    }

    const sourceCodes = selectedSources.map((source) => source.code);
    const attemptedBySource = new Map(sourceCodes.map((sourceCode) => [sourceCode, 0]));
    const attemptedUrls = new Set<string>();
    const allOutcomes: IngestionOutcome[] = [];
    let latestArchive: NewsroomExternalTopicArchiveSnapshot = {
      articleIds: [],
      reasonsByArticleId: {},
    };
    let archiveAvailable = false;
    let stage: "first_current" | "recovery" | "remaining_current" | "remaining_recovery"
      = "first_current";
    let stopReason: NewsroomExternalTopicSearchStopReason = "candidates_exhausted";

    while (allOutcomes.length < NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT) {
      const queues = stage === "first_current" || stage === "remaining_current"
        ? currentQueues
        : recoveryQueues;
      const remainingBudget = NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT - allOutcomes.length;
      const batch = nextBalancedBatch(
        queues,
        sourceCodes,
        attemptedBySource,
        attemptedUrls,
        Math.min(NEWSROOM_TOPIC_INGESTION_CONCURRENCY, remainingBudget),
      );

      if (batch.length === 0) {
        if (stage === "first_current") {
          stage = "recovery";
          continue;
        }
        if (stage === "recovery") {
          stage = "remaining_current";
          continue;
        }
        if (stage === "remaining_current") {
          stage = "remaining_recovery";
          continue;
        }
        break;
      }

      for (const candidate of batch) {
        attemptedUrls.add(`${candidate.sourceCode}\u0000${candidate.articleUrl}`);
        attemptedBySource.set(
          candidate.sourceCode,
          (attemptedBySource.get(candidate.sourceCode) ?? 0) + 1,
        );
      }

      const outcomes = await mapWithConcurrency(
        batch,
        NEWSROOM_TOPIC_INGESTION_CONCURRENCY,
        async (candidate): Promise<IngestionOutcome> => {
          const result = await dependencies.ingestArticle({
            sourceCode: candidate.sourceCode,
            articleUrl: candidate.articleUrl,
            detectedAt: timestamp,
            extractedAt: timestamp,
          });
          if (!result.ok) {
            return {
              ...candidate,
              ok: false,
              articleId: null,
              action: null,
              failure: {
                sourceCode: result.error.sourceCode ?? candidate.sourceCode,
                stage: result.error.stage,
                code: result.error.code as HttpNewsroomIngestionErrorCode,
                ...(result.error.statusCode === undefined
                  ? {}
                  : { statusCode: result.error.statusCode }),
                ...(result.error.persistenceCode === null
                  ? {}
                  : { persistenceCode: result.error.persistenceCode }),
              },
            };
          }

          return {
            ...candidate,
            ok: true,
            articleId: result.value.article.id,
            action: result.value.article.action,
            failure: null,
          };
        },
      );
      allOutcomes.push(...outcomes);

      const archiveResult = dependencies.searchArchive
        ? await dependencies.searchArchive({
            topic,
            periodDays,
            sourceCode: requestedSourceCode,
          })
        : {
            ok: true as const,
            value: {
              articleIds: [...new Set(allOutcomes.flatMap((outcome) => (
                outcome.ok && outcome.articleId ? [outcome.articleId] : []
              )))],
              reasonsByArticleId: Object.fromEntries(allOutcomes.flatMap((outcome) => (
                outcome.ok && outcome.articleId
                  ? [[outcome.articleId, "eligible" as const]]
                  : []
              ))),
            },
          };
      if (archiveResult.ok) {
        latestArchive = archiveResult.value;
        archiveAvailable = true;
        if (latestArchive.articleIds.length >= NEWSROOM_TOPIC_TARGET_ELIGIBLE) {
          stopReason = "target_reached";
          break;
        }
      }

      if (stage === "first_current") {
        stage = "recovery";
      } else if (stage === "recovery") {
        stage = "remaining_current";
      }
    }

    if (
      stopReason !== "target_reached"
      && allOutcomes.length >= NEWSROOM_TOPIC_GLOBAL_ATTEMPT_LIMIT
    ) {
      stopReason = "attempt_limit";
    } else if (stopReason !== "target_reached") {
      const blockedBySourceLimit = sourceCodes.some((sourceCode) => (
        (attemptedBySource.get(sourceCode) ?? 0) >= NEWSROOM_TOPIC_SOURCE_ATTEMPT_LIMIT
        && (
          (currentQueues.get(sourceCode)?.length ?? 0) > 0
          || (recoveryQueues.get(sourceCode)?.length ?? 0) > 0
        )
      ));
      stopReason = blockedBySourceLimit ? "attempt_limit" : "candidates_exhausted";
    }

    if (!archiveAvailable && allOutcomes.length === 0 && dependencies.searchArchive) {
      const archiveResult = await dependencies.searchArchive({
        topic,
        periodDays,
        sourceCode: requestedSourceCode,
      });
      if (archiveResult.ok) {
        latestArchive = archiveResult.value;
        archiveAvailable = true;
      }
    }

    const actionPriority = { created: 3, updated: 2, reused: 1 } as const;
    const persistedArticlesById = new Map<string, {
      id: string;
      action: "created" | "updated" | "reused";
    }>();
    for (const outcome of allOutcomes) {
      if (!outcome.ok || !outcome.articleId || !outcome.action) {
        continue;
      }
      const existing = persistedArticlesById.get(outcome.articleId);
      if (!existing || actionPriority[outcome.action] > actionPriority[existing.action]) {
        persistedArticlesById.set(outcome.articleId, {
          id: outcome.articleId,
          action: outcome.action,
        });
      }
    }
    const persistedArticles = [...persistedArticlesById.values()];
    const readArticleIds = new Set(persistedArticles.map((article) => article.id));
    const finalEligibleIds = new Set(latestArchive.articleIds);
    const attemptedExclusionCounts: Partial<Record<NewsroomTopicArchiveOutcome, number>> = {};
    for (const articleId of readArticleIds) {
      const outcome = latestArchive.reasonsByArticleId[articleId];
      if (outcome) {
        attemptedExclusionCounts[outcome] = (attemptedExclusionCounts[outcome] ?? 0) + 1;
      }
    }

    const failureReasonCounts = aggregateNewsroomTopicFailureReasons(
      allOutcomes.flatMap((outcome) => outcome.failure ? [outcome.failure] : []),
    );
    const sourceReports = selectedSources.map((source): NewsroomExternalTopicSearchSourceReport => {
      const collection = collections.find((entry) => entry.source.code === source.code);
      const summary = collection?.result.ok ? collection.result.value : null;
      const ranked = rankedBySource.get(source.code) ?? [];
      const sourceOutcomes = allOutcomes.filter((outcome) => outcome.sourceCode === source.code);
      const sourceArticleIds = new Set(sourceOutcomes.flatMap((outcome) => (
        outcome.ok && outcome.articleId ? [outcome.articleId] : []
      )));
      const positiveNotAttemptedByLimitCount = stopReason === "attempt_limit"
        ? ranked.filter(({ candidate }) => (
            !attemptedUrls.has(`${source.code}\u0000${candidate.normalizedUrl}`)
          )).length
        : 0;

      return {
        sourceCode: source.code,
        collectionStatus: summary ? "completed" : "failed",
        candidateLinkCount: summary?.acceptedCount ?? 0,
        attemptedArticleCount: sourceOutcomes.length,
        readArticleCount: sourceArticleIds.size,
        failedArticleCount: sourceOutcomes.filter((outcome) => !outcome.ok).length,
        discoveredCount: summary?.discoveredCount ?? 0,
        selectedCount: sourceOutcomes.length,
        ingestedCount: sourceArticleIds.size,
        failedIngestionCount: sourceOutcomes.filter((outcome) => !outcome.ok).length,
        rawDiscoveredLinkCount: summary?.discoveredCount ?? 0,
        rejectedNormalizationCount: summary?.rejectedCount ?? 0,
        listingDuplicateCount: summary?.duplicateCount ?? 0,
        uniqueCandidateCount: summary?.acceptedCount ?? 0,
        positiveCandidateCount: ranked.length,
        zeroScoreCandidateCount: Math.max(0, (summary?.acceptedCount ?? 0) - ranked.length),
        positiveNotAttemptedByLimitCount,
        recoveryAttemptedCount: sourceOutcomes.filter(
          (outcome) => outcome.origin === "recovery",
        ).length,
        finalEligibleArticleCount: [...sourceArticleIds].filter(
          (articleId) => finalEligibleIds.has(articleId),
        ).length,
        failureReasonCounts: failureReasonCounts.filter(
          (failure) => failure.sourceCode === source.code,
        ),
      };
    });
    const failedSourceCount = sourceReports.filter(
      (report) => report.collectionStatus === "failed",
    ).length;
    const failedIngestionCount = allOutcomes.filter((outcome) => !outcome.ok).length;
    const status: NewsroomExternalTopicSearchStatus = (
      failedSourceCount > 0 || failedIngestionCount > 0
    ) ? "partial" : allOutcomes.length === 0 ? "empty" : "completed";

    return {
      ok: true,
      value: {
        topic,
        requestedSourceCodes: sourceCodes,
        status,
        stopReason,
        candidateLinkCount: sourceReports.reduce(
          (total, report) => total + report.uniqueCandidateCount,
          0,
        ),
        attemptedArticleCount: allOutcomes.length,
        readArticleCount: readArticleIds.size,
        failedArticleCount: failedIngestionCount,
        finalEligibleArticleCount: finalEligibleIds.size,
        articles: persistedArticles,
        discoveredCount: sourceReports.reduce(
          (total, report) => total + report.rawDiscoveredLinkCount,
          0,
        ),
        selectedCount: allOutcomes.length,
        ingestedCount: readArticleIds.size,
        createdCount: persistedArticles.filter((article) => article.action === "created").length,
        updatedCount: persistedArticles.filter((article) => article.action === "updated").length,
        reusedCount: persistedArticles.filter((article) => article.action === "reused").length,
        failedSourceCount,
        failedIngestionCount,
        rawDiscoveredLinkCount: sourceReports.reduce(
          (total, report) => total + report.rawDiscoveredLinkCount,
          0,
        ),
        rejectedNormalizationCount: sourceReports.reduce(
          (total, report) => total + report.rejectedNormalizationCount,
          0,
        ),
        listingDuplicateCount: sourceReports.reduce(
          (total, report) => total + report.listingDuplicateCount,
          0,
        ),
        uniqueCandidateCount: sourceReports.reduce(
          (total, report) => total + report.uniqueCandidateCount,
          0,
        ),
        positiveCandidateCount: sourceReports.reduce(
          (total, report) => total + report.positiveCandidateCount,
          0,
        ),
        zeroScoreCandidateCount: sourceReports.reduce(
          (total, report) => total + report.zeroScoreCandidateCount,
          0,
        ),
        positiveNotAttemptedByLimitCount: sourceReports.reduce(
          (total, report) => total + report.positiveNotAttemptedByLimitCount,
          0,
        ),
        recoveryAttemptedCount: allOutcomes.filter(
          (outcome) => outcome.origin === "recovery",
        ).length,
        attemptedExclusionCounts,
        failureReasonCounts,
        sources: sourceReports,
      },
    };
  };
}
