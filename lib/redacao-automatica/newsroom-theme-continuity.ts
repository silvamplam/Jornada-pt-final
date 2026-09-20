import "server-only";

import { fetchSupabaseAdminTable, writeSupabaseAdminReturning } from "@/lib/supabase";
import {
  type ThemeContinuityPublishedArticle,
  type ThemeContinuityReadModel,
  type ThemeContinuitySource,
  type ThemeContinuitySlot,
} from "@/lib/redacao-automatica/newsroom-theme-continuity-contract";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type ContinuityReadRow = Readonly<{
  theme: ThemeContinuityReadModel["theme"];
  sources: readonly ThemeContinuitySource[];
  baseline: ThemeContinuityReadModel["baseline"];
  published_articles: readonly ThemeContinuityPublishedArticle[];
  source_count: number;
  published_article_count: number;
  authority_fingerprint: string;
}>;

type ContinuityPrepareRow = Readonly<{
  dossier_id: string;
  production_context_id: string;
  preparation_action: string;
  source_count: number;
  published_article_count: number;
  new_article_count: number;
  output_count: number;
  authority_fingerprint: string;
  slots: readonly ThemeContinuitySlot[];
}>;

function validUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function validReadRow(row: ContinuityReadRow | undefined): row is ContinuityReadRow {
  return Boolean(
    row
    && validUuid(row.theme?.id)
    && (row.theme.status === "open" || row.theme.status === "archived")
    && Array.isArray(row.sources)
    && Array.isArray(row.published_articles)
    && Number.isSafeInteger(row.source_count)
    && Number.isSafeInteger(row.published_article_count)
    && row.source_count === row.sources.length
    && row.published_article_count === row.published_articles.length
    && typeof row.authority_fingerprint === "string"
    && row.authority_fingerprint.length === 32
    && row.sources.every((source) => (
      validUuid(source.newsroomArticleId)
      && validUuid(source.latestSnapshotId)
      && ["NEW_SOURCE", "UPDATED_SOURCE", "UNCHANGED_SOURCE"].includes(source.change)
    ))
    && row.published_articles.every((article) => (
      validUuid(article.editorialArticleId)
      && (article.matchdayId === null || validUuid(article.matchdayId))
      && Boolean(article.slug)
      && Boolean(article.title)
    ))
  );
}

export async function readThemeContinuity(
  themeIdValue: string,
): Promise<ThemeContinuityReadModel | null> {
  const themeId = themeIdValue.trim().toLowerCase();
  if (!validUuid(themeId)) return null;
  const rows = await fetchSupabaseAdminTable<ContinuityReadRow>(
    "rpc/newsroom_mesa_theme_continuity_v1"
    + `?p_theme_id=${encodeURIComponent(themeId)}&limit=1`,
  );
  const row = rows[0];
  if (!row) return null;
  if (!validReadRow(row)) throw new Error("theme-continuity-read-contract-invalid");
  return {
    theme: row.theme,
    sources: row.sources,
    baseline: row.baseline,
    publishedArticles: row.published_articles,
    sourceCount: row.source_count,
    publishedArticleCount: row.published_article_count,
    authorityFingerprint: row.authority_fingerprint,
  };
}

export async function prepareThemeContinuity(input: Readonly<{
  preparationKey: string;
  themeId: string;
  newArticleCount: number;
  expectedAuthorityFingerprint: string;
}>) {
  const rows = await writeSupabaseAdminReturning<ContinuityPrepareRow>(
    "rpc/newsroom_prepare_theme_continuity_v1",
    {
      method: "POST",
      body: JSON.stringify({
        p_preparation_key: input.preparationKey,
        p_theme_id: input.themeId,
        p_new_article_count: input.newArticleCount,
        p_expected_authority_fingerprint: input.expectedAuthorityFingerprint,
      }),
    },
  );
  const row = rows[0];
  if (
    !row
    || !validUuid(row.dossier_id)
    || !validUuid(row.production_context_id)
    || !["created", "reused"].includes(row.preparation_action)
    || !Number.isSafeInteger(row.source_count)
    || !Number.isSafeInteger(row.published_article_count)
    || !Number.isSafeInteger(row.new_article_count)
    || !Number.isSafeInteger(row.output_count)
    || row.output_count !== row.published_article_count + row.new_article_count
    || !Array.isArray(row.slots)
    || row.slots.length !== row.output_count
    || row.authority_fingerprint !== input.expectedAuthorityFingerprint
  ) throw new Error("theme-continuity-preparation-result-invalid");
  return row;
}

export async function finalizeThemeContinuity(input: Readonly<{
  dossierId: string;
  packageId: string;
  noChangeOutputIds: readonly string[];
}>) {
  return writeSupabaseAdminReturning<Readonly<{
    finalization_action: "consolidated" | "recorded" | "reused";
    publication_event_id: string;
    updated_count: number;
    new_count: number;
    no_change_count: number;
  }>>("rpc/newsroom_finalize_theme_continuity_v1", {
    method: "POST",
    body: JSON.stringify({
      p_dossier_id: input.dossierId,
      p_package_id: input.packageId,
      p_no_change_output_ids: input.noChangeOutputIds,
    }),
  });
}
