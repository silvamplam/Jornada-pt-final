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
import type { EditorialSourcePackageArticlePlan } from "@/lib/redacao-automatica/editorial-source-package-internal";

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
  editorial_article_id: string | null;
};

type ArticlePlanSourceStateRow = {
  article_plan_id: string;
  dossier_source_id: string;
  sort_order: number;
};

type ArticlePlanWriteRow = {
  article_plan_id: string;
};

type PublishedOutputPlanRow = {
  id: string;
  working_title: string;
  status: string;
  article_kind: string;
  length_mode: string;
  editorial_instructions: string;
  destination: string;
  update_target_editorial_article_id: string | null;
  editorial_article_id: string | null;
};

const ARTICLE_PLAN_PAGE_SIZE = 200;

async function readAllArticlePlanStateRows(
  dossierId: string,
): Promise<ArticlePlanStateRow[]> {
  const rows: ArticlePlanStateRow[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchSupabaseAdminTable<ArticlePlanStateRow>(
      "newsroom_editorial_dossier_article_plans?select=id,dossier_id,status,editorial_article_id"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&order=sort_order.asc,id.asc"
      + `&limit=${ARTICLE_PLAN_PAGE_SIZE}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < ARTICLE_PLAN_PAGE_SIZE) break;
    offset += ARTICLE_PLAN_PAGE_SIZE;
  }

  return rows;
}

async function readAllArticlePlanSourceStateRows(
  dossierId: string,
): Promise<ArticlePlanSourceStateRow[]> {
  const rows: ArticlePlanSourceStateRow[] = [];
  let offset = 0;

  while (true) {
    const page = await fetchSupabaseAdminTable<ArticlePlanSourceStateRow>(
      "newsroom_editorial_dossier_article_plan_sources?select=article_plan_id,dossier_source_id,sort_order"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&order=article_plan_id.asc,sort_order.asc,dossier_source_id.asc"
      + `&limit=${ARTICLE_PLAN_PAGE_SIZE}&offset=${offset}`,
    );
    rows.push(...page);
    if (page.length < ARTICLE_PLAN_PAGE_SIZE) break;
    offset += ARTICLE_PLAN_PAGE_SIZE;
  }

  return rows;
}

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
    readAllArticlePlanStateRows(dossierId),
    readAllArticlePlanSourceStateRows(dossierId),
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
    editorialArticleId: plan.editorial_article_id,
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

export async function setEditorialMesaOutputOrigin(input: Readonly<{
  dossierId: string;
  articlePlanId: string;
  origin: Readonly<{
    kind: "source" | "material";
    dossierSourceId: string | null;
    materialKey: string | null;
    materialVersionId: string | null;
  }>;
}>): Promise<"output-origin-invalid" | "output-origin-conflict" | "output-origin-write-failed" | null> {
  try {
    const rows = await writeSupabaseAdminReturning<{ origin_action: string }>(
      "rpc/newsroom_set_mesa_output_origin_v2",
      {
        method: "POST",
        body: JSON.stringify({
          p_dossier_id: input.dossierId,
          p_article_plan_id: input.articlePlanId,
          p_origin_kind: input.origin.kind,
          p_origin_dossier_source_id: input.origin.dossierSourceId,
          p_material_key: input.origin.materialKey,
          p_material_version_id: input.origin.materialVersionId,
        }),
      },
    );
    return rows[0]?.origin_action === "created" || rows[0]?.origin_action === "reused"
      ? null
      : "output-origin-write-failed";
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("mesa-output-origin-conflict")) return "output-origin-conflict";
    if (message.includes("mesa-output-origin-invalid")) return "output-origin-invalid";
    return "output-origin-write-failed";
  }
}

export type SynchronizeEditorialMesaSharedOutputsResult =
  | Readonly<{ ok: true; outputCount: number; cancelledCount: number }>
  | Readonly<{
      ok: false;
      code:
        | "mesa-shared-outputs-input-invalid"
        | "mesa-shared-outputs-workspace-invalid"
        | "mesa-shared-outputs-plan-invalid"
        | "mesa-shared-outputs-write-failed";
    }>;

export async function synchronizeEditorialMesaSharedOutputs(input: Readonly<{
  dossierId: string;
  articlePlanIds: readonly string[];
}>): Promise<SynchronizeEditorialMesaSharedOutputsResult> {
  try {
    const rows = await writeSupabaseAdminReturning<{
      output_count: number;
      cancelled_count: number;
    }>("rpc/newsroom_set_mesa_shared_outputs_v2", {
      method: "POST",
      body: JSON.stringify({
        p_dossier_id: input.dossierId,
        p_article_plan_ids: input.articlePlanIds,
      }),
    });
    const row = rows[0];
    return row
      ? {
          ok: true,
          outputCount: row.output_count,
          cancelledCount: row.cancelled_count,
        }
      : { ok: false, code: "mesa-shared-outputs-write-failed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "mesa-shared-outputs-input-invalid",
      "mesa-shared-outputs-workspace-invalid",
      "mesa-shared-outputs-plan-invalid",
    ] as const;
    return {
      ok: false,
      code: known.find((code) => message.includes(code))
        ?? "mesa-shared-outputs-write-failed",
    };
  }
}

export type PublishEditorialMesaOutputResult =
  | Readonly<{
      ok: true;
      articleId: string;
      slug: string;
      action: "created" | "updated" | "reused";
      consolidated: boolean;
    }>
  | Readonly<{
      ok: false;
      code:
        | "mesa-publication-input-invalid"
        | "mesa-publication-workspace-invalid"
        | "mesa-publication-output-invalid"
        | "mesa-publication-package-invalid"
        | "mesa-publication-source-invalid"
        | "mesa-publication-article-invalid"
        | "mesa-publication-provenance-conflict"
        | "mesa-publication-article-conflict"
        | "mesa-publication-update-target-invalid"
        | "mesa-publication-output-conflict"
        | "mesa-publication-failed";
    }>;

export async function publishEditorialMesaOutput(input: Readonly<{
  dossierId: string;
  outputId: string;
  packageId: string;
  dossierSourceIds: readonly string[];
  article: Readonly<{
    id: string;
    slug: string;
    label: string;
    title: string;
    subtitle: string;
    body: string;
    imageUrl: string | null;
    author: string;
    publishedAt: string;
    matchdayId: string;
    mode: "create" | "update";
  }>;
}>): Promise<PublishEditorialMesaOutputResult> {
  try {
    const rows = await writeSupabaseAdminReturning<{
      editorial_article_id: string;
      article_slug: string;
      publication_action: "created" | "updated" | "reused";
      consolidated: boolean;
    }>("rpc/newsroom_publish_mesa_output_v2", {
      method: "POST",
      body: JSON.stringify({
        p_dossier_id: input.dossierId,
        p_output_id: input.outputId,
        p_package_id: input.packageId,
        p_dossier_source_ids: input.dossierSourceIds,
        p_article: input.article,
      }),
    });
    const row = rows[0];
    return row
      ? {
          ok: true,
          articleId: row.editorial_article_id,
          slug: row.article_slug,
          action: row.publication_action,
          consolidated: row.consolidated,
        }
      : { ok: false, code: "mesa-publication-failed" };
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const known = [
      "mesa-publication-input-invalid",
      "mesa-publication-workspace-invalid",
      "mesa-publication-output-invalid",
      "mesa-publication-package-invalid",
      "mesa-publication-source-invalid",
      "mesa-publication-article-invalid",
      "mesa-publication-provenance-conflict",
      "mesa-publication-article-conflict",
      "mesa-publication-update-target-invalid",
      "mesa-publication-output-conflict",
    ] as const;
    return {
      ok: false,
      code: known.find((code) => message.includes(code)) ?? "mesa-publication-failed",
    };
  }
}

export async function linkEditorialDossierArticlePlanPublishedOutput(input: Readonly<{
  reference: EditorialSourcePackageArticlePlan;
  updateTargetEditorialArticleId: string | null;
  editorialArticleId: string;
}>): Promise<"article-plan-stale" | "article-plan-link-failed" | null> {
  const { reference } = input;
  const rows = await fetchSupabaseAdminTable<PublishedOutputPlanRow>(
    "newsroom_editorial_dossier_article_plans"
    + "?select=id,working_title,status,article_kind,length_mode,editorial_instructions,destination,update_target_editorial_article_id,editorial_article_id"
    + `&id=eq.${encodeURIComponent(reference.articlePlanId)}`
    + `&dossier_id=eq.${encodeURIComponent(reference.dossierId)}`
    + "&limit=1",
  );
  const plan = rows[0];
  if (
    !plan
    || plan.status === "cancelled"
    || plan.working_title.trim() !== reference.workingTitle
    || plan.article_kind !== reference.articleKind
    || plan.length_mode !== reference.lengthMode
    || plan.editorial_instructions.trim() !== reference.editorialInstructions
    || plan.destination !== reference.destination
    || plan.update_target_editorial_article_id !== input.updateTargetEditorialArticleId
    || (plan.editorial_article_id && plan.editorial_article_id !== input.editorialArticleId)
  ) return "article-plan-stale";

  if (plan.editorial_article_id === input.editorialArticleId) return null;
  const linked = await writeSupabaseAdminReturning<{ id: string }>(
    "newsroom_editorial_dossier_article_plans"
    + `?id=eq.${encodeURIComponent(reference.articlePlanId)}`
    + `&dossier_id=eq.${encodeURIComponent(reference.dossierId)}`
    + "&editorial_article_id=is.null&select=id",
    {
      method: "PATCH",
      body: JSON.stringify({
        editorial_article_id: input.editorialArticleId,
        updated_at: new Date().toISOString(),
      }),
    },
  );
  return linked.length === 1 && linked[0].id === reference.articlePlanId
    ? null
    : "article-plan-link-failed";
}
