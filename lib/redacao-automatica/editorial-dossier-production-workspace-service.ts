import "server-only";

import {
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  addEditorialDossierUploadImageService,
  prepareEditorialDossierWorkspaceService,
  saveEditorialDossierArticlePlanStateService,
  type AddEditorialDossierUploadImageInput,
  type AddEditorialDossierUploadImageRpcInput,
  type EditorialDossierArticlePlanDestination,
  type EditorialDossierArticlePlanImageChoice,
  type PrepareEditorialDossierWorkspaceInput,
  type PrepareEditorialDossierWorkspaceRpcInput,
  type SaveEditorialDossierArticlePlanStateInput,
  type SaveEditorialDossierArticlePlanStateRpcInput,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";

export type {
  AddEditorialDossierUploadImageInput,
  AddedEditorialDossierUploadImage,
  EditorialDossierArticlePlanDestination,
  EditorialDossierArticlePlanImageChoice,
  EditorialDossierProductionWorkspaceErrorCode,
  EditorialDossierProductionWorkspaceResult,
  PreparedEditorialDossierWorkspace,
  PrepareEditorialDossierWorkspaceInput,
  PrepareEditorialDossierWorkspaceSource,
  SavedEditorialDossierArticlePlanState,
  SaveEditorialDossierArticlePlanStateInput,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";

type PrepareRow = {
  dossier_id: string;
  preparation_action: string;
  source_count: number;
  published_context_count: number;
  image_count: number;
};

type PlanStateRow = {
  article_plan_id: string;
  destination: string;
  update_target_editorial_article_id: string | null;
  published_context_count: number;
  image_choice: string;
  dossier_image_id: string | null;
};

type UploadImageRow = {
  dossier_image_id: string;
  image_action: string;
  frozen_url: string;
};

function destination(value: string): EditorialDossierArticlePlanDestination {
  return value === "update" ? "update" : "new";
}

function imageChoice(
  mode: string,
  dossierImageId: string | null,
): EditorialDossierArticlePlanImageChoice {
  if (mode === "preserve_published") {
    return { mode: "preserve_published" };
  }
  if (mode === "dossier_image" && dossierImageId) {
    return { mode: "dossier_image", dossierImageId };
  }
  return { mode: "unselected" };
}

const transport = {
  configuration() {
    const config = getSupabaseServiceConfig();
    const supabaseUrl = config?.url.trim().replace(/\/$/, "") ?? "";
    return supabaseUrl ? { supabaseUrl } : null;
  },

  async prepareWorkspace(payload: PrepareEditorialDossierWorkspaceRpcInput) {
    const rows = await writeSupabaseAdminReturning<PrepareRow>(
      payload.p_theme_id
        ? "rpc/newsroom_prepare_theme_dossier_v1"
        : "rpc/newsroom_prepare_editorial_dossier_workspace_v1",
      { method: "POST", body: JSON.stringify(payload) },
    );
    const row = rows[0];
    if (!row || !["created", "reused"].includes(row.preparation_action)) {
      return null;
    }
    return {
      dossierId: row.dossier_id,
      preparationAction: row.preparation_action as "created" | "reused",
      sourceCount: row.source_count,
      publishedContextCount: row.published_context_count,
      imageCount: row.image_count,
    };
  },

  async saveArticlePlanState(payload: SaveEditorialDossierArticlePlanStateRpcInput) {
    const rows = await writeSupabaseAdminReturning<PlanStateRow>(
      "rpc/newsroom_save_dossier_article_plan_state_v1",
      { method: "POST", body: JSON.stringify(payload) },
    );
    const row = rows[0];
    if (!row) return null;
    return {
      articlePlanId: row.article_plan_id,
      destination: destination(row.destination),
      updateTargetEditorialArticleId: row.update_target_editorial_article_id,
      publishedContextCount: row.published_context_count,
      imageChoice: imageChoice(row.image_choice, row.dossier_image_id),
    };
  },

  async addUploadImage(payload: AddEditorialDossierUploadImageRpcInput) {
    const rows = await writeSupabaseAdminReturning<UploadImageRow>(
      "rpc/newsroom_add_dossier_upload_image_v1",
      { method: "POST", body: JSON.stringify(payload) },
    );
    const row = rows[0];
    if (!row || !["created", "reused"].includes(row.image_action)) {
      return null;
    }
    return {
      dossierImageId: row.dossier_image_id,
      imageAction: row.image_action as "created" | "reused",
      frozenUrl: row.frozen_url,
    };
  },
};

const prepareWorkspace = prepareEditorialDossierWorkspaceService(transport);
const savePlanState = saveEditorialDossierArticlePlanStateService(transport);
const addUploadImage = addEditorialDossierUploadImageService(transport);

export function prepareEditorialDossierWorkspace(
  input: PrepareEditorialDossierWorkspaceInput,
) {
  return prepareWorkspace(input);
}

export function saveEditorialDossierArticlePlanState(
  input: SaveEditorialDossierArticlePlanStateInput,
) {
  return savePlanState(input);
}

export function addEditorialDossierUploadImage(
  input: AddEditorialDossierUploadImageInput,
) {
  return addUploadImage(input);
}
