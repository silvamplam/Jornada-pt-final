import { createHash } from "node:crypto";

import {
  MANUAL_NEWSROOM_BODY_MAX_LENGTH,
  MANUAL_NEWSROOM_TITLE_MAX_LENGTH,
} from "@/lib/redacao-automatica/manual-newsroom-entry-contract";
import type {
  ArticleBodyBlock,
  OperationResult,
} from "@/lib/redacao-automatica/types";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SHA256_PATTERN = /^[0-9a-f]{64}$/;
const DATE_ONLY_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const ALLOWED_IMAGE_EXTENSION_PATTERN = /\.(?:jpe?g|png|webp|avif)$/i;
const MANUAL_IMAGE_PATH_PREFIX =
  "/storage/v1/object/public/editorial-images/editorial/";

export type ManualNewsroomEntryInput = Readonly<{
  submissionId: string;
  title: string;
  body: string;
  publishedDate: string;
  imageUrl: string | null;
}>;

export type NormalizedManualNewsroomEntry = Readonly<{
  submissionId: string;
  title: string;
  body: string;
  bodyBlocks: readonly ArticleBodyBlock[];
  publishedDate: string;
  publishedAt: string;
  imageUrl: string | null;
  requestFingerprint: string;
  contentHash: string;
}>;

export type ManualNewsroomEntryErrorCode =
  | "submission_id_invalid"
  | "title_invalid"
  | "body_invalid"
  | "published_date_invalid"
  | "published_date_future"
  | "image_invalid"
  | "service_unavailable"
  | "submission_payload_conflict"
  | "save_failed";

export type ManualNewsroomEntrySuccess = Readonly<{
  submissionId: string;
  requestFingerprint: string;
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  action: "created" | "reused";
  request: NormalizedManualNewsroomEntry;
}>;

export type ManualNewsroomEntryResult = OperationResult<
  ManualNewsroomEntrySuccess,
  Readonly<{ code: ManualNewsroomEntryErrorCode }>
>;

export type ManualNewsroomEntryRpcArguments = Readonly<{
  p_submission_id: string;
  p_request_fingerprint: string;
  p_title: string;
  p_body: readonly ArticleBodyBlock[];
  p_published_date: string;
  p_image_url: string | null;
  p_content_hash: string;
}>;

export interface ManualNewsroomEntryTransport {
  configuration(): Readonly<{ storageBaseUrl: string }> | null;
  executeRpc(
    functionName: "newsroom_create_manual_entry",
    argumentsValue: ManualNewsroomEntryRpcArguments,
  ): Promise<unknown>;
}

type ManualNewsroomEntryRpcRow = Readonly<{
  submission_id: string;
  request_fingerprint: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  entry_action: "created" | "reused";
}>;

function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(",")}]`;
  }

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record).sort().map((key) => (
    `${JSON.stringify(key)}:${canonicalJson(record[key])}`
  )).join(",")}}`;
}

function sha256(value: unknown): string {
  return createHash("sha256").update(canonicalJson(value), "utf8").digest("hex");
}

export function isManualNewsroomSubmissionId(value: string): boolean {
  return UUID_PATTERN.test(value.trim().toLowerCase());
}

function normalizeTitle(value: string): string {
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

function bodyBlocks(value: string): readonly ArticleBodyBlock[] {
  return value.split(/\n{2,}/).map((paragraph) => ({
    type: "paragraph" as const,
    text: paragraph.trim(),
  })).filter((paragraph) => paragraph.text.length > 0);
}

function isRealDateOnly(value: string): boolean {
  const match = value.match(DATE_ONLY_PATTERN);
  if (!match) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year
    && date.getUTCMonth() === month - 1
    && date.getUTCDate() === day
  );
}

export function lisbonDateOnly(now: Date): string | null {
  if (Number.isNaN(now.getTime())) {
    return null;
  }

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

export function normalizeManualNewsroomImageUrl(
  value: string | null,
  storageBaseUrl: string,
): string | null | undefined {
  const normalized = value?.trim() ?? "";
  if (!normalized) {
    return null;
  }
  if (normalized.length > 2048) {
    return undefined;
  }

  try {
    const expectedBase = new URL(storageBaseUrl);
    const imageUrl = new URL(normalized);
    const expectedPrefix = `${expectedBase.pathname.replace(/\/$/, "")}${MANUAL_IMAGE_PATH_PREFIX}`;
    if (
      imageUrl.origin !== expectedBase.origin
      || !imageUrl.pathname.startsWith(expectedPrefix)
      || !ALLOWED_IMAGE_EXTENSION_PATTERN.test(imageUrl.pathname)
      || imageUrl.username
      || imageUrl.password
      || imageUrl.search
      || imageUrl.hash
    ) {
      return undefined;
    }

    return imageUrl.toString();
  } catch {
    return undefined;
  }
}

export function normalizeManualNewsroomEntry(
  input: ManualNewsroomEntryInput,
  options: Readonly<{
    now: Date;
    storageBaseUrl: string;
  }>,
): OperationResult<
  NormalizedManualNewsroomEntry,
  Readonly<{ code: ManualNewsroomEntryErrorCode }>
> {
  const submissionId = input.submissionId.trim().toLowerCase();
  if (!UUID_PATTERN.test(submissionId)) {
    return { ok: false, error: { code: "submission_id_invalid" } };
  }

  const title = normalizeTitle(input.title);
  if (
    !title
    || title.length > MANUAL_NEWSROOM_TITLE_MAX_LENGTH
    || title.includes("\u0000")
  ) {
    return { ok: false, error: { code: "title_invalid" } };
  }

  const body = normalizeBody(input.body);
  const normalizedBodyBlocks = bodyBlocks(body);
  if (
    !body
    || body.length > MANUAL_NEWSROOM_BODY_MAX_LENGTH
    || body.includes("\u0000")
    || normalizedBodyBlocks.length === 0
  ) {
    return { ok: false, error: { code: "body_invalid" } };
  }

  const publishedDate = input.publishedDate.trim();
  const currentDate = lisbonDateOnly(options.now);
  if (!isRealDateOnly(publishedDate) || !currentDate) {
    return { ok: false, error: { code: "published_date_invalid" } };
  }
  if (publishedDate > currentDate) {
    return { ok: false, error: { code: "published_date_future" } };
  }

  const imageUrl = normalizeManualNewsroomImageUrl(
    input.imageUrl,
    options.storageBaseUrl,
  );
  if (imageUrl === undefined) {
    return { ok: false, error: { code: "image_invalid" } };
  }

  const contentPayload = {
    title,
    body,
    publishedDate,
    imageUrl,
  };
  const requestFingerprint = sha256({
    submissionId,
    ...contentPayload,
  });
  const contentHash = sha256(contentPayload);

  return {
    ok: true,
    value: {
      submissionId,
      title,
      body,
      bodyBlocks: normalizedBodyBlocks,
      publishedDate,
      publishedAt: `${publishedDate}T00:00:00.000Z`,
      imageUrl,
      requestFingerprint,
      contentHash,
    },
  };
}

function isRpcRow(value: unknown): value is ManualNewsroomEntryRpcRow {
  if (!value || Array.isArray(value) || typeof value !== "object") {
    return false;
  }

  const row = value as Record<string, unknown>;
  return (
    typeof row.submission_id === "string"
    && UUID_PATTERN.test(row.submission_id)
    && typeof row.request_fingerprint === "string"
    && SHA256_PATTERN.test(row.request_fingerprint)
    && typeof row.newsroom_article_id === "string"
    && UUID_PATTERN.test(row.newsroom_article_id)
    && typeof row.newsroom_snapshot_id === "string"
    && UUID_PATTERN.test(row.newsroom_snapshot_id)
    && (row.entry_action === "created" || row.entry_action === "reused")
  );
}

function rpcRow(value: unknown): ManualNewsroomEntryRpcRow | null {
  const candidate = Array.isArray(value) ? value[0] : value;
  return isRpcRow(candidate) ? candidate : null;
}

function thrownErrorCode(error: unknown): ManualNewsroomEntryErrorCode {
  const message = error instanceof Error ? error.message : "";
  return message.includes("manual_entry_payload_conflict")
    ? "submission_payload_conflict"
    : "save_failed";
}

export function createManualNewsroomEntryPersistence(
  transport: ManualNewsroomEntryTransport,
): (
  input: ManualNewsroomEntryInput,
  options?: Readonly<{ now?: Date }>,
) => Promise<ManualNewsroomEntryResult> {
  return async (input, options = {}) => {
    const configuration = transport.configuration();
    if (!configuration) {
      return { ok: false, error: { code: "service_unavailable" } };
    }

    const normalized = normalizeManualNewsroomEntry(input, {
      now: options.now ?? new Date(),
      storageBaseUrl: configuration.storageBaseUrl,
    });
    if (!normalized.ok) {
      return normalized;
    }

    const request = normalized.value;
    try {
      const result = await transport.executeRpc("newsroom_create_manual_entry", {
        p_submission_id: request.submissionId,
        p_request_fingerprint: request.requestFingerprint,
        p_title: request.title,
        p_body: request.bodyBlocks,
        p_published_date: request.publishedDate,
        p_image_url: request.imageUrl,
        p_content_hash: request.contentHash,
      });
      const row = rpcRow(result);
      if (
        !row
        || row.submission_id.toLowerCase() !== request.submissionId
        || row.request_fingerprint !== request.requestFingerprint
      ) {
        return { ok: false, error: { code: "save_failed" } };
      }

      return {
        ok: true,
        value: {
          submissionId: row.submission_id,
          requestFingerprint: row.request_fingerprint,
          newsroomArticleId: row.newsroom_article_id,
          newsroomSnapshotId: row.newsroom_snapshot_id,
          action: row.entry_action,
          request,
        },
      };
    } catch (error) {
      return { ok: false, error: { code: thrownErrorCode(error) } };
    }
  };
}
