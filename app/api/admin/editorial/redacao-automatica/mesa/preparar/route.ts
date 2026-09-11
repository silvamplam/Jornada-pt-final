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

import { isMesaMaterialRef, mesaSelectedSources } from "@/lib/redacao-automatica/newsroom-mesa-editorial-groups";
import { isMesaUuid, mesaOrganizationCommand } from "@/lib/redacao-automatica/newsroom-mesa-organization";

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

  if (objectValue(payload)?.mesaVersion === 2) {
    const materials = objectValue(payload)?.materials;
    if (!isMesaUuid(input.preparationKey) || (input.themeId !== undefined && !isMesaUuid(input.themeId))
      || !input.title.trim() || input.title.trim().length > 180 || input.publishedContextArticleIds.length > 0
      || !Array.isArray(materials) || materials.length > 50 || !materials.every(isMesaMaterialRef)) {
      return NextResponse.json({ ok: false, code: "input_invalid", message: "Seleção de materiais inválida." }, { status: 400 });
    }
    try {
      const refs = mesaSelectedSources(input.sources, materials);
      if (!refs.length || refs.length > 20) return NextResponse.json({ ok: false, code: "input_invalid",
        message: "O motor existente aceita de 1 a 20 fontes por produção. O Tema pode conservar toda a seleção, sem dividir Dossiês." }, { status: 400 });
      const rows = await mesaOrganizationCommand("newsroom_prepare_mesa_materials_v2", {
        p_preparation_key: input.preparationKey, p_theme_id: input.themeId ?? null,
        p_title: input.title.trim(), p_source_refs: input.sources, p_material_refs: materials,
      });
      const row = rows[0];
      if (!isMesaUuid(row?.dossier_id) || !["created", "reused"].includes(String(row.preparation_action))
        || row.source_count !== refs.length || !Number.isSafeInteger(row.published_context_count)
        || Number(row.published_context_count) < 0 || Number(row.published_context_count) > 20
        || !Number.isSafeInteger(row.image_count) || Number(row.image_count) < 0) throw new Error("invalid-result");
      return NextResponse.json({ ok: true, dossierId: row.dossier_id, preparationAction: row.preparation_action,
        sourceCount: row.source_count, imageCount: row.image_count, publishedContextCount: row.published_context_count,
        workspaceUrl: `/admin/editorial/redacao-automatica/mesa/producao/${row.dossier_id}` }, { status: row.preparation_action === "created" ? 201 : 200 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      if (/mesa-material-(source|selection|key)-invalid/.test(detail)) return NextResponse.json({ ok: false,
        code: "input_invalid", message: "A seleção contém referências inválidas. Nada foi preparado." }, { status: 400 });
      if (/mesa-material-context-(limit|unavailable)/.test(detail)) return NextResponse.json({ ok: false,
        code: "preparation_conflict", message: detail.includes("context-limit")
          ? "O conjunto ultrapassa os 20 artigos de contexto aceites pelo serviço existente. Não foi cortado nem dividido nenhum Dossiê."
          : "Um artigo de contexto do Dossiê já não está publicado. A seleção e as produções anteriores foram preservadas." }, { status: 409 });
      const conflict = /conflict|stale|prepared-before-v2|classification-required|theme-unavailable/.test(detail);
      return NextResponse.json({ ok: false, code: conflict ? "preparation_conflict" : "prepare_failed",
        message: detail.includes("classification-required") ? "Há fontes por classificar no conjunto. Nenhuma produção foi alterada."
          : conflict ? "A seleção contém versões incompatíveis, alteradas ou uma preparação anterior. A seleção e as produções existentes foram preservadas."
          : "A preparação não foi concluída. Confirma a instalação da correção de grupos v2; a seleção foi preservada." },
      { status: conflict ? 409 : 502 });
    }
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
