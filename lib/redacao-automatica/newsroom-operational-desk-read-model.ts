import "server-only";

import {
  fetchSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  editorialSourcePackageUsedDossierRefs,
} from "@/lib/redacao-automatica/editorial-source-package-internal";
import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";
import {
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";
import {
  createOperationalDeskReadModel,
  type OperationalDeskArticleRecord,
  type OperationalDeskClassificationRecord,
  type OperationalDeskDossierRecord,
  type OperationalDeskDossierSourceRecord,
  type OperationalDeskLegacyUsageRecord,
  type OperationalDeskPlanAssignmentRecord,
  type OperationalDeskPlanRecord,
  type OperationalDeskPublishedArticleRecord,
  type OperationalDeskReadModelInput,
  type OperationalDeskReviewRecord,
  type OperationalDeskSnapshotRecord,
  type OperationalDeskThemeSourceRecord,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

export type {
  OperationalDeskClassificationCounts,
  OperationalDeskPublishedContribution,
  OperationalDeskReadModel,
  OperationalDeskReadModelInput,
  OperationalDeskReadModelResult,
  OperationalDeskSourceCounts,
  OperationalDeskSourceItem,
  OperationalDeskSourceLifecycle,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";
export {
  MESA_OPERATIONAL_CLASSIFICATION_CONTEXT,
  MESA_OPERATIONAL_CONTRACT_VERSION,
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";

const PAGE_SIZE = 500;
const BATCH_SIZE = 100;
const LEGACY_FILTER_BATCH_SIZE = 20;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type SnapshotIdentityRow = Readonly<{ id: string; article_id: string; has_usable_snapshot: boolean }>;
type CycleIdentityRow = Readonly<{ id: string; first_detected_at: string }>;
type LegacyPackageRow = Readonly<{ id: string; manifest: unknown }>;

function unique(values: readonly string[]): string[] {
  return [...new Set(values)];
}

function chunks(values: readonly string[], size = BATCH_SIZE): string[][] {
  const result: string[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

function idList(values: readonly string[]): string {
  return values.map(encodeURIComponent).join(",");
}

async function readAllPages<T>(orderedQuery: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ;) {
    const page = await fetchSupabaseAdminTable<T>(
      `${orderedQuery}&limit=${PAGE_SIZE}&offset=${offset}`,
    );
    result.push(...page);
    if (page.length < PAGE_SIZE) return result;
    offset += page.length;
  }
}

async function readByIds<T>(
  values: readonly string[],
  query: (ids: readonly string[]) => string,
): Promise<T[]> {
  const ids = unique(values);
  if (ids.length === 0) return [];
  return (await Promise.all(
    chunks(ids).map((batch) => readAllPages<T>(query(batch))),
  )).flat();
}

const transport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },

  async listCycleArticles(sourceCode: string | null, sourceIds?: readonly string[]) {
    if (sourceIds !== undefined) {
      const rows = await readByIds<Omit<OperationalDeskArticleRecord, "source_name">>(sourceIds, (ids) => (
        "newsroom_articles?select=id,source_code,original_url,normalized_url,title,subtitle,summary,published_at,first_detected_at,last_detected_at,image_url,processing_status"
        + `&id=in.(${idList(ids)})&order=last_detected_at.desc,id.desc`
      ));
      return rows.map((row) => ({ ...row, source_name: findRegisteredSource(row.source_code)?.name ?? null }));
    }
    const sourceFilter = sourceCode
      ? `&source_code=eq.${encodeURIComponent(sourceCode)}`
      : "";
    const rows = await readAllPages<Omit<OperationalDeskArticleRecord, "source_name">>(
      "newsroom_articles"
      + "?select=id,source_code,original_url,normalized_url,title,subtitle,summary,published_at,first_detected_at,last_detected_at,image_url,processing_status"
      + `&first_detected_at=gte.${encodeURIComponent(MESA_OPERATIONAL_CYCLE_STARTED_AT)}`
      + sourceFilter
      + "&order=last_detected_at.desc,id.desc",
    );
    return rows.map((row): OperationalDeskArticleRecord => ({
      ...row,
      source_name: findRegisteredSource(row.source_code)?.name ?? null,
    }));
  },

  async readLatestSnapshots(articleIds: readonly string[]) {
    if (articleIds.length === 0) return [];
    const identities = (await Promise.all(
      chunks(unique(articleIds)).map((batch) => (
        fetchSupabaseAdminTable<SnapshotIdentityRow>(
          "rpc/newsroom_latest_snapshot_summaries"
          + `?p_article_ids=${encodeURIComponent(`{${batch.join(",")}}`)}`,
        )
      )),
    )).flat();
    const rows = await readByIds<OperationalDeskSnapshotRecord>(
      identities.map((row) => row.id),
      (ids) => (
        "newsroom_article_snapshots"
        + "?select=id,article_id,content_hash,extracted_at,created_at"
        + `&id=in.(${idList(ids)})&order=id.asc`
      ),
    );
    const usable = new Map(identities.map((row) => [row.id, row.has_usable_snapshot]));
    return rows.map((row) => ({ ...row, body: [], source_metadata: {}, has_usable_snapshot: usable.get(row.id) ?? false }));
  },

  readReviewStates(articleIds: readonly string[]) {
    return readByIds<OperationalDeskReviewRecord>(articleIds, (ids) => (
      "newsroom_editorial_review_states"
      + "?select=newsroom_article_id,decision,reviewed_snapshot_id,reviewed_at"
      + `&newsroom_article_id=in.(${idList(ids)})&order=newsroom_article_id.asc`
    ));
  },

  readClassifications(articleIds: readonly string[]) {
    return readByIds<OperationalDeskClassificationRecord>(articleIds, (ids) => (
      "newsroom_editorial_article_classifications"
      + "?select=newsroom_article_id,classification_key,classification_source,classified_at,updated_at"
      + `&newsroom_article_id=in.(${idList(ids)})&order=newsroom_article_id.asc`
    ));
  },

  readThemeSources(articleIds: readonly string[]) {
    return readByIds<OperationalDeskThemeSourceRecord>(articleIds, (ids) => (
      "newsroom_editorial_theme_sources?select=theme_id,newsroom_article_id,reference_snapshot_id"
      + `&newsroom_article_id=in.(${idList(ids)})`
      + "&order=newsroom_article_id.asc,theme_id.asc"
    ));
  },

  async readLegacyUsage(articleIds: readonly string[]) {
    if (articleIds.length === 0) return [];
    const pages = await Promise.all(
      chunks(unique(articleIds), LEGACY_FILTER_BATCH_SIZE).map(async (batch) => {
        const requested = new Set(batch);
        const filters = batch.map((articleId) => (
          "manifest-%3Eentries.cs."
          + encodeURIComponent(JSON.stringify([{ newsroomArticleId: articleId }]))
        ));
        const packages = await readAllPages<LegacyPackageRow>(
          "newsroom_editorial_source_packages?select=id,manifest"
          + `&or=(${filters.join(",")})`
          + "&order=id.asc",
        );
        return packages.flatMap((row): OperationalDeskLegacyUsageRecord[] => (
          editorialSourcePackageUsedDossierRefs(row.manifest)
            .filter((reference) => requested.has(reference.newsroomArticleId))
            .map((reference) => ({
              newsroom_article_id: reference.newsroomArticleId,
              newsroom_snapshot_id: reference.newsroomSnapshotId,
              used_at: reference.usedAt,
              package_id: reference.packageId,
              package_year: reference.year,
              package_month: reference.month,
              published_article_id: reference.publishedArticleId,
            }))
        ));
      }),
    );
    return pages.flat();
  },

  readDossierSources(articleIds: readonly string[]) {
    return readByIds<OperationalDeskDossierSourceRecord>(articleIds, (ids) => (
      "newsroom_editorial_dossier_sources"
      + "?select=id,dossier_id,newsroom_article_id,newsroom_snapshot_id,included"
      + `&newsroom_article_id=in.(${idList(ids)})`
      + "&order=newsroom_article_id.asc,dossier_id.asc,id.asc"
    ));
  },

  readPlanAssignments(dossierSourceIds: readonly string[]) {
    return readByIds<OperationalDeskPlanAssignmentRecord>(dossierSourceIds, (ids) => (
      "newsroom_editorial_dossier_article_plan_sources"
      + "?select=dossier_id,article_plan_id,dossier_source_id"
      + `&dossier_source_id=in.(${idList(ids)})`
      + "&order=dossier_source_id.asc,article_plan_id.asc"
    ));
  },

  readPlans(planIds: readonly string[]) {
    return readByIds<OperationalDeskPlanRecord>(planIds, (ids) => (
      "newsroom_editorial_dossier_article_plans?select=id,dossier_id,editorial_article_id"
      + `&id=in.(${idList(ids)})&order=id.asc`
    ));
  },

  readDossiers(dossierIds: readonly string[]) {
    return readByIds<OperationalDeskDossierRecord>(dossierIds, (ids) => (
      "newsroom_editorial_dossiers?select=id,title,preparation_key"
      + `&id=in.(${idList(ids)})&order=id.asc`
    ));
  },

  readPublishedArticles(articleIds: readonly string[]) {
    return readByIds<OperationalDeskPublishedArticleRecord>(articleIds, (ids) => (
      "editorial_articles?select=id,slug,title,status,published_at"
      + `&id=in.(${idList(ids)})&status=eq.published&order=id.asc`
    ));
  },
};

const load = createOperationalDeskReadModel(transport);

export function loadOperationalDeskReadModel(input: OperationalDeskReadModelInput = {}) {
  return load(input);
}

export async function validateOperationalDeskCycleSourceIds(
  articleIdsValue: readonly string[],
): Promise<Readonly<{ ok: true } | { ok: false; code: "input_invalid" | "read_unavailable" }>> {
  const articleIds = articleIdsValue.map((value) => value.trim().toLowerCase());
  if (
    articleIds.some((value) => !UUID_PATTERN.test(value))
    || new Set(articleIds).size !== articleIds.length
  ) return { ok: false, code: "input_invalid" };
  if (articleIds.length === 0) return { ok: true };

  try {
    const rows = await readByIds<CycleIdentityRow>(articleIds, (ids) => (
      "newsroom_articles?select=id,first_detected_at"
      + `&id=in.(${idList(ids)})`
      + `&first_detected_at=gte.${encodeURIComponent(MESA_OPERATIONAL_CYCLE_STARTED_AT)}`
      + "&order=id.asc"
    ));
    return rows.length === articleIds.length
      && rows.every((row) => articleIds.includes(row.id))
      ? { ok: true }
      : { ok: false, code: "input_invalid" };
  } catch {
    return { ok: false, code: "read_unavailable" };
  }
}
