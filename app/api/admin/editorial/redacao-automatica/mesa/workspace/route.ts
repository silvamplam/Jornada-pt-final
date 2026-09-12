import { NextResponse } from "next/server";

import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import {
  getEditorialDossierById,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import {
  listEditorialDossierArticlePlans,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";
import {
  addEditorialDossierUploadImage,
  type EditorialDossierArticlePlanImageChoice,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service";
import {
  getEditorialDossierProductionWorkspace,
  type EditorialDossierImage,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-repository";
import {
  saveEditorialDossierWorkspaceArticlePlan,
  type SaveEditorialDossierWorkspaceArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-editor-service";
import {
  createEditorialSourcePackage,
  readEditorialSourcePackage,
} from "@/lib/redacao-automatica/editorial-source-package";
import { fetchSupabaseAdminTable, writeSupabaseAdminReturning } from "@/lib/supabase";
import {
  preflightEditorialArticleBatch,
  preflightEditorialMesaV2ArticleBatch,
} from "@/lib/redacao-automatica/editorial-batch-parser";
import {
  editorialMesaPackageBatchContract,
  validateEditorialMesaOutputProvenance,
} from "@/lib/redacao-automatica/editorial-mesa-provenance";
import {
  editorialMesaWorkspaceOutputWorkingTitle,
  editorialMesaWorkspaceStartingPointSourceIds,
} from "@/lib/redacao-automatica/editorial-mesa-workspace-defaults";
import { synchronizeEditorialMesaSharedOutputs } from "@/lib/redacao-automatica/editorial-dossier-article-plan-service";
import {
  editorialSourcePackageArticleImageSources,
  editorialSourcePackageImagesFileName,
  type EditorialSourcePackageExternalImage,
  type EditorialSourcePackageOutputCreationInput,
  type EditorialSourcePackageSelection,
} from "@/lib/redacao-automatica/editorial-source-package-internal";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const articleKindLabels: Record<EditorialDossierArticleKind, string> = {
  news: "Notícia",
  analysis: "Análise",
  preview: "Antevisão",
  summary: "Síntese",
};

const lengthModeLabels: Record<EditorialDossierLengthMode, string> = {
  brief: "Curta",
  standard: "Média",
  developed: "Longa",
};

function objectValue(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function textValue(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function nullableText(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return typeof value === "string" ? value.trim() : undefined;
}

function uuid(value: unknown): string | null {
  const candidate = textValue(value).toLowerCase();
  return UUID_PATTERN.test(candidate) ? candidate : null;
}

function articleKind(value: unknown): EditorialDossierArticleKind | null {
  const candidate = textValue(value);
  return ["news", "analysis", "preview", "summary"].includes(candidate)
    ? candidate as EditorialDossierArticleKind
    : null;
}

function lengthMode(value: unknown): EditorialDossierLengthMode | null {
  const candidate = textValue(value);
  return ["brief", "standard", "developed"].includes(candidate)
    ? candidate as EditorialDossierLengthMode
    : null;
}

function imageChoice(value: unknown): EditorialDossierArticlePlanImageChoice | null {
  const candidate = objectValue(value);
  const mode = textValue(candidate?.mode);
  if (mode === "unselected") return { mode };
  if (mode === "preserve_published") return { mode };
  if (mode === "dossier_image") {
    const dossierImageId = uuid(candidate?.dossierImageId);
    return dossierImageId ? { mode, dossierImageId } : null;
  }
  return null;
}

type WorkspaceContextRow = Readonly<{
  dossier_id: string;
  selection_payload: unknown;
  source_refs: unknown;
  material_refs: unknown;
  workspace_contract_version: number | null;
  workspace_state: string | null;
}>;

type DerivedSavePlanInput = Readonly<{
  input: SaveEditorialDossierWorkspaceArticlePlanInput;
  workspaceContractVersion: 1 | 2;
}>;

function sourcePackageLocation(value: unknown): Readonly<{
  year: string;
  month: string;
  packageId: string;
}> | null {
  const row = objectValue(value);
  const year = textValue(row?.year);
  const month = textValue(row?.month);
  const packageId = uuid(row?.packageId);
  return /^\d{4}$/.test(year) && /^(0[1-9]|1[0-2])$/.test(month) && packageId
    ? { year, month, packageId }
    : null;
}

const provenanceErrorMessages: Readonly<Record<string, string>> = {
  "mesa-v2-output-count-mismatch": "A resposta não contém exatamente os outputs desta produção.",
  "mesa-v2-provenance-missing": "Cada artigo desta produção tem de indicar OUTPUT_ID e FONTES_UTILIZADAS.",
  "mesa-v2-output-unknown": "A resposta contém um OUTPUT_ID que não pertence a esta produção.",
  "mesa-v2-output-duplicate": "A resposta repete um OUTPUT_ID.",
  "mesa-v2-source-unknown": "A resposta refere uma fonte que não pertence ao material autorizado desta produção.",
  "mesa-v2-source-duplicate": "A resposta repete uma fonte em FONTES_UTILIZADAS.",
};

async function savePlanInput(value: unknown): Promise<DerivedSavePlanInput | null> {
  const payload = objectValue(value);
  if (!payload) return null;
  const dossierId = uuid(payload.dossierId);
  const rawPlanId = nullableText(payload.articlePlanId);
  const articlePlanId = rawPlanId === null ? null : uuid(rawPlanId);
  const kind = articleKind(payload.articleKind);
  const length = lengthMode(payload.lengthMode);
  const destination = textValue(payload.destination);
  const rawTarget = nullableText(payload.updateTargetEditorialArticleId);
  const target = rawTarget === null ? null : uuid(rawTarget);
  const selectedImage = imageChoice(payload.imageChoice);
  const priority = typeof payload.priority === "number" ? payload.priority : NaN;

  if (
    !dossierId
    || rawPlanId === undefined
    || (rawPlanId !== null && !articlePlanId)
    || !kind
    || !length
    || !selectedImage
    || !Number.isInteger(priority)
    || (destination !== "new" && destination !== "update")
    || (destination === "new" && rawTarget !== null)
    || (destination === "update" && !target)
    || (destination === "new" && selectedImage.mode === "preserve_published")
  ) return null;

  const [dossierResult, workspaceResult, contextResult] = await Promise.all([
    getEditorialDossierById(dossierId),
    getEditorialDossierProductionWorkspace(dossierId),
    fetchSupabaseAdminTable<WorkspaceContextRow>(
      "newsroom_mesa_production_contexts"
      + "?select=dossier_id,selection_payload,source_refs,material_refs,workspace_contract_version,workspace_state"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}&limit=1`,
    ).then((rows) => ({ ok: true as const, rows }))
      .catch(() => ({ ok: false as const, rows: [] })),
  ]);
  if (
    !dossierResult.ok
    || !dossierResult.value
    || !workspaceResult.ok
    || !workspaceResult.value
    || !contextResult.ok
  ) {
    return null;
  }

  const context = contextResult.rows[0] ?? null;
  if (context?.workspace_state && context.workspace_state !== "active") return null;
  const workspaceContractVersion = context?.workspace_contract_version === 2 ? 2 : 1;
  const includedSources = dossierResult.value.sources.filter((source) => source.included);
  const technicalSources = includedSources
    .slice()
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  if (technicalSources.length < 1) return null;

  const startingPointSourceIds = workspaceContractVersion === 2
    ? editorialMesaWorkspaceStartingPointSourceIds(
        context?.selection_payload,
        context?.material_refs,
        technicalSources.map((source) => ({
          dossierSourceId: source.id,
          newsroomArticleId: source.newsroomArticleId,
        })),
        priority,
      )
    : [];
  const workingTitle = workspaceContractVersion === 2
    ? editorialMesaWorkspaceOutputWorkingTitle(
        priority,
        startingPointSourceIds[priority - 1],
        technicalSources.map((source) => ({
          dossierSourceId: source.id,
          newsroomArticleId: source.newsroomArticleId,
          articleTitle: source.articleTitle,
        })),
      )
    : `Output ${String(priority).padStart(2, "0")} — ${dossierResult.value.title}`.slice(0, 180);
  if (!workingTitle) return null;

  const contexts = workspaceResult.value.publishedContexts.map((item) => item.id);
  return {
    workspaceContractVersion,
    input: {
      plan: {
        dossierId,
        articlePlanId,
        workingTitle,
        status: "planned",
        priority,
        articleKind: kind,
        lengthMode: length,
        editorialInstructions: textValue(payload.editorialInstructions),
        sources: technicalSources.map((source, index) => ({
          dossierSourceId: source.id,
          priority: index + 1,
        })),
      },
      production: {
        destination,
        updateTargetEditorialArticleId: target,
        dossierPublishedContextIds: contexts,
        imageChoice: selectedImage,
      },
    },
  };
}

function commandErrorStatus(code: string, partialPersistence = false): number {
  if (partialPersistence) return 409;
  if (code === "input_invalid") return 400;
  if (code === "service_unavailable") return 503;
  if (code.includes("not_found")) return 404;
  if (code.includes("limit") || code.includes("already_converted")) return 409;
  return 502;
}

function packageExternalImage(
  image: EditorialDossierImage,
): EditorialSourcePackageExternalImage | null {
  if (!image || typeof image !== "object" || !("frozenUrl" in image)) return null;
  const frozenUrl = String(image.frozenUrl);
  try {
    const parsed = new URL(frozenUrl);
    const decodedPath = decodeURIComponent(parsed.pathname);
    if (!decodedPath.includes("/storage/v1/object/public/editorial-images/")) return null;
    const pathName = decodedPath.split("/").pop() ?? "";
    const fileName = "fileName" in image && typeof image.fileName === "string"
      ? image.fileName
      : pathName;
    return /\.(?:jpe?g|png|webp)$/i.test(fileName) ? { url: frozenUrl, fileName } : null;
  } catch {
    return null;
  }
}

async function prepareWorkspaceSourcePackage(dossierId: string) {
  const [dossierResult, plansResult, workspaceResult, contextResult] = await Promise.all([
    getEditorialDossierById(dossierId),
    listEditorialDossierArticlePlans(dossierId),
    getEditorialDossierProductionWorkspace(dossierId),
    fetchSupabaseAdminTable<WorkspaceContextRow>(
      "newsroom_mesa_production_contexts"
      + "?select=dossier_id,selection_payload,source_refs,material_refs,workspace_contract_version,workspace_state"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}&limit=1`,
    ).then((rows) => ({ ok: true as const, rows }))
      .catch(() => ({ ok: false as const, rows: [] })),
  ]);
  if (!dossierResult.ok || !plansResult.ok || !workspaceResult.ok || !contextResult.ok) {
    return { ok: false as const, status: 503, message: "Não foi possível ler a produção guardada." };
  }
  if (!dossierResult.value || !workspaceResult.value) {
    return { ok: false as const, status: 404, message: "A produção já não está disponível." };
  }

  const dossier = dossierResult.value;
  const workspace = workspaceResult.value;
  const context = contextResult.rows[0] ?? null;
  const workspaceContractVersion = context?.workspace_contract_version === 2 ? 2 : 1;
  if (context?.workspace_state && context.workspace_state !== "active") {
    return { ok: false as const, status: 409, message: "Esta produção já não está ativa." };
  }
  const plans = plansResult.value.filter((plan) => plan.status !== "cancelled");
  if (plans.length < 1 || plans.length > 30 || plans.length !== dossier.outputCount) {
    return { ok: false as const, status: 409, message: "Guarda primeiro todos os artigos da produção." };
  }
  if (plans.some((plan) => plan.editorialArticleId)) {
    return { ok: false as const, status: 409, message: "Esta produção já contém artigos materializados e não pode gerar um segundo lote." };
  }
  const workspaceSources = dossier.sources
    .filter((source) => source.included)
    .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  if (workspaceSources.length < 1) {
    return { ok: false as const, status: 409, message: "A produção não contém fontes autorizadas." };
  }
  const startingPointSourceIds = workspaceContractVersion === 2
    ? editorialMesaWorkspaceStartingPointSourceIds(
        context?.selection_payload,
        context?.material_refs,
        workspaceSources.map((source) => ({
          dossierSourceId: source.id,
          newsroomArticleId: source.newsroomArticleId,
        })),
        plans.length,
      )
    : [];
  if (workspaceContractVersion === 2 && startingPointSourceIds.length !== plans.length) {
    return { ok: false as const, status: 409, message: "Não foi possível determinar o ponto de partida dos outputs desta produção." };
  }
  const selections: EditorialSourcePackageSelection[] = workspaceSources.map((source) => ({
    newsroomArticleId: source.newsroomArticleId,
    newsroomSnapshotId: source.newsroomSnapshotId,
    ...(workspaceContractVersion === 2 ? { provenanceSourceId: source.id } : {}),
    articleGroup: 1,
  }));

  const contextByArticleId = new Map(
    workspace.publishedContexts.map((context) => [context.editorialArticleId, context]),
  );
  const imageById = new Map(workspace.images.map((image) => [image.id, image]));
  const outputs: EditorialSourcePackageOutputCreationInput[] = [];
  for (const [index, plan] of plans.entries()) {
    const target = plan.updateTargetEditorialArticleId
      ? contextByArticleId.get(plan.updateTargetEditorialArticleId) ?? null
      : null;
    if (plan.destination === "update" && (!target || target.status !== "published")) {
      return { ok: false as const, status: 409, message: "Um target de UPDATE deixou de ser elegível. Confirma-o novamente no respetivo artigo." };
    }

    const selectedImage = plan.imageChoice.mode === "dossier_image"
      ? imageById.get(plan.imageChoice.dossierImageId) ?? null
      : null;
    const selectedSourceImage = selectedImage?.origin === "newsroom"
      && workspaceSources.some((source) => source.newsroomArticleId === selectedImage.newsroomArticleId)
      ? selectedImage.newsroomArticleId
      : null;
    const externalImage = selectedImage && !selectedSourceImage
      ? packageExternalImage(selectedImage)
      : null;
    if (selectedImage && !selectedSourceImage && !externalImage) {
      return { ok: false as const, status: 409, message: `A imagem do artigo ${index + 1} não pode ser incluída no pacote. Escolhe uma imagem do banco editorial.` };
    }

    const outputWorkingTitle = workspaceContractVersion === 2
      ? editorialMesaWorkspaceOutputWorkingTitle(
          index + 1,
          startingPointSourceIds[index],
          workspaceSources.map((source) => ({
            dossierSourceId: source.id,
            newsroomArticleId: source.newsroomArticleId,
            articleTitle: source.articleTitle,
          })),
        )
      : plan.workingTitle;
    if (!outputWorkingTitle) {
      return { ok: false as const, status: 409, message: `Não foi possível determinar o ponto de partida textual do artigo ${index + 1}.` };
    }

    outputs.push({
      position: index + 1,
      ...(workspaceContractVersion === 2
        ? {
            outputId: plan.id,
            startingPointSourceId: startingPointSourceIds[index],
          }
        : {}),
      sourceArticlePosition: 1,
      focus: (plan.editorialInstructions || outputWorkingTitle).slice(0, 240),
      imageNewsroomArticleId: selectedSourceImage,
      ...(externalImage ? { externalImage } : {}),
      ...(target ? {
        publishedArticleId: target.editorialArticleId,
        publishedSlug: target.slug,
      } : {}),
      articlePlan: {
        dossierId,
        articlePlanId: plan.id,
        workingTitle: outputWorkingTitle,
        articleKind: plan.articleKind,
        articleKindLabel: articleKindLabels[plan.articleKind],
        lengthMode: plan.lengthMode,
        lengthModeLabel: lengthModeLabels[plan.lengthMode],
        editorialInstructions: plan.editorialInstructions,
        destination: plan.destination,
        ...(workspaceContractVersion === 2
          ? {
              workspaceContractVersion: 2 as const,
              sourceScope: "workspace" as const,
            }
          : {}),
      },
    });
  }

  const packageId = crypto.randomUUID();
  const packageResult = await createEditorialSourcePackage({
    packageId,
    selections,
    outputs,
    publishedContextArticleIds: workspace.publishedContexts.map((item) => item.editorialArticleId),
    editorial: {
      genre: plans[0].articleKind === "analysis"
        ? "analysis"
        : plans[0].articleKind === "summary" ? "brief" : "news",
      genreLabel: articleKindLabels[plans[0].articleKind],
      suggestedTitle: workspaceContractVersion === 2 ? null : dossier.title,
      additionalInstructions: "Segue o género, a extensão e o foco individual indicados em cada Article Plan.",
    },
  });
  if (!packageResult.ok) {
    return { ok: false as const, status: 409, message: `Não foi possível preparar o pacote editorial (${packageResult.error.code}).` };
  }

  const manifest = packageResult.value.manifest;
  const packageBatchContract = editorialMesaPackageBatchContract(manifest);
  if (workspaceContractVersion === 2 && packageBatchContract.kind !== "mesa-v2") {
    return { ok: false as const, status: 409, message: "O pacote não preservou o contrato obrigatório desta produção Mesa v2." };
  }
  const articleImages = editorialSourcePackageArticleImageSources(manifest.entries, manifest.outputs);
  const contentUrl = `/api/admin/editorial/redacao-automatica/source-package/${manifest.year}/${manifest.month}/${manifest.packageId}`;
  const updateArticleCount = manifest.outputs.filter(
    (output) => Boolean(output.publishedArticleId && output.publishedSlug),
  ).length;
  return {
    ok: true as const,
    value: {
      contentUrl,
      imagesUrl: `${contentUrl}/images`,
      imagesFileName: editorialSourcePackageImagesFileName(manifest.genre, manifest.suggestedTitle),
      imageSourceCount: articleImages.length,
      articleCount: manifest.articleCount,
      genreLabel: manifest.genreLabel,
      sourcePackage: {
        year: manifest.year,
        month: manifest.month,
        packageId: manifest.packageId,
        ...(packageBatchContract.kind === "mesa-v2"
          ? { batchContract: packageBatchContract.value }
          : {}),
        ...(updateArticleCount > 0 ? { updateArticleCount } : {}),
        outputImages: articleImages.map((image) => ({
          position: image.position,
          imageUrl: image.imageUrl,
          label: image.fileName ?? image.articleTitle,
        })),
      },
    },
  };
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({
      ok: false,
      code: "input_invalid",
      message: "O comando do workspace não é válido.",
    }, { status: 400 });
  }

  const payload = objectValue(body);
  const action = textValue(payload?.action);

  if (action === "validate_ai_response") {
    const dossierId = uuid(payload?.dossierId);
    const location = sourcePackageLocation(payload?.sourcePackage);
    const responseText = textValue(payload?.response);
    if (!dossierId || !location || !responseText) {
      return NextResponse.json({
        ok: false,
        code: "input_invalid",
        message: "Não foi possível identificar a resposta e o pacote desta produção.",
      }, { status: 400 });
    }
    const packageResult = await readEditorialSourcePackage(location);
    if (!packageResult.ok) {
      return NextResponse.json({
        ok: false,
        code: packageResult.error.code,
        message: "O pacote desta produção já não pôde ser validado.",
      }, { status: 409 });
    }
    const packageBatchContract = editorialMesaPackageBatchContract(
      packageResult.value.manifest,
    );
    if (packageBatchContract.kind === "invalid") {
      return NextResponse.json({
        ok: false,
        code: "response_format_invalid",
        message: "O package Mesa v2 não possui um contrato de outputs e fontes válido.",
      }, { status: 409 });
    }
    const preflight = packageBatchContract.kind === "mesa-v2"
      ? preflightEditorialMesaV2ArticleBatch(responseText, {
          outputIds: packageBatchContract.value.outputIds,
          sourceIds: packageBatchContract.value.sourceIds,
        })
      : preflightEditorialArticleBatch(responseText);
    if (!preflight.ready) {
      return NextResponse.json({
        ok: false,
        code: "response_format_invalid",
        message: preflight.issues[0]?.message
          ?? "A resposta não respeita o formato JORNADA_ARTIGO_V1.",
      }, { status: 409 });
    }
    if (packageResult.value.manifest.outputs.some((output) => (
      output.articlePlan && output.articlePlan.dossierId !== dossierId
    ))) {
      return NextResponse.json({
        ok: false,
        code: "mesa-v2-output-unknown",
        message: "O pacote não pertence a esta produção.",
      }, { status: 409 });
    }
    const validation = validateEditorialMesaOutputProvenance(
      packageResult.value.manifest,
      preflight.articles,
    );
    if (!validation.ok) {
      return NextResponse.json({
        ok: false,
        code: validation.code,
        message: provenanceErrorMessages[validation.code]
          ?? "A proveniência da resposta não é válida.",
      }, { status: 409 });
    }
    return NextResponse.json({ ok: true, contract: validation.contract });
  }

  if (action === "preview_abandon" || action === "abandon_production") {
    const dossierId = uuid(payload?.dossierId);
    if (!dossierId) {
      return NextResponse.json({ ok: false, code: "input_invalid", message: "A produção não é válida." }, { status: 400 });
    }
    try {
      if (action === "preview_abandon") {
        const rows = await writeSupabaseAdminReturning<{
          workspace_state: string;
          publication_count: number;
          source_count: number;
          removable_theme_memberships: unknown;
        }>("rpc/newsroom_preview_abandon_mesa_production_v2", {
          method: "POST",
          body: JSON.stringify({ p_dossier_id: dossierId }),
        });
        const preview = rows[0];
        if (!preview) throw new Error("mesa-production-not-found");
        return NextResponse.json({
          ok: true,
          workspaceState: preview.workspace_state,
          publicationCount: preview.publication_count,
          sourceCount: preview.source_count,
          restoredThemeMembershipCount: Array.isArray(preview.removable_theme_memberships)
            ? preview.removable_theme_memberships.length
            : 0,
        });
      }
      if (payload?.confirmed !== true) {
        return NextResponse.json({ ok: false, code: "confirmation_required", message: "Confirma primeiro o impacto do abandono." }, { status: 409 });
      }
      const rows = await writeSupabaseAdminReturning<{
        abandonment_action: string;
        restored_theme_membership_count: number;
      }>("rpc/newsroom_abandon_mesa_production_v2", {
        method: "POST",
        body: JSON.stringify({ p_dossier_id: dossierId }),
      });
      if (!rows[0]) throw new Error("mesa-production-abandon-failed");
      return NextResponse.json({
        ok: true,
        abandonmentAction: rows[0].abandonment_action,
        restoredThemeMembershipCount: rows[0].restored_theme_membership_count,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "";
      const published = message.includes("mesa-production-already-published");
      return NextResponse.json({
        ok: false,
        code: published ? "production_already_published" : "production_abandon_failed",
        message: published
          ? "Esta produção possui publicação efetiva e não pode ser abandonada."
          : "Não foi possível abandonar a produção sem alterar o seu histórico.",
      }, { status: published ? 409 : 502 });
    }
  }

  if (action === "save_article_plan") {
    const derived = await savePlanInput(payload);
    if (!derived) {
      return NextResponse.json({
        ok: false,
        code: "input_invalid",
        message: "Revê os dados do Article Plan antes de guardar.",
        partialPersistence: false,
      }, { status: 400 });
    }

    const result = await saveEditorialDossierWorkspaceArticlePlan(derived.input);
    if (!result.ok) {
      const partialMessage = result.error.partialPersistence
        ? `${result.error.message} O planeamento base foi guardado; recarrega para ver exatamente o estado persistido.`
        : result.error.message;
      return NextResponse.json({
        ok: false,
        code: result.error.code,
        stage: result.error.stage,
        message: partialMessage,
        partialPersistence: result.error.partialPersistence,
        articlePlanId: result.error.articlePlanId,
      }, {
        status: commandErrorStatus(
          result.error.code,
          result.error.partialPersistence,
        ),
      });
    }

    return NextResponse.json({
      ok: true,
      articlePlanId: result.value.articlePlanId,
      created: result.value.created,
      planStatus: result.value.planStatus,
      productionState: result.value.productionState,
    }, { status: result.value.created ? 201 : 200 });
  }

  if (action === "update_output_count") {
    const dossierId = uuid(payload?.dossierId);
    const outputCount = typeof payload?.outputCount === "number"
      ? payload.outputCount
      : NaN;
    const articlePlanIds = Array.isArray(payload?.articlePlanIds)
      ? payload.articlePlanIds.map(uuid)
      : [];

    if (
      !dossierId
      || !Number.isInteger(outputCount)
      || outputCount < 1
      || outputCount > 30
      || articlePlanIds.length !== outputCount
      || articlePlanIds.some((id) => !id)
      || new Set(articlePlanIds).size !== articlePlanIds.length
    ) {
      return NextResponse.json({
        ok: false,
        code: "input_invalid",
        message: "Indica um número válido de artigos a produzir.",
      }, { status: 400 });
    }

    const current = await getEditorialDossierById(dossierId);
    if (!current.ok) {
      return NextResponse.json({
        ok: false,
        code: current.error.code,
        message: current.error.message,
      }, { status: 503 });
    }
    if (!current.value) {
      return NextResponse.json({
        ok: false,
        code: "dossier_not_found",
        message: "A produção já não está disponível.",
      }, { status: 404 });
    }

    const synchronized = await synchronizeEditorialMesaSharedOutputs({
      dossierId,
      articlePlanIds: articlePlanIds as string[],
    });
    if (!synchronized.ok) {
      return NextResponse.json({
        ok: false,
        code: synchronized.code,
        message: "Não foi possível confirmar o número total de outputs desta produção.",
      }, { status: commandErrorStatus(synchronized.code) });
    }

    return NextResponse.json({ ok: true, outputCount: synchronized.outputCount });
  }

  if (action === "prepare_source_package") {
    const dossierId = uuid(payload?.dossierId);
    if (!dossierId) {
      return NextResponse.json({ ok: false, code: "input_invalid", message: "A produção não é válida." }, { status: 400 });
    }
    const result = await prepareWorkspaceSourcePackage(dossierId);
    if (!result.ok) {
      return NextResponse.json({ ok: false, code: "package_prepare_failed", message: result.message }, { status: result.status });
    }
    return NextResponse.json({ ok: true, ...result.value }, { status: 201 });
  }

  if (action === "register_upload_image") {
    const result = await addEditorialDossierUploadImage({
      dossierId: textValue(payload?.dossierId),
      frozenUrl: textValue(payload?.publicUrl),
      storageBucket: textValue(payload?.bucket),
      storagePath: textValue(payload?.path),
      fileName: textValue(payload?.fileName),
    });

    if (!result.ok) {
      return NextResponse.json({
        ok: false,
        code: result.error.code,
        message: result.error.message,
      }, { status: commandErrorStatus(result.error.code) });
    }

    return NextResponse.json({
      ok: true,
      dossierImageId: result.value.dossierImageId,
      imageAction: result.value.imageAction,
      frozenUrl: result.value.frozenUrl,
    }, { status: result.value.imageAction === "created" ? 201 : 200 });
  }

  return NextResponse.json({
    ok: false,
    code: "input_invalid",
    message: "O comando do workspace não é válido.",
  }, { status: 400 });
}
