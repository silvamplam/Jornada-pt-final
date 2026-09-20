import { NextResponse } from "next/server";

import {
  createManualNewsroomSource,
  type ManualNewsroomSourceErrorCode,
} from "@/lib/redacao-automatica/manual-newsroom-source-service";

function record(value: unknown): Record<string, unknown> | null {
  return value && !Array.isArray(value) && typeof value === "object"
    ? value as Record<string, unknown>
    : null;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function status(code: ManualNewsroomSourceErrorCode): number {
  if (code === "submission_payload_conflict") return 409;
  if (code === "service_unavailable") return 503;
  if (code === "save_failed") return 500;
  return 400;
}

export async function POST(request: Request) {
  let payload: Record<string, unknown> | null = null;
  try {
    const raw = await request.text();
    if (raw.length <= 80_000) payload = record(JSON.parse(raw));
  } catch {
    // Invalid JSON is reported through the same closed request contract.
  }
  if (!payload) {
    return NextResponse.json({ ok: false, error: "invalid_request" }, { status: 400 });
  }

  const result = await createManualNewsroomSource({
    submissionId: text(payload.submissionId),
    body: text(payload.body),
    imageUrl: text(payload.imageUrl),
    publishedDate: optionalText(payload.publishedDate),
    sourceUrl: optionalText(payload.sourceUrl),
    sourcePageTitle: optionalText(payload.sourcePageTitle),
    sourceHost: optionalText(payload.sourceHost),
  });
  if (!result.ok) {
    return NextResponse.json(
      { ok: false, error: result.error.code },
      { status: status(result.error.code) },
    );
  }

  return NextResponse.json({
    ok: true,
    action: result.value.action,
    newsroomArticleId: result.value.newsroomArticleId,
  });
}
