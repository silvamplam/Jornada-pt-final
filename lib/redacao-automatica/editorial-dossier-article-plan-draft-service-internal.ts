const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EditorialDossierArticlePlanDraftState = Readonly<{
  id: string;
  dossierId: string;
  status: "planned" | "ready" | "cancelled";
  workingTitle: string;
  editorialInstructions: string;
  sourceCount: number;
  editorialArticleId: string | null;
}>;

export type EditorialDossierArticlePlanDraftRpcResult = Readonly<{
  editorialArticleId: string;
  action: "created" | "reused";
}>;

export interface EditorialDossierArticlePlanDraftTransport {
  isConfigured(): boolean;
  readPlan(
    dossierId: string,
    articlePlanId: string,
  ): Promise<EditorialDossierArticlePlanDraftState | null>;
  createDraft(
    dossierId: string,
    articlePlanId: string,
  ): Promise<EditorialDossierArticlePlanDraftRpcResult | null>;
}

export type EditorialDossierArticlePlanDraftErrorCode =
  | "input_invalid"
  | "service_unavailable"
  | "article_plan_not_found"
  | "article_plan_not_ready"
  | "article_plan_incomplete"
  | "draft_creation_failed";

export type EditorialDossierArticlePlanDraftResult =
  | Readonly<{
      ok: true;
      value: EditorialDossierArticlePlanDraftRpcResult;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: EditorialDossierArticlePlanDraftErrorCode;
        message: string;
      }>;
    }>;

function failure(
  code: EditorialDossierArticlePlanDraftErrorCode,
  message: string,
): EditorialDossierArticlePlanDraftResult {
  return { ok: false, error: { code, message } };
}

function normalizedUuid(value: string): string | null {
  const normalized = value.trim().toLowerCase();
  return UUID_PATTERN.test(normalized) ? normalized : null;
}

function validEditorialArticleId(value: string | null): value is string {
  return Boolean(value && UUID_PATTERN.test(value));
}

export function createEditorialDossierArticlePlanDraftService(
  transport: EditorialDossierArticlePlanDraftTransport,
) {
  return async function createEditorialDossierArticlePlanDraft(
    dossierIdValue: string,
    articlePlanIdValue: string,
  ): Promise<EditorialDossierArticlePlanDraftResult> {
    const dossierId = normalizedUuid(dossierIdValue);
    const articlePlanId = normalizedUuid(articlePlanIdValue);

    if (!dossierId || !articlePlanId) {
      return failure("input_invalid", "O Dossiê ou o artigo planeado não são válidos.");
    }

    if (!transport.isConfigured()) {
      return failure("service_unavailable", "O serviço editorial não está configurado.");
    }

    let plan: EditorialDossierArticlePlanDraftState | null;
    try {
      plan = await transport.readPlan(dossierId, articlePlanId);
    } catch {
      return failure("draft_creation_failed", "Não foi possível validar o artigo planeado.");
    }

    if (!plan || plan.id !== articlePlanId || plan.dossierId !== dossierId) {
      return failure("article_plan_not_found", "O artigo planeado já não pertence a este Dossiê.");
    }

    if (validEditorialArticleId(plan.editorialArticleId)) {
      return {
        ok: true,
        value: {
          editorialArticleId: plan.editorialArticleId,
          action: "reused",
        },
      };
    }

    if (plan.status !== "ready") {
      return failure(
        "article_plan_not_ready",
        "Apenas um artigo planeado no estado Pronto pode originar um rascunho.",
      );
    }

    if (
      plan.workingTitle.trim().length < 1
      || plan.editorialInstructions.trim().length < 1
      || plan.sourceCount < 1
    ) {
      return failure(
        "article_plan_incomplete",
        "O artigo planeado não tem título, orientação e fontes suficientes.",
      );
    }

    let created: EditorialDossierArticlePlanDraftRpcResult | null;
    try {
      created = await transport.createDraft(dossierId, articlePlanId);
    } catch {
      return failure("draft_creation_failed", "Não foi possível criar o rascunho editorial.");
    }

    if (
      !created
      || !validEditorialArticleId(created.editorialArticleId)
      || (created.action !== "created" && created.action !== "reused")
    ) {
      return failure("draft_creation_failed", "O serviço não devolveu um rascunho editorial válido.");
    }

    return { ok: true, value: created };
  };
}
