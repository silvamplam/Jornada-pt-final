import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import type {
  EditorialDossierArticlePlanDestination,
  EditorialDossierArticlePlanImageChoice,
} from "@/lib/redacao-automatica/editorial-dossier-production-workspace-service-internal";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const RELATION_PAGE_SIZE = 200;
const ARTICLE_CHUNK_SIZE = 100;

type DossierRow = {
  id: string;
  preparation_key: string | null;
};

type MesaWorkspaceRow = {
  dossier_id: string;
  selection_payload: unknown;
};

type ProductionContextItemRow = {
  id: string;
  dossier_id: string;
  context_kind: string;
  source_newsroom_article_id: string | null;
  theme_id: string | null;
  title_snapshot: string;
  sort_order: number;
};

type ProductionContextSourceRow = {
  dossier_id: string;
  production_context_id: string;
  dossier_source_id: string;
  sort_order: number;
};

type FrozenDossierSourceRow = {
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  included: boolean;
};

type ArticlePlanContextRow = {
  dossier_id: string;
  article_plan_id: string;
  production_context_id: string;
};

type PublishedContextRow = {
  id: string;
  dossier_id: string;
  editorial_article_id: string;
  sort_order: number;
  created_at: string;
};

type PlanPublishedContextRow = {
  dossier_id: string;
  article_plan_id: string;
  dossier_published_context_id: string;
  sort_order: number;
  created_at: string;
};

type DossierImageRow = {
  id: string;
  dossier_id: string;
  origin_kind: string;
  frozen_url: string;
  newsroom_article_id: string | null;
  editorial_article_id: string | null;
  storage_bucket: string | null;
  storage_path: string | null;
  file_name: string | null;
  created_at: string;
};

type ArticlePlanStateRow = {
  id: string;
  dossier_id: string;
  destination: string;
  update_target_editorial_article_id: string | null;
  image_choice: string;
  dossier_image_id: string | null;
  editorial_article_id: string | null;
};

type EditorialArticleRow = {
  id: string;
  slug: string;
  title: string;
  status: string;
  image_url: string | null;
  published_at: string | null;
};

export type EditorialDossierPublishedContext = Readonly<{
  id: string;
  dossierId: string;
  editorialArticleId: string;
  slug: string;
  title: string;
  status: string;
  currentImageUrl: string | null;
  publishedAt: string | null;
  sortOrder: number;
  createdAt: string;
}>;

export type EditorialDossierPlanPublishedContext = Readonly<{
  articlePlanId: string;
  dossierPublishedContextId: string;
  sortOrder: number;
  createdAt: string;
}>;

type EditorialDossierImageBase = Readonly<{
  id: string;
  dossierId: string;
  frozenUrl: string;
  createdAt: string;
}>;

export type EditorialDossierImage =
  | (EditorialDossierImageBase & Readonly<{
      origin: "newsroom";
      newsroomArticleId: string;
    }>)
  | (EditorialDossierImageBase & Readonly<{
      origin: "published";
      editorialArticleId: string;
    }>)
  | (EditorialDossierImageBase & Readonly<{
      origin: "upload";
      storageBucket: string;
      storagePath: string;
      fileName: string;
    }>);

export type EditorialDossierArticlePlanProductionState = Readonly<{
  articlePlanId: string;
  destination: EditorialDossierArticlePlanDestination;
  updateTargetEditorialArticleId: string | null;
  imageChoice: EditorialDossierArticlePlanImageChoice;
  editorialArticleId: string | null;
}>;

export type EditorialMesaProductionContext = Readonly<{
  id: string;
  kind: "source" | "theme";
  sourceNewsroomArticleId: string | null;
  themeId: string | null;
  title: string;
  sortOrder: number;
  sources: readonly Readonly<{
    dossierSourceId: string;
    newsroomArticleId: string;
    newsroomSnapshotId: string;
    sortOrder: number;
  }>[];
}>;

export type EditorialMesaArticlePlanContext = Readonly<{
  articlePlanId: string;
  productionContextId: string;
}>;

export type EditorialDossierProductionWorkspace = Readonly<{
  dossierId: string;
  preparationKey: string | null;
  publishedContexts: readonly EditorialDossierPublishedContext[];
  planPublishedContexts: readonly EditorialDossierPlanPublishedContext[];
  images: readonly EditorialDossierImage[];
  articlePlans: readonly EditorialDossierArticlePlanProductionState[];
  contextMode: "historical" | "contexts";
  productionContexts: readonly EditorialMesaProductionContext[];
  planContexts: readonly EditorialMesaArticlePlanContext[];
}>;

export type EditorialDossierProductionWorkspaceRepositoryResult =
  | Readonly<{ ok: true; value: EditorialDossierProductionWorkspace | null }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "read_unavailable" | "context_contract_invalid";
        message: string;
      }>;
    }>;

async function readAllRows<T>(orderedQuery: string): Promise<T[]> {
  const allRows: T[] = [];
  let offset = 0;

  while (true) {
    const rows = await fetchSupabaseAdminTable<T>(
      `${orderedQuery}&limit=${RELATION_PAGE_SIZE}&offset=${offset}`,
    );
    allRows.push(...rows);
    if (rows.length < RELATION_PAGE_SIZE) break;
    offset += RELATION_PAGE_SIZE;
  }

  return allRows;
}

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function uuidList(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

function destination(value: string): EditorialDossierArticlePlanDestination {
  return value === "update" ? "update" : "new";
}

function imageChoice(
  value: string,
  dossierImageId: string | null,
): EditorialDossierArticlePlanImageChoice {
  if (value === "preserve_published") {
    return { mode: "preserve_published" };
  }
  if (value === "dossier_image" && dossierImageId) {
    return { mode: "dossier_image", dossierImageId };
  }
  return { mode: "unselected" };
}

function dossierImage(row: DossierImageRow): EditorialDossierImage | null {
  const base = {
    id: row.id,
    dossierId: row.dossier_id,
    frozenUrl: row.frozen_url,
    createdAt: row.created_at,
  };

  if (row.origin_kind === "newsroom" && row.newsroom_article_id) {
    return {
      ...base,
      origin: "newsroom",
      newsroomArticleId: row.newsroom_article_id,
    };
  }
  if (row.origin_kind === "published" && row.editorial_article_id) {
    return {
      ...base,
      origin: "published",
      editorialArticleId: row.editorial_article_id,
    };
  }
  if (row.origin_kind === "upload" && row.storage_bucket && row.storage_path && row.file_name) {
    return {
      ...base,
      origin: "upload",
      storageBucket: row.storage_bucket,
      storagePath: row.storage_path,
      fileName: row.file_name,
    };
  }
  return null;
}

function readUnavailable(): EditorialDossierProductionWorkspaceRepositoryResult {
  return {
    ok: false,
    error: {
      code: "read_unavailable",
      message: "Não foi possível ler o workspace de produção neste momento.",
    },
  };
}

function contextContractInvalid(): EditorialDossierProductionWorkspaceRepositoryResult {
  return {
    ok: false,
    error: {
      code: "context_contract_invalid",
      message: "A Produção 2C tem uma estrutura de contextos incompleta ou inválida. Não foi usado o fluxo histórico como alternativa.",
    },
  };
}

function isContextWorkspaceMarker(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return payload.contractVersion === 3 && payload.contextContractVersion === 1;
}

function claimsContextWorkspace(value: unknown): boolean {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const payload = value as Record<string, unknown>;
  return payload.contractVersion === 3 || Object.hasOwn(payload, "contextContractVersion");
}

export async function getEditorialDossierProductionWorkspace(
  dossierIdValue: string | null | undefined,
): Promise<EditorialDossierProductionWorkspaceRepositoryResult> {
  const dossierId = dossierIdValue?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(dossierId)) {
    return { ok: true, value: null };
  }

  try {
    const dossiers = await fetchSupabaseAdminTable<DossierRow>(
      "newsroom_editorial_dossiers?select=id,preparation_key"
      + `&id=eq.${encodeURIComponent(dossierId)}&limit=1`,
    );
    const dossier = dossiers[0];
    if (!dossier) return { ok: true, value: null };

    const [contextRows, planContextRows, imageRows, planRows, mesaWorkspaceRows,
      productionContextRows, productionContextSourceRows, frozenDossierSourceRows,
      articlePlanContextRows] = await Promise.all([
      readAllRows<PublishedContextRow>(
        "newsroom_editorial_dossier_published_contexts"
        + "?select=id,dossier_id,editorial_article_id,sort_order,created_at"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=sort_order.asc,id.asc",
      ),
      readAllRows<PlanPublishedContextRow>(
        "newsroom_editorial_dossier_article_plan_published_contexts"
        + "?select=dossier_id,article_plan_id,dossier_published_context_id,sort_order,created_at"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=article_plan_id.asc,sort_order.asc,dossier_published_context_id.asc",
      ),
      readAllRows<DossierImageRow>(
        "newsroom_editorial_dossier_images"
        + "?select=id,dossier_id,origin_kind,frozen_url,newsroom_article_id,editorial_article_id,storage_bucket,storage_path,file_name,created_at"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=created_at.asc,id.asc",
      ),
      readAllRows<ArticlePlanStateRow>(
        "newsroom_editorial_dossier_article_plans"
        + "?select=id,dossier_id,destination,update_target_editorial_article_id,image_choice,dossier_image_id,editorial_article_id"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=sort_order.asc,id.asc",
      ),
      fetchSupabaseAdminTable<MesaWorkspaceRow>(
        "newsroom_mesa_production_contexts?select=dossier_id,selection_payload"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}&limit=1`,
      ),
      readAllRows<ProductionContextItemRow>(
        "newsroom_mesa_production_context_items"
        + "?select=id,dossier_id,context_kind,source_newsroom_article_id,theme_id,title_snapshot,sort_order"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=sort_order.asc,id.asc",
      ),
      readAllRows<ProductionContextSourceRow>(
        "newsroom_mesa_production_context_sources"
        + "?select=dossier_id,production_context_id,dossier_source_id,sort_order"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=production_context_id.asc,sort_order.asc,dossier_source_id.asc",
      ),
      readAllRows<FrozenDossierSourceRow>(
        "newsroom_editorial_dossier_sources"
        + "?select=id,dossier_id,newsroom_article_id,newsroom_snapshot_id,included"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=sort_order.asc,id.asc",
      ),
      readAllRows<ArticlePlanContextRow>(
        "newsroom_mesa_article_plan_contexts"
        + "?select=dossier_id,article_plan_id,production_context_id"
        + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
        + "&order=article_plan_id.asc",
      ),
    ]);

    const selectionPayload = mesaWorkspaceRows[0]?.selection_payload;
    const hasContextMarker = isContextWorkspaceMarker(selectionPayload);
    const claimsContexts = claimsContextWorkspace(selectionPayload);
    const hasContextRelations = productionContextRows.length > 0
      || productionContextSourceRows.length > 0
      || articlePlanContextRows.length > 0;
    if ((claimsContexts && !hasContextMarker)
      || hasContextMarker !== (productionContextRows.length > 0)
      || (!hasContextMarker && hasContextRelations)) return contextContractInvalid();

    const frozenSourceById = new Map(frozenDossierSourceRows.map((source) => [source.id, source]));
    const productionContexts: EditorialMesaProductionContext[] = [];
    if (hasContextMarker) {
      const contextIds = new Set(productionContextRows.map((row) => row.id));
      if (
        productionContextRows.some((row, index) => row.sort_order !== index + 1)
        || productionContextSourceRows.some((row) => !contextIds.has(row.production_context_id))
        || articlePlanContextRows.some((row) => !contextIds.has(row.production_context_id))
      ) return contextContractInvalid();

      const unionSourceIds = new Set<string>();
      for (const row of productionContextRows) {
        const contextSources = productionContextSourceRows
          .filter((source) => source.production_context_id === row.id)
          .sort((left, right) => left.sort_order - right.sort_order || left.dossier_source_id.localeCompare(right.dossier_source_id));
        if (contextSources.length < 1 || contextSources.some((source, index) => source.sort_order !== index + 1)) {
          return contextContractInvalid();
        }
        const sources = contextSources.flatMap((source) => {
          const frozen = frozenSourceById.get(source.dossier_source_id);
          return frozen?.included ? [{
            dossierSourceId: frozen.id,
            newsroomArticleId: frozen.newsroom_article_id,
            newsroomSnapshotId: frozen.newsroom_snapshot_id,
            sortOrder: source.sort_order,
          }] : [];
        });
        if (sources.length !== contextSources.length) return contextContractInvalid();
        if (
          row.context_kind === "source"
            ? sources.length !== 1
              || row.source_newsroom_article_id !== sources[0].newsroomArticleId
              || row.theme_id !== null
            : row.context_kind !== "theme"
              || !row.theme_id
              || row.source_newsroom_article_id !== null
        ) return contextContractInvalid();
        const kind: "source" | "theme" = row.context_kind === "source" ? "source" : "theme";
        sources.forEach((source) => unionSourceIds.add(source.dossierSourceId));
        productionContexts.push({
          id: row.id,
          kind,
          sourceNewsroomArticleId: row.source_newsroom_article_id,
          themeId: row.theme_id,
          title: row.title_snapshot,
          sortOrder: row.sort_order,
          sources,
        });
      }
      const includedSourceIds = frozenDossierSourceRows.filter((source) => source.included).map((source) => source.id);
      if (unionSourceIds.size !== includedSourceIds.length
        || includedSourceIds.some((sourceId) => !unionSourceIds.has(sourceId))) return contextContractInvalid();
    }

    const articleIds = Array.from(new Set(contextRows.map((row) => row.editorial_article_id)));
    const articlePages = await Promise.all(
      chunks(articleIds, ARTICLE_CHUNK_SIZE).map((chunk) => (
        fetchSupabaseAdminTable<EditorialArticleRow>(
          "editorial_articles?select=id,slug,title,status,image_url,published_at"
          + `&id=in.(${uuidList(chunk)})&order=id.asc&limit=${chunk.length}`,
        )
      )),
    );
    const articlesById = new Map(
      articlePages.flat().map((article) => [article.id, article]),
    );
    const publishedContexts = contextRows.flatMap((row) => {
      const article = articlesById.get(row.editorial_article_id);
      return article ? [{
        id: row.id,
        dossierId: row.dossier_id,
        editorialArticleId: row.editorial_article_id,
        slug: article.slug,
        title: article.title,
        status: article.status,
        currentImageUrl: article.image_url,
        publishedAt: article.published_at,
        sortOrder: row.sort_order,
        createdAt: row.created_at,
      }] : [];
    });
    const images = imageRows.flatMap((row) => {
      const mapped = dossierImage(row);
      return mapped ? [mapped] : [];
    });

    return {
      ok: true,
      value: {
        dossierId,
        preparationKey: dossier.preparation_key,
        publishedContexts,
        planPublishedContexts: planContextRows.map((row) => ({
          articlePlanId: row.article_plan_id,
          dossierPublishedContextId: row.dossier_published_context_id,
          sortOrder: row.sort_order,
          createdAt: row.created_at,
        })),
        images,
        articlePlans: planRows.map((row) => ({
          articlePlanId: row.id,
          destination: destination(row.destination),
          updateTargetEditorialArticleId: row.update_target_editorial_article_id,
          imageChoice: imageChoice(row.image_choice, row.dossier_image_id),
          editorialArticleId: row.editorial_article_id,
        })),
        contextMode: hasContextMarker ? "contexts" : "historical",
        productionContexts,
        planContexts: articlePlanContextRows.map((row) => ({
          articlePlanId: row.article_plan_id,
          productionContextId: row.production_context_id,
        })),
      },
    };
  } catch {
    return readUnavailable();
  }
}
