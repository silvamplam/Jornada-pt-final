import { NextResponse } from "next/server";
import { prepareMesaIntentsHttp, readMesaIntentPreparationHttp } from "@/lib/redacao-automatica/newsroom-mesa-production-intents-http";
export const GET = readMesaIntentPreparationHttp;

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
import { readThemeContinuity } from "@/lib/redacao-automatica/newsroom-theme-continuity";
import { parseMesaNewOutputGroupingRequestV2 } from "@/lib/redacao-automatica/newsroom-mesa-new-output-groups";

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value : "";
}

type MesaContextPreparationInput = Readonly<{
  preparationKey: string;
  title: string;
  contexts: readonly Readonly<Record<string, unknown>>[];
  incorporateThemeId: string | null;
  incorporateSourceIds: readonly string[];
}>;

function contextPreparationInput(value: unknown): MesaContextPreparationInput | null {
  const payload = objectValue(value);
  const preparationKey = textValue(payload?.preparationKey).trim().toLowerCase();
  const title = textValue(payload?.title).trim();
  const rawContexts = payload?.contexts;
  const rawIncorporateThemeId = payload?.incorporateThemeId;
  const incorporateThemeId = rawIncorporateThemeId === null
    ? null
    : textValue(rawIncorporateThemeId).trim().toLowerCase();
  const rawIncorporateSourceIds = payload?.incorporateSourceIds;
  if (
    !isMesaUuid(preparationKey)
    || !title
    || title.length > 180
    || !Array.isArray(rawContexts)
    || rawContexts.length < 1
    || rawContexts.length > 20
    || (incorporateThemeId !== null && !isMesaUuid(incorporateThemeId))
    || !Array.isArray(rawIncorporateSourceIds)
  ) return null;

  const contexts: Record<string, unknown>[] = [];
  const contextKeys = new Set<string>();
  const union = new Map<string, string>();
  for (const candidate of rawContexts) {
    const context = objectValue(candidate);
    const kind = textValue(context?.kind);
    const sourceId = textValue(context?.sourceId).trim().toLowerCase();
    const themeId = textValue(context?.themeId).trim().toLowerCase();
    const rawSources = context?.sources;
    if (
      !context
      || (kind !== "source" && kind !== "theme")
      || (kind === "source" ? !isMesaUuid(sourceId) || Boolean(themeId) : !isMesaUuid(themeId) || Boolean(sourceId))
      || !Array.isArray(rawSources)
      || rawSources.length < 1
      || rawSources.length > 20
    ) return null;
    const sources = rawSources.map((value) => {
      const ref = objectValue(value);
      return {
        newsroomArticleId: textValue(ref?.newsroomArticleId).trim().toLowerCase(),
        newsroomSnapshotId: textValue(ref?.newsroomSnapshotId).trim().toLowerCase(),
      };
    });
    if (
      sources.some((ref) => !isMesaUuid(ref.newsroomArticleId) || !isMesaUuid(ref.newsroomSnapshotId))
      || new Set(sources.map((ref) => ref.newsroomArticleId)).size !== sources.length
      || (kind === "source" && (sources.length !== 1 || sources[0].newsroomArticleId !== sourceId))
    ) return null;
    const key = `${kind}:${kind === "source" ? sourceId : themeId}`;
    if (contextKeys.has(key)) return null;
    contextKeys.add(key);
    for (const ref of sources) {
      const previous = union.get(ref.newsroomArticleId);
      if (previous && previous !== ref.newsroomSnapshotId) return null;
      union.set(ref.newsroomArticleId, ref.newsroomSnapshotId);
    }
    contexts.push({ kind, ...(kind === "source" ? { sourceId } : { themeId }), sources });
  }

  const incorporateSourceIds = rawIncorporateSourceIds.map((value) => textValue(value).trim().toLowerCase());
  if (
    union.size > 20
    || incorporateSourceIds.some((id) => !isMesaUuid(id))
    || new Set(incorporateSourceIds).size !== incorporateSourceIds.length
    || (incorporateThemeId === null && incorporateSourceIds.length > 0)
    || (incorporateThemeId !== null && (
      incorporateSourceIds.length < 1
      || contexts.length !== 1
      || contexts[0].kind !== "theme"
      || contexts[0].themeId !== incorporateThemeId
    ))
  ) return null;

  return { preparationKey, title, contexts, incorporateThemeId, incorporateSourceIds };
}

async function prepareMesaContexts(input: MesaContextPreparationInput) {
  try {
    const rows = await mesaOrganizationCommand("newsroom_prepare_mesa_contexts_v3", {
      p_preparation_key: input.preparationKey,
      p_title: input.title,
      p_contexts: input.contexts,
      p_incorporate_theme_id: input.incorporateThemeId,
      p_incorporate_source_ids: input.incorporateSourceIds,
    });
    const row = rows[0];
    if (
      !isMesaUuid(row?.dossier_id)
      || !["created", "reused"].includes(String(row.preparation_action))
      || !Number.isSafeInteger(row.source_count)
      || !Number.isSafeInteger(row.context_count)
      || Number(row.context_count) !== input.contexts.length
    ) throw new Error("mesa-context-preparation-result-invalid");
    return NextResponse.json({
      ok: true,
      dossierId: row.dossier_id,
      preparationAction: row.preparation_action,
      sourceCount: row.source_count,
      contextCount: row.context_count,
      imageCount: row.image_count,
      publishedContextCount: row.published_context_count,
      workspaceUrl: `/admin/editorial/redacao-automatica/mesa/producao/${row.dossier_id}`,
    }, { status: row.preparation_action === "created" ? 201 : 200 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const conflict = /conflict|stale|unavailable|not-loose|prepared-before-v3/.test(detail);
    return NextResponse.json({
      ok: false,
      code: conflict ? "preparation_conflict" : "prepare_failed",
      message: conflict
        ? "Os contextos mudaram desde a seleção. Atualiza a Mesa e volta a confirmar; nada foi preparado."
        : "Não foi possível preparar os contextos desta Produção. A seleção foi preservada.",
    }, { status: conflict ? 409 : 502 });
  }
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

type GenericThemeContinuityRequirement =
  | Readonly<{ status: "clear" }>
  | Readonly<{ status: "required"; themeId: string; themeTitle: string }>
  | Readonly<{ status: "unavailable" }>;

async function genericThemeContinuityRequirement(
  themeIds: readonly string[],
): Promise<GenericThemeContinuityRequirement> {
  try {
    for (const themeId of [...new Set(themeIds)]) {
      const continuity = await readThemeContinuity(themeId);
      if (!continuity) return { status: "unavailable" };
      if (continuity.publishedArticleCount > 0) {
        return { status: "required", themeId, themeTitle: continuity.theme.title };
      }
    }
    return { status: "clear" };
  } catch {
    return { status: "unavailable" };
  }
}

function themeContinuityRequiredResponse(themeTitle: string) {
  return NextResponse.json({
    ok: false,
    code: "theme_continuity_required",
    message: `O Tema «${themeTitle}» já tem artigos publicados. Usa «Voltar a levar à Produção» em Continuidade editorial para rever os artigos existentes antes de criar novos.`,
  }, { status: 409 });
}

function themeContinuityUnavailableResponse() {
  return NextResponse.json({
    ok: false,
    code: "theme_continuity_unavailable",
    message: "Não foi possível confirmar a continuidade editorial deste Tema. Nenhuma Produção genérica foi criada.",
  }, { status: 503 });
}

async function incorporatePublishedThemeSourcesForContinuity(
  input: MesaContextPreparationInput,
  themeTitle: string,
) {
  if (!input.incorporateThemeId || input.incorporateSourceIds.length < 1) {
    return themeContinuityRequiredResponse(themeTitle);
  }
  try {
    const rows = await mesaOrganizationCommand("newsroom_organize_theme_sources_v1", {
      p_request_id: input.preparationKey,
      p_theme_id: input.incorporateThemeId,
      p_title: "",
      p_classification_key: null,
      p_source_ids: input.incorporateSourceIds,
    });
    const row = rows[0];
    if (
      textValue(row?.theme_id) !== input.incorporateThemeId
      || !Number.isSafeInteger(row?.added_count)
      || typeof row?.reused !== "boolean"
    ) throw new Error("theme-incorporation-result-invalid");
    return NextResponse.json({
      ok: true,
      code: "theme_continuity_ready",
      incorporatedSourceCount: Number(row.added_count),
      workspaceUrl: `/admin/editorial/redacao-automatica/mesa/temas/${input.incorporateThemeId}?continuity=1`,
      message: Number(row.added_count) > 0
        ? `${Number(row.added_count)} fontes incorporadas no Tema. A abrir Continuidade editorial…`
        : "As fontes selecionadas já pertenciam ao Tema. A abrir Continuidade editorial…",
    }, { status: row.reused ? 200 : 201 });
  } catch (error) {
    const detail = error instanceof Error ? error.message : "";
    const conflict = /request-conflict|theme-unavailable|source-not-found|invalid-input/.test(detail);
    return NextResponse.json({
      ok: false,
      code: conflict ? "preparation_conflict" : "prepare_failed",
      message: conflict
        ? "O Tema ou as fontes mudaram antes da incorporação. Atualiza a Mesa e volta a confirmar; nenhuma Produção foi criada."
        : "Não foi possível incorporar as fontes no Tema antes da Continuidade editorial.",
    }, { status: conflict ? 409 : 502 });
  }
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

  const rawPayload = objectValue(payload);
  if (rawPayload?.mesaVersion === 5) {
    const groupingRequest = parseMesaNewOutputGroupingRequestV2(rawPayload.groupingRequest);
    const action = textValue(rawPayload.action);
    if (!groupingRequest || !["preview_groups", "prepare_groups"].includes(action)) {
      return NextResponse.json({ ok: false, code: "input_invalid", message: "A seleção para a Produção não é válida." }, { status: 400 });
    }
    try {
      if (action === "preview_groups") {
        const rows = await mesaOrganizationCommand("newsroom_preview_mesa_grouping_v2", {
          p_request: groupingRequest,
        });
        const plan = objectValue(rows[0]?.plan);
        const authorityFingerprint = textValue(plan?.authorityFingerprint);
        if (!/^[0-9a-f]{64}$/.test(authorityFingerprint)) throw new Error("mesa-grouping-preview-invalid");
        return NextResponse.json({
          ok: true,
          authorityFingerprint,
          sourceCount: Number(plan?.sourceCount ?? 0),
          reviewCount: Number(plan?.reviewCount ?? 0),
        });
      }
      const authorityFingerprint = textValue(rawPayload.authorityFingerprint);
      if (!/^[0-9a-f]{64}$/.test(authorityFingerprint)) {
        return NextResponse.json({ ok: false, code: "input_invalid", message: "A referência da seleção não é válida." }, { status: 400 });
      }
      const rows = await mesaOrganizationCommand("newsroom_prepare_mesa_grouping_v2", {
        p_request: groupingRequest,
        p_expected_authority_fingerprint: authorityFingerprint,
      });
      const result = objectValue(rows[0]?.result);
      const dossierId = textValue(result?.dossierId);
      if (!isMesaUuid(dossierId) || !["created", "reused"].includes(textValue(result?.preparationAction))) {
        throw new Error("mesa-grouping-preparation-result-invalid");
      }
      return NextResponse.json({
        ok: true,
        dossierId,
        preparationAction: result?.preparationAction,
        workspaceUrl: `/admin/editorial/redacao-automatica/mesa/producao/${dossierId}`,
      }, { status: result?.preparationAction === "created" ? 201 : 200 });
    } catch (error) {
      const detail = error instanceof Error ? error.message : "";
      const conflict = /conflict|stale|unavailable|key-used/.test(detail);
      return NextResponse.json({
        ok: false,
        code: conflict ? "intent_stale" : "prepare_failed",
        message: conflict
          ? "O material mudou desde a leitura. Atualiza a Mesa e volta a preparar; nenhuma fonte foi alterada."
          : "Não foi possível preparar o agrupamento. A seleção e o estado das fontes foram preservados.",
      }, { status: conflict ? 409 : 502 });
    }
  }
  if (rawPayload && (rawPayload.mesaVersion === 4 || Object.hasOwn(rawPayload, "productionIntents"))) return prepareMesaIntentsHttp(rawPayload);
  if (rawPayload?.mesaVersion === 3) {
    const contextInput = contextPreparationInput(payload);
    if (!contextInput) {
      return NextResponse.json({ ok: false, code: "input_invalid", message: "A seleção de contextos não é válida." }, { status: 400 });
    }
    const themeIds = contextInput.contexts
      .filter((context) => textValue(context.kind) === "theme")
      .map((context) => textValue(context.themeId));
    const continuityRequirement = await genericThemeContinuityRequirement(themeIds);
    if (continuityRequirement.status === "unavailable") return themeContinuityUnavailableResponse();
    if (continuityRequirement.status === "required") {
      if (
        contextInput.incorporateThemeId === continuityRequirement.themeId
        && contextInput.incorporateSourceIds.length > 0
      ) {
        return incorporatePublishedThemeSourcesForContinuity(
          contextInput,
          continuityRequirement.themeTitle,
        );
      }
      return themeContinuityRequiredResponse(continuityRequirement.themeTitle);
    }
    return prepareMesaContexts(contextInput);
  }

  const input = prepareInput(payload);
  if (!input) {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "O pedido de preparação não é válido.",
    }, { status: 400 });
  }

  if (input.themeId) {
    const continuityRequirement = await genericThemeContinuityRequirement([input.themeId]);
    if (continuityRequirement.status === "unavailable") return themeContinuityUnavailableResponse();
    if (continuityRequirement.status === "required") return themeContinuityRequiredResponse(continuityRequirement.themeTitle);
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
