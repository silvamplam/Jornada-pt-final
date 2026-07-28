import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  createEditorialDossierArticlePlanDraftService,
  type EditorialDossierArticlePlanDraftRpcResult,
  type EditorialDossierArticlePlanDraftState,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-draft-service-internal";

export type {
  EditorialDossierArticlePlanDraftErrorCode,
  EditorialDossierArticlePlanDraftResult,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-draft-service-internal";

type ArticlePlanRow = {
  id: string;
  dossier_id: string;
  status: string;
  working_title: string;
  editorial_instructions: string;
  editorial_article_id: string | null;
};

type ArticlePlanSourceRow = {
  id: string;
};

type ArticlePlanDraftRpcRow = {
  editorial_article_id: string;
  draft_action: string;
};

function planStatus(value: string): "planned" | "ready" | "cancelled" {
  return ["planned", "ready", "cancelled"].includes(value)
    ? value as "planned" | "ready" | "cancelled"
    : "planned";
}

async function readPlan(
  dossierId: string,
  articlePlanId: string,
): Promise<EditorialDossierArticlePlanDraftState | null> {
  const [plans, sourceRows] = await Promise.all([
    fetchSupabaseAdminTable<ArticlePlanRow>(
      "newsroom_editorial_dossier_article_plans"
      + "?select=id,dossier_id,status,working_title,editorial_instructions,editorial_article_id"
      + `&id=eq.${encodeURIComponent(articlePlanId)}`
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&limit=1",
    ),
    fetchSupabaseAdminTable<ArticlePlanSourceRow>(
      "newsroom_editorial_dossier_article_plan_sources?select=id"
      + `&article_plan_id=eq.${encodeURIComponent(articlePlanId)}`
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&limit=21",
    ),
  ]);
  const plan = plans[0];

  if (!plan) {
    return null;
  }

  return {
    id: plan.id,
    dossierId: plan.dossier_id,
    status: planStatus(plan.status),
    workingTitle: plan.working_title,
    editorialInstructions: plan.editorial_instructions,
    sourceCount: sourceRows.length,
    editorialArticleId: plan.editorial_article_id,
  };
}

async function executeCreateDraft(
  dossierId: string,
  articlePlanId: string,
): Promise<EditorialDossierArticlePlanDraftRpcResult | null> {
  const rows = await writeSupabaseAdminReturning<ArticlePlanDraftRpcRow>(
    "rpc/newsroom_create_editorial_dossier_article_plan_draft",
    {
      method: "POST",
      body: JSON.stringify({
        p_dossier_id: dossierId,
        p_article_plan_id: articlePlanId,
      }),
    },
  );
  const row = rows[0];

  if (
    !row
    || (row.draft_action !== "created" && row.draft_action !== "reused")
  ) {
    return null;
  }

  return {
    editorialArticleId: row.editorial_article_id,
    action: row.draft_action,
  };
}

const createDraftWithSupabase = createEditorialDossierArticlePlanDraftService({
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },
  readPlan,
  createDraft: executeCreateDraft,
});

export function createEditorialDossierArticlePlanDraft(
  dossierId: string,
  articlePlanId: string,
) {
  return createDraftWithSupabase(dossierId, articlePlanId);
}
