import "server-only";

import { fetchSupabaseAdminTable } from "@/lib/supabase";
import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import type {
  EditorialDeskClassificationFilter,
} from "@/lib/redacao-automatica/newsroom-desk-read-model-internal";
import {
  loadNewsroomEditorialInbox,
  type NewsroomEditorialInboxResult,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox";
import type {
  NewsroomEditorialInboxItem,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox-internal";
import type {
  OperationalDeskClassificationCounts,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";

const BATCH_SIZE = 100;

type ClassificationRow = Readonly<{
  newsroom_article_id: string;
  classification_key: string;
}>;

export type MesaArchiveSourceItem = Readonly<{
  newsroomArticleId: string;
  newsroomSnapshotId: string | null;
  sourceCode: string;
  sourceName: string;
  url: string | null;
  title: string;
  subtitle: string | null;
  summary: string | null;
  imageCandidateUrl: string | null;
  publishedAt: string | null;
  lastDetectedAt: string;
  classificationKey: ArticleClassificationKey | null;
}>;

export type MesaArchiveReadInput = Readonly<{
  query: string;
  sourceCode: string | null;
  classification: EditorialDeskClassificationFilter;
}>;

export type MesaArchiveReadModel = Readonly<{
  sources: readonly MesaArchiveSourceItem[];
  counts: OperationalDeskClassificationCounts;
  total: number;
}>;

export type MesaArchiveReadModelResult =
  | Readonly<{ ok: true; value: MesaArchiveReadModel }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "relation_invalid" | "read_unavailable";
        message: string;
      }>;
    }>;

function chunks<T>(values: readonly T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += size) {
    result.push(values.slice(index, index + size));
  }
  return result;
}

async function classificationMap(
  ids: readonly string[],
): Promise<ReadonlyMap<string, ArticleClassificationKey>> {
  const rows = (await Promise.all(chunks(ids, BATCH_SIZE).map((batch) => (
    fetchSupabaseAdminTable<ClassificationRow>(
      "newsroom_editorial_article_classifications"
      + "?select=newsroom_article_id,classification_key"
      + `&newsroom_article_id=in.(${batch.map(encodeURIComponent).join(",")})`
      + "&order=newsroom_article_id.asc",
    )
  )))).flat();
  const result = new Map<string, ArticleClassificationKey>();
  for (const row of rows) {
    if (!isArticleClassificationKey(row.classification_key)) {
      throw new Error("mesa-archive-classification-invalid");
    }
    result.set(row.newsroom_article_id, row.classification_key);
  }
  return result;
}

function emptyCounts(): OperationalDeskClassificationCounts {
  return {
    total: 0,
    benfica: 0,
    sporting: 0,
    fc_porto: 0,
    other_liga_clubs: 0,
    outside_liga_other: 0,
    unclassified: 0,
  };
}

function counts(items: readonly MesaArchiveSourceItem[]): OperationalDeskClassificationCounts {
  const result = emptyCounts();
  result.total = items.length;
  for (const item of items) {
    if (item.classificationKey === null) result.unclassified += 1;
    else result[item.classificationKey] += 1;
  }
  return result;
}

function matchesClassification(
  item: MesaArchiveSourceItem,
  filter: EditorialDeskClassificationFilter,
): boolean {
  if (filter.mode === "all") return true;
  if (filter.mode === "unclassified") return item.classificationKey === null;
  return item.classificationKey === filter.classificationKey;
}

function archiveItem(
  item: NewsroomEditorialInboxItem,
  classifications: ReadonlyMap<string, ArticleClassificationKey>,
): MesaArchiveSourceItem {
  return {
    newsroomArticleId: item.id,
    newsroomSnapshotId: item.latestSnapshotId,
    sourceCode: item.sourceCode,
    sourceName: findRegisteredSource(item.sourceCode)?.name ?? item.sourceCode,
    url: item.sourceUrl,
    title: item.title,
    subtitle: item.subtitle,
    summary: item.summary,
    imageCandidateUrl: item.imageUrl,
    publishedAt: item.publishedAt,
    lastDetectedAt: item.lastDetectedAt,
    classificationKey: classifications.get(item.id) ?? null,
  };
}

function inboxFailure(
  result: Extract<NewsroomEditorialInboxResult, { ok: false }>,
): MesaArchiveReadModelResult {
  return {
    ok: false,
    error: {
      code: "read_unavailable",
      message: result.error.message,
    },
  };
}

export async function loadMesaArchiveReadModel(
  input: MesaArchiveReadInput,
): Promise<MesaArchiveReadModelResult> {
  const inbox = await loadNewsroomEditorialInbox({
    view: "archive",
    query: input.query,
    periodDays: null,
    sourceCode: input.sourceCode,
  });
  if (!inbox.ok) return inboxFailure(inbox);

  try {
    const ids = inbox.value.items.map((item) => item.id);
    const classifications = ids.length > 0
      ? await classificationMap(ids)
      : new Map<string, ArticleClassificationKey>();
    const allSources = inbox.value.items.map((item) => archiveItem(item, classifications));
    return {
      ok: true,
      value: {
        sources: allSources.filter((item) => matchesClassification(item, input.classification)),
        counts: counts(allSources),
        total: allSources.length,
      },
    };
  } catch {
    return {
      ok: false,
      error: {
        code: "relation_invalid",
        message: "O Arquivo contém uma relação editorial inválida.",
      },
    };
  }
}
