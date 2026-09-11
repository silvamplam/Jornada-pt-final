import type {
  EditorialDossierArticlePlanSaveResult,
  SaveEditorialDossierArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service-internal";
import type {
  EditorialDossierArticlePlanDestination,
  EditorialDossierArticlePlanImageChoice,
  EditorialDossierProductionWorkspaceResult,
  SavedEditorialDossierArticlePlanState,
  SaveEditorialDossierArticlePlanStateInput,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";

export type SaveEditorialDossierWorkspaceArticlePlanInput = Readonly<{
  plan: SaveEditorialDossierArticlePlanInput;
  production: Readonly<{
    destination: EditorialDossierArticlePlanDestination;
    updateTargetEditorialArticleId: string | null;
    dossierPublishedContextIds: readonly string[];
    imageChoice: EditorialDossierArticlePlanImageChoice;
  }>;
}>;

export type SaveEditorialDossierWorkspaceArticlePlanResult =
  | Readonly<{
      ok: true;
      value: Readonly<{
        dossierId: string;
        articlePlanId: string;
        created: boolean;
        planStatus: SaveEditorialDossierArticlePlanInput["status"];
        productionState: SavedEditorialDossierArticlePlanState;
      }>;
    }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        stage: "article_plan" | "production_state";
        code: string;
        message: string;
        partialPersistence: boolean;
        articlePlanId: string | null;
      }>;
    }>;

export interface EditorialDossierWorkspaceArticlePlanTransport {
  savePlan(
    input: SaveEditorialDossierArticlePlanInput,
  ): Promise<EditorialDossierArticlePlanSaveResult>;
  saveProductionState(
    input: SaveEditorialDossierArticlePlanStateInput,
  ): Promise<EditorialDossierProductionWorkspaceResult<SavedEditorialDossierArticlePlanState>>;
}

export function saveEditorialDossierWorkspaceArticlePlanService(
  transport: EditorialDossierWorkspaceArticlePlanTransport,
) {
  return async function saveEditorialDossierWorkspaceArticlePlan(
    input: SaveEditorialDossierWorkspaceArticlePlanInput,
  ): Promise<SaveEditorialDossierWorkspaceArticlePlanResult> {
    const planResult = await transport.savePlan(input.plan);
    if (!planResult.ok) {
      return {
        ok: false,
        error: {
          stage: "article_plan",
          code: planResult.error.code,
          message: planResult.error.message,
          partialPersistence: false,
          articlePlanId: input.plan.articlePlanId,
        },
      };
    }

    const stateResult = await transport.saveProductionState({
      dossierId: input.plan.dossierId,
      articlePlanId: planResult.value.articlePlanId,
      destination: input.production.destination,
      updateTargetEditorialArticleId:
        input.production.updateTargetEditorialArticleId,
      dossierPublishedContextIds: input.production.dossierPublishedContextIds,
      imageChoice: input.production.imageChoice,
    });

    if (!stateResult.ok) {
      return {
        ok: false,
        error: {
          stage: "production_state",
          code: stateResult.error.code,
          message: stateResult.error.message,
          partialPersistence: true,
          articlePlanId: planResult.value.articlePlanId,
        },
      };
    }

    return {
      ok: true,
      value: {
        dossierId: input.plan.dossierId,
        articlePlanId: planResult.value.articlePlanId,
        created: planResult.value.created,
        planStatus: planResult.value.status,
        productionState: stateResult.value,
      },
    };
  };
}
