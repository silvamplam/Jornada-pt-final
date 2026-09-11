import { NextResponse } from "next/server";

import { isArticleClassificationKey } from "@/lib/editorial-classifications";
import {
  setManualNewsroomArticleClassification,
} from "@/lib/redacao-automatica/newsroom-article-classification-service";
import {
  validateOperationalDeskCycleSourceIds,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";

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
  const newsroomArticleId = typeof payload?.newsroomArticleId === "string"
    ? payload.newsroomArticleId.trim().toLowerCase()
    : "";
  const classificationKey = typeof payload?.classificationKey === "string"
    ? payload.classificationKey.trim()
    : "";
  if (!UUID_PATTERN.test(newsroomArticleId) || !isArticleClassificationKey(classificationKey)) {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "A classificação manual pedida não é válida.",
    }, { status: 400 });
  }

  const cycle = await validateOperationalDeskCycleSourceIds([newsroomArticleId]);
  if (!cycle.ok) {
    return NextResponse.json({
      ok: false,
      code: cycle.code,
      message: cycle.code === "read_unavailable"
        ? "Não foi possível confirmar a fonte no ciclo operacional."
        : "A fonte não pertence ao ciclo operacional da Mesa.",
    }, { status: cycle.code === "read_unavailable" ? 503 : 400 });
  }

  const result = await setManualNewsroomArticleClassification({
    newsroomArticleId,
    classificationKey,
  });
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      code: result.error.code,
      message: result.error.message,
    }, { status: result.error.code === "invalid_request" ? 400 : 502 });
  }
  return NextResponse.json({
    ok: true,
    classificationKey,
    changed: result.value.changed,
  });
}
