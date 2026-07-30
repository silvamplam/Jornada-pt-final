export const NEWSROOM_TOPIC_SEARCH_PERIODS = ["1", "7", "30", "all"] as const;

export type NewsroomTopicSearchPeriod = typeof NEWSROOM_TOPIC_SEARCH_PERIODS[number];

export type NewsroomTopicSearchCandidate = Readonly<{
  title: string;
  subtitle?: string | null;
  summary?: string | null;
  body?: string | null;
}>;

export type NewsroomTopicRelevanceExclusionReason =
  | "entity_missing"
  | "body_context_missing"
  | "relevance_insufficient";

export type NewsroomTopicCandidateEvaluation = Readonly<{
  score: number;
  exclusionReason: NewsroomTopicRelevanceExclusionReason | null;
}>;

export const NEWSROOM_TOPIC_ARCHIVE_OUTCOMES = [
  "state_ineligible",
  "published_at_missing",
  "published_at_invalid",
  "published_at_future",
  "outside_period",
  "snapshot_missing",
  "snapshot_unusable",
  "entity_missing",
  "body_context_missing",
  "relevance_insufficient",
  "canonical_duplicate",
  "eligible",
] as const;

export type NewsroomTopicArchiveOutcome =
  typeof NEWSROOM_TOPIC_ARCHIVE_OUTCOMES[number];

export type NewsroomTopicArchiveCandidateClassification = Readonly<{
  outcome: NewsroomTopicArchiveOutcome;
  score: number;
}>;

export type NewsroomTopicSearchPersistedArticle = Readonly<{
  id: string;
  action: "created" | "updated" | "reused";
}>;

export type NewsroomTopicSearchResultOrigins = Readonly<{
  relatedCount: number;
  availableCount: number;
  collectedCount: number;
  collectedIds: readonly string[];
}>;

type SearchField = "title" | "subtitle" | "summary" | "body";

type NormalizedSearchField = Readonly<{
  name: SearchField;
  words: readonly string[];
  exactWeight: number;
  termWeight: number;
  entityWeight: number;
}>;

type WordSequence = readonly string[];
type ContextUnit = readonly WordSequence[];

type ContextConcept = Readonly<{
  query: WordSequence;
  alternatives: ContextUnit;
}>;

const PORTUGUESE_SEARCH_STOP_WORDS = new Set([
  "a",
  "ao",
  "aos",
  "as",
  "com",
  "da",
  "das",
  "de",
  "do",
  "dos",
  "e",
  "em",
  "na",
  "nas",
  "no",
  "nos",
  "o",
  "os",
  "para",
  "por",
  "um",
  "uma",
]);

const CONTEXT_CONCEPTS: readonly ContextConcept[] = [
  {
    query: ["pre", "epoca"],
    alternatives: [
      ["pre", "epoca"],
      ["preparacao"],
      ["estagio"],
      ["treino"],
      ["amigavel"],
      ["nova", "epoca"],
    ],
  },
];

export function normalizeNewsroomTopicText(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function newsroomTopicSearchTerms(value: string | null | undefined): readonly string[] {
  const normalized = normalizeNewsroomTopicText(value);
  if (!normalized) {
    return [];
  }

  return [...new Set(
    normalized
      .split(" ")
      .filter((term) => term.length >= 2 && !PORTUGUESE_SEARCH_STOP_WORDS.has(term)),
  )];
}

export function hasNewsroomTopicSearchTerms(value: string | null | undefined): boolean {
  return newsroomTopicSearchTerms(value).length > 0;
}

function containsWordSequence(
  words: readonly string[],
  sequence: readonly string[],
): boolean {
  if (sequence.length === 0 || sequence.length > words.length) {
    return false;
  }

  return words.some((_, index) => (
    index + sequence.length <= words.length
    && sequence.every((word, sequenceIndex) => words[index + sequenceIndex] === word)
  ));
}

function contextAlternatives(terms: readonly string[]): readonly ContextUnit[] {
  const units: ContextUnit[] = [];
  let index = 0;

  while (index < terms.length) {
    const concept = CONTEXT_CONCEPTS.find(({ query }) => (
      query.every((term, queryIndex) => terms[index + queryIndex] === term)
    ));

    if (concept) {
      units.push(concept.alternatives);
      index += concept.query.length;
      continue;
    }

    units.push([[terms[index]]]);
    index += 1;
  }

  return units;
}

function matchesContextUnit(
  words: readonly string[],
  alternatives: ContextUnit,
): boolean {
  return alternatives.some((alternative) => containsWordSequence(words, alternative));
}

function normalizedField(
  name: SearchField,
  value: string | null | undefined,
  exactWeight: number,
  termWeight: number,
  entityWeight: number,
): NormalizedSearchField {
  const normalized = normalizeNewsroomTopicText(value);
  return {
    name,
    words: normalized ? normalized.split(" ") : [],
    exactWeight,
    termWeight,
    entityWeight,
  };
}

function fieldScore(
  field: NormalizedSearchField,
  normalizedQueryWords: readonly string[],
  entityTerms: readonly string[],
  contextUnits: readonly ContextUnit[],
): number {
  if (field.words.length === 0) {
    return 0;
  }

  const exactScore = containsWordSequence(field.words, normalizedQueryWords)
    ? field.exactWeight
    : 0;
  const entityTermScore = entityTerms.filter((term) => (
    containsWordSequence(field.words, [term])
  )).length * field.termWeight;
  const contextScore = contextUnits.filter((unit) => (
    matchesContextUnit(field.words, unit)
  )).length * field.termWeight;
  const entityScore = entityTerms.every((term) => containsWordSequence(field.words, [term]))
    ? field.entityWeight
    : 0;

  return exactScore + entityTermScore + contextScore + entityScore;
}

export function evaluateNewsroomTopicCandidate(
  candidate: NewsroomTopicSearchCandidate,
  query: string,
): NewsroomTopicCandidateEvaluation {
  const normalizedQuery = normalizeNewsroomTopicText(query);
  const terms = newsroomTopicSearchTerms(query);
  if (!normalizedQuery || terms.length === 0) {
    return { score: 0, exclusionReason: "relevance_insufficient" };
  }

  const entityTerms = terms.slice(0, Math.min(2, terms.length));
  const contextUnits = contextAlternatives(terms.slice(entityTerms.length));
  const normalizedQueryWords = normalizedQuery.split(" ");
  const fields: readonly NormalizedSearchField[] = [
    normalizedField("title", candidate.title, 60, 12, 36),
    normalizedField("subtitle", candidate.subtitle, 34, 7, 20),
    normalizedField("summary", candidate.summary, 28, 6, 18),
    normalizedField("body", candidate.body, 10, 2, 6),
  ];
  const entityFields = fields.filter((field) => (
    entityTerms.every((term) => containsWordSequence(field.words, [term]))
  ));

  if (entityFields.length === 0) {
    return { score: 0, exclusionReason: "entity_missing" };
  }

  const entityOnlyInBody = entityFields.every((field) => field.name === "body");
  if (
    entityOnlyInBody
    && contextUnits.length > 0
    && !contextUnits.some((unit) => matchesContextUnit(entityFields[0].words, unit))
  ) {
    return { score: 0, exclusionReason: "body_context_missing" };
  }

  const matchedContextCount = contextUnits.filter((unit) => (
    fields.some((field) => matchesContextUnit(field.words, unit))
  )).length;
  const coverageBonus = contextUnits.length > 0 && matchedContextCount === contextUnits.length
    ? 20
    : matchedContextCount * 5;

  const score = coverageBonus + fields.reduce(
    (total, field) => total + fieldScore(
      field,
      normalizedQueryWords,
      entityTerms,
      contextUnits,
    ),
    0,
  );

  return score > 0
    ? { score, exclusionReason: null }
    : { score: 0, exclusionReason: "relevance_insufficient" };
}

export function scoreNewsroomTopicCandidate(
  candidate: NewsroomTopicSearchCandidate,
  query: string,
): number {
  return evaluateNewsroomTopicCandidate(candidate, query).score;
}

export function newsroomTopicPeriod(value: string | null | undefined): NewsroomTopicSearchPeriod {
  return NEWSROOM_TOPIC_SEARCH_PERIODS.includes(value as NewsroomTopicSearchPeriod)
    ? value as NewsroomTopicSearchPeriod
    : "7";
}

export function newsroomTopicPeriodDays(
  value: string | null | undefined,
): number | null {
  const period = newsroomTopicPeriod(value);
  return period === "all" ? null : Number(period);
}

export function isNewsroomTopicPublishedAtEligible(
  publishedAt: string | null | undefined,
  periodDays: number | null,
  now: Date,
): boolean {
  if (!publishedAt || Number.isNaN(now.getTime())) {
    return false;
  }

  const publishedAtTimestamp = Date.parse(publishedAt);
  if (Number.isNaN(publishedAtTimestamp) || publishedAtTimestamp > now.getTime()) {
    return false;
  }

  if (periodDays === null) {
    return true;
  }

  const normalizedPeriodDays = Number.isInteger(periodDays) && periodDays > 0
    ? periodDays
    : 7;
  return publishedAtTimestamp >= (
    now.getTime() - normalizedPeriodDays * 24 * 60 * 60 * 1000
  );
}

export function classifyNewsroomTopicArchiveMetadata(input: {
  processingStatus: string;
  publishedAt: string | null | undefined;
  periodDays: number | null;
  now: Date;
}): Exclude<
  NewsroomTopicArchiveOutcome,
  | "snapshot_missing"
  | "snapshot_unusable"
  | "entity_missing"
  | "body_context_missing"
  | "relevance_insufficient"
  | "canonical_duplicate"
  | "eligible"
> | null {
  if (!["detected", "normalized", "ready_for_review"].includes(input.processingStatus)) {
    return "state_ineligible";
  }

  if (!input.publishedAt) {
    return "published_at_missing";
  }

  const nowTimestamp = input.now.getTime();
  const publishedAtTimestamp = Date.parse(input.publishedAt);
  if (Number.isNaN(nowTimestamp) || Number.isNaN(publishedAtTimestamp)) {
    return "published_at_invalid";
  }

  if (publishedAtTimestamp > nowTimestamp) {
    return "published_at_future";
  }

  if (input.periodDays !== null) {
    const normalizedPeriodDays = (
      Number.isInteger(input.periodDays) && input.periodDays > 0
    ) ? input.periodDays : 7;
    if (
      publishedAtTimestamp
      < nowTimestamp - normalizedPeriodDays * 24 * 60 * 60 * 1000
    ) {
      return "outside_period";
    }
  }

  return null;
}

export function classifyNewsroomTopicArchiveCandidate(input: {
  processingStatus: string;
  publishedAt: string | null | undefined;
  periodDays: number | null;
  now: Date;
  snapshotPresent: boolean;
  snapshotUsable: boolean;
  candidate: NewsroomTopicSearchCandidate;
  query: string;
  canonicalDuplicate?: boolean;
}): NewsroomTopicArchiveCandidateClassification {
  const metadataOutcome = classifyNewsroomTopicArchiveMetadata(input);
  if (metadataOutcome) {
    return { outcome: metadataOutcome, score: 0 };
  }

  if (!input.snapshotPresent) {
    return { outcome: "snapshot_missing", score: 0 };
  }

  if (!input.snapshotUsable) {
    return { outcome: "snapshot_unusable", score: 0 };
  }

  const relevance = evaluateNewsroomTopicCandidate(input.candidate, input.query);
  if (relevance.exclusionReason) {
    return {
      outcome: relevance.exclusionReason,
      score: relevance.score,
    };
  }

  if (input.canonicalDuplicate) {
    return { outcome: "canonical_duplicate", score: relevance.score };
  }

  return { outcome: "eligible", score: relevance.score };
}

export function classifyNewsroomTopicSearchResultOrigins(input: {
  initialArticleIds: readonly string[];
  finalArticleIds: readonly string[];
  persistedArticles: readonly NewsroomTopicSearchPersistedArticle[];
}): NewsroomTopicSearchResultOrigins {
  const initialIds = new Set(input.initialArticleIds);
  const finalIds = new Set(input.finalArticleIds);
  const createdIds = new Set(
    input.persistedArticles
      .filter((article) => article.action === "created")
      .map((article) => article.id),
  );
  const collectedIds = [...createdIds].filter((id) => (
    finalIds.has(id) && !initialIds.has(id)
  ));

  return {
    relatedCount: finalIds.size,
    availableCount: finalIds.size - collectedIds.length,
    collectedCount: collectedIds.length,
    collectedIds,
  };
}
