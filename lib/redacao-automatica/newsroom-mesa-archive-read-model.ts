import "server-only";

import type {
  EditorialDeskClassificationFilter,
} from "@/lib/redacao-automatica/newsroom-desk-read-model-internal";
import {
  loadNewsroomEditorialInbox,
} from "@/lib/redacao-automatica/newsroom-editorial-inbox";
import {
  loadOperationalDeskReadModel,
  type OperationalDeskClassificationCounts,
  type OperationalDeskSourceItem,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";

export type MesaArchiveReadInput = Readonly<{
  query: string;
  sourceCode: string | null;
  classification: EditorialDeskClassificationFilter;
}>;

export type MesaArchiveReadModel = Readonly<{
  sources: readonly OperationalDeskSourceItem[];
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

function counts(items: readonly OperationalDeskSourceItem[]): OperationalDeskClassificationCounts {
  const result = {
    total: items.length,
    benfica: 0,
    sporting: 0,
    fc_porto: 0,
    other_liga_clubs: 0,
    outside_liga_other: 0,
    unclassified: 0,
  };
  for (const item of items) {
    if (item.classification.status === "unclassified") result.unclassified += 1;
    else result[item.classification.classificationKey] += 1;
  }
  return result;
}

function matchesClassification(
  item: OperationalDeskSourceItem,
  filter: EditorialDeskClassificationFilter,
): boolean {
  if (filter.mode === "all") return true;
  if (filter.mode === "unclassified") return item.classification.status === "unclassified";
  return item.classification.status === "classified"
    && item.classification.classificationKey === filter.classificationKey;
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
        message: "Não foi possível ler o Arquivo da Mesa.",
      },
    };
  }

  const ids = inbox.value.items.map((item) => item.id);
  if (ids.length === 0) {
    return {
      ok: true,
      value: {
        sources: [],
        counts: {
          total: 0,
          benfica: 0,
          sporting: 0,
          fc_porto: 0,
          other_liga_clubs: 0,
          outside_liga_other: 0,
          unclassified: 0,
        },
        total: 0,
      },
    };
  }

  const operational = await loadOperationalDeskReadModel({ sourceIds: ids });
  if (!operational.ok) {
    return {
      ok: false,
      error: {
        code: operational.error.code === "relation_invalid"
          ? "relation_invalid"
          : "read_unavailable",
        message: operational.error.message,
      },
    };
  }

  const byId = new Map(
    operational.value.sources.map((item) => [item.newsroomArticleId, item]),
  );
  if (byId.size !== ids.length || ids.some((id) => !byId.has(id))) {
    return {
      ok: false,
      error: {
        code: "relation_invalid",
        message: "O Arquivo contém uma relação de fonte inválida.",
      },
    };
  }

  const allSources = ids.map((id) => byId.get(id)!);
  return {
    ok: true,
    value: {
      sources: allSources.filter((item) => matchesClassification(item, input.classification)),
      counts: counts(allSources),
      total: allSources.length,
    },
  };
}
