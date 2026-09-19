import { parseMesaProductionIntents, mesaProductionIntentSlots } from "@/lib/redacao-automatica/newsroom-mesa-production-intents-contract";
import type {
  EditorialDossierArticlePlanBatchSessionResult,
  SynchronizeEditorialMesaSharedOutputsResult,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service";
import type {
  EditorialDossierProductionLoad,
  EditorialDossierProductionLoadResult,
} from "@/lib/redacao-automatica/editorial-dossier-production-loader";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import type {
  EditorialDossierArticlePlanImageChoice,
  EditorialDossierProductionWorkspaceResult,
  SavedEditorialDossierArticlePlanState,
  SaveEditorialDossierArticlePlanStateInput,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";
import {
  editorialMesaWorkspaceOutputWorkingTitle,
  editorialMesaWorkspaceStartingPointSourceIds,
} from "@/lib/redacao-automatica/editorial-mesa-workspace-defaults";
import {
  saveEditorialDossierWorkspaceArticlePlanService,
  type SaveEditorialDossierWorkspaceArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-editor-service-internal";
import {
  parseThemeContinuityFrozenContract,
} from "@/lib/redacao-automatica/newsroom-theme-continuity-contract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_OUTPUT_COUNT = 30;
const MAX_CLIENT_KEY_LENGTH = 200;

export type SaveEditorialDossierWorkspaceBatchOutputInput = Readonly<{
  clientKey: string;
  articlePlanId: string | null;
  priority: number;
  articleKind: EditorialDossierArticleKind;
  lengthMode: EditorialDossierLengthMode;
  editorialInstructions: string;
  destination: "new" | "update";
  updateTargetEditorialArticleId: string | null;
  imageChoice: EditorialDossierArticlePlanImageChoice;
  productionContextId: string | null;
}>;

export type SaveEditorialDossierWorkspaceBatchInput = Readonly<{
  dossierId: string;
  outputCount: number;
  outputs: readonly SaveEditorialDossierWorkspaceBatchOutputInput[];
}>;

export type SavedEditorialDossierWorkspaceBatchOutput = Readonly<{
  clientKey: string;
  priority: number;
  articlePlanId: string;
  created: boolean;
  materialized: boolean;
}>;

export type SaveEditorialDossierWorkspaceBatchError = Readonly<{
  stage: "article_plan" | "production_state" | "output_count";
  code: string;
  message: string;
  partialPersistence: boolean;
  articlePlanId: string | null;
  failedOutput: Readonly<{ clientKey: string; priority: number }> | null;
  savedOutputs: readonly SavedEditorialDossierWorkspaceBatchOutput[];
}>;

export type SaveEditorialDossierWorkspaceBatchResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        dossierId: string;
        outputCount: number;
        outputs: readonly SavedEditorialDossierWorkspaceBatchOutput[];
      }>;
    }>
  | Readonly<{
      ok: false;
      error: SaveEditorialDossierWorkspaceBatchError;
    }>;

export interface EditorialDossierWorkspaceBatchTransport {
  loadProduction(dossierId: string): Promise<EditorialDossierProductionLoadResult>;
  openArticlePlanSession(
    dossierId: string,
  ): Promise<EditorialDossierArticlePlanBatchSessionResult>;
  saveProductionState(
    input: SaveEditorialDossierArticlePlanStateInput,
  ): Promise<EditorialDossierProductionWorkspaceResult<SavedEditorialDossierArticlePlanState>>;
  synchronizeOutputs(input: Readonly<{
    dossierId: string;
    articlePlanIds: readonly string[];
  }>): Promise<SynchronizeEditorialMesaSharedOutputsResult>;
}

function normalizedUuid(value: string | null): string | null {
  const normalized = value?.trim().toLowerCase() ?? "";
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function batchFailure(
  error: SaveEditorialDossierWorkspaceBatchError,
): SaveEditorialDossierWorkspaceBatchResult {
  return { ok: false, error };
}

function validatedBatch(
  input: SaveEditorialDossierWorkspaceBatchInput,
): SaveEditorialDossierWorkspaceBatchInput | null {
  const dossierId = normalizedUuid(input.dossierId);
  if (
    !dossierId
    || !Number.isInteger(input.outputCount)
    || input.outputCount < 1
    || input.outputCount > MAX_OUTPUT_COUNT
    || input.outputs.length !== input.outputCount
  ) return null;

  const clientKeys = new Set<string>();
  const articlePlanIds = new Set<string>();
  const outputs: SaveEditorialDossierWorkspaceBatchOutputInput[] = [];
  for (const [index, output] of input.outputs.entries()) {
    const clientKey = output.clientKey.trim();
    const articlePlanId = output.articlePlanId === null
      ? null
      : normalizedUuid(output.articlePlanId);
    const productionContextId = output.productionContextId === null
      ? null
      : normalizedUuid(output.productionContextId);
    const updateTargetEditorialArticleId = output.updateTargetEditorialArticleId === null
      ? null
      : normalizedUuid(output.updateTargetEditorialArticleId);
    const dossierImageId = output.imageChoice.mode === "dossier_image"
      ? normalizedUuid(output.imageChoice.dossierImageId)
      : null;
    if (
      !clientKey
      || clientKey.length > MAX_CLIENT_KEY_LENGTH
      || clientKeys.has(clientKey)
      || output.priority !== index + 1
      || (output.articlePlanId !== null && !articlePlanId)
      || (articlePlanId !== null && articlePlanIds.has(articlePlanId))
      || (output.productionContextId !== null && !productionContextId)
      || (output.updateTargetEditorialArticleId !== null && !updateTargetEditorialArticleId)
      || (output.imageChoice.mode === "dossier_image" && !dossierImageId)
    ) return null;
    clientKeys.add(clientKey);
    if (articlePlanId) articlePlanIds.add(articlePlanId);
    outputs.push({
      ...output,
      clientKey,
      articlePlanId,
      productionContextId,
      updateTargetEditorialArticleId,
      imageChoice: output.imageChoice.mode === "dossier_image"
        ? { mode: "dossier_image", dossierImageId: dossierImageId! }
        : output.imageChoice,
    });
  }
  return { dossierId, outputCount: input.outputCount, outputs };
}

export function deriveEditorialDossierWorkspacePlanInput(
  dossierId: string,
  output: SaveEditorialDossierWorkspaceBatchOutputInput,
  production: EditorialDossierProductionLoad,
): SaveEditorialDossierWorkspaceArticlePlanInput | null {
  if (production.dossier.id !== dossierId) return null;
  const { dossier, workspace } = production;
  const context = workspace.mesaContext;
  if (context?.workspaceState && context.workspaceState !== "active") return null;
  const workspaceContractVersion = context?.workspaceContractVersion === 2 ? 2 : 1;
  const includedSources = dossier.sources.filter((source) => source.included);
  const productionContext = workspace.contextMode === "contexts"
    ? workspace.productionContexts.find((item) => item.id === output.productionContextId) ?? null
    : null;
  const rawIntents = (context?.selectionPayload as Record<string, unknown> | null)?.productionIntents;
  const intents = parseMesaProductionIntents(rawIntents);
  if (rawIntents !== undefined && (!intents || intents.dossierId !== dossierId)) return null;
  const continuity = intents ? { slots: mesaProductionIntentSlots(intents) } : parseThemeContinuityFrozenContract(context?.selectionPayload);
  const continuitySlot = continuity?.slots[output.priority - 1] ?? null;
  if (
    (workspace.contextMode === "contexts" && !productionContext)
    || (workspace.contextMode === "historical" && output.productionContextId !== null)
    || (output.destination === "new" && output.updateTargetEditorialArticleId !== null)
    || (output.destination === "update" && !output.updateTargetEditorialArticleId)
    || (output.destination === "new" && output.imageChoice.mode === "preserve_published")
    || Boolean(continuity) !== Boolean(continuitySlot)
    || (continuity && (
      continuity.slots.length !== production.dossier.outputCount
      || output.articlePlanId !== continuitySlot?.outputId
      || output.productionContextId !== continuitySlot.productionContextId
      || output.destination !== (continuitySlot.kind === "existing" ? "update" : "new")
      || output.updateTargetEditorialArticleId !== continuitySlot.targetEditorialArticleId
    ))
  ) return null;

  const includedById = new Map(includedSources.map((source) => [source.id, source]));
  const technicalSources = productionContext
    ? productionContext.sources.flatMap((source) => {
        const dossierSource = includedById.get(source.dossierSourceId);
        return dossierSource ? [dossierSource] : [];
      })
    : includedSources.slice().sort((left, right) => (
        left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)
      ));
  if (
    (productionContext && technicalSources.length !== productionContext.sources.length)
    || technicalSources.length < 1
  ) return null;

  const defaultStartingPointSourceIds = workspaceContractVersion === 2
    ? editorialMesaWorkspaceStartingPointSourceIds(
        context?.selectionPayload,
        context?.materialRefs,
        technicalSources.map((source) => ({
          dossierSourceId: source.id,
          newsroomArticleId: source.newsroomArticleId,
        })),
        output.priority,
      )
    : [];
  const focusStartingPointSourceId = continuitySlot && "focusSourceIds" in continuitySlot
    ? continuitySlot.focusSourceIds?.flatMap((newsroomArticleId) => {
        const source = technicalSources.find((candidate) => candidate.newsroomArticleId === newsroomArticleId);
        return source ? [source.id] : [];
      })[0]
    : undefined;
  const startingPointSourceId = focusStartingPointSourceId ?? defaultStartingPointSourceIds[output.priority - 1];
  const workingTitle = workspaceContractVersion === 2
    ? editorialMesaWorkspaceOutputWorkingTitle(
        output.priority,
        startingPointSourceId,
        technicalSources.map((source) => ({
          dossierSourceId: source.id,
          newsroomArticleId: source.newsroomArticleId,
          articleTitle: source.articleTitle,
        })),
      ) ?? (productionContext
        ? `Output ${String(output.priority).padStart(2, "0")} — ${productionContext.title}`.slice(0, 180)
        : null)
    : productionContext
      ? `Output ${String(output.priority).padStart(2, "0")} — ${productionContext.title}`.slice(0, 180)
      : `Output ${String(output.priority).padStart(2, "0")} — ${dossier.title}`.slice(0, 180);
  if (!workingTitle) return null;

  return {
    plan: {
      dossierId,
      articlePlanId: output.articlePlanId,
      workingTitle,
      status: "planned",
      priority: output.priority,
      articleKind: output.articleKind,
      lengthMode: output.lengthMode,
      editorialInstructions: output.editorialInstructions.trim(),
      sources: technicalSources.map((source, index) => ({
        dossierSourceId: source.id,
        priority: index + 1,
      })),
    },
    production: {
      ...(productionContext ? { productionContextId: productionContext.id } : {}),
      destination: output.destination,
      updateTargetEditorialArticleId: output.updateTargetEditorialArticleId,
      dossierPublishedContextIds: workspace.publishedContexts.filter((item) => {
        if (!intents) return true;
        const intentContext = intents.contexts.find((c) => c.productionContextId === output.productionContextId);
        const referenceArticles = intentContext?.candidateArticles ?? intentContext?.publishedArticles ?? [];
        return referenceArticles.some((article) => article.editorialArticleId === item.editorialArticleId);
      }).map((item) => item.id),
      imageChoice: output.imageChoice,
    },
  };
}

export function saveEditorialDossierWorkspaceBatchService(
  transport: EditorialDossierWorkspaceBatchTransport,
) {
  return async function saveEditorialDossierWorkspaceBatch(
    input: SaveEditorialDossierWorkspaceBatchInput,
  ): Promise<SaveEditorialDossierWorkspaceBatchResult> {
    const batch = validatedBatch(input);
    const firstOutput = input.outputs[0] ?? null;
    if (!batch) {
      return batchFailure({
        stage: "article_plan",
        code: "input_invalid",
        message: "Revê os dados dos Article Plans antes de guardar.",
        partialPersistence: false,
        articlePlanId: null,
        failedOutput: firstOutput
          ? { clientKey: firstOutput.clientKey, priority: firstOutput.priority }
          : null,
        savedOutputs: [],
      });
    }

    const productionResult = await transport.loadProduction(batch.dossierId);
    if (!productionResult.ok || !productionResult.value) {
      return batchFailure({
        stage: "article_plan",
        code: productionResult.ok ? "dossier_not_found" : productionResult.error.code,
        message: productionResult.ok
          ? "A produção já não está disponível."
          : productionResult.error.message,
        partialPersistence: false,
        articlePlanId: null,
        failedOutput: { clientKey: batch.outputs[0].clientKey, priority: 1 },
        savedOutputs: [],
      });
    }
    if (
      productionResult.value.dossier.id !== batch.dossierId
      || (
        productionResult.value.workspace.mesaContext?.workspaceState
        && productionResult.value.workspace.mesaContext.workspaceState !== "active"
      )
    ) {
      return batchFailure({
        stage: "article_plan",
        code: "input_invalid",
        message: "Esta produção já não está ativa.",
        partialPersistence: false,
        articlePlanId: null,
        failedOutput: { clientKey: batch.outputs[0].clientKey, priority: 1 },
        savedOutputs: [],
      });
    }

    const rawIntents = (productionResult.value.workspace.mesaContext?.selectionPayload as Record<string, unknown> | null)?.productionIntents;
    if (rawIntents !== undefined) {
      const intents = parseMesaProductionIntents(rawIntents);
      if (!intents || batch.outputs.length !== intents.outputs.length || batch.outputs.some((output) =>
        !deriveEditorialDossierWorkspacePlanInput(batch.dossierId, output, productionResult.value!))) {
        return batchFailure({stage: "article_plan", code: "input_invalid", message: "O pedido não preserva todos os artigos e contextos da produção congelada.",
          partialPersistence: false, articlePlanId: null, failedOutput: null, savedOutputs: []});
      }
    }

    const sessionResult = await transport.openArticlePlanSession(batch.dossierId);
    if (!sessionResult.ok) {
      return batchFailure({
        stage: "article_plan",
        code: sessionResult.error.code,
        message: sessionResult.error.message,
        partialPersistence: false,
        articlePlanId: null,
        failedOutput: { clientKey: batch.outputs[0].clientKey, priority: 1 },
        savedOutputs: [],
      });
    }

    const session = sessionResult.value;
    const saveWorkspacePlan = saveEditorialDossierWorkspaceArticlePlanService({
      savePlan: (plan) => session.savePlan(plan, null),
      saveContextPlan: (plan, productionContextId) => (
        session.savePlan(plan, productionContextId)
      ),
      saveProductionState: transport.saveProductionState,
    });
    const savedOutputs: SavedEditorialDossierWorkspaceBatchOutput[] = [];
    const savedPlanIds = new Set<string>();

    for (const output of batch.outputs) {
      const existing = output.articlePlanId
        ? session.findPlan(output.articlePlanId)
        : null;
      if (existing?.editorialArticleId) {
        savedOutputs.push({
          clientKey: output.clientKey,
          priority: output.priority,
          articlePlanId: existing.id,
          created: false,
          materialized: true,
        });
        savedPlanIds.add(existing.id);
        continue;
      }

      const derived = deriveEditorialDossierWorkspacePlanInput(
        batch.dossierId,
        output,
        productionResult.value,
      );
      if (!derived) {
        return batchFailure({
          stage: "article_plan",
          code: "input_invalid",
          message: "Revê os dados do Article Plan antes de guardar.",
          partialPersistence: savedOutputs.length > 0,
          articlePlanId: output.articlePlanId,
          failedOutput: { clientKey: output.clientKey, priority: output.priority },
          savedOutputs,
        });
      }

      const result = await saveWorkspacePlan(derived);
      if (!result.ok) {
        const partiallySavedOutputs = result.error.stage === "production_state"
          && result.error.articlePlanId
          ? [
              ...savedOutputs,
              {
                clientKey: output.clientKey,
                priority: output.priority,
                articlePlanId: result.error.articlePlanId,
                created: output.articlePlanId === null,
                materialized: false,
              },
            ]
          : savedOutputs;
        return batchFailure({
          ...result.error,
          partialPersistence: result.error.partialPersistence || partiallySavedOutputs.length > 0,
          failedOutput: { clientKey: output.clientKey, priority: output.priority },
          savedOutputs: partiallySavedOutputs,
        });
      }
      if (savedPlanIds.has(result.value.articlePlanId)) {
        return batchFailure({
          stage: "article_plan",
          code: "article_plan_save_failed",
          message: "O serviço devolveu um Article Plan repetido no mesmo batch.",
          partialPersistence: true,
          articlePlanId: result.value.articlePlanId,
          failedOutput: { clientKey: output.clientKey, priority: output.priority },
          savedOutputs,
        });
      }
      savedPlanIds.add(result.value.articlePlanId);
      savedOutputs.push({
        clientKey: output.clientKey,
        priority: output.priority,
        articlePlanId: result.value.articlePlanId,
        created: result.value.created,
        materialized: false,
      });
    }

    const synchronized = await transport.synchronizeOutputs({
      dossierId: batch.dossierId,
      articlePlanIds: savedOutputs.map((output) => output.articlePlanId),
    });
    if (!synchronized.ok || synchronized.outputCount !== batch.outputCount) {
      return batchFailure({
        stage: "output_count",
        code: synchronized.ok ? "mesa-shared-outputs-write-failed" : synchronized.code,
        message: "Os artigos foram guardados, mas falhou o total da produção.",
        partialPersistence: true,
        articlePlanId: null,
        failedOutput: null,
        savedOutputs,
      });
    }

    return {
      ok: true,
      value: {
        dossierId: batch.dossierId,
        outputCount: synchronized.outputCount,
        outputs: savedOutputs,
      },
    };
  };
}
