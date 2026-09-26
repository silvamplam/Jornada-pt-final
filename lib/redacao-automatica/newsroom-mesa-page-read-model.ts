import { readMesaWithTransientRetry } from "./newsroom-mesa-read-retry";
import "server-only";

import {
  fetchSupabaseAdminTable as readSupabaseAdminTable,
  getSupabaseServiceConfig,
} from "@/lib/supabase";
import {
  createMesaPageReadModel,
  MesaPageRelationInvalidError,
  type MesaPageIdentity,
  type MesaPageReadInput,
} from "@/lib/redacao-automatica/newsroom-mesa-page-read-model-internal";
import {
  loadOperationalDeskReadModel,
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model";
import type {
  OperationalDeskClassificationCounts,
  OperationalDeskSourceCounts,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

export type {
  MesaPageIdentity,
  MesaPageReadInput,
  MesaPageReadModel,
  MesaPageReadModelResult,
} from "@/lib/redacao-automatica/newsroom-mesa-page-read-model-internal";

type MesaCountsRow = Readonly<{
  novas_total: number;
  novas_benfica: number;
  novas_sporting: number;
  novas_fc_porto: number;
  novas_other_liga_clubs: number;
  novas_outside_liga_other: number;
  novas_unclassified: number;
  publicadas_total: number;
  publicadas_benfica: number;
  publicadas_sporting: number;
  publicadas_fc_porto: number;
  publicadas_other_liga_clubs: number;
  publicadas_outside_liga_other: number;
  publicadas_unclassified: number;
}>;

function optionalRpcParameter(name: string, value: string | null): string {
  return value ? `&${name}=${encodeURIComponent(value)}` : "";
}

function classificationFilter(input: MesaPageReadInput): string {
  if (input.classification.mode === "all") return "all";
  if (input.classification.mode === "unclassified") return "unclassified";
  return input.classification.classificationKey;
}

function classificationCounts(
  row: MesaCountsRow,
  prefix: "novas" | "publicadas",
): OperationalDeskClassificationCounts {
  return {
    total: row[`${prefix}_total`],
    benfica: row[`${prefix}_benfica`],
    sporting: row[`${prefix}_sporting`],
    fc_porto: row[`${prefix}_fc_porto`],
    other_liga_clubs: row[`${prefix}_other_liga_clubs`],
    outside_liga_other: row[`${prefix}_outside_liga_other`],
    unclassified: row[`${prefix}_unclassified`],
  };
}

const transport = {
  isConfigured() {
    return Boolean(getSupabaseServiceConfig());
  },

  async readCounts(sourceCode: string | null): Promise<OperationalDeskSourceCounts> {
    const rows = await fetchSupabaseAdminTable<MesaCountsRow>(
      "rpc/newsroom_mesa_source_counts_v1"
      + `?p_cycle_started_at=${encodeURIComponent(MESA_OPERATIONAL_CYCLE_STARTED_AT)}`
      + optionalRpcParameter("p_source_code", sourceCode),
    );
    if (rows.length !== 1) throw new MesaPageRelationInvalidError("newsroom-mesa-counts-invalid");
    return {
      novas: classificationCounts(rows[0], "novas"),
      publicadas: classificationCounts(rows[0], "publicadas"),
    };
  },

  readPageIdentities(input: MesaPageReadInput) {
    return fetchSupabaseAdminTable<MesaPageIdentity>(
      "rpc/newsroom_mesa_page_identities_v1"
      + `?p_cycle_started_at=${encodeURIComponent(MESA_OPERATIONAL_CYCLE_STARTED_AT)}`
      + `&p_lifecycle=${encodeURIComponent(input.lifecycle)}`
      + `&p_classification_filter=${encodeURIComponent(classificationFilter(input))}`
      + optionalRpcParameter("p_source_code", input.sourceCode)
      + `&p_limit=${input.pagination.limit}`
      + `&p_offset=${input.pagination.offset}`,
    );
  },

  async hydrateSources(articleIds: readonly string[]) {
    const result = await loadOperationalDeskReadModel({ sourceIds: articleIds });
    if (!result.ok) {
      if (result.error.code === "relation_invalid") throw new MesaPageRelationInvalidError();
      throw new Error(`newsroom-mesa-hydration-${result.error.code}`);
    }
    return result.value.sources;
  },
};

const load = createMesaPageReadModel(transport);

export function loadMesaPageReadModel(input: MesaPageReadInput) {
  return load(input);
}


export async function loadMesaSourceCounts(sourceCode: string | null) {
  if (!transport.isConfigured()) {
    return {
      ok: false as const,
      error: {
        code: "not_configured" as const,
        message: "A leitura administrativa da Mesa não está configurada.",
      },
    };
  }
  try {
    return {
      ok: true as const,
      value: await transport.readCounts(sourceCode),
    };
  } catch {
    return {
      ok: false as const,
      error: {
        code: "read_unavailable" as const,
        message: "Não foi possível ler os totais da Mesa.",
      },
    };
  }
}

function fetchSupabaseAdminTable<T>(path: string): Promise<T[]> {
  return readMesaWithTransientRetry(path.split("?")[0], () => readSupabaseAdminTable<T>(path));
}
