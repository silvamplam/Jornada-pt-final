import "server-only";

import { fetchSupabaseAdminTable, writeSupabaseAdminReturning } from "@/lib/supabase";
import {
  loadEditorialDossierProduction,
} from "@/lib/redacao-automatica/editorial-dossier-production-loader";
import {
  saveEditorialDossierWorkspaceBatchService,
  type SaveEditorialDossierWorkspaceBatchInput,
  type SaveEditorialDossierWorkspaceBatchResult,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-batch-service-internal";

export type {
  SavedEditorialDossierWorkspaceBatchOutput,
  SaveEditorialDossierWorkspaceBatchInput,
  SaveEditorialDossierWorkspaceBatchOutputInput,
  SaveEditorialDossierWorkspaceBatchResult,
} from "@/lib/redacao-automatica/editorial-dossier-workspace-batch-service-internal";

export async function readProductionSaveState(dossierId: string) {
  const [state] = await fetchSupabaseAdminTable<{ state_token: string; confirmed_image_plan_ids: string[] }>(
    `rpc/newsroom_production_save_state_v1?p_dossier_id=${encodeURIComponent(dossierId)}`,
  );
  if (!state || !/^[a-f0-9]{64}$/.test(state.state_token)) throw new Error("production-state-unavailable");
  return { stateToken: state.state_token, confirmedImagePlanIds: state.confirmed_image_plan_ids };
}

const saveWorkspaceBatch = saveEditorialDossierWorkspaceBatchService({
  loadProduction: (dossierId) => loadEditorialDossierProduction(dossierId, {
    includePlans: false,
    workspaceDetail: "context",
  }),
  async saveAtomic(input, outputs) {
    type Value = Extract<SaveEditorialDossierWorkspaceBatchResult, { ok: true }>["value"];
    const [row] = await writeSupabaseAdminReturning<{ result: Value }>("rpc/newsroom_save_production_batch_v1", {
      method: "POST", body: JSON.stringify({ p_dossier_id: input.dossierId,
        p_expected_state: input.expectedState, p_request_id: input.requestId, p_outputs: outputs }),
    });
    if (!row?.result) throw new Error("production-batch-response-missing");
    return row.result;
  },
});

export function saveEditorialDossierWorkspaceBatch(
  input: SaveEditorialDossierWorkspaceBatchInput,
) {
  return saveWorkspaceBatch(input);
}
