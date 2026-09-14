import "server-only";

import {
  createEditorialDossierArticlePlanBatchSession,
  synchronizeEditorialMesaSharedOutputs,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service";
import {
  loadEditorialDossierProduction,
} from "@/lib/redacao-automatica/editorial-dossier-production-loader";
import {
  saveEditorialDossierArticlePlanState,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service";
import {
  saveEditorialDossierWorkspaceBatchService,
  type SaveEditorialDossierWorkspaceBatchInput,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-batch-service-internal";

export type {
  SavedEditorialDossierWorkspaceBatchOutput,
  SaveEditorialDossierWorkspaceBatchInput,
  SaveEditorialDossierWorkspaceBatchOutputInput,
  SaveEditorialDossierWorkspaceBatchResult,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-batch-service-internal";

const saveWorkspaceBatch = saveEditorialDossierWorkspaceBatchService({
  loadProduction: (dossierId) => loadEditorialDossierProduction(dossierId, {
    includePlans: false,
    workspaceDetail: "context",
  }),
  openArticlePlanSession: createEditorialDossierArticlePlanBatchSession,
  saveProductionState: saveEditorialDossierArticlePlanState,
  synchronizeOutputs: synchronizeEditorialMesaSharedOutputs,
});

export function saveEditorialDossierWorkspaceBatch(
  input: SaveEditorialDossierWorkspaceBatchInput,
) {
  return saveWorkspaceBatch(input);
}
