import "server-only";

import { saveEditorialDossierArticlePlan } from "@/lib/redacao-automatica/editorial-dossier-article-plan-service";
import {
  saveEditorialDossierArticlePlanState,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service";
import {
  saveEditorialDossierWorkspaceArticlePlanService,
  type SaveEditorialDossierWorkspaceArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-editor-service-internal";

export type {
  SaveEditorialDossierWorkspaceArticlePlanInput,
  SaveEditorialDossierWorkspaceArticlePlanResult,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-editor-service-internal";

const saveWorkspaceArticlePlan = saveEditorialDossierWorkspaceArticlePlanService({
  savePlan: saveEditorialDossierArticlePlan,
  saveProductionState: saveEditorialDossierArticlePlanState,
});

export function saveEditorialDossierWorkspaceArticlePlan(
  input: SaveEditorialDossierWorkspaceArticlePlanInput,
) {
  return saveWorkspaceArticlePlan(input);
}
