import { randomUUID } from "node:crypto";

import { NextResponse } from "next/server";

import { getSupabaseServiceConfig } from "@/lib/supabase";
import { downloadEditorialSourceImage } from "@/lib/redacao-automatica/editorial-source-image";
import {
  isEditorialSourcePackageLocation,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import { readEditorialSourcePackage } from "@/lib/redacao-automatica/editorial-source-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const BUCKET = "editorial-images";
const CONTENT_TYPES = new Map([
  ["jpg", "image/jpeg"],
  ["png", "image/png"],
  ["webp", "image/webp"],
  ["avif", "image/avif"],
]);

type ImportSourceImagePayload = Readonly<{
  year?: unknown;
  month?: unknown;
  packageId?: unknown;
  position?: unknown;
}>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
}

function safeFilePart(value: string): string {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 70);

  return normalized || "imagem";
}

function storagePath(input: Readonly<{
  sourceCode: string;
  articleTitle: string;
  extension: string;
}>): string {
  const now = new Date();
  const year = String(now.getUTCFullYear());
  const month = String(now.getUTCMonth() + 1).padStart(2, "0");
  const source = safeFilePart(input.sourceCode).slice(0, 24);
  const title = safeFilePart(input.articleTitle);

  return [
    "editorial",
    year,
    month,
    `${Date.now()}-${randomUUID()}-${source}-${title}.${input.extension}`,
  ].join("/");
}

function encodeStoragePath(path: string): string {
  return path.split("/").map(encodeURIComponent).join("/");
}

function publicStorageUrl(baseUrl: string, path: string): string {
  return `${baseUrl.replace(/\/$/, "")}/storage/v1/object/public/${encodeURIComponent(BUCKET)}/${encodeStoragePath(path)}`;
}

export async function POST(request: Request) {
  let payload: ImportSourceImagePayload;
  try {
    payload = (await request.json()) as ImportSourceImagePayload;
  } catch {
    return jsonError("invalid-input", 400);
  }

  const year = cleanText(payload.year);
  const month = cleanText(payload.month);
  const packageId = cleanText(payload.packageId).toLowerCase();
  const position = typeof payload.position === "number"
    ? payload.position
    : Number(payload.position);

  if (
    !isEditorialSourcePackageLocation({ year, month, packageId })
    || !Number.isInteger(position)
    || position < 1
  ) {
    return jsonError("invalid-input", 400);
  }

  const packageResult = await readEditorialSourcePackage({
    year,
    month,
    packageId,
  });
  if (!packageResult.ok) {
    return jsonError("package-not-found", packageResult.error.code === "package_not_found" ? 404 : 400);
  }

  const entry = packageResult.value.manifest.entries.find((candidate) => (
    candidate.position === position
    && candidate.status === "prepared"
    && typeof candidate.imageUrl === "string"
    && candidate.imageUrl.trim()
  ));
  if (!entry || entry.status !== "prepared" || !entry.imageUrl?.trim()) {
    return jsonError("image-unavailable", 404);
  }

  const downloaded = await downloadEditorialSourceImage(entry.imageUrl);
  if (!downloaded) {
    return jsonError("image-unavailable", 422);
  }

  const contentType = CONTENT_TYPES.get(downloaded.extension);
  if (!contentType) {
    return jsonError("image-unavailable", 422);
  }

  const config = getSupabaseServiceConfig();
  if (!config) {
    return jsonError("missing-supabase-service-config", 500);
  }

  const path = storagePath({
    sourceCode: entry.sourceCode ?? "fonte",
    articleTitle: entry.title ?? "noticia",
    extension: downloaded.extension,
  });
  const encodedPath = encodeStoragePath(path);
  const uploadResponse = await fetch(
    `${config.url.replace(/\/$/, "")}/storage/v1/object/${encodeURIComponent(BUCKET)}/${encodedPath}`,
    {
      method: "POST",
      cache: "no-store",
      headers: {
        apikey: config.serviceRoleKey,
        Authorization: `Bearer ${config.serviceRoleKey}`,
        "Content-Type": contentType,
        "Cache-Control": "max-age=31536000",
        "x-upsert": "false",
      },
      body: Buffer.from(downloaded.bytes),
    },
  );

  if (!uploadResponse.ok) {
    const detail = await uploadResponse.text().catch(() => "");
    const missingBucket = uploadResponse.status === 404 || /bucket/i.test(detail);
    return jsonError(
      missingBucket ? "missing-editorial-images-bucket" : "storage-upload-failed",
      missingBucket ? 404 : 502,
    );
  }

  return NextResponse.json({
    ok: true,
    publicUrl: publicStorageUrl(config.url, path),
  });
}
