import { NextResponse } from "next/server";

import { isArticleClassificationKey } from "@/lib/editorial-classifications";
import {
  setManualNewsroomArticleClassifications,
} from "@/lib/redacao-automatica/newsroom-article-classification-service";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export async function POST(request: Request) {
  let value: unknown;
  try {
    value = await request.json();
  } catch {
    value = null;
  }
  const payload = objectValue(value);
  const rawIds = Array.isArray(payload?.newsroomArticleIds)
    ? payload.newsroomArticleIds
    : [payload?.newsroomArticleId];
  const newsroomArticleIds = rawIds.map((item) => (
    typeof item === "string" ? item.trim().toLowerCase() : ""
  ));
  const classificationKey = payload
    && Object.prototype.hasOwnProperty.call(payload, "classificationKey")
    && payload.classificationKey === null
    ? null
    : typeof payload?.classificationKey === "string"
      ? payload.classificationKey.trim()
      : undefined;
  if (
    newsroomArticleIds.length < 1
    || newsroomArticleIds.length > 20
    || newsroomArticleIds.some((id) => !UUID_PATTERN.test(id))
    || new Set(newsroomArticleIds).size !== newsroomArticleIds.length
    || (
      classificationKey !== null
      && !isArticleClassificationKey(classificationKey)
    )
  ) {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "A classificação manual pedida não é válida.",
    }, { status: 400 });
  }

  const result = await setManualNewsroomArticleClassifications({
    newsroomArticleIds,
    classificationKey,
  });
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      code: result.error.code,
      message: result.error.message,
    }, {
      status: ["invalid_request", "source_not_found", "outside_cycle", "theme_conflict"]
        .includes(result.error.code)
        ? 400
        : 502,
    });
  }
  return NextResponse.json({
    ok: true,
    classificationKey,
    requestedCount: result.value.requestedCount,
    changedCount: result.value.changedCount,
  });
}
