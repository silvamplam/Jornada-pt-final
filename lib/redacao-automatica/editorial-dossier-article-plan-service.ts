import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
  writeSupabaseAdminReturning,
} from "@/lib/supabase";
import {
  saveEditorialDossierArticlePlanService,
  type EditorialDossierArticlePlanDossierState,
  type EditorialDossierArticlePlanRpcInput,
  type EditorialDossierArticlePlanState,
  type SaveEditorialDossierArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service-internal";
import type { EditorialDossierArticlePlanStatus } from "@/lib/redacao-automatica/editorial-dossier-article-plan-repository";

export type {
  EditorialDossierArticlePlanErrorCode,
  EditorialDossierArticlePlanSaveResult,
  EditorialDossierArticlePlanSourceSelection,
  SaveEditorialDossierArticlePlanInput,
} from "@/lib/redacao-automatica/editorial-dossier-article-plan-service-internal";

type DossierExistsRow = {
  id: string;
};

type DossierSourceStateRow = {
  id: string;
  dossier_id: string;
  included: boolean;
};

type ArticlePlanStateRow = {
  id: string;
  dossier_id: string;
  status: string;
};

type ArticlePlanSourceStateRow = {
  article_plan_id: string;
  dossier_source_id: string;
  sort_order: number;
};

type ArticlePlanWriteRow = {
  article_plan_id: string;
};

function planStatus(value: string): EditorialDossierArticlePlanStatus {
  return ["planned", "ready", "cancelled"].includes(value)
    ? value as EditorialDossierArticlePlanStatus
    : "planned";
}

async function readDossierState(
  dossierId: string,
): Promise<EditorialDossierArticlePlanDossierState | null> {
  const dossiers = await fetchSupabaseAdminTable<DossierExistsRow>(
    "newsroom_editorial_dossiers?select=id"
    + `&id=eq.${encodeURIComponent(dossierId)}&limit=1`,
  );

  if (!dossiers[0]) {
    return null;
  }

  const [sourceRows, planRows, assignmentRows] = await Promise.all([
    fetchSupabaseAdminTable<DossierSourceStateRow>(
      "newsroom_editorial_dossier_sources?select=id,dossier_id,included"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&order=sort_order.asc,id.asc&limit=100",
    ),
    fetchSupabaseAdminTable<ArticlePlanStateRow>(
      "newsroom_editorial_dossier_article_plans?select=id,dossier_id,status"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&order=sort_order.asc,id.asc&limit=20",
    ),
    fetchSupabaseAdminTable<ArticlePlanSourceStateRow>(
      "newsroom_editorial_dossier_article_plan_sources?select=article_plan_id,dossier_source_id,sort_order"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&order=sort_order.asc&limit=500",
    ),
  ]);
  const assignmentsByPlanId = new Map<string, Array<{
    dossierSourceId: string;
    sortOrder: number;
  }>>();

  for (const assignment of assignmentRows) {
    const assignments = assignmentsByPlanId.get(assignment.article_plan_id) ?? [];
    assignments.push({
      dossierSourceId: assignment.dossier_source_id,
      sortOrder: assignment.sort_order,
    });
    assignmentsByPlanId.set(assignment.article_plan_id, assignments);
  }

  const plans = planRows.map((plan): EditorialDossierArticlePlanState => ({
    id: plan.id,
    status: planStatus(plan.status),
    sources: (assignmentsByPlanId.get(plan.id) ?? [])
      .slice()
      .sort((left, right) => (
        left.sortOrder - right.sortOrder
        || left.dossierSourceId.localeCompare(right.dossierSourceId)
      )),
  }));

  return {
    dossierId,
    sources: sourceRows.map((source) => ({
      id: source.id,
      included: source.included,
    })),
    plans,
  };
}

async function executeSave(
  payload: EditorialDossierArticlePlanRpcInput,
): Promise<string | null> {
  const rows = await writeSupabaseAdminReturning<ArticlePlanWriteRow>(
    "rpc/newsroom_save_editorial_dossier_article_plan",
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );

  return rows[0]?.article_plan_id ?? null;
}

const saveArticlePlanWithSupabase = saveEditorialDossierArticlePlanService({
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },
  readDossierState,
  saveArticlePlan: executeSave,
});

export function saveEditorialDossierArticlePlan(
  input: SaveEditorialDossierArticlePlanInput,
) {
  return saveArticlePlanWithSupabase(input);
}
