import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import type { ArticleProcessingStatus } from "@/lib/redacao-automatica/types";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_LIST_LIMIT = 50;

export type EditorialDossierStatus = "draft" | "ready_for_generation" | "completed" | "archived";
export type EditorialDossierOutputMode = "single" | "multiple";
export type EditorialDossierLengthMode = "brief" | "standard" | "developed";
export type EditorialDossierArticleKind = "news" | "analysis" | "preview" | "summary";
export type EditorialDossierSourceRole = "primary" | "corroboration" | "context" | "complementary";

type DossierRow = {
  id: string;
  title: string;
  status: string;
  editorial_instructions: string;
  context_instructions: string;
  output_mode: string;
  output_count: number;
  length_mode: string;
  article_kind: string;
  output_language: string;
  created_at: string;
  updated_at: string;
};

type DossierSourceRow = {
  id: string;
  dossier_id: string;
  newsroom_article_id: string;
  newsroom_snapshot_id: string;
  source_role: string;
  sort_order: number;
  editorial_note: string | null;
  included: boolean;
  created_at: string;
  updated_at: string;
};

type ArticleRow = {
  id: string;
  source_code: string;
  title: string;
  processing_status: string;
};

type SnapshotRow = {
  id: string;
  article_id: string;
  content_hash: string;
  body: unknown;
  extracted_at: string;
};

export type EditorialDossierSummary = Readonly<{
  id: string;
  title: string;
  status: EditorialDossierStatus;
  sourceCount: number;
  outputMode: EditorialDossierOutputMode;
  outputCount: number;
  updatedAt: string;
}>;

export type EditorialDossierSource = Readonly<{
  id: string;
  newsroomArticleId: string;
  newsroomSnapshotId: string;
  sourceCode: string;
  articleTitle: string;
  processingStatus: ArticleProcessingStatus;
  sourceRole: EditorialDossierSourceRole;
  sortOrder: number;
  editorialNote: string | null;
  included: boolean;
  snapshotContentHash: string;
  snapshotExtractedAt: string;
  snapshotBodyBlockCount: number;
}>;

export type EditorialDossierDetail = Readonly<{
  id: string;
  title: string;
  status: EditorialDossierStatus;
  editorialInstructions: string;
  contextInstructions: string;
  outputMode: EditorialDossierOutputMode;
  outputCount: number;
  lengthMode: EditorialDossierLengthMode;
  articleKind: EditorialDossierArticleKind;
  outputLanguage: string;
  createdAt: string;
  updatedAt: string;
  sources: readonly EditorialDossierSource[];
}>;

export type EditorialDossierRepositoryResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "read_unavailable";
        message: "Não foi possível ler os Dossiês de redação neste momento.";
      }>;
    }>;

function readUnavailable<T>(): EditorialDossierRepositoryResult<T> {
  return {
    ok: false,
    error: {
      code: "read_unavailable",
      message: "Não foi possível ler os Dossiês de redação neste momento.",
    },
  };
}

function dossierStatus(value: string): EditorialDossierStatus {
  return ["draft", "ready_for_generation", "completed", "archived"].includes(value)
    ? value as EditorialDossierStatus
    : "draft";
}

function outputMode(value: string): EditorialDossierOutputMode {
  return value === "multiple" ? "multiple" : "single";
}

function lengthMode(value: string): EditorialDossierLengthMode {
  return ["brief", "standard", "developed"].includes(value)
    ? value as EditorialDossierLengthMode
    : "standard";
}

function articleKind(value: string): EditorialDossierArticleKind {
  return ["news", "analysis", "preview", "summary"].includes(value)
    ? value as EditorialDossierArticleKind
    : "news";
}

function sourceRole(value: string): EditorialDossierSourceRole {
  return ["primary", "corroboration", "context", "complementary"].includes(value)
    ? value as EditorialDossierSourceRole
    : "complementary";
}

function processingStatus(value: string): ArticleProcessingStatus {
  return ["detected", "normalized", "duplicate", "rejected", "ready_for_review", "failed"].includes(value)
    ? value as ArticleProcessingStatus
    : "failed";
}

function bodyBlockCount(value: unknown): number {
  if (!Array.isArray(value)) {
    return 0;
  }

  return value.filter((candidate) => {
    if (!candidate || typeof candidate !== "object") {
      return false;
    }

    const block = candidate as { type?: unknown; text?: unknown };
    return (block.type === "paragraph" || block.type === "heading")
      && typeof block.text === "string"
      && block.text.trim().length > 0;
  }).length;
}

function uuidList(values: readonly string[]): string {
  return values.map((value) => encodeURIComponent(value)).join(",");
}

export async function listEditorialDossiers(
  limitValue = 12,
): Promise<EditorialDossierRepositoryResult<readonly EditorialDossierSummary[]>> {
  const limit = Number.isInteger(limitValue)
    ? Math.min(Math.max(limitValue, 1), MAX_LIST_LIMIT)
    : 12;

  try {
    const dossiers = await fetchSupabaseAdminTable<DossierRow>(
      "newsroom_editorial_dossiers?select=id,title,status,editorial_instructions,context_instructions,output_mode,output_count,length_mode,article_kind,output_language,created_at,updated_at"
      + `&order=updated_at.desc,id.desc&limit=${limit}`,
    );

    if (dossiers.length === 0) {
      return { ok: true, value: [] };
    }

    const sources = await fetchSupabaseAdminTable<Pick<DossierSourceRow, "id" | "dossier_id">>(
      "newsroom_editorial_dossier_sources?select=id,dossier_id"
      + `&dossier_id=in.(${uuidList(dossiers.map((dossier) => dossier.id))})&limit=1000`,
    );
    const sourceCounts = new Map<string, number>();

    for (const source of sources) {
      sourceCounts.set(source.dossier_id, (sourceCounts.get(source.dossier_id) ?? 0) + 1);
    }

    return {
      ok: true,
      value: dossiers.map((dossier) => ({
        id: dossier.id,
        title: dossier.title,
        status: dossierStatus(dossier.status),
        sourceCount: sourceCounts.get(dossier.id) ?? 0,
        outputMode: outputMode(dossier.output_mode),
        outputCount: dossier.output_count,
        updatedAt: dossier.updated_at,
      })),
    };
  } catch {
    return readUnavailable();
  }
}

export async function getEditorialDossierById(
  dossierIdValue: string | null | undefined,
): Promise<EditorialDossierRepositoryResult<EditorialDossierDetail | null>> {
  const dossierId = dossierIdValue?.trim().toLowerCase() ?? "";
  if (!UUID_PATTERN.test(dossierId)) {
    return { ok: true, value: null };
  }

  try {
    const dossiers = await fetchSupabaseAdminTable<DossierRow>(
      "newsroom_editorial_dossiers?select=id,title,status,editorial_instructions,context_instructions,output_mode,output_count,length_mode,article_kind,output_language,created_at,updated_at"
      + `&id=eq.${encodeURIComponent(dossierId)}&limit=1`,
    );
    const dossier = dossiers[0];

    if (!dossier) {
      return { ok: true, value: null };
    }

    const sources = await fetchSupabaseAdminTable<DossierSourceRow>(
      "newsroom_editorial_dossier_sources?select=id,dossier_id,newsroom_article_id,newsroom_snapshot_id,source_role,sort_order,editorial_note,included,created_at,updated_at"
      + `&dossier_id=eq.${encodeURIComponent(dossierId)}`
      + "&order=sort_order.asc,id.asc&limit=100",
    );
    const articleIds = sources.map((source) => source.newsroom_article_id);
    const snapshotIds = sources.map((source) => source.newsroom_snapshot_id);

    const [articles, snapshots] = await Promise.all([
      articleIds.length > 0
        ? fetchSupabaseAdminTable<ArticleRow>(
            "newsroom_articles?select=id,source_code,title,processing_status"
            + `&id=in.(${uuidList(articleIds)})&limit=${articleIds.length}`,
          )
        : Promise.resolve([]),
      snapshotIds.length > 0
        ? fetchSupabaseAdminTable<SnapshotRow>(
            "newsroom_article_snapshots?select=id,article_id,content_hash,body,extracted_at"
            + `&id=in.(${uuidList(snapshotIds)})&limit=${snapshotIds.length}`,
          )
        : Promise.resolve([]),
    ]);
    const articlesById = new Map(articles.map((article) => [article.id, article]));
    const snapshotsById = new Map(snapshots.map((snapshot) => [snapshot.id, snapshot]));

    return {
      ok: true,
      value: {
        id: dossier.id,
        title: dossier.title,
        status: dossierStatus(dossier.status),
        editorialInstructions: dossier.editorial_instructions,
        contextInstructions: dossier.context_instructions,
        outputMode: outputMode(dossier.output_mode),
        outputCount: dossier.output_count,
        lengthMode: lengthMode(dossier.length_mode),
        articleKind: articleKind(dossier.article_kind),
        outputLanguage: dossier.output_language,
        createdAt: dossier.created_at,
        updatedAt: dossier.updated_at,
        sources: sources.flatMap((source): EditorialDossierSource[] => {
          const article = articlesById.get(source.newsroom_article_id);
          const frozenSnapshot = snapshotsById.get(source.newsroom_snapshot_id);

          if (!article || !frozenSnapshot || frozenSnapshot.article_id !== article.id) {
            return [];
          }

          return [{
            id: source.id,
            newsroomArticleId: article.id,
            newsroomSnapshotId: frozenSnapshot.id,
            sourceCode: article.source_code,
            articleTitle: article.title,
            processingStatus: processingStatus(article.processing_status),
            sourceRole: sourceRole(source.source_role),
            sortOrder: source.sort_order,
            editorialNote: source.editorial_note,
            included: source.included,
            snapshotContentHash: frozenSnapshot.content_hash,
            snapshotExtractedAt: frozenSnapshot.extracted_at,
            snapshotBodyBlockCount: bodyBlockCount(frozenSnapshot.body),
          }];
        }),
      },
    };
  } catch {
    return readUnavailable();
  }
}
