import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";
import type { EditorialDossierArticlePlanStatus } from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_ACTIVE_PLANS = 4;
const MAX_SOURCES = 20;
const MAX_TITLE_LENGTH = 180;
const MAX_EDITORIAL_INSTRUCTIONS_LENGTH = 12000;
const MAX_PRIORITY = 999;

export type EditorialDossierArticlePlanSourceSelection = Readonly<{
  dossierSourceId: string;
  priority: number;
}>;

export type SaveEditorialDossierArticlePlanInput = Readonly<{
  dossierId: string;
  articlePlanId: string | null;
  workingTitle: string;
  status: EditorialDossierArticlePlanStatus;
  priority: number;
  articleKind: EditorialDossierArticleKind;
  lengthMode: EditorialDossierLengthMode;
  editorialInstructions: string;
  sources: readonly EditorialDossierArticlePlanSourceSelection[];
}>;

export type EditorialDossierArticlePlanSourceState = Readonly<{
  id: string;
  included: boolean;
}>;

export type EditorialDossierArticlePlanState = Readonly<{
  id: string;
  status: EditorialDossierArticlePlanStatus;
  sources: readonly Readonly<{
    dossierSourceId: string;
    sortOrder: number;
  }>[];
}>;

export type EditorialDossierArticlePlanDossierState = Readonly<{
  dossierId: string;
  sources: readonly EditorialDossierArticlePlanSourceState[];
  plans: readonly EditorialDossierArticlePlanState[];
}>;

export type EditorialDossierArticlePlanRpcInput = Readonly<{
  p_dossier_id: string;
  p_article_plan_id: string | null;
  p_working_title: string;
  p_status: EditorialDossierArticlePlanStatus;
  p_sort_order: number;
  p_article_kind: EditorialDossierArticleKind;
  p_length_mode: EditorialDossierLengthMode;
  p_editorial_instructions: string;
  p_dossier_source_ids: readonly string[];
}>;

export interface EditorialDossierArticlePlanTransport {
  isConfigured(): boolean;
  readDossierState(
    dossierId: string,
  ): Promise<EditorialDossierArticlePlanDossierState | null>;
  saveArticlePlan(payload: EditorialDossierArticlePlanRpcInput): Promise<string | null>;
}

export type EditorialDossierArticlePlanErrorCode =
  | "input_invalid"
  | "service_unavailable"
  | "dossier_not_found"
  | "article_plan_not_found"
  | "article_plan_limit_exceeded"
  | "article_plan_ready_incomplete"
  | "article_plan_source_not_found"
  | "article_plan_source_unavailable"
  | "article_plan_save_failed";

export type EditorialDossierArticlePlanSaveResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        dossierId: string;
        articlePlanId: string;
        created: boolean;
        status: EditorialDossierArticlePlanStatus;
        previousStatus: EditorialDossierArticlePlanStatus | null;
        sourceCount: number;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: EditorialDossierArticlePlanErrorCode;
        message: string;
      }>;
    }>;

function failure(
  code: EditorialDossierArticlePlanErrorCode,
  message: string,
): EditorialDossierArticlePlanSaveResult {
  return { ok: false, error: { code, message } };
}

function cleanText(value: string): string {
  return value.trim();
}

function normalizedUuid(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function validStatus(value: EditorialDossierArticlePlanStatus): boolean {
  return ["planned", "ready", "cancelled"].includes(value);
}

function validArticleKind(value: EditorialDossierArticleKind): boolean {
  return ["news", "analysis", "preview", "summary"].includes(value);
}

function validLengthMode(value: EditorialDossierLengthMode): boolean {
  return ["brief", "standard", "developed"].includes(value);
}

function validPriority(value: number): boolean {
  return Number.isInteger(value) && value >= 1 && value <= MAX_PRIORITY;
}

function normalizedSelections(
  sources: readonly EditorialDossierArticlePlanSourceSelection[],
): readonly EditorialDossierArticlePlanSourceSelection[] | null {
  if (sources.length > MAX_SOURCES) {
    return null;
  }

  const normalized: EditorialDossierArticlePlanSourceSelection[] = [];
  const seen = new Set<string>();

  for (const source of sources) {
    const sourceId = normalizedUuid(source.dossierSourceId);
    if (!sourceId || seen.has(sourceId) || !validPriority(source.priority)) {
      return null;
    }

    seen.add(sourceId);
    normalized.push({ dossierSourceId: sourceId, priority: source.priority });
  }

  return normalized
    .map((source, inputIndex) => ({ ...source, inputIndex }))
    .sort((left, right) => left.priority - right.priority || left.inputIndex - right.inputIndex)
    .map(({ inputIndex: _inputIndex, ...source }) => source);
}

export function saveEditorialDossierArticlePlanService(
  transport: EditorialDossierArticlePlanTransport,
) {
  return async function saveEditorialDossierArticlePlan(
    input: SaveEditorialDossierArticlePlanInput,
  ): Promise<EditorialDossierArticlePlanSaveResult> {
    const dossierId = normalizedUuid(input.dossierId);
    const requestedPlanId = input.articlePlanId?.trim() || null;
    const articlePlanId = requestedPlanId ? normalizedUuid(requestedPlanId) : null;
    const workingTitle = cleanText(input.workingTitle);
    const editorialInstructions = cleanText(input.editorialInstructions);
    const selections = normalizedSelections(input.sources);

    if (
      !dossierId
      || (requestedPlanId !== null && !articlePlanId)
      || workingTitle.length < 1
      || workingTitle.length > MAX_TITLE_LENGTH
      || editorialInstructions.length > MAX_EDITORIAL_INSTRUCTIONS_LENGTH
      || !validStatus(input.status)
      || !validPriority(input.priority)
      || !validArticleKind(input.articleKind)
      || !validLengthMode(input.lengthMode)
      || !selections
    ) {
      return failure("input_invalid", "Os dados do artigo planeado não são válidos.");
    }

    if (!transport.isConfigured()) {
      return failure("service_unavailable", "O serviço dos artigos planeados não está configurado.");
    }

    let dossierState: EditorialDossierArticlePlanDossierState | null;
    try {
      dossierState = await transport.readDossierState(dossierId);
    } catch {
      return failure("article_plan_save_failed", "Não foi possível validar o Dossiê e os artigos planeados.");
    }

    if (!dossierState) {
      return failure("dossier_not_found", "O Dossiê já não existe.");
    }

    const existingPlan = articlePlanId
      ? dossierState.plans.find((plan) => plan.id === articlePlanId) ?? null
      : null;

    if (articlePlanId && !existingPlan) {
      return failure("article_plan_not_found", "O artigo planeado já não pertence a este Dossiê.");
    }

    if (!existingPlan && input.status === "cancelled") {
      return failure("input_invalid", "Um novo artigo planeado não pode ser criado como cancelado.");
    }

    const activePlanCount = dossierState.plans.filter((plan) => plan.status !== "cancelled").length;
    const activatesPlan = input.status !== "cancelled"
      && (!existingPlan || existingPlan.status === "cancelled");

    if (activatesPlan && activePlanCount >= MAX_ACTIVE_PLANS) {
      return failure(
        "article_plan_limit_exceeded",
        `Um Dossiê pode ter no máximo ${MAX_ACTIVE_PLANS} artigos planeados ativos.`,
      );
    }

    const dossierSourcesById = new Map(dossierState.sources.map((source) => [source.id, source]));
    const existingAssignedSourceIds = new Set(
      existingPlan?.sources.map((source) => source.dossierSourceId) ?? [],
    );
    const effectiveSelections = input.status === "cancelled" && existingPlan
      ? existingPlan.sources
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder || left.dossierSourceId.localeCompare(right.dossierSourceId))
        .map((source, index) => ({
          dossierSourceId: source.dossierSourceId,
          priority: index + 1,
        }))
      : selections;

    for (const selection of effectiveSelections) {
      const dossierSource = dossierSourcesById.get(selection.dossierSourceId);
      if (!dossierSource) {
        return failure(
          "article_plan_source_not_found",
          "Uma das fontes já não pertence a este Dossiê.",
        );
      }

      if (!dossierSource.included && !existingAssignedSourceIds.has(selection.dossierSourceId)) {
        return failure(
          "article_plan_source_unavailable",
          "Uma fonte excluída só pode permanecer num artigo onde já estava atribuída.",
        );
      }
    }

    if (
      input.status === "ready"
      && (editorialInstructions.length < 1 || effectiveSelections.length < 1)
    ) {
      return failure(
        "article_plan_ready_incomplete",
        "Um artigo pronto exige orientação editorial e pelo menos uma fonte atribuída.",
      );
    }

    const rpcPayload: EditorialDossierArticlePlanRpcInput = {
      p_dossier_id: dossierId,
      p_article_plan_id: articlePlanId,
      p_working_title: workingTitle,
      p_status: input.status,
      p_sort_order: input.priority * 10,
      p_article_kind: input.articleKind,
      p_length_mode: input.lengthMode,
      p_editorial_instructions: editorialInstructions,
      p_dossier_source_ids: effectiveSelections.map((source) => source.dossierSourceId),
    };

    let savedPlanId: string | null;
    try {
      savedPlanId = await transport.saveArticlePlan(rpcPayload);
    } catch {
      return failure("article_plan_save_failed", "Não foi possível guardar o artigo planeado.");
    }

    const normalizedSavedPlanId = savedPlanId ? normalizedUuid(savedPlanId) : null;
    if (!normalizedSavedPlanId || (articlePlanId && normalizedSavedPlanId !== articlePlanId)) {
      return failure("article_plan_save_failed", "O serviço não devolveu o artigo planeado esperado.");
    }

    return {
      ok: true,
      value: {
        dossierId,
        articlePlanId: normalizedSavedPlanId,
        created: !existingPlan,
        status: input.status,
        previousStatus: existingPlan?.status ?? null,
        sourceCount: effectiveSelections.length,
      },
    };
  };
}
