import { createImageFreezeStorage } from "@/lib/editorial-image-freeze-storage.server";
import { editorialImageOriginalPath } from "@/lib/editorial-image-authority";

import { NextResponse } from "next/server";

import { getSupabaseServiceConfig } from "@/lib/supabase";
import {
  isEditorialSourcePackageLocation,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import { readEditorialSourcePackageManifest } from "@/lib/redacao-automatica/editorial-source-package";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

type ImportSourceImagePayload = Readonly<{
  year?: unknown;
  month?: unknown;
  packageId?: unknown;
  position?: unknown;
  acquisitionId?: unknown;
}>;

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(error: string, status: number): NextResponse {
  return NextResponse.json({ ok: false, error }, { status });
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
  const acquisitionId = cleanText(payload.acquisitionId);
  const position = typeof payload.position === "number"
    ? payload.position
    : Number(payload.position);

  if (
    !isEditorialSourcePackageLocation({ year, month, packageId })
    || !Number.isInteger(position)
    || position < 1
    || (acquisitionId && !/^[a-f0-9-]{36}$/.test(acquisitionId))
  ) {
    return jsonError("invalid-input", 400);
  }

  const packageResult = await readEditorialSourcePackageManifest({
    year,
    month,
    packageId,
  });
  if (!packageResult.ok) {
    return jsonError("package-not-found", packageResult.error.code === "package_not_found" ? 404 : 400);
  }

  const entry = packageResult.value.entries.find((candidate) => (
    candidate.position === position
    && candidate.status === "prepared"
    && typeof candidate.imageUrl === "string"
    && candidate.imageUrl.trim()
  ));
  if (!entry || entry.status !== "prepared" || !entry.imageUrl?.trim()) {
    return jsonError("image-unavailable", 404);
  }

  const config = getSupabaseServiceConfig();
  if (!config) return jsonError("missing-supabase-service-config", 500);
  try {
    const storage = createImageFreezeStorage(config);
    if (editorialImageOriginalPath(entry.imageUrl, config.url)) {
      await storage.registerLocal(entry.imageUrl);
      return NextResponse.json({ ok: true, publicUrl: entry.imageUrl });
    }
    const image = await storage.freeze(
      `package:${packageId}:${position}${acquisitionId ? `:${acquisitionId}` : ""}`, entry.imageUrl,
    );
    return NextResponse.json({ ok: true, publicUrl: image.publicUrl, sha256: image.sha256 });
  } catch {
    return jsonError("image-unavailable", 422);
  }
}
