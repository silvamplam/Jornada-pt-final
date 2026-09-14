import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import type {
  EditorialDeskClassificationFilter,
  EditorialDeskPage,
} from "@/lib/redacao-automatica/newsroom-desk-read-model-internal";
import {
  MESA_OPERATIONAL_CYCLE_STARTED_AT,
} from "@/lib/redacao-automatica/newsroom-operational-desk-contract";
import type {
  OperationalDeskSourceCounts,
  OperationalDeskSourceItem,
  OperationalDeskSourceLifecycle,
} from "@/lib/redacao-automatica/newsroom-operational-desk-read-model-internal";

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MAX_PAGE_SIZE = 200;

export type MesaPageIdentity = Readonly<{
  newsroom_article_id: string;
  lifecycle: OperationalDeskSourceLifecycle;
  classification_key: ArticleClassificationKey | null;
  last_detected_at: string;
}>;

export type MesaPageReadInput = Readonly<{
  lifecycle: OperationalDeskSourceLifecycle;
  classification: EditorialDeskClassificationFilter;
  sourceCode: string | null;
  pagination: Readonly<{ limit: number; offset: number }>;
}>;

export type MesaPageReadModel = Readonly<{
  cycleStartedAt: string;
  lifecycle: OperationalDeskSourceLifecycle;
  classification: EditorialDeskClassificationFilter;
  counts: OperationalDeskSourceCounts;
  sources: readonly OperationalDeskSourceItem[];
  page: EditorialDeskPage<OperationalDeskSourceItem>;
}>;

export type MesaPageReadModelResult =
  | Readonly<{ ok: true; value: MesaPageReadModel }>
  | Readonly<{
      ok: false;
      error: Readonly<{
        code: "invalid_request" | "not_configured" | "relation_invalid" | "read_unavailable";
        message: string;
      }>;
    }>;

export interface MesaPageReadTransport {
  isConfigured(): boolean;
  readCounts(sourceCode: string | null): Promise<OperationalDeskSourceCounts>;
  readPageIdentities(input: MesaPageReadInput): Promise<readonly MesaPageIdentity[]>;
  hydrateSources(articleIds: readonly string[]): Promise<readonly OperationalDeskSourceItem[]>;
}

class MesaPageRelationInvalidError extends Error {}

function errorResult(
  code: Extract<MesaPageReadModelResult, { ok: false }>["error"]["code"],
): MesaPageReadModelResult {
  const messages = {
    invalid_request: "Os filtros da Mesa operacional não são válidos.",
    not_configured: "A leitura administrativa da Mesa não está configurada.",
    relation_invalid: "A Mesa encontrou uma relação editorial persistida inválida.",
    read_unavailable: "Não foi possível ler a Mesa operacional neste momento.",
  } as const;
  return { ok: false, error: { code, message: messages[code] } };
}

function validInput(input: MesaPageReadInput): boolean {
  return (input.lifecycle === "new" || input.lifecycle === "published")
    && (input.classification.mode !== "classified"
      || isArticleClassificationKey(input.classification.classificationKey))
    && Number.isInteger(input.pagination.limit)
    && input.pagination.limit >= 1
    && input.pagination.limit <= MAX_PAGE_SIZE
    && Number.isInteger(input.pagination.offset)
    && input.pagination.offset >= 0;
}

function validCounts(counts: OperationalDeskSourceCounts): boolean {
  return [counts.novas, counts.publicadas].every((group) => {
    const classified = group.benfica + group.sporting + group.fc_porto
      + group.other_liga_clubs + group.outside_liga_other + group.unclassified;
    return Object.values(group).every((value) => Number.isSafeInteger(value) && value >= 0)
      && group.total === classified;
  });
}

function identityMatches(
  identity: MesaPageIdentity,
  input: MesaPageReadInput,
): boolean {
  if (
    !UUID_PATTERN.test(identity.newsroom_article_id)
    || identity.lifecycle !== input.lifecycle
    || Number.isNaN(Date.parse(identity.last_detected_at))
    || (identity.classification_key !== null
      && !isArticleClassificationKey(identity.classification_key))
  ) return false;
  if (input.classification.mode === "all") return true;
  if (input.classification.mode === "unclassified") {
    return identity.classification_key === null;
  }
  return identity.classification_key === input.classification.classificationKey;
}

export function createMesaPageReadModel(transport: MesaPageReadTransport) {
  return async function loadMesaPageReadModel(
    input: MesaPageReadInput,
  ): Promise<MesaPageReadModelResult> {
    if (!validInput(input)) return errorResult("invalid_request");
    if (!transport.isConfigured()) return errorResult("not_configured");

    try {
      const [counts, identityWindow] = await Promise.all([
        transport.readCounts(input.sourceCode),
        transport.readPageIdentities(input),
      ]);
      if (!validCounts(counts) || identityWindow.length > input.pagination.limit + 1) {
        throw new MesaPageRelationInvalidError();
      }
      const identityIds = identityWindow.map((row) => row.newsroom_article_id);
      if (
        identityWindow.some((row) => !identityMatches(row, input))
        || new Set(identityIds).size !== identityIds.length
        || identityWindow.some((row, index) => {
          const previous = identityWindow[index - 1];
          return previous !== undefined && (
            Date.parse(previous.last_detected_at) < Date.parse(row.last_detected_at)
            || (previous.last_detected_at === row.last_detected_at
              && previous.newsroom_article_id.localeCompare(row.newsroom_article_id) < 0)
          );
        })
      ) throw new MesaPageRelationInvalidError();

      const visibleIdentities = identityWindow.slice(0, input.pagination.limit);
      const visibleIds = visibleIdentities.map((row) => row.newsroom_article_id);
      const hydrated = visibleIds.length > 0
        ? await transport.hydrateSources(visibleIds)
        : [];
      const hydratedById = new Map(hydrated.map((item) => [item.newsroomArticleId, item]));
      if (
        hydrated.length !== visibleIds.length
        || hydratedById.size !== visibleIds.length
        || visibleIdentities.some((identity) => {
          const item = hydratedById.get(identity.newsroom_article_id);
          const classificationKey = item?.classification.status === "classified"
            ? item.classification.classificationKey
            : null;
          return !item
            || item.lifecycle !== identity.lifecycle
            || classificationKey !== identity.classification_key;
        })
      ) throw new MesaPageRelationInvalidError();

      const sources = visibleIds.map((id) => hydratedById.get(id)!);
      return {
        ok: true,
        value: {
          cycleStartedAt: MESA_OPERATIONAL_CYCLE_STARTED_AT,
          lifecycle: input.lifecycle,
          classification: input.classification,
          counts,
          sources,
          page: {
            items: sources,
            pagination: {
              ...input.pagination,
              hasNextPage: identityWindow.length > input.pagination.limit,
            },
          },
        },
      };
    } catch (error) {
      return error instanceof MesaPageRelationInvalidError
        ? errorResult("relation_invalid")
        : errorResult("read_unavailable");
    }
  };
}
