export const SOURCE_OPERATIONAL_STATUSES = [
  "active",
  "paused",
  "legal_hold",
  "degraded",
  "disabled",
] as const;

export type SourceOperationalStatus = (typeof SOURCE_OPERATIONAL_STATUSES)[number];

export const SOURCE_EXECUTION_MODES = [
  "automatic",
  "manual",
] as const;

export type SourceExecutionMode = (typeof SOURCE_EXECUTION_MODES)[number];

export type SourceConfiguration = Readonly<{
  code: string;
  name: string;
  domain: string;
  homepage: string;
  adapterKey: string | null;
  operationalStatus: SourceOperationalStatus;
  monitoringEnabled: boolean;
  manualCollectionEnabled: boolean;
  inactiveReason: string | null;
  legalNote: string | null;
  editorialNote: string;
  displayOrder: number;
}>;

export type JsonPrimitive = string | number | boolean | null;

export type JsonValue = JsonPrimitive | JsonObject | readonly JsonValue[];

export type JsonObject = Readonly<{
  [key: string]: JsonValue;
}>;

export type LoadedPage = Readonly<{
  requestedUrl: string;
  finalUrl: string;
  statusCode: number;
  contentType: string | null;
  body: string;
  loadedAt: string;
  redirectCount: number;
  byteLength: number;
}>;

export type DiscoveredArticleLink = Readonly<{
  originalUrl: string;
  sourceMetadata: JsonObject;
}>;

export type ArticleLinkCandidate = Readonly<{
  sourceCode: string;
  originalUrl: string;
  normalizedUrl: string;
  sourcePageUrl: string;
  detectedAt: string;
  sourceMetadata: JsonObject;
}>;

export type ArticleProcessingStatus =
  | "detected"
  | "normalized"
  | "duplicate"
  | "rejected"
  | "ready_for_review"
  | "failed";

export type ArticleBodyBlock =
  | Readonly<{
      type: "paragraph";
      text: string;
    }>
  | Readonly<{
      type: "heading";
      text: string;
    }>;

export type NormalizedDetectedArticle = Readonly<{
  sourceCode: string;
  originalUrl: string;
  normalizedUrl: string;
  externalId: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  author: string | null;
  publishedAt: string | null;
  modifiedAt: string | null;
  detectedAt: string;
  imageUrl: string | null;
  excerpt: string | null;
  body: readonly ArticleBodyBlock[];
  processingStatus: ArticleProcessingStatus;
  sourceMetadata: JsonObject;
}>;

export type CollectionErrorCode =
  | "source_not_found"
  | "source_inactive"
  | "legal_hold"
  | "source_forbidden"
  | "adapter_missing"
  | "adapter_source_mismatch"
  | "invalid_adapter_key"
  | "duplicate_adapter_key"
  | "invalid_url"
  | "domain_not_allowed"
  | "private_network_blocked"
  | "dns_resolution_failed"
  | "redirect_blocked"
  | "timeout"
  | "http_error"
  | "response_too_large"
  | "load_failed"
  | "unsupported_content"
  | "parse_failed"
  | "required_field_missing"
  | "duplicate";

export type CollectionErrorStage =
  | "configuration"
  | "listing"
  | "article"
  | "normalization"
  | "persistence";

export type CollectionError = Readonly<{
  code: CollectionErrorCode;
  stage: CollectionErrorStage;
  sourceCode: string | null;
  url: string | null;
  recoverable: boolean;
  detail?: string | null;
}>;

export type SourceCollectionSummary = Readonly<{
  sourceCode: string;
  startedAt: string;
  finishedAt: string;
  listingUrls: readonly string[];
  loadedListingCount: number;
  discoveredCount: number;
  acceptedCount: number;
  duplicateCount: number;
  rejectedCount: number;
  candidates: readonly ArticleLinkCandidate[];
  errors: readonly CollectionError[];
}>;

export type OperationResult<T, E> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: E }>;

export type AdapterResult<T> = OperationResult<T, CollectionError>;
