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
} from "@/lib/redacao-automatica/newsroom-editorial-inbox";
import type {
  NewsroomEditorialInboxItem,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox-internal";
import {
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
  type OperationalDeskClassificationCounts,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import { findRegisteredSource } from "@/lib/redacao-automatica/source-registry";

const BATCH_SIZE = 100;

type ArticleMetaRow = Readonly<{
  id: string;
  first_detected_at: string;
}>;

type ClassificationRow = Readonly<{
  newsroom_article_id: string;
  classification_key: string;
}>;

type MutableCounts = {
  total: number;
  benfica: number;
  sporting: number;
  fc_porto: number;
  other_liga_clubs: number;
  outside_liga_other: number;
  unclassified: number;
};

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
  archiveLabel: "seen" | "dismissed";
  cycleEligible: boolean;
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

function chunks<T>(values: readonly T[]): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < values.length; index += BATCH_SIZE) {
    result.push(values.slice(index, index + BATCH_SIZE));
  }
  return result;
}

async function readMetadata(ids: readonly string[]) {
  const articleRows = (await Promise.all(chunks(ids).map((batch) => (
    fetchSupabaseAdminTable<ArticleMetaRow>(
      "newsroom_articles?select=id,first_detected_at"
      + `&id=in.(${batch.map((id) => encodeURIComponent(id)).join(",")})`
      + "&order=id.asc",
    )
  )))).flat();
  if (articleRows.length !== ids.length) {
    throw new Error("mesa-archive-article-metadata-incomplete");
  }

  const classificationRows = (await Promise.all(chunks(ids).map((batch) => (
    fetchSupabaseAdminTable<ClassificationRow>(
      "newsroom_editorial_article_classifications"
      + "?select=newsroom_article_id,classification_key"
      + `&newsroom_article_id=in.(${batch.map((id) => encodeURIComponent(id)).join(",")})`
      + "&order=newsroom_article_id.asc",
    )
  )))).flat();

  const firstDetectedAt = new Map(articleRows.map((row) => [row.id, row.first_detected_at]));
  const classification = new Map<string, ArticleClassificationKey>();
  for (const row of classificationRows) {
    if (!isArticleClassificationKey(row.classification_key)) {
      throw new Error("mesa-archive-classification-invalid");
    }
    classification.set(row.newsroom_article_id, row.classification_key);
  }
  return { firstDetectedAt, classification };
}

function emptyCounts(): MutableCounts {
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
  firstDetectedAt: ReadonlyMap<string, string>,
  classifications: ReadonlyMap<string, ArticleClassificationKey>,
): MesaArchiveSourceItem {
  const firstDetected = firstDetectedAt.get(item.id);
  if (!firstDetected || Number.isNaN(Date.parse(firstDetected))) {
    throw new Error("mesa-archive-first-detected-invalid");
  }
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
    archiveLabel: item.editorial.label === "dismissed" ? "dismissed" : "seen",
    cycleEligible: Date.parse(firstDetected) >= Date.parse(MESA_OPERATIONAL_CYCLE_STARTED_AT),
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
  if (!inbox.ok) {
    return {
      ok: false,
      error: {
        code: "read_unavailable",
        message: inbox.error.message,
      },
    };
  }

  try {
    const ids = inbox.value.items.map((item) => item.id);
    if (ids.length === 0) {
      return {
        ok: true,
        value: { sources: [], counts: emptyCounts(), total: 0 },
      };
    }
    const metadata = await readMetadata(ids);
    const allSources = inbox.value.items.map((item) => archiveItem(
      item,
      metadata.firstDetectedAt,
      metadata.classification,
    ));
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
