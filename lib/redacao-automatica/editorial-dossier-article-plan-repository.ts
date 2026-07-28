import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import type {
  EditorialDossierArticleKind,
  EditorialDossierLengthMode,
} from "@/lib/redacao-automatica/editorial-dossier-repository";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type EditorialDossierArticlePlanStatus = "planned" | "ready" | "cancelled";

export type EditorialDossierArticlePlanSource = Readonly<{
  id: string;
  dossierSourceId: string;
  sortOrder: number;
}>;

export type EditorialDossierArticlePlan = Readonly<{
  id: string;
  dossierId: string;
  workingTitle: string;
  status: EditorialDossierArticlePlanStatus;
  sortOrder: number;
  articleKind: EditorialDossierArticleKind;
  lengthMode: EditorialDossierLengthMode;
  editorialInstructions: string;
  editorialArticleId: string | null;
  createdAt: string;
  updatedAt: string;
  sources: readonly EditorialDossierArticlePlanSource[];
}>;

type ArticlePlanRow = {
  id: string;
  dossier_id: string;
  working_title: string;
  status: string;
  sort_order: number;
  article_kind: string;
  length_mode: string;
  editorial_instructions: string;
  editorial_article_id: string | null;
  created_at: string;
  updated_at: string;
};

type ArticlePlanSourceRow = {
  id: string;
  dossier_id: string;
  article_plan_id: string;
  dossier_source_id: string;
  sort_order: number;
};

export type EditorialDossierArticlePlanRepositoryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "read_unavailable";
        message: "Não foi possível ler os artigos planeados neste momento.";
      }>;
    }>;

function readUnavailable<T>(): EditorialDossierArticlePlanRepositoryResult<T> {
  return {
    ok: false,
    error: {
      code: "read_unavailable",
      message: "Não foi possível ler os artigos planeados neste momento.",
    },
  };
}

function planStatus(value: string): EditorialDossierArticlePlanStatus {
  return ["planned", "ready", "cancelled"].includes(value)
    ? value as EditorialDossierArticlePlanStatus
    : "planned";
}

function articleKind(value: string): EditorialDossierArticleKind {
  return ["news", "analysis", "preview", "summary"].includes(value)
    ? value as EditorialDossierArticleKind
    : "news";
}

function lengthMode(value: string): EditorialDossierLengthMode {
  return ["brief", "standard", "developed"].includes(value)
    ? value as EditorialDossierLengthMode
    : "standard";
}

export async function listEditorialDossierArticlePlans(
  dossierIdValue: string | null | undefined,
): Promise<EditorialDossierArticlePlanRepositoryResult<readonly EditorialDossierArticlePlan[]>> {
  const dossierId = dossierIdValue?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(dossierId)) {
    return { ok: true, value: [] };
  }

  try {
    const [plans, assignments] = await Promise.all([
      fetchSupabaseAdminTable<ArticlePlanRow>(
        "newsroom_editorial_dossier_article_plans?select=id,dossier_id,working_title,status,sort_order,article_kind,length_mode,editorial_instructions,editorial_article_id,created_at,updated_at"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=sort_order.asc,id.asc&limit=20",
      ),
      fetchSupabaseAdminTable<ArticlePlanSourceRow>(
        "newsroom_editorial_dossier_article_plan_sources?select=id,dossier_id,article_plan_id,dossier_source_id,sort_order"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=sort_order.asc,id.asc&limit=500",
      ),
    ]);
    const planIds = new Set(plans.map((plan) => plan.id));
    const sourcesByPlanId = new Map<string, EditorialDossierArticlePlanSource[]>();

    for (const assignment of assignments) {
      if (assignment.dossier_id !== dossierId || !planIds.has(assignment.article_plan_id)) {
        continue;
      }

      const sources = sourcesByPlanId.get(assignment.article_plan_id) ?? [];
      sources.push({
        id: assignment.id,
        dossierSourceId: assignment.dossier_source_id,
        sortOrder: assignment.sort_order,
      });
      sourcesByPlanId.set(assignment.article_plan_id, sources);
    }

    const mapped = plans.map((plan): EditorialDossierArticlePlan => ({
      id: plan.id,
      dossierId: plan.dossier_id,
      workingTitle: plan.working_title,
      status: planStatus(plan.status),
      sortOrder: plan.sort_order,
      articleKind: articleKind(plan.article_kind),
      lengthMode: lengthMode(plan.length_mode),
      editorialInstructions: plan.editorial_instructions,
      editorialArticleId: plan.editorial_article_id,
      createdAt: plan.created_at,
      updatedAt: plan.updated_at,
      sources: (sourcesByPlanId.get(plan.id) ?? [])
        .slice()
        .sort((left, right) => left.sortOrder - right.sortOrder || left.id.localeCompare(right.id)),
    }));

    return {
      ok: true,
      value: mapped.sort((left, right) => (
        Number(left.status === "cancelled") - Number(right.status === "cancelled")
        || left.sortOrder - right.sortOrder
        || left.id.localeCompare(right.id)
      )),
    };
  } catch {
    return readUnavailable();
  }
}
