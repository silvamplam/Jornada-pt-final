import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { issueEditorialPreviewTicket } from "@/lib/editorial-image-preview-ticket.server";

const BUCKET = "editorial-images";
const DEFAULT_MAX_UPLOAD_MB = 8;
const allowedMimeTypes = new Map([
  [".jpg", new Set(["image/jpeg", "image/jpg"])],
  [".jpeg", new Set(["image/jpeg", "image/jpg"])],
  [".png", new Set(["image/png"])],
  [".webp", new Set(["image/webp"])],
  [".avif", new Set(["image/avif"])],
]);

type SignUploadPayload = {
  filename?: unknown;
  contentType?: unknown;
  size?: unknown;
};

function cleanText(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function safeDetail(value: string) {
  return value.replace(/\s+/g, " ").trim().slice(0, 240);
}

function jsonError(error: string, status = 400, detail?: string) {
  return NextResponse.json({ ok: false, error, detail: detail ? safeDetail(detail) : undefined }, { status });
}

function getMaxUploadMb() {
  const rawValue = process.env.EDITORIAL_IMAGE_MAX_UPLOAD_MB?.trim();
  const parsedValue = rawValue ? Number(rawValue) : NaN;

  return Number.isFinite(parsedValue) && parsedValue > 0 ? parsedValue : DEFAULT_MAX_UPLOAD_MB;
}

function maxUploadBytes(maxUploadMb: number) {
  return Math.floor(maxUploadMb * 1024 * 1024);
}

function getSupabaseServiceConfig() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();

  if (!url || !serviceRoleKey) {
    return null;
  }

  return { url: url.replace(/\/$/, ""), serviceRoleKey };
}

function extensionFor(filename: string) {
  const match = filename.toLowerCase().match(/\.(jpe?g|png|webp|avif)$/);
  if (!match) {
    return "";
  }

  return match[1] === "jpeg" ? ".jpeg" : `.${match[1]}`;
}

function safeFilename(filename: string, extension: string) {
  const base = filename
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]+$/, "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return `${base || "imagem"}${extension}`;
}

function storagePath(filename: string, extension: string) {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const unique = `${Date.now()}-${randomUUID()}`;

  return `editorial/${year}/${month}/${unique}-${safeFilename(filename, extension)}`;
}

function encodeStoragePath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function publicStorageUrl(supabaseUrl: string, bucket: string, path: string) {
  return `${supabaseUrl}/storage/v1/object/public/${encodeURIComponent(bucket)}/${encodeStoragePath(path)}`;
}

function signedUploadUrl(storageBaseUrl: string, path: string, payload: Record<string, unknown>) {
  const rawUrl = cleanText(payload.signedUrl) || cleanText(payload.signedURL) || cleanText(payload.url);
  const token = cleanText(payload.token);
  let signedUrl = rawUrl
    ? rawUrl.startsWith("http")
      ? rawUrl
      : `${storageBaseUrl}${rawUrl.startsWith("/") ? "" : "/"}${rawUrl}`
    : "";

  if (!signedUrl && token) {
    signedUrl = `${storageBaseUrl}/object/upload/sign/${encodeURIComponent(BUCKET)}/${encodeStoragePath(path)}`;
  }

  if (signedUrl && token && !/[?&]token=/.test(signedUrl)) {
    const separator = signedUrl.includes("?") ? "&" : "?";
    signedUrl = `${signedUrl}${separator}token=${encodeURIComponent(token)}`;
  }

  return { signedUrl, token };
}

export async function POST(request: Request) {
  const config = getSupabaseServiceConfig();
  if (!config) {
    return jsonError("missing-supabase-service-config", 500);
  }

  let payload: SignUploadPayload;
  try {
    payload = (await request.json()) as SignUploadPayload;
  } catch {
    return jsonError("invalid-json");
  }

  const filename = cleanText(payload.filename);
  const contentType = cleanText(payload.contentType).toLowerCase();
  const size = typeof payload.size === "number" ? payload.size : Number(payload.size);
  const extension = extensionFor(filename);
  const allowedTypes = allowedMimeTypes.get(extension);
  const maxUploadMb = getMaxUploadMb();
  const maxSize = maxUploadBytes(maxUploadMb);

  if (!filename) {
    return jsonError("missing-filename");
  }

  if (!allowedTypes || !allowedTypes.has(contentType)) {
    return jsonError("invalid-image-format");
  }

  if (!Number.isFinite(size) || size <= 0) {
    return jsonError("invalid-image-size");
  }

  if (size > maxSize) {
    return NextResponse.json({ ok: false, error: "image-too-large", maxUploadMb, maxSize }, { status: 413 });
  }

  const path = storagePath(filename, extension);
  const storageBaseUrl = `${config.url}/storage/v1`;
  const signResponse = await fetch(
    `${storageBaseUrl}/object/upload/sign/${encodeURIComponent(BUCKET)}/${encodeStoragePath(path)}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": "application/json",
        "x-upsert": "false",
      },
      body: "{}",
    },
  );

  if (!signResponse.ok) {
    const detail = await signResponse.text().catch(() => "");
    const missingBucket = signResponse.status === 404 || /bucket/i.test(detail);
    return jsonError(
      missingBucket ? "missing-editorial-images-bucket" : "signed-upload-failed",
      missingBucket ? 404 : 502,
      detail,
    );
  }

  const signedPayload = (await signResponse.json()) as Record<string, unknown>;
  const { signedUrl, token } = signedUploadUrl(storageBaseUrl, path, signedPayload);

  if (!signedUrl) {
    return jsonError("missing-signed-upload-url", 502);
  }

  return NextResponse.json({
    ok: true,
    bucket: BUCKET,
    path,
    token,
    signedUrl,
    publicUrl: publicStorageUrl(config.url, BUCKET, path),
    previewTicket: issueEditorialPreviewTicket(path, config.serviceRoleKey),
    maxUploadMb,
    maxSize,
  });
}
