import { createHash } from "node:crypto";

import {
  MANUAL_NEWSROOM_BODY_MAX_LENGTH,
  MANUAL_NEWSROOM_SOURCE_CODE,
  MANUAL_NEWSROOM_TITLE_MAX_LENGTH,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import type { ArticleBodyBlock, OperationResult } from "@/lib/redacao-automatica/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const SOURCE_PAGE_TITLE_MAX_LENGTH = 500;
const SOURCE_HOST_MAX_LENGTH = 255;
const URL_MAX_LENGTH = 4096;

export type ManualNewsroomSourceInput = Readonly<{
  submissionId: string;
  body: string;
  imageUrl: string;
  publishedDate?: string | null;
  sourceUrl?: string | null;
  sourcePageTitle?: string | null;
  sourceHost?: string | null;
}>;

export type NormalizedManualNewsroomSource = Readonly<{
  submissionId: string;
  body: string;
  bodyBlocks: readonly ArticleBodyBlock[];
  technicalTitle: string;
  imageUrl: string;
  publishedDate: string | null;
  sourceUrl: string | null;
  sourcePageTitle: string | null;
  sourceHost: string | null;
  requestFingerprint: string;
  contentHash: string;
}>;

export type ManualNewsroomSourceErrorCode =
  | "submission_id_invalid"
  | "body_invalid"
  | "image_invalid"
  | "published_date_invalid"
  | "published_date_future"
  | "source_url_invalid"
  | "source_metadata_invalid"
  | "service_unavailable"
  | "submission_payload_conflict"
  | "save_failed";

export type ManualNewsroomSourceSuccess = Readonly<{
  submissionId: string;
  requestFingerprint: string;
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  action: "created" | "reused";
  request: NormalizedManualNewsroomSource;
}>;

export type ManualNewsroomSourceResult = OperationResult<
  ManualNewsroomSourceSuccess,
  Readonly<{ code: ManualNewsroomSourceErrorCode }>
>;

export type ManualNewsroomSourceRpcArguments = Readonly<{
  p_submission_id: string;
  p_request_fingerprint: string;
  p_title: string;
  p_body: readonly ArticleBodyBlock[];
  p_image_url: string;
  p_published_date: string | null;
  p_source_url: string | null;
  p_source_page_title: string | null;
  p_source_host: string | null;
  p_content_hash: string;
}>;

export interface ManualNewsroomSourceTransport {
  isConfigured(): boolean;
  executeRpc(
    functionName: "newsroom_create_manual_source",
    argumentsValue: ManualNewsroomSourceRpcArguments,
  ): Promise<unknown>;
}

type ManualNewsroomSourceRpcRow = Readonly<{
  submission_id: string;
  request_fingerprint: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  entry_action: "created" | "reused";
}>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

function normalizeInline(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeBody(value: string): string {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trim()
    .replace(/\n{3,}/g, "\n\n");
}

function toBodyBlocks(value: string): readonly ArticleBodyBlock[] {
  return value.split(/\n{2,}/).map((paragraph) => ({
    type: "paragraph" as const,
    text: paragraph.trim().replace(/\n/g, " ").replace(/\s+/g, " "),
  })).filter((paragraph) => paragraph.text.length > 0);
}

export function deriveManualSourceTechnicalTitle(body: string): string {
  const paragraph = normalizeBody(body).split(/\n{2,}/).find((value) => value.trim()) ?? "";
  const inline = normalizeInline(paragraph);
  const sentence = inline.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() || inline;
  return sentence.slice(0, MANUAL_NEWSROOM_TITLE_MAX_LENGTH).trimEnd();
}

function isRealDateOnly(value: string): boolean {
  const match = value.match(DATE_ONLY_PATTERN);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day;
}

function lisbonDateOnly(now: Date): string | null {
  if (Number.isNaN(now.getTime())) return null;
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Europe/Lisbon",
  }).formatToParts(now);
  const values = new Map(parts.map((part) => [part.type, part.value]));
  const year = values.get("year");
  const month = values.get("month");
  const day = values.get("day");
  return year && month && day ? `${year}-${month}-${day}` : null;
}

export function normalizeManualSourceHttpUrl(
  value: string,
  maxLength = URL_MAX_LENGTH,
): string | undefined {
  const candidate = value.trim();
  if (!candidate || candidate.length > maxLength || /\s/.test(candidate)) return undefined;
  try {
    const url = new URL(candidate);
    if (
      (url.protocol !== "http:" && url.protocol !== "https:")
      || url.username
      || url.password
    ) return undefined;
    const serialized = url.toString();
    return serialized.length <= maxLength ? serialized : undefined;
  } catch {
    return undefined;
  }
}

function normalizedSourceUrl(value: string): string | undefined {
  const normalized = normalizeManualSourceHttpUrl(value);
  if (!normalized) return undefined;
  const url = new URL(normalized);
  url.hash = "";
  return url.toString();
}

export function normalizeManualNewsroomSource(
  input: ManualNewsroomSourceInput,
  options: Readonly<{ now: Date }>,
): OperationResult<
  NormalizedManualNewsroomSource,
  Readonly<{ code: ManualNewsroomSourceErrorCode }>
> {
  const submissionId = input.submissionId.trim().toLowerCase();
  if (!UUID_PATTERN.test(submissionId)) {
    return { ok: false, error: { code: "submission_id_invalid" } };
  }

  const body = normalizeBody(input.body);
  const bodyBlocks = toBodyBlocks(body);
  const technicalTitle = deriveManualSourceTechnicalTitle(body);
  if (
    !body
    || body.length > MANUAL_NEWSROOM_BODY_MAX_LENGTH
    || body.includes("\u0000")
    || bodyBlocks.length === 0
    || !technicalTitle
  ) {
    return { ok: false, error: { code: "body_invalid" } };
  }

  const imageUrl = normalizeManualSourceHttpUrl(input.imageUrl, 2048);
  if (!imageUrl) return { ok: false, error: { code: "image_invalid" } };

  const publishedDateValue = input.publishedDate?.trim() ?? "";
  let publishedDate: string | null = null;
  if (publishedDateValue) {
    if (!isRealDateOnly(publishedDateValue)) {
      return { ok: false, error: { code: "published_date_invalid" } };
    }
    const today = lisbonDateOnly(options.now);
    if (!today) return { ok: false, error: { code: "published_date_invalid" } };
    if (publishedDateValue > today) {
      return { ok: false, error: { code: "published_date_future" } };
    }
    publishedDate = publishedDateValue;
  }

  const sourceUrlValue = input.sourceUrl?.trim() ?? "";
  let sourceUrl: string | null = null;
  if (sourceUrlValue) {
    const normalized = normalizedSourceUrl(sourceUrlValue);
    if (!normalized) {
      return { ok: false, error: { code: "source_url_invalid" } };
    }
    sourceUrl = normalized;
  }

  const sourcePageTitleValue = normalizeInline(input.sourcePageTitle ?? "");
  if (
    sourcePageTitleValue.length > SOURCE_PAGE_TITLE_MAX_LENGTH
    || sourcePageTitleValue.includes("\u0000")
  ) return { ok: false, error: { code: "source_metadata_invalid" } };

  const suppliedHost = normalizeInline(input.sourceHost ?? "").toLowerCase();
  if (
    suppliedHost.length > SOURCE_HOST_MAX_LENGTH
    || suppliedHost.includes("\u0000")
  ) return { ok: false, error: { code: "source_metadata_invalid" } };
  const sourceHost = sourceUrl ? new URL(sourceUrl).hostname.toLowerCase() : null;

  const payload = {
    body,
    technicalTitle,
    imageUrl,
    publishedDate,
    sourceUrl,
    sourcePageTitle: sourcePageTitleValue || null,
    sourceHost,
  };
  const requestFingerprint = sha256({ submissionId, ...payload });
  const contentHash = sha256(payload);

  return {
    ok: true,
    value: {
      submissionId,
      bodyBlocks,
      ...payload,
      requestFingerprint,
      contentHash,
    },
  };
}

function isRpcRow(value: unknown): value is ManualNewsroomSourceRpcRow {
  if (!value || Array.isArray(value) || typeof value !== "object") return false;
  const row = value as Record<string, unknown>;
  return typeof row.submission_id === "string"
    && UUID_PATTERN.test(row.submission_id)
    && typeof row.request_fingerprint === "string"
    && SHA256_PATTERN.test(row.request_fingerprint)
    && typeof row.newsroom_article_id === "string"
    && UUID_PATTERN.test(row.newsroom_article_id)
    && typeof row.newsroom_snapshot_id === "string"
    && UUID_PATTERN.test(row.newsroom_snapshot_id)
    && (row.entry_action === "created" || row.entry_action === "reused");
}

function thrownErrorCode(error: unknown): ManualNewsroomSourceErrorCode {
  const message = error instanceof Error ? error.message : "";
  return message.includes("manual_source_payload_conflict")
    || message.includes("manual_entry_payload_conflict")
    ? "submission_payload_conflict"
    : "save_failed";
}

export function createManualNewsroomSourcePersistence(
  transport: ManualNewsroomSourceTransport,
) {
  return async function persist(
    input: ManualNewsroomSourceInput,
    options: Readonly<{ now?: Date }> = {},
  ): Promise<ManualNewsroomSourceResult> {
    if (!transport.isConfigured()) {
      return { ok: false, error: { code: "service_unavailable" } };
    }
    const normalized = normalizeManualNewsroomSource(input, {
      now: options.now ?? new Date(),
    });
    if (!normalized.ok) return normalized;
    const request = normalized.value;

    try {
      const response = await transport.executeRpc("newsroom_create_manual_source", {
        p_submission_id: request.submissionId,
        p_request_fingerprint: request.requestFingerprint,
        p_title: request.technicalTitle,
        p_body: request.bodyBlocks,
        p_image_url: request.imageUrl,
        p_published_date: request.publishedDate,
        p_source_url: request.sourceUrl,
        p_source_page_title: request.sourcePageTitle,
        p_source_host: request.sourceHost,
        p_content_hash: request.contentHash,
      });
      const candidate = Array.isArray(response) ? response[0] : response;
      if (
        !isRpcRow(candidate)
        || candidate.submission_id.toLowerCase() !== request.submissionId
        || candidate.request_fingerprint !== request.requestFingerprint
      ) return { ok: false, error: { code: "save_failed" } };

      return {
        ok: true,
        value: {
          submissionId: request.submissionId,
          requestFingerprint: request.requestFingerprint,
          newsroomArticleId: candidate.newsroom_article_id.toLowerCase(),
          newsroomSnapshotId: candidate.newsroom_snapshot_id.toLowerCase(),
          action: candidate.entry_action,
          request,
        },
      };
    } catch (error) {
      return { ok: false, error: { code: thrownErrorCode(error) } };
    }
  };
}

export function createManualNewsroomSourceWorkflow(dependencies: Readonly<{
  persist(input: ManualNewsroomSourceInput): Promise<ManualNewsroomSourceResult>;
}>) {
  return async function create(input: ManualNewsroomSourceInput) {
    return dependencies.persist(input);
  };
}

export { MANUAL_NEWSROOM_BODY_MAX_LENGTH, MANUAL_NEWSROOM_SOURCE_CODE };
