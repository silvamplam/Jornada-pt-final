import { NextResponse } from "next/server";

import {
  prepareEditorialDossierWorkspace,
  type PrepareEditorialDossierWorkspaceInput,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service";
import {
  getNewsroomArticleClassificationsByIds,
} from "@/lib/redacao-automatica/newsroom-article-classification-repository";
import {
  validateOperationalDeskCycleSourceIds,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function prepareInput(value: unknown): PrepareEditorialDossierWorkspaceInput | null {
  const payload = objectValue(value);
  if (!payload || !Array.isArray(payload.sources) || !Array.isArray(payload.publishedContextArticleIds)) {
    return null;
  }

  const sources = payload.sources.map((candidate) => {
    const source = objectValue(candidate);
    return {
      newsroomArticleId: textValue(source?.newsroomArticleId),
      newsroomSnapshotId: textValue(source?.newsroomSnapshotId),
    };
  });
  const publishedContextArticleIds = payload.publishedContextArticleIds.map(textValue);

  return {
    preparationKey: textValue(payload.preparationKey),
    title: textValue(payload.title),
    ...(payload.themeId !== undefined ? { themeId: textValue(payload.themeId) } : {}),
    sources,
    publishedContextArticleIds,
  };
}

function errorStatus(code: string): number {
  if (code === "input_invalid") return 400;
  if (code === "preparation_conflict") return 409;
  if (code === "service_unavailable") return 503;
  return 502;
}

export async function POST(request: Request) {
  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "O pedido de preparação não é válido.",
    }, { status: 400 });
  }

  const input = prepareInput(payload);
  if (!input) {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "O pedido de preparação não é válido.",
    }, { status: 400 });
  }

  const newsroomArticleIds = input.sources.map((source) => source.newsroomArticleId);
  const cycleValidation = input.themeId
    ? { ok: true } as const
    : await validateOperationalDeskCycleSourceIds(newsroomArticleIds);
  if (!cycleValidation.ok) {
    return NextResponse.json({
      ok: false,
      code: cycleValidation.code,
      message: cycleValidation.code === "read_unavailable"
        ? "Não foi possível confirmar as fontes do ciclo operacional da Mesa."
        : "A preparação contém uma fonte que não pertence ao ciclo operacional da Mesa.",
    }, { status: cycleValidation.code === "read_unavailable" ? 503 : 400 });
  }

  const classifications = await getNewsroomArticleClassificationsByIds(
    newsroomArticleIds,
  );
  if (!classifications.ok) {
    return NextResponse.json({
      ok: false,
      code: classifications.error.code,
      message: classifications.error.message,
    }, { status: classifications.error.code === "not_configured" ? 503 : 502 });
  }
  const unclassifiedIds = classifications.value.flatMap((state, index) => (
    state.status === "unclassified" ? [newsroomArticleIds[index]] : []
  ));
  if (unclassifiedIds.length > 0) {
    return NextResponse.json({
      ok: false,
      code: "classification_required",
      message: unclassifiedIds.length === 1
        ? "A fonte selecionada está POR CLASSIFICAR. Classifica-a antes de preparar a produção."
        : `${unclassifiedIds.length} fontes selecionadas estão POR CLASSIFICAR. Classifica-as antes de preparar a produção.`,
      newsroomArticleIds: unclassifiedIds,
    }, { status: 409 });
  }

  const result = await prepareEditorialDossierWorkspace(input);
  if (!result.ok) {
    return NextResponse.json({
      ok: false,
      code: result.error.code,
      message: result.error.message,
    }, { status: errorStatus(result.error.code) });
  }

  const workspaceUrl = "/admin/editorial/redacao-automatica/mesa/producao/"
    + encodeURIComponent(result.value.dossierId);

  return NextResponse.json({
    ok: true,
    dossierId: result.value.dossierId,
    preparationAction: result.value.preparationAction,
    sourceCount: result.value.sourceCount,
    publishedContextCount: result.value.publishedContextCount,
    imageCount: result.value.imageCount,
    workspaceUrl,
  }, { status: result.value.preparationAction === "created" ? 201 : 200 });
}
