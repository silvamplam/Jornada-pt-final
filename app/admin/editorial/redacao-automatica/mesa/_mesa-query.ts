import {
  isArticleClassificationKey,
  type ArticleClassificationKey,
} from "@/lib/editorial-classifications";
import type {
  EditorialDeskClassificationFilter,
} from "@/lib/redacao-automatica/newsroom-desk-read-model";
import type {
  MesaPageReadInput,
} from "@/lib/redacao-automatica/newsroom-mesa-page-read-model-internal";

export const MESA_PAGE_SIZE = 24;

export const MESA_TABS = [
  { value: "novas", label: "NOVAS" },
  { value: "publicadas", label: "PUBLICADAS" },
  { value: "temas", label: "TEMAS" },
] as const;

export type MesaTab = (typeof MESA_TABS)[number]["value"];

export const MESA_CLASSIFICATION_OPTIONS = [
  { value: "all", label: "TODAS" },
  { value: "benfica", label: "BENFICA" },
  { value: "sporting", label: "SPORTING" },
  { value: "fc_porto", label: "FC PORTO" },
  { value: "other_liga_clubs", label: "OUTROS 1.ª LIGA" },
  { value: "outside_liga_other", label: "FORA DA 1.ª LIGA / OUTROS" },
  { value: "unclassified", label: "POR CLASSIFICAR" },
] as const;

export type MesaClassificationValue =
  (typeof MESA_CLASSIFICATION_OPTIONS)[number]["value"];

export type MesaSearchParams = Record<string, string | string[] | undefined>;

export type MesaQuery = Readonly<{
  tab: MesaTab;
  classificationValue: MesaClassificationValue;
  classification: EditorialDeskClassificationFilter;
  page: number;
  sourceCode: string | null;
  competitionId: string | null;
  seasonId: string | null;
  matchdayId: string | null;
  themeStatus: "open" | "archived";
}>;

export type MesaQueryResult =
  | Readonly<{ ok: true; value: MesaQuery }>
  | Readonly<{ ok: false }>;

function firstValue(value: string | string[] | undefined): string | null {
  if (Array.isArray(value)) return value[0]?.trim() || null;
  return value?.trim() || null;
}

function isMesaTab(value: string): value is MesaTab {
  return MESA_TABS.some((tab) => tab.value === value);
}

function classificationFilter(
  value: string,
): Readonly<{
  value: MesaClassificationValue;
  filter: EditorialDeskClassificationFilter;
}> | null {
  if (value === "all") return { value, filter: { mode: "all" } };
  if (value === "unclassified") {
    return { value, filter: { mode: "unclassified" } };
  }
  if (!isArticleClassificationKey(value)) return null;
  return {
    value,
    filter: { mode: "classified", classificationKey: value },
  };
}

function optionalValue(value: string | string[] | undefined): string | null {
  return firstValue(value);
}

export function parseMesaQuery(params: MesaSearchParams): MesaQueryResult {
  const rawTab = firstValue(params.tab) ?? "novas";
  const rawClassification = firstValue(params.classification) ?? "all";
  const rawPage = firstValue(params.page);
  const rawThemeStatus = firstValue(params.themeStatus) ?? "open";
  const parsedClassification = classificationFilter(rawClassification);
  const page = rawPage === null ? 1 : Number(rawPage);

  if (
    !isMesaTab(rawTab)
    || !parsedClassification
    || !Number.isInteger(page)
    || page < 1
    || (rawThemeStatus !== "open" && rawThemeStatus !== "archived")
  ) {
    return { ok: false };
  }

  return {
    ok: true,
    value: {
      tab: rawTab,
      classificationValue: parsedClassification.value,
      classification: parsedClassification.filter,
      page,
      sourceCode: optionalValue(params.source),
      competitionId: optionalValue(params.competitionId),
      seasonId: optionalValue(params.seasonId),
      matchdayId: optionalValue(params.matchdayId),
      themeStatus: rawThemeStatus,
    },
  };
}

export function mesaPageReadModelInput(query: MesaQuery): MesaPageReadInput {
  const lifecycle = query.tab === "publicadas" ? "published" : "new";
  return {
    lifecycle,
    classification: query.classification,
    sourceCode: query.sourceCode,
    pagination: {
      limit: MESA_PAGE_SIZE,
      offset: lifecycle === "published" ? 0 : (query.page - 1) * MESA_PAGE_SIZE,
    },
  };
}

type MesaHrefChange = Partial<Pick<
  MesaQuery,
  | "tab"
  | "classificationValue"
  | "page"
  | "sourceCode"
  | "competitionId"
  | "seasonId"
  | "matchdayId"
  | "themeStatus"
>>;

export function mesaHref(query: MesaQuery, change: MesaHrefChange = {}): string {
  const next = { ...query, ...change };
  const params = new URLSearchParams({
    tab: next.tab,
    classification: next.classificationValue,
  });

  if (next.page > 1) params.set("page", String(next.page));
  if (next.sourceCode) params.set("source", next.sourceCode);
  if (next.competitionId) params.set("competitionId", next.competitionId);
  if (next.seasonId) params.set("seasonId", next.seasonId);
  if (next.matchdayId) params.set("matchdayId", next.matchdayId);
  if (next.themeStatus === "archived") params.set("themeStatus", "archived");

  return `/admin/editorial/redacao-automatica/mesa?${params.toString()}`;
}

export function classificationLabel(key: ArticleClassificationKey): string {
  return MESA_CLASSIFICATION_OPTIONS.find((option) => option.value === key)?.label
    ?? key;
}
